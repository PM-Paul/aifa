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
  { label: "S1",  workloadType: "inference", modelParams: "13B", concurrentUsers: 10,   interactionType: "Short Q&A"       },
  { label: "S2",  workloadType: "inference", modelParams: "13B", concurrentUsers: 200,  interactionType: "Conversational"  },
  { label: "S3",  workloadType: "inference", modelParams: "13B", concurrentUsers: 1000, interactionType: "Document Analysis"},
];

const TRAINING_CONFIG = {
  workloadType: "training",
  modelParams: "13B",
  trainingType: "full fine-tune",
  datasetTokens: "5B",
  targetHours: 48,
  sequenceLength: 2048,
};

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
The model is ${cfg.modelParams} parameters. No compliance requirements. ${base}`;
  }

  return `We're launching a new consumer AI app that generates personalized workout plans. \
We expect very uneven usage — quiet overnight, moderate during lunch, and peak traffic during \
morning and evening hours with up to 10x the average load. We're a startup, so minimizing \
baseline costs matters, but we can't afford performance degradation during peaks. \
The model is ${cfg.modelParams} parameters. No compliance requirements. ${base}`;
}

function buildTrainingWorkload(cfg) {
  return `We're fine-tuning a ${cfg.modelParams} parameter language model on a domain-specific \
fitness dataset for a consumer AI app. The dataset contains ${cfg.datasetTokens} tokens of \
curated exercise and nutrition content. We need ${cfg.trainingType} (not LoRA) for maximum \
output quality. Target completion time is ${cfg.targetHours} hours to meet our product launch \
timeline. Sequence length is ${cfg.sequenceLength} tokens. No compliance requirements.`;
}

// ── System prompt with explicit per-workload-type rules ───────────────────────

