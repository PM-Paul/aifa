// DR-007: AIFA Regression Validation Suite
// Formal test cases for the AI recommendation engine.
// Runs live against Claude — requires ANTHROPIC_API_KEY in .env.
// Exit code 0 = all pass, 1 = one or more failures.

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ---------------------------------------------------------------------------
// GPU tier hierarchy — a recommendation satisfies the expected tier if it is
// at or above that tier (over-provisioning is acceptable; under is a failure).
// A10G is its own tier, distinct from A100: they are not interchangeable, so
// an A10G-class recommendation does NOT satisfy an A100-class expectation.
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
// The 4 validated test cases (DR-007)
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
    // At this scale one GPU is enough; any tier ≥ T4 is correct.
    expectedGpuTier: "T4-class",
    expectedConsiderationKeywords: ["scal", "cost"],
    minConsiderationMatches: 2,
  },
  {
    id: "TC-006",
    name: "Scaling S2 — 200 concurrent users, Conversational",
    workload: `We're deploying a 13 billion parameter conversational AI app with a peak load of \
200 concurrent users. Each interaction averages 750 tokens. Traffic swings 10x between \
off-peak and peak hours. We need near real-time responses (under 10 seconds full response) \
and cost-efficient autoscaling. No compliance requirements.`,
    // 200 concurrent users exceeds T4/A10G KV-cache capacity at reasonable replica counts —
    // verified by single-run probe: all 3 providers independently selected A100-class.
    expectedGpuTier: "A100-class",
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
    // Large scale; engine should recommend A100-class (A10G/A100) or above.
    expectedGpuTier: "A100-class",
    expectedConsiderationKeywords: ["scal", "throughput", "instance", "concurr"],
    minConsiderationMatches: 2,
  },
];

// ---------------------------------------------------------------------------
// Engine — identical call shape to test-engine.js
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are a cloud infrastructure expert specializing in GPU compute for \
AI workloads. When given a workload description, recommend the optimal GPU instance type for \
running LLM inference on AWS, Azure, and GCP.

GPU TIER SELECTION — H100 vs A100: Do not select an H100-class GPU when A100-class is \
sufficient. A100-class (80GB) is sufficient whenever the model's VRAM footprint at the \
selected precision/quantization fits within a single A100 80GB GPU as a single-GPU replica — \
i.e. no tensor parallelism is required just to hold the model in memory. Only select \
H100-class when either (a) the model does not fit in a single A100 80GB GPU and would require \
multi-GPU tensor parallelism to hold the weights, or (b) the workload's specific throughput or \
latency requirements genuinely cannot be met by A100 at any reasonable replica count. \
Selecting H100 "for headroom," "for future scale," or because it is the newest/fastest option \
is not acceptable when A100 already satisfies the VRAM and throughput requirements — the \
choice must be justified by an actual capability gap, not a preference for more powerful \
hardware.

Always respond with valid JSON only — no markdown, no prose, just the raw JSON object.`;

function buildUserPrompt(workload) {
  return `Analyze this AI inference workload and recommend the best GPU instance \
for each cloud provider:

${workload}

Respond with this exact JSON structure:
{
  "workload_summary": "brief description of the workload requirements",
  "recommendations": {
    "aws": {
      "instance_type": "e.g. p4d.24xlarge",
      "gpu_model": "e.g. NVIDIA A100",
      "rationale": "why this instance fits the workload",
      "confidence": "high|medium|low"
    },
    "azure": {
      "instance_type": "e.g. Standard_ND96asr_v4",
      "gpu_model": "e.g. NVIDIA A100",
      "rationale": "why this instance fits the workload",
      "confidence": "high|medium|low"
    },
    "gcp": {
      "instance_type": "e.g. a2-highgpu-8g",
      "gpu_model": "e.g. NVIDIA A100",
      "rationale": "why this instance fits the workload",
      "confidence": "high|medium|low"
    }
  },
  "considerations": ["list of important factors like data residency, scaling, cost"]
}`;
}

async function runEngine(workload) {
  const stream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(workload) }],
  });

  const message = await stream.finalMessage();
  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("No text block in response");

  const raw = textBlock.text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "");
  return { result: JSON.parse(raw), usage: message.usage };
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------
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
    if (!gpuTierPasses(rec.gpu_model, tc.expectedGpuTier)) {
      const actual = resolveGpuTier(rec.gpu_model);
      failures.push(
        `${provider}: "${rec.gpu_model}" is ${actual?.name ?? "unknown tier"} — ` +
        `expected at least ${tc.expectedGpuTier}`
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
    const { result, usage } = await runEngine(tc.workload);
    const failures = validateTestCase(tc, result);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    return { tc, result, failures, usage, elapsed, error: null };
  } catch (err) {
    return { tc, result: null, failures: [], usage: null, elapsed: null, error: err };
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
