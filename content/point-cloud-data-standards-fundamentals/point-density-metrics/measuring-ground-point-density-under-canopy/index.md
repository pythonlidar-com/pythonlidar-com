---
title: "Measuring Ground Point Density Under Canopy"
description: "Why total point density says nothing about a forested block, how to measure ground returns per cell on the grid you will rasterize, and the empty-cell fraction that predicts DTM voids."
slug: "measuring-ground-point-density-under-canopy"
type: "howto"
breadcrumb: "Ground Density Under Canopy"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Measuring Ground Point Density Under Canopy",
      "description": "Why total point density says nothing about a forested block, how to measure ground returns per cell on the grid you will rasterize, and the empty-cell fraction that predicts DTM voids.",
      "datePublished": "2026-08-07",
      "dateModified": "2026-08-07",
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
          "name": "Point Cloud Data Standards and Fundamentals",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Point Density Metrics",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Ground Density Under Canopy",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/measuring-ground-point-density-under-canopy/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Measure ground-return density under forest canopy",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Classify ground before measuring",
          "text": "Run a ground filter tuned for canopy so the measurement is about bare-earth returns rather than all returns."
        },
        {
          "@type": "HowToStep",
          "name": "Keep only the ground class",
          "text": "Select Classification 2 so canopy hits cannot flatter the density figure."
        },
        {
          "@type": "HowToStep",
          "name": "Rasterize a count on the target grid",
          "text": "Use writers.gdal with output_type count at the cell size the DTM will actually use."
        },
        {
          "@type": "HowToStep",
          "name": "Report the distribution",
          "text": "Quote the empty-cell fraction and the fifth percentile rather than the mean, which the open parts of the block flatter."
        },
        {
          "@type": "HowToStep",
          "name": "Coarsen the grid if voids are unacceptable",
          "text": "When too many cells are empty the remedy is a larger cell, because no filter setting invents returns."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why is total point density misleading over forest?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because it is dominated by canopy returns. A block delivered at a contractual eight points per square metre can carry twelve per square metre in the crowns and 0.4 on the forest floor. The second number is what a bare-earth product depends on, and it is not the one in the contract."
          }
        },
        {
          "@type": "Question",
          "name": "Which statistic should I quote?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The empty-cell fraction and the fifth percentile, both at the cell size the product will use. The mean is raised by the open parts of a block and hides exactly the areas where a terrain model will fail."
          }
        },
        {
          "@type": "Question",
          "name": "Can better filter tuning fix low ground density?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. Tuning recovers ground where sparse returns exist; it cannot invent returns in cells no pulse reached. Once ground density falls below roughly one return per cell, the only real remedies are a coarser grid, interpolation you declare as such, or a reflight."
          }
        },
        {
          "@type": "Question",
          "name": "Does density depend on the cell size I choose?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes, and quoting a density without one is meaningless. The same cloud yields 71 percent empty cells at half a metre and 12 percent at two metres, so the metric only means something alongside the grid it was measured on."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Classify ground first, then compute density over the ground returns only, on the same grid you intend to rasterize. Total point density over forest is dominated by canopy hits and tells you nothing about whether a terrain model is possible.

## Context and Motivation

This guide is part of [Point Density Metrics](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/), which covers pulse density, point density and their per-cell distribution. This page is about the one measurement that actually predicts whether a bare-earth product will succeed: how many ground returns landed in each cell.

The distinction matters because acquisition specifications are almost always written in total points per square metre, and total density is met comfortably by a canopy. A forested block delivered at a contractual eight points per square metre may carry twelve returns per square metre in the crowns and 0.4 on the forest floor. A DTM at one metre needs the second number, and no amount of filter tuning invents returns that were never recorded — a point made in more detail under [tuning SMRF for forested terrain](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/tuning-smrf-for-forested-terrain/).

<svg viewBox="0 0 720 256" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Total and ground-only density across an open, a partially wooded and a closed-canopy strip" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Two densities, and only one of them builds terrain</title>
  <desc>Total point density and ground-return density measured across three strips of the same block. Over open ground both are close together at around nine and eight per square metre. Under partial canopy total density rises to fourteen while ground falls to three. Under closed canopy total density is highest of all at nineteen and ground density is 0.4, which is below what a one-metre DTM can be built from.</desc>
  <rect x="0" y="0" width="720" height="256" fill="var(--dg-bg)" rx="10"/>
  <rect x="200" y="34" width="14" height="12" rx="2" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="220" y="44" font-size="10.5" fill="var(--dg-muted)">all returns</text>
  <rect x="340" y="34" width="14" height="12" rx="2" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="360" y="44" font-size="10.5" fill="var(--dg-muted)">ground returns only</text>
  <text x="190" y="80" text-anchor="end" font-size="11.5" fill="var(--dg-text)">open ground</text>
  <rect x="200" y="62" width="234" height="18" rx="3" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.1"/>
  <text x="442" y="76" font-size="10" fill="var(--dg-muted)">9.1 /m²</text>
  <rect x="200" y="84" width="208" height="18" rx="3" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="416" y="98" font-size="10" fill="var(--dg-muted)">8.0 /m²</text>
  <text x="190" y="146" text-anchor="end" font-size="11.5" fill="var(--dg-text)">partial canopy</text>
  <rect x="200" y="128" width="364" height="18" rx="3" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.1"/>
  <text x="572" y="142" font-size="10" fill="var(--dg-muted)">14.0 /m²</text>
  <rect x="200" y="150" width="78" height="18" rx="3" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="286" y="164" font-size="10" fill="var(--dg-muted)">3.0 /m²</text>
  <text x="190" y="212" text-anchor="end" font-size="11.5" fill="var(--dg-text)">closed canopy</text>
  <rect x="200" y="194" width="494" height="18" rx="3" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.1"/>
  <text x="440" y="208" text-anchor="middle" font-size="10" fill="var(--dg-text)">19.0 /m²</text>
  <rect x="200" y="216" width="12" height="18" rx="3" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.1"/>
  <text x="220" y="230" font-size="10" fill="var(--dg-e)">0.4 /m² — a 1 m DTM is not supportable here</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL | 2.4+ with `filters.smrf` and `writers.gdal` |
| A classified cloud | or a classification step in the same pipeline |
| Projected metric CRS | density per square metre is meaningless in degrees |
| A target cell size | measure on the grid you will actually rasterize |
| `numpy` | for the per-cell statistics |

## Step-by-Step Implementation

### Step 1 — Classify before measuring

```json
{"type": "filters.smrf", "window": 33, "slope": 0.2, "threshold": 0.6, "cell": 1.0,
 "returns": "last, only"}
```

### Step 2 — Keep only ground

```json
{"type": "filters.range", "limits": "Classification[2:2]"}
```

### Step 3 — Rasterize a count at the target cell size

```json
{"type": "writers.gdal", "filename": "ground_count.tif",
 "output_type": "count", "resolution": 1.0, "nodata": 0}
```

The `count` reducer writes points per cell, which at a one-metre cell is points per square metre directly.

### Step 4 — Report the distribution, not the mean

The mean is flattered by the open parts of the block. The fraction of cells with zero ground returns is the number that predicts void area in the DTM.

## Complete Working Example

```python
"""Measure ground-return density per cell and report the distribution."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pdal


def ground_counts(src: Path, cell: float = 1.0) -> np.ndarray:
    """Points per cell, ground only, on the target grid."""
    spec = json.dumps({"pipeline": [
        {"type": "readers.las", "filename": str(src)},
        {"type": "filters.range", "limits": "Classification[2:2]"},
    ]})
    p = pdal.Pipeline(spec)
    p.execute()
    arr = p.arrays[0]
    if len(arr) == 0:
        raise ValueError("no ground-classified points — classify before measuring")

    ix = np.floor((arr["X"] - arr["X"].min()) / cell).astype(np.int64)
    iy = np.floor((arr["Y"] - arr["Y"].min()) / cell).astype(np.int64)
    nx, ny = ix.max() + 1, iy.max() + 1
    flat = np.bincount(iy * nx + ix, minlength=int(nx * ny))
    return flat.reshape(int(ny), int(nx))


def report(counts: np.ndarray, cell: float) -> dict:
    total_cells = counts.size
    empty = int((counts == 0).sum())
    occupied = counts[counts > 0]
    return {
        "cell_size_m": cell,
        "cells": total_cells,
        "empty_cells": empty,
        "empty_fraction": round(empty / total_cells, 4),
        "mean_over_occupied": round(float(occupied.mean()), 2),
        "p5": float(np.percentile(counts, 5)),
        "p50": float(np.percentile(counts, 50)),
        "supportable": bool(empty / total_cells < 0.05),
    }


if __name__ == "__main__":
    counts = ground_counts(Path("forest_tile.laz"), cell=1.0)
    summary = report(counts, cell=1.0)
    print(json.dumps(summary, indent=2))
    if not summary["supportable"]:
        print("coarsen the DTM cell size or accept interpolated voids")
```

## Key Parameter Table

| Measure | Meaning | Use it for |
|---|---|---|
| mean total density | all returns per m² | contract compliance, nothing else |
| mean ground density | ground returns per m² | a first sanity check |
| empty-cell fraction | cells with no ground return | predicting DTM void area |
| 5th percentile | density in the worst twentieth | the number to quote in a specification |
| cell size | the grid you will rasterize | must match the product, not the metric |

<svg viewBox="-2 44 724 193" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The four stages that turn a raw tile into a defensible density figure" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>The measurement is four stages, and skipping any one of them changes the answer</title>
  <desc>Four stages. Classify ground with settings tuned for canopy. Keep only the ground class. Rasterize a count at the cell size the product will use. Report the empty-cell fraction and the fifth percentile rather than the mean. Skipping the first two measures the canopy; skipping the fourth measures the open parts of the block.</desc>
  <rect x="-2" y="44" width="724" height="193" fill="var(--dg-bg)" rx="10"/>
  <defs><marker id="den-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="20" y="66" width="150" height="52" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="95" y="88" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">classify ground</text>
  <text x="95" y="106" text-anchor="middle" font-size="9" fill="var(--dg-muted)">last, only returns</text>
  <rect x="196" y="66" width="150" height="52" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="271" y="88" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">keep class 2</text>
  <text x="271" y="106" text-anchor="middle" font-size="9" fill="var(--dg-muted)">ground only</text>
  <rect x="372" y="66" width="150" height="52" rx="7" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="447" y="88" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">count raster</text>
  <text x="447" y="106" text-anchor="middle" font-size="9" fill="var(--dg-muted)">at the product cell size</text>
  <rect x="548" y="66" width="152" height="52" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="624" y="88" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">report the tail</text>
  <text x="624" y="106" text-anchor="middle" font-size="9" fill="var(--dg-muted)">empty fraction, p5</text>
  <line x1="170" y1="92" x2="190" y2="92" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#den-arw)"/>
  <line x1="346" y1="92" x2="366" y2="92" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#den-arw)"/>
  <line x1="522" y1="92" x2="542" y2="92" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#den-arw)"/>
  <text x="20" y="168" font-size="10.5" fill="var(--dg-muted)">skip the first two and you have measured the canopy; skip the last and you have measured the open</text>
  <text x="20" y="186" font-size="10.5" fill="var(--dg-muted)">parts of the block, which were never the problem.</text>
  <text x="20" y="212" font-size="10.5" fill="var(--dg-muted)">The cell size in the third box is not a free choice — it has to be the one the DTM will use.</text>
</svg>

## Verification

**The classification actually ran.** The example raises rather than reporting zero density, because an unclassified cloud and a treeless one produce the same number otherwise.

**The grid matches the product.** Measuring at two metres and building at one metre understates voids fourfold.

**Open ground looks right.** Ground density over an open field should be close to total density. If it is far below, the classifier is rejecting real ground and the density measurement is really a classifier problem.

## Gotchas and Edge Cases

**Water returns nothing and is not a void.** Mask water before computing the empty-cell fraction, or a lake makes a good block look unsupportable.

**Overlap inflates density in strips.** Flight-line overlap doubles the count where swaths meet, which raises the mean and leaves the fifth percentile unmoved — one reason to quote the percentile.

**Density is a property of a cell size.** Quoting "0.4 points per square metre" without a cell size is meaningless; the same cloud yields different numbers at different grids.

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Empty-cell fraction against DTM cell size for a closed-canopy tile" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Coarsening the grid is the only real remedy</title>
  <desc>The fraction of cells with no ground return, plotted against DTM cell size for the same closed-canopy tile. At half a metre, 71 percent of cells are empty. At one metre, 44 percent. At two metres, 12 percent, and at four metres 2 percent. No filter setting moves this curve — it is set by how many pulses reached the ground.</desc>
  <rect x="0" y="0" width="720" height="250" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="40" x2="80" y2="196" stroke="var(--dg-line)" stroke-width="1.5"/>
  <line x1="80" y1="196" x2="680" y2="196" stroke="var(--dg-line)" stroke-width="1.5"/>
  <polyline points="80,52 230,110 380,175 530,192 680,195" fill="none" stroke="var(--dg-e)" stroke-width="2.6"/>
  <circle cx="80" cy="52" r="4.5" fill="var(--dg-e)"/>
  <circle cx="230" cy="110" r="4.5" fill="var(--dg-e)"/>
  <circle cx="380" cy="175" r="4.5" fill="var(--dg-e)"/>
  <line x1="80" y1="188" x2="680" y2="188" stroke="var(--dg-d)" stroke-width="1.6" stroke-dasharray="6 4"/>
  <text x="676" y="182" text-anchor="end" font-size="10.5" fill="var(--dg-d)">5% — the usual acceptance threshold</text>
  <text x="94" y="48" font-size="10.5" fill="var(--dg-e)">71% empty at 0.5 m</text>
  <text x="244" y="106" font-size="10.5" fill="var(--dg-muted)">44% at 1 m</text>
  <text x="394" y="171" font-size="10.5" fill="var(--dg-muted)">12% at 2 m</text>
  <text x="72" y="200" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">0</text>
  <text x="72" y="124" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">40%</text>
  <text x="72" y="48" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">80%</text>
  <text x="80" y="216" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">0.5 m</text>
  <text x="380" y="216" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">2 m</text>
  <text x="680" y="216" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">5 m</text>
  <text x="380" y="240" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">DTM cell size</text>
</svg>

## Frequently Asked Questions

**Why is total point density misleading over forest?**

Because it is dominated by canopy returns. A block delivered at a contractual eight points per square metre can carry twelve per square metre in the crowns and 0.4 on the forest floor. The second number is what a bare-earth product depends on, and it is not the one in the contract.

**Which statistic should I quote?**

The empty-cell fraction and the fifth percentile, both at the cell size the product will use. The mean is raised by the open parts of a block and hides exactly the areas where a terrain model will fail.

**Can better filter tuning fix low ground density?**

No. Tuning recovers ground where sparse returns exist; it cannot invent returns in cells no pulse reached. Once ground density falls below roughly one return per cell, the only real remedies are a coarser grid, interpolation you declare as such, or a reflight.

**Does density depend on the cell size I choose?**

Yes, and quoting a density without one is meaningless. The same cloud yields 71 percent empty cells at half a metre and 12 percent at two metres, so the metric only means something alongside the grid it was measured on.

---

## Related

- [Point Density Metrics](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/) — the parent guide to the three things called density
- [Calculating Point Density for Drone Surveys](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/calculating-point-density-for-drone-surveys/) — the acquisition-side view of the same measurement
- [Tuning SMRF for Forested Terrain](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/tuning-smrf-for-forested-terrain/) — recovering the ground returns that do exist
- [Filling NoData Voids in DTM Rasters](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/filling-nodata-voids-in-dtm-rasters/) — what to do with the cells that stay empty
- [Point Cloud Data Standards and Fundamentals](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/) — the section overview
