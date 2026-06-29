// AIFA — End-to-End Integration
// Workload description → AI recommendations → live pricing → multi-cloud comparison
//
// Pipeline:
//   Phase 1 (parallel): AI engine + AWS bulk pricing JSON + GCP component SKUs
//   Phase 2:            Extract recommended instance types from AI response
//   Phase 3 (parallel): AWS instance lookup + Azure targeted fetch + GCP computation
//   Phase 4:            Render comparison table

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const WORKLOAD = `We need to run inference on a 13 billion parameter model for a \
customer-facing chatbot. Expected load is 200 concurrent users with near real-time \
response requirements. No specific compliance requirements. Budget is moderate.`;

// ─── AI Engine ───────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a cloud infrastructure expert specializing in GPU compute for \
AI workloads. When given a workload description, recommend the optimal GPU instance type for \
running LLM inference on AWS, Azure, and GCP. Always respond with valid JSON only — no \
markdown, no prose, just the raw JSON object.`;

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

async function runAiEngine(workload) {
  const stream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(workload) }],
  });
  const message = await stream.finalMessage();
  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("AI engine returned no text block");
  const raw = textBlock.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  return { result: JSON.parse(raw), usage: message.usage };
}

// ─── AWS Pricing ─────────────────────────────────────────────────────────────

const AWS_PRICING_URL =
  "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/us-east-1/index.json";

async function fetchAwsPricingData() {
  const response = await fetch(AWS_PRICING_URL);
  if (!response.ok) throw new Error(`AWS pricing HTTP ${response.status}`);
  return response.json();
}

function lookupAwsPrice(data, instanceType) {
  for (const [sku, product] of Object.entries(data.products)) {
    const a = product.attributes;
    if (
      product.productFamily === "Compute Instance" &&
      a.instanceType === instanceType &&
      a.operatingSystem === "Linux" &&
      a.tenancy === "Shared" &&
      a.preInstalledSw === "NA"
    ) {
      const onDemand = data.terms?.OnDemand?.[sku];
      if (!onDemand) continue;
      for (const term of Object.values(onDemand)) {
        for (const dim of Object.values(term.priceDimensions)) {
          if (dim.unit === "Hrs") {
            const hourlyUSD = parseFloat(dim.pricePerUnit.USD);
            if (hourlyUSD > 0) return { hourlyUSD, vcpu: a.vcpu, memory: a.memory, gpu: a.gpu, gpuMemory: a.gpuMemory };
          }
        }
      }
    }
  }
  return null;
}

// ─── Azure Pricing ───────────────────────────────────────────────────────────

function normalizeAzureSkuName(raw) {
  const name = raw.startsWith("Standard_") ? raw : `Standard_${raw}`;
  // Strip anything after the first space or parenthesis
  return name.split(/[\s(,]/)[0].trim();
}

async function lookupAzurePrice(rawInstanceType) {
  const armSkuName = normalizeAzureSkuName(rawInstanceType);
  const filter = [
    `serviceName eq 'Virtual Machines'`,
    `armRegionName eq 'eastus'`,
    `armSkuName eq '${armSkuName}'`,
  ].join(" and ");

  const url = `https://prices.azure.com/api/retail/prices?$filter=${encodeURIComponent(filter)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Azure pricing HTTP ${response.status}`);
  const data = await response.json();

  const candidates = (data.Items ?? []).filter(
    (item) =>
      item.type === "Consumption" &&
      item.unitOfMeasure === "1 Hour" &&
      !item.skuName.includes("Spot") &&
      !item.skuName.includes("Windows") &&
      !item.skuName.includes("Low Priority")
  );
  if (candidates.length === 0) return null;
  const best = candidates.sort((a, b) => a.retailPrice - b.retailPrice)[0];
  return { hourlyUSD: best.retailPrice, armSkuName };
}

// ─── GCP Pricing ─────────────────────────────────────────────────────────────

const GCP_CE_SERVICE_ID = "6F81-5844-456A";

