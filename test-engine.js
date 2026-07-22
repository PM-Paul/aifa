import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Interaction-length presets (inference only) ──────────────────────────────
const INTERACTION_TYPES = {
  "Short Q&A":            200,
  "Conversational":       750,
  "Document Analysis":   3000,
  "Long-form Generation": 6000,
};

// ── Workload configs ─────────────────────────────────────────────────────────

// Scaling scenarios — tested in parallel to verify monotonic instance count growth
const SCENARIOS = [
  { label: "S1",  paramsBillions: 13, concurrentUsers: 10,   interactionType: "Short Q&A"        },
  { label: "S2",  paramsBillions: 13, concurrentUsers: 200,  interactionType: "Conversational"   },
  { label: "S3",  paramsBillions: 13, concurrentUsers: 1000, interactionType: "Document Analysis" },
];

// ── Token resolution (inference) ─────────────────────────────────────────────

function resolveTokens(config) {
  return config.exactTokens ?? INTERACTION_TYPES[config.interactionType];
}

function interactionLabel(config) {
  if (config.exactTokens) return `${config.exactTokens} tokens (custom)`;
  return `${config.interactionType} (~${INTERACTION_TYPES[config.interactionType]} tokens)`;
}

// ── Workload text builders ────────────────────────────────────────────────────

function buildInferenceWorkload(cfg) {
  const label = interactionLabel(cfg);
  const base = `Peak load: ${cfg.concurrentUsers} concurrent users, ${label} per interaction, \
near real-time response required (target first token < 500ms, full response < 10 seconds).`;

  if (cfg.minimizeNodeCount) {
    return `We're operating an enterprise AI document analysis platform. \
We pay for colocation by the rack, not by GPU count — minimizing the number of GPU instances \
is a hard constraint even at higher per-instance cost. Evaluate the full range of GPU instance \
generations including the latest B200 and GB200 nodes to find the option with the fewest instances. \
The model is ${cfg.paramsBillions} billion parameters. No compliance requirements. ${base}`;
  }

  return `We're launching a new consumer AI app that generates personalized workout plans. \
We expect very uneven usage — quiet overnight, moderate during lunch, and peak traffic during \
morning and evening hours with up to 10x the average load. We're a startup, so minimizing \
baseline costs matters, but we can't afford performance degradation during peaks. \
The model is ${cfg.paramsBillions} billion parameters. No compliance requirements. ${base}`;
}

// ── Pre-computed sizing — ported verbatim from index.html's computeSizing() /
// formatSizingBlock() (also used by validation-dataset.js). The shipped app performs
// all VRAM/TPS/fleet-sizing math in JavaScript before the API call; this harness
// mirrors that so it exercises (and benchmarks) what's actually running in production.
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

