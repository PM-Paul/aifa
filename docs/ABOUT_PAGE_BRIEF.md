# Brief: Add an "About" page to this app

Save this file as `docs/ABOUT_PAGE_BRIEF.md` in the repo, then tell Claude Code:
"Read docs/ABOUT_PAGE_BRIEF.md and start with Phase 1. Do not skip the check-in points."

---

## Why this page exists

This app is a Product Management portfolio project. I'm adding a public **About** page so hiring managers can, in under a minute, understand what I built, see the PM process behind it, and open the supporting documents. The two messages the page must land: I follow a real product process, and I can ship a working product and learn new skills.

## Ground rules

1. **Do not write my copy.** Every piece of prose on this page (headline, story paragraphs, "How I built this" blurbs, document descriptions) must come from me. When you reach a point where copy is needed, stop and ask me for it. Do not draft it from my documents, do not fill in placeholders with your own summaries, and do not deploy to production with placeholder or draft text. Placeholders like `[TODO: your text]` are fine during development so the layout can be reviewed. If I explicitly ask you to draft something, label it clearly as a draft in the content file.
2. **Reuse before you create.** Match the existing app's fonts, colors, spacing, and components. This page should feel like part of the same product, not a bolted-on portfolio.
3. **No new services.** No CMS, analytics, contact forms, databases, or environment variables. Static content only.
4. **Check in at the marked points.** Don't run ahead past a check-in without my confirmation.
5. **Small, reviewable commits** on a feature branch. Deploy to a Vercel preview, not production, until I approve.

---

## Phase 1 — Discovery (check in before coding)

Inspect the repo and report back on:

- Framework and routing (Next.js App/Pages Router, Vite + React, other?). Where would a new route live?
- Styling system and any component library in use.
- Whether a shared layout/header/footer exists. The app is currently a single page with no main navigation.
- Any existing Markdown/MDX tooling (`@next/mdx`, `react-markdown`, `remark`, `gray-matter`, etc.).
- Auth: confirm `/about` and `/about/docs/*` can be fully public and outside any guard/middleware.
- Vercel config: production branch, `vercel.json`, anything that affects adding routes.
- **Static assets.** Identify where static files (images, PDFs) belong in this setup and tell me the exact path to place my headshot. Note: there is an empty capitalized `Public/Drop Box/` folder at the repo root that I did not create intentionally — check whether anything references it; if not, flag it for removal in the tidiness assessment.
- **Repo tidiness assessment.** A hiring manager may click through to GitHub. Evaluate and give me a short list of recommendations (do not act yet): Is the README accurate and does it explain what the app is, how to run it, and the stack? Is there a `.gitignore` covering `node_modules`, `.env*`, build output? Are there any committed secrets, stray files, or junk in the root? Is the commit history reasonable? Rate each item as fine / worth fixing / must fix.

Then recommend a Markdown rendering approach (see Phase 3) and list any dependencies you'd add.

**⏸ CHECK-IN 1:** Share findings, tidiness recommendations, and proposed approach. Wait for my go-ahead.

---

## Phase 2 — Content model and page scaffold

Create a single content file (e.g. `content/about.ts` or `content/about.json` — match repo conventions) that holds all page copy and data. Nothing user-facing should be hard-coded in components.

```ts
// Shape, not literal code — adapt to the repo
{
  name, headline, bio,
  headshot: "/images/headshot.jpg",     // I will provide the file; adjust path per Phase 1 findings
  links: { linkedin, github, email },
  ctaLabel: "Try the app",              // I may rename this
  story: [
    { step: "01", title, body, doc: "product-vision-strategy" },
    { step: "02", title, body, doc: "product-brief-mvp" },
    { step: "03", title, body, link: "/" },            // the app itself
    { step: "04", title, body, doc: "discovery-validation-plan", status: "planned" }
  ],
  howIBuiltThis: [
    { title: "Stack", body },
    { title: "Working with Claude Code", body },
    { title: "Tradeoffs", body },
    { title: "What I'd do differently", body }
  ],
  docs: [
    { slug, title, description, readingMinutes, status?: "planned", file: "content/docs/<slug>.md" }
  ]
}
```

Documents I have (I'll provide the files as Markdown, or ask me to convert if you'd prefer another format):

| slug | title | role |
|---|---|---|
| `executive-summary` | Executive Summary | "read this one thing" link in header |
| `product-vision-strategy` | Product Vision and Strategy | story step 01 |
| `product-brief-mvp` | Product Brief: MVP | story step 02 |
| `discovery-validation-plan` | Problem Discovery and Validation Plan | story step 04, status: planned |

Build the page at `/about` with these blocks, top to bottom:

