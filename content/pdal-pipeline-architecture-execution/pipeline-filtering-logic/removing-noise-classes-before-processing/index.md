---
title: "Removing Noise Classes Before Processing"
description: "Why classes 7 and 18 must leave the pipeline before any neighbourhood filter, how to drop them with filters.range or filters.expression, what to do with unclassified high and low outliers, and how to keep noise in the delivered file while excluding it from processing."
slug: "removing-noise-classes-before-processing"
type: "howto"
breadcrumb: "Removing Noise Classes"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Removing Noise Classes Before Processing",
      "description": "Why classes 7 and 18 must leave the pipeline before any neighbourhood filter, how to drop them with filters.range or filters.expression, what to do with unclassified high and low outliers, and how to keep noise in the delivered file while excluding it from processing.",
      "datePublished": "2026-09-18",
      "dateModified": "2026-09-18",
      "author": {
        "@type": "Organization",
        "name": "pythonlidar.com"
      }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Home",
          "item": "https://www.pythonlidar.com/"
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": "PDAL Pipeline Architecture and Execution",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Pipeline Filtering Logic",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Removing Noise Classes",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/removing-noise-classes-before-processing/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Remove LiDAR noise classes before processing in PDAL",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Check what noise classes exist",
          "text": "pdal info --stats --enumerate Classification tile.laz lists the classes present. If 7 and 18 are absent, the data has not been noise-classified and Step 4 applies."
        },
        {
          "@type": "HowToStep",
          "name": "Drop noise immediately after the reader",
          "text": "filters.range with negated ranges keeps everything except the listed classes:"
        },
        {
          "@type": "HowToStep",
          "name": "Keep withheld and overlap handling consistent",
          "text": "Points flagged withheld should usually be excluded in the same stage. Overlap points are a separate decision; see flagging overlap and withheld points."
        },
        {
          "@type": "HowToStep",
          "name": "Classify noise when the vendor did not",
          "text": "Run filters.outlier (statistical) and filters.elm (extended local minimum, for low points) and let them write class 7, then exclude class 7 as in Step 2."
        },
        {
          "@type": "HowToStep",
          "name": "Exclude instead of remove when delivering",
          "text": "If the output must contain every point, add where clauses to the processing stages \u2014 \"where\": \"Classification != 7 && Classification != 18\" \u2014 so noise is skipped but written."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What are ASPRS classes 7 and 18?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Class 7 is low point (noise), for returns below the true surface from multipath and sensor artefacts. Class 18, added in LAS 1.4, is high noise, for returns well above the surface from birds, clouds or atmospheric scatter."
          }
        },
        {
          "@type": "Question",
          "name": "Where in the pipeline should noise be removed?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Immediately after the reader, before any stage that uses neighbourhoods or builds surfaces. Removing it later cannot undo the effect it already had on ground classification or features."
          }
        },
        {
          "@type": "Question",
          "name": "How do I remove noise but keep it in the output file?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Instead of a range filter, add a where clause excluding classes 7 and 18 to each processing stage. The stages skip noise points while the writer still receives and writes them."
          }
        },
        {
          "@type": "Question",
          "name": "Which PDAL filter finds low noise points?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "filters.elm, the extended local minimum filter, is designed for isolated low points and writes class 7 by default. filters.outlier catches statistical outliers in any direction."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Put `{"type": "filters.range", "limits": "Classification![7:7],Classification![18:18]"}` directly after the reader in every processing pipeline, so low noise (class 7) and high noise (class 18) never reach SMRF, HAG, covariance features or rasterization. If the data has no noise classification yet, flag outliers first with `filters.outlier` or `filters.elm`, then exclude them the same way. When noise must stay in the delivered file, exclude it with `where` clauses instead of removing it.

## Context and Motivation

This guide is part of [Pipeline Filtering Logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/). Noise points are rare — a fraction of a percent of a typical tile — and disproportionately destructive. A single low-noise return 30 m below the terrain, from a multipath reflection or a sensor artefact, becomes the lowest point in its SMRF cell and drags the ground surface down into a pit. A high-noise return from a bird or a cloud edge sets a DSM cell 200 m above the canopy and ruins any hillshade or canopy height model built from it. Neighbourhood features computed near either are distorted too.

ASPRS reserves class 7 for low points (noise) and, in LAS 1.4, class 18 for high noise. Vendors routinely classify both, and removing them first is the single cheapest quality improvement available in almost every pipeline.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A low noise point creating a pit in a ground surface" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>One point, one pit</title>
  <desc>A terrain profile with ground points along a gentle slope. One low noise return sits 30 metres below the surface. The ground surface interpolated with the noise point included dips sharply into a pit at that location. With class 7 removed first, the surface follows the real ground smoothly.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <g fill="var(--dg-d)"><circle cx="60" cy="80" r="3"/><circle cx="110" cy="82" r="3"/><circle cx="160" cy="85" r="3"/><circle cx="210" cy="88" r="3"/><circle cx="260" cy="90" r="3"/><circle cx="310" cy="92" r="3"/><circle cx="410" cy="96" r="3"/><circle cx="460" cy="98" r="3"/><circle cx="510" cy="101" r="3"/><circle cx="560" cy="103" r="3"/><circle cx="610" cy="106" r="3"/><circle cx="660" cy="108" r="3"/></g>
  <circle cx="360" cy="190" r="5" fill="var(--dg-e)"/>
  <text x="372" y="194" font-size="10.5" fill="var(--dg-e)">class 7: 30 m below ground</text>
  <path d="M60 80 L260 90 L310 92 L360 186 L410 96 L660 108" fill="none" stroke="var(--dg-e)" stroke-width="1.6" stroke-dasharray="6 4"/>
  <path d="M60 80 L660 108" fill="none" stroke="var(--dg-d)" stroke-width="1.8"/>
  <text x="60" y="40" font-size="10.5" fill="var(--dg-d)">solid: surface with noise removed first</text>
  <text x="60" y="58" font-size="10.5" fill="var(--dg-e)">dashed: surface with the noise point included</text>
</svg>

## Prerequisites and Assumptions

- PDAL 2.x.
- Data classified to LAS 1.4 conventions: class 7 low noise, class 18 high noise. Older LAS 1.2 deliveries use class 7 for all noise and have no class 18.
- A decision about the delivered file: are noise points removed, or kept and labelled?

## Step-by-Step Implementation

### Step 1 — Check what noise classes exist

`pdal info --stats --enumerate Classification tile.laz` lists the classes present. If 7 and 18 are absent, the data has not been noise-classified and Step 4 applies.

### Step 2 — Drop noise immediately after the reader

`filters.range` with negated ranges keeps everything except the listed classes:

```json
{ "type": "filters.range", "limits": "Classification![7:7],Classification![18:18]" }
```

The equivalent expression is `Classification != 7 && Classification != 18`.

### Step 3 — Keep withheld and overlap handling consistent

Points flagged withheld should usually be excluded in the same stage. Overlap points are a separate decision; see [flagging overlap and withheld points](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/flagging-overlap-and-withheld-points/).

### Step 4 — Classify noise when the vendor did not

Run `filters.outlier` (statistical) and `filters.elm` (extended local minimum, for low points) and let them write class 7, then exclude class 7 as in Step 2.

### Step 5 — Exclude instead of remove when delivering

If the output must contain every point, add `where` clauses to the processing stages — `"where": "Classification != 7 && Classification != 18"` — so noise is skipped but written.

## Complete Working Example

A pipeline that classifies noise when missing, excludes it from SMRF and HAG, and still writes every point:

```json
{
  "pipeline": [
    { "type": "readers.las", "filename": "tiles/t_0431.laz" },
    { "type": "filters.elm", "cell": 10.0, "threshold": 1.0, "class": 7 },
    { "type": "filters.outlier", "method": "statistical", "mean_k": 12, "multiplier": 3.0,
      "class": 18, "where": "Classification != 7" },
    { "type": "filters.smrf", "slope": 0.15, "window": 18, "threshold": 0.5,
      "where": "Classification != 7 && Classification != 18" },
    { "type": "filters.hag_nn", "count": 2,
      "where": "Classification != 7 && Classification != 18" },
    { "type": "writers.las", "filename": "out/t_0431_classified.laz",
      "minor_version": 4, "dataformat_id": 6, "forward": "all",
      "extra_dims": "HeightAboveGround=float" }
  ]
}
```

`filters.outlier` marks outliers with the class you give it — class 7 by default — without removing them; setting `class: 18` here labels statistical outliers as high noise. Strictly, statistical outliers can be below the surface too; if your specification distinguishes, run a second pass that relabels class-18 points below the ground surface as class 7.

A quick Python check of noise share per tile across a batch:

```python
import json
from pathlib import Path

import numpy as np
import pdal

for tile in sorted(Path("tiles").glob("*.laz")):
    p = pdal.Pipeline(json.dumps({"pipeline": [str(tile)]}))
    p.execute()
    c = p.arrays[0]["Classification"]
    share = np.isin(c, [7, 18]).mean()
    flag = "  <-- check" if share > 0.01 else ""
    print(f"{tile.name:<24} noise {share:6.3%}{flag}")
```

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Where noise exclusion sits relative to the stages it protects" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Noise out before anything looks at neighbours</title>
  <desc>A pipeline row: reader, then the noise range filter highlighted, then SMRF, HAG and covariance features grouped as neighbourhood stages, then writers. A second row shows the same pipeline with noise removal placed after SMRF, marked wrong because SMRF has already used the noise points.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="32" font-size="10.5" fill="var(--dg-d)">right</text>
  <g font-size="10.5" fill="var(--dg-text)">
    <rect x="70" y="16" width="100" height="30" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="120" y="35">reader</text>
    <rect x="186" y="16" width="130" height="30" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="251" y="35">drop 7, 18</text>
    <rect x="332" y="16" width="90" height="30" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="377" y="35">smrf</text>
    <rect x="438" y="16" width="90" height="30" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="483" y="35">hag_nn</text>
    <rect x="544" y="16" width="170" height="30" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="629" y="35">writers</text>
  </g>
  <text x="20" y="102" font-size="10.5" fill="var(--dg-e)">wrong</text>
  <g font-size="10.5" fill="var(--dg-text)">
    <rect x="70" y="86" width="100" height="30" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="120" y="105">reader</text>
    <rect x="186" y="86" width="90" height="30" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="231" y="105">smrf</text>
    <rect x="292" y="86" width="130" height="30" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)"/><text text-anchor="middle" x="357" y="105">drop 7, 18</text>
    <rect x="438" y="86" width="90" height="30" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="483" y="105">hag_nn</text>
    <rect x="544" y="86" width="170" height="30" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="629" y="105">writers</text>
  </g>
  <text x="70" y="150" font-size="10.5" fill="var(--dg-muted)">in the wrong order SMRF has already built its minimum surface from the noise points;</text>
  <text x="70" y="168" font-size="10.5" fill="var(--dg-muted)">removing them afterwards cannot undo the pits it classified around them</text>
