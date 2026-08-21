# AIFA — AI Factory Advisor

**Live Demo: https://aifa-rho.vercel.app/**
**About this project: https://aifa-rho.vercel.app/about**

A working AI-powered tool that translates plain-language AI workload descriptions into accurate, multi-cloud infrastructure cost comparisons across AWS, Azure, and Google Cloud. Built as a portfolio project demonstrating end-to-end AI product management and hands-on AI engineering.

## What This Project Demonstrates

- **AI product management** — Product Vision and Strategy, Product Brief, and Problem Discovery and Validation Plan documented throughout development
- **Working AI prototype** — live Anthropic API integration with GPU configuration reasoning, throughput-based fleet sizing, and GPU-optimal quantization
- **Live pricing integrations** — real-time cost data from AWS Price List Query API, Azure Retail Pricing API, and GCP Cloud Billing API
- **Engineering rigor** — 7-case regression test suite, pinned reference values for consistent recommendations, explicit VRAM and throughput math

## How It Works

1. Describe your AI workload — model type, concurrent users, interaction length, latency requirements
2. AIFA's AI engine recommends the optimal GPU configuration with explicit sizing math
3. Live pricing APIs return current costs — total fleet cost shown for your actual concurrency level

## Tech Stack

- **AI engine** — Anthropic Claude Sonnet via API
- **Pricing data** — AWS Price List Query API (live), Azure Retail Pricing API (live), GCP Cloud Billing API (live)
- **Runtime** — Node.js (serve.js for local CORS proxy)
- **Frontend** — Vanilla HTML, CSS, JavaScript
- **About page** — statically generated at build time (`scripts/build-about.js`) from `content/about.js` and Markdown docs in `content/docs/`, using `marked`

## Setup

```bash
git clone https://github.com/PM-Paul/aifa.git
cd aifa
npm install
cp .env.example .env
# Add your API keys to .env — see .env.example for the full list
# (Anthropic, GCP, AWS, Upstash Redis rate limiting, Google Sheets logging)
node serve.js
# Open http://localhost:3000
```

To also preview the `/about` page locally, run `npm run build` first (regenerates `about.html` and `about/docs/*.html` from the content files), then open `http://localhost:3000/about.html`.

## Project Status

- Live Demo: https://aifa-rho.vercel.app/
- ✅ Stage 0 core validation complete — AI engine produces consistent, throughput-based fleet cost comparisons across AWS, Azure, and GCP
- 🔨 v1 in progress — core cost comparison working, additional engine refinements and UI features under active development
- 📋 Product Vision and Strategy, Product Brief, and Problem Discovery and Validation Plan artifacts: see [/about](https://aifa-rho.vercel.app/about)

## About

This is a solo portfolio project by Paul M. Moore, Product Manager. The prototype and all technical decisions are real and tested. See accompanying product documentation for full context.
