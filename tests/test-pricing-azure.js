// Stage 1: Azure Pricing API integration
// Public Retail Pricing API — no auth required
// Docs: https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices

const AZURE_PRICING_API = "https://prices.azure.com/api/retail/prices";
const REGION = "eastus";

// Fetch NC and ND GPU series separately — each fits in a single response page
const SERIES_FILTERS = ["_NC", "_ND"];

async function fetchSeries(seriesSubstring) {
  const filter = [
    `serviceName eq 'Virtual Machines'`,
    `armRegionName eq '${REGION}'`,
    `contains(armSkuName, '${seriesSubstring}')`,
  ].join(" and ");

  const url = `${AZURE_PRICING_API}?$filter=${encodeURIComponent(filter)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Azure pricing API returned HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.Items ?? [];
}

function isOnDemandLinux(item) {
  if (item.type !== "Consumption") return false;
  if (item.unitOfMeasure !== "1 Hour") return false;
  const sku = item.skuName ?? "";
  if (sku.includes("Windows")) return false;
  if (sku.includes("Spot")) return false;
  if (sku.includes("Low Priority")) return false;
  const product = item.productName ?? "";
  if (product.includes("Windows")) return false;
  return true;
}

// Infer GPU model from armSkuName — Azure pricing API doesn't include GPU specs
function inferGpuModel(armSkuName) {
  if (armSkuName.includes("H100")) return "H100";
  if (armSkuName.includes("A100_v4") || armSkuName.includes("A100v4")) return "A100 80GB";
  if (armSkuName.includes("_ND96asr")) return "A100 40GB";
  if (armSkuName.includes("_ND40rs")) return "V100 32GB";
  if (armSkuName.includes("RTXPRO") || armSkuName.includes("RTX")) return "RTX Pro 6000";
  if (armSkuName.includes("T4")) return "T4";
  if (/_NC\d.*_v3/.test(armSkuName)) return "V100 16GB";
  if (/_NC\d.*_v2/.test(armSkuName)) return "P100";
  if (/_ND\d.*_v2/.test(armSkuName)) return "V100 32GB";
  if (/_ND\d.*_v/.test(armSkuName)) return "A100";
  if (/_ND\d/.test(armSkuName)) return "P40";
  if (/_NC\d/.test(armSkuName)) return "K80";
  return "unknown";
}

function buildPricingMap(items) {
  const pricing = {};

  for (const item of items) {
    const key = item.armSkuName;
    if (!key) continue;

    const existing = pricing[key];
    // Keep the lowest on-demand price if there are duplicates
    if (!existing || item.retailPrice < existing.hourlyUSD) {
      pricing[key] = {
        armSkuName: item.armSkuName,
        skuName: item.skuName,
        gpuModel: inferGpuModel(item.armSkuName),
        hourlyUSD: item.retailPrice,
        monthlyUSD: Math.round(item.retailPrice * 730 * 100) / 100,
      };
    }
  }

  return pricing;
}

function printPricingTable(pricing) {
  const rows = Object.values(pricing).sort((a, b) => a.hourlyUSD - b.hourlyUSD);

  const col = {
    sku: 38,
    hourly: 10,
    monthly: 14,
    gpu: 14,
  };

  const header = [
    "ARM SKU Name".padEnd(col.sku),
    "$/hr".padEnd(col.hourly),
    "$/mo (730h)".padEnd(col.monthly),
    "GPU (inferred)",
  ].join("  ");

  console.log(header);
  console.log("-".repeat(header.length));

  for (const r of rows) {
    console.log(
      [
        r.armSkuName.padEnd(col.sku),
        `$${r.hourlyUSD.toFixed(3)}`.padEnd(col.hourly),
        `$${r.monthlyUSD.toFixed(2)}`.padEnd(col.monthly),
        r.gpuModel,
      ].join("  ")
    );
  }
}

async function main() {
  console.log("AIFA — Stage 1: Azure Pricing API Integration\n");
  console.log(`Fetching Azure VM pricing for NC and ND series in ${REGION}...\n`);

  const allItems = [];
  for (const series of SERIES_FILTERS) {
    const items = await fetchSeries(series);
    console.log(`  ${series.replace("_", "")} series: ${items.length} raw entries`);
    allItems.push(...items);
  }

  const onDemandLinux = allItems.filter(isOnDemandLinux);
  console.log(`\nFiltered to ${onDemandLinux.length} on-demand Linux entries\n`);

  const pricing = buildPricingMap(onDemandLinux);
  const instanceCount = Object.keys(pricing).length;

  console.log(`=== GPU INSTANCES — ${REGION} — On-Demand Linux ===\n`);

  if (instanceCount === 0) {
    console.log("No instances found. Check filters.");
    return;
  }

  printPricingTable(pricing);

  console.log(`\nFound ${instanceCount} GPU instance configurations`);
  console.log("Azure pricing API integration: PASS\n");

  return pricing;
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
