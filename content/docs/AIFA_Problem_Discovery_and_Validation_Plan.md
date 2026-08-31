**AI FACTORY ADVISOR**

**Problem Discovery & Validation Plan**

*Paul Moore | Aug 2026 | v2.0*

## Document Status

No customer discovery has been conducted. This document defines the research required to test the assumptions behind the AI Factory Advisor MVP. It contains no findings and no validated conclusions. Every statement about user behavior below is a hypothesis to be tested, not an observation.

**v1.0 — 7/29/26.** First draft  
**v1.1 — 8/05/26.** Minor wording changes  
**v2.0 — 8/28/26.** Revised after critical review of v1.1. The recruiting criterion is now defined by the problem (a recent sizing exercise) rather than by prototype scope; client-facing vs. internal and cloud vs. on-prem are recorded as attributes with a target mix instead of screening rules, because those exclusions were solution hypotheses made before evidence. Decision criteria are now numeric with a rule for mixed results and a named next action per outcome. The question script is split into problem and prototype guides so the no-demo rule can be followed as written. Added a screener, a pilot phase, a synthesis method, a desk-research track, a timebox and target sample, and a deliverables list. The no-demo threshold drops from eight interviews to five to match the achievable sample.

## Research Brief

**Objective.** To find out whether the problem AI Factory Advisor solves is real, frequent, and painful enough that the people who face it want it solved, before any expansion of the current MVP scope.

**Problem hypothesis.** Practitioners who size AI infrastructure for a specific workload find the process slow, fragmented across sources, and inconsistent between individuals. This is the only claim this study treats as the problem to be validated.

**Solution hypotheses under test.** The MVP assumes the friction concentrates in determining a GPU configuration specifically; that the affected user is client-facing rather than internal; that the workload runs on cloud rather than on-premises; that deployment is self-managed rather than a managed AI service; that AWS, Azure, and Google Cloud are the relevant providers; and that an explainable recommendation is what practitioners want. None of these is treated as established. Each is recorded as an attribute or tested directly, not assumed as a premise of who is interviewed.

**Methods.** Pilot conversations (3 to 4, unstructured, no demo), problem interviews (guide 5a, no demo, first five conversations before any reveal), prototype sessions (guide 5b, after the problem interview is complete), and a parallel desk-research track (public forum mining, competitive scan, job-posting scan, conference/podcast review).

**Target sample and mix.** 8 to 10 interviews: 5 problem interviews, 3 prototype sessions, capacity for 1 to 2 more if a recorded attribute split warrants follow-up. Target mix of roughly two-thirds client-facing practitioners and one-third internal enterprise architects. Recruiting, not interview execution, is the primary risk to this target; there is no existing referral base for this population.

**Timebox.** 6 to 8 weeks from first outreach to a fixed stop date. The stop date holds regardless of achieved N; a shortfall is reported, not absorbed by extending the timeline.

**Decision thresholds.** Continue, adjust, or reconsider the current direction, determined by numeric thresholds against the 5 problem interviews and 3 prototype sessions (full criteria in Section 7). A named next action follows each outcome: Stage 2 buyer interviews, a variant prototype with a short second round, or a written kill memo. Mixed results trigger a second, targeted round rather than a default to "continue."

**Deliverables.** A findings memo, a revised persona (or personas), an assumption table marked supported / not supported / inconclusive, and a decision memo.

## 1\. Purpose & Context

The AI Factory Advisor (AIFA) MVP is built, deployed, and functional. It collects workload requirements, computes GPU requirements, recommends and prices instances across AWS, Azure, and Google Cloud, and explains the reasoning. That is a fact about the product. It is not evidence that the problem it solves is worth solving.

The MVP was built from domain expertise and a set of hypotheses, before any customer research, by design. The project served two goals: to learn AI-assisted prototyping through a real problem, and to produce a working, instrumented artifact that discovery could test rather than a concept it could only describe. Both the Product Vision & Strategy and the Product Brief state this and defer the same open questions here.

Domain expertise is a reasonable basis for a first hypothesis, but it is prone to a specific failure: the author's own workflow becomes the assumed workflow of the market. Building before discovery makes that failure more likely, not less, because the product now embodies the assumption rather than merely stating it. This plan defines what remains unknown, how it will be tested, and what evidence would justify continuing, adjusting, or reconsidering the current direction. It precedes any expansion of scope, because expanding an unvalidated product multiplies the cost of being wrong.

