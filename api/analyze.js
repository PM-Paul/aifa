// Vercel serverless function — receives the workload description + pre-computed sizing
// block from the browser, calls the Anthropic API and all three cloud pricing APIs
// server-side (ANTHROPIC_API_KEY / GCP_API_KEY never reach the client), and returns the
// combined recommendation + pricing in one response.

import Anthropic from '@anthropic-ai/sdk';
import { PricingClient, GetProductsCommand } from '@aws-sdk/client-pricing';
import { Redis } from '@upstash/redis';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Rate Limiting ────────────────────────────────────────────────────────────────
// 10 assessments per IP per rolling 24h window, backed by Upstash Redis. Each key is
// created with a 24h TTL on its first hit so it auto-expires and the limit resets
// daily without a cron job. Fails open (allows the request but logs) if Redis itself
// is unreachable — a Redis outage shouldn't take down the whole app.
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_SECONDS = 24 * 60 * 60;

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}

async function checkRateLimit(ip) {
  const key = `ratelimit:analyze:${ip}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    return count <= RATE_LIMIT_MAX;
  } catch (err) {
    console.error(`[AIFA] Rate limit check failed for ${ip}, failing open:`, err.message);
    return true;
  }
}

const SYSTEM_PROMPT = [
  'You are a cloud infrastructure advisor specializing in GPU compute for AI workloads.',
  '',
  'A PRE-COMPUTED SIZING block appears at the start of the user message. All VRAM, quantization,',
  'TPS, fleet-sizing, and instance selection math has already been performed in JavaScript before',
  'this request was sent — use those values directly, do not recalculate any of them and do not',
  'select different instances. The block\'s "Pre-selected instances" list gives you the exact SKU',
  'to use for each provider. Your job is to explain why the pre-computed instances were selected',
  'and surface relevant considerations — not to choose hardware yourself. When the block says',
  'sizing or an instance is not available (no parameter count was provided, the model needs tensor',
  'parallelism beyond a single GPU, or a provider has no pre-selected instance for this tier/',
  'workload combination), reason about sizing and instance choice yourself from the workload',
  'description, and state explicitly that you are overriding the pre-computed selection.',
  '',
  'CRITICAL: The PRE-COMPUTED SIZING block is authoritative, including the specific instance SKUs',
  'under "Pre-selected instances." Use those exact instances. Do not select a different GPU family',
  'or instance size regardless of catalog options. Only override when the block itself says an',
  'instance is not available for a provider — a genuine edge case, and even then you must state',
  'explicitly that you are overriding the pre-computed selection and explain why.',
  '',
  'Follow these rules strictly:',
  '1. PRIMARY: For each provider, use the specific instance/SKU given in the PRE-COMPUTED SIZING block\'s "Pre-selected instances" list directly (or, when no pre-computed instance is available for that provider, your own VRAM/latency/throughput reasoning — state explicitly that you are overriding). Hardware differs across providers by design — AWS may use A10G/L4 (g5/g6) where Azure/GCP use A100 for the same workload; that is expected, not something to reconcile. Price must never influence which instance is selected; price is only used afterward to calculate cost.',
  '2. EQUIVALENT (optional): If your primary for a provider uses meaningfully different GPU hardware than the other providers\' primaries (e.g. A10G vs A100-80GB), add an equivalent_instance field showing the strict hardware-equivalent option and a one-sentence explanation of why the primary is the better value.',
  '3. Write the pre-computed VRAM figure and selected GPU tier into the gpu_tier field (e.g. "15.6GB required — L4/A10G tier (24GB)"). When no pre-computed block is available, state your own VRAM estimate and reasoning there instead.',
  '4. AWS over-provisioning: when the pre-computed (or your own) replicas_per_instance is 3 or more, add a replica_info object to the aws recommendation: { "replica_count": N, "model_vram_gb": X, "instance_vram_gb": Y }, using the pre-computed VRAM figures. In the aws rationale, explain that the effective per-replica cost drops significantly at scale and that multi-replica deployment on a single over-provisioned instance is the standard production pattern for AWS in this case.',
  '5. HIGH-SPEED INTERCONNECT: Multi-GPU training and tensor-parallel inference both require',
  '   NVLink (InfiniBand on Azure) between GPUs. The PRE-COMPUTED SIZING block\'s pre-selected',
  '   instances already account for this via nvlinkRequired — when true for a provider, include',
  '   this exact disclosure in that provider\'s rationale (substitute NVLink/InfiniBand and',
  '   training/inference as appropriate): "This instance includes [NVLink/InfiniBand] high-speed',
  '   GPU interconnect, required for efficient multi-GPU [training/inference]. Without it,',
  '   inter-GPU communication becomes a bottleneck that severely limits throughput and increases',
  '   latency." When no pre-computed instance is available and you must reason about a multi-GPU',
  '   case yourself: AWS never g5 (no NVLink) — use p4d.24xlarge/p4de.24xlarge/p5.48xlarge; Azure',
  '   never NV-series — use an ND-series or multi-GPU NC-series SKU; GCP use A2/A3 family',
  '   (a2-highgpu-*/a3-highgpu-8g).',
  '6. PROVIDER PRICING: hourly_cost_usd is always your job — the pre-computed sizing above never',
  '   includes price. Price must never influence which instance is selected, only fleet cost',
  '   afterward.',
  '   AWS INSTANCE PRICES (us-east-1, on-demand Linux) — server-verified, not an estimate; use',
  '   these exact values with high confidence (the server independently confirms and can override',
  '   this figure at render time via a live pricing lookup, so treat every SKU below as pinned):',
  '     g5.xlarge   (1×A10G  24 GB):  $1.006/hr',
  '     g5.2xlarge  (1×A10G  24 GB):  $1.212/hr',
  '     g5.4xlarge  (1×A10G  24 GB):  $1.624/hr',
  '     g5.12xlarge (4×A10G  96 GB):  $5.672/hr',
  '     g5.48xlarge (8×A10G 192 GB): $16.288/hr',
  '     g6.xlarge   (1×L4  24 GB):  $0.8048/hr',
  '     g6.12xlarge (4×L4  96 GB):  $4.6016/hr',
  '     g6.48xlarge (8×L4 192 GB): $13.3504/hr',
  '     p4d.24xlarge  (8×A100 40GB, NVLink + EFA): $21.958/hr',
  '     p4de.24xlarge (8×A100 80GB, NVLink + EFA): $27.447/hr',
  '     p5.48xlarge   (8×H100 80GB SXM5, NVLink + EFA): $55.040/hr',
  '     Any other AWS instance type (a genuine no-precompute override case) is unpinned — estimate',
  '     hourly_cost_usd via accurate training-data pricing (medium confidence): a specific number,',
  '     never null or a range.',
  '   AZURE INSTANCE PRICES (eastus, on-demand Linux) — use exact values; never estimate:',
  '     Standard_NC24ads_A100_v4 (1×A100  80 GB): $3.673/hr',
  '     Standard_NC48ads_A100_v4 (2×A100  80 GB): $7.346/hr',
  '     Standard_ND96isr_H100_v5 (8×H100  80 GB): $98.32/hr',
  '     Standard_ND96asr_A100_v4 (8×A100  40 GB) is unpinned — estimate via training-data pricing,',
  '     a specific number, never null or a range.',
  '     NEVER recommend an NV-series SKU (Standard_NV6ads_A10_v5, Standard_NV36ads_A10_v5) for',
  '     Azure under any circumstance — already excluded by the pre-computed selection, but this is',
  '     a hard safety constraint even in the no-precompute fallback case.',
  '     CATALOG GAP DISCLOSURE: whenever the PRE-COMPUTED SIZING block includes an "Azure',
  '     substitute" line, append this exact sentence to the Azure rationale: "Note: Azure does not',
  '     offer a cost-competitive L4 or A10G-class inference instance after excluding NV series.',
  '     NC24ads_A100_v4 is Azure\'s minimum approved inference configuration and may be',
  '     over-provisioned for small workloads — AWS G6 or GCP G2 offer equivalent throughput at',
  '     significantly lower cost for this workload size."',
  '   GCP NEW/UNPRICED GPU FAMILIES:',
  '     G4 family (RTX PRO 6000, 96 GB VRAM): pricing not yet in the public GCP Cloud Billing API',
  '     — still surface it when it\'s the right recommendation (30B-class that doesn\'t need an',
  '     A100), set hourly_cost_usd to null, and add "Contact GCP for current G4 pricing" as its',
  '     own consideration entry. Do NOT fabricate a price.',
  '     A4X family (GB200 NVL72): reserved-capacity only, not on-demand — never recommend as a',
  '     primary or equivalent_instance; mention only in "considerations" for frontier-scale (100B+)',
  '     workloads, noting reserved capacity must be arranged with GCP sales ahead of time.',
  '   COST CALCULATION (after selection, never influencing it):',
  '   a. hourly_cost_usd = price for the exact instance selected. AWS and Azure: use the tables',
  '      above, never estimate. Unpinned families: a specific training-data estimate — never null,',
  '      except GCP G4/A4X above, where no market rate exists at all.',
  '   b. total_fleet_cost_per_hour = instances_needed × hourly_cost_usd',
  '   c. CRITICAL: hourly_cost_usd in the JSON MUST equal the price stated in the rationale —',
  '      always. instances_needed MUST equal the pre-computed value (or Azure substitute value) —',
  '      never let the rationale explain away or override it (e.g. "one instance is sufficient',
  '      because of the available headroom" is NEVER valid reasoning).',
  '   d. Return instances_needed and replicas_per_instance in each provider recommendation,',
  '      copied from the PRE-COMPUTED SIZING block (or its Azure substitute for Azure).',
  '   e. Omit fleet fields entirely when the PRE-COMPUTED SIZING block has no instances_needed',
  '      value (no concurrency data was provided).',
  '7. BOUNDARY CONDITIONS: when the PRE-COMPUTED SIZING block\'s boundary condition is true, add a',
  '   consideration presenting BOTH the selected tier and the next-tier alternative (or Azure',
  '   substitute, when that is what triggered it) as options, with a one-line fleet cost',
  '   comparison between them, so the user can choose based on their own cost/simplicity',
  '   tradeoff — do not silently pick one over the other.',
  '8. SKIPPED-INPUT DISCLOSURE: whenever a required input is missing from the workload (e.g.',
  '   concurrent users, interaction length/token count, model parameter count, or latency target),',
  '   add an entry to "considerations" stating explicitly what default value was assumed in its',
  '   place, and how the recommendation would change under a different input value.',
  '   GENERIC ESTIMATION CAVEATS — DO NOT ADD TO "considerations": general estimation-methodology',
  '   caveats (GPU utilization/MFU assumptions, VRAM overhead assumptions, serving-framework',
  '   assumptions, TPS-reference-value caveats, or region/pricing caveats) are already shown once,',
  '   statically, in the UI — never add an entry restating any of these in "considerations". Only',
  '   include considerations that are specific to this workload or recommendation (e.g. MoE',
  '   active-parameter notes, NVLink/InfiniBand interconnect requirements, TTFT/latency risk',
  '   warnings, catalog-gap disclosures, boundary-condition options, or the skipped-input',
  '   disclosure above).',
  '9. ABSOLUTE CONSISTENCY RULE: instances_needed in the JSON output MUST equal the final',
  '   instances_needed value derived in the rationale — no exceptions. If your rationale works',
  '   through multiple candidate numbers before reaching a final answer, the JSON field must match',
  '   ONLY the final number the rationale concludes with — never an intermediate value, and never',
  '   a different number than what the rationale states. Before finalizing your response, re-read',
  '   each provider\'s rationale, identify the number it concludes with, and confirm that',
  '   provider\'s instances_needed JSON field is IDENTICAL to it. A mismatch between the JSON',
  '   field and the rationale\'s concluding number is never acceptable, regardless of how the',
  '   discrepancy arose.',
  '10. Respond with valid JSON only — no markdown, no prose, just the raw JSON object.',
].join('\n');

function buildUserPrompt(workload, sizingBlock, correction = '') {
  return [
    sizingBlock,
    '',
    'Analyze this AI workload and recommend one GPU instance per cloud provider.',
    '',
    ...(correction ? [correction, ''] : []),
    workload,
    '',
    'Instructions:',
    '- For each provider, choose the specific instance/SKU that matches the pre-computed GPU tier above (or, when sizing is not available, your own VRAM/latency/throughput reasoning). Providers may use different hardware.',
    '- Add equivalent_instance when a provider\'s primary uses a different GPU tier than the other two providers\' primaries.',
    '- Omit equivalent_instance entirely if all providers\' primaries use the same GPU tier.',
    '',
    'Respond with this exact JSON:',
    '{',
    '  "workload_summary": "one sentence describing the key requirements",',
    '  "gpu_tier": "minimum capability tier and one-sentence justification",',
    '  "recommendations": {',
    '    "aws":   { "instance_type": "primary instance type", "gpu_model": "primary GPU model", "instances_needed": 1, "replicas_per_instance": 1, "rationale": "...", "confidence": "high|medium|low", "replica_info": { "replica_count": 12, "model_vram_gb": 50, "instance_vram_gb": 640 }, "equivalent_instance": { "instance_type": "strict hardware-equivalent", "gpu_model": "GPU model", "note": "why primary is better value" } },',
    '    "azure": { "instance_type": "e.g. Standard_NC24ads_A100_v4", "gpu_model": "e.g. NVIDIA A100 80GB", "instances_needed": 1, "replicas_per_instance": 1, "rationale": "...", "confidence": "high|medium|low" },',
    '    "gcp":   { "instance_type": "e.g. a2-highgpu-2g",            "gpu_model": "e.g. NVIDIA A100 40GB", "instances_needed": 1, "replicas_per_instance": 1, "rationale": "...", "confidence": "high|medium|low" }',
    '  },',
    '  "considerations": ["..."]',
    '}',
  ].join('\n');
}

async function callAnthropic(workload, sizingBlock, maxTokens = 16000, correction = '') {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(workload, sizingBlock, correction) }],
  });
  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock) throw new Error('No text block in Anthropic response');
  const raw = textBlock.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try {
    return JSON.parse(raw);
  } catch (parseErr) {
    // Response was cut off mid-JSON because it hit the token ceiling — retry once
    // with double the budget rather than surfacing a confusing parse error.
    if (response.stop_reason === 'max_tokens' && maxTokens < 32000) {
      console.warn(`[AIFA] Response truncated at max_tokens=${maxTokens} — retrying with ${maxTokens * 2}`);
      return callAnthropic(workload, sizingBlock, maxTokens * 2, correction);
    }
    throw parseErr;
  }
}

// ── Blocked SKU detection & silent retry ────────────────────────────────────────
// The Azure NV-series restriction and the AWS g5/g6-for-training rule are enforced only via
// SYSTEM_PROMPT instructions — the model can still violate them. This is a code-side
// backstop: catch a violation before it reaches pricing/rendering and give the model
// one corrective retry rather than surfacing a broken recommendation to the user.
const BLOCKED_SKU_CORRECTION = 'IMPORTANT CORRECTION: Your previous response recommended a blocked instance. Azure NV-series (NV6ads, NV36ads) is never permitted for inference or training — use NC-series only. AWS g5/g6 family is never permitted for training — use p4d, p4de, or p5 only. Return corrected recommendations.';

function cleanInstanceType(raw) { return (raw ?? '').split(/[\s(,]/)[0].trim(); }

function detectBlockedSku(aiResult, workloadType) {
  const reasons = [];
  const azureInstance = cleanInstanceType(aiResult?.recommendations?.azure?.instance_type ?? '');
  const awsInstance    = cleanInstanceType(aiResult?.recommendations?.aws?.instance_type ?? '');
  if (/NV6ads|NV36ads/i.test(azureInstance)) {
    reasons.push(`Azure returned blocked NV-series instance: "${azureInstance}"`);
  }
  if (workloadType === 'Training' && /^g5\.|^g6\./i.test(awsInstance)) {
    reasons.push(`AWS returned blocked g5/g6 instance for a training workload: "${awsInstance}"`);
  }
  return reasons;
}

async function getAiRecommendation(workload, sizingBlock, workloadType) {
  let aiResult = await callAnthropic(workload, sizingBlock);
  let reasons  = detectBlockedSku(aiResult, workloadType);

  if (reasons.length) {
    console.warn('[AIFA] Blocked SKU detected in AI recommendation — retrying silently.', reasons);
    aiResult = await callAnthropic(workload, sizingBlock, 16000, BLOCKED_SKU_CORRECTION);
    reasons  = detectBlockedSku(aiResult, workloadType);
    if (reasons.length) {
      console.error('[AIFA] Blocked SKU still present after retry — giving up.', reasons);
      throw new Error('We had trouble generating a recommendation for this workload. Please try again.');
    }
    console.log('[AIFA] Retry resolved the blocked SKU(s).');
  }

  return aiResult;
}

// ── AWS Pricing ────────────────────────────────────────────────────────────────
// Live via the AWS Price List Query API (GetProducts), not the Bulk API: the bulk
// offer file (us-east-1 EC2 offers) is 50MB+ of JSON covering every instance/OS/
// tenancy combination, and downloading + parsing it in this serverless function's
// memory budget was causing OOM crashes in production. GetProducts supports
// server-side filters (instanceType, operatingSystem, tenancy, location, ...) so
// each request returns only the matching SKU — no bulk download. Requires
// AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY with pricing:GetProducts permission
// (picked up automatically by the SDK's default credential chain). The Pricing
// service only has endpoints in us-east-1 and ap-south-1, regardless of which
// region's prices you're querying — hence the hardcoded client region below.
const pricingClient = new PricingClient({ region: 'us-east-1' });

const AWS_LOCATION = 'US East (N. Virginia)'; // Price List API's display name for us-east-1

// Fallback if the live query API is unreachable or misconfigured (e.g. credentials
// not yet provisioned). selectInstance() in index.html only ever picks AWS instances
// from this exact set (g6.*/p4d/p4de/p5 pre-computed, g5.* as the AI's stated
// no-precompute fallback), so this covers every reachable case. Verified live against
// the AWS Price List API — re-verify periodically since it is not auto-refreshed.
const AWS_PINNED_PRICES = {
  'g5.xlarge':    { hourlyUSD: 1.006,  vcpu: '4',   memory: '16 GiB',   gpu: '1', gpuMemory: '24 GB' },
  'g5.2xlarge':   { hourlyUSD: 1.212,  vcpu: '8',   memory: '32 GiB',   gpu: '1', gpuMemory: '24 GB' },
  'g5.4xlarge':   { hourlyUSD: 1.624,  vcpu: '16',  memory: '64 GiB',   gpu: '1', gpuMemory: '24 GB' },
  'g5.12xlarge':  { hourlyUSD: 5.672,  vcpu: '48',  memory: '192 GiB',  gpu: '4', gpuMemory: '96 GB' },
  'g5.48xlarge':  { hourlyUSD: 16.288, vcpu: '192', memory: '768 GiB', gpu: '8', gpuMemory: '192 GB' },
  'g6.xlarge':    { hourlyUSD: 0.8048, vcpu: '4',   memory: '16 GiB',  gpu: '1', gpuMemory: '24 GB' },
  'g6.12xlarge':  { hourlyUSD: 4.6016, vcpu: '48',  memory: '192 GiB', gpu: '4', gpuMemory: '96 GB' },
  'g6.48xlarge':  { hourlyUSD: 13.3504, vcpu: '192', memory: '768 GiB', gpu: '8', gpuMemory: '192 GB' },
  'p4d.24xlarge': { hourlyUSD: 21.957642, vcpu: '96', memory: '1152 GiB', gpu: '8', gpuMemory: '320 GB HBM2' },
  'p4de.24xlarge':{ hourlyUSD: 27.44705,  vcpu: '96', memory: '1152 GiB', gpu: '8', gpuMemory: '640 GB HBM2e' },
  'p5.48xlarge':  { hourlyUSD: 55.04,     vcpu: '192', memory: '2048 GiB', gpu: '8', gpuMemory: '640 GB HBM3' },
};

// Reused across invocations while this function's container stays warm — avoids
// re-querying the same instance type multiple times per request (primary + equivalent)
// or across back-to-back requests.
const awsPriceCache = new Map();

function extractOnDemandHourly(productJson) {
  const product = JSON.parse(productJson);
  const a = product.product?.attributes ?? {};
  for (const term of Object.values(product.terms?.OnDemand ?? {})) {
    for (const dim of Object.values(term.priceDimensions ?? {})) {
      if (dim.unit === 'Hrs') {
        const price = parseFloat(dim.pricePerUnit?.USD ?? '0');
        if (price > 0) return { hourlyUSD: price, vcpu: a.vcpu, memory: a.memory, gpu: a.gpu, gpuMemory: a.gpuMemory };
      }
    }
  }
  return null;
}

async function fetchAwsPriceFromQueryApi(instanceType) {
  const command = new GetProductsCommand({
    ServiceCode: 'AmazonEC2',
    Filters: [
      { Type: 'TERM_MATCH', Field: 'instanceType', Value: instanceType },
      { Type: 'TERM_MATCH', Field: 'operatingSystem', Value: 'Linux' },
      { Type: 'TERM_MATCH', Field: 'tenancy', Value: 'Shared' },
      { Type: 'TERM_MATCH', Field: 'preInstalledSw', Value: 'NA' },
      { Type: 'TERM_MATCH', Field: 'capacitystatus', Value: 'Used' },
      { Type: 'TERM_MATCH', Field: 'location', Value: AWS_LOCATION },
    ],
    MaxResults: 5,
  });
  const result = await pricingClient.send(command);
  for (const productJson of result.PriceList ?? []) {
    const price = extractOnDemandHourly(productJson);
    if (price) return price;
  }
  return null;
}

async function lookupAwsPrice(instanceType) {
  if (!instanceType) return null;
  if (awsPriceCache.has(instanceType)) return awsPriceCache.get(instanceType);

  let price;
  try {
    price = await fetchAwsPriceFromQueryApi(instanceType);
    if (price) {
      console.log(`[AIFA] AWS Query API live price for ${instanceType}: $${price.hourlyUSD}/hr`);
    } else {
      console.warn(`[AIFA] AWS Query API returned no matching product for ${instanceType} — using pinned fallback`);
      price = AWS_PINNED_PRICES[instanceType] ?? null;
    }
  } catch (err) {
    console.error(`[AIFA] AWS Query API failed for ${instanceType} (${err.name}: ${err.message}) — using pinned fallback`);
    price = AWS_PINNED_PRICES[instanceType] ?? null;
  }

  awsPriceCache.set(instanceType, price);
  return price;
}

// ── Azure Pricing ──────────────────────────────────────────────────────────────
// Called directly, server-side — no CORS proxy needed here (serve.js's /api/azure-price
// proxy remains local-dev-only, for when index.html is opened without this function).
function normalizeAzureSkuName(raw) {
  const name = (raw ?? '').startsWith('Standard_') ? raw : `Standard_${raw}`;
  return name.split(/[\s(,]/)[0].trim();
}

async function lookupAzurePrice(rawInstanceType) {
  const armSkuName = normalizeAzureSkuName(rawInstanceType);
  const filter   = `serviceName eq 'Virtual Machines' and armRegionName eq 'eastus' and armSkuName eq '${armSkuName}'`;
  const azureUrl = `https://prices.azure.com/api/retail/prices?$filter=${encodeURIComponent(filter)}`;
  const r = await fetch(azureUrl);
  if (!r.ok) throw new Error(`Azure pricing HTTP ${r.status}`);
  const data = await r.json();
  const candidates = (data.Items ?? []).filter(item =>
    item.type === 'Consumption' && item.unitOfMeasure === '1 Hour' &&
    !item.skuName.includes('Spot') && !item.skuName.includes('Windows') && !item.skuName.includes('Low Priority')
  );
  if (!candidates.length) return null;
  const best = candidates.sort((a, b) => a.retailPrice - b.retailPrice)[0];
  return { hourlyUSD: best.retailPrice, armSkuName };
}

