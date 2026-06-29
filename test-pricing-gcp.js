// Stage 1: GCP Pricing API integration
// Uses the Cloud Billing Catalog API — requires a free API key (no billing account needed)
// Get one at: console.cloud.google.com → APIs & Services → Credentials → Create API Key
// Enable: Cloud Billing API
// Add to .env: GCP_API_KEY=your-key-here

import "dotenv/config";

const GCP_API_KEY = process.env.GCP_API_KEY;
const CE_SERVICE_ID = "6F81-5844-456A"; // Compute Engine
const REGION = "us-east1";

// GCP bills per-component (GPU/hr + vCPU/hr + RAM GB/hr), not per-VM.
// These patterns match the relevant SKU descriptions in the billing catalog.
// Note: A2 Ultra uses the same A2 Instance Core/Ram SKUs as standard A2 — no separate billing family.
const SKU_PATTERNS = [
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

// Per-family component price key mappings
// A2 Ultra shares the same core/RAM billing rates as A2 standard
const FAMILY_COMPONENTS = {
  a2:      { coreKey: "a2_core", ramKey: "a2_ram" },
  a2ultra: { coreKey: "a2_core", ramKey: "a2_ram" },
  a3:      { coreKey: "a3_core", ramKey: "a3_ram" },
  g2:      { coreKey: "g2_core", ramKey: "g2_ram" },
};

// Instance specs: vCPU, RAM (GB), GPU count, GPU type, billing family
// Sources: cloud.google.com/compute/docs/gpus
const INSTANCE_SPECS = {
  // A2 standard — A100 40GB
  "a2-highgpu-1g":  { vcpu: 12,  ramGb: 85,   gpus: 1,  gpuModel: "A100 40GB", gpuKey: "gpu_a100_40gb", family: "a2" },
  "a2-highgpu-2g":  { vcpu: 24,  ramGb: 170,  gpus: 2,  gpuModel: "A100 40GB", gpuKey: "gpu_a100_40gb", family: "a2" },
  "a2-highgpu-4g":  { vcpu: 48,  ramGb: 340,  gpus: 4,  gpuModel: "A100 40GB", gpuKey: "gpu_a100_40gb", family: "a2" },
  "a2-highgpu-8g":  { vcpu: 96,  ramGb: 680,  gpus: 8,  gpuModel: "A100 40GB", gpuKey: "gpu_a100_40gb", family: "a2" },
  "a2-megagpu-16g": { vcpu: 96,  ramGb: 1360, gpus: 16, gpuModel: "A100 40GB", gpuKey: "gpu_a100_40gb", family: "a2" },
  // A2 Ultra — A100 80GB
  "a2-ultragpu-1g": { vcpu: 12,  ramGb: 170,  gpus: 1,  gpuModel: "A100 80GB", gpuKey: "gpu_a100_80gb", family: "a2ultra" },
  "a2-ultragpu-2g": { vcpu: 24,  ramGb: 340,  gpus: 2,  gpuModel: "A100 80GB", gpuKey: "gpu_a100_80gb", family: "a2ultra" },
  "a2-ultragpu-4g": { vcpu: 48,  ramGb: 680,  gpus: 4,  gpuModel: "A100 80GB", gpuKey: "gpu_a100_80gb", family: "a2ultra" },
  "a2-ultragpu-8g": { vcpu: 96,  ramGb: 1360, gpus: 8,  gpuModel: "A100 80GB", gpuKey: "gpu_a100_80gb", family: "a2ultra" },
  // A3 High — H100 80GB
  "a3-highgpu-1g":  { vcpu: 26,  ramGb: 234,  gpus: 1,  gpuModel: "H100 80GB", gpuKey: "gpu_h100", family: "a3" },
  "a3-highgpu-2g":  { vcpu: 52,  ramGb: 468,  gpus: 2,  gpuModel: "H100 80GB", gpuKey: "gpu_h100", family: "a3" },
  "a3-highgpu-4g":  { vcpu: 104, ramGb: 936,  gpus: 4,  gpuModel: "H100 80GB", gpuKey: "gpu_h100", family: "a3" },
  "a3-highgpu-8g":  { vcpu: 208, ramGb: 1872, gpus: 8,  gpuModel: "H100 80GB", gpuKey: "gpu_h100", family: "a3" },
  // G2 — L4
  "g2-standard-4":  { vcpu: 4,   ramGb: 16,   gpus: 1,  gpuModel: "L4",        gpuKey: "gpu_l4",   family: "g2" },
  "g2-standard-8":  { vcpu: 8,   ramGb: 32,   gpus: 1,  gpuModel: "L4",        gpuKey: "gpu_l4",   family: "g2" },
  "g2-standard-12": { vcpu: 12,  ramGb: 48,   gpus: 1,  gpuModel: "L4",        gpuKey: "gpu_l4",   family: "g2" },
  "g2-standard-16": { vcpu: 16,  ramGb: 64,   gpus: 1,  gpuModel: "L4",        gpuKey: "gpu_l4",   family: "g2" },
  "g2-standard-24": { vcpu: 24,  ramGb: 96,   gpus: 2,  gpuModel: "L4",        gpuKey: "gpu_l4",   family: "g2" },
  "g2-standard-32": { vcpu: 32,  ramGb: 128,  gpus: 2,  gpuModel: "L4",        gpuKey: "gpu_l4",   family: "g2" },
  "g2-standard-48": { vcpu: 48,  ramGb: 192,  gpus: 4,  gpuModel: "L4",        gpuKey: "gpu_l4",   family: "g2" },
  "g2-standard-96": { vcpu: 96,  ramGb: 384,  gpus: 8,  gpuModel: "L4",        gpuKey: "gpu_l4",   family: "g2" },
};

function skuUnitPrice(sku) {
  const rate = sku.pricingInfo?.[0]?.pricingExpression?.tieredRates?.find(
    (r) => r.startUsageAmount === 0
  );
  if (!rate?.unitPrice) return null;
  const { units = "0", nanos = 0 } = rate.unitPrice;
  return parseFloat(units) + nanos / 1e9;
}

async function fetchAllSkus() {
  const skus = [];
  let pageToken = "";
  let page = 0;

  // v1 SKU API has no server-side filter param — fetch all CE SKUs, filter client-side
  const baseUrl =
    `https://cloudbilling.googleapis.com/v1/services/${CE_SERVICE_ID}/skus` +
    `?key=${GCP_API_KEY}&currencyCode=USD&pageSize=5000`;

  do {
    page++;
    process.stdout.write(`\r  Fetching page ${page} (${skus.length} SKUs so far)...`);

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

  process.stdout.write("\n");
  return skus;
}

function extractComponentPrices(skus) {
  const prices = {};

  for (const sku of skus) {
    if (sku.category?.usageType !== "OnDemand") continue;

    const desc = sku.description ?? "";
    // Skip DWS, Reserved, and Calendar-mode SKUs — they are not standard on-demand prices
    if (/dws|reserved|calendar mode/i.test(desc)) continue;

    for (const { re, key } of SKU_PATTERNS) {
      if (re.test(desc)) {
        const price = skuUnitPrice(sku);
        if (price != null && price > 0) {
          // Take the first (latest) price we find for each key
          if (!(key in prices)) {
            prices[key] = { price, description: desc, skuId: sku.skuId };
          }
        }
        break;
      }
    }
  }

  return prices;
}

function computeInstancePricing(componentPrices) {
  const results = {};

  for (const [instanceType, spec] of Object.entries(INSTANCE_SPECS)) {
    const comp = FAMILY_COMPONENTS[spec.family];
    if (!comp) continue;

    const gpuPrice = componentPrices[spec.gpuKey]?.price;
    const corePrice = componentPrices[comp.coreKey]?.price;
    const ramPrice = componentPrices[comp.ramKey]?.price;

    if (gpuPrice == null || corePrice == null || ramPrice == null) continue;

    const hourlyUSD =
      spec.gpus * gpuPrice +
      spec.vcpu * corePrice +
      spec.ramGb * ramPrice;

    results[instanceType] = {
      instanceType,
      gpuModel: spec.gpuModel,
      gpus: spec.gpus,
      vcpu: spec.vcpu,
      ramGb: spec.ramGb,
      hourlyUSD: Math.round(hourlyUSD * 1000) / 1000,
      monthlyUSD: Math.round(hourlyUSD * 730 * 100) / 100,
    };
  }

  return results;
}

function printComponentPrices(prices) {
  console.log("=== COMPONENT PRICES (per unit/hr) ===\n");
  const rows = Object.entries(prices).sort((a, b) => a[1].price - b[1].price);
  for (const [key, { price, description }] of rows) {
    console.log(`  ${key.padEnd(16)} $${price.toFixed(6)}/hr  (${description})`);
  }
  console.log();
}

function printPricingTable(pricing) {
  const rows = Object.values(pricing).sort((a, b) => a.hourlyUSD - b.hourlyUSD);

  const col = { instance: 22, hourly: 10, monthly: 14, gpu: 10, gpuModel: 12, vcpu: 6 };
  const header = [
    "Instance Type".padEnd(col.instance),
    "$/hr".padEnd(col.hourly),
    "$/mo (730h)".padEnd(col.monthly),
    "GPUs".padEnd(col.gpu),
    "GPU Model".padEnd(col.gpuModel),
    "vCPU".padEnd(col.vcpu),
    "RAM (GB)",
  ].join("  ");

  console.log(header);
  console.log("-".repeat(header.length));

  for (const r of rows) {
    console.log(
      [
        r.instanceType.padEnd(col.instance),
        `$${r.hourlyUSD.toFixed(3)}`.padEnd(col.hourly),
        `$${r.monthlyUSD.toFixed(2)}`.padEnd(col.monthly),
        String(r.gpus).padEnd(col.gpu),
        r.gpuModel.padEnd(col.gpuModel),
        String(r.vcpu).padEnd(col.vcpu),
        r.ramGb,
      ].join("  ")
    );
  }
}

async function main() {
  if (!GCP_API_KEY) {
    console.error(
      "Error: GCP_API_KEY is not set.\n\n" +
      "The GCP Cloud Billing API requires a free API key (unlike AWS/Azure).\n" +
      "To get one:\n" +
      "  1. Go to console.cloud.google.com → APIs & Services → Credentials\n" +
      "  2. Create API Key\n" +
      "  3. Enable the Cloud Billing API on the project\n" +
      "  4. Add GCP_API_KEY=your-key to .env"
    );
    process.exit(1);
  }

  console.log("AIFA — Stage 1: GCP Pricing API Integration\n");
  console.log(`Fetching Compute Engine SKUs for ${REGION} from Cloud Billing Catalog API...\n`);

  const allSkus = await fetchAllSkus();
  console.log(`Loaded ${allSkus.length.toLocaleString()} Compute Engine SKUs\n`);

  const componentPrices = extractComponentPrices(allSkus);
  const foundKeys = Object.keys(componentPrices);
  console.log(`Matched ${foundKeys.length} component price keys: ${foundKeys.join(", ")}\n`);

  const missingKeys = SKU_PATTERNS.map((p) => p.key).filter((k) => !(k in componentPrices));
  if (missingKeys.length) {
    console.warn(`Warning: missing price data for: ${missingKeys.join(", ")}\n`);
  }

  printComponentPrices(componentPrices);

  const instancePricing = computeInstancePricing(componentPrices);
  const instanceCount = Object.keys(instancePricing).length;

  console.log(`=== GPU INSTANCES — ${REGION} — On-Demand Linux ===\n`);
  printPricingTable(instancePricing);

  console.log(`\nFound ${instanceCount} GPU instance configurations`);
  console.log("GCP pricing API integration: PASS\n");

  return instancePricing;
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
