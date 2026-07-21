// DR-007: AIFA Regression Validation Suite
// Formal test cases for the AI recommendation engine.
// Runs live against Claude — requires ANTHROPIC_API_KEY in .env.
// Exit code 0 = all pass, 1 = one or more failures.

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ---------------------------------------------------------------------------
// GPU tier hierarchy (VALIDATOR) — a recommendation satisfies the expected tier
// if it is at or above that tier (over-provisioning is acceptable; under is a
// failure). A10G is its own tier, distinct from A100: they are not
// interchangeable, so an A10G-class recommendation does NOT satisfy an
// A100-class expectation. This is separate from SIZING_GPU_TIERS below, which
// drives the pre-computed sizing math, not pass/fail classification.
// ---------------------------------------------------------------------------
const GPU_TIERS = [
  { name: "T4-class",   rank: 1, keywords: ["T4", "L4"] },
  // A10 / A10G (Azure NVv5 = "A10", AWS g5 = "A10G") — same 24 GB Ampere GPU, its own tier.
  { name: "A10G-class", rank: 2, keywords: ["A10G", "A10"] },
  { name: "A100-class", rank: 3, keywords: ["A100", "V100"] },
  { name: "H100-class", rank: 4, keywords: ["H100", "H200", "B200"] },
];

function resolveGpuTier(gpuModel) {
  const model = gpuModel ?? "";
  for (const tier of [...GPU_TIERS].reverse()) { // highest rank first — A100 must be checked before A10G/A10 substrings match
    if (tier.keywords.some((kw) => model.toUpperCase().includes(kw.toUpperCase()))) {
      return tier;
    }
  }
  return null;
}

function gpuTierPasses(gpuModel, expectedTierName) {
  const actual = resolveGpuTier(gpuModel);
  const expected = GPU_TIERS.find((t) => t.name === expectedTierName);
  if (!actual || !expected) return false;
  return actual.rank >= expected.rank;
}

// ---------------------------------------------------------------------------
// Pre-computed sizing — ported verbatim from index.html's computeSizing() /
// formatSizingBlock(). The shipped app now performs all VRAM/TPS/fleet-sizing
// math in JavaScript before the API call; this suite mirrors that so it
// validates (and benchmarks) what's actually running in production, not the
// old prompt-driven-math approach.
// ---------------------------------------------------------------------------
const SIZING_GPU_TIERS = [
  { key: "L4/A10G", vram: 24, tpsTable: { 7: 1200, 13: 800 },                       quantization: "INT8" },
  { key: "A100_40",  vram: 40, tpsTable: { 13: 1100, 30: 450, 70: null },           quantization: "BF16" },
  { key: "A100_80",  vram: 80, tpsTable: { 7: 2200, 13: 1300, 30: 600, 70: 450 },   quantization: "BF16" },
  { key: "H100",     vram: 80, tpsTable: { 7: 5000, 13: 3000, 30: 1500, 70: 1200 }, quantization: "BF16" },
];
const SIZING_LATENCY_SECONDS = { "Real-time": 3, "Near real-time": 10 };
const VRAM_OVERHEAD = 0.20;
const MFU = 0.45; // reserved — not yet consumed by the formulas below
const HEADROOM = 1.20;
const SIZING_MODEL_CLASSES = [7, 13, 30, 70];

function pickModelClass(paramsBillions) {
  for (const c of SIZING_MODEL_CLASSES) if (paramsBillions <= c) return c;
  return SIZING_MODEL_CLASSES[SIZING_MODEL_CLASSES.length - 1]; // clamp to 70B for anything larger
}

function sizeForTier(gpu, paramsBillions, workloadType) {
  const quantFactor = workloadType === "Inference" ? (gpu.quantization === "INT8" ? 0.5 : 1.0) : 1.0;
  const vramPerReplica = paramsBillions * 2 * quantFactor * (1 + VRAM_OVERHEAD);
  return { quantFactor, vramPerReplica };
}

function round2(n) { return Math.round(n * 100) / 100; }