1. **Top bar** — "← Back to [App name]" link. Small, unobtrusive.
2. **Header** — headshot (circular, ~72–96px), name, headline, a row of link chips (LinkedIn, GitHub, Email), a primary "Try the app" button linking to `/`, and a secondary text link "Read the executive summary (N min)".
3. **The story** — short intro paragraph, then four steps. On desktop: four columns or a horizontal timeline. On mobile: vertical stack. Each step shows step number, title, 1–3 sentence body, and a link ("Read the doc →" / "Open the app →" / "Read the plan →"). Step 04 is visually marked as planned (dashed border or a small "Planned" badge) — it must not read as completed work.
4. **How I built this** — heading plus four short blocks (Stack, Working with Claude Code, Tradeoffs, What I'd do differently). Four columns on desktop, stacked on mobile.
5. **Contact footer** — "Interested in talking?" with email and LinkedIn links, and a "Back to app" link.

Do **not** build a separate "Documents" library section for now — every doc is linked from the story. Keep the `docs` array as the single source of truth so a library section can be added later if the doc count grows.

Also add a discreet **"About" link to the existing app** — a small link in the app's header/corner if one exists, otherwise a small footer or corner link. It should not compete with the product UI. If there's an obvious better placement given the app's layout, propose it.

**⏸ CHECK-IN 2:** Once the scaffold renders with `[TODO]` placeholders, show me a preview and ask me for the copy. Ask section by section — headline and bio; the story intro and each step's body; each "How I built this" block (I already have Tradeoffs and What I'd do differently written — I'll paste them). For each doc's one-line description, default to the first sentence of the document itself and show me what you'd use; I'll rewrite any I don't like. Descriptions are used only for page metadata and the executive summary link in the header, since there is no document library section in v1. Put my answers into the content file verbatim unless I ask you to edit.

---

## Phase 3 — Document pages

Each doc renders at `/about/docs/[slug]`:

- Store Markdown files in `content/docs/`. Use front-matter (title, description, readingMinutes, status) if that fits the chosen tooling; otherwise the `docs` array in the content file is the metadata source.
- Render as a clean article: app typography, comfortable reading width (~65–75ch), headings/lists/tables/code preserved, links open in the same tab unless external.
- Page header: doc title, a "← Back to About" link, and a "Planned — not yet executed" badge when `status: "planned"`.
- Optional "Download PDF" button if a matching `/public/docs/<slug>.pdf` exists.
- Prefer static generation (build-time) so pages load instantly. Use whatever the framework does natively (Next.js MDX or `generateStaticParams` + `react-markdown` / `remark-gfm` + `gray-matter`, or Vite equivalents). Keep new dependencies to the minimum you listed in Phase 1.
- Every doc has a stable URL so I can link to a specific doc from my resume or messages.

---

## Phase 4 — Metadata, polish, verification

- `<title>`: "About [Name] — [App name]". Meta description from my headline/bio. Basic Open Graph tags (title, description, image using the headshot or an app screenshot) so LinkedIn previews look right. Same for each doc page.
- Semantic headings (one h1, then h2/h3), alt text on the headshot, focus states on links.
- Verify at 375px and 1280px: no horizontal scroll, story and "How I built this" stack cleanly on mobile.
- Click every link and doc. Confirm `/about` and every `/about/docs/*` return 200 unauthenticated (incognito).
- Run lint, typecheck, and a production build. Fix anything new you introduced.

---

## Phase 5 — Repo tidy-up (only items I approve from Check-in 1)

Based on my response to your tidiness recommendations: update the README (what the app is, why it exists, stack, how to run locally, link to `/about`), fix `.gitignore` gaps, remove junk files. Do not rewrite git history without asking.

---

## Phase 6 — Deploy for review

Push the branch, confirm the Vercel preview builds, and give me:

- The preview URL
- List of files added/changed
- Any dependencies added
- One-paragraph instructions for adding a new document in the future (drop file in `content/docs/`, add one entry to `docs`)

**⏸ CHECK-IN 3:** Wait for my approval before merging to the production branch.

---

## Acceptance criteria

- [ ] `/about` and all `/about/docs/*` are public and return 200 in an incognito window on production.
- [ ] Every string of user-facing copy came from me; no placeholder or Claude-drafted text remains.
- [ ] Page matches the app's existing look and feel; no global style changes.
- [ ] Story step 04 and the discovery plan doc are clearly labeled as planned.
- [ ] Renders correctly at mobile and desktop widths.
- [ ] Every link and document opens; no 404s.
- [ ] Lint, typecheck, and build pass.
- [ ] Adding a document requires only a new Markdown file and one entry in the content file.
- [ ] README updated; no secrets or junk in the repo.

## Things to ask me about if unclear

- The exact label for the primary button ("Try the app" vs. something specific to what the app does).
- Whether to include an app screenshot in story step 03.
- Whether any document contains sensitive names or data that should be scrubbed before publishing.