const SYSTEM_PROMPT = `You are a cloud infrastructure expert specializing in GPU compute for \
AI workloads. Recommend the optimal GPU instance type on AWS, Azure, and GCP.

GPU EFFECTIVE COMPUTE REFERENCE — use these exact values in all calculations (45% MFU pre-applied):
  H100 SXM5  BF16 : 445  TFLOPS  [989  TF peak × 0.45]
  A100 SXM4  BF16 : 140  TFLOPS  [312  TF peak × 0.45]
  A10 / A10G INT8 : 113  TOPS    [250  TOPS peak × 0.45]
  B200 / GB200 FP8: 2000 TOPS    [~4,455 TOPS peak × 0.45]

VLLM INFERENCE TPS REFERENCE — 13B-class models, vLLM continuous batching.
Use these exact per-replica values. Never estimate or derive from TFLOPS.
  A10G       INT8 :   800 TPS/replica  [24 GB VRAM; ~13 GB INT8 weights → 1 replica/GPU]
  L4         INT8 :   650 TPS/replica  [24 GB VRAM; ~13 GB INT8 weights → 1 replica/GPU]
  A100 40 GB BF16 : 1,100 TPS/replica  [40 GB VRAM; ~26 GB BF16 weights → 1 replica/GPU]
  A100 80 GB BF16 : 1,300 TPS/replica  [80 GB VRAM; ~26 GB BF16 weights → 3 replicas/GPU; larger KV-cache headroom enables bigger batches]
  H100 80 GB BF16 : 3,000 TPS/replica  [80 GB VRAM; ~26 GB BF16 weights → 3 replicas/GPU]

AZURE INSTANCE PRICES (eastus, on-demand Linux) — use these exact values for hourly_cost_usd.
Never estimate Azure prices. Never use NV36ads_A10_v5 for single-replica workloads.
  Standard_NV6ads_A10_v5   (1×A10G  24 GB): $0.454/hr   ← preferred single-GPU A10G SKU
  Standard_NC24ads_A100_v4 (1×A100  80 GB): $3.673/hr   ← preferred single-GPU A100 SKU
  Standard_NC48ads_A100_v4 (2×A100  80 GB): $7.346/hr
  Standard_ND96isr_H100_v5 (8×H100  80 GB): $98.32/hr
  Standard_NV36ads_A10_v5  (4×A10G  96 GB): $3.20/hr    [multi-GPU; use only when 4 replicas needed to fit model or justify cost]

=== INFERENCE WORKLOAD RULES ===
GPU-optimal quantization — apply based on the GPU family you recommend:
  H100, A100 family  → BF16  (native BF16 Tensor Cores; no quality penalty vs FP16;
                               ~13GB weights for 13B, ~26GB for 13B at BF16)
  A10G, L4, T4       → INT8  (INT8 Tensor Cores; ~2× throughput vs FP16;
                               ~6.5GB weights for 13B INT8)
  B200, GB200        → FP8   (Transformer Engine FP8 via vLLM ≥0.5; ~2× vs BF16, ~4× vs FP16;
                               ~3.25GB weights for 13B FP8; supported on p6, ND B200 v6, a4)

Instance selection — ALWAYS follow these steps in order:
  a. Identify all plausible single-GPU SKUs for this provider (e.g. A10G, L4, A100-40GB, A100-80GB, H100).
  b. For each candidate, compute instances_needed and total_fleet_cost_per_hour using the TPS REFERENCE table.
  c. SELECT the candidate with the LOWEST total_fleet_cost_per_hour.
     A higher-VRAM GPU that needs fewer instances is often cheaper overall than many low-cost GPUs.
  d. Prefer single-GPU SKUs (e.g. Standard_NC24ads_A100_v4, g5.xlarge, a2-highgpu-1g) over multi-GPU SKUs.
     Only use a multi-GPU SKU when the model weights cannot fit a single GPU.

Throughput sizing:
  1. peak_tps = concurrent_users × tokens_per_interaction / target_response_seconds
  2. For EACH candidate GPU tier: tps_per_replica = look up from VLLM INFERENCE TPS REFERENCE table — never estimate
  2b. replicas_per_instance = floor(instance_vram_gb / model_vram_gb_at_precision)  [min 1]
  2c. tps_per_instance = tps_per_replica × replicas_per_instance
  3. instances_needed = ceil(peak_tps / tps_per_instance × 1.20)   [20% headroom]
  4. total_fleet_cost_per_hour = instances_needed × hourly_cost_usd  → pick GPU tier with lowest this value

Fleet cost — compute and populate these fields for every inference recommendation:
  4. replicas_per_instance = same value as step 2b above
  5. tps_per_replica = same value as step 2 above (from TPS REFERENCE table — never re-derive)
  6. instances_needed = ceil(peak_tps / (replicas_per_instance × tps_per_replica) × 1.20)
     CRITICAL: instances_needed is a COMPUTED NUMBER, never 1 unless the formula genuinely yields 1.
     The instances_needed JSON field MUST equal the value stated in the rationale. They must always match.
     Do NOT copy placeholder values from the schema — replace every numeric field with your calculated result.
  7. hourly_cost_usd = on-demand Linux price for the exact instance type recommended.
     For Azure: look up from the AZURE INSTANCE PRICES table above — never estimate.
     For AWS/GCP: use accurate training-data pricing for us-east-1 / us-central1.
     CRITICAL: hourly_cost_usd in the JSON MUST equal the price stated in the rationale.
     They must always be identical. A mismatch between JSON and rationale is always wrong.
  8. total_fleet_cost_per_hour = instances_needed × hourly_cost_usd
  9. total_fleet_cost_per_month = total_fleet_cost_per_hour × 730
  10. effective_cost_per_replica = hourly_cost_usd / replicas_per_instance

=== TRAINING WORKLOAD RULES ===
Precision: BF16 for activations/weights, FP32 for optimizer states. NO quantization — ever.
Instance selection: prefer large multi-GPU instances (8-GPU nodes) for training efficiency; \
NVLink/NVSwitch bandwidth and higher MFU justify the larger unit size.

Dataset throughput sizing:
  1. total_flops = 6 × model_params × dataset_tokens   [standard transformer FLOPs estimate]
  2. effective_flops_per_gpu = peak_TFLOPS_BF16 × MFU  [assume 45% MFU for well-tuned setup]
  3. total_gpu_hours = total_flops / effective_flops_per_gpu
  4. instance_hours = ceil(total_gpu_hours / gpus_per_instance)
  5. instance_count = ceil(instance_hours / target_hours) with 10% headroom

Do NOT apply TPS or concurrent-user logic to training workloads.
Do NOT apply quantization to training workloads.

Always include as the first item in "considerations": a note that instance counts assume 45% GPU \
utilization efficiency (MFU). State the specific effective TFLOPS/TOPS value used (from the \
reference table above). Note that production deployments with optimized serving stacks \
(vLLM, TensorRT-LLM) or training frameworks (DeepSpeed, FSDP) may achieve 50–65% MFU, \
potentially reducing required instance counts by 15–30%.

Always respond with valid JSON only — no markdown, no prose, just the raw JSON object.`;