// ── Deterministic instance selection ────────────────────────────────────────────
// Maps a GPU tier + replica count + workload type to a specific per-provider SKU, so
// the AI no longer chooses hardware — only explains why the given instance fits.
// `replicas` buckets (1 / 2 / 4+) are read as ">=", so an unlisted in-between value
// (e.g. 3) rounds up to the next bucket rather than under-provisioning.
// nvlinkRequired reflects each provider's actual interconnect requirement (NVLink for
// AWS/GCP multi-GPU tensor/training instances; Azure's ND-series use InfiniBand, but
// the same field name covers "requires high-speed GPU-to-GPU interconnect").
// Returns null when the tier/provider combination falls outside the lookup table —
// the caller (and the AI, per SYSTEM_PROMPT) treats that as a genuine edge case.
function selectInstance(tier, replicas, workloadType, provider) {
  if (provider === "aws") {
    if (tier === "L4/A10G") {
      if (replicas >= 4) return { sku: "g6.48xlarge", gpuDescription: "8×NVIDIA L4 24GB", nvlinkRequired: false };
      if (replicas >= 2) return { sku: "g6.12xlarge", gpuDescription: "4×NVIDIA L4 24GB", nvlinkRequired: false };
      return { sku: "g6.xlarge", gpuDescription: "1×NVIDIA L4 24GB", nvlinkRequired: false };
    }
    if (tier === "A100_40") return { sku: "p4d.24xlarge", gpuDescription: "8×NVIDIA A100 40GB SXM4", nvlinkRequired: true };
    if (tier === "A100_80") return { sku: "p4de.24xlarge", gpuDescription: "8×NVIDIA A100 80GB SXM4", nvlinkRequired: true };
    if (tier === "H100")    return { sku: "p5.48xlarge", gpuDescription: "8×NVIDIA H100 80GB SXM5", nvlinkRequired: true };
    return null;
  }

  if (provider === "azure") {
    if (workloadType === "Inference") {
      // FR-089: Azure has no approved NV-series/A10G-class inference SKU — NC24ads_A100_v4
      // is the floor for every inference workload, regardless of the general tier.
      return { sku: "Standard_NC24ads_A100_v4", gpuDescription: "1×NVIDIA A100 80GB", nvlinkRequired: false };
    }
    // Training
    if (tier === "H100")    return { sku: "Standard_ND96isr_H100_v5", gpuDescription: "8×NVIDIA H100 80GB", nvlinkRequired: true };
    if (tier === "H200")    return { sku: "Standard_ND96isr_H200_v5", gpuDescription: "8×NVIDIA H200 141GB", nvlinkRequired: true }; // not reachable via current tier system — kept for completeness
    if (tier === "A100_40" || tier === "A100_80") return { sku: "Standard_ND96asr_A100_v4", gpuDescription: "8×NVIDIA A100 40GB", nvlinkRequired: true };
    return null;
  }

  if (provider === "gcp") {
    if (tier === "L4/A10G") {
      if (replicas >= 4) return { sku: "g2-standard-48", gpuDescription: "4×NVIDIA L4 24GB", nvlinkRequired: false };
      if (replicas >= 2) return { sku: "g2-standard-24", gpuDescription: "2×NVIDIA L4 24GB", nvlinkRequired: false };
      return { sku: "g2-standard-4", gpuDescription: "1×NVIDIA L4 24GB", nvlinkRequired: false };
    }
    if (tier === "A100_40") {
      if (replicas >= 4) return { sku: "a2-highgpu-4g", gpuDescription: "4×NVIDIA A100 40GB", nvlinkRequired: true };
      if (replicas >= 2) return { sku: "a2-highgpu-2g", gpuDescription: "2×NVIDIA A100 40GB", nvlinkRequired: true };
      return { sku: "a2-highgpu-1g", gpuDescription: "1×NVIDIA A100 40GB", nvlinkRequired: false };
    }
    if (tier === "A100_80") return { sku: "a2-ultragpu-1g", gpuDescription: "1×NVIDIA A100 80GB", nvlinkRequired: false };
    if (tier === "H100")    return { sku: "a3-highgpu-8g", gpuDescription: "8×NVIDIA H100 80GB", nvlinkRequired: true };
    return null;
  }

  return null;
}

