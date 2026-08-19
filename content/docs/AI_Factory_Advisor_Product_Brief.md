**AI Factory Advisor**

Product Brief

Paul Moore  |  July 2026  |  v1.0

| Document Status This brief describes the AI Factory Advisor MVP as currently built and deployed. It documents what the product does today and the reasoning behind its scope. It is not a validated product. No customer discovery has been completed, and the assumptions identified at the end of this document remain untested. |
| :---- |

# **1\. Product Overview**

**AI Factory Advisor (AIFA)** is a web application that recommends cloud GPU infrastructure for self-managed AI inference and training workloads, prices that recommendation across AWS, Microsoft Azure, and Google Cloud, and explains why the configuration was selected.

**Status:** Working MVP. The application is built, deployed, and functional end to end. It is in use as a discovery instrument, not as a commercial product. A working prototype is available here: [aifa-rho.vercel.app](https://aifa-rho.vercel.app/)

# **2\. Product Context**

The Product Vision describes a long-term ambition to advise on AI infrastructure decisions broadly. The MVP addresses one decision inside that space: which cloud GPU configuration a self-managed inference or training workload requires.

**Why this problem was selected.** GPU infrastructure sizing is concrete, bounded, and has a verifiable output. An architect either receives a configuration that meets the workload requirement or does not. That makes the recommendation testable against expert judgment, which matters more at this stage than breadth of coverage. Broader questions such as managed versus self-managed deployment involve organizational factors that cannot be evaluated from workload inputs alone.

**Why self-managed infrastructure only.** Self-managed deployments are where the sizing problem actually exists. Managed AI services abstract the infrastructure decision away entirely, so there is no configuration for an architect to select. Constraining the MVP to self-managed workloads means every user who reaches the product has the problem the product solves.

**Why scope was limited.** The MVP was built before customer discovery. Given that, a narrow scope keeps the cost of being wrong low. A tool that answers one question can be shown to practicing architects and corrected quickly. A broader tool would have embedded more unvalidated assumptions and taken longer to build, without producing better evidence about whether the underlying problem is worth solving.

# **3\. Target Users**

The MVP is aimed at practitioners who are asked to specify GPU infrastructure and are accountable for the result. At this stage, those users are bundled into a single unified proto-persona: the Client-Facing Infrastructure Architect.  This persona may exist under a variety of job titles, such as Cloud Solutions Architect, AI Infrastructure Architect, Systems Integrator Architect, etc.. One goal of the first stage of discovery is to determine if this unified persona should be split into multiple personas. 

# **4\. Problem Statement**

## **The current workflow**

An architect asked to size a self-managed AI workload today typically works through a sequence of manual steps:

1. Estimate the GPU memory the model requires, accounting for precision, weights, and serving overhead.

2. Translate expected users, traffic pattern, and latency targets into a throughput requirement.

3. Search provider documentation for GPU instance types that satisfy that requirement.

4. Look up pricing for each candidate instance, multiply out the fleet, and compare providers.

## **Why this is difficult**

* **Expertise is fragmented.** The decision spans four domains: model behavior, GPU architecture, cloud instance catalogs, and infrastructure pricing. 

* **The inputs move.** Instance families, GPU generations, regional availability, and prices change frequently. Documentation and internal spreadsheets go stale between engagements.

* **Providers are not directly comparable.** Each provider names, packages, and prices GPU capacity differently. Comparing them requires normalizing to a common unit before any comparison is meaningful.

* **Existing tools price, they do not size.** Cloud calculators price an instance the user has already chosen. They do not help the user determine which instance to choose.

* **Results are inconsistent.** Two architects at the same firm working from the same requirements can produce materially different configurations, because the reasoning lives in individual judgment rather than in a shared method.

The result is that a decision with recurring cost and performance consequences is made through effort that is slow, hard to standardize, and difficult to audit after the fact.

# **5\. Product Goal**

*Give an architect a defensible cloud GPU configuration for a described AI inference or training workload, with the reasoning attached, in minutes rather than hours.*

* **Reduce research effort.** Replace multi-source manual research with a single structured input step.

* **Increases sales velocity.** Proposals go out faster, boosting contract win rates.

* **Improve consistency.** Apply consistent sizing logic and current pricing so that the same inputs produce the same answer.

* **Make reasoning inspectable.** State assumptions and tradeoffs so the architect can evaluate the recommendation rather than accept it.

* **Increase confidence.** Give the architect something they can present to a customer or an internal reviewer and defend.

# **6\. MVP Scope**

## **In scope**

**Inputs collected from the user:**

* Model size and the AI workload being served

* Expected user concurrency and interaction type

* Traffic pattern and expected usage volume

* Response time and latency target

**Outputs returned to the user:**

* GPU memory required, GPUs required per replica, peak request rate, and instance count

* A recommended GPU instance type for AWS, Azure, and Google Cloud

* Total fleet cost per provider, priced from live provider pricing data rather than static tables

* A side by side comparison across the three providers, so alternatives are visible alongside the leading option

* A plain-language rationale covering why the configuration was selected, what assumptions were applied, and what considerations the workload raises

* A confidence indicator for the recommendation

## **Out of scope**

The following were deliberately excluded. They are not gaps in execution.

| Excluded from MVP | Reason |
| :---- | :---- |
| **Managed AI service recommendations** *(Bedrock, Vertex AI, Azure AI Foundry)* | Requires organizational inputs the product does not collect, and would double the surface area before the core sizing logic is validated. |
| **Model selection guidance** | A different problem with different users. The MVP assumes the model is already chosen. |
| **On-premises and specialized GPU providers** | Pricing and availability are not publicly queryable in a comparable way, and demand is unverified. |
| **Deployment automation and provisioning** | The product advises on a decision. Executing it introduces credentials, state, and operational risk unrelated to the problem being tested. |
| **Multi-workload planning, accounts, saved assessments, and collaboration** | Adds product surface without informing whether the recommendation itself is valuable. |

# **7\. Product Walkthrough**

A representative session, from the user's perspective:

* **The architect describes the workload.** The user enters the model size, expected number of users, interaction type, traffic pattern, and target response time. The form asks only for what the architect already knows from the engagement. No cloud account, credentials, or existing architecture is required.

* **AIFA determines the infrastructure requirement.** The product calculates GPU memory needed, how many GPUs are needed per replica, the peak request rate implied by the traffic pattern, and the resulting instance count. This arithmetic is deterministic, so the same inputs always produce the same requirement.

* **The product evaluates cloud options.** The requirement is matched to GPU instance types offered by AWS, Azure, and Google Cloud, and current pricing is retrieved directly, via provider APIs, rather than from a pinned rate.

* **The recommendation is assembled.** Sizing result, instance selection, and live pricing are combined into a recommended configuration, with a written rationale and a confidence indicator generated alongside it.

* **The architect reviews the result.** The user sees the recommended instance and fleet size for each provider, total fleet cost side by side, the assumptions applied, and the considerations flagged for that workload. The comparison is the alternatives view: the architect can see what the second and third options cost and judge whether the tradeoff is acceptable.

The intended experience is a fast second opinion rather than an authority. The architect remains the decision maker, and the product is designed to be argued with.

# **8\. Product Decisions and Tradeoffs**

| Decision | Alternatives considered | Rationale |
| :---- | :---- | :---- |
| **Solve infrastructure sizing, not model selection** | Recommend a model first, then size it. Combine both into one advisor. | Model selection is driven by accuracy, licensing, and application requirements the product cannot observe. Sizing is deterministic given a model, so it can be answered well and checked. |
| **Support AWS, Azure, and Google Cloud** | Start with a single provider. Include specialized GPU clouds from the outset. | Cross-provider comparison is the part users cannot easily do themselves and the clearest source of differentiation. Three providers cover most enterprise environments. |
| **Start with self-managed workloads** | Cover managed AI services in the same release. | Managed services remove the configuration decision, so including them would change the product's question rather than extend it. Self-managed users have the problem today. |
| **Explain recommendations rather than rank them** | Return a ranked list or a single lowest-cost answer. | Architects must defend recommendations to people who were not present. An unexplained answer cannot be defended and will not be used. Explanation is the product, not a feature of it. |
| **Compute sizing deterministically; use a language model only for the written rationale** | Let a language model perform the sizing calculations. | Numbers must be reproducible and auditable. Separating calculation from explanation keeps recommendations consistent while still producing readable reasoning. |
| **Price live, and present total fleet cost rather than hourly rates** | Maintain a static price list. Show per-instance hourly pricing as calculators do. | Stale pricing is one of the failure modes the product exists to remove. Fleet cost is the number the architect is actually asked about; hourly rates push the multiplication back onto the user. |
| **Advise only; do not deploy** | Generate infrastructure-as-code or provision directly. | Deployment automation is a separate product with separate risk. It would not test whether the recommendation is trusted, which is the open question. |

# **9\. Current Limitations and Open Questions**

## **Current limitations**

* Only self-managed AI inference and training deployments are supported. Managed AI services are not evaluated or compared.

* Only AWS, Azure, and Google Cloud are covered. Specialized GPU cloud providers and on-premises infrastructure are not.

* Fine-tuning and batch workloads fall outside the current sizing logic, which addresses inference and training only.

* Recommendations are for on-demand instances only. The product does not account for reserved capacity, committed-use discounts, negotiated enterprise rates, or regional availability constraints.

* Sizing rests on published model and GPU characteristics and general serving assumptions. It has not been benchmarked against production deployments, and recommendation quality has not been evaluated against independent expert review.

* The product does not persist assessments, support collaboration, or integrate with the tools architects use to produce customer deliverables.

## **Open product questions**

The MVP was built on judgment rather than evidence. The following are the assumptions that judgment rests on. Each requires customer validation, and each is capable of invalidating part of the current scope. These questions define the input to the next portfolio document, the Problem Discovery and Validation Plan.

| Open question | What is currently assumed |
| :---- | :---- |
| **Is GPU infrastructure sizing a time-consuming problem in the users existing workflow?** | That sizing is painful enough on its own to justify a dedicated tool. |
| **Does the person with purchasing authority recognize value in reducing the effort involved with GPU infrastructure sizing?** | If users of the product see enough value in it, they will be able to convince their employers to purchase the tool. |
| **How much does cross-cloud comparison matter in practice, given that many organizations have already standardized on one provider?** | That comparing providers is a differentiating capability rather than an interesting but unused one. |
| **Do users want deployment strategy guidance before sizing, making the MVP an answer to the second question rather than the first?** | That the managed versus self-managed decision has already been made when the user arrives. |
| **Would architects act on a recommendation from a tool, or only use it to sanity-check a conclusion they reached independently?**  | That an explained recommendation is sufficient to be trusted. |
| **Which adjacent decisions do they expect help with next?** | The sequence in the Product Vision reflects user priority rather than internal reasoning. |

*None of these questions is answered by the existence of the MVP. The application is a deliberate first step and an instrument for finding out, not evidence that the direction is correct.*