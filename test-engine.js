import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const WORKLOAD = `We're launching a new consumer AI app that generates personalized workout plans. \
We expect very uneven usage — quiet overnight, moderate during lunch, and peak traffic during \
morning and evening hours with up to 10x the average load. We're a startup, so minimizing \
baseline costs matters, but we can't afford performance degradation during peaks. The model \
is 13 billion parameters. No compliance requirements.`;

const SYSTEM_PROMPT = `You are a cloud infrastructure expert specializing in GPU compute for \
AI workloads. When given a workload description, recommend the optimal GPU instance type for \
running LLM inference on AWS, Azure, and GCP. Always respond with valid JSON only — no \
markdown, no prose, just the raw JSON object.`;

const USER_PROMPT = `Analyze this AI inference workload and recommend the best GPU instance \
for each cloud provider:

${WORKLOAD}

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

async function main() {
  console.log("AIFA — AI Factory Advisor\n");
  console.log("Workload:", WORKLOAD, "\n");
  console.log("Querying Claude for GPU recommendations...\n");

  const stream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: USER_PROMPT }],
  });

  const message = await stream.finalMessage();

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in response");
  }

  const raw = textBlock.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const result = JSON.parse(raw);

  console.log("=== RECOMMENDATIONS ===\n");
  console.log(JSON.stringify(result, null, 2));

  console.log("\n=== USAGE ===");
  console.log(`Input tokens:  ${message.usage.input_tokens}`);
  console.log(`Output tokens: ${message.usage.output_tokens}`);

  return result;
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