const GCP_SKU_PATTERNS = [
  { re: /^nvidia tesla a100 80gb gpu running in americas$/i,  key: "gpu_a100_80gb" },
  { re: /^nvidia tesla a100 gpu running in americas$/i,        key: "gpu_a100_40gb" },
  { re: /^nvidia h100 80gb gpu running in americas$/i,         key: "gpu_h100" },
  { re: /^nvidia l4 gpu running in americas$/i,                key: "gpu_l4" },
  { re: /^a2 instance core running in americas$/i,             key: "a2_core" },
  { re: /^a2 instance ram running in americas$/i,              key: "a2_ram" },
  { re: /^a3 instance core running in americas$/i,             key: "a3_core" },
  { re: /^a3 instance ram running in americas$/i,              key: "a3_ram" },
  { re: /^g2 instance core running in americas$/i,             key: "g2_core" },
  { re: /^g2 instance ram running in americas$/i,              key: "g2_ram" },
];

const GCP_FAMILY_COMPONENTS = {
  a2:      { coreKey: "a2_core", ramKey: "a2_ram" },
  a2ultra: { coreKey: "a2_core", ramKey: "a2_ram" },
  a3:      { coreKey: "a3_core", ramKey: "a3_ram" },
  g2:      { coreKey: "g2_core", ramKey: "g2_ram" },
};

const GCP_INSTANCE_SPECS = {
  "a2-highgpu-1g":  { vcpu: 12,  ramGb: 85,   gpus: 1,  gpuKey: "gpu_a100_40gb", family: "a2" },
  "a2-highgpu-2g":  { vcpu: 24,  ramGb: 170,  gpus: 2,  gpuKey: "gpu_a100_40gb", family: "a2" },
  "a2-highgpu-4g":  { vcpu: 48,  ramGb: 340,  gpus: 4,  gpuKey: "gpu_a100_40gb", family: "a2" },
  "a2-highgpu-8g":  { vcpu: 96,  ramGb: 680,  gpus: 8,  gpuKey: "gpu_a100_40gb", family: "a2" },
  "a2-megagpu-16g": { vcpu: 96,  ramGb: 1360, gpus: 16, gpuKey: "gpu_a100_40gb", family: "a2" },
  "a2-ultragpu-1g": { vcpu: 12,  ramGb: 170,  gpus: 1,  gpuKey: "gpu_a100_80gb", family: "a2ultra" },
  "a2-ultragpu-2g": { vcpu: 24,  ramGb: 340,  gpus: 2,  gpuKey: "gpu_a100_80gb", family: "a2ultra" },
  "a2-ultragpu-4g": { vcpu: 48,  ramGb: 680,  gpus: 4,  gpuKey: "gpu_a100_80gb", family: "a2ultra" },
  "a2-ultragpu-8g": { vcpu: 96,  ramGb: 1360, gpus: 8,  gpuKey: "gpu_a100_80gb", family: "a2ultra" },
  "a3-highgpu-1g":  { vcpu: 26,  ramGb: 234,  gpus: 1,  gpuKey: "gpu_h100",      family: "a3" },
  "a3-highgpu-2g":  { vcpu: 52,  ramGb: 468,  gpus: 2,  gpuKey: "gpu_h100",      family: "a3" },
  "a3-highgpu-4g":  { vcpu: 104, ramGb: 936,  gpus: 4,  gpuKey: "gpu_h100",      family: "a3" },
  "a3-highgpu-8g":  { vcpu: 208, ramGb: 1872, gpus: 8,  gpuKey: "gpu_h100",      family: "a3" },
  "g2-standard-4":  { vcpu: 4,   ramGb: 16,   gpus: 1,  gpuKey: "gpu_l4",        family: "g2" },
  "g2-standard-8":  { vcpu: 8,   ramGb: 32,   gpus: 1,  gpuKey: "gpu_l4",        family: "g2" },
  "g2-standard-12": { vcpu: 12,  ramGb: 48,   gpus: 1,  gpuKey: "gpu_l4",        family: "g2" },
  "g2-standard-16": { vcpu: 16,  ramGb: 64,   gpus: 1,  gpuKey: "gpu_l4",        family: "g2" },
  "g2-standard-24": { vcpu: 24,  ramGb: 96,   gpus: 2,  gpuKey: "gpu_l4",        family: "g2" },
  "g2-standard-32": { vcpu: 32,  ramGb: 128,  gpus: 2,  gpuKey: "gpu_l4",        family: "g2" },
  "g2-standard-48": { vcpu: 48,  ramGb: 192,  gpus: 4,  gpuKey: "gpu_l4",        family: "g2" },
  "g2-standard-96": { vcpu: 96,  ramGb: 384,  gpus: 8,  gpuKey: "gpu_l4",        family: "g2" },
};