Throughout this plan, the MVP's scope choices (client-facing users only, cloud-only, self-managed-only, three named hyperscalers, and a recommendation-plus-explanation format) are treated as solution hypotheses, not as settled facts about the problem. They are recorded as attributes to be tested, not as screening criteria. The problem hypothesis is separate and narrower, and is stated in Section 2\.

**The goal.** To find out whether the problem AIFA solves is real, frequent, and painful enough that the people who face it want it solved. Everything below is either a method for answering that or a rule designed to protect the evidence from bias.

**Scope.** This is a learning plan, not a roadmap. It does not propose features, prioritize work, or set dates. It defines research objectives, methods, and decision rules.

**What is explicitly deferred.** The Product Vision lists Buying user as one of three assumptions gating expansion beyond the MVP: does the budget authority perceive sufficient value in AIFA to justify the expenditure. Answering it properly requires interviewing people who approve purchases rather than people who do the work, which will be done in stage 2 of this study. This plan for stage 1 gathers a directional signal on it, described in Section 3.2, and defers the question itself. That gate remains open after this research concludes, and the Product Vision should not be read as though it has been closed.

## 2\. Current Product Hypothesis

**Problem hypothesis.** Practitioners who size AI infrastructure for a specific workload find the process slow, fragmented across sources, and inconsistent between individuals. This is the only claim this study treats as the problem to be validated. Everything more specific than this is a solution hypothesis, addressed below.

**Solution hypotheses.** The MVP embodies a specific set of choices about what the friction consists of and who resolves it. It assumes the friction concentrates specifically in determining an appropriate GPU configuration, a task that requires knowledge of the workload being served, model requirements including memory footprint and serving overhead, GPU capabilities, instance catalogs, and current pricing. That is one candidate source of friction among several a practitioner might face (model selection, deployment strategy, cost optimization after deployment, or a decision point elsewhere in the workflow entirely), and this study has not yet established that it is the right one. It further assumes that the affected user is client-facing rather than internal; that the workload runs on cloud rather than on-premises; that the deployment is self-managed rather than a managed AI service; that AWS, Azure, and Google Cloud are the relevant providers; and that an explainable recommendation, rather than raw calculations or a ranked list, is what practitioners want. Section 4 defines how each of these is recorded as an attribute rather than used as a screening criterion.

**Assumed value (hypothesis).** A tool that takes structured workload requirements and returns an explainable recommendation, including assumptions, tradeoffs, and cross-provider alternatives, will reduce research effort and increase the architect's confidence in what they present to a customer or reviewer. Two sub-hypotheses sit underneath this and are easily conflated with it: that the explanation is a key part of the value proposition, and that cross-provider comparison is a differentiator rather than an unused capability. Either could fail while the other holds.

**What would make these wrong.** The problem could be real but infrequent; frequent but already served well enough by internal spreadsheets, reference architectures, or vendor support; or real, frequent, and unsolved, yet owned by a role that would never adopt a standalone tool. It could also be real for the persona and infrastructure the prototype assumes, but just as real, or more so, for a persona or infrastructure choice the prototype excludes, or the friction could sit at a different decision point than GPU sizing altogether. Discovery must distinguish between these outcomes, not merely confirm that the narrow problem exists.

## 3\. Key Assumptions to Validate

Assumptions are grouped into three categories, each stated as a falsifiable claim with the consequence of it being wrong and the method that will test it. Each category can fail while the others hold, which is why they are kept apart: a problem can be real while the product misses it, and a product can fit a workflow it adds nothing to.

### 3.1 Problem Severity

Does the problem exist, how often, and does getting it wrong cost anything?