// ── JSON response schemas ─────────────────────────────────────────────────────

const INFERENCE_SCHEMA = `{
  "workload_type": "inference",
  "workload_summary": "brief description",
  "quantization": {
    "precision": "BF16|INT8|FP8",
    "gpu_family": "which GPU family drove this choice",
    "rationale": "one sentence explaining why this precision tier was selected"
  },
  "throughput_analysis": {
    "peak_tps_required": 0,
    "tps_per_instance": 0,
    "sizing_rationale": "step-by-step derivation of instance count"
  },
  "recommendations": {
    "aws": {
      "instance_type": "...", "gpu_model": "...", "instance_count": "<COMPUTED: ceil(peak_tps/tps_per_instance×1.20)>",
      "quantization_applied": {
        "precision": "BF16|INT8|FP8",
        "effective_weight_gb": "<COMPUTED: model_params × bytes_per_param>",
        "throughput_vs_fp16": "e.g. 2x (INT8) or 4x (FP8)"
      },
      "instances_needed": "<COMPUTED: ceil(peak_tps/(replicas_per_instance×tps_per_replica)×1.20)>",
      "replicas_per_instance": "<COMPUTED: floor(instance_vram_gb/model_vram_gb)>",
      "tps_per_replica": "<COMPUTED: tps_per_instance/replicas_per_instance>",
      "hourly_cost_usd": "<COMPUTED: on-demand price for this instance type>",
      "total_fleet_cost_per_hour": "<COMPUTED: instances_needed × hourly_cost_usd>",
      "total_fleet_cost_per_month": "<COMPUTED: total_fleet_cost_per_hour × 730>",
      "effective_cost_per_replica": "<COMPUTED: hourly_cost_usd / replicas_per_instance>",
      "rationale": "...", "confidence": "high|medium|low"
    },
    "azure": {
      "instance_type": "...", "gpu_model": "...", "instance_count": "<COMPUTED: ceil(peak_tps/tps_per_instance×1.20)>",
      "quantization_applied": {
        "precision": "BF16|INT8|FP8",
        "effective_weight_gb": "<COMPUTED: model_params × bytes_per_param>",
        "throughput_vs_fp16": "e.g. 2x (INT8) or 4x (FP8)"
      },
      "instances_needed": "<COMPUTED: ceil(peak_tps/(replicas_per_instance×tps_per_replica)×1.20)>",
      "replicas_per_instance": "<COMPUTED: floor(instance_vram_gb/model_vram_gb)>",
      "tps_per_replica": "<COMPUTED: tps_per_instance/replicas_per_instance>",
      "hourly_cost_usd": "<COMPUTED: on-demand price for this instance type>",
      "total_fleet_cost_per_hour": "<COMPUTED: instances_needed × hourly_cost_usd>",
      "total_fleet_cost_per_month": "<COMPUTED: total_fleet_cost_per_hour × 730>",
      "effective_cost_per_replica": "<COMPUTED: hourly_cost_usd / replicas_per_instance>",
      "rationale": "...", "confidence": "high|medium|low"
    },
    "gcp": {
      "instance_type": "...", "gpu_model": "...", "instance_count": "<COMPUTED: ceil(peak_tps/tps_per_instance×1.20)>",
      "quantization_applied": {
        "precision": "BF16|INT8|FP8",
        "effective_weight_gb": "<COMPUTED: model_params × bytes_per_param>",
        "throughput_vs_fp16": "e.g. 2x (INT8) or 4x (FP8)"
      },
      "instances_needed": "<COMPUTED: ceil(peak_tps/(replicas_per_instance×tps_per_replica)×1.20)>",
      "replicas_per_instance": "<COMPUTED: floor(instance_vram_gb/model_vram_gb)>",
      "tps_per_replica": "<COMPUTED: tps_per_instance/replicas_per_instance>",
      "hourly_cost_usd": "<COMPUTED: on-demand price for this instance type>",
      "total_fleet_cost_per_hour": "<COMPUTED: instances_needed × hourly_cost_usd>",
      "total_fleet_cost_per_month": "<COMPUTED: total_fleet_cost_per_hour × 730>",
      "effective_cost_per_replica": "<COMPUTED: hourly_cost_usd / replicas_per_instance>",
      "rationale": "...", "confidence": "high|medium|low"
    }
  },
  "considerations": ["..."]
}`;

