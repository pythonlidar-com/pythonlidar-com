const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
const markdownIt = require("markdown-it");
const markdownItAnchor = require("markdown-it-anchor");
const markdownItAttrs = require("markdown-it-attrs");
const markdownItTaskLists = require("markdown-it-task-lists");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// ---------- helpers ----------

function slugifySegment(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function titleizeSlug(slug) {
  return slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// Pull H1 + first paragraph out of the raw markdown body.
function extractTitleAndIntro(raw) {
  const lines = raw.split(/\r?\n/);
  let title = null;
  let intro = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#\s+(.+?)\s*$/);
    if (m) { title = m[1]; continue; }
    if (title && !intro) {
      const t = lines[i].trim();
      if (t.length > 0 && !t.startsWith("#")) { intro = t; break; }
    }
  }
  return { title, intro };
}

// Strip the leading H1 (we render the title via the layout).
function stripFirstH1(raw) {
  return raw.replace(/^#\s+.+?\r?\n+/, "");
}

// Compute a permalink + depth + breadcrumb chain from the source path.
function pathInfoFor(inputPath) {
  // inputPath looks like ./src/content/<category>/[<topic>/[<tutorial>/]]index.md
  const rel = inputPath.replace(/^\.\//, "");
  const parts = rel.split("/");
  // drop leading "src/content/" prefix and trailing "index.md"
  const contentIdx = parts.indexOf("content");
  const segments = parts.slice(contentIdx + 1, parts.length - 1);
  const depth = segments.length; // 1 = category, 2 = topic, 3 = tutorial
  const permalink = "/" + segments.join("/") + "/";
  return { segments, depth, permalink };
}

// Detect FAQ sections and rewrite them as <details>/<summary> accordions.
// Pattern: a heading "FAQ" or "Frequently Asked Questions" followed by Q/A pairs
// where each question is a subheading or bold line and the answer is the
// following paragraph(s) until the next question or next top-level section.
function transformFaqAccordions(html) {
  // Find an <h2> or <h3> whose text matches FAQ patterns, then capture everything
  // until the next <h2> of equal level. Within that block, treat <h3>/<h4>
  // headings (or <p><strong>...</strong></p>) as questions.
  const faqHeadingRe = /<h([23])[^>]*>\s*(Frequently Asked Questions?|FAQ)\s*<\/h\1>/i;
  const m = html.match(faqHeadingRe);
  if (!m) return html;

  const level = parseInt(m[1], 10);
  const startIdx = m.index;
  const headingEnd = startIdx + m[0].length;

  // Find where the FAQ block ends: next <h{level}> or end of doc.
  const tail = html.slice(headingEnd);
  const stopRe = new RegExp(`<h${level}[^>]*>`, "i");
  const stopMatch = tail.match(stopRe);
  const blockBody = stopMatch ? tail.slice(0, stopMatch.index) : tail;
  const afterBlock = stopMatch ? tail.slice(stopMatch.index) : "";

  // Split blockBody by question markers (h3/h4 or <p><strong>...</strong></p>).
  const qLevel = level + 1;
  const qRe = new RegExp(`<h${qLevel}[^>]*>([\\s\\S]*?)<\\/h${qLevel}>`, "gi");
  const pieces = [];
  let lastIdx = 0;
  let qm;
  while ((qm = qRe.exec(blockBody)) !== null) {
    if (pieces.length === 0 && qm.index > 0) {
      // pre-question intro chunk
      pieces.push({ kind: "intro", html: blockBody.slice(0, qm.index) });
    } else if (pieces.length > 0) {
      pieces[pieces.length - 1].answer = blockBody.slice(lastIdx, qm.index);
    }
    pieces.push({ kind: "q", question: stripTags(qm[1]) });
    lastIdx = qRe.lastIndex;
  }
  if (pieces.length === 0) {
    // No subheading questions found — leave the FAQ section alone.
    return html;
  }
  pieces[pieces.length - 1].answer = blockBody.slice(lastIdx);

  let rebuilt = `<section class="faq" aria-labelledby="faq-heading"><h${level} id="faq-heading">${m[2]}</h${level}>`;
  for (const p of pieces) {
    if (p.kind === "intro") { rebuilt += p.html; continue; }
    rebuilt += `<details class="faq__item"><summary class="faq__q">${p.question}</summary><div class="faq__a">${p.answer || ""}</div></details>`;
  }
  rebuilt += "</section>";

  return html.slice(0, startIdx) + rebuilt + afterBlock;
}

function stripTags(s) {
  return s.replace(/<\/?[^>]+>/g, "").trim();
}

// Wrap every <table> in a horizontally-scrollable container.
function wrapTables(html) {
  return html.replace(/<table([\s\S]*?)<\/table>/g, (_m, inner) => {
    return `<div class="table-scroll"><table${inner}</table></div>`;
  });
}

// Add a copy button + language label to each <pre><code>.
function decorateCodeBlocks(html) {
  // Skip mermaid blocks (they have language-mermaid class)
  return html.replace(/<pre([^>]*)><code([^>]*class="language-(\w+)"[^>]*)>([\s\S]*?)<\/code><\/pre>/g,
    (_m, preAttrs, codeAttrs, lang, body) => {
      if (lang === "mermaid") {
        // strip Prism wrapper, render raw text for mermaid.js
        const text = body
          .replace(/<[^>]+>/g, "")
          .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
        return `<div class="mermaid">${text}</div>`;
      }
      return `<div class="codeblock" data-lang="${lang}"><div class="codeblock__bar"><span class="codeblock__lang">${lang}</span><button class="codeblock__copy" type="button" aria-label="Copy code">Copy</button></div><pre${preAttrs}><code${codeAttrs}>${body}</code></pre></div>`;
    });
}

module.exports = function (eleventyConfig) {
  eleventyConfig.addPlugin(syntaxHighlight);

  // Configure markdown-it with anchors, attrs, task lists.
  const md = markdownIt({ html: true, linkify: false, typographer: true })
    .use(markdownItAnchor, {
      level: [2, 3, 4],
      permalink: markdownItAnchor.permalink.linkInsideHeader({
        symbol: "#",
        placement: "before",
        ariaHidden: false,
        class: "heading-anchor",
      }),
      slugify: s => slugifySegment(s),
    })
    .use(markdownItAttrs)
    .use(markdownItTaskLists, { enabled: true, label: false, lineNumber: false });

  eleventyConfig.setLibrary("md", md);

  // Passthroughs.
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/manifest.webmanifest": "manifest.webmanifest" });
  eleventyConfig.addPassthroughCopy({ "src/sw.js": "sw.js" });
  eleventyConfig.addPassthroughCopy({ "src/favicon.ico": "favicon.ico" });
  eleventyConfig.addPassthroughCopy({ "src/robots.txt": "robots.txt" });
  eleventyConfig.addPassthroughCopy({ "src/_headers": "_headers" });
  eleventyConfig.addPassthroughCopy({ "src/ebbf61361ed3cd6965f2a88f455aae21.txt": "ebbf61361ed3cd6965f2a88f455aae21.txt" });

  // Watch CSS/JS for rebuilds in dev.
  eleventyConfig.addWatchTarget("src/assets/");

  // ---------- collections built from content/ folder ----------

  eleventyConfig.addCollection("contentPages", function (collectionApi) {
    return collectionApi.getAll().filter(item => {
      return item.inputPath && item.inputPath.includes("/content/") && item.inputPath.endsWith("/index.md");
    });
  });

  eleventyConfig.addCollection("categories", function (collectionApi) {
    return collectionApi.getAll()
      .filter(i => i.inputPath && i.inputPath.includes("/content/") && i.inputPath.endsWith("/index.md") && pathInfoFor(i.inputPath).depth === 1)
      .sort((a, b) => a.data.title.localeCompare(b.data.title));
  });

  eleventyConfig.addCollection("topics", function (collectionApi) {
    return collectionApi.getAll()
      .filter(i => i.inputPath && i.inputPath.includes("/content/") && i.inputPath.endsWith("/index.md") && pathInfoFor(i.inputPath).depth === 2);
  });

  eleventyConfig.addCollection("tutorials", function (collectionApi) {
    return collectionApi.getAll()
      .filter(i => i.inputPath && i.inputPath.includes("/content/") && i.inputPath.endsWith("/index.md") && pathInfoFor(i.inputPath).depth === 3);
  });

  // ---------- filters ----------

  eleventyConfig.addFilter("titleize", titleizeSlug);

  // Resolve a URL to a content-page title via a collection (or fall back to titleized slug).
  function resolveLabel(collection, url, slug) {
    if (Array.isArray(collection)) {
      const hit = collection.find(i => i.url === url);
      if (hit && hit.data && hit.data.title) return hit.data.title;
    }
    return titleizeSlug(slug);
  }

  // Build breadcrumbs from a permalink URL.
  // Usage: {{ page.url | breadcrumbs(collections.contentPages) }}
  eleventyConfig.addFilter("breadcrumbs", function (url, collection) {
    const segs = url.split("/").filter(Boolean);
    const crumbs = [{ label: "Home", url: "/" }];
    let acc = "";
    for (const s of segs) {
      acc += "/" + s;
      crumbs.push({ label: resolveLabel(collection, acc + "/", s), url: acc + "/" });
    }
    return crumbs;
  });

  // Build schema.org BreadcrumbList itemListElement array.
  // Usage: {{ page.url | breadcrumbItems(site.url, title, collections.contentPages) }}
  eleventyConfig.addFilter("breadcrumbItems", function (url, siteUrl, pageTitle, collection) {
    const segs = url.split("/").filter(Boolean);
    const items = [{ "@type": "ListItem", "position": 1, "name": "Home", "item": siteUrl + "/" }];
    let acc = "";
    segs.forEach((s, i) => {
      acc += "/" + s;
      const isLast = i === segs.length - 1;
      items.push({
        "@type": "ListItem",
        "position": i + 2,
        "name": isLast && pageTitle ? pageTitle : resolveLabel(collection, acc + "/", s),
        "item": siteUrl + acc + "/"
      });
    });
    return items;
  });

  // Match topics under a category by URL prefix.
  // Usage: {{ collections.topics | childrenOf("/cat/") }}
  eleventyConfig.addFilter("childrenOf", function (collection, url) {
    if (!Array.isArray(collection)) return [];
    return collection.filter(item => {
      if (!item.url || item.url === url) return false;
      if (!item.url.startsWith(url)) return false;
      const tail = item.url.slice(url.length).replace(/\/$/, "");
      return tail.length > 0 && !tail.includes("/");
    });
  });

  // Pick the first item by URL. Usage: {{ collections.x | byUrl("/foo/") }}
  eleventyConfig.addFilter("byUrl", function (collection, url) {
    if (!Array.isArray(collection)) return null;
    return collection.find(i => i.url === url);
  });

  // Strip the first <h1>...</h1> from rendered HTML — layouts render their own.
  eleventyConfig.addFilter("stripH1", function (html) {
    if (!html) return html;
    return html.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>\s*/i, "");
  });

  // ISO date filter for JSON-LD / structured data.
  eleventyConfig.addFilter("isoDate", function (d) {
    if (!d) return "";
    try { return new Date(d).toISOString(); } catch (_) { return ""; }
  });

  // Safely JSON.stringify a value for embedding inside <script type="application/ld+json">.
  eleventyConfig.addFilter("jsonld", function (v) {
    return JSON.stringify(v).replace(/</g, "\\u003c");
  });

  // Append a short content hash as ?v=<hash> to bust long-lived immutable caches.
  // Asset URLs like /assets/css/styles.css resolve to src/assets/css/styles.css on disk.
  eleventyConfig.addFilter("assetHash", function (url) {
    try {
      const filePath = path.join(__dirname, "src", url.replace(/^\//, "").split("?")[0]);
      const hash = crypto.createHash("md5").update(fs.readFileSync(filePath)).digest("hex").slice(0, 8);
      return `${url}?v=${hash}`;
    } catch {
      return url;
    }
  });

  // Section icon by category slug — used in nav + cards.
  eleventyConfig.addShortcode("sectionIcon", function (slug, size = 28) {
    return renderSectionIcon(slug, size);
  });

  // Generic icon (for hero CTA).
  eleventyConfig.addShortcode("icon", function (name, size = 24) {
    return renderIcon(name, size);
  });

  // Post-process rendered HTML for FAQ, tables, code blocks.
  eleventyConfig.addTransform("htmlPolish", function (content, outputPath) {
    if (!outputPath || !outputPath.endsWith(".html")) return content;
    let out = content;
    out = decorateCodeBlocks(out);
    out = wrapTables(out);
    out = transformFaqAccordions(out);
    return out;
  });

  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
    templateFormats: ["njk", "md", "html", "11ty.js"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    dataTemplateEngine: "njk",
    pathPrefix: "/",
  };
};

// ---------- inline SVG icons ----------

function renderSectionIcon(slug, size) {
  const s = size;
  const icons = {
    "pdal-pipeline-architecture-execution": `
      <svg width="${s}" height="${s}" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <defs><linearGradient id="g-pdal" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#5b3df5"/><stop offset="100%" stop-color="#18b6c4"/></linearGradient></defs>
        <rect x="3" y="6" width="8" height="6" rx="2" fill="url(#g-pdal)"/>
        <rect x="12" y="13" width="8" height="6" rx="2" fill="#18b6c4"/>
        <rect x="21" y="20" width="8" height="6" rx="2" fill="#f59e0b"/>
        <path d="M11 9h2c1 0 1 1 1 2v2" stroke="#3b1fb3" stroke-width="1.5" fill="none"/>
        <path d="M20 16h2c1 0 1 1 1 2v2" stroke="#0e9aa6" stroke-width="1.5" fill="none"/>
      </svg>`,
    "point-cloud-data-standards-fundamentals": `
      <svg width="${s}" height="${s}" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <defs><linearGradient id="g-pc" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#18b6c4"/><stop offset="100%" stop-color="#5b3df5"/></linearGradient></defs>
        <circle cx="6" cy="22" r="1.5" fill="#5b3df5"/>
        <circle cx="10" cy="18" r="1.5" fill="#18b6c4"/>
        <circle cx="14" cy="14" r="1.5" fill="#f59e0b"/>
        <circle cx="18" cy="10" r="1.5" fill="#2bb673"/>
        <circle cx="22" cy="14" r="1.5" fill="#5b3df5"/>
        <circle cx="26" cy="18" r="1.5" fill="#18b6c4"/>
        <circle cx="12" cy="24" r="1.5" fill="#18b6c4"/>
        <circle cx="20" cy="22" r="1.5" fill="#f59e0b"/>
        <circle cx="16" cy="20" r="2.2" fill="url(#g-pc)"/>
      </svg>`,
  };
  return icons[slug] || `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="#5b3df5" stroke-width="2"/></svg>`;
}

function renderIcon(name, size) {
  const s = size;
  const i = {
    home: `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 11l9-8 9 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 10v10h14V10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    rocket: `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19c-1 1-2 4-2 4s3-1 4-2" stroke="#f59e0b" stroke-width="1.8" stroke-linecap="round"/><path d="M14 4l6 6-9 9-4 1 1-4 9-9z" stroke="#5b3df5" stroke-width="1.8" stroke-linejoin="round" fill="#ece8ff"/><circle cx="15" cy="9" r="1.5" fill="#18b6c4"/></svg>`,
    layers: `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5 9-5z" fill="#ece8ff" stroke="#5b3df5" stroke-width="1.6"/><path d="M3 13l9 5 9-5" stroke="#18b6c4" stroke-width="1.6" fill="none"/><path d="M3 17l9 5 9-5" stroke="#f59e0b" stroke-width="1.6" fill="none"/></svg>`,
    grid: `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5" fill="#ece8ff" stroke="#5b3df5" stroke-width="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.5" fill="#d9f5f8" stroke="#18b6c4" stroke-width="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.5" fill="#fff0d8" stroke="#f59e0b" stroke-width="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.5" fill="#d6f1e3" stroke="#2bb673" stroke-width="1.6"/></svg>`,
    spark: `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v6M12 15v6M3 12h6M15 12h6" stroke="#f59e0b" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="12" r="2.4" fill="#5b3df5"/></svg>`,
    arrow: `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    book: `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5z" stroke="#5b3df5" stroke-width="1.6" fill="#ece8ff"/><path d="M8 7h8M8 11h8" stroke="#18b6c4" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  };
  return i[name] || i.arrow;
}