| Assumption | Why it matters | Validation approach |
| :---- | :---- | :---- |
| The process is slow and effortful, spanning multiple disconnected sources. | The MVP's core claim is reduced research effort. If the process is already fast, that claim has nothing to deliver. | Walk through the most recent exercise step by step. Capture elapsed time, sources consulted, and where time concentrated. |
| The problem recurs often enough to justify a dedicated tool. | A severe but rare problem does not sustain adoption. Frequency, not severity alone, drives repeat usage. | Ask each participant to count sizing exercises in the last six months. Count rather than accept estimates. |
| Significant time and effort are spent translating model requirements into GPU memory and traffic into throughput. | Identifies which step carries the value. If difficulty sits elsewhere, the MVP automates the wrong thing. | Ask which step they are least confident in, and which they spend the most time on. |
| Sizing errors carry real cost, performance, or credibility consequences. | Pain without consequence rarely motivates adoption or budget. | Ask for a specific instance where a configuration was wrong and what followed. The absence of examples is itself a finding. |

### 3.2 Product Value

If the problem is real, does the MVP actually address it?

| Assumption | Why it matters | Validation approach |
| :---- | :---- | :---- |
| Existing tools do not solve this: calculators price a chosen instance but do not help select one. | The central differentiation claim. If internal methods are serviceable, the gap may not exist. | Inventory current tools per participant. Ask what each does well and where it stops being useful. Supplemented by the competitive and alternatives scan in the desk-research track (Section 4). |
| Architects want a recommended configuration, not only the underlying calculations. | Distinguishes an advisor from a calculator. If users want raw numbers to interpret themselves, the recommendation layer is unnecessary. | Prototype sessions on a workload the participant has sized before. Observe whether they read the recommendation or go straight to the figures. |
| Explanation and stated assumptions are necessary for the recommendation to be usable. | The Product Brief treats explainability as the product itself. If the rationale is skimmed, a central principle is weaker than assumed. | Observe whether participants read the rationale unprompted; ask what they would add before showing it to a client. |
| Cross-provider comparison provides meaningful value in practice. | Many organizations have standardized on one cloud. If comparison is unused, part of MVP scope is not earning its place. | Ask how often provider choice is genuinely open at the point of sizing; observe whether the alternatives view is used or ignored. |
| Users would act on the output, at least as a defensible starting point. | Separates a decision tool from a sanity check. Both may be useful, but they imply different products. | Ask what the participant would do with the output next, and what would have to be true to show it to a client. |
| Time savings are seen as valuable for someone able to authorize spending; not just the user. | Value to an individual is not a budget. For a participant who bills hourly, working faster may reduce revenue rather than creating margin, so the same time saving means opposite things depending on how they are compensated. This is a directional signal only; the Buying user question is deferred, as stated in Section 1\. | Record the commercial model as an attribute. Ask what they have previously bought for this workflow, what it cost, and who approved it. Past purchases are better evidence than stated willingness to pay. |

### 3.3 Workflow Fit

If the problem is real and the product addresses it, is there a place for it to attach?

| Assumption | Why it matters | Validation approach |
| :---- | :---- | :---- |
| The managed versus self-managed decision is already made before sizing begins. | The MVP assumes self-managed deployment. If that is still open, the product answers the second question, not the first. | Ask when deployment approach was decided, by whom, and whether it was revisited. |
| The MVP allows for the necessary inputs. | If those inputs do not yet exist, the tool cannot provide an accurate recommendation. | Ask directly which inputs are required to properly size AI Infrastructure at CSPs. |
| Sizing is not conducted until the user has collected all necessary inputs. | If sizing routinely begins before all inputs are known, the MVP's single-pass design fits the exception rather than the rule. | Ask whether sizing began before requirements were settled, and whether that required preparing multiple recommendation options. |
| Sizing is performed as a deliberate calculation, not approximated by overprovisioning and adjusting later. | If practitioners commonly overprovision and tune rather than calculate, the deterministic sizing step the MVP automates is not work anyone actually does. | Ask whether sizing is calculated up front or approximated by starting large and adjusting. Ask what prompts a correction if the initial choice turns out to be wrong. |

## 4\. Discovery Approach

### Who is interviewed

One population, defined behaviorally: practitioners who have sized GPU infrastructure for an AI inference or training workload in the last six months. That is the only recruiting criterion. Client-facing versus internal, and cloud versus on-premises versus managed-service deployment, are recorded as attributes rather than used as screening questions.

Target mix: roughly two-thirds client-facing practitioners (consultancies, systems integrators, managed service providers) and one-third internal enterprise architects. This is a target, not a hard quota. If it is not reached, the shortfall is reported against the target in the research log.

### Attributes recorded

