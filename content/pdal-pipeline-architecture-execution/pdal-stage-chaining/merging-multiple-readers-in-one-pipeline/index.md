---
title: "Merging Multiple Readers in One Pipeline"
description: "Combine several LAS/LAZ tiles, or files in different CRSs and point formats, into one PDAL pipeline: implicit versus explicit filters.merge, reprojecting each input before merging, schema differences, and the memory cost of merged views."
slug: "merging-multiple-readers-in-one-pipeline"
type: "howto"
breadcrumb: "Merging Multiple Readers"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Merging Multiple Readers in One Pipeline",
      "description": "Combine several LAS/LAZ tiles, or files in different CRSs and point formats, into one PDAL pipeline: implicit versus explicit filters.merge, reprojecting each input before merging, schema differences, and the memory cost of merged views.",
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
          "name": "PDAL Stage Chaining",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Merging Multiple Readers",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/merging-multiple-readers-in-one-pipeline/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Merge multiple readers into one PDAL pipeline",
      "step": [
        {
          "@type": "HowToStep",
          "name": "List the readers",
          "text": "Several readers at the head of a linear pipeline are all inputs to the next stage. Adding explicit tags makes the graph readable."
        },
        {
          "@type": "HowToStep",
          "name": "Merge explicitly",
          "text": "Without filters.merge, most filters process each input view separately. A neighbourhood filter such as SMRF then never sees across the seam \u2014 which defeats the purpose."
        },
        {
          "@type": "HowToStep",
          "name": "Align CRSs before merging",
          "text": "If inputs differ in CRS, give each its own filters.reprojection to a common out_srs using inputs, then merge the reprojected tags."
        },
        {
          "@type": "HowToStep",
          "name": "Reconcile schemas",
          "text": "Merged views take the union of dimensions. A dimension present in one input and absent in another is zero-filled for points from the latter."
        },
        {
          "@type": "HowToStep",
          "name": "Crop back if needed",
          "text": "For buffered processing, crop the merged, processed cloud back to the central tile before writing so neighbours are not duplicated in output."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Do I need filters.merge if I list several readers?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "For writers, no \u2014 they write all incoming views. For neighbourhood filters such as SMRF, outlier removal or HAG, yes: without an explicit merge they may process each input view separately and never see across tile edges."
          }
        },
        {
          "@type": "Question",
          "name": "Can I merge files in different coordinate systems?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Only after reprojecting them to a common CRS. Give each input its own reprojection stage using tags and inputs, then merge the reprojected outputs."
          }
        },
        {
          "@type": "Question",
          "name": "What happens to dimensions that exist in only one input?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The merged view contains the union of dimensions, and points from inputs without a dimension get zero for it. Decide whether to drop such dimensions or choose an output format that makes the zeros harmless."
          }
        },
        {
          "@type": "Question",
          "name": "How do I avoid writing neighbour points into every tile?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Crop the processed merged view back to the central tile's bounds before the writer. Each tile then contains only its own points, processed with the benefit of neighbour context."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** List several readers at the start of the pipeline and follow them with `filters.merge` so the next stage sees one combined view. If inputs are in different CRSs, give each reader its own `filters.reprojection` branch (via `tag` and `inputs`) to a common `out_srs` before the merge. Expect the merged view to hold every point at once — size the machine for the sum of the inputs.

## Context and Motivation

This guide is part of [PDAL Stage Chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/). Plenty of operations need points from more than one file at once: rasterizing a DTM across a tile boundary, classifying ground with buffer data from neighbouring tiles, combining an airborne flight with a later drone infill, or joining flightline files into one tile. PDAL handles this inside a single pipeline by letting several readers feed one downstream stage. When you understand how views merge, the pattern is simple; when you do not, it produces duplicated points, mismatched coordinates and out-of-memory crashes.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Three readers merged into one view feeding a filter and a writer" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Many readers, one view</title>
  <desc>Three readers on the left, one per tile, each producing its own point view. The views flow into filters.merge, which produces a single view containing all points. The merged view passes to SMRF and then to a writer. A note says memory now holds the sum of all three tiles.</desc>
  <defs><marker id="mg-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="24" width="150" height="40" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="95" y="48" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">readers.las t_0431</text>
  <rect x="20" y="88" width="150" height="40" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="95" y="112" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">readers.las t_0432</text>
  <rect x="20" y="152" width="150" height="40" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="95" y="176" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">readers.las t_0441</text>
  <rect x="250" y="84" width="140" height="48" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.4"/>
  <text x="320" y="112" text-anchor="middle" font-size="11" fill="var(--dg-text)">filters.merge</text>
  <rect x="440" y="88" width="120" height="40" rx="7" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.2"/>
  <text x="500" y="112" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">filters.smrf</text>
  <rect x="600" y="88" width="120" height="40" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="660" y="112" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">writers.las</text>
  <path d="M170 44 L210 44 L210 98 L246 98" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#mg-arw)"/>
  <line x1="170" y1="108" x2="246" y2="108" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#mg-arw)"/>
  <path d="M170 172 L210 172 L210 118 L246 118" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#mg-arw)"/>
  <line x1="390" y1="108" x2="436" y2="108" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#mg-arw)"/>
  <line x1="560" y1="108" x2="596" y2="108" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#mg-arw)"/>
  <text x="440" y="176" font-size="10.5" fill="var(--dg-muted)">memory now holds all three tiles at once</text>
</svg>

## Prerequisites and Assumptions

- PDAL 2.x; `filters.merge` and multi-reader pipelines are long-standing features.
- Inputs that belong together spatially — adjacent tiles, overlapping flightlines, or a base survey and its infill.
- Knowledge of each input's CRS and point format (`pdal info --summary` for each).

## Step-by-Step Implementation

### Step 1 — List the readers

Several readers at the head of a linear pipeline are all inputs to the next stage. Adding explicit `tag`s makes the graph readable.

### Step 2 — Merge explicitly

Without `filters.merge`, most filters process each input view separately. A neighbourhood filter such as SMRF then never sees across the seam — which defeats the purpose. `filters.merge` produces one view so the next stage sees all points together.

### Step 3 — Align CRSs before merging

If inputs differ in CRS, give each its own `filters.reprojection` to a common `out_srs` using `inputs`, then merge the reprojected tags.

### Step 4 — Reconcile schemas

Merged views take the union of dimensions. A dimension present in one input and absent in another is zero-filled for points from the latter. Decide whether that is acceptable before writing.

### Step 5 — Crop back if needed

For buffered processing, crop the merged, processed cloud back to the central tile before writing so neighbours are not duplicated in output.

## Complete Working Example

Merging a base airborne tile in UTM with a drone infill delivered in geographic coordinates, classifying ground across both, and writing only the central extent:

```json
{
  "pipeline": [
    { "type": "readers.las", "filename": "base/t_0431.laz", "tag": "base" },
    { "type": "readers.las", "filename": "drone/infill_0431.laz", "tag": "drone_raw" },
    { "type": "filters.reprojection", "inputs": ["drone_raw"],
      "in_srs": "EPSG:6318+5703", "out_srs": "EPSG:6347+5703", "tag": "drone" },
    { "type": "filters.merge", "inputs": ["base", "drone"], "tag": "merged" },
    { "type": "filters.range", "limits": "Classification![7:7],Classification![18:18]" },
    { "type": "filters.smrf", "slope": 0.15, "window": 18, "threshold": 0.5 },
    { "type": "filters.crop", "bounds": "([431000, 432000], [4471000, 4472000])" },
    { "type": "writers.las", "filename": "out/t_0431_merged.laz",
      "minor_version": 4, "dataformat_id": 6, "a_srs": "EPSG:6347+5703",
      "scale_x": 0.01, "scale_y": 0.01, "scale_z": 0.01,
      "offset_x": "auto", "offset_y": "auto", "offset_z": "auto" }
  ]
}
```

A Python wrapper that builds the reader list from a tile index and checks point accounting:

```python
"""Merge a tile with its neighbours, process, and crop back to the tile."""
from __future__ import annotations

import json
from pathlib import Path

import pdal


def merged_pipeline(center: Path, neighbours: list[Path], bounds: str, dst: Path) -> dict:
    readers = [{"type": "readers.las", "filename": str(p), "tag": f"in{i}"}
               for i, p in enumerate([center, *neighbours])]
    return {"pipeline": [
        *readers,
        {"type": "filters.merge", "inputs": [r["tag"] for r in readers]},
        {"type": "filters.range", "limits": "Classification![7:7],Classification![18:18]"},
        {"type": "filters.smrf", "slope": 0.15, "window": 18, "threshold": 0.5},
        {"type": "filters.crop", "bounds": bounds},
        {"type": "writers.las", "filename": str(dst), "minor_version": 4, "dataformat_id": 6,
         "forward": "all"},
    ]}


if __name__ == "__main__":
    spec = merged_pipeline(Path("tiles/t_0431.laz"),
                           [Path("tiles/t_0430.laz"), Path("tiles/t_0432.laz")],
                           "([431000, 432000], [4471000, 4472000])",
                           Path("out/t_0431_ground.laz"))
    p = pdal.Pipeline(json.dumps(spec))
    n = p.execute()
    print(f"{n} points written for the central tile")
```

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Unmerged views processed separately versus a merged view processed across the seam" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Why the explicit merge matters</title>
  <desc>Left: two tiles processed as separate views by SMRF; each tile's ground surface is estimated without the other, producing a step at the shared edge. Right: after filters.merge the two tiles are processed as one view and the ground surface crosses the seam smoothly.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <text x="185" y="26" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">separate views</text>
  <text x="555" y="26" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">merged view</text>
  <line x1="185" y1="40" x2="185" y2="170" stroke="var(--dg-line-soft)" stroke-width="1.2" stroke-dasharray="4 4"/>
  <line x1="555" y1="40" x2="555" y2="170" stroke="var(--dg-line-soft)" stroke-width="1.2" stroke-dasharray="4 4"/>
  <path d="M40 140 C80 132 130 124 185 118" fill="none" stroke="var(--dg-d)" stroke-width="2.2"/>
  <path d="M185 100 C230 104 280 110 330 114" fill="none" stroke="var(--dg-d)" stroke-width="2.2"/>
  <line x1="185" y1="118" x2="185" y2="100" stroke="var(--dg-e)" stroke-width="2.4"/>
  <text x="195" y="92" font-size="10.5" fill="var(--dg-e)">step at the seam</text>
  <path d="M410 140 C470 130 520 120 555 116 C600 112 650 112 700 114" fill="none" stroke="var(--dg-d)" stroke-width="2.2"/>
  <text x="555" y="186" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">continuous across the tile edge</text>
  <text x="185" y="186" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">each tile filtered alone</text>
</svg>

## Key Parameter Table

| Element | Setting | Why |
|---|---|---|
| reader `tag` | `in0`, `in1`, … | Makes `inputs` lists explicit and readable |
| `filters.merge` | `inputs` = all readers | One view for neighbourhood stages |
| per-input `filters.reprojection` | common `out_srs` | Merge only data in one CRS |
| `filters.crop` | central `bounds` | Write only the tile you are responsible for |
| writer `forward` | `all` | Carries header settings from the first input |
| writer `offset_*` | `auto` | Recomputes offsets for the merged extent |

## Verification

- **No duplicates.** After cropping, the output count should be close to the central tile's own count (plus any infill). A count near the sum of all inputs means the crop is missing.
- **Seam continuity.** Rasterize a DTM of the output and a neighbour's output, then check the difference along the shared edge; a step indicates the neighbours were not merged before SMRF.
- **Schema.** `pdal info --schema` on the output lists dimensions from every input; check whether zero-filled dimensions (for example `Red`, `Green`, `Blue` from a colourized drone input) should be dropped.

## Gotchas and Edge Cases

**Implicit behaviour differs by stage.** Some stages handle multiple input views by processing each separately; writers write them all. Relying on implicit merging makes results depend on stage internals. Always merge explicitly before neighbourhood filters.

**Different point formats.** Merging PDRF 1 and PDRF 7 inputs yields a view with RGB for all points, zero for those that never had it. Writing PDRF 6 drops RGB; writing PDRF 7 keeps zeros that look like black. Choose the output format deliberately.

**Different scales and offsets.** PDAL holds coordinates as doubles internally, so merging inputs with different LAS scales is safe; the writer's scale and offset decide the output precision. Set them explicitly rather than inheriting from whichever file came first.

<svg viewBox="0 0 740 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Memory needed for a merged view compared with single tiles" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Merged views cost the sum</title>
  <desc>Horizontal bars of peak memory. One tile alone needs about 3 gigabytes. The tile with its two side neighbours merged needs about 9. The tile with all eight neighbours merged needs about 27, which exceeds a 16 gigabyte worker, shown as a dashed limit line.</desc>
  <rect x="0" y="0" width="740" height="180" fill="var(--dg-bg)" rx="10"/>
  <text x="170" y="46" text-anchor="end" font-size="11" fill="var(--dg-text)">1 tile</text>
  <rect x="180" y="32" width="50" height="22" fill="var(--dg-d)"/>
  <text x="238" y="48" font-size="10.5" fill="var(--dg-muted)">3 GB</text>
  <text x="170" y="86" text-anchor="end" font-size="11" fill="var(--dg-text)">tile + 2 neighbours</text>
  <rect x="180" y="72" width="150" height="22" fill="var(--dg-c)"/>
  <text x="338" y="88" font-size="10.5" fill="var(--dg-muted)">9 GB</text>
  <text x="170" y="126" text-anchor="end" font-size="11" fill="var(--dg-text)">tile + 8 neighbours</text>
  <rect x="180" y="112" width="450" height="22" fill="var(--dg-e)"/>
  <text x="638" y="128" font-size="10.5" fill="var(--dg-muted)">27 GB</text>
  <line x1="447" y1="20" x2="447" y2="150" stroke="var(--dg-line)" stroke-width="1.4" stroke-dasharray="6 4"/>
  <text x="453" y="164" font-size="10.5" fill="var(--dg-muted)">16 GB worker</text>
</svg>

**Memory.** A merged view holds all inputs at once. Buffer with a strip of neighbour points rather than whole neighbour tiles — crop each neighbour reader to a 30–50 m buffer before merging — as described in [buffered tiling to avoid edge artefacts](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/buffered-tiling-to-avoid-edge-artefacts/).

## Frequently Asked Questions

**Do I need filters.merge if I list several readers?**

For writers, no — they write all incoming views. For neighbourhood filters such as SMRF, outlier removal or HAG, yes: without an explicit merge they may process each input view separately and never see across tile edges.

**Can I merge files in different coordinate systems?**

Only after reprojecting them to a common CRS. Give each input its own reprojection stage using tags and inputs, then merge the reprojected outputs.

**What happens to dimensions that exist in only one input?**

The merged view contains the union of dimensions, and points from inputs without a dimension get zero for it. Decide whether to drop such dimensions or choose an output format that makes the zeros harmless.

**How do I avoid writing neighbour points into every tile?**

Crop the processed merged view back to the central tile's bounds before the writer. Each tile then contains only its own points, processed with the benefit of neighbour context.

## Related

- [PDAL Stage Chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/) — views, stages and execution order
- [Branching a PDAL Pipeline with Tags](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/branching-a-pdal-pipeline-with-tags/) — one input, many outputs
- [Buffered Tiling to Avoid Edge Artefacts](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/buffered-tiling-to-avoid-edge-artefacts/) — the reason most merges exist
- [Merging Processed Tiles into One LAZ](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/merging-processed-tiles-into-one-laz/) — merging as a final delivery step
- [Diagnosing PDAL Out-of-Memory Failures](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/diagnosing-pdal-out-of-memory-failures/) — when merged views get too big