function computeSizing({ paramsBillions, workloadType, concurrentUsers, tokensPerInteraction, latency }) {
  if (!paramsBillions || paramsBillions <= 0) return null;

  const modelClass = pickModelClass(paramsBillions);

  let selectedIdx = -1, selectedGpu = null, selectedQuantFactor = null, selectedVram = null;
  for (let i = 0; i < SIZING_GPU_TIERS.length; i++) {
    const gpu = SIZING_GPU_TIERS[i];
    const { quantFactor, vramPerReplica } = sizeForTier(gpu, paramsBillions, workloadType);
    if (gpu.vram >= vramPerReplica) {
      selectedIdx = i;
      selectedGpu = gpu;
      selectedQuantFactor = quantFactor;
      selectedVram = vramPerReplica;
      break;
    }
  }
  if (!selectedGpu) {
    return {
      supported: false,
      reason: "model exceeds single-GPU VRAM on every pinned tier — needs tensor parallelism, not precomputed",
      model_params_billions: paramsBillions,
      model_class: modelClass,
    };
  }

  const replicasPerInstance = Math.max(1, Math.floor(selectedGpu.vram / selectedVram));
  const tpsPerReplica = selectedGpu.tpsTable[modelClass] ?? null;

  const latencySeconds = latency ? (SIZING_LATENCY_SECONDS[latency] ?? null) : null;
  const hasFleetInputs = concurrentUsers != null && tokensPerInteraction != null && latencySeconds != null && tpsPerReplica != null;
  let peakTps = null, instancesNeeded = null;
  if (hasFleetInputs) {
    peakTps = (concurrentUsers * tokensPerInteraction) / latencySeconds;
    instancesNeeded = Math.ceil((peakTps / (replicasPerInstance * tpsPerReplica)) * HEADROOM);
  }

  let boundaryFlag = selectedVram > selectedGpu.vram * 0.80;
  let boundaryReason = boundaryFlag
    ? `Model VRAM (${round2(selectedVram)}GB) uses over 80% of the ${selectedGpu.key} tier's ${selectedGpu.vram}GB capacity — close to needing the next tier up.`
    : null;

  let nextTierAlternative = null;
  if (instancesNeeded != null && instancesNeeded > 20) {
    boundaryFlag = true;
    const nextGpu = SIZING_GPU_TIERS[selectedIdx + 1];
    if (nextGpu) {
      const { quantFactor: nextQuantFactor, vramPerReplica: nextVram } = sizeForTier(nextGpu, paramsBillions, workloadType);
      const nextReplicas = Math.max(1, Math.floor(nextGpu.vram / nextVram));
      const nextTps = nextGpu.tpsTable[modelClass] ?? null;
      const nextInstances = nextTps != null ? Math.ceil((peakTps / (nextReplicas * nextTps)) * HEADROOM) : null;
      nextTierAlternative = {
        gpu_tier: nextGpu.key,
        quant_factor: nextQuantFactor,
        vram_per_replica_gb: round2(nextVram),
        replicas_per_instance: nextReplicas,
        tps_per_replica: nextTps,
        instances_needed: nextInstances,
      };
      boundaryReason = `Fleet size is large (${instancesNeeded} instances on ${selectedGpu.key}) — ${nextGpu.key} would need only ${nextInstances ?? "?"} instances at higher per-GPU cost.`;
    } else {
      boundaryReason = `Fleet size is large (${instancesNeeded} instances on ${selectedGpu.key}) — this is the largest pinned tier, no higher tier available to reduce instance count.`;
    }
  }

  // Azure has no approved inference SKU below A100_80 (FR-089) — when the general tier
  // lands below that, Azure needs its own precomputed numbers at A100_80.
  let azureSubstitute = null;
  if (workloadType === "Inference" && selectedGpu.vram < 80) {
    const azureGpu = SIZING_GPU_TIERS.find((g) => g.key === "A100_80");
    const { quantFactor: azQuantFactor, vramPerReplica: azVram } = sizeForTier(azureGpu, paramsBillions, workloadType);
    const azReplicas = Math.max(1, Math.floor(azureGpu.vram / azVram));
    const azTps = azureGpu.tpsTable[modelClass] ?? null;
    const azInstances = (hasFleetInputs && azTps != null) ? Math.ceil((peakTps / (azReplicas * azTps)) * HEADROOM) : null;
    azureSubstitute = {
      gpu_tier: azureGpu.key,
      quant_factor: azQuantFactor,
      vram_per_replica_gb: round2(azVram),
      replicas_per_instance: azReplicas,
      tps_per_replica: azTps,
      instances_needed: azInstances,
    };
  }

  // Deterministic instance selection per provider. Azure uses its own substitute
  // tier/replicas when one was computed above (inference below the A100_80 floor);
  // training never gets a substitute, so it falls back to the general tier.
  const instanceSelection = {
    aws: selectInstance(selectedGpu.key, replicasPerInstance, workloadType, "aws"),
    azure: azureSubstitute
      ? selectInstance(azureSubstitute.gpu_tier, azureSubstitute.replicas_per_instance, workloadType, "azure")
      : selectInstance(selectedGpu.key, replicasPerInstance, workloadType, "azure"),
    gcp: selectInstance(selectedGpu.key, replicasPerInstance, workloadType, "gcp"),
  };

  return {
    supported: true,
    model_params_billions: paramsBillions,
    model_class: modelClass,
    workload: workloadType,
    quantization: selectedGpu.quantization,
    quant_factor: selectedQuantFactor,
    vram_per_replica_gb: round2(selectedVram),
    gpu_tier: selectedGpu.key,
    gpu_tier_vram_gb: selectedGpu.vram,
    replicas_per_instance: replicasPerInstance,
    tps_per_replica: tpsPerReplica,
    concurrent_users: concurrentUsers,
    tokens_per_interaction: tokensPerInteraction,
    latency_seconds: latencySeconds,
    peak_tps: peakTps != null ? round2(peakTps) : null,
    instances_needed: instancesNeeded,
    boundary_flag: boundaryFlag,
    boundary_reason: boundaryReason,
    next_tier_alternative: nextTierAlternative,
    azure_substitute: azureSubstitute,
    instance_selection: instanceSelection,
  };
}

