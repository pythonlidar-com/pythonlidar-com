# Build Checklist — pythonlidar.com

A step-by-step plan for generating the **Python LiDAR & Point Cloud Workflows** static site with 11ty. Each block below is a discrete, verifiable build step.

---

## 1. Project scaffold

- [x] Create `package.json` with scripts: `build`, `serve`, `clean`.
- [x] Install dev deps: `@11ty/eleventy`, `@11ty/eleventy-plugin-syntaxhighlight`, `@11ty/eleventy-navigation`, `markdown-it`, `markdown-it-anchor`, `markdown-it-attrs`, `markdown-it-task-lists`, `markdown-it-mark`.
- [x] Create `.eleventy.js` config:
  - input `src/` + content collections sourced from `content/`
  - output `_site/`
  - passthrough copies for `src/assets/**`, `src/sw.js`, `src/manifest.webmanifest`
  - register Nunjucks layouts and shortcodes
  - register markdown-it plugins (anchors with header-offset friendly slugs, task lists, attrs)
  - build collections: `categories`, `topics`, `tutorials`
- [x] Create directory tree:
  - `src/_includes/layouts/{base,home,category,topic,tutorial}.njk`
  - `src/_includes/partials/{header,footer,breadcrumbs,nav-related,icon}.njk`
  - `src/_data/site.js` (site name, url, palette, sections)
  - `src/assets/{css,js,img}`

## 2. Brand & color scheme (light, point-cloud inspired)

- [x] Color tokens (CSS custom properties in `src/assets/css/tokens.css`):
  - `--c-bg: #fafaf7;` (soft cream)
  - `--c-surface: #ffffff;`
  - `--c-surface-soft: #f1f3f9;` (code/inline bg)
  - `--c-text: #1f2740;` (deep slate)
  - `--c-text-soft: #4d5573;`
  - `--c-border: #e3e6ef;`
  - `--c-primary: #5b3df5;` (laser violet)
  - `--c-primary-deep: #3b1fb3;`
  - `--c-accent: #18b6c4;` (point-cloud teal)
  - `--c-accent-warm: #f59e0b;` (CTA amber)
  - `--c-success: #2bb673;`
  - shadows + radii
- [x] Custom SVG logo: stacked LiDAR scan rings + scatter of points, gradient violet→teal.
- [x] Generate `favicon.svg`, `favicon.ico` (fallback), `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (180×180), `maskable-512.png`.

## 3. Base layout, header, footer

- [x] `base.njk`: HTML5 shell, meta viewport, theme-color, manifest link, apple-touch-icon, SW registration.
- [x] Sticky header (`position: sticky; top: 0`) with logo (links home), nav items (Home + each category), inline SVG icons + text, current-page indicator (`aria-current="page"`), hamburger on mobile.
- [x] Footer: site name, section links (Home + categories + every topic), copyright; flex layout that pins to bottom on short pages (`min-height: 100dvh` on body + flex column).
- [x] CSS scroll offset for in-page anchors: `html { scroll-padding-top: var(--header-h); }`.

## 4. Homepage

- [x] `src/index.njk` using `layouts/home.njk`:
  - Hero: site name, tagline, 2–3 paragraph description.
  - CTA buttons (one per main category + one to "All topics"), each with a unique colorful SVG icon, hover lift + glow.
  - Description block of what the content pages contain.
  - Two "category card" sections previewing each top-level category with links to topic pages and tutorial chips.
- [x] Wide desktop layout: max content width ~1320px, grid layouts for cards.

## 5. Content pipeline (categories, topics, tutorials)

- [x] Auto-detect content depth from path (`content/<category>/index.md`, `content/<category>/<topic>/index.md`, `content/<category>/<topic>/<tutorial>/index.md`).
- [x] Set permalink to mirror folder path (matches existing internal links like `/pdal-pipeline-architecture-execution/spatial-reprojection/`).
- [x] Auto-derive title from first H1, strip H1 from rendered body (use as page title), generate description from first paragraph.
- [x] Build breadcrumb data from URL segments.
- [x] Build related-content nav: for a category page, list its topics; for a topic, list sibling topics + child tutorials; for a tutorial, link back up.

## 6. Markdown rendering & code blocks

- [x] Headings: anchor links, generous spacing, gradient underline on H2.
- [x] Paragraphs: 1.65 line-height, comfortable measure but using full container width on desktop (no narrow column).
- [x] Inline `code`: light surface bg, monospace, no border, subtle padding, blends with body text.
- [x] Fenced code blocks: Prism syntax highlighting with custom theme matching site palette on a light background; rounded corners; language label; **Copy** button (vanilla JS, `navigator.clipboard`, "Copied!" feedback).
- [x] QA pass: scan every content file's code blocks for:
  - balanced braces/brackets
  - consistent indentation (4-space Python, 2-space JSON)
  - working language tag on the fence
- [x] Mermaid scan: identify any code block that's actually a diagram (ASCII art, arrow graphs, sequence text). Convert to ```mermaid``` fences. Theme mermaid via init block to use site palette.
- [x] Tables: wrap in `.table-scroll` div for horizontal scroll on narrow viewports; striped, bordered, styled headers.
- [x] Links: primary color, underline-on-hover with offset, distinct visited treatment optional, external link icon only if any remain (per req, no new external links).
- [x] Task list items (`- [ ]`): render as interactive checkboxes (markdown-it-task-lists), remove the leading bullet dot via CSS, toggle state in JS, line-through label when checked.
- [x] FAQ accordions: any heading matching `## FAQ` or `## Frequently Asked Question(s)` is captured and following Q/A pairs are rendered as `<details><summary>` accordions, styled.

