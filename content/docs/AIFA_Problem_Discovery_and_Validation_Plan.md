**AI Factory Advisor**

**Problem Discovery & Validation Plan**

Paul Moore   |   Aug 2026   |   v1.1

| Document Status No customer discovery has been conducted. This document defines the research required to test the assumptions behind the AI Factory Advisor MVP. It contains no findings and no validated conclusions. Every statement about user behavior below is a hypothesis to be tested, not an observation. |
| :---- |

# **1\. Purpose & Context**

The AI Factory Advisor (AIFA) MVP is built, deployed, and functional end to end. It collects workload requirements, computes GPU requirements, recommends and prices instances across AWS, Azure, and Google Cloud, and explains the reasoning. That is a fact about the product. It is not evidence that the problem it solves is worth solving.

The MVP was built from domain expertise and a set of hypotheses, before any customer research, by design. The project served two goals: to learn AI-assisted prototyping through a real problem, and to produce a working, instrumented artifact that discovery could test rather than a concept it could only describe. Both the Product Vision & Strategy and the Product Brief state this and defer the same open questions here.

Domain expertise is a reasonable basis for a first hypothesis, but it is prone to a specific failure: the author’s own workflow becomes the assumed workflow of the market. Building before discovery makes that failure more likely, not less, because the product now embodies the assumption rather than merely stating it. This plan defines what remains unknown, how it will be tested, and what evidence would justify continuing, adjusting, or reconsidering the current direction. It precedes any expansion of scope, because expanding an unvalidated product multiplies the cost of being wrong.

**The goal.** To find out whether the problem AIFA solves is real, frequent, and painful enough that the people who face it want it solved. Everything below is either a method for answering that or a rule designed to protect the evidence from bias.

**Scope.** This is a learning plan, not a roadmap. It does not propose features, prioritize work, or set dates. It defines research objectives, methods, and decision rules.

**What is explicitly deferred.** The Product Vision lists Buying user as one of three assumptions gating expansion beyond the MVP: does the budget authority perceive sufficient value in AIFA to justify the expenditure.  Answering it properly requires interviewing people who approve purchases rather than people who do the work, which will be done in stage 2 of this study. This plan for stage 1 gathers a directional signal on it, described in Section 3.2, and defers the question itself. That gate remains open after this research concludes, and the Product Vision should not be read as though it has been closed.

# **2\. Current Product Hypothesis**

**Assumed problem (hypothesis).** Architects specifying cloud infrastructure for self-managed AI inference and training workloads spend significant time determining an appropriate GPU configuration, because the decision requires knowledge of the workload being served, model requirements including memory footprint and serving overhead, GPU capabilities, cloud instance offerings, and current pricing. The Product Brief describes this as slow, manual, and difficult to standardize. This description is drawn from domain experience rather than observed behavior. It is plausible but unverified.

**Assumed value (hypothesis).** A tool that takes structured workload requirements and returns an explainable recommendation, including assumptions, tradeoffs, and cross-provider alternatives, will reduce research effort and increase the architect’s confidence in what they present to a customer or reviewer. Two sub-hypotheses sit underneath this and are easily conflated with it: that the explanation is a key part of the value proposition, and that cross-provider comparison is a differentiator rather than an unused capability. Either could fail while the other holds.

**What would make these wrong.** The problem could be real but infrequent; frequent but already served well enough by internal spreadsheets, reference architectures, or vendor support; or real, frequent, and unsolved, yet owned by a role that would never adopt a standalone tool. Discovery must distinguish between these outcomes, not merely confirm that the problem exists.

# **3\. Key Assumptions to Validate**

Assumptions are grouped into three categories, each stated as a falsifiable claim with the consequence of it being wrong and the method that will test it. Each category can fail while the others hold, which is why they are kept apart: a problem can be real while the product misses it, and a product can fit a workflow it adds nothing to.

## **3.1 Problem Severity**

Does the problem exist, how often, and does getting it wrong cost anything?

