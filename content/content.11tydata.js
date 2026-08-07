const fs = require("fs");

function titleize(slug) {
  return slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function readRaw(inputPath) {
  try { return fs.readFileSync(inputPath, "utf8"); } catch (_) { return ""; }
}

function depthFor(inputPath) {
  const parts = inputPath.split("/");
  const contentIdx = parts.indexOf("content");
  return parts.length - contentIdx - 2;
}

function truncateOnWord(s, max) {
  s = String(s || "").trim();
  if (s.length <= max) return s;
  let cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > max * 0.6) cut = cut.slice(0, lastSpace);
  return cut.replace(/[.,;:!?-]+$/, "") + "…";
}

// Derive a short, search-engine-friendly title from the H1.
// Strategies: take text before " — " or " - " or first colon; otherwise truncate on word.
// Note: replace & with "and" to avoid HTML entity inflation (&amp; = 5 chars vs 1).
function shortTitle(h1) {
  if (!h1) return "";
  let s = h1.replace(/\s+/g, " ").trim().replace(/\s*&\s*/g, " and ");
  // Prefer the segment before a long-dash or hyphen
  const dashMatch = s.match(/^(.+?)\s*[—–-]\s+/);
  if (dashMatch && dashMatch[1].length >= 8 && dashMatch[1].length <= 60) return dashMatch[1].trim();
  // Else split on colon if first part is meaningful
  const colonIdx = s.indexOf(":");
  if (colonIdx > 8 && colonIdx <= 60) return s.slice(0, colonIdx).trim();
  // Else truncate on word (48 keeps encoded title + " — Site" suffix under 65 chars)
  return truncateOnWord(s, 48);
}

// Strip fenced code blocks (``` ... ```) so that Python/bash comment lines
// beginning with "#" are not mistaken for Markdown H1 headings.
function stripCodeFences(raw) {
  return raw.replace(/^```[\s\S]*?^```/gm, "");
}

// Extract the "title:" field from YAML frontmatter (--- ... ---), if present.
function frontmatterTitle(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const titleMatch = m[1].match(/^title:\s*["']?(.+?)["']?\s*$/m);
  return titleMatch ? titleMatch[1] : null;
}

module.exports = {
  tags: ["contentPage"],
  eleventyComputed: {
    permalink: (data) => {
      const parts = data.page.inputPath.split("/");
      const contentIdx = parts.indexOf("content");
      const segs = parts.slice(contentIdx + 1, parts.length - 1);
      return "/" + segs.join("/") + "/";
    },
    depth: (data) => depthFor(data.page.inputPath),
    sectionSlug: (data) => {
      const parts = data.page.inputPath.split("/");
      const contentIdx = parts.indexOf("content");
      return parts[contentIdx + 1];
    },
    layout: (data) => {
      const d = depthFor(data.page.inputPath);
      if (d === 1) return "layouts/category.njk";
      if (d === 2) return "layouts/topic.njk";
      return "layouts/tutorial.njk";
    },
    title: (data) => {
      const rawFile = readRaw(data.page.inputPath);
      // 1. If the source frontmatter already declares a title, honour it.
      const fmTitle = frontmatterTitle(rawFile);
      if (fmTitle) return fmTitle;
      // 2. Otherwise extract the first real H1 from the markdown body,
      //    skipping fenced code blocks so Python `# comment` lines are ignored.
      const raw = stripCodeFences(rawFile);
      const m = raw.match(/^#\s+(.+?)\s*$/m);
      if (m) return m[1];
      // 3. Last resort: derive from the directory slug (avoids returning "Index").
      const parts = data.page.inputPath.split("/");
      const contentIdx = parts.indexOf("content");
      const seg = parts[contentIdx + 1] || data.page.fileSlug || "Untitled";
      return titleize(seg);
    },
    headTitle: (data) => {
      const rawFile = readRaw(data.page.inputPath);
      const fmTitle = frontmatterTitle(rawFile);
      const raw = stripCodeFences(rawFile);
      const m = raw.match(/^#\s+(.+?)\s*$/m);
      const t = fmTitle || (m ? m[1] : titleize(data.page.fileSlug || "Untitled"));
      return shortTitle(t);
    },
    metaDescription: (data) => {
      const raw = stripCodeFences(readRaw(data.page.inputPath));
      const stripped = raw.replace(/^#\s+.+\r?\n+/, "");
      const para = stripped.split(/\r?\n\s*\r?\n/).find(p => p.trim().length > 0) || "";
      const text = para
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/[*_#>]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      return truncateOnWord(text, 158);
    },
    bodyHasH1: (data) => {
      const raw = stripCodeFences(readRaw(data.page.inputPath));
      return /^#\s+.+/m.test(raw);
    },
    sourceMtime: (data) => {
      try {
        return fs.statSync(data.page.inputPath).mtime.toISOString();
      } catch (_) {
        return new Date().toISOString();
      }
    },
  },
};