## 7. Page-level UI features

- [x] Hover effects on cards, buttons, nav, links: subtle translate-Y, shadow, color shift.
- [x] Responsive breakpoints: ≤640 mobile, 641–1024 tablet, 1025+ desktop, 1440+ widescreen (extra padding + larger grid gutters).
- [x] Sticky header offset for in-page anchors via `scroll-padding-top`.

## 8. PWA

- [x] `manifest.webmanifest`: name, short_name, start_url `/`, display `standalone`, theme/background colors, icons (192, 512, maskable), categories.
- [x] Apple meta tags: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon` link.
- [x] `sw.js`: precache shell (`/`, `/offline.html`, CSS, JS, logo, manifest); runtime caching:
  - HTML → stale-while-revalidate
  - CSS/JS/images → cache-first with versioned cache name
  - fallback to `/offline.html` on navigation failure
- [x] Register SW from `base.njk` only on `https://` or `localhost`.

## 9. Accessibility & meta

- [x] Semantic landmarks (`<header>`, `<nav>`, `<main>`, `<footer>`).
- [x] Skip link.
- [x] Focus styles on every interactive element.
- [x] Per-page `<title>` and meta description.
- [x] Open Graph + Twitter card tags using site logo.

## 10. Build & verify

- [x] `npm run build` produces `_site/` with index, both category pages, every topic and tutorial.
- [x] All internal links (the ones already in content) resolve to real pages.
- [x] Spot-check responsive layout in a few widths via simple HTML inspection.
- [x] Verify `favicon.ico`, manifest, and SW are reachable at root.
- [x] Mark every checklist item above as `[x]` once verified.

---

## Content inventory (for reference)

**Category A — PDAL Pipeline Architecture & Execution**
- spatial-reprojection
  - reprojecting-point-clouds-from-utm-to-wgs84
- pdal-stage-chaining
  - chaining-pdal-stages-for-data-cleaning
- memory-management
- parallel-execution
  - optimizing-pdal-for-multi-core-processing
- pipeline-filtering-logic
  - applying-statistical-outlier-filters-in-pdal
- attribute-mapping
  - mapping-custom-attributes-in-pdal-pipelines
- pipeline-validation

**Category B — Point Cloud Data Standards & Fundamentals**
- laslaz-file-structure
  - how-to-parse-las-headers-with-python
- metadata-header-sync
  - syncing-metadata-between-las-and-shapefiles
- point-density-metrics
  - calculating-point-density-for-drone-surveys
- asprs-classification-codes
  - understanding-asprs-classification-codes
- coordinate-reference-systems
  - fixing-crs-mismatches-in-point-clouds