| Assumption | Why it matters | Validation approach |
| :---- | :---- | :---- |
| The process is slow and effortful, spanning multiple disconnected sources. | The MVP’s core claim is reduced research effort. If the process is already fast, that claim has nothing to deliver. | Walk through the most recent exercise step by step. Capture elapsed time, sources consulted, and where time concentrated. |
| The problem recurs often enough to justify a dedicated tool. | A severe but rare problem does not sustain adoption. Frequency, not severity alone, drives repeat usage. | Ask each participant to count sizing exercises in the last six months. Count rather than accept estimates. |
| Significant time and effort are spent translating model requirements into GPU memory and traffic into throughput. | Identifies which step carries the value. If difficulty sits elsewhere, the MVP automates the wrong thing. | Ask which step they are least confident in, and which they spend the most time on. |
| Sizing errors carry real cost, performance, or credibility consequences. | Pain without consequence rarely motivates adoption or budget. | Ask for a specific instance where a configuration was wrong and what followed. The absence of examples is itself a finding. |

## **3.2 Product Value**

If the problem is real, does the MVP actually address it?

| Assumption | Why it matters | Validation approach |
| :---- | :---- | :---- |
| Existing tools do not solve this: calculators price a chosen instance but do not help select one. | The central differentiation claim. If internal methods are serviceable, the gap may not exist. | Inventory current tools per participant. Ask what each does well and where it stops being useful. |
| Architects want a recommended configuration, not only the underlying calculations. | Distinguishes an advisor from a calculator. If users want raw numbers to interpret themselves, the recommendation layer is unnecessary. | Prototype sessions on a workload the participant has sized before. Observe whether they read the recommendation or go straight to the figures. |
| Explanation and stated assumptions are necessary for the recommendation to be usable. | The Product Brief treats explainability as the product itself. If the rationale is skimmed, a central principle is weaker than assumed. | Observe whether participants read the rationale unprompted; ask what they would add before showing it to a client. |
| Cross-provider comparison provides meaningful value in practice. | Many organizations have standardized on one cloud. If comparison is unused, part of MVP scope is not earning its place. | Ask how often provider choice is genuinely open at the point of sizing; observe whether the alternatives view is used or ignored. |
| Users would act on the output, at least as a defensible starting point. | Separates a decision tool from a sanity check. Both may be useful, but they imply different products. | Ask what the participant would do with the output next, and what would have to be true to show it to a client. |
| Time savings are seen as valuable for someone able to authorize spending; not just the user. | Value to an individual is not a budget. For a participant who bills hourly, working faster may reduce revenue rather than creating margin, so the same time saving means opposite things depending on how they are compensated. This is a directional signal only; the Buying user question is deferred, as stated in Section 1\. | Record the commercial model as an attribute. Ask what they have previously bought for this workflow, what it cost, and who approved it. Past purchases are better evidence than stated willingness to pay. |

## **3.3 Workflow Fit**

If the problem is real and the product addresses it, is there a place for it to attach?

| Assumption | Why it matters | Validation approach |
| :---- | :---- | :---- |
| The managed versus self-managed decision is already made before sizing begins. | The MVP assumes self-managed deployment. If that is still open, the product answers the second question, not the first. | Ask when deployment approach was decided, by whom, and whether it was revisited. |
| The MVP allows for the necessary inputs. | If those inputs do not yet exist, the tool cannot provide an accurate recommendation. | Ask directly which inputs are required to properly size AI Infrastructure at CSPs. |
| Sizing is not conducted until the user has collected all necessary inputs. | If sizing routinely begins before all inputs are known, the MVP's single-pass design fits the exception rather than the rule. | Ask whether sizing began before requirements were settled, and whether that required preparing multiple recommendation options. |

# **4\. Discovery Approach**

## **Who is interviewed**

One population: practitioners who make AI infrastructure recommendations to an external client. That is the only recruiting criterion. Job title and employer are not screening questions. These attributes will be recorded and used to determine if a persona needs to be split into multiple personas for the next stage of discovery.

## **Attributes recorded**

The distinctions that were dropped as segments are kept as attributes. They are recorded for every participant, so that if a pattern appears it can be seen rather than assumed in advance.

