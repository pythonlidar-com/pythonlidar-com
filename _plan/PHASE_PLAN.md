# Phase plan — pythonlidar.com

> The schedule to grow this site phase-by-phase, generated from the Django `Site` model. **No OpenRouter / no API** — you (Claude Code) do the work, grounded in the real markdown under `content/`.

- **Niche:** Python LiDAR & Point Cloud Processing Workflows
- **Audience:** LiDAR analysts, Python GIS devs, surveying tech teams, infrastructure/urban planning engineers
- **Live now:** 24 pages, 28,641 words
- **Current phase:** foundation
- **Next phase to build:** expansion

## How to upgrade a phase

Work through every step in order. **Do not skip the uplift, the term cleanup, the SVG render check, or the finish/deploy steps** — those were the gaps in earlier runs.

1. **Read & orient.** Read this whole file, then skim `content/` to learn what exists and the writing tone.
2. **Uplift EVERY existing page (not just new ones).** Bring all current pages — from earlier phases — up to the Page blueprint below: its page anatomy, frontmatter, JSON-LD schema, the custom SVG visuals, and the mandatory wiki-style interlinking. Old pages must reach the *current* standard, not be left as they were. Two presentation fixes that apply site-wide:
   - **Convert any Mermaid diagrams to hand-authored inline SVGs** (in the "Custom visuals" style). No `mermaid` code fences, `.mermaid` containers, or mermaid runtime may remain — the `mermaid_check` gate enforces this.
   - **Restyle inline `<code>` to blend with the prose** — no background box or border, body-text colour, and not coloured like a link (this is a CSS change in the site's stylesheet; block code in `<pre>` keeps its box). The `inline_code_check` gate enforces this.
3. **Build the next phase.** Add this phase's page mix (see schedule), slotting pages into the existing hierarchy, each built to the same blueprint standard.
4. **Upgrade the homepage AND site navigation to reflect the new content.** This is mandatory every phase — new pages must not be left orphaned or unreachable:
   - **Navigation:** update the primary/header nav, footer, and any nav data/menu files (e.g. `_data/nav.*`, `_data/menu.*`, layout includes). Every section/topic area must be reachable from the nav; remove links to pages that no longer exist.
   - **Homepage:** refresh the hero, the section/topic cards, any "featured", "start here", "popular" or "latest" lists, and any counts/overview copy — surface the newly added sections and the strongest new pages.
   - **Site-wide:** ensure breadcrumbs and `sitemap.xml` include the new URLs, and wire the new pages in with the same wiki-style interlinking standard.
5. **Keep it niche-specific.** Section topics must be drawn from this niche, not generic placeholders.
6. **Remove internal IA/SEO terms from visible copy.** The words *pillar*, *cluster*, *long-tail* (and "hub and spoke", "supporting page", etc.) are internal labels — they must not appear in reader-facing prose. Scan and fix:

   ```bash
   python3 /home/martin/WebstormProjects/_qa/term_lint.py pythonlidar.com
   ```
   (Legit domain uses of "cluster" — e.g. a Kafka/DB cluster — are fine; rewrite only the information-architecture sense.)
7. **Author custom SVG visuals** per the "Custom visuals" section, then **build the site and verify the SVGs render correctly ON THE PAGE** — the page's CSS/typography must not leak in and break them. Fix and rebuild until clean:

   ```bash
   cd /home/martin/WebstormProjects/pythonlidar.com && npm run build
   python3 /home/martin/WebstormProjects/_qa/qa_gates.py pythonlidar.com
   ```
   `qa_gates.py` runs every shared deterministic gate against the BUILT site and must report `ALL PASS`: term_lint (IA/SEO term leaks), svg_check (inline-SVG validity + hidden/overlapping/clipped/low-contrast labels), mermaid_check (no Mermaid left un-converted to SVG), inline_code_check (inline <code> blends with prose — no box/border, body colour, not link-like), a11y_check (FULL-PAGE WCAG 2 A/AA via axe-core — contrast, alt text, link names, lang, duplicate ids, heading order, keyboard-scrollable regions), links_check (internal links + anchors resolve), jsonld_check (structured-data validity), seo_meta_check (title/description/canonical/og/one-h1 + cross-page duplicates), render_check (no uncaught JS errors / broken same-origin assets), markup_lint (no unrendered markdown or template leakage), sitemap_check (sitemap ↔ built pages), dup_content_check (no near-duplicate article prose), and perf_check (Lighthouse mobile performance budget over a sampled set). Fix the site until every gate passes.
8. **Record completion** (re-runs `qa_gates` and will NOT advance the phase unless they all pass; then updates page/word count, advances current→next phase, and rewrites this plan ready for the next phase). From the Django project (`/home/martin/PycharmProjects/Django-Pillar-Cluster-Long-Tail`):

   ```bash
   .venv/bin/python manage.py finish_phase pythonlidar.com --completed expansion \
       --blueprint "/home/martin/WebstormProjects/pythonlidar.com/_plan/blueprint.json"
   ```
9. **Commit & deploy.** Build, deploy to Cloudflare, and push to GitHub:

   ```bash
   cd /home/martin/WebstormProjects/pythonlidar.com
   npm run deploy          # build + wrangler deploy (auth from the site .env)
   git add -A && git commit -m "Upgrade to expansion phase" && git push
   ```

## QA refresh (uplift to standard — NO new phase)

Use this when you want to bring the site **fully up to the current standard and pass every gate, without building the next phase** — the site stays on its current phase (`foundation`).

### Automated (recommended)

Run **`/qa-refresh`** (or just say *"do a QA refresh"*) — it runs the `qa_refresh` workflow for this site, which performs everything below automatically: rewrites every page to standard (incl. hand-authored SVGs and Mermaid→SVG), restyles inline code + homepage + navigation, then builds, fixes until every gate passes, records the uplift and deploys. Direct call:

   ```
   Workflow({scriptPath: "/home/martin/WebstormProjects/_qa/qa_refresh_workflow.js", args: "pythonlidar.com"})
   ```

### Manual (what the workflow does, step by step)

**`refresh_site` does NOT do the uplift for you — YOU must do the actual work first.** It is only the bookkeeping/verification step: it re-syncs counts, re-detects the phase (no advance), re-exports this plan, and runs `qa_gates`. It will **refuse to record the uplift unless every gate passes**, so you cannot mark a site "uplifted" without having genuinely rewritten the pages and fixed the SVGs.

Do the checklist above **but SKIP step 3 (Build the next phase)** — i.e. actually rewrite EVERY existing page to the blueprint (2: anatomy, frontmatter, schema, wiki interlinking, hand-authored SVGs, no Mermaid, blended inline code), update homepage & navigation (4), keep it niche-specific (5), term cleanup (6), and pass the SVG + `qa_gates` checks (7). Then record the refresh and deploy:

   ```bash
   .venv/bin/python manage.py refresh_site pythonlidar.com \
       --blueprint "/home/martin/WebstormProjects/pythonlidar.com/_plan/blueprint.json"
   cd /home/martin/WebstormProjects/pythonlidar.com
   npm run deploy
   git add -A && git commit -m "QA refresh (foundation)" && git push
   ```

## Phase schedule

| # | Phase | Status | Adds | Target total | Focus |
|---|-------|--------|------|--------------|-------|
| 1 | 1. Foundation | ✅ done | 2-3 pillars + 10-14 clusters + 8-12 long-tails | ~22 | Establish core authority: the main pillars and their primary clusters, with enough long-tails to validate demand. Get a consistent page skeleton in place. |
| 2 | 2. Expansion | ➡️ NEXT | 1-2 pillars + 7-10 clusters + 18-25 long-tails | ~50 | Broaden coverage: fill out each pillar's clusters and add the high-intent long-tails around them. Strengthen interlinking between siblings. |
| 3 | 3. Maturity | … future | 4-6 clusters + 28-40 long-tails | ~82 | Deepen the long tail: comprehensive how-tos, comparisons and edge-case pages under existing clusters. Ensure FAQ blocks and schema on every page. |
| 4 | 4. Authority | … future | 2-3 clusters + 20-30 long-tails | ~105 | Complete topical authority: remaining gaps, advanced/expert pages, and a tight internal link graph so every page is 1-2 clicks from its pillar. |

## Priorities for the next phase (expansion)

- Fill out the ground filtering / DTM-DSM generation pillar — the site currently only has two pillars (pipeline architecture and point cloud standards); a third pillar covering filters.smrf, filters.pmf, DTM rasterization, and hillshade export would address the highest-traffic LiDAR workflow queries
- Add comparison long-tail pages within existing clusters (e.g., 'SMRF vs PMF for dense urban LiDAR', 'LAZ vs uncompressed LAS for iterative processing') — these capture decision-making queries and are currently absent
- Expand the point-cloud-data-standards pillar's clusters (coordinate-reference-systems, laslaz-file-structure) with how-to long-tail pages that include working PDAL pipeline code, since current cluster pages appear to be stubs
- Add a batch-automation / cloud-integration pillar covering AWS Batch + PDAL Docker, S3 streaming readers/writers, and Airflow DAG orchestration — aligns with the site description's stated focus on automation and cloud

## Page blueprint

_(tailored to this site)_

- **Frontmatter (every page):** title, description, slug, type, breadcrumb, datePublished, dateModified
- **Schema (JSON-LD):** Article, BreadcrumbList, HowTo, FAQPage
- **Interlinking:** Every first mention of a concept that has its own page must become a contextual inline hyperlink woven into the sentence — e.g., 'Understanding how [PDAL stage chaining](/pdal-pipeline-architecture-execution/pdal-stage-chaining/) propagates buffers...' or 'Verify projection alignment with an explicit [spatial reprojection](/pdal-pipeline-architecture-execution/spatial-reprojection/) stage before ground classification.' Long-tail pages link up to their cluster with an up-link sentence in the opening paragraph (e.g., 'This guide is part of [PDAL Stage Chaining](/pdal-pipeline-architecture-execution/pdal-stage-chaining/).') and to the pillar from the cluster intro. Aim for 3–6 inline cross-links per page. Every page ends with a 'Related' block listing 3–5 sibling or child pages by display name.

### pillar pages  (~4500 words)
- 1-paragraph executive summary: what problem this pillar solves and who it is for (LiDAR analysts, Python GIS devs, surveying tech teams)
- Conceptual architecture overview: how PDAL's execution model works at this level (DAG, streaming, lazy evaluation) — prose + optional Mermaid diagram of the stage flow
- Core components breakdown: named stage categories (readers / filters / writers) with concise role descriptions and parameter tables for the most-used options
- Annotated reference pipeline: minimal working JSON pipeline with inline comments explaining each stage choice
- Python integration: pdal.Pipeline construction, execute(), and metadata extraction with a complete runnable code block
- Schema and data-flow considerations: dimension propagation, CRS handling, forward/extra_dims patterns
- Performance and scaling strategies: chunk_size tuning, OMP_NUM_THREADS, file-level vs stage-level parallelism — with benchmark-style comparison table
- Production deployment patterns: versioning pipeline JSON, CI/CD validation, containerization, cloud object-storage readers/writers
- Failure modes and debugging: common runtime errors (schema violations, CRS mismatches, OOM), how to surface them via pipeline.loglevel and pipeline.metadata
- Related: links to all cluster pages under this pillar

### cluster pages  (~3500 words)
- 1-paragraph problem framing: specific sub-problem this cluster addresses and why it matters in real LiDAR workflows; up-link to parent pillar
- Prerequisites: explicit list (PDAL version, Python version, required dimensions in input data, CRS assumptions, any test dataset recommendation)
- Core workflow architecture: step-by-step numbered execution lifecycle for this specific operation (e.g., 6-phase buffer-passing model for stage chaining)
- Full implementation: complete runnable Python code block with typed function signatures, logging, error handling, and realistic parameter values
- Code breakdown: section-by-section explanation of the implementation — each key decision justified (why this chunk_size, why this filter order)
- Parameter reference table: stage-specific parameters with type, default, valid range, and effect on output quality or performance
- Validation and data integrity checks: how to verify correct outputs (point count assertions, dimension name checks, CRS round-trip tests)
- Performance tuning: cluster-specific bottlenecks and remedies (e.g., compression vs raw LAS for iterative runs, OMP settings for SMRF)
- Common errors and troubleshooting: 3–5 concrete error messages or failure patterns with root cause and fix
- Related: links to sibling clusters and long-tail child pages

### long_tail pages  (~2000 words)
- 1-sentence TL;DR answer at the top (the direct answer to the specific question the page title implies)
- Context and motivation: why this specific technique/parameter/operation matters in production LiDAR pipelines; up-link to parent cluster
- Prerequisites and assumptions: minimum setup, required input dimensions or file format, PDAL version constraints
- Step-by-step implementation: numbered steps, each with the exact pipeline JSON snippet or Python call that accomplishes it
- Complete working example: self-contained code block that can be copy-pasted and run with a test LiDAR file
- Key parameter table: relevant parameters for this specific operation, their types, defaults, and tuning guidance
- Verification: how to confirm the operation worked (check pipeline.metadata, inspect output dimensions, assert point counts)
- Gotchas and edge cases: 2–4 specific failure modes unique to this operation (e.g., datum shift surprises in reprojection, SMRF window size vs point density)
- Related: links to parent cluster, sibling long-tails, and one pillar back-link

> All code blocks must use realistic parameter values (actual EPSG codes, typical SMRF slope/window values, real LAS dimension names). Mermaid diagrams should show stage-flow DAGs for pillar pages. FAQ sections must use accordion rendering as specified in site requirements. Every page must pass pdal --validate on the JSON pipeline snippets shown. Inline code spans use the site's light background styling. Tables showing chunk-size vs memory vs thread-scaling are preferred over prose for performance sections. No external links except where an existing page already includes them (e.g., ASPRS spec, PDAL official docs).

## Custom visuals (SVG)

When upgrading or building any page, add a custom, hand-authored inline SVG wherever a visual would genuinely raise quality (architecture/data-flow diagrams, sequence or state diagrams, comparison matrices, timelines, annotated illustrations). Do NOT add decorative or generic stock-style images. Each SVG must: be original and specific to the page's content; match the site's existing design system (colours, fonts, stroke weight); be responsive (viewBox, no fixed pixel width) and accessible (<title>/<desc>, role="img", aria-label); and use currentColor / CSS variables so it adapts to light/dark themes. Prefer one strong diagram that explains the hardest concept on the page over many small ones. Pillar pages should almost always carry a top-level overview diagram. If the site has any Mermaid diagrams (```mermaid blocks, .mermaid containers, or a mermaid runtime), convert each one to a hand-authored inline SVG in this same style — no Mermaid should remain.