// Map an arbitrary parameter count to the nearest reference class (see index.html).
//   0–10B → 7B · 10–20B → 13B · 20–50B → 30B · 50B+ → 70B
function pickModelClass(paramsBillions) {
  if (paramsBillions <= 10) return 7;
  if (paramsBillions <= 20) return 13;
  if (paramsBillions <= 50) return 30;
  return 70;
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
    // FR-093: A100/H100-tier training requires multi-GPU NVLink — force the 8-GPU SKU,
    // never the single-GPU inference instances below. (L4/A10G-tier training fits a
    // single GPU and needs no NVLink, so it falls through to the shared g2 logic.)
    if (workloadType === "Training") {
      if (tier === "A100_40") return { sku: "a2-highgpu-8g", gpuDescription: "8×NVIDIA A100 40GB", nvlinkRequired: true };
      if (tier === "A100_80") return { sku: "a2-ultragpu-8g", gpuDescription: "8×NVIDIA A100 80GB", nvlinkRequired: true };
      if (tier === "H100")    return { sku: "a3-highgpu-8g", gpuDescription: "8×NVIDIA H100 80GB", nvlinkRequired: true };
    }
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
    const { quantFactor, vramPerReplica } = sizeForTier(gpu, modelClass, workloadType);
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
      const { quantFactor: nextQuantFactor, vramPerReplica: nextVram } = sizeForTier(nextGpu, modelClass, workloadType);
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
    const { quantFactor: azQuantFactor, vramPerReplica: azVram } = sizeForTier(azureGpu, modelClass, workloadType);
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
    `- Model VRAM required: ${sizing.vram_per_replica_gb}GB (${sizing.model_class === sizing.model_params_billions ? `${sizing.model_params_billions}B params` : `${sizing.model_params_billions}B params sized to nearest ${sizing.model_class}B class`} × 2 × ${sizing.quant_factor} × 1.20 overhead)`,
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

// Per-provider view of sizing — Azure uses its FR-089 substitute when one applies.
function sizingForProvider(sizing, provider) {
  if (!sizing || !sizing.supported) return null;
  if (provider === "azure" && sizing.azure_substitute) return sizing.azure_substitute;
  return sizing;
}

// ── System prompt — same stripped-down prompt as index.html/validation-dataset.js:
// no VRAM formula, no TPS reference table, no fleet-sizing formula, no MFU/quantization
// instructions. Claude maps the pre-computed GPU tier onto a specific instance/SKU per
// provider and explains the recommendation; it does not recalculate sizing.
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
  "5. HIGH-SPEED INTERCONNECT RULE (FR-093): For training workloads requiring more than one GPU,",
  "   ALWAYS recommend an instance with NVLink (or NVSwitch) or InfiniBand connecting the GPUs.",
  "   AWS: NEVER recommend the g5 family for multi-GPU training — g5 has no NVLink between its",
  "   A10G GPUs. Use p4d.24xlarge (8×A100 40GB, NVLink + EFA) or p5.48xlarge (8×H100, NVLink + EFA).",
  "   Azure: NEVER recommend the NV series for training — NV series has no InfiniBand. Use ND",
  "   series only: Standard_ND96asr_A100_v4, Standard_ND96isr_H100_v5, or Standard_ND96isr_H200_v5",
  "   (all InfiniBand). PREFER Standard_ND96isr_H200_v5 over Standard_ND96isr_H100_v5 for large",
  "   training workloads — higher per-GPU VRAM and memory bandwidth improve training throughput",
  "   at the same GPU count.",
  "   GCP: Use A2 or A3 family (NVLink): a2-highgpu-8g or a3-highgpu-8g.",
  "   In the rationale for every multi-GPU training recommendation, include this disclosure (fill",
  "   in NVLink or InfiniBand as appropriate for the provider/instance): \"This instance includes",
  "   [NVLink/InfiniBand] high-speed GPU interconnect, required for efficient multi-GPU training.",
  "   Without high-speed interconnect, inter-GPU communication becomes a bottleneck that",
  "   significantly reduces training throughput.\"",
  "6. PROVIDER INSTANCE SELECTION & PRICING:",
  "   TENSOR PARALLELISM INTERCONNECT RULE (FR-094): tensor parallelism is required whenever the",
  "   PRE-COMPUTED SIZING block reports sizing as not available because the model exceeds every",
  "   single-GPU tier (or, absent a pre-computed block, whenever your own VRAM estimate exceeds a",
  "   single GPU's capacity in the tier you select). Whenever this holds, ALWAYS recommend an",
  "   instance with NVLink connecting the GPUs. This is separate from the training-workload",
  "   interconnect rule above, which applies to training.",
  "     AWS: NEVER recommend the g5 family for tensor-parallel inference — g5's A10G GPUs have",
  "     no NVLink between them. Use p4d.24xlarge (8×A100 40GB, NVLink) or p5.48xlarge (8×H100,",
  "     NVLink) instead, sized to the number of GPUs the model requires.",
  "     Azure: use a multi-GPU NC-series SKU (e.g. Standard_NC48ads_A100_v4) or an ND-series SKU",
  "     (e.g. Standard_ND96isr_H100_v5) — both provide NVLink. Never use a multi-GPU NV-series",
  "     SKU for tensor-parallel inference.",
  "     GCP: use A2 or A3 family (NVLink): a2-highgpu-2g/4g/8g or a3-highgpu-8g, sized to the",
  "     number of GPUs the model requires.",
  "     In the rationale for every tensor-parallel inference recommendation, include this exact",
  "     disclosure: \"Multi-GPU tensor parallelism required — this instance includes NVLink for",
  "     high-bandwidth GPU-to-GPU communication. Without NVLink, inter-GPU communication would",
  "     severely limit inference throughput and increase latency.\"",
  "   AWS INSTANCE PRICES (us-east-1, on-demand Linux) — use exact values; never estimate. These",
  "   prices are used ONLY after an instance is selected, to calculate fleet cost — never to",
  "   choose which instance to select:",
  "     g5.xlarge   (1×A10G  24 GB):  $1.006/hr",
  "     g5.2xlarge  (1×A10G  24 GB):  $1.212/hr",
  "     g5.4xlarge  (1×A10G  24 GB):  $1.624/hr",
  "     g5.12xlarge (4×A10G  96 GB):  $5.672/hr  [4 replicas/instance for 13B INT8]",
  "     g5.48xlarge (8×A10G 192 GB): $16.288/hr  [8 replicas/instance for 13B INT8]",
  "     p4d.24xlarge  (8×A100 40GB, NVLink + EFA): $21.958/hr",
  "     p4de.24xlarge (8×A100 80GB, NVLink + EFA): $27.447/hr",
  "     p5.48xlarge   (8×H100 80GB SXM5, NVLink + EFA): $55.040/hr",
  "     Use g5.12xlarge/g5.48xlarge ONLY to pack multiple independent single-GPU replicas onto",
  "     one machine when the pre-computed replicas_per_instance requires it, or when the workload",
  "     explicitly requires minimizing instance count — never for tensor-parallel inference (see",
  "     the rule above) or training (see rule 5 above), since g5's A10G GPUs have no NVLink",
  "     between them — and never because it produces a lower fleet cost.",
  "   AWS NEW GPU FAMILIES — no pinned prices here; these are newer families without a verified",
  "   reference price, so estimate hourly_cost_usd the same way as GCP (accurate training-data",
  "   pricing, medium confidence) — a specific number, not a range. Being unpinned does not mean",
  "   avoid them — recommend whenever they best fit the pre-computed tier (or your own reasoning):",
  "     G6 family (1×L4 24 GB per GPU — g6.xlarge/g6.2xlarge/g6.4xlarge; g6.12xlarge = 4×L4;",
  "     g6.48xlarge = 8×L4): PREFER over G5 for 7B–13B-class inference — better price/performance.",
  "     G7e family (RTX PRO 6000 Blackwell, 96 GB VRAM per GPU; launched Jan 2026): use for",
  "     30B-class inference that does not fit A10G/L4 (24 GB) but does not need an A100.",
  "   AZURE INSTANCE PRICES (eastus, on-demand Linux) — used ONLY after an instance is selected,",
  "   to calculate fleet cost — never to choose which instance to select:",
  "     Standard_NV6ads_A10_v5   (1×A10G  24 GB): $0.454/hr   [NEVER recommend — see FR-089 below]",
  "     Standard_NC24ads_A100_v4 (1×A100  80 GB): $3.673/hr",
  "     Standard_NC48ads_A100_v4 (2×A100  80 GB): $7.346/hr",
  "     Standard_ND96isr_H100_v5 (8×H100  80 GB): $98.32/hr",
  "     Standard_NV36ads_A10_v5  (4×A10G  96 GB): $3.20/hr   [NEVER recommend — see FR-089 below]",
  "     Use multi-GPU SKUs (NC48ads, ND96isr) ONLY when the pre-computed (or your own) replicas",
  "     require more capacity on one machine than a single-GPU instance can hold — never because",
  "     it produces a lower fleet cost. NC48ads and ND96isr have NVLink and are correct when",
  "     tensor parallelism or training requires it.",
  "   AZURE INFERENCE GPU RESTRICTION (FR-089): NEVER recommend an NV-series SKU",
  "   (Standard_NV6ads_A10_v5 or Standard_NV36ads_A10_v5) for ANY Azure recommendation —",
  "   inference, tensor-parallel inference, or training. NV-series is a graphics/virtual-",
  "   workstation line, not validated for production LLM workloads; the prices above are listed",
  "   for completeness only. Always use an NC-series or ND-series SKU for Azure inference instead:",
  "     Standard_NC24ads_A100_v4 (1×A100 80GB, BF16) is Azure's floor inference instance. Use",
  "     this even when AWS/GCP would use an A10G/L4-class GPU for the same workload — Azure has",
  "     no approved low-cost A10G-tier inference SKU in this catalog.",
  "     Standard_NC48ads_A100_v4 or Standard_ND96isr_H100_v5 when the workload needs more VRAM",
  "     or throughput than a single A100 80GB provides (e.g. tensor parallelism, or higher",
  "     TPS/replica).",
  "     When the PRE-COMPUTED SIZING block includes an \"Azure substitute\" line, use those exact",
  "     numbers for the Azure recommendation's replicas_per_instance/instances_needed instead of",
  "     the general values — do not reuse AWS/GCP's numbers for an Azure NC24ads_A100_v4",
  "     recommendation.",
  "     CATALOG GAP DISCLOSURE: whenever this substitution applies (i.e. AWS/GCP would use an",
  "     A10G/L4-class GPU but Azure is forced onto NC24ads_A100_v4), append this exact sentence",
  "     to the Azure rationale: \"Note: Azure does not offer a cost-competitive L4 or A10G-class",
  "     inference instance after excluding NV series. NC24ads_A100_v4 is Azure's minimum approved",
  "     inference configuration and may be over-provisioned for small workloads — AWS G6 or GCP",
  "     G2 offer equivalent throughput at significantly lower cost for this workload size.\"",
  "   AZURE NEW GPU FAMILIES — no pinned prices here; estimate hourly_cost_usd via accurate",
  "   training-data pricing (medium confidence) — a specific number, not a range:",
  "     Standard_NC40ads_H100_v5 (1×H100 NVL, 80 GB): the PREFERRED single-GPU Azure H100",
  "     inference SKU. Use this instead of jumping straight to the 8-GPU Standard_ND96isr_H100_v5",
  "     whenever the workload only needs one H100-class replica (no tensor parallelism or",
  "     fleet-packing across many GPUs needed).",
  "     Standard_ND96isr_H200_v5 (8×H200, 141 GB each, NVLink): PREFER over",
  "     Standard_ND96isr_H100_v5 for large training workloads — higher per-GPU VRAM and memory",
  "     bandwidth improve training throughput at the same GPU count.",
  "   GCP NEW GPU FAMILIES:",
  "     G4 family (RTX PRO 6000, 96 GB VRAM per GPU): Generally Available, but pricing is not yet",
  "     in the public GCP Cloud Billing API. Use for the same case as AWS G7e — 30B-class",
  "     inference that does not fit A10G/L4 but does not need an A100. When G4 is the right",
  "     recommendation, still surface it: set hourly_cost_usd to null and add \"Contact GCP for",
  "     current G4 pricing\" as its own consideration entry. Do NOT fabricate a price for G4.",
  "     A4X family (GB200 NVL72): requires reserved capacity — NOT available on-demand. Do not",
  "     recommend A4X as a primary or equivalent_instance recommendation. Mention it only in",
  "     \"considerations\", and only for frontier-scale workloads (100B+ parameter training or",
  "     massive-scale inference), noting that reserved capacity must be arranged with GCP sales",
  "     ahead of time.",
  "   CRITICAL RULE — SEPARATION OF SELECTION FROM COST: instance selection must be based",
  "   entirely on the pre-computed GPU tier (or, absent one, workload requirements). Price must",
  "   never influence which instance is selected. Price is only used after the instance is",
  "   selected, to calculate fleet cost.",
  "   a. hourly_cost_usd = price for the exact instance type selected above (fetched after selection).",
  "      For Azure: use the AZURE INSTANCE PRICES table above — never estimate or approximate.",
  "      For unpinned/new GPU families (AWS G6/G7e, Azure NC40ads_H100_v5/ND96isr_H200_v5):",
  "      hourly_cost_usd MUST still be a single specific number from your best training-data",
  "      estimate — never null and never a range in this field (a confidence caveat can still go",
  "      in the rationale). The ONLY exceptions where hourly_cost_usd may be null are GCP G4 and",
  "      GCP A4X below, where no usable market rate exists at all.",
  "   b. total_fleet_cost_per_hour = instances_needed × hourly_cost_usd",
  "   c. CRITICAL: hourly_cost_usd in the JSON MUST equal the price stated in the rationale. They",
  "      must always match. The instances_needed JSON field MUST equal the pre-computed value (or",
  "      the Azure-substitute value, when applicable) — do not let the rationale explain away or",
  "      override the pre-computed number (e.g. \"one instance is sufficient because of the",
  "      available headroom\" is NEVER valid reasoning).",
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

// ── JSON response schema — unified for inference/training, same shape as
// index.html/validation-dataset.js. ────────────────────────────────────────────
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
      "hourly_cost_usd": 0,
      "rationale": "why this instance fits the workload",
      "confidence": "high|medium|low"
    },
    "azure": {
      "instance_type": "e.g. Standard_ND96asr_v4",
      "gpu_model": "e.g. NVIDIA A100",
      "instances_needed": 1,
      "replicas_per_instance": 1,
      "hourly_cost_usd": 0,
      "rationale": "why this instance fits the workload",
      "confidence": "high|medium|low"
    },
    "gcp": {
      "instance_type": "e.g. a2-highgpu-8g",
      "gpu_model": "e.g. NVIDIA A100",
      "instances_needed": 1,
      "replicas_per_instance": 1,
      "hourly_cost_usd": 0,
      "rationale": "why this instance fits the workload",
      "confidence": "high|medium|low"
    }
  },
  "considerations": ["list of important factors like data residency, scaling, cost"]
}`;
}

function makeInferencePrompt(cfg, sizing) {
  return buildUserPrompt(buildInferenceWorkload(cfg), sizing);
}

// ── Query helper ──────────────────────────────────────────────────────────────

async function query(userPrompt, label) {
  process.stdout.write(`Querying Claude — ${label}...\n`);

  const stream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const message = await stream.finalMessage();
  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock) {
    const types = message.content.map((b) => b.type).join(", ");
    throw new Error(`No text block in "${label}" response. Got: ${types}`);
  }

  const raw = textBlock.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  return { result: JSON.parse(raw), usage: message.usage };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("AIFA — AI Factory Advisor  |  Scaling validation: instance count vs load\n");

  const providers = ["aws", "azure", "gcp"];
  const col = (s, w) => String(s ?? "?").padEnd(w);

  // Fire all three scenarios in parallel. Sizing is precomputed in JS before the call —
  // it's the authoritative source for peak TPS / instances needed, not Claude's echo.
  const results = await Promise.all(
    SCENARIOS.map((cfg) => {
      const sizing = computeSizing({
        paramsBillions: cfg.paramsBillions,
        workloadType: "Inference",
        concurrentUsers: cfg.concurrentUsers,
        tokensPerInteraction: resolveTokens(cfg),
        latency: "Near real-time",
      });
      return query(
        makeInferencePrompt(cfg, sizing),
        `${cfg.label} — ${cfg.concurrentUsers} users, ${interactionLabel(cfg)}`
      ).then((r) => ({ cfg, sizing, ...r }));
    })
  );

  // ── Full results ─────────────────────────────────────────────────────────
  for (const { cfg, sizing, result } of results) {
    const tps = sizing?.peak_tps?.toLocaleString() ?? "?";
    console.log(`\n=== ${cfg.label}: ${cfg.concurrentUsers} users × ${interactionLabel(cfg)} (${tps} peak TPS) ===\n`);
    console.log(JSON.stringify(result, null, 2));
  }

  // ── Scaling comparison table (Claude's echoed instances_needed) ──────────
  console.log("\n=== SCALING COMPARISON ===\n");

  const hdr = `${col("Scenario", 40)} ${col("Peak TPS", 11)}` +
    providers.map((p) => ` ${col(p.toUpperCase(), 5)}`).join("") +
    `  Instance type (AWS)`;
  console.log(hdr);
  console.log("─".repeat(hdr.length + 20));

  for (const { cfg, sizing, result } of results) {
    const tps   = sizing?.peak_tps ?? 0;
    const label = `${cfg.label}: ${cfg.concurrentUsers} users, ${cfg.interactionType}`;
    const counts = providers.map((p) => col(result.recommendations[p]?.instances_needed ?? "?", 6));
    const awsType = result.recommendations.aws?.instance_type ?? "?";
    console.log(`${col(label, 40)} ${col(tps.toLocaleString(), 11)}${counts.join("")}  ${awsType}`);
  }

  // ── Monotonic scaling check (pre-computed, authoritative) ─────────────────
  console.log("\n=== SCALING VALIDATION (pre-computed) ===\n");
  for (const p of providers) {
    const counts = results.map(({ sizing }) => sizingForProvider(sizing, p)?.instances_needed ?? 0);
    const isMonotonic = counts.every((c, i) => i === 0 || c >= counts[i - 1]);
    const arrow = counts.join(" → ");
    const verdict = isMonotonic ? "✓ monotonically increasing" : "✗ NOT monotonic — review sizing";
    console.log(`${col(p.toUpperCase(), 6)} ${arrow}  ${verdict}`);
  }

  // ── Adherence check: does Claude's echoed JSON match the pre-computed values? ──
  console.log("\n=== PRE-COMPUTATION ADHERENCE CHECK ===\n");
  let adherenceFailures = 0;
  for (const { cfg, sizing, result } of results) {
    for (const p of providers) {
      const expected = sizingForProvider(sizing, p);
      const rec = result.recommendations[p];
      if (!expected || !rec) continue;
      const instancesMatch = rec.instances_needed === expected.instances_needed;
      const replicasMatch  = rec.replicas_per_instance === expected.replicas_per_instance;
      const ok = instancesMatch && replicasMatch;
      if (!ok) adherenceFailures++;
      console.log(
        `${col(`${cfg.label} ${p.toUpperCase()}`, 12)} ` +
        `instances: ${rec.instances_needed ?? "?"} vs expected ${expected.instances_needed ?? "?"}  ` +
        `replicas: ${rec.replicas_per_instance ?? "?"} vs expected ${expected.replicas_per_instance ?? "?"}  ` +
        `${ok ? "✓" : "✗ MISMATCH"}`
      );
    }
  }
  console.log(adherenceFailures === 0 ? "\n✓ All providers matched pre-computed sizing exactly." : `\n✗ ${adherenceFailures} provider/scenario mismatch(es) — Claude deviated from pre-computed sizing.`);

  // ── Per-scenario throughput math (pre-computed, authoritative) ────────────
  console.log("\n=== THROUGHPUT ANALYSIS PER SCENARIO (pre-computed) ===\n");
  for (const { cfg, sizing } of results) {
    console.log(`${cfg.label} (${cfg.concurrentUsers} users × ${interactionLabel(cfg)})`);
    console.log(`  GPU tier     : ${sizing?.gpu_tier ?? "?"} (${sizing?.gpu_tier_vram_gb ?? "?"}GB)`);
    console.log(`  Required TPS : ${sizing?.peak_tps?.toLocaleString() ?? "?"}`);
    console.log(`  TPS/replica  : ${sizing?.tps_per_replica?.toLocaleString() ?? "?"}`);
    console.log(`  Replicas/inst: ${sizing?.replicas_per_instance ?? "?"}`);
    console.log(`  Instances    : ${sizing?.instances_needed ?? "?"}`);
    console.log();
  }

  // ── Fleet cost table (instances from pre-computed sizing, price from Claude) ──
  console.log("\n=== FLEET COST TABLE ===\n");
  const fmtUSD = (n) => (n == null ? "     N/A" : `$${Number(n).toFixed(2).padStart(8)}`);
  const fHdr = `${col("Scenario", 32)} ${col("Provider", 8)} ${col("Instances", 10)} ${col("$/hr ea", 10)} ${col("Fleet $/hr", 12)} ${"Fleet $/mo"}`;
  console.log(fHdr);
  console.log("─".repeat(fHdr.length));
  for (const { cfg, sizing, result } of results) {
    const label = `${cfg.label}: ${cfg.concurrentUsers}u × ${cfg.interactionType}`;
    for (const p of providers) {
      const expected = sizingForProvider(sizing, p);
      const rec = result.recommendations[p];
      const n   = expected?.instances_needed;
      const hr  = rec?.hourly_cost_usd;
      const fhr = (n != null && hr != null) ? n * hr : null;
      const fmo = fhr != null ? fhr * 730 : null;
      console.log(
        `${col(label, 32)} ${col(p.toUpperCase(), 8)} ${col(n ?? "?", 10)} ` +
        `${fmtUSD(hr)}   ${fmtUSD(fhr)}   ${fmtUSD(fmo)}`
      );
    }
    console.log();
  }

  console.log("=== USAGE ===");
  for (const { cfg, usage } of results) {
    console.log(`${cfg.label}: input=${usage.input_tokens}, output=${usage.output_tokens}`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
