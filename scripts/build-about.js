// Build-time static generator for /about and /about/docs/*.
// Reads content/about.js + content/docs/*.md, writes about.html and
// about/docs/<slug>.html. Run via `npm run build` (also Vercel's buildCommand).
import { marked } from 'marked';
import { mkdir, readFile, writeFile, access } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { about } from '../content/about.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SITE_URL = 'https://aifa-rho.vercel.app';

// External doc links open in a new tab so readers don't lose their place in
// the article; relative/internal links (e.g. to another doc) stay in-tab.
// Headings are shifted down one level (# -> h2) so the doc-page <h1> (the
// title in the page header) stays the only h1 on the page.
const docRenderer = new marked.Renderer();
docRenderer.link = function ({ href, title, tokens }) {
  const text = this.parser.parseInline(tokens);
  const isExternal = /^https?:\/\//i.test(href);
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
  const externalAttrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `<a href="${href}"${titleAttr}${externalAttrs}>${text}</a>`;
};
docRenderer.heading = function ({ tokens, depth }) {
  const text = this.parser.parseInline(tokens);
  const level = Math.min(depth + 1, 6);
  return `<h${level}>${text}</h${level}>\n`;
};
marked.use({ renderer: docRenderer });

const FONT_LINKS = `
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/public/about-theme.css" />`;

// Vercel Web Analytics — requires "Web Analytics" enabled in the Vercel
// project dashboard; the script is then served by Vercel automatically.
const ANALYTICS_SCRIPT = `
  <script defer src="/_vercel/insights/script.js"></script>`;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function metaTags({ title, description, path }) {
  const url = `${SITE_URL}${path}`;
  const image = `${SITE_URL}${about.headshot}`;
  return `
  <meta name="description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:url" content="${url}" />`;
}

function readingMinutes(markdown) {
  const words = markdown.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

function docBySlug(slug) {
  const doc = about.docs.find((d) => d.slug === slug);
  if (!doc) throw new Error(`No doc entry for slug "${slug}"`);
  return doc;
}

function storyStepLink(step) {
  if (step.link) {
    return { href: step.link, label: step.link === '/' ? 'Open the app →' : 'Read the plan →' };
  }
  const doc = docBySlug(step.doc);
  return { href: `/about/docs/${doc.slug}`, label: 'Read the doc →' };
}

function renderStoryStep(step) {
  const { href, label } = storyStepLink(step);
  const planned = step.status === 'planned';
  return `
        <div class="story-step${planned ? ' is-planned' : ''}">
          <span class="story-step-num">${escapeHtml(step.step)}</span>
          <h3>${escapeHtml(step.title)}</h3>
          <p>${escapeHtml(step.body)}</p>
          ${planned ? '<span class="story-badge-planned">Planned</span>' : ''}
          <a href="${href}">${label}</a>
        </div>`;
}

function renderBuiltBlock(block) {
  return `
        <div class="built-block">
          <h3>${escapeHtml(block.title)}</h3>
          <p>${escapeHtml(block.body)}</p>
        </div>`;
}

function renderAboutPage(readingMinutesBySlug) {
  const execSummary = docBySlug('executive-summary');
  const execMinutes = readingMinutesBySlug[execSummary.slug];

  const title = `About ${about.name} — AIFA`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>${metaTags({ title, description: about.headline, path: '/about' })}${FONT_LINKS}${ANALYTICS_SCRIPT}
</head>
<body>
  <div class="about-page">
    <div class="about-topbar">
      <a href="/">← Back to AIFA</a>
    </div>

    <header class="about-header">
      <img class="about-headshot" src="${about.headshot}" alt="${escapeHtml(about.name)}" />
      <h1>${escapeHtml(about.name)}</h1>
      <p class="about-headline">${escapeHtml(about.headline)}</p>
      <p class="about-bio">${escapeHtml(about.bio)}</p>
      <div class="about-links">
        <a class="about-link-chip" href="${about.links.linkedin}">LinkedIn</a>
        <a class="about-link-chip" href="${about.links.github}">GitHub</a>
        <a class="about-link-chip" href="mailto:${about.links.email}">Email</a>
      </div>
      <div class="about-cta-row">
        <a class="about-cta" href="/">${escapeHtml(about.ctaLabel)}</a>
        <a class="about-exec-link" href="/about/docs/${execSummary.slug}">Read the executive summary (${execMinutes} min)</a>
      </div>
    </header>

    <section class="about-section">
      <h2>The story</h2>
      <p class="about-section-intro">${escapeHtml(about.storyIntro)}</p>
      <div class="story-grid">${about.story.map(renderStoryStep).join('')}
      </div>
    </section>

    <section class="about-section">
      <h2>How I built this</h2>
      <div class="built-grid">${about.howIBuiltThis.map(renderBuiltBlock).join('')}
      </div>
    </section>

    <section class="about-contact">
      <h2>Interested in talking?</h2>
      <div class="about-contact-links">
        <a href="mailto:${about.links.email}">${escapeHtml(about.links.email)}</a>
        <a href="${about.links.linkedin}">LinkedIn</a>
      </div>
      <p class="about-back"><a href="/">← Back to app</a></p>
    </section>
  </div>
</body>
</html>
`;
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function renderDocPage(doc, minutes) {
  const mdPath = join(ROOT, doc.file);
  const markdown = await readFile(mdPath, 'utf8');
  const articleHtml = marked.parse(markdown);
  const planned = doc.status === 'planned';

  const pdfPath = join(ROOT, 'public', 'docs', `${doc.slug}.pdf`);
  const hasPdf = await fileExists(pdfPath);

  const title = `${doc.title} — About ${about.name}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>${metaTags({ title, description: doc.description, path: `/about/docs/${doc.slug}` })}${FONT_LINKS}${ANALYTICS_SCRIPT}
</head>
<body>
  <div class="about-page">
    <header class="doc-header">
      <a class="doc-back" href="/about">← Back to About</a>
      <h1>${escapeHtml(doc.title)}</h1>
      ${planned ? '<span class="doc-badge-planned">Planned — not yet executed</span>' : ''}
      ${hasPdf ? `<a class="doc-download" href="/public/docs/${doc.slug}.pdf">Download PDF</a>` : ''}
    </header>
    <article class="doc-article">
${articleHtml}
    </article>
    <p class="doc-footer-back"><a class="doc-back" href="/about">← Back to About</a></p>
  </div>
  <!-- reading time: ~${minutes} min -->
</body>
</html>
`;
}

async function main() {
  const readingMinutesBySlug = {};
  for (const doc of about.docs) {
    const markdown = await readFile(join(ROOT, doc.file), 'utf8');
    readingMinutesBySlug[doc.slug] = readingMinutes(markdown);
  }

  await writeFile(join(ROOT, 'about.html'), renderAboutPage(readingMinutesBySlug));

  const docsDir = join(ROOT, 'about', 'docs');
  await mkdir(docsDir, { recursive: true });

  for (const doc of about.docs) {
    const html = await renderDocPage(doc, readingMinutesBySlug[doc.slug]);
    await writeFile(join(docsDir, `${doc.slug}.html`), html);
  }

  console.log(`Built about.html + ${about.docs.length} doc page(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