| Attribute | Why it is recorded |
| :---- | :---- |
| Employer type: independent, consultancy, systems integrator, or managed service provider. | Captures potential distinctions between various users that could identify the need to  split the persona into multiple personas.   |
| Company size, and how many people there do this work | Separates a problem owned by one specialist from one spread across a team, which affects whether consistency between individuals is felt as a problem at all. |
| Commercial exposure when a configuration is wrong | Tests whether consequence, rather than frequency alone, is what makes the problem worth solving. |
| Commercial model: hourly, fixed fee, retained, or salaried | Decides whether time saved converts into money at all. A practitioner billing hourly loses revenue by working faster, so the same finding about time saved carries the opposite meaning for them. |
| Recruiting source: network referral or outside the network | Makes the sampling bias visible in the findings rather than only in the plan. |

**Two rules make this work.** The attribute list is fixed before the first interview, because a field added at interview six cannot be filled in for the first five, and the gap will fall in whichever comparison turns out to matter. And any pattern found in these attributes is reported as directional and named as a question for a later round. At this sample size a clean-looking split is at its most tempting exactly when it is least supported.

## **Recruiting**

Participants are reached through professional network referrals, direct outreach to consultancies, systems integrators, and managed service providers, and practitioner communities where this work is discussed. Network referrals are the fastest channel and the most biased one, because those practitioners were shaped by the same environment that produced the hypothesis. At least half the interviews should come from outside that network, and the split is recorded. What is offered in exchange for forty-five minutes is the synthesized findings and early access to the tool, which is what a project with no budget can honestly provide.

## **Research methods**

**User interviews.** Semi-structured conversations with practitioners, focused on recent specific experiences rather than general opinion: how decisions are actually made, where effort concentrates, and how participants describe the problem in their own vocabulary. Questions are framed around past behavior, because stated preference about hypothetical tools is unreliable evidence.

**Workflow analysis.** For each participant, map the path around the sizing decision: what triggers it, who participates, what inputs are required and where they come from, what artifact is produced, and what happens afterwards. This tests whether the product has a natural point of attachment, which questions about pain alone will not reveal.

**Prototype feedback sessions.** Observed sessions using the deployed MVP against a workload the participant has sized before, so output can be compared with their own conclusion. These test whether the product addresses a problem they recognize, whether they trust the recommendation and what trust would require, and where output falls short of what they would show a client. The MVP’s assessment logging records which inputs are supplied and where users abandon the flow, supplementing what participants say with what they do. Section 6 governs when in the sequence these sessions may occur.

**Weighting of evidence.** Enthusiasm about a demonstrated prototype is not validation. A participant volunteering a workaround, or reproducing a past sizing exercise unprompted, is stronger evidence than agreement with a description of the problem.

# **5\. Research Questions**

Questions are phrased to elicit specific past behavior, because stated preference about hypothetical tools is unreliable evidence. Follow-up probes and the words used to explain a question may change freely as better language emerges, but the questions themselves are held stable. A question that changes mid-study cannot be counted across the study, and the frequency and severity findings depend on counting.

## **Current workflow**

* Tell me about the last AI workload you helped design. What was it, and who asked for it?

* How did you determine the infrastructure requirements? Walk me through what you did first, second, and next.

* Who else was involved, what did each contribute, and what did you produce at the end?

* How many times have you done something like that in the last six months?

## **Pain points**

* Which parts of that process were most difficult, and what required the most research to find?

* Where are you least confident that you got it right?

* Has a configuration you specified ever turned out to be wrong? What happened as a result?

## **Existing solutions**

* What tools did you use (internal calculators, spreadsheets, reference architectures, vendor solution architects) and where does each stop being useful?

* If you did this again next week, would you start from the previous work or from scratch?

* Have you ever paid for a tool to help with any part of this? What was it, roughly what did it cost, and who approved it?

* How is this work billed, if at all: hourly, fixed fee, part of a retainer, or absorbed?

## **Product fit**

* Where in your process would a tool like this fit, if anywhere?

* What would you need to see before you would trust the recommendation?

* Would you present this output to a client as it stands? What would you change first?

* What would prevent adoption, and which adjacent decision do you wish you had help with more than this one?

* Who at your company would authorize an expenditure for a tool like AIFA?

# **6\. Interview Rules**