</svg>

## Key Parameter Table

| Stage | Option | Typical value | Purpose |
|---|---|---|---|
| `filters.range` | `limits` | `Classification![7:7],Classification![18:18]` | Remove classified noise |
| `filters.elm` | `cell` | 10.0 m | Search cell for isolated low points |
| `filters.elm` | `threshold` | 1.0 m | Height gap marking a point as low noise |
| `filters.outlier` | `mean_k` | 8–16 | Neighbours for the statistical test |
| `filters.outlier` | `multiplier` | 2.5–3.0 | Standard deviations beyond which a point is an outlier |
| `filters.outlier` | `class` | 7 (default) or 18 | Class written to outliers |

## Verification

- **No noise downstream.** Add a check after the noise stage in development runs: `pdal info --stats --enumerate Classification` on an intermediate output should list neither 7 nor 18.
- **DTM minimum.** The minimum of the DTM should be within a few metres of the lowest ground you expect. A minimum far below it points to a noise point that slipped through.
- **Noise share per tile.** Typical shares are 0.01–0.5 percent. A tile with several percent noise may have a sensor problem worth reporting.

## Gotchas and Edge Cases

**LAS 1.2 noise.** Older files have no class 18; all noise is class 7, and some vendors put high noise in class 7 too. The same range filter handles both.