const TRAINING_SCHEMA = `{
  "workload_type": "training",
  "workload_summary": "brief description",
  "training_analysis": {
    "total_flops_required": "e.g. 3.9e20",
    "effective_flops_per_gpu_tflops": 0,
    "total_gpu_hours": 0,
    "instance_hours_required": 0,
    "sizing_rationale": "step-by-step derivation using the FLOPs formula"
  },
  "recommendations": {
    "aws":   { "instance_type": "...", "gpu_model": "...", "instance_count": 1, "precision": "BF16", "estimated_hours": 0, "rationale": "...", "confidence": "high|medium|low" },
    "azure": { "instance_type": "...", "gpu_model": "...", "instance_count": 1, "precision": "BF16", "estimated_hours": 0, "rationale": "...", "confidence": "high|medium|low" },
    "gcp":   { "instance_type": "...", "gpu_model": "...", "instance_count": 1, "precision": "BF16", "estimated_hours": 0, "rationale": "...", "confidence": "high|medium|low" }
  },
  "considerations": ["..."]
}`;

function makeInferencePrompt(cfg) {
  return `Analyze this INFERENCE workload and recommend the best GPU instance for each cloud provider:\n\n${buildInferenceWorkload(cfg)}\n\nRespond with this exact JSON structure:\n${INFERENCE_SCHEMA}`;
}

function makeTrainingPrompt(cfg) {
  return `Analyze this TRAINING workload and recommend the best GPU instance for each cloud provider:\n\n${buildTrainingWorkload(cfg)}\n\nRespond with this exact JSON structure:\n${TRAINING_SCHEMA}`;
}

// ── Query helper ──────────────────────────────────────────────────────────────