The distinctions that were dropped as segments are kept as attributes. They are recorded for every participant, so that if a pattern appears it can be seen rather than assumed in advance.

| Attribute | Why it is recorded |
| :---- | :---- |
| Employer type: independent, consultancy, systems integrator, or managed service provider. | Captures potential distinctions between various users that could identify the need to split the persona into multiple personas. |
| Company size, and how many people there do this work | Separates a problem owned by one specialist from one spread across a team, which affects whether consistency between individuals is felt as a problem at all. |
| Commercial exposure when a configuration is wrong | Tests whether consequence, rather than frequency alone, is what makes the problem worth solving. |
| Commercial model: hourly, fixed fee, retained, or salaried | Decides whether time saved converts into money at all. A practitioner billing hourly loses revenue by working faster, so the same finding about time saved carries the opposite meaning for them. |
| Recruiting source: network referral or outside the network | Makes the sampling bias visible in the findings rather than only in the plan. |
| Practitioner context: client-facing vs. internal enterprise | Determines whether the friction described in the problem hypothesis is present across both contexts or concentrated in one. |
| Deployment environment: cloud, on-premises, or managed AI service | Determines whether the sizing friction is specific to cloud infrastructure or extends to on-premises and managed environments. The prototype session in Section 4 remains cloud-only, since that is what the tool evaluates; this attribute applies to the problem interview only. |

Two rules make this work. The attribute list is fixed before the first interview, because a field added at interview six cannot be filled in for the first five, and the gap will fall in whichever comparison turns out to matter. And any pattern found in these attributes is reported as directional and named as a question for a later round. At this sample size a clean-looking split is at its most tempting exactly when it is least supported.

### Screener

The qualifying question, "Have you sized GPU infrastructure for an AI inference or training workload in the last six months?", is asked before scheduling. This question is asked of everyone contacted, regardless of whether they ultimately interview.

If the answer is yes and the person agrees to be interviewed, the remaining attributes are collected during the interview itself and not asked in advance.

If the answer is yes and the person declines the interview, a short follow-up email is sent to collect the remaining attributes without requesting the interview again. These responses are recorded as screener-only data: they count toward frequency and attribute distribution but are not discovery interviews and carry no interview notes.

If the answer is no, no further outreach is made on this study.

Screener responses, including from non-participants, are logged in the research log alongside interview data, since they extend the sample on the frequency question independent of interview capacity.

### Recruiting

**Target sample.** Round 1 targets 8 to 10 interviews: five problem interviews, three prototype sessions, and capacity for one or two additional interviews if a split in the recorded attributes (client-facing vs. internal, cloud vs. on-premises) warrants a targeted follow-up conversation. This is a directional sample, not a statistically powered one; the decision framework in Section 7 is scaled to match.

**Timebox.** Six to eight weeks from the first outreach message to the stop date. The stop date holds regardless of achieved N. The research log (Section 8\) records achieved N against this target at the stop date.

**Recruiting risk.** This study has no existing referral base of practitioners who size GPU infrastructure for clients. Recruiting is the primary risk to the timebox, not interview execution or analysis. Outreach relies on cold contact through professional networks, direct outreach to consultancies, systems integrators, and managed service providers, and practitioner communities where this work is discussed, with no assumed conversion rate. If recruiting is not on pace to reach five problem interviews by the midpoint of the timebox (three to four weeks in), the plan does not extend the stop date; it narrows the target N and reports the shortfall.

**Ask length.** Interviews are held to 20 to 25 minutes to improve conversion, shortened from the earlier 45-minute estimate.

Participants are reached through professional network referrals, direct outreach to consultancies, systems integrators, and managed service providers, and practitioner communities where this work is discussed. Network referrals are the fastest channel and the most biased one, because those practitioners were shaped by the same environment that produced the hypothesis. At least half the interviews should come from outside that network, and the split is recorded. What is offered in exchange for twenty-five minutes is the synthesized findings and early access to the tool, which is what a project with no budget can honestly provide.

### Confidentiality

Outreach states plainly that no client names, workload specifics, or negotiated pricing are needed, only a description of how the practitioner approaches the sizing decision. Findings are anonymized before being shared back with participants or referenced in the findings memo; no participant is identified by name, employer, or client in any document this study produces. Recording is optional and never a condition of participating.