These rules govern the interviews. Because the MVP already exists, the largest threat to this research is contamination: showing the tool before hearing the problem turns discovery into product feedback, and product feedback cannot answer whether the problem is worth solving. Each rule carries its reasoning, because a rule without its rationale cannot be defended under pressure or adapted when circumstances change. 

**1\. The first eight conversations are problem interviews only. No demo.**

Why: the biggest open questions, whether sizing is the real pain, how often it recurs, and whether the entry point is upstream at the managed versus self-managed decision, are all problem-level questions, and these conversations are the only chance to hear unprompted answers. A tool cannot be un-shown later, but it can always be shown in a follow-up interview. Eight is the point at which the vocabulary participants use has stabilized enough that a single demo will not anchor the interviewer’s own thinking. Early interviews are also the clumsiest, so spending them on uncontaminated data is the right trade: worst technique on cleanest signal.

**2\. Keep the tool out of outreach and calendar language.**

Why: contamination starts before the meeting. If the invite mentions a tool, participants arrive in evaluation mode, thinking about what they would want from a product rather than describing their week. Frame outreach as research: "I am studying how architects size GPU workloads."

**3\. If a demo happens, it comes only after the problem interview is fully complete, and never at its expense.**

Why: this is the pragmatic adjustment for hard-to-recruit participants who may grant only one meeting. If the workflow walkthrough is done and time remains, showing AIFA in the final minutes costs little, because the clean data is already captured. What is prohibited is compressing the problem half to make room for the demo, or letting the participant know a demo is coming. Interviewer bias matters as much as participant bias: knowing a reveal is planned steers the questions toward it. This rule is absolute and does not depend on how recruiting goes.

**4\. Mark everything said after a reveal as reaction data, not discovery data.**

Why: the two answer different questions. Reaction data says things about AIFA, such as which inputs confuse and what is missing before an architect would trust it. Discovery data says things about the problem: whether it exists, how often, and who owns it. Mixing them lets enthusiasm about a demonstrated prototype masquerade as evidence the problem is worth solving.

**5\. Hold the demo to keep the variant option open.**

Why: if early interviews reveal the real entry point is upstream of sizing, the deployment model, the class of provider, or another decision that precedes it, the right move is to build a variant prototype before demoing anything. AI-assisted prototyping makes variants cheap; that is its actual advantage in discovery. Demoing the current MVP first closes that option for those participants.

**If recruiting falls short.** Rule 3 is absolute and costs nothing to hold. Rule 1 is a threshold, and falling below eight does not stop the research; it caps what the research can claim. Interviews that fall short are reported with the shortfall stated, and conclusions drawn from them are labeled directional. The failure mode to avoid is not a smaller study. It is a smaller study described as though it were the planned one.

# **7\. Decision Framework**

These criteria are set before evidence is collected, so interpretation is not adjusted to preserve the current direction.

| Outcome | Evidence that would lead to it |
| :---- | :---- |
| Continue current direction | Participants describe sizing as significant and recurring. Workflows are manual, multi-source, and inconsistent between individuals. Participants engage with the rationale and can say why explanation matters.  |
| Adjust direction | Participants describe the more valuable question as upstream, such as whether to self-manage at all, making sizing secondary. Cross-provider comparison proves largely unused because provider choice is already fixed. The output does not fit the deliverable architects must produce. The recorded attributes suggest the problem concentrates in part of the population rather than across it, which is a hypothesis for a further round rather than a finding. Adjustment means changing entry point, emphasis, or who the product is aimed at, while retaining the problem. |
| Reconsider direction | Existing tools, internal methods, and vendor support are reported as sufficient, and participants cannot describe the cost of the current approach. The problem is too infrequent to sustain habitual use. Participants will not act on an automated recommendation regardless of explanation. Or the decision is being abstracted away by orchestration tooling, so that selecting a configuration is no longer work a practitioner does. Reconsideration means questioning whether this problem is the right one to pursue. |

**How findings will be applied.** Discovery precedes expansion. The phased direction in the Product Vision remains a hypothesis about sequence; the evidence gathered here determines whether it reflects user priority or internal reasoning. Where findings and existing documents conflict, the findings take precedence and the earlier documents are revised, including this one.