// ── GCP Pricing ────────────────────────────────────────────────────────────────
const GCP_CE_SERVICE_ID = '6F81-5844-456A';
const GCP_SKU_PATTERNS = [
  { re: /^nvidia tesla a100 80gb gpu running in americas$/i,  key: 'gpu_a100_80gb' },
  { re: /^nvidia tesla a100 gpu running in americas$/i,        key: 'gpu_a100_40gb' },
  { re: /^nvidia h100 80gb gpu running in americas$/i,         key: 'gpu_h100' },
  { re: /^nvidia l4 gpu running in americas$/i,                key: 'gpu_l4' },
  { re: /^a2 instance core running in americas$/i,             key: 'a2_core' },
  { re: /^a2 instance ram running in americas$/i,              key: 'a2_ram' },
  { re: /^a3 instance core running in americas$/i,             key: 'a3_core' },
  { re: /^a3 instance ram running in americas$/i,              key: 'a3_ram' },
  { re: /^g2 instance core running in americas$/i,             key: 'g2_core' },
  { re: /^g2 instance ram running in americas$/i,              key: 'g2_ram' },
];
const GCP_FAMILY_COMPONENTS = {
  a2:      { coreKey: 'a2_core', ramKey: 'a2_ram' },
  a2ultra: { coreKey: 'a2_core', ramKey: 'a2_ram' },
  a3:      { coreKey: 'a3_core', ramKey: 'a3_ram' },
  g2:      { coreKey: 'g2_core', ramKey: 'g2_ram' },
};
const GCP_INSTANCE_SPECS = {
  'a2-highgpu-1g':  { vcpu: 12,  ramGb: 85,   gpus: 1,  gpuModel: 'NVIDIA A100 40GB', gpuKey: 'gpu_a100_40gb', family: 'a2' },
  'a2-highgpu-2g':  { vcpu: 24,  ramGb: 170,  gpus: 2,  gpuModel: 'NVIDIA A100 40GB', gpuKey: 'gpu_a100_40gb', family: 'a2' },
  'a2-highgpu-4g':  { vcpu: 48,  ramGb: 340,  gpus: 4,  gpuModel: 'NVIDIA A100 40GB', gpuKey: 'gpu_a100_40gb', family: 'a2' },
  'a2-highgpu-8g':  { vcpu: 96,  ramGb: 680,  gpus: 8,  gpuModel: 'NVIDIA A100 40GB', gpuKey: 'gpu_a100_40gb', family: 'a2' },
  'a2-megagpu-16g': { vcpu: 96,  ramGb: 1360, gpus: 16, gpuModel: 'NVIDIA A100 40GB', gpuKey: 'gpu_a100_40gb', family: 'a2' },
  'a2-ultragpu-1g': { vcpu: 12,  ramGb: 170,  gpus: 1,  gpuModel: 'NVIDIA A100 80GB', gpuKey: 'gpu_a100_80gb', family: 'a2ultra' },
  'a2-ultragpu-2g': { vcpu: 24,  ramGb: 340,  gpus: 2,  gpuModel: 'NVIDIA A100 80GB', gpuKey: 'gpu_a100_80gb', family: 'a2ultra' },
  'a2-ultragpu-4g': { vcpu: 48,  ramGb: 680,  gpus: 4,  gpuModel: 'NVIDIA A100 80GB', gpuKey: 'gpu_a100_80gb', family: 'a2ultra' },
  'a2-ultragpu-8g': { vcpu: 96,  ramGb: 1360, gpus: 8,  gpuModel: 'NVIDIA A100 80GB', gpuKey: 'gpu_a100_80gb', family: 'a2ultra' },
  'a3-highgpu-1g':  { vcpu: 26,  ramGb: 234,  gpus: 1,  gpuModel: 'NVIDIA H100 80GB', gpuKey: 'gpu_h100', family: 'a3' },
  'a3-highgpu-2g':  { vcpu: 52,  ramGb: 468,  gpus: 2,  gpuModel: 'NVIDIA H100 80GB', gpuKey: 'gpu_h100', family: 'a3' },
  'a3-highgpu-4g':  { vcpu: 104, ramGb: 936,  gpus: 4,  gpuModel: 'NVIDIA H100 80GB', gpuKey: 'gpu_h100', family: 'a3' },
  'a3-highgpu-8g':  { vcpu: 208, ramGb: 1872, gpus: 8,  gpuModel: 'NVIDIA H100 80GB', gpuKey: 'gpu_h100', family: 'a3' },
  'g2-standard-4':  { vcpu: 4,   ramGb: 16,   gpus: 1,  gpuModel: 'NVIDIA L4', gpuKey: 'gpu_l4', family: 'g2' },
  'g2-standard-8':  { vcpu: 8,   ramGb: 32,   gpus: 1,  gpuModel: 'NVIDIA L4', gpuKey: 'gpu_l4', family: 'g2' },
  'g2-standard-12': { vcpu: 12,  ramGb: 48,   gpus: 1,  gpuModel: 'NVIDIA L4', gpuKey: 'gpu_l4', family: 'g2' },
  'g2-standard-16': { vcpu: 16,  ramGb: 64,   gpus: 1,  gpuModel: 'NVIDIA L4', gpuKey: 'gpu_l4', family: 'g2' },
  'g2-standard-24': { vcpu: 24,  ramGb: 96,   gpus: 2,  gpuModel: 'NVIDIA L4', gpuKey: 'gpu_l4', family: 'g2' },
  'g2-standard-32': { vcpu: 32,  ramGb: 128,  gpus: 2,  gpuModel: 'NVIDIA L4', gpuKey: 'gpu_l4', family: 'g2' },
  'g2-standard-48': { vcpu: 48,  ramGb: 192,  gpus: 4,  gpuModel: 'NVIDIA L4', gpuKey: 'gpu_l4', family: 'g2' },
  'g2-standard-96': { vcpu: 96,  ramGb: 384,  gpus: 8,  gpuModel: 'NVIDIA L4', gpuKey: 'gpu_l4', family: 'g2' },
};