Practitioners at systems integrators and managed service providers are frequently under NDA with their clients and can be expected to hedge or decline to answer questions that stray toward specific engagement detail. This is expected and not treated as evasiveness; the research questions in Section 5a are written to ask about method and process rather than client-identifying detail for this reason.

### Research methods

**Pilots.** Before fielding the guide in 5a, 3 to 4 pilot conversations are held with people already in the author's network. Where the network includes practitioners who size GPU infrastructure, pilots are drawn from that population first. Where it does not, pilots are held with adjacent technical practitioners (cloud, infrastructure, or MLOps roles who do not necessarily do this specific work), used to test outreach language, general vocabulary, and where the target population might be found, rather than to test the problem hypothesis itself.

Pilots are unstructured, use no fixed script, and include no demo. They are not counted toward the target N and are not used as findings. Anything learned from a pilot that changes the guide in 5a is recorded as a revision note in the research log (Section 8), including which questions were reworded, added, or dropped and why.

If fewer than 3 pilots are possible within the available network, the shortfall is reported in the research log rather than treated as complete.

**User interviews.** Semi-structured conversations with practitioners, focused on recent specific experiences rather than general opinion: how decisions are actually made, where effort concentrates, and how participants describe the problem in their own vocabulary. Questions are framed around past behavior, because stated preference about hypothetical tools is unreliable evidence.

**Workflow analysis.** For each participant, map the path around the sizing decision: what triggers it, who participates, what inputs are required and where they come from, what artifact is produced, and what happens afterwards. This tests whether the product has a natural point of attachment, which questions about pain alone will not reveal.

**Prototype feedback sessions.** Observed sessions using the deployed MVP against a workload the participant has sized before, so output can be compared with their own conclusion. These test whether the product addresses a problem they recognize, whether they trust the recommendation and what trust would require, and where output falls short of what they would show a client. The MVP's assessment logging records which inputs are supplied and where users abandon the flow, supplementing what participants say with what they do. Section 7 governs when in the sequence these sessions may occur.

**Desk research.** Runs in parallel with recruiting and interviews, not sequenced before or after them.

*Public forum mining.* Collect and code posts asking sizing-related questions from GitHub issues on serving frameworks (vLLM, TGI, Triton, etc.), NVIDIA developer forums, Hugging Face discussions, r/MLOps and adjacent subreddits, and MLOps-focused Slack or Discord communities. Target 40 to 60 posts over a two-week search window; the achieved count is reported against this target rather than padded to reach it. Code each for asker role (where inferable), inputs the asker had available, points of confusion, and tools or methods recommended in responses. This channel is expected to speak mainly to the problem hypothesis (whether sizing confusion is visible and recurring) rather than the solution hypotheses (the client-facing, multi-cloud consulting context specifically), since that narrower context is unlikely to appear in public posts.

*Competitive and alternatives scan.* Catalog vendor sizing guides, GPU memory calculators, and cloud provider solution-architecture content. For each, note what it does and where it stops (for example, whether it prices a chosen instance versus helps select one).

*Job-posting scan.* Search job postings for roles that mention GPU sizing, AI capacity planning, or similar responsibilities, as a signal of whether this is recognized as dedicated work versus an incidental task folded into a broader role.

*Conference talks and podcasts.* Identify any talks or episodes where a practitioner walks through a real sizing exercise, coded the same way as forum posts.

Desk research findings are recorded in the same assumption-keyed template used for interviews (Section 6 of this document, "Synthesis"), tagged as desk research rather than interview data, and reported separately in the findings memo.

**Weighting of evidence.** Enthusiasm about a demonstrated prototype is not validation. A participant volunteering a workaround, or reproducing a past sizing exercise unprompted, is stronger evidence than agreement with a description of the problem.

## 5\. Research Questions

Two guides are used depending on the stage of the conversation. Section 5a is used for all problem interviews, per the sequencing in Section 6\. Section 5b is used only if and when a prototype demo occurs, never in place of 5a and never before it is complete.

### 5a. Problem Interview Guide

Asked in the first five interviews (and all subsequent problem interviews) before any demo.

**Current workflow**

