---
title: "Removing Pits and Spikes from a DSM"
description: "Clean a LiDAR digital surface model of data pits (laser penetration into canopy and roofs) and spikes (birds, wires, noise): detecting them against a median-filtered surface, replacing only flagged cells, fixing causes upstream in PDAL, and preserving real edges."
slug: "removing-pits-and-spikes-from-a-dsm"
type: "howto"
breadcrumb: "DSM Pits and Spikes"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Removing Pits and Spikes from a DSM",
      "description": "Clean a LiDAR digital surface model of data pits (laser penetration into canopy and roofs) and spikes (birds, wires, noise): detecting them against a median-filtered surface, replacing only flagged cells, fixing causes upstream in PDAL, and preserving real edges.",
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
          "name": "DSM Generation",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "DSM Pits and Spikes",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/removing-pits-and-spikes-from-a-dsm/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Remove pits and spikes from a LiDAR DSM",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Prevent artefacts upstream",
          "text": "Remove noise classes before rasterizing, use first returns only, and set radius so each cell sees returns from its neighbours \u2014 which fills many pits before they exist."
        },
        {
          "@type": "HowToStep",
          "name": "Build a reference surface",
          "text": "A median filter of 3\u00d73 (or 5\u00d75 in canopy) is robust to single-cell outliers and preserves edges better than a mean."
        },
        {
          "@type": "HowToStep",
          "name": "Flag pits and spikes",
          "text": "Pits: DSM \u2212 median < \u2212pit_threshold. Spikes: DSM \u2212 median > spike_threshold."
        },
        {
          "@type": "HowToStep",
          "name": "Replace only flagged cells",
          "text": "Copy the median value into flagged cells; all other cells keep their original values."
        },
        {
          "@type": "HowToStep",
          "name": "Iterate once if needed",
          "text": "Clusters of adjacent pits survive a 3\u00d73 median. A second pass with 5\u00d75 catches most of them."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What causes pits in a LiDAR DSM?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Cells where no first return from the top surface landed, so the highest return is from lower down \u2014 a branch inside the crown or the ground through a gap. They are most common in canopy and at low point densities."
          }
        },
        {
          "@type": "Question",
          "name": "How do I remove spikes from a DSM?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Flag cells that rise more than a threshold above a median-filtered version of the DSM and replace only those cells with the median value. Removing high-noise returns before rasterizing prevents most spikes."
          }
        },
        {
          "@type": "Question",
          "name": "Why not just smooth the whole DSM?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Smoothing removes artefacts but also blurs roof edges, crown boundaries and every other sharp feature. Detecting and replacing only anomalous cells keeps the rest of the surface exactly as measured."
          }
        },
        {
          "@type": "Question",
          "name": "Does writers.gdal radius affect pits?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. A radius at least as large as the cell size lets each cell take the maximum from a slightly larger neighbourhood, which fills many single-cell pits before any post-processing."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Compare the DSM with a 3×3 or 5×5 median-filtered copy; cells more than a threshold below it (for example 2 m) are pits, cells more than a threshold above it are spikes. Replace only those cells with the median value and leave everything else untouched. Fix what you can upstream — remove classes 7 and 18, keep first returns only, use `output_type: "max"` with a radius that covers each cell — so fewer cells need repair.

## Context and Motivation

This guide is part of [DSM Generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/). A DSM from the highest return per cell should trace roofs and canopy tops. Two artefacts spoil it. Pits are cells far below their neighbours: a pulse passed through a gap in a crown or between roof tiles and no first return higher up landed in that cell, so the maximum is a branch or the ground. Spikes are cells far above their neighbours: a bird, a wire, a crane jib or a high-noise return. In a hillshade, pits look like holes drilled into canopy and spikes like needles; in a canopy height model, pits break crowns into fragments and spikes create giant trees.

Blanket smoothing removes both but blurs every roof edge. The better approach is to detect the artefacts explicitly and replace only them.

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A DSM profile with a pit, a spike and a real roof edge" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Artefacts versus real edges</title>
  <desc>A DSM profile across a canopy and a building. A narrow pit drops several metres into the canopy where a pulse penetrated a gap. A single-cell spike rises far above the roof from a bird return. The roof edge is a genuine sharp drop spanning many cells. Detection flags the pit and spike, which are one or two cells wide, but not the roof edge.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <polyline points="30,90 70,86 110,84 150,88 170,88 180,150 190,88 230,86 270,90 300,92 320,170 360,170 380,110 420,110 460,110 470,30 480,110 540,110 580,110 600,170 710,170" fill="none" stroke="var(--dg-a)" stroke-width="2"/>
  <circle cx="180" cy="150" r="6" fill="none" stroke="var(--dg-e)" stroke-width="1.8"/>
  <circle cx="470" cy="30" r="6" fill="none" stroke="var(--dg-e)" stroke-width="1.8"/>
  <text x="192" y="164" font-size="10.5" fill="var(--dg-e)">pit: one cell deep hole</text>
  <text x="482" y="36" font-size="10.5" fill="var(--dg-e)">spike: bird return</text>
  <text x="620" y="140" font-size="10.5" fill="var(--dg-d)">roof edge: real, kept</text>
  <text x="30" y="200" font-size="10.5" fill="var(--dg-muted)">canopy on the left, a building on the right (illustrative)</text>
</svg>

## Prerequisites and Assumptions

- A DSM GeoTIFF from first returns, or the classified point cloud to rebuild it.
- rasterio, NumPy and SciPy.
- A sense of expected surface roughness: canopy tolerates larger local variation than roofs.

## Step-by-Step Implementation

### Step 1 — Prevent artefacts upstream

Remove noise classes before rasterizing, use first returns only, and set `radius` so each cell sees returns from its neighbours — which fills many pits before they exist.

### Step 2 — Build a reference surface

A median filter of 3×3 (or 5×5 in canopy) is robust to single-cell outliers and preserves edges better than a mean.

### Step 3 — Flag pits and spikes

Pits: DSM − median < −pit_threshold. Spikes: DSM − median > spike_threshold. Thresholds of 1.5–3 m suit canopy; 0.5–1 m suit urban roofs.

### Step 4 — Replace only flagged cells

Copy the median value into flagged cells; all other cells keep their original values.

### Step 5 — Iterate once if needed

Clusters of adjacent pits survive a 3×3 median. A second pass with 5×5 catches most of them.

## Complete Working Example

```python
"""Detect and repair pits and spikes in a DSM without blurring real edges."""
from __future__ import annotations

import numpy as np
import rasterio
from scipy import ndimage as ndi


def repair(src: str, dst: str, pit_m: float = 2.0, spike_m: float = 3.0,
           sizes: tuple[int, ...] = (3, 5)) -> dict:
    with rasterio.open(src) as ds:
        z = ds.read(1, masked=True)
        profile = ds.profile
    valid = ~z.mask
    arr = z.filled(np.nan).astype("float64")
    stats = {"pits": 0, "spikes": 0}
    for size in sizes:
        filled = np.where(valid, arr, np.nanmedian(arr))
        med = ndi.median_filter(filled, size=size)
        diff = arr - med
        pits = valid & (diff < -pit_m)
        spikes = valid & (diff > spike_m)
        arr[pits | spikes] = med[pits | spikes]
        stats["pits"] += int(pits.sum())
        stats["spikes"] += int(spikes.sum())
    out = np.where(valid, arr, profile.get("nodata", -9999)).astype("float32")
    with rasterio.open(dst, "w", **profile) as o:
        o.write(out, 1)
    stats["share_repaired"] = round((stats["pits"] + stats["spikes"]) / valid.sum(), 5)
    return stats


if __name__ == "__main__":
    print(repair("out/dsm.tif", "out/dsm_clean.tif"))
```

And the upstream PDAL settings that reduce how much repair is needed:

```json
{
  "pipeline": [
    "tiles/t_0431.laz",
    { "type": "filters.range", "limits": "Classification![7:7],Classification![18:18]" },
    { "type": "filters.outlier", "method": "statistical", "mean_k": 10, "multiplier": 3.0, "class": 18 },
    { "type": "filters.range", "limits": "Classification![18:18]" },
    { "type": "filters.range", "limits": "ReturnNumber[1:1]" },
    { "type": "writers.gdal", "filename": "out/dsm.tif", "resolution": 0.5, "radius": 0.5,
      "output_type": "max", "data_type": "float32", "nodata": -9999 }
  ]
}
```

A radius equal to the resolution (rather than 0.71 × resolution) lets each cell take the maximum of a slightly larger neighbourhood, filling many single-cell pits at the cost of marginally widening objects.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Pit counts before and after upstream settings and after repair" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Fix upstream first, then repair</title>
  <desc>Bars of pit cells per square kilometre in a forested tile. A DSM from all returns with a small radius has about 41,000 pits. Using first returns and a radius equal to the cell size reduces that to about 9,000. The median-based repair removes nearly all of the rest, leaving about 300.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <g font-size="11" fill="var(--dg-text)"><text text-anchor="end" x="260" y="48">all returns, small radius</text><text text-anchor="end" x="260" y="98">first returns, radius = cell</text><text text-anchor="end" x="260" y="148">+ median repair</text></g>
  <rect x="270" y="34" width="410" height="22" fill="var(--dg-e)"/>
  <rect x="270" y="84" width="90" height="22" fill="var(--dg-c)"/>
  <rect x="270" y="134" width="4" height="22" fill="var(--dg-d)"/>
  <g font-size="10.5" fill="var(--dg-muted)"><text x="672" y="74" text-anchor="end">41,000</text><text x="368" y="100">9,000</text><text x="282" y="150">≈ 300</text></g>
  <text x="270" y="186" font-size="10.5" fill="var(--dg-muted)">pit cells per km² at 0.5 m, illustrative forest tile</text>
</svg>

## Key Parameter Table

| Setting | Canopy | Urban | Effect |
|---|---|---|---|
| `pit_m` | 2–3 m | 0.5–1 m | Depth below the median flagged as a pit |
| `spike_m` | 3–5 m | 1–2 m | Height above the median flagged as a spike |
| median sizes | (3, 5) | (3,) | Larger windows catch clustered pits, risk edges |
| `radius` in writers.gdal | 1.0 × res | 0.71 × res | Larger fills pits upstream, widens objects |
| input returns | first | first | Last returns create pits by design |

## Verification

- **Repaired share.** Typically under 1 percent of cells in canopy and far less in towns. Much more suggests thresholds are too tight and real texture is being flattened.
- **Edges untouched.** Difference original and repaired DSMs; non-zero cells should be isolated points, not lines along roof edges.
- **Hillshade.** Holes in canopy and needles on roofs should be gone.

## Gotchas and Edge Cases

**Thresholds too tight in canopy.** Crowns are rough; a 1 m pit threshold in forest flags genuine gaps between branches and smooths the canopy. Use canopy-appropriate thresholds, or separate masks for built and vegetated areas.

**Chimneys and masts.** Real narrow objects look like spikes. If they matter — telecom masts, chimneys for obstruction surveys — raise the spike threshold or protect known structures.

**Gaps between buildings.** Narrow alleys a cell or two wide look like pits between roofs. The urban thresholds help; so does classification-aware repair that does not touch cells whose lowest return is ground.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="An alley between buildings mistaken for a pit" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Not every hole is a pit</title>
  <desc>Two buildings separated by a narrow alley one cell wide. The alley cell is much lower than its neighbours and resembles a pit. With a large pit threshold, or a check that the alley's lowest return is classified ground, the cell is kept; with a naive threshold it would be filled to roof height.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <path d="M60 140 L60 60 L340 60 L340 140" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <path d="M370 140 L370 70 L680 70 L680 140" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <line x1="20" y1="140" x2="720" y2="140" stroke="var(--dg-line)" stroke-width="1.4"/>
  <text x="355" y="36" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">1-cell alley: ground return, keep</text>
  <line x1="355" y1="44" x2="355" y2="134" stroke="var(--dg-e)" stroke-width="1.2" stroke-dasharray="3 3"/>
  <text x="370" y="162" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">naive repair would fill it to roof height</text>
</svg>

**Repairing the nDSM instead.** If you build an nDSM, repair the DSM before subtraction. Repairing the difference mixes DTM and DSM artefacts and is harder to reason about.

## Frequently Asked Questions

**What causes pits in a LiDAR DSM?**

Cells where no first return from the top surface landed, so the highest return is from lower down — a branch inside the crown or the ground through a gap. They are most common in canopy and at low point densities.

**How do I remove spikes from a DSM?**

Flag cells that rise more than a threshold above a median-filtered version of the DSM and replace only those cells with the median value. Removing high-noise returns before rasterizing prevents most spikes.

**Why not just smooth the whole DSM?**

Smoothing removes artefacts but also blurs roof edges, crown boundaries and every other sharp feature. Detecting and replacing only anomalous cells keeps the rest of the surface exactly as measured.

**Does writers.gdal radius affect pits?**

Yes. A radius at least as large as the cell size lets each cell take the maximum from a slightly larger neighbourhood, which fills many single-cell pits before any post-processing.

## Related

- [DSM Generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/) — surface models in general
- [Building a DSM from First Returns](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/building-a-dsm-from-first-returns/) — the upstream settings
- [Building a Normalized DSM](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/building-a-normalized-dsm/) — the next step after cleaning
- [Building a Pit-Free Canopy Height Model](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/building-a-pit-free-canopy-height-model/) — the vegetation-specific method
- [Removing Noise Classes Before Processing](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/removing-noise-classes-before-processing/) — preventing spikes