function gcpSkuUnitPrice(sku) {
  const rate = sku.pricingInfo?.[0]?.pricingExpression?.tieredRates?.find(r => r.startUsageAmount === 0);
  if (!rate?.unitPrice) return null;
  const { units = '0', nanos = 0 } = rate.unitPrice;
  return parseFloat(units) + nanos / 1e9;
}

async function fetchGcpSkus() {
  const gcpKey = process.env.GCP_API_KEY;
  if (!gcpKey) return null;
  const skus = [];
  let pageToken = '';
  const baseUrl = `https://cloudbilling.googleapis.com/v1/services/${GCP_CE_SERVICE_ID}/skus?key=${gcpKey}&currencyCode=USD&pageSize=5000`;
  do {
    const r = await fetch(pageToken ? `${baseUrl}&pageToken=${pageToken}` : baseUrl);
    if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(`GCP API ${r.status}: ${b.error?.message ?? r.statusText}`); }
    const data = await r.json();
    skus.push(...(data.skus ?? []));
    pageToken = data.nextPageToken ?? '';
  } while (pageToken);
  return skus;
}

function buildGcpComponentPrices(skus) {
  const prices = {};
  for (const sku of skus) {
    if (sku.category?.usageType !== 'OnDemand') continue;
    const desc = sku.description ?? '';
    if (/dws|reserved|calendar mode/i.test(desc)) continue;
    for (const { re, key } of GCP_SKU_PATTERNS) {
      if (re.test(desc)) {
        const price = gcpSkuUnitPrice(sku);
        if (price != null && price > 0 && !(key in prices)) prices[key] = price;
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
  const gp = componentPrices[spec.gpuKey], cp = componentPrices[comp.coreKey], rp = componentPrices[comp.ramKey];
  if (gp == null || cp == null || rp == null) return null;
  return { hourlyUSD: Math.round((spec.gpus * gp + spec.vcpu * cp + spec.ramGb * rp) * 1000) / 1000 };
}

// ── Handler ────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const clientIp = getClientIp(req);
  const withinLimit = await checkRateLimit(clientIp);
  if (!withinLimit) {
    res.status(429).json({
      error: 'Daily limit reached',
      message: 'You have reached the limit of 10 free assessments per day. Please try again tomorrow.',
    });
    return;
  }

  const { workload, sizingBlock, workloadType } = req.body ?? {};
  if (!workload || !sizingBlock) {
    res.status(400).json({ error: 'Missing workload or sizingBlock' });
    return;
  }

  try {
    const aiResult = await getAiRecommendation(workload, sizingBlock, workloadType);

    const awsInstance      = cleanInstanceType(aiResult.recommendations?.aws?.instance_type ?? '');
    const azureInstance    = cleanInstanceType(aiResult.recommendations?.azure?.instance_type ?? '');
    const gcpInstance      = cleanInstanceType(aiResult.recommendations?.gcp?.instance_type ?? '');
    const awsEquivInstance = cleanInstanceType(aiResult.recommendations?.aws?.equivalent_instance?.instance_type ?? '');
    const gcpEquivInstance = cleanInstanceType(aiResult.recommendations?.gcp?.equivalent_instance?.instance_type ?? '');

    const [awsPrice, azurePrice, gcpSkus] = await Promise.all([
      lookupAwsPrice(awsInstance),
      lookupAzurePrice(azureInstance),
      fetchGcpSkus(),
    ]);

    const gcpComponentPrices = gcpSkus ? buildGcpComponentPrices(gcpSkus) : {};
    const gcpPrice = lookupGcpPrice(gcpComponentPrices, gcpInstance);

    const equivPricing = {
      aws:   awsEquivInstance ? await lookupAwsPrice(awsEquivInstance) : null,
      azure: null, // Azure equiv would need an extra async API call — omit for now
      gcp:   gcpEquivInstance ? lookupGcpPrice(gcpComponentPrices, gcpEquivInstance) : null,
    };

    res.status(200).json({
      aiResult,
      pricing: { aws: awsPrice, azure: azurePrice, gcp: gcpPrice },
      equivPricing,
    });
  } catch (err) {
    console.error('[AIFA] /api/analyze failed:', err);
    res.status(502).json({ error: err.message ?? 'Analysis failed' });
  }
}