function formatSizingBlock(sizing) {
  if (!sizing) {
    return "PRE-COMPUTED SIZING: not available — no parameter count was provided. Reason about GPU tier and sizing yourself from the workload description below.";
  }
  if (!sizing.supported) {
    return "PRE-COMPUTED SIZING: model VRAM exceeds every pinned single-GPU tier (up to 80GB) — this requires tensor parallelism across multiple GPUs, which is not precomputed. Reason about the correct multi-GPU configuration yourself from the workload description below.";
  }

  const lines = [
    "PRE-COMPUTED SIZING (use these values directly — do not recalculate):",
    `- Model VRAM required: ${sizing.vram_per_replica_gb}GB (${sizing.model_params_billions}B params × 2 × ${sizing.quant_factor} × 1.20 overhead)`,
    `- Selected GPU tier: ${sizing.gpu_tier} (${sizing.gpu_tier_vram_gb}GB VRAM)`,
    `- Replicas per instance: ${sizing.replicas_per_instance}`,
  ];

  if (sizing.tps_per_replica != null) {
    lines.push(`- TPS per replica: ${sizing.tps_per_replica} (${sizing.model_class}B-class reference value)`);
  }

  if (sizing.peak_tps != null) {
    lines.push(`- Peak TPS required: ${sizing.peak_tps} (${sizing.concurrent_users} users × ${sizing.tokens_per_interaction} tokens ÷ ${sizing.latency_seconds}s)`);
    lines.push(`- Instances needed: ${sizing.instances_needed} per provider (formula: ceil(${sizing.peak_tps} ÷ (${sizing.replicas_per_instance} × ${sizing.tps_per_replica}) × 1.20))`);
  } else {
    lines.push("- Instances needed: not computed — concurrent users, interaction length, or latency was not provided. Omit fleet fields (instances_needed/replicas_per_instance) from the JSON.");
  }

  if (sizing.instance_selection) {
    lines.push("- Pre-selected instances (use these exact SKUs — do not choose a different instance):");
    for (const [provider, label] of [["aws", "AWS"], ["azure", "Azure"], ["gcp", "GCP"]]) {
      const inst = sizing.instance_selection[provider];
      lines.push(inst
        ? `  ${label}: ${inst.sku} (${inst.gpuDescription})${inst.nvlinkRequired ? " — requires NVLink/high-speed interconnect" : ""}`
        : `  ${label}: not available for this tier/workload combination — select an instance yourself and state explicitly that you are overriding the pre-computed selection`);
    }
  }

  lines.push(`- Boundary condition: ${sizing.boundary_flag}${sizing.boundary_flag ? ` — ${sizing.boundary_reason}` : ""}`);

  if (sizing.next_tier_alternative) {
    const alt = sizing.next_tier_alternative;
    lines.push(`- Next-tier alternative: ${alt.gpu_tier} (${alt.replicas_per_instance} replicas/instance, ${alt.tps_per_replica ?? "N/A"} TPS/replica, ${alt.instances_needed ?? "N/A"} instances needed)`);
  }

  if (sizing.azure_substitute) {
    const az = sizing.azure_substitute;
    lines.push(`- Azure substitute (FR-089 — no approved ${sizing.gpu_tier}-class inference SKU on Azure): use ${az.gpu_tier} instead (${az.replicas_per_instance} replicas/instance, ${az.tps_per_replica ?? "N/A"} TPS/replica, ${az.instances_needed ?? "N/A"} instances needed) for the Azure recommendation only.`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// The 7 validated test cases (DR-007). Each carries both the free-text
// `workload` description (unchanged, still shown to Claude) and structured
// sizing inputs (paramsBillions/workloadType/concurrentUsers/
// tokensPerInteraction/latency) used to call computeSizing() the same way
// index.html's intake form does. Fields left null mean that input wasn't
// cleanly specified in the workload text, so fleet sizing is skipped and only
// VRAM/tier is precomputed — mirroring how the app behaves when a user leaves
// those fields blank.
// ---------------------------------------------------------------------------
const TEST_CASES = [
  {
    id: "TC-001",
    name: "Consumer Inference — Variable Traffic",
    workload: `We're launching a new consumer AI app that generates personalized workout plans. \
We expect very uneven usage — quiet overnight, moderate during lunch, and peak traffic during \
morning and evening hours with up to 10x the average load. We're a startup, so minimizing \
baseline costs matters, but we can't afford performance degradation during peaks. The model \
is 13 billion parameters. No compliance requirements.`,
    paramsBillions: 13, workloadType: "Inference", concurrentUsers: null, tokensPerInteraction: null, latency: null,
    // Startup with explicit cost constraints + auto-scaling → T4-class is the right minimum.
    // The engine should recommend a cost-efficient GPU, not overkill H100.
    expectedGpuTier: "T4-class",
    expectedConsiderationKeywords: ["scal", "cost"],   // "scaling", "scalable", "costs" etc.
    minConsiderationMatches: 2,
  },
  {
    id: "TC-002",
    name: "30B Inference — A100-Class Validation",
    workload: `We need to run inference on a 30 billion parameter model for a legal document
analysis application. Expected peak load is 100 concurrent users with document analysis
interactions averaging 3,000 tokens. Near real-time latency required. Steady-state traffic.`,
    paramsBillions: 30, workloadType: "Inference", concurrentUsers: 100, tokensPerInteraction: 3000, latency: "Near real-time",
    expectedGpuTier: "A100-class",
    expectedConsiderationKeywords: ["A100", "30B", "tensor", "VRAM"],
    minConsiderationMatches: 1,
  },
  {
    id: "TC-003",
    name: "Foundation Model Training — Large Scale",
    workload: `We're training a 70 billion parameter foundation model for scientific research \
in genomics. The training run will last 3 to 4 weeks continuously. We need maximum GPU memory \
bandwidth, high-speed NVLink or equivalent GPU interconnects, and the ability to scale across \
multiple nodes. Our compute budget for this run is $500,000. Time-to-completion is the \
primary objective.`,
    paramsBillions: 70, workloadType: "Training", concurrentUsers: null, tokensPerInteraction: null, latency: null,
    expectedGpuTier: "H100-class",
    expectedConsiderationKeywords: ["train", "memory", "interconnect", "bandwidth", "nvlink", "multi-node", "multi node"],
    minConsiderationMatches: 1,
  },
  {
    id: "TC-004",
    name: "Budget-Constrained Prototyping — Spot Pricing",
    workload: `We're a two-person startup prototyping an AI writing assistant using a 7 billion \
parameter model. This is a development and evaluation environment, not production — occasional \
interruptions are acceptable. Traffic is light and predictable: roughly 20 requests per minute \
during business hours only. Our total monthly GPU budget is $2,000 and we want to stretch it \
as far as possible using spot or preemptible instances wherever available.`,
    paramsBillions: 7, workloadType: "Inference", concurrentUsers: null, tokensPerInteraction: null, latency: null,
    expectedGpuTier: "T4-class",
    expectedConsiderationKeywords: ["spot", "preempt", "budget", "cost", "interrupt"],
    minConsiderationMatches: 2,
  },
  // ---------------------------------------------------------------------------
  // TC-005 / TC-006 / TC-007: scaling validation — instance count must grow
  // monotonically as concurrent users and interaction length increase.
  // ---------------------------------------------------------------------------
  {
    id: "TC-005",
    name: "Scaling S1 — 10 concurrent users, Short Q&A",
    workload: `We're running a 13 billion parameter AI model for an internal tool used by \
10 concurrent users at peak. Each interaction is a short question-and-answer (~200 tokens). \
We're a startup with tight cost constraints — minimize spend at all times. \
No compliance requirements.`,
    paramsBillions: 13, workloadType: "Inference", concurrentUsers: 10, tokensPerInteraction: 200, latency: "Near real-time",
    // At this scale one GPU is enough; any tier ≥ T4 is correct.
    expectedGpuTier: "T4-class",
    expectedConsiderationKeywords: ["scal", "cost", "grow", "minim", "small"],
    minConsiderationMatches: 1,
  },
  {
    id: "TC-006",
    name: "Scaling S2 — 200 concurrent users, Conversational",
    workload: `We're deploying a 13 billion parameter conversational AI app with a peak load of \
200 concurrent users. Each interaction averages 750 tokens. Traffic swings 10x between \
off-peak and peak hours. We need near real-time responses (under 10 seconds full response) \
and cost-efficient autoscaling. No compliance requirements.`,
    paramsBillions: 13, workloadType: "Inference", concurrentUsers: 200, tokensPerInteraction: 750, latency: "Near real-time",
    // Pre-computation selects GPU tier from VRAM alone, decoupled from concurrency — a
    // 13B model fits the L4/A10G tier (24GB) regardless of fleet size, so AWS/GCP land on
    // L4 (T4-class; the kept "G6 preferred over G5" rule steers AWS there specifically).
    // Azure has no approved A10G/L4-class inference SKU (FR-089) and uses the A100_80
    // substitute instead. 200 concurrent users only changes instance COUNT, not tier —
    // that's surfaced via the boundary-condition disclosure, not a silent tier override.
    expectedGpuTier: { aws: "T4-class", azure: "A100-class", gcp: "T4-class" },
    expectedConsiderationKeywords: ["scal", "throughput", "autoscal", "concurr", "user"],
    minConsiderationMatches: 2,
  },
  {
    id: "TC-007",
    name: "Scaling S3 — 1000 concurrent users, Document Analysis",
    workload: `We're operating a high-throughput document analysis platform powered by a \
13 billion parameter model. Peak load is 1000 concurrent users each submitting \
3000-token documents for analysis. We require near real-time responses (under 10 seconds) \
and must provision enough GPU capacity to meet peak demand. No compliance requirements.`,
    paramsBillions: 13, workloadType: "Inference", concurrentUsers: 1000, tokensPerInteraction: 3000, latency: "Near real-time",
    // Same 13B model as TC-006 — VRAM-driven tier selection is identical regardless of
    // the much larger fleet; only instance count scales up. See TC-006 comment above.
    expectedGpuTier: { aws: "T4-class", azure: "A100-class", gcp: "T4-class" },
    expectedConsiderationKeywords: ["scal", "throughput", "instance", "concurr"],
    minConsiderationMatches: 2,
  },
];

// ---------------------------------------------------------------------------
// Engine — same stripped-down system prompt as index.html: no VRAM formula,
// no TPS reference table, no fleet-sizing formula. Claude maps the
// pre-computed GPU tier onto a specific instance/SKU per provider and
// explains the recommendation; it does not recalculate sizing.
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = [
  "You are a cloud infrastructure advisor specializing in GPU compute for AI workloads.",
  "",
  "A PRE-COMPUTED SIZING block appears at the start of the user message. All VRAM, quantization,",
  "TPS, fleet-sizing, and instance selection math has already been performed in JavaScript before",
  "this request was sent — use those values directly, do not recalculate any of them and do not",
  "select different instances. The block's \"Pre-selected instances\" list gives you the exact SKU",
  "to use for each provider. Your job is to explain why the pre-computed instances were selected",
  "and surface relevant considerations — not to choose hardware yourself. When the block says",
  "sizing or an instance is not available (no parameter count was provided, the model needs tensor",
  "parallelism beyond a single GPU, or a provider has no pre-selected instance for this tier/",
  "workload combination), reason about sizing and instance choice yourself from the workload",
  "description, and state explicitly that you are overriding the pre-computed selection.",
  "",
  "CRITICAL: The PRE-COMPUTED SIZING block is authoritative, including the specific instance SKUs",
  "under \"Pre-selected instances.\" Use those exact instances. Do not select a different GPU family",
  "or instance size regardless of catalog options. Only override when the block itself says an",
  "instance is not available for a provider — a genuine edge case, and even then you must state",
  "explicitly that you are overriding the pre-computed selection and explain why.",
  "",
  "Follow these rules strictly:",
  "1. PRIMARY: For each provider, use the specific instance/SKU given in the PRE-COMPUTED SIZING block's \"Pre-selected instances\" list directly (or, when no pre-computed instance is available for that provider, your own VRAM/latency/throughput reasoning — state explicitly that you are overriding). Hardware differs across providers by design — AWS may use A10G/L4 (g5/g6) where Azure/GCP use A100 for the same workload; that is expected, not something to reconcile. Price must never influence which instance is selected; price is only used afterward to calculate cost.",
  "2. EQUIVALENT (optional): If your primary for a provider uses meaningfully different GPU hardware than the other providers' primaries (e.g. A10G vs A100-80GB), add an equivalent_instance field showing the strict hardware-equivalent option and a one-sentence explanation of why the primary is the better value.",
  "3. Write the pre-computed VRAM figure and selected GPU tier into the gpu_tier field (e.g. \"15.6GB required — L4/A10G tier (24GB)\"). When no pre-computed block is available, state your own VRAM estimate and reasoning there instead.",
  "4. AWS over-provisioning: when the pre-computed (or your own) replicas_per_instance is 3 or more, add a replica_info object to the aws recommendation: { \"replica_count\": N, \"model_vram_gb\": X, \"instance_vram_gb\": Y }, using the pre-computed VRAM figures. In the aws rationale, explain that the effective per-replica cost drops significantly at scale and that multi-replica deployment on a single over-provisioned instance is the standard production pattern for AWS in this case.",
  "5. HIGH-SPEED INTERCONNECT: Multi-GPU training and tensor-parallel inference both require",
  "   NVLink (InfiniBand on Azure) between GPUs. The PRE-COMPUTED SIZING block's pre-selected",
  "   instances already account for this via nvlinkRequired — when true for a provider, include",
  "   this exact disclosure in that provider's rationale (substitute NVLink/InfiniBand and",
  "   training/inference as appropriate): \"This instance includes [NVLink/InfiniBand] high-speed",
  "   GPU interconnect, required for efficient multi-GPU [training/inference]. Without it,",
  "   inter-GPU communication becomes a bottleneck that severely limits throughput and increases",
  "   latency.\" When no pre-computed instance is available and you must reason about a multi-GPU",
  "   case yourself: AWS never g5 (no NVLink) — use p4d.24xlarge/p4de.24xlarge/p5.48xlarge; Azure",
  "   never NV-series — use an ND-series or multi-GPU NC-series SKU; GCP use A2/A3 family",
  "   (a2-highgpu-*/a3-highgpu-8g).",
  "6. PROVIDER PRICING: hourly_cost_usd is always your job — the pre-computed sizing above never",
  "   includes price. Price must never influence which instance is selected, only fleet cost",
  "   afterward.",
  "   AWS INSTANCE PRICES (us-east-1, on-demand Linux) — use exact values; never estimate:",
  "     g5.xlarge   (1×A10G  24 GB):  $1.006/hr",
  "     g5.2xlarge  (1×A10G  24 GB):  $1.212/hr",
  "     g5.4xlarge  (1×A10G  24 GB):  $1.624/hr",
  "     g5.12xlarge (4×A10G  96 GB):  $5.672/hr",
  "     g5.48xlarge (8×A10G 192 GB): $16.288/hr",
  "     p4d.24xlarge  (8×A100 40GB, NVLink + EFA): $21.958/hr",
  "     p4de.24xlarge (8×A100 80GB, NVLink + EFA): $27.447/hr",
  "     p5.48xlarge   (8×H100 80GB SXM5, NVLink + EFA): $55.040/hr",
  "     G6 (g6.xlarge/g6.12xlarge/g6.48xlarge) and G7e are unpinned — estimate hourly_cost_usd via",
  "     accurate training-data pricing (medium confidence): a specific number, never null or a range.",
  "   AZURE INSTANCE PRICES (eastus, on-demand Linux) — use exact values; never estimate:",
  "     Standard_NC24ads_A100_v4 (1×A100  80 GB): $3.673/hr",
  "     Standard_NC48ads_A100_v4 (2×A100  80 GB): $7.346/hr",
  "     Standard_ND96isr_H100_v5 (8×H100  80 GB): $98.32/hr",
  "     Standard_ND96asr_A100_v4 (8×A100  40 GB) is unpinned — estimate via training-data pricing,",
  "     a specific number, never null or a range.",
  "     NEVER recommend an NV-series SKU (Standard_NV6ads_A10_v5, Standard_NV36ads_A10_v5) for",
  "     Azure under any circumstance — already excluded by the pre-computed selection, but this is",
  "     a hard safety constraint even in the no-precompute fallback case.",
  "     CATALOG GAP DISCLOSURE: whenever the PRE-COMPUTED SIZING block includes an \"Azure",
  "     substitute\" line, append this exact sentence to the Azure rationale: \"Note: Azure does not",
  "     offer a cost-competitive L4 or A10G-class inference instance after excluding NV series.",
  "     NC24ads_A100_v4 is Azure's minimum approved inference configuration and may be",
  "     over-provisioned for small workloads — AWS G6 or GCP G2 offer equivalent throughput at",
  "     significantly lower cost for this workload size.\"",
  "   GCP NEW/UNPRICED GPU FAMILIES:",
  "     G4 family (RTX PRO 6000, 96 GB VRAM): pricing not yet in the public GCP Cloud Billing API",
  "     — still surface it when it's the right recommendation (30B-class that doesn't need an",
  "     A100), set hourly_cost_usd to null, and add \"Contact GCP for current G4 pricing\" as its",
  "     own consideration entry. Do NOT fabricate a price.",
  "     A4X family (GB200 NVL72): reserved-capacity only, not on-demand — never recommend as a",
  "     primary or equivalent_instance; mention only in \"considerations\" for frontier-scale (100B+)",
  "     workloads, noting reserved capacity must be arranged with GCP sales ahead of time.",
  "   COST CALCULATION (after selection, never influencing it):",
  "   a. hourly_cost_usd = price for the exact instance selected. Azure: use the table above,",
  "      never estimate. Unpinned families: a specific training-data estimate — never null, except",
  "      GCP G4/A4X above, where no market rate exists at all.",
  "   b. total_fleet_cost_per_hour = instances_needed × hourly_cost_usd",
  "   c. CRITICAL: hourly_cost_usd in the JSON MUST equal the price stated in the rationale —",
  "      always. instances_needed MUST equal the pre-computed value (or Azure substitute value) —",
  "      never let the rationale explain away or override it (e.g. \"one instance is sufficient",
  "      because of the available headroom\" is NEVER valid reasoning).",
  "   d. Return instances_needed and replicas_per_instance in each provider recommendation,",
  "      copied from the PRE-COMPUTED SIZING block (or its Azure substitute for Azure).",
  "   e. Omit fleet fields entirely when the PRE-COMPUTED SIZING block has no instances_needed",
  "      value (no concurrency data was provided).",
  "7. BOUNDARY CONDITIONS: when the PRE-COMPUTED SIZING block's boundary condition is true, add a",
  "   consideration presenting BOTH the selected tier and the next-tier alternative (or Azure",
  "   substitute, when that is what triggered it) as options, with a one-line fleet cost",
  "   comparison between them, so the user can choose based on their own cost/simplicity",
  "   tradeoff — do not silently pick one over the other.",
  "8. SKIPPED-INPUT DISCLOSURE: whenever a required input is missing from the workload (e.g.",
  "   concurrent users, interaction length/token count, model parameter count, or latency target),",
  "   add an entry to \"considerations\" stating explicitly what default value was assumed in its",
  "   place, and how the recommendation would change under a different input value.",
  "   GENERIC ESTIMATION CAVEATS — DO NOT ADD TO \"considerations\": general estimation-methodology",
  "   caveats (GPU utilization/MFU assumptions, VRAM overhead assumptions, serving-framework",
  "   assumptions, TPS-reference-value caveats, or region/pricing caveats) are already shown once,",
  "   statically, in the UI — never add an entry restating any of these in \"considerations\". Only",
  "   include considerations that are specific to this workload or recommendation (e.g. MoE",
  "   active-parameter notes, NVLink/InfiniBand interconnect requirements, TTFT/latency risk",
  "   warnings, catalog-gap disclosures, boundary-condition options, or the skipped-input",
  "   disclosure above).",
  "9. ABSOLUTE CONSISTENCY RULE: instances_needed in the JSON output MUST equal the final",
  "   instances_needed value derived in the rationale — no exceptions. If your rationale works",
  "   through multiple candidate numbers before reaching a final answer, the JSON field must match",
  "   ONLY the final number the rationale concludes with — never an intermediate value, and never",
  "   a different number than what the rationale states. Before finalizing your response, re-read",
  "   each provider's rationale, identify the number it concludes with, and confirm that",
  "   provider's instances_needed JSON field is IDENTICAL to it. A mismatch between the JSON",
  "   field and the rationale's concluding number is never acceptable, regardless of how the",
  "   discrepancy arose.",
  "10. Respond with valid JSON only — no markdown, no prose, just the raw JSON object.",
].join("\n");

function buildUserPrompt(workload, sizing) {
  return `${formatSizingBlock(sizing)}

Analyze this AI inference workload and recommend the best GPU instance \
for each cloud provider:

${workload}

Respond with this exact JSON structure:
{
  "workload_summary": "brief description of the workload requirements",
  "gpu_tier": "pre-computed VRAM figure and selected tier, or your own estimate if unavailable",
  "recommendations": {
    "aws": {
      "instance_type": "e.g. p4d.24xlarge",
      "gpu_model": "e.g. NVIDIA A100",
      "instances_needed": 1,
      "replicas_per_instance": 1,
      "rationale": "why this instance fits the workload",
      "confidence": "high|medium|low"
    },
    "azure": {
      "instance_type": "e.g. Standard_ND96asr_v4",
      "gpu_model": "e.g. NVIDIA A100",
      "instances_needed": 1,
      "replicas_per_instance": 1,
      "rationale": "why this instance fits the workload",
      "confidence": "high|medium|low"
    },
    "gcp": {
      "instance_type": "e.g. a2-highgpu-8g",
      "gpu_model": "e.g. NVIDIA A100",
      "instances_needed": 1,
      "replicas_per_instance": 1,
      "rationale": "why this instance fits the workload",
      "confidence": "high|medium|low"
    }
  },
  "considerations": ["list of important factors like data residency, scaling, cost"]
}`;
}

async function runEngine(tc) {
  const sizing = computeSizing({
    paramsBillions: tc.paramsBillions,
    workloadType: tc.workloadType,
    concurrentUsers: tc.concurrentUsers,
    tokensPerInteraction: tc.tokensPerInteraction,
    latency: tc.latency,
  });

  // Training workloads with no pre-computed sizing (needs tensor parallelism, not
  // precomputed) tend to reason at length about NVLink/multi-node configuration —
  // cap output to force conciseness instead of letting it sprawl toward truncation.
  const maxTokens = (tc.workloadType === "Training" && sizing?.supported === false) ? 8000 : 32000;

  const stream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(tc.workload, sizing) }],
  });

  const message = await stream.finalMessage();
  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("No text block in response");

  const raw = textBlock.text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "");
  return { result: JSON.parse(raw), usage: message.usage, sizing };
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------
// expectedGpuTier may be a single tier name (applies to all 3 providers) or an object
// keyed by provider (e.g. { aws: "A10G-class", azure: "A100-class", gcp: "A100-class" })
// for cases where providers' hardware catalogs legitimately diverge at the same workload.
function expectedTierFor(tc, provider) {
  return typeof tc.expectedGpuTier === "string" ? tc.expectedGpuTier : tc.expectedGpuTier[provider];
}

