**AI FACTORY ADVISOR**

**Product Vision & Strategy**

*Paul Moore | Aug 2026 | v2.0*

## Document Status

This is a strategic hypothesis, not a validated plan. The market framing, target personas, and phase sequencing below are grounded in industry trends and domain expertise. Each is subject to revision or removal based on customer discovery, which is planned but not yet complete.

**v1.0 — 7/29/26.** Initial draft.

**v2.0 — 8/31/26.** The persona and deployment-environment boundaries stated here (client-facing vs. internal, cloud vs. on-premises) are treated as solution hypotheses under test in the Problem Discovery & Validation Plan (v2.0), not as established segmentation.

## 1\. Product Vision

**Vision Statement**

Enable organizations to make better AI infrastructure decisions by providing intelligent, data-driven recommendations that optimize performance, cost, and operational complexity.

**Vision Context**

The rapid adoption of generative AI is creating new infrastructure challenges for organizations. While AI application development has become increasingly accessible through hosted APIs and managed services, deploying AI workloads at production scale requires complex decisions across models, deployment approaches, compute infrastructure, and cost optimization.

Organizations must determine:

- Which AI models best fit their use case  
- Whether to use managed AI services or self-managed infrastructure  
- Which cloud or on-premises deployment approach is appropriate  
- What GPU resources are required to meet performance and cost objectives  
- How to balance operational complexity with flexibility and control

Today, these decisions require significant expertise spanning AI models, cloud platforms, GPU architectures, and infrastructure economics.

AI Factory Advisor aims to simplify these decisions by providing architecture recommendations that help teams confidently design AI infrastructure solutions.

## 2\. Product Strategy

**Strategic Opportunity**

As organizations move from AI experimentation to production deployment, infrastructure decisions become more consequential. Experimentation tolerates imprecision. Production does not, because the same decisions now carry recurring cost, latency commitments, and operational burden.

The market opportunity is to provide an intelligent advisor that helps technical teams answer a single question:

"What is the optimal way to deploy this AI workload given my technical requirements, business constraints, and cost objectives?"

The product will initially focus on a specific, high-value decision point: selecting cloud infrastructure for self-managed AI workloads. Over time, and only where discovery justifies it, the product may expand into broader AI infrastructure architecture decisions.

## 3\. Initial Product Focus (MVP)

**Problem Hypothesis**

Organizations deploying self-managed AI inference or training workloads struggle to select the appropriate cloud GPU infrastructure because the decision requires specialized knowledge of AI model requirements, GPU capabilities, cloud instance offerings, performance considerations, and infrastructure pricing.

Today, architects often rely on manual research across vendor documentation, pricing calculators, and technical resources to develop recommendations. This process is time-consuming and difficult to standardize, which means two architects at the same firm can produce different answers to the same question.

**MVP Objective**

Help AI infrastructure architects quickly identify appropriate cloud GPU configurations for AI workloads and understand the reasoning behind the recommendation.

**Persona Strategy**

This plan utilizes a gated, two-stage roadmap anchored by two unified proto-personas: the Client-Facing Infrastructure Architect (User) and the Consulting Practice Leader (Buyer). Rather than prematurely segmenting the target market based on corporate business models, single, consolidated profiles are used for each role to maintain a strict MVP focus on the core shared technical problem.

Stage 1 focuses entirely on the user persona to validate day-to-day workflow friction. Because the financial decision-maker operates under entirely different strategic incentives, dedicated buyer interviews are intentionally deferred to Stage 2\. This sequence ensures that economic value propositions and pricing models are not designed around a buyer profile built on unverified assumptions.

A primary objective of Stage 1 user interviews is to gather the operational data needed to refine or split these initial personas before advancing. The feedback loop will be monitored for clear split triggers, such as whether an architect's workflow is driven by risk standardization (common in large Systems Integrators) or vendor commission margins (common in Value-Added Resellers), whether the practitioner is client-facing or works on an internal enterprise team, or whether the environment being sized is cloud or on-premises. These insights will be used to map the exact internal procurement chains required for Stage 2\.

| Segment | Persona | Why they have the problem |
| :---- | :---- | :---- |
| User | Client-facing Infrastructure Architect | Design architectures and recommend infrastructure to external customers. Pricing and performance specs for GPUs change constantly across cloud providers. Manual calculations are slow, repetitive, and error-prone. |
| Buyer | Consulting Practice Leader | The person making the decision to purchase a tool like AIFA may not be the same as the user and may require different justification. Stage 1 of the discovery process will collect information needed to further define this persona. |

**Included as a comparison attribute.** Internal enterprise solution architects are not excluded from Stage 1 discovery. Client-facing practitioner context is recorded as an attribute, not used as a screening criterion, so the boundary between client-facing and internal practitioners is tested rather than assumed. If internal architects describe the same workflow friction, the persona is broader than this document currently reflects; if they do not, the distinction is earned by evidence. The Problem Discovery & Validation Plan governs this test.

## 4\. MVP Product Strategy

**Core User Problem**

"I understand the AI workload requirements, but I need help determining what infrastructure configuration will meet performance requirements while minimizing cost and complexity."

**MVP Solution**