- Tell me about the last AI workload you helped design. What was it, and who asked for it?  
- How did you determine the infrastructure requirements? Walk me through what you did first, second, and next.  
- Who else was involved, what did each contribute, and what did you produce at the end?  
- How many times have you done something like that in the last six months?  
- Was the model already chosen before you started sizing infrastructure for it, or was that still an open decision?  
- When you size a workload, do you work through the calculation carefully, or start from the largest available instance and scale down later if needed?

**Pain points**

- Which parts of that process were most difficult, and what required the most research to find?  
- Where are you least confident that you got it right?  
- Has a configuration you specified ever turned out to be wrong? What happened as a result?

**Existing solutions**

- What tools did you use (internal calculators, spreadsheets, reference architectures, vendor solution architects) and where does each stop being useful?  
- If you did this again next week, would you start from the previous work or from scratch?  
- Have you ever paid for a tool to help with any part of this? What was it, roughly what did it cost, and who approved it?  
- How is this work billed, if at all: hourly, fixed fee, part of a retainer, or absorbed?

### 5b. Prototype Session Guide

Used only after the problem interview is complete, per Section 7, Rule 3\. Everything from this point forward is reaction data, not discovery data.

**Product fit**

- Where in your process would a tool like this fit, if anywhere?  
- What would you need to see before you would trust the recommendation?  
- Would you present this output to a client as it stands? What would you change first?  
- What would prevent adoption, and which adjacent decision do you wish you had help with more than this one?  
- Who at your company would authorize an expenditure for a tool like AIFA?

## 6\. Synthesis

Interviews are recorded where the participant consents; otherwise, structured notes are taken during the interview. Notes are coded within 24 hours, using a template with one field per assumption listed in Section 3, so that each interview's evidence is sorted against the specific claim it bears on rather than summarized generally. A first coding pass is LLM-assisted: notes are run against the assumption table with a request for the applicable code and the supporting excerpt for each, and the author reviews and corrects this pass before it is treated as final.

Each coded note distinguishes observed behavior (what the participant described doing) from stated opinion (what the participant said they think or would do), and discovery data (from problem interviews) from reaction data (from prototype sessions, per Section 7, Rule 4).

Before the findings memo is written, one outside reader reviews the coded notes for 2 to 3 interviews and the draft memo, checking whether the coding matches what the notes contain and whether the memo's conclusions are supported by the evidence presented. This is a bounded, single review, not a review of every interview, and it can only check the notes as written; it cannot detect what an unrecorded interview's notes may have omitted.

## 7\. Interview Rules

These rules govern the interviews. Because the MVP already exists, the largest threat to this research is contamination: showing the tool before hearing the problem turns discovery into product feedback, and product feedback cannot answer whether the problem is worth solving. Each rule carries its reasoning, because a rule without its rationale cannot be defended under pressure or adapted when circumstances change.

**1\. The first five conversations are problem interviews only. No demo.**

Why: The purpose of this rule is to hear unprompted vocabulary before anything is shown. This threshold is sized to the study's target sample, so that it does not consume the entire round.

**2\. Keep the tool out of outreach and calendar language.**

Why: contamination starts before the meeting. If the invite mentions a tool, participants arrive in evaluation mode, thinking about what they would want from a product rather than describing their week. Frame outreach as research: "I am studying how architects size GPU workloads."

**3\. If a demo happens, it comes only after the problem interview is fully complete, and never at its expense.**

Why: this is the pragmatic adjustment for hard-to-recruit participants who may grant only one meeting. If the workflow walkthrough is done and time remains, showing AIFA in the final minutes costs little, because the clean data is already captured. What is prohibited is compressing the problem half to make room for the demo, or letting the participant know a demo is coming. Interviewer bias matters as much as participant bias: knowing a reveal is planned steers the questions toward it. This rule is absolute and does not depend on how recruiting goes.

**4\. Mark everything said after a reveal as reaction data, not discovery data.**

Why: the two answer different questions. Reaction data says things about AIFA, such as which inputs confuse and what is missing before an architect would trust it. Discovery data says things about the problem: whether it exists, how often, and who owns it. Mixing them lets enthusiasm about a demonstrated prototype masquerade as evidence the problem is worth solving.

**5\. Hold the demo to keep the variant option open.**