function validateTestCase(tc, result) {
  const failures = [];
  const fullText = JSON.stringify(result).toLowerCase();

  for (const provider of ["aws", "azure", "gcp"]) {
    const rec = result.recommendations?.[provider];
    if (!rec) {
      failures.push(`Missing recommendation for ${provider}`);
      continue;
    }
    if (!rec.gpu_model) {
      failures.push(`${provider}: missing gpu_model field`);
      continue;
    }
    const expectedTier = expectedTierFor(tc, provider);
    if (!gpuTierPasses(rec.gpu_model, expectedTier)) {
      const actual = resolveGpuTier(rec.gpu_model);
      failures.push(
        `${provider}: "${rec.gpu_model}" is ${actual?.name ?? "unknown tier"} — ` +
        `expected at least ${expectedTier}`
      );
    }
  }

  const matchedKeywords = tc.expectedConsiderationKeywords.filter((kw) =>
    fullText.includes(kw.toLowerCase())
  );
  if (matchedKeywords.length < tc.minConsiderationMatches) {
    failures.push(
      `Considerations: found ${matchedKeywords.length}/${tc.minConsiderationMatches} required ` +
      `keywords (matched: [${matchedKeywords.join(", ")}], ` +
      `needed from: [${tc.expectedConsiderationKeywords.join(", ")}])`
    );
  }

  return failures;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
async function runTestCase(tc) {
  const start = Date.now();
  try {
    const { result, usage, sizing } = await runEngine(tc);
    const failures = validateTestCase(tc, result);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    return { tc, result, failures, usage, elapsed, sizing, error: null };
  } catch (err) {
    return { tc, result: null, failures: [], usage: null, elapsed: null, sizing: null, error: err };
  }
}

function printResult({ tc, result, failures, usage, elapsed, error }) {
  const pass = !error && failures.length === 0;
  const badge = pass ? "PASS" : "FAIL";
  const line = `${badge}  ${tc.id}  ${tc.name}`;

  console.log(pass ? `  ✓ ${line}` : `  ✗ ${line}`);

  if (error) {
    console.log(`       Error: ${error.message}`);
    return;
  }

  const recs = result?.recommendations ?? {};
  for (const provider of ["aws", "azure", "gcp"]) {
    const r = recs[provider];
    if (r) {
      const tier = resolveGpuTier(r.gpu_model);
      console.log(
        `       ${provider.padEnd(5)} ${r.instance_type.padEnd(28)} ${r.gpu_model.padEnd(18)} ` +
        `[${tier?.name ?? "unknown"}]  confidence: ${r.confidence}`
      );
    }
  }

  if (failures.length) {
    failures.forEach((f) => console.log(`       FAIL: ${f}`));
  }

  if (usage) {
    console.log(
      `       tokens in: ${usage.input_tokens}  out: ${usage.output_tokens}  time: ${elapsed}s`
    );
  }

  console.log();
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY is not set in .env");
    process.exit(1);
  }

  console.log("AIFA — DR-007 Regression Validation Suite\n");
  console.log(`Running ${TEST_CASES.length} test cases against claude-sonnet-4-6...\n`);

  const results = await Promise.allSettled(TEST_CASES.map(runTestCase));
  const settled = results.map((r) => r.value ?? r.reason);

  console.log("=== RESULTS ===\n");
  settled.forEach(printResult);

  const passed = settled.filter((r) => !r.error && r.failures.length === 0).length;
  const failed = settled.length - passed;

  console.log(`=== SUMMARY ===\n  ${passed} passed  /  ${failed} failed  /  ${settled.length} total\n`);

  if (failed > 0) {
    console.error(`${failed} test case(s) failed.`);
    process.exit(1);
  }

  console.log("All test cases passed.");
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