function gcpSkuUnitPrice(sku) {
  const rate = sku.pricingInfo?.[0]?.pricingExpression?.tieredRates?.find(
    (r) => r.startUsageAmount === 0
  );
  if (!rate?.unitPrice) return null;
  const { units = "0", nanos = 0 } = rate.unitPrice;
  return parseFloat(units) + nanos / 1e9;
}

async function fetchGcpSkus() {
  const skus = [];
  let pageToken = "";
  let page = 0;
  const baseUrl =
    `https://cloudbilling.googleapis.com/v1/services/${GCP_CE_SERVICE_ID}/skus` +
    `?key=${process.env.GCP_API_KEY}&currencyCode=USD&pageSize=5000`;

  do {
    page++;
    process.stdout.write(`\r  GCP: fetching page ${page}...`);
    const url = pageToken ? `${baseUrl}&pageToken=${pageToken}` : baseUrl;
    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(`GCP API HTTP ${response.status}: ${body.error?.message ?? response.statusText}`);
    }
    const data = await response.json();
    skus.push(...(data.skus ?? []));
    pageToken = data.nextPageToken ?? "";
  } while (pageToken);

  process.stdout.write(`\r  GCP: ${skus.length.toLocaleString()} SKUs loaded        \n`);
  return skus;
}

function buildGcpComponentPrices(skus) {
  const prices = {};
  for (const sku of skus) {
    if (sku.category?.usageType !== "OnDemand") continue;
    const desc = sku.description ?? "";
    if (/dws|reserved|calendar mode/i.test(desc)) continue;
    for (const { re, key } of GCP_SKU_PATTERNS) {
      if (re.test(desc)) {
        const price = gcpSkuUnitPrice(sku);
        if (price != null && price > 0 && !(key in prices)) {
          prices[key] = price;
        }
        break;
      }
    }
  }
  return prices;
}

