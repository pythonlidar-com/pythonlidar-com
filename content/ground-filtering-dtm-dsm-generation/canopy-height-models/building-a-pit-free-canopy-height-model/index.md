---
title: "Building a Pit-Free Canopy Height Model"
description: "Build a pit-free CHM with PDAL and NumPy using the layered approach of Khosravipour and colleagues: height-normalize, rasterize partial CHMs from returns above successive height thresholds with a TIN-like interpolation, and stack them with a per-cell maximum."
slug: "building-a-pit-free-canopy-height-model"
type: "howto"
breadcrumb: "Pit-Free CHM"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Building a Pit-Free Canopy Height Model",
      "description": "Build a pit-free CHM with PDAL and NumPy using the layered approach of Khosravipour and colleagues: height-normalize, rasterize partial CHMs from returns above successive height thresholds with a TIN-like interpolation, and stack them with a per-cell maximum.",
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
          "name": "Ground Filtering & Terrain Models",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Canopy Height Models",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Pit-Free CHM",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/building-a-pit-free-canopy-height-model/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Build a pit-free canopy height model from LiDAR",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Normalize heights",
          "text": "filters.hag_nn computes HeightAboveGround; ferry it into Z so rasterization works on heights."
        },
        {
          "@type": "HowToStep",
          "name": "Choose thresholds",
          "text": "0 (all first returns), 2, 5, 10, 15, 20, 25 \u2026 up to the canopy's maximum height, in steps of about 5 m."
        },
        {
          "@type": "HowToStep",
          "name": "Rasterize each layer with a tight radius",
          "text": "For each threshold, keep first returns above it and rasterize the maximum with a radius of about one cell. The tight radius is what stops a layer from spreading high values into gaps; the original method uses a TIN with an edge-length limit for the same purpose."
        },
        {
          "@type": "HowToStep",
          "name": "Stack by maximum",
          "text": "Read all layers and take np.fmax across them, ignoring NoData."
        },
        {
          "@type": "HowToStep",
          "name": "Fill remaining gaps lightly",
          "text": "Cells still empty (true gaps between crowns) take the all-returns value, which is usually near zero there."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is a pit-free canopy height model?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A CHM in which the spurious low cells inside crowns, caused by laser pulses passing through gaps, have been removed. The layered method builds partial CHMs from returns above successive heights and combines them with a per-cell maximum."
          }
        },
        {
          "@type": "Question",
          "name": "Why do pits matter?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "They fragment crowns into several apparent peaks and holes, which makes individual tree detection count too many trees and distorts crown metrics and canopy cover."
          }
        },
        {
          "@type": "Question",
          "name": "Is a pit-free CHM the same as smoothing?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. Smoothing lowers tree tops and blurs crown edges. The layered method keeps measured heights and only replaces pit cells with values from higher layers."
          }
        },
        {
          "@type": "Question",
          "name": "How many layers do I need?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Enough to span the canopy height range in steps of about 5 metres for tall forest, or 1 to 2 metres for short vegetation. Beyond the tallest trees, extra layers are empty and add nothing."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Normalize heights, then build several partial CHMs: one from all first returns and one each from first returns above 2, 5, 10, 15, 20 m … . Interpolate each partial CHM with a small search radius so gaps between high returns are not filled with low values, and take the per-cell maximum across the stack. Pits — low values punched into crowns by pulses that penetrated gaps — disappear because each crown is also represented by a layer that never saw the lower returns.

## Context and Motivation

This guide is part of [Canopy Height Models](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/). A CHM built as the maximum height above ground per cell has pits: cells inside crowns whose highest return came from a branch or the ground below, because the laser passed through a gap. Pits fragment crowns and break individual tree segmentation, which relies on smooth crowns with a single peak. Khosravipour, Skidmore, Isenburg and colleagues (2014) proposed a simple fix: compute partial CHMs using only returns above a series of height thresholds, so that within a tall crown the lower returns that caused pits are excluded, then combine the layers by taking the highest value per cell. The approach is easy to implement with PDAL and NumPy, and it improves tree detection noticeably in open-canopy forests.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Partial CHMs from successive height thresholds stacked into a pit-free surface" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Layers above thresholds, combined by maximum</title>
  <desc>Three stacked profiles of a crown. The all-returns layer has a deep pit in the crown centre where a pulse reached the ground. The layer from returns above 5 metres omits that low return, so the crown surface is continuous. The layer above 10 metres covers only the crown top. The maximum of the stack follows the crown without the pit.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="44" font-size="10.5" fill="var(--dg-muted)">all returns</text>
  <path d="M140 60 C200 30 250 26 290 30 L300 78 L310 30 C350 26 400 30 460 60" fill="none" stroke="var(--dg-e)" stroke-width="2"/>
  <text x="20" y="104" font-size="10.5" fill="var(--dg-muted)">returns &gt; 5 m</text>
  <path d="M150 116 C200 90 250 86 300 88 C350 86 400 90 450 116" fill="none" stroke="var(--dg-b)" stroke-width="2"/>
  <text x="20" y="160" font-size="10.5" fill="var(--dg-muted)">returns &gt; 10 m</text>
  <path d="M200 164 C240 146 270 142 300 144 C330 142 360 146 400 164" fill="none" stroke="var(--dg-a)" stroke-width="2"/>
  <text x="530" y="60" font-size="10.5" fill="var(--dg-e)">pit at the crown centre</text>
  <text x="530" y="112" font-size="10.5" fill="var(--dg-b)">no low return: no pit</text>
  <text x="530" y="160" font-size="10.5" fill="var(--dg-a)">crown top only</text>
  <text x="20" y="204" font-size="10.5" fill="var(--dg-muted)">pit-free CHM = per-cell maximum of all layers</text>
</svg>

## Prerequisites and Assumptions

- A ground-classified tile for height normalization.
- PDAL with `writers.gdal`, and NumPy and rasterio.
- Density of about 5 pts/m² or more; very sparse data produces sparse upper layers.
- A target CHM resolution, commonly 0.5 m.

## Step-by-Step Implementation

### Step 1 — Normalize heights

`filters.hag_nn` computes `HeightAboveGround`; ferry it into `Z` so rasterization works on heights.

### Step 2 — Choose thresholds

0 (all first returns), 2, 5, 10, 15, 20, 25 … up to the canopy's maximum height, in steps of about 5 m.

### Step 3 — Rasterize each layer with a tight radius

For each threshold, keep first returns above it and rasterize the maximum with a radius of about one cell. The tight radius is what stops a layer from spreading high values into gaps; the original method uses a TIN with an edge-length limit for the same purpose.

### Step 4 — Stack by maximum

Read all layers and take `np.fmax` across them, ignoring NoData.

### Step 5 — Fill remaining gaps lightly

Cells still empty (true gaps between crowns) take the all-returns value, which is usually near zero there.

## Complete Working Example

```python
"""Pit-free CHM by stacking partial CHMs from successive height thresholds."""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pdal
import rasterio

SRC = "tiles/forest_0822.laz"
RES = 0.5
THRESHOLDS = [0, 2, 5, 10, 15, 20, 25, 30]
OUT = Path("out/chm_layers")


def grid(src: str) -> dict:
    b = pdal.Pipeline(json.dumps({"pipeline": [src]})).quickinfo["readers.las"]["bounds"]
    ox, oy = math.floor(b["minx"]), math.floor(b["miny"])
    return {"origin_x": ox, "origin_y": oy,
            "width": math.ceil((b["maxx"] - ox) / RES), "height": math.ceil((b["maxy"] - oy) / RES)}


def build_layers(src: str) -> list[Path]:
    OUT.mkdir(parents=True, exist_ok=True)
    g = grid(src)
    stages = [
        src,
        {"type": "filters.range", "limits": "Classification![7:7],Classification![18:18]"},
        {"type": "filters.hag_nn", "count": 2},
        {"type": "filters.ferry", "dimensions": "HeightAboveGround=>Z"},
        {"type": "filters.range", "limits": "ReturnNumber[1:1],Z[0:80]", "tag": "first"},
    ]
    paths = []
    for t in THRESHOLDS:
        path = OUT / f"chm_gt{t:02d}.tif"
        stages += [
            {"type": "filters.range", "inputs": ["first"], "limits": f"Z[{t}:80]", "tag": f"gt{t}"},
            {"type": "writers.gdal", "inputs": [f"gt{t}"], "filename": str(path), "resolution": RES,
             "radius": RES * 1.0, "output_type": "max", "data_type": "float32", "nodata": -9999, **g},
        ]
        paths.append(path)
    pdal.Pipeline(json.dumps({"pipeline": stages})).execute()
    return paths


def stack(paths: list[Path], dst: Path) -> np.ndarray:
    layers = []
    for p in paths:
        with rasterio.open(p) as ds:
            layers.append(ds.read(1, masked=True).filled(np.nan))
            profile = ds.profile
    chm = np.nanmax(np.stack(layers), axis=0)          # per-cell maximum across layers
    chm = np.where(np.isnan(chm), 0.0, np.clip(chm, 0, None))
    with rasterio.open(dst, "w", **profile) as out:
        out.write(chm.astype("float32"), 1)
    return chm


if __name__ == "__main__":
    layers = build_layers(SRC)
    chm = stack(layers, Path("out/chm_pitfree.tif"))
    print(f"pit-free CHM: max {chm.max():.1f} m, canopy cells {np.mean(chm > 2):.1%}")
```

All layers are written in one branched pipeline, so the tile is read and normalized once — see [branching a PDAL pipeline with tags](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/branching-a-pdal-pipeline-with-tags/).

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Pit counts and detected trees for standard and pit-free CHMs" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Fewer pits, better tree counts</title>
  <desc>Two pairs of bars. Pit cells per hectare fall from about 1,900 in the standard maximum CHM to about 150 in the pit-free CHM. Tree detection F-score against field plots rises from 0.71 to 0.82 with the pit-free CHM, because crowns are no longer fragmented into several peaks.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <line x1="60" y1="160" x2="700" y2="160" stroke="var(--dg-line)" stroke-width="1.3"/>
  <rect x="120" y="30" width="70" height="130" fill="var(--dg-e-soft)" stroke="var(--dg-e)"/>
  <rect x="196" y="150" width="70" height="10" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/>
  <rect x="440" y="58" width="70" height="102" fill="var(--dg-e-soft)" stroke="var(--dg-e)"/>
  <rect x="516" y="42" width="70" height="118" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/>
  <g font-size="10.5" fill="var(--dg-text)"><text text-anchor="middle" x="155" y="24">1,900</text><text text-anchor="middle" x="231" y="144">150</text><text text-anchor="middle" x="475" y="52">0.71</text><text text-anchor="middle" x="551" y="36">0.82</text></g>
  <text x="193" y="180" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">pit cells per ha</text>
  <text x="513" y="180" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">tree detection F-score</text>
  <rect x="620" y="60" width="14" height="10" fill="var(--dg-e-soft)" stroke="var(--dg-e)"/><text x="640" y="69" font-size="10" fill="var(--dg-muted)">standard</text>
  <rect x="620" y="80" width="14" height="10" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text x="640" y="89" font-size="10" fill="var(--dg-muted)">pit-free</text>
  <text x="60" y="196" font-size="10" fill="var(--dg-muted)">illustrative open conifer stand at 12 pts/m²</text>
</svg>

## Key Parameter Table

| Setting | Typical value | Effect |
|---|---|---|
| thresholds | 0, 2, 5, 10, 15, 20 … | Step of about 5 m up to canopy maximum |
| layer `radius` | ≈ 1 cell | Small enough not to fill crown gaps from edges |
| `output_type` | `max` | Top of each layer |
| resolution | 0.5 m | Balance of crown detail and density |
| stacking | per-cell maximum | Keeps the highest non-pit value |
| gap fill | all-returns layer | True gaps stay low |

## Verification

- **Pit count.** Count cells more than 2 m below the 3×3 median in the standard and pit-free CHMs; the pit-free count should fall sharply.
- **Heights preserved.** Tree tops (local maxima) should have the same heights in both CHMs; the method removes pits, it does not raise tops.
- **Tree segmentation.** Run [watershed segmentation](https://www.pythonlidar.com/lidar-classification-feature-extraction/individual-tree-segmentation/segmenting-trees-with-a-watershed-on-a-chm/) on both and compare against plots.

## Gotchas and Edge Cases

**Radius too large.** A generous radius in upper layers spreads crown-top values sideways into gaps between trees, merging neighbouring crowns. Keep it near one cell.

**Sparse upper layers.** On low-density data, the highest layers contain only a handful of returns and add speckle. Stop the thresholds where layers become too sparse to form crowns.

**Thresholds relative to tree size.** Short stands (under 10 m) need finer steps (1–2 m); tall forest can use 5 m steps.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A too-large radius merging neighbouring crowns in an upper layer" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Keep the layer radius tight</title>
  <desc>Two crowns separated by a narrow gap. With a one-cell radius, the upper layer keeps the gap, and two crowns remain distinct. With a three-cell radius, high values spread across the gap and the two crowns merge into one blob, which segmentation would count as one tree.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <text x="185" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">radius 1 cell</text>
  <text x="555" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">radius 3 cells</text>
  <ellipse cx="130" cy="90" rx="55" ry="42" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <ellipse cx="250" cy="90" rx="55" ry="42" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <path d="M440 90 C440 40 520 40 555 60 C590 40 670 40 670 90 C670 140 590 140 555 120 C520 140 440 140 440 90 Z" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="185" y="156" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">two crowns, gap kept</text>
  <text x="555" y="156" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">crowns merged across the gap</text>
</svg>

**Buildings.** In mixed urban areas, roofs appear in the CHM too. Exclude class 6 before building layers if the CHM is meant for vegetation only.

## Frequently Asked Questions

**What is a pit-free canopy height model?**

A CHM in which the spurious low cells inside crowns, caused by laser pulses passing through gaps, have been removed. The layered method builds partial CHMs from returns above successive heights and combines them with a per-cell maximum.

**Why do pits matter?**

They fragment crowns into several apparent peaks and holes, which makes individual tree detection count too many trees and distorts crown metrics and canopy cover.

**Is a pit-free CHM the same as smoothing?**

No. Smoothing lowers tree tops and blurs crown edges. The layered method keeps measured heights and only replaces pit cells with values from higher layers.

**How many layers do I need?**

Enough to span the canopy height range in steps of about 5 metres for tall forest, or 1 to 2 metres for short vegetation. Beyond the tallest trees, extra layers are empty and add nothing.

## Related

- [Canopy Height Models](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/) — CHMs in general
- [Rasterizing a Canopy Height Model from HAG](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/rasterizing-a-canopy-height-model-from-hag/) — the standard CHM
- [Segmenting Trees with a Watershed on a CHM](https://www.pythonlidar.com/lidar-classification-feature-extraction/individual-tree-segmentation/segmenting-trees-with-a-watershed-on-a-chm/) — the main consumer of pit-free CHMs
- [Removing Pits and Spikes from a DSM](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/removing-pits-and-spikes-from-a-dsm/) — the median-based alternative
- [Computing Canopy Cover from LiDAR](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/computing-canopy-cover-from-lidar/) — another CHM-derived product
