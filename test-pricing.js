// Stage 1: AWS Pricing API integration
// Public bulk pricing API — no auth required
// Docs: https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/price-changes.html

const REGION = "us-east-1";
const PRICING_URL = `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/${REGION}/index.json`;

// GPU instance families relevant to AI inference workloads
const GPU_INSTANCE_PREFIXES = ["g4dn.", "g5.", "g6.", "p3.", "p4d.", "p5."];

async function fetchAwsEc2Pricing() {
  console.log(`Fetching AWS EC2 pricing for ${REGION}...`);
  console.log("(Large file ~50MB — may take a few seconds)\n");

  const response = await fetch(PRICING_URL);
  if (!response.ok) {
    throw new Error(`AWS pricing API returned HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

function isGpuInstance(instanceType) {
  return GPU_INSTANCE_PREFIXES.some((prefix) => instanceType.startsWith(prefix));
}

function extractGpuPricing(data) {
  const pricing = {};

  for (const [sku, product] of Object.entries(data.products)) {
    const attrs = product.attributes;
    if (
      product.productFamily !== "Compute Instance" ||
      !attrs.instanceType ||
      !isGpuInstance(attrs.instanceType) ||
      attrs.operatingSystem !== "Linux" ||
      attrs.tenancy !== "Shared" ||
      attrs.preInstalledSw !== "NA"
    ) {
      continue;
    }

    const onDemandTerms = data.terms?.OnDemand?.[sku];
    if (!onDemandTerms) continue;

    for (const term of Object.values(onDemandTerms)) {
      for (const dim of Object.values(term.priceDimensions)) {
        if (dim.unit !== "Hrs") continue;
        const hourlyUSD = parseFloat(dim.pricePerUnit.USD);
        if (hourlyUSD === 0) continue; // skip free/placeholder entries

        const existing = pricing[attrs.instanceType];
        if (!existing || hourlyUSD < existing.hourlyUSD) {
          pricing[attrs.instanceType] = {
            instanceType: attrs.instanceType,
            gpu: attrs.gpu ?? "unknown",
            gpuMemory: attrs.gpuMemory ?? "unknown",
            vcpu: attrs.vcpu,
            memory: attrs.memory,
            networkPerformance: attrs.networkPerformance,
            hourlyUSD,
            monthlyUSD: Math.round(hourlyUSD * 730 * 100) / 100,
          };
        }
      }
    }
  }

  return pricing;
}

function printPricingTable(pricing) {
  const rows = Object.values(pricing).sort((a, b) => a.hourlyUSD - b.hourlyUSD);

  const col = {
    instance: 22,
    hourly: 10,
    monthly: 12,
    gpu: 5,
    gpuMem: 12,
    vcpu: 6,
    mem: 12,
  };

  const header = [
    "Instance Type".padEnd(col.instance),
    "$/hr".padEnd(col.hourly),
    "$/mo (730h)".padEnd(col.monthly),
    "GPUs".padEnd(col.gpu),
    "GPU Mem".padEnd(col.gpuMem),
    "vCPU".padEnd(col.vcpu),
    "RAM",
  ].join("  ");

  console.log(header);
  console.log("-".repeat(header.length));

  for (const r of rows) {
    console.log(
      [
        r.instanceType.padEnd(col.instance),
        `$${r.hourlyUSD.toFixed(3)}`.padEnd(col.hourly),
        `$${r.monthlyUSD.toFixed(2)}`.padEnd(col.monthly),
        r.gpu.padEnd(col.gpu),
        r.gpuMemory.padEnd(col.gpuMem),
        r.vcpu.padEnd(col.vcpu),
        r.memory,
      ].join("  ")
    );
  }
}

async function main() {
  console.log("AIFA — Stage 1: AWS Pricing API Integration\n");

  const data = await fetchAwsEc2Pricing();

  const totalProducts = Object.keys(data.products).length;
  console.log(`Loaded ${totalProducts.toLocaleString()} products from AWS pricing API\n`);

  const gpuPricing = extractGpuPricing(data);
  const instanceCount = Object.keys(gpuPricing).length;

  console.log(`=== GPU INSTANCES — ${REGION} — On-Demand Linux ===\n`);

  if (instanceCount === 0) {
    console.log("No GPU instances found. Check instance prefix filters.");
    return;
  }

  printPricingTable(gpuPricing);

  console.log(`\nFound ${instanceCount} GPU instance configurations`);
  console.log("AWS pricing API integration: PASS\n");

  return gpuPricing;
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