**Unclassified outliers.** Many deliveries classify only ground and leave noise as class 1. Excluding classes 7 and 18 then removes nothing. Check the class histogram before assuming noise has been handled.

**Removing too much.** Statistical outlier removal with a small `multiplier` on sparse or edge areas removes legitimate points — isolated poles, wires, tree tops. Use conservative settings and inspect what was flagged before trusting it.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Legitimate isolated points that aggressive outlier settings remove" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Not every isolated point is noise</title>
  <desc>A scene with three isolated elevated features: the top of a lone tree, a wire span and a lamp post. With an aggressive statistical multiplier of 1.5, all three are flagged as noise, shown in red. With a multiplier of 3.0, only a genuine bird return high above is flagged.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <line x1="20" y1="150" x2="720" y2="150" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="120" y1="150" x2="120" y2="70" stroke="var(--dg-line)" stroke-width="2"/>
  <circle cx="120" cy="62" r="5" fill="var(--dg-e)"/>
  <text x="120" y="48" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">tree top</text>
  <path d="M260 70 Q360 100 460 70" fill="none" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <g fill="var(--dg-e)"><circle cx="300" cy="82" r="3.5"/><circle cx="360" cy="92" r="3.5"/><circle cx="420" cy="82" r="3.5"/></g>
  <text x="360" y="120" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">wire span</text>
  <line x1="560" y1="150" x2="560" y2="100" stroke="var(--dg-line)" stroke-width="2"/>
  <circle cx="560" cy="96" r="4" fill="var(--dg-e)"/>
  <text x="560" y="84" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">lamp post</text>
  <circle cx="680" cy="24" r="4" fill="var(--dg-e)"/>
  <text x="672" y="28" text-anchor="end" font-size="10.5" fill="var(--dg-text)">bird: real noise</text>
