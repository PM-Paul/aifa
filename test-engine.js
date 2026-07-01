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

=== INFERENCE WORKLOAD RULES ===
GPU-optimal quantization — apply based on the GPU family you recommend:
  H100, A100 family  → BF16  (native BF16 Tensor Cores; no quality penalty vs FP16;
                               ~13GB weights for 13B, ~26GB for 13B at BF16)
  A10G, L4, T4       → INT8  (INT8 Tensor Cores; ~2× throughput vs FP16;
                               ~6.5GB weights for 13B INT8)
  B200, GB200        → FP8   (Transformer Engine FP8 via vLLM ≥0.5; ~2× vs BF16, ~4× vs FP16;
                               ~3.25GB weights for 13B FP8; supported on p6, ND B200 v6, a4)

Instance selection: prefer single-GPU instances for autoscaling granularity. \
Only use multi-GPU instances when a single GPU cannot meet TPS requirements.

Throughput sizing:
  1. peak_tps = concurrent_users × tokens_per_interaction / target_response_seconds
  2. tps_per_instance = GPU throughput for model size at selected precision (vLLM continuous batching)
  3. instance_count = ceil(peak_tps / tps_per_instance × 1.20)   [20% headroom]

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
      "instance_type": "...", "gpu_model": "...", "instance_count": 1,
      "quantization_applied": {
        "precision": "BF16|INT8|FP8",
        "effective_weight_gb": 0,
        "throughput_vs_fp16": "e.g. 2x (INT8) or 4x (FP8)"
      },
      "rationale": "...", "confidence": "high|medium|low"
    },
    "azure": {
      "instance_type": "...", "gpu_model": "...", "instance_count": 1,
      "quantization_applied": {
        "precision": "BF16|INT8|FP8",
        "effective_weight_gb": 0,
        "throughput_vs_fp16": "e.g. 2x (INT8) or 4x (FP8)"
      },
      "rationale": "...", "confidence": "high|medium|low"
    },
    "gcp": {
      "instance_type": "...", "gpu_model": "...", "instance_count": 1,
      "quantization_applied": {
        "precision": "BF16|INT8|FP8",
        "effective_weight_gb": 0,
        "throughput_vs_fp16": "e.g. 2x (INT8) or 4x (FP8)"
      },
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

  console.log("=== USAGE ===");
  for (const { cfg, usage } of results) {
    console.log(`${cfg.label}: input=${usage.input_tokens}, output=${usage.output_tokens}`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