AI Factory Advisor collects a structured description of the workload, computes the infrastructure requirement, prices it across providers, and explains the result.

- Collect workload requirements: model size, expected usage, user concurrency, interaction type, traffic pattern, and latency target.  
- Analyze infrastructure requirements: GPU memory, compute requirements, replica count, and instance capabilities.  
- Recommend infrastructure options: cloud provider, GPU instance type, number of GPUs, and estimated total fleet cost.  
- Explain the recommendation: why this configuration was selected, what assumptions were made, and how it compares with the alternatives.

**The MVP as a Discovery Instrument**

The application live today is deliberately narrow and deliberately real. Sizing arithmetic is deterministic and pre-computed rather than delegated to a language model, so recommendations are consistent and auditable. Pricing is fetched live from AWS, Azure, and Google Cloud public APIs and expressed as total fleet cost rather than a per-instance hourly rate. Every assessment is logged with its inputs, outputs, and user feedback.

That instrumentation is what makes the MVP useful now. It can be put in front of practicing architects during discovery so their reactions are observed against a working tool rather than a description, and the usage log answers questions no interview can: which inputs users actually supply, and where they abandon the flow.

**A note on sequencing**

AIFA was built before customer discovery, by design. The project had two goals: to learn AI-assisted prototyping through a real problem, and to produce a working, instrumented artifact that discovery could test rather than a concept it could only describe. A narrow, verifiable problem in a domain where the author already holds expertise served both goals at once, because an output an expert can judge right or wrong is what makes the method verifiable.

Building first was a deliberate tradeoff, and it carries a cost. Nothing about the existence of the MVP validates the product, and the sequence puts every hypothesis in this document at risk of having been shaped by the tool rather than tested against users. The research plan now underway exists to test the decisions already made, not to ratify them.

## 5\. Product Principles

**Start narrow, expand through validation**

The initial product focuses on GPU infrastructure selection because it is a concrete, technically complex problem with a clear output. Future expansion should be driven by customer discovery and validated user needs, not by adjacency.

**Recommendations must be explainable**

AI infrastructure decisions require justification, often to someone who was not in the room. The product should not simply provide an answer. It should state why the configuration was selected, what assumptions were made, and what tradeoffs exist. An unexplained recommendation cannot be defended to a customer, and an architect will not stake their credibility on one.

**Optimize for architecture decisions, not just cost**

The lowest-cost option is not always the best solution. Recommendations should weigh performance, reliability, operational complexity, flexibility, and cost together. Tools that optimize on price alone lose the trust of the practitioners who have to operate the result.

## 6\. Future Opportunity Areas (Unvalidated Hypotheses)

The long-term opportunity is to expand from infrastructure sizing into a broader AI infrastructure decision platform. The capabilities below are hypotheses, not commitments.

**Deployment Strategy Advisor**

Help users determine whether a workload belongs on a managed AI service (AWS Bedrock, Azure AI Foundry, Google Vertex AI), on self-managed cloud infrastructure (EC2, Azure GPU VMs, Google Compute Engine), or on-premises. Decision factors include cost, security requirements, operational expertise, model flexibility, and scalability.

**AI Infrastructure Cost Comparison**

Compare total cost of ownership across API-based AI services, managed AI platforms, self-managed cloud GPUs, and on-premises AI infrastructure.

**Multi-Provider AI Factory Architecture**

Expand beyond hyperscaler GPU selection to include specialized GPU cloud providers, enterprise AI servers, and on-premises AI factories.

## 7\. Key Assumptions Requiring Validation

Three assumptions gate any expansion beyond the MVP.

| Assumption | Question | What would disconfirm it |
| :---- | :---- | :---- |
| User need | Do architects experience enough pain selecting AI infrastructure to adopt a dedicated tool? | Existing spreadsheets, cloud calculators, and tribal knowledge already solve it well enough. |
| Buying user | Does AIFA provide enough value to justify the expenditure? | Value accrues to the individual but the budget sits at a level with no interest in the problem. |
| Differentiation | Can AIFA produce recommendations more actionable than existing calculators and documentation? | Users trust vendor-native tooling more, or want the raw numbers rather than a recommendation. |

## 8\. Success Criteria

MVP success is measured on learning velocity, not revenue.

- User engagement: assessments completed, repeat usage, and time saved compared with manual research.  
- Recommendation quality: user confidence rating, accuracy of recommendations against expert review, and qualitative feedback from architects.  
- Product learning: which workload inputs matter most, which recommendations users trust, and which adjacent decisions users ask for help with next. This third category determines whether the roadmap below survives contact with users.

## 9\. Strategic Roadmap

| Phase | Focus | Key question it answers |
| :---- | :---- | :---- |
| MVP | GPU infrastructure advisor | "What cloud GPU configuration should I use?" |
| Phase 2 | Deployment strategy guidance | "Should I use managed AI services or self-managed infrastructure?" |
| Phase 3 | Cost optimization | "Which deployment option provides the best total cost and value?" |
| Phase 4 | AI Factory architecture advisor | "How should I build my complete AI infrastructure platform?" |

Each phase is gated on evidence from the phase before it. A phase that discovery does not support does not ship, and the roadmap contracts rather than proceeding on momentum.  
