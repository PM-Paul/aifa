// Single source of truth for the /about page. All user-facing copy lives here —
// see docs/ABOUT_PAGE_BRIEF.md ground rule 1. [TODO: ...] values are placeholders
// pending copy from Paul; do not fill them in without being asked.

export const about = {
  name: 'Paul Moore',
  headline: 'Product Manager · built and shipped an AI-powered infrastructure advisor',
  bio: "I spent 12+ years at Dell, the last 7+ as a product manager, shipping enterprise infrastructure used by IT teams worldwide. I'm the kind of PM who wants to understand a system well enough to argue with the engineers. AI Factory Advisor is where I'm learning AI-assisted development on a real problem: I built and shipped a working prototype first, and now I'm testing my assumptions to figure out where to go next.",

  headshot: '/public/headshot.jpg',

  links: {
    linkedin: 'https://www.linkedin.com/in/paulmmoore/',
    github: 'https://github.com/PM-Paul',
    email: 'paulmoore.productmanagement@gmail.com',
  },

  ctaLabel: 'Try the app',

  storyIntro: "My hypothesis, based on my own experience and research, is that practitioners who size AI infrastructure for a workload do it by hand today: manually researching model specs, GPU capabilities, and pricing across AWS, Azure, and Google Cloud, in a process that's slow and hard to standardize. AI Factory Advisor is a working prototype that tests that hypothesis: it takes workload inputs and recommends GPU instances, with pricing for the fleet and an explanation of how it got there, and it does it all in just a few minutes.",

  story: [
    {
      step: '01',
      title: 'Vision and strategy',
      body: "AI infrastructure decisions are becoming more consequential as organizations move from experimenting with AI to running it in production, where the same choices now carry recurring cost and performance commitments. I chose to focus on cloud GPU selection specifically because it's a concrete, bounded decision with a right answer, one an expert can evaluate rather than a vague judgment call.",
      doc: 'product-vision-strategy',
    },
    {
      step: '02',
      title: 'Defining the MVP',
      body: "I scoped the MVP to one decision: GPU sizing for self-managed AI workloads, deliberately cutting model selection guidance, managed AI services, and deployment automation, even though they're all part of the broader problem. A narrow scope meant I could ship something a domain expert could actually evaluate as right or wrong, rather than a broader tool that would embed more untested assumptions.",
      doc: 'product-brief-mvp',
    },
    {
      step: '03',
      title: 'What shipped',
      body: "The result is a working prototype: describe your AI workload and get back a recommended GPU configuration, priced and compared live across AWS, Azure, and Google Cloud, with a plain-language explanation of the reasoning behind it. The sizing math is deterministic, computed the same way every time, while the AI's role is limited to writing the explanation and flagging considerations.",
      link: '/',
    },
    {
      step: '04',
      title: "What's next",
      body: "Next is the step I skipped to build fast: talking to the architects who'd actually use this. I've written a structured discovery plan, including interview rules designed to avoid biasing the findings with my own prototype, to test whether this problem is real, frequent, and painful enough for anyone to want it solved.",
      doc: 'discovery-validation-plan',
      status: 'planned',
    },
  ],

  howIBuiltThis: [
    {
      title: 'Stack',
      body: "AIFA runs on a lightweight stack: a plain HTML/JavaScript frontend, a Vercel serverless backend, and a server-side proxy so API keys never reach the browser. The browser calculates the sizing math itself; the server fetches live pricing from AWS, Azure, and Google Cloud, and calls Claude to write the explanation. I accepted most of Claude Code's architecture suggestions, but not without testing them. An early version loaded a 50MB AWS pricing file into a serverless function and crashed with an out-of-memory error in production, something that worked fine locally but not at scale. I directed the fix, a targeted pricing API instead of a bulk download.",
    },
    {
      title: 'Working with Claude Code',
      body: "I directed every decision in this build and treated Claude Code as an engineer I was responsible for managing, not a black box. Before writing any interface, I had it build the reasoning engine alone and tested it against twenty workload scenarios to make sure the core logic actually worked. I caught real bugs this way: identical inputs producing different GPU recommendations one run to the next, a training workload on Google Cloud that recommended a single GPU when it needed eight. Each time, I worked with Claude to trace the cause, then evaluated its proposed fix and decided whether to accept, redirect, or push further before moving on.",
    },
    {
      title: 'Tradeoffs',
      body: "I built for client-facing advisors first, not internal IT teams, on the assumption that a one-time buyer has little repeat-use value while advisors run this comparison for every client engagement. I'm now testing that assumption. I chose a narrow MVP, one decision (GPU sizing for self-managed workloads), over a broader tool, because a narrow scope could be tested against expert judgment while a broader one would just embed more untested assumptions. And I cut features like saved assessments and accounts that weren't validated or realistically buildable solo, on the principle that shipping something credible mattered more than shipping something complete.",
    },
    {
      title: "What I'd do differently",
      body: "With a team, I'd run 10-15 discovery interviews before writing any code, instead of building from domain knowledge and secondary research alone. A gap I only caught during prototype testing, like GPU sizing that ignored throughput, might have surfaced in week one of real discovery. I'd also have an actual cloud solutions architect validate a sample of recommendations, rather than relying on my own judgment, and I'd A/B test the intake form with real users instead of simplifying it based on my own reliability testing alone.",
    },
  ],

  docs: [
    {
      slug: 'executive-summary',
      title: 'Executive Summary',
      description: 'The full picture: problem, product, and current status, in a few minutes.',
      file: 'content/docs/AIFA_Executive_Summary.md',
    },
    {
      slug: 'product-vision-strategy',
      title: 'Product Vision and Strategy',
      description: 'Why I chose this problem, and where it could go if the hypothesis holds.',
      file: 'content/docs/AIFA_Product_Vision_and_Strategy.md',
    },
    {
      slug: 'product-brief-mvp',
      title: 'Product Brief: MVP',
      description: 'What\'s actually built: scope, users, and the tradeoffs behind each decision.',
      file: 'content/docs/AI_Factory_Advisor_Product_Brief.md',
    },
    {
      slug: 'discovery-validation-plan',
      title: 'Problem Discovery and Validation Plan',
      description: 'The research plan that will test whether this problem is real.',
      file: 'content/docs/AIFA_Problem_Discovery_and_Validation_Plan.md',
      status: 'planned',
    },
  ],
};
