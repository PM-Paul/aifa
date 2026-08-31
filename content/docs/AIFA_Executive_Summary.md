**AI FACTORY ADVISOR**

**Executive Summary**

*Paul Moore  |  Aug 2026  |  v2.0*

# **Project Overview**

AI Factory Advisor (AIFA) is a web application that recommends cloud GPU infrastructure for self-managed AI inference and training workloads, prices that recommendation across AWS, Microsoft Azure, and Google Cloud, and explains why the configuration was selected. It is built for client-facing infrastructure architects, such as cloud solutions architects, AI infrastructure architects, and architects at managed service providers and systems integrators. Today they size workloads through manual research across model documentation, GPU specifications, provider instance catalogs, and pricing calculators: slow work, hard to standardize, and inconsistent between individuals. AIFA returns a defensible starting configuration, with the reasoning attached, in minutes rather than hours.

# **The Product Opportunity**

Cloud GPU selection is becoming a more consequential decision as organizations move AI workloads from experimentation into production. Experimentation tolerates imprecision; production does not, because the same choice now carries recurring cost, latency commitments, and operational burden. The decision spans four domains: model behavior, GPU architecture, cloud instance catalogs, and infrastructure pricing. Its inputs keep moving as GPU generations, instance families, and prices change. Existing tools price an instance the user has already chosen; they do not help select one. That gap between pricing and sizing is the opportunity this project tests.

# **MVP Snapshot**

A working MVP is deployed and functional end to end. It provides:

* **AI workload analysis.**  From model size, expected concurrency, interaction type, traffic pattern, and latency target, the product derives GPU memory required, GPUs per replica, peak request rate, and instance count.

* **Cloud GPU instance recommendation.**  A recommended GPU instance type and fleet size for the stated requirement.

* **Multi-cloud comparison.**  Results shown side by side for AWS, Azure, and Google Cloud, so alternatives are visible alongside the leading option.

* **Infrastructure cost estimation.**  Total fleet cost per provider, priced from live provider pricing data rather than static tables.

* **Explainable recommendations.**  A plain-language rationale covering why the configuration was selected, the assumptions applied, the considerations the workload raises, and a confidence indicator.

# **Current Project Status**

The portfolio currently includes the MVP prototype, a Product Vision & Strategy (v2.0), a Product Brief (v2.0), and a Problem Discovery & Validation Plan (v2.0). Together these artifacts document both the product as it exists today and the approach that will guide future product decisions through customer discovery.

The MVP was built from domain expertise, before any customer research, by design. The project had two goals: to learn AI-assisted prototyping through a real problem, and to produce a working, instrumented artifact that discovery could test rather than a concept it could only describe. Building first was a deliberate tradeoff. It does not validate the product. The validation plan defines what must prove true before the scope expands: it states the assumptions the current scope rests on, the research that will test them, and decision rules, set in advance, for continuing, adjusting, or reconsidering the direction. The prototype is instrumented to support that research.

# **Prototype**

Working MVP Prototype: [aifa-rho.vercel.app](https://aifa-rho.vercel.app/)

# **Supporting Documentation**

| Document | Purpose |
| :---- | :---- |
| Product Vision & Strategy | Defines the long-term opportunity and product direction. |
| Product Brief | Describes the current MVP, target users, product scope, and key product decisions. |
| Problem Discovery & Validation Plan | Defines how customer research will validate assumptions and guide future product evolution. |

# **Closing**

This portfolio project works through a product problem end to end: identifying an emerging decision in AI infrastructure, framing the opportunity, scoping an MVP narrow enough to be tested against expert judgment, building it with AI-assisted prototyping, and defining the customer discovery required before the scope expands.

The build was a deliberate first use of AI-assisted prototyping, chosen in a domain where the author already holds expertise so that the learning would produce a working, instrumented artifact rather than a toy. Progress was fastest on parts of the problem that were already precisely defined. It slowed down wherever that wasn't true, and two kinds of decisions demanded the most judgment: figuring out what the product should refuse to answer, and recognizing where a plausible-sounding answer from the language model needed to be replaced with a deterministic calculation instead.

The documents expose the reasoning behind each decision, including where evidence does not yet exist. The prototype shows what has been built; the discovery plan states what must prove true for it to be worth building further.