function lookupGcpPrice(componentPrices, instanceType) {
  const spec = GCP_INSTANCE_SPECS[instanceType];
  if (!spec) return null;
  const comp = GCP_FAMILY_COMPONENTS[spec.family];
  if (!comp) return null;
  const gpuPrice  = componentPrices[spec.gpuKey];
  const corePrice = componentPrices[comp.coreKey];
  const ramPrice  = componentPrices[comp.ramKey];
  if (gpuPrice == null || corePrice == null || ramPrice == null) return null;
  const hourlyUSD = spec.gpus * gpuPrice + spec.vcpu * corePrice + spec.ramGb * ramPrice;
  return { hourlyUSD };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cleanInstanceType(raw) {
  return (raw ?? "").split(/[\s(,]/)[0].trim();
}

function fmtUSD(hourlyUSD) {
  if (hourlyUSD == null) return { hourly: "N/A", monthly: "N/A" };
  const monthly = hourlyUSD * 730;
  return {
    hourly:  `$${hourlyUSD.toFixed(3)}/hr`,
    monthly: `$${monthly.toLocaleString("en-US", { maximumFractionDigits: 0 })}/mo`,
  };
}

function elapsed(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── Display ─────────────────────────────────────────────────────────────────

function printComparison(aiResult, prices) {
  const { aws, azure, gcp } = aiResult.recommendations;
  const W = 76;
  const bar = "═".repeat(W);

  console.log(`\n${bar}`);
  console.log(" AIFA — AI Factory Advisor  |  Multi-Cloud Cost Comparison");
  console.log(bar);

  console.log("\n WORKLOAD");
  console.log(` ${aiResult.workload_summary}\n`);

  // Comparison table
  const col = { provider: 7, instance: 32, gpu: 22, hourly: 11, monthly: 12 };
  const thead = [
    "Cloud".padEnd(col.provider),
    "Recommended Instance".padEnd(col.instance),
    "GPU".padEnd(col.gpu),
    "Hourly".padEnd(col.hourly),
    "Monthly (730h)",
  ].join("  ");

  console.log(" " + "─".repeat(W - 2));
  console.log(` ${thead}`);
  console.log(" " + "─".repeat(W - 2));

  const rows = [
    { label: "AWS",   rec: aws,   price: prices.aws },
    { label: "Azure", rec: azure, price: prices.azure },
    { label: "GCP",   rec: gcp,   price: prices.gcp },
  ];

  for (const { label, rec, price } of rows) {
    const instance = cleanInstanceType(rec.instance_type);
    const { hourly, monthly } = fmtUSD(price?.hourlyUSD);
    const row = [
      label.padEnd(col.provider),
      instance.padEnd(col.instance),
      rec.gpu_model.padEnd(col.gpu),
      hourly.padEnd(col.hourly),
      monthly,
    ].join("  ");
    console.log(` ${row}`);
  }

  console.log(" " + "─".repeat(W - 2));

  // Rationale
  console.log("\n RATIONALE");
  for (const { label, rec } of rows) {
    const instance = cleanInstanceType(rec.instance_type);
    console.log(`\n  ${label} — ${instance}  [confidence: ${rec.confidence}]`);
    // Word-wrap rationale at ~72 chars
    const words = rec.rationale.split(" ");
    let line = "  ";
    for (const word of words) {
      if (line.length + word.length + 1 > 74) {
        console.log(line);
        line = "    " + word;
      } else {
        line += (line.trim() ? " " : "") + word;
      }
    }
    if (line.trim()) console.log(line);
  }

  // Considerations
  console.log("\n CONSIDERATIONS");
  for (const c of aiResult.considerations) {
    console.log(`   • ${c}`);
  }

  console.log(`\n${bar}\n`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set in .env");
  if (!process.env.GCP_API_KEY)       throw new Error("GCP_API_KEY not set in .env");

  console.log("AIFA — End-to-End Pipeline\n");
  console.log(`Workload: "${WORKLOAD}"\n`);
  console.log("─".repeat(60));

  // ── Phase 1: AI engine + AWS + GCP data in parallel ──────────────────────
  console.log("\nPhase 1  Running AI engine and fetching pricing data...\n");
  const t1 = Date.now();

  const [aiData, awsData, gcpSkus] = await Promise.all([
    runAiEngine(WORKLOAD).then((r) => {
      console.log(`  AI engine: recommendations received  (${elapsed(Date.now() - t1)})  in: ${r.usage.input_tokens} / out: ${r.usage.output_tokens} tokens`);
      return r;
    }),
    fetchAwsPricingData().then((r) => {
      console.log(`  AWS:       ${Object.keys(r.products).length.toLocaleString()} products loaded  (${elapsed(Date.now() - t1)})`);
      return r;
    }),
    fetchGcpSkus(),   // prints its own progress line
  ]);

  // ── Phase 2: Extract instance types from AI recommendations ──────────────
  const aiResult = aiData.result;
  const { aws: awsRec, azure: azureRec, gcp: gcpRec } = aiResult.recommendations;
  const awsInstance   = cleanInstanceType(awsRec.instance_type);
  const azureInstance = cleanInstanceType(azureRec.instance_type);
  const gcpInstance   = cleanInstanceType(gcpRec.instance_type);

  console.log(`\nPhase 2  Instance types recommended by AI\n`);
  console.log(`  AWS:   ${awsInstance}  (${awsRec.gpu_model})`);
  console.log(`  Azure: ${azureInstance}  (${azureRec.gpu_model})`);
  console.log(`  GCP:   ${gcpInstance}  (${gcpRec.gpu_model})`);

  // ── Phase 3: Pricing lookups ──────────────────────────────────────────────
  console.log(`\nPhase 3  Looking up live pricing for recommended instances...\n`);
  const t3 = Date.now();

  const gcpComponentPrices = buildGcpComponentPrices(gcpSkus);

  const [awsPrice, azurePrice, gcpPrice] = await Promise.all([
    Promise.resolve(lookupAwsPrice(awsData, awsInstance)).then((r) => {
      console.log(`  AWS:   ${r ? `$${r.hourlyUSD.toFixed(3)}/hr` : "not found in pricing data"}`);
      return r;
    }),
    lookupAzurePrice(azureInstance).then((r) => {
      console.log(`  Azure: ${r ? `$${r.hourlyUSD.toFixed(3)}/hr` : "not found in pricing data"}  (${elapsed(Date.now() - t3)})`);
      return r;
    }),
    Promise.resolve(lookupGcpPrice(gcpComponentPrices, gcpInstance)).then((r) => {
      console.log(`  GCP:   ${r ? `$${r.hourlyUSD.toFixed(3)}/hr` : "not in local spec table — add to GCP_INSTANCE_SPECS"}`);
      return r;
    }),
  ]);

  // ── Phase 4: Render ───────────────────────────────────────────────────────
  printComparison(aiResult, { aws: awsPrice, azure: azurePrice, gcp: gcpPrice });

  const total = elapsed(Date.now() - t1);
  console.log(`Pipeline complete in ${total}\n`);
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
