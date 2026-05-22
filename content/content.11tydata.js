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
function shortTitle(h1) {
  if (!h1) return "";
  let s = h1.replace(/\s+/g, " ").trim();
  // Prefer the segment before a long-dash or hyphen
  const dashMatch = s.match(/^(.+?)\s*[—–-]\s+/);
  if (dashMatch && dashMatch[1].length >= 8 && dashMatch[1].length <= 60) return dashMatch[1].trim();
  // Else split on colon if first part is meaningful
  const colonIdx = s.indexOf(":");
  if (colonIdx > 8 && colonIdx <= 60) return s.slice(0, colonIdx).trim();
  // Else truncate on word
  return truncateOnWord(s, 58);
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
      const raw = readRaw(data.page.inputPath);
      const m = raw.match(/^#\s+(.+?)\s*$/m);
      return m ? m[1] : titleize(data.page.fileSlug || "Untitled");
    },
    seoTitle: (data) => {
      const raw = readRaw(data.page.inputPath);
      const m = raw.match(/^#\s+(.+?)\s*$/m);
      const t = m ? m[1] : titleize(data.page.fileSlug || "Untitled");
      return shortTitle(t);
    },
    metaDescription: (data) => {
      const raw = readRaw(data.page.inputPath);
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
      const raw = readRaw(data.page.inputPath);
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