</svg>

**Removing noise from the deliverable.** Some specifications require noise to remain in the file, classified. Use `where` clauses on processing stages rather than removing points when the output is a deliverable, as the example does.

## Frequently Asked Questions

**What are ASPRS classes 7 and 18?**

Class 7 is low point (noise), for returns below the true surface from multipath and sensor artefacts. Class 18, added in LAS 1.4, is high noise, for returns well above the surface from birds, clouds or atmospheric scatter.

**Where in the pipeline should noise be removed?**

Immediately after the reader, before any stage that uses neighbourhoods or builds surfaces. Removing it later cannot undo the effect it already had on ground classification or features.

**How do I remove noise but keep it in the output file?**

Instead of a range filter, add a where clause excluding classes 7 and 18 to each processing stage. The stages skip noise points while the writer still receives and writes them.

**Which PDAL filter finds low noise points?**

filters.elm, the extended local minimum filter, is designed for isolated low points and writes class 7 by default. filters.outlier catches statistical outliers in any direction.

## Related

- [Pipeline Filtering Logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) — filter order and cost
- [Applying Statistical Outlier Filters in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/applying-statistical-outlier-filters-in-pdal/) — tuning filters.outlier
- [Filtering Points with filters.expression](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/filtering-points-with-filters-expression/) — the expression form of the same filter
- [Understanding ASPRS Classification Codes](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/understanding-asprs-classification-codes/) — what each class means
- [Tuning SMRF for Forested Terrain](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/tuning-smrf-for-forested-terrain/) — the stage noise hurts most