Why: if early interviews reveal the real entry point is upstream of sizing, the deployment model, the class of provider, or another decision that precedes it, the right move is to build a variant prototype before demoing anything. AI-assisted prototyping makes variants cheap; that is its actual advantage in discovery. Demoing the current MVP first closes that option for those participants.

**If recruiting falls short.** Rule 3 is absolute and costs nothing to hold. Rule 1 is a threshold, and falling below five does not stop the research; it caps what the research can claim. Interviews that fall short are reported with the shortfall stated, and conclusions drawn from them are labeled directional. The failure mode to avoid is not a smaller study. It is a smaller study described as though it were the planned one.

## 8\. Decision Framework

These criteria are set before evidence is collected, so interpretation is not adjusted to preserve the current direction. Thresholds are sized to this study's target of 5 problem interviews and 3 prototype sessions; they are directional decision rules for a small sample, not statistically powered conclusions.

| Outcome | Evidence that would lead to it | Next action |
| :---- | :---- | :---- |
| **Continue current direction** | At least 4 of 5 problem interviews report two or more sizing exercises in the last six months and describe a manual, multi-source process. At least 3 of 5 describe a specific instance where a wrong or uncertain configuration had a real consequence. In prototype sessions, at least 2 of 3 participants engage with the rationale unprompted rather than going straight to the output figures. | Proceed to Stage 2 buyer interviews, per the Product Vision's persona strategy. |
| **Adjust direction** | 2 to 3 of 5 problem interviews describe a more valuable question as sitting upstream or downstream of sizing (for example, whether to self-manage at all, or what to do once infrastructure is selected), or describe overprovisioning and tuning as the common practice rather than deliberate sizing. Cross-provider comparison is reported as unused by 2 or more participants because provider choice is already fixed. The recorded attributes (client-facing vs. internal, cloud vs. on-premises) show a split where one group's responses diverge clearly from the other's on the core problem questions. | Build a variant prototype reflecting the adjustment, and run a second, shorter round (2 to 3 interviews) targeted at the specific ambiguity before deciding again. |
| **Reconsider direction** | 3 or more of 5 problem interviews report existing tools or methods as sufficient. Fewer than 2 of 5 can describe a concrete consequence of a wrong configuration. 3 or more of 5 describe overprovisioning and tuning as standard practice rather than deliberate sizing (per Section 3.3). Or participants describe the decision as being abstracted away by orchestration tooling, so that selecting a configuration is no longer work a practitioner does. | Write a short kill memo stating what was tested, what was found, and why the direction does not proceed as scoped. |
| **Mixed / does not cleanly meet a threshold above** | Evidence splits roughly evenly, or the sample is too small after accounting for shortfalls in Sections 4 and 7 to apply any threshold with confidence. | Run a second, short round (2 to 3 additional interviews) focused specifically on the assumption that produced the ambiguous result, before applying the thresholds again. Do not default to "continue" in the absence of a clear signal. |

**How findings will be applied.** Discovery precedes expansion. The phased direction in the Product Vision remains a hypothesis about sequence; the evidence gathered here determines whether it reflects user priority or internal reasoning. Where findings and existing documents conflict, the findings take precedence and the earlier documents are revised, including this one.

## 9\. Deliverables and Research Log

**Deliverables.** Round 1 produces four artifacts:

- A findings memo, organized by the assumption categories in Section 3, stating what was found and how it maps to the decision framework in Section 8\.  
- A revised persona (or personas, if the recorded attributes in Section 4 support a split), replacing the unified proto-persona in the Product Vision's Persona Strategy.  
- An assumption table, listing every assumption in Section 3, marked supported, not supported, or inconclusive, with a one-line basis for each.  
- A decision memo, stating which outcome in Section 8 was reached and, per that outcome's named next action, what happens next.

**Research log.** Maintained throughout the study, not compiled retroactively at the end. The log records: this plan as originally published (v1.1) and this revision (v2.0); recruiting numbers against the targets in Section 4 (outreach sent, screener responses, interviews completed, by week); any revisions made to the guide in 5a as a result of piloting, per Section 4; desk-research counts against the targets in Section 4 (forum posts coded, competitive scan entries, job postings reviewed); and achieved N against target N at the stop date, per Section 4\. Where any target in this plan is missed, the log states the shortfall rather than restating the target as though it were met.  