async function query(userPrompt, label) {
  process.stdout.write(`Querying Claude — ${label}...\n`);

  const stream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 16000,
    thinking: { type: "enabled", budget_tokens: 10000 },
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

  // Compute expected peak TPS from config so we can show it alongside Claude's answer
  function peakTps(cfg) {
    const tokens = resolveTokens(cfg);
    return cfg.concurrentUsers * tokens / 10; // target 10s full response
  }

  // Fire all three scenarios in parallel
  const results = await Promise.all(
    SCENARIOS.map((cfg) =>
      query(
        makeInferencePrompt(cfg),
        `${cfg.label} — ${cfg.concurrentUsers} users, ${interactionLabel(cfg)}`
      ).then((r) => ({ cfg, ...r }))
    )
  );

  // ── Full results ─────────────────────────────────────────────────────────
  for (const { cfg, result } of results) {
    const tps = peakTps(cfg).toLocaleString();
    console.log(`\n=== ${cfg.label}: ${cfg.concurrentUsers} users × ${interactionLabel(cfg)} (${tps} peak TPS) ===\n`);
    console.log(JSON.stringify(result, null, 2));
  }

  // ── Scaling comparison table ──────────────────────────────────────────────
  console.log("\n=== SCALING COMPARISON ===\n");

  const hdr = `${col("Scenario", 40)} ${col("Peak TPS", 11)}` +
    providers.map((p) => ` ${col(p.toUpperCase(), 5)}`).join("") +
    `  Instance type (AWS)`;
  console.log(hdr);
  console.log("─".repeat(hdr.length + 20));

  for (const { cfg, result } of results) {
    const tps   = peakTps(cfg);
    const label = `${cfg.label}: ${cfg.concurrentUsers} users, ${cfg.interactionType}`;
    const counts = providers.map((p) => col(result.recommendations[p]?.instance_count ?? "?", 6));
    const awsType = result.recommendations.aws?.instance_type ?? "?";
    console.log(`${col(label, 40)} ${col(tps.toLocaleString(), 11)}${counts.join("")}  ${awsType}`);
  }

  // ── Monotonic scaling check ───────────────────────────────────────────────
  console.log("\n=== SCALING VALIDATION ===\n");
  for (const p of providers) {
    const counts = results.map(({ result }) => result.recommendations[p]?.instance_count ?? 0);
    const isMonotonic = counts.every((c, i) => i === 0 || c >= counts[i - 1]);
    const arrow = counts.join(" → ");
    const verdict = isMonotonic ? "✓ monotonically increasing" : "✗ NOT monotonic — review sizing";
    console.log(`${col(p.toUpperCase(), 6)} ${arrow}  ${verdict}`);
  }

  // ── Per-scenario throughput math ──────────────────────────────────────────
  console.log("\n=== THROUGHPUT ANALYSIS PER SCENARIO ===\n");
  for (const { cfg, result } of results) {
    const ta = result.throughput_analysis;
    console.log(`${cfg.label} (${cfg.concurrentUsers} users × ${interactionLabel(cfg)})`);
    console.log(`  Required TPS : ${ta?.peak_tps_required?.toLocaleString() ?? "?"}`);
    console.log(`  TPS/instance : ${ta?.tps_per_instance?.toLocaleString() ?? "?"}`);
    console.log(`  Sizing       : ${ta?.sizing_rationale ?? "?"}`);
    console.log();
  }

  // ── Fleet cost table ──────────────────────────────────────────────────────
  console.log("\n=== FLEET COST TABLE ===\n");
  const fmtUSD = (n) => (n == null ? "     N/A" : `$${Number(n).toFixed(2).padStart(8)}`);
  const fHdr = `${col("Scenario", 32)} ${col("Provider", 8)} ${col("Instances", 10)} ${col("$/hr ea", 10)} ${col("Fleet $/hr", 12)} ${"Fleet $/mo"}`;
  console.log(fHdr);
  console.log("─".repeat(fHdr.length));
  for (const { cfg, result } of results) {
    const label = `${cfg.label}: ${cfg.concurrentUsers}u × ${cfg.interactionType}`;
    for (const p of providers) {
      const rec = result.recommendations[p];
      const n   = rec?.instances_needed;
      const hr  = rec?.hourly_cost_usd;
      const fhr = rec?.total_fleet_cost_per_hour;
      const fmo = rec?.total_fleet_cost_per_month;
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
