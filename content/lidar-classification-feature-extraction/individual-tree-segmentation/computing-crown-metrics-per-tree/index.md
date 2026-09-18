---
title: "Computing Crown Metrics per Tree"
description: "Turn segmented trees into an inventory table: height, crown base height, crown area from a convex or concave hull, crown volume, and height percentiles per tree — computed with pandas and Shapely from TreeID-labelled points."
slug: "computing-crown-metrics-per-tree"
type: "howto"
breadcrumb: "Crown Metrics per Tree"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Computing Crown Metrics per Tree",
      "description": "Turn segmented trees into an inventory table: height, crown base height, crown area from a convex or concave hull, crown volume, and height percentiles per tree \u2014 computed with pandas and Shapely from TreeID-labelled points.",
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
          "name": "Classification & Feature Extraction",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Individual Tree Segmentation",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/individual-tree-segmentation/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Crown Metrics per Tree",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/individual-tree-segmentation/computing-crown-metrics-per-tree/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Compute per-tree crown metrics from segmented LiDAR points",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Load labelled points into a data frame",
          "text": "Read X, Y, HeightAboveGround and TreeID, and drop label 0."
        },
        {
          "@type": "HowToStep",
          "name": "Compute height statistics",
          "text": "Maximum height is tree height. The 95th percentile is a steadier alternative when the very top return may be a bird or noise."
        },
        {
          "@type": "HowToStep",
          "name": "Estimate crown base height",
          "text": "Histogram each tree's heights in 0.5 m bins. Starting from the top, walk down while bins contain points; the first run of two or more empty bins marks the gap between crown and stem, and the bottom of the last occupied bin above it is the crown base."
        },
        {
          "@type": "HowToStep",
          "name": "Compute crown area and diameter",
          "text": "Build a concave hull of the plan coordinates with a ratio of 0.3 to 0.5; the convex hull overestimates irregular crowns. Equivalent diameter is 2\u00b7sqrt(area/\u03c0)."
        },
        {
          "@type": "HowToStep",
          "name": "Approximate crown volume",
          "text": "Slice the crown into 1 m height layers, compute the convex hull area of each layer, and sum area times thickness. It is an approximation, but a consistent one."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How is crown base height defined from LiDAR?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "As the height where the continuous vertical run of crown returns ends, walking down from the top \u2014 in practice the top of the first gap of a metre or more below the crown. Field definitions vary, such as lowest live branch or lowest branch whorl, so state which one your comparison uses."
          }
        },
        {
          "@type": "Question",
          "name": "Should I use a convex or concave hull for crown area?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A concave hull with a moderate ratio follows irregular crowns more faithfully; the convex hull overestimates area for asymmetric and gappy crowns. For round conifer crowns the difference is small."
          }
        },
        {
          "@type": "Question",
          "name": "Can I estimate stem diameter from these metrics?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Only through allometric equations that relate height and crown size to diameter for a species or region. LiDAR does not measure the stem directly from the air; the accuracy depends entirely on the equation's fit."
          }
        },
        {
          "@type": "Question",
          "name": "Why use the 95th percentile instead of maximum height?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The maximum can be a single noisy return or a bird. The 95th percentile is stable, but slightly lower than the true top; report maximum as height and keep p95 as a robustness check."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Group `TreeID`-labelled points by tree, and for each compute height (maximum `HeightAboveGround`), height percentiles (p25, p50, p75, p95), crown base height (the lowest height of a continuous run of crown points), crown area from a Shapely concave hull of the plan coordinates, equivalent crown diameter, and an approximate crown volume from a stacked-slice hull — then write one row per tree.

## Context and Motivation

This guide is part of [Individual Tree Segmentation from LiDAR](https://www.pythonlidar.com/lidar-classification-feature-extraction/individual-tree-segmentation/). A segmented tree is only useful once it is described in the numbers foresters, ecologists and arborists work with. Height and crown diameter feed allometric equations for stem diameter, biomass and carbon. Crown base height matters for fire behaviour models, because it decides whether a surface fire can climb into the canopy. Crown volume and height percentiles describe structure for habitat studies and growth monitoring.

All of these can be computed from the points labelled with each tree, and computing them from points rather than from a CHM keeps information that rasterization discards — especially the lower crown, which the CHM cannot see at all.

<svg viewBox="0 0 740 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A single tree annotated with its crown metrics" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>One tree, six numbers</title>
  <desc>A side view of a conifer. Annotations mark tree height at the top point, crown base height where continuous crown points begin above the bare stem, crown length between them, and crown diameter across the widest part. A plan-view inset shows the concave hull of the crown's points whose area is the crown area.</desc>
  <rect x="0" y="0" width="740" height="230" fill="var(--dg-bg)" rx="10"/>
  <line x1="40" y1="206" x2="440" y2="206" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="220" y1="206" x2="220" y2="128" stroke="var(--dg-line)" stroke-width="3"/>
  <path d="M220 22 L270 128 L170 128 Z" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.4"/>
  <line x1="300" y1="22" x2="300" y2="206" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="306" y="116" font-size="10.5" fill="var(--dg-a)">height 24.6 m</text>
  <line x1="120" y1="128" x2="120" y2="206" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="114" y="170" text-anchor="end" font-size="10.5" fill="var(--dg-c)">crown base 9.1 m</text>
  <line x1="150" y1="22" x2="150" y2="128" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="144" y="76" text-anchor="end" font-size="10.5" fill="var(--dg-b)">crown length</text>
  <line x1="170" y1="140" x2="270" y2="140" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="220" y="156" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">diameter 6.8 m</text>
  <rect x="490" y="30" width="220" height="176" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="600" y="50" text-anchor="middle" font-size="11" fill="var(--dg-text)">plan view</text>
  <path d="M560 90 L600 70 L650 86 L668 126 L640 168 L590 172 L552 140 Z" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.4"/>
  <text x="600" y="194" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">concave hull area 34.2 m²</text>
</svg>

## Prerequisites and Assumptions

- Points labelled with `TreeID` and carrying `HeightAboveGround`, from [point-based segmentation](https://www.pythonlidar.com/lidar-classification-feature-extraction/individual-tree-segmentation/segmenting-trees-directly-from-points/) or from crown polygons burned onto points with `filters.overlay`.
- Python with pandas, NumPy and Shapely 2.0+ (for `shapely.concave_hull`).
- A projected CRS in metres.
- A decision on the minimum height counted as crown rather than understorey; 2 m is common.

## Step-by-Step Implementation

### Step 1 — Load labelled points into a data frame

Read `X`, `Y`, `HeightAboveGround` and `TreeID`, and drop label 0.

### Step 2 — Compute height statistics

Maximum height is tree height. The 95th percentile is a steadier alternative when the very top return may be a bird or noise. Keep p25, p50 and p75 as structural descriptors.

### Step 3 — Estimate crown base height

Histogram each tree's heights in 0.5 m bins. Starting from the top, walk down while bins contain points; the first run of two or more empty bins marks the gap between crown and stem, and the bottom of the last occupied bin above it is the crown base.

### Step 4 — Compute crown area and diameter

Build a concave hull of the plan coordinates with a ratio of 0.3 to 0.5; the convex hull overestimates irregular crowns. Equivalent diameter is `2·sqrt(area/π)`.

### Step 5 — Approximate crown volume

Slice the crown into 1 m height layers, compute the convex hull area of each layer, and sum area times thickness. It is an approximation, but a consistent one.

## Complete Working Example

```python
"""Per-tree crown metrics from TreeID-labelled points."""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import pdal
import shapely
from shapely.geometry import MultiPoint


def load(path: Path) -> pd.DataFrame:
    p = pdal.Pipeline(f'["{path}"]')
    p.execute()
    a = p.arrays[0]
    hag = a["HeightAboveGround"] if "HeightAboveGround" in a.dtype.names else a["Z"]
    df = pd.DataFrame({"x": a["X"], "y": a["Y"], "h": hag, "tree": a["TreeID"]})
    return df[df.tree > 0]


def crown_base(h: np.ndarray, bin_m: float = 0.5, gap_bins: int = 2, floor: float = 2.0) -> float:
    edges = np.arange(floor, h.max() + bin_m, bin_m)
    counts, _ = np.histogram(h, bins=edges)
    empty_run = 0
    for i in range(len(counts) - 1, -1, -1):
        if counts[i] == 0:
            empty_run += 1
            if empty_run >= gap_bins:
                return float(edges[i + gap_bins])
        else:
            empty_run = 0
    return float(floor)


def crown_volume(g: pd.DataFrame, base: float, slice_m: float = 1.0) -> float:
    vol = 0.0
    for lo in np.arange(base, g.h.max(), slice_m):
        layer = g[(g.h >= lo) & (g.h < lo + slice_m)]
        if len(layer) >= 3:
            vol += MultiPoint(layer[["x", "y"]].to_numpy()).convex_hull.area * slice_m
    return vol


def metrics(df: pd.DataFrame, ratio: float = 0.4) -> pd.DataFrame:
    rows = []
    for tid, g in df.groupby("tree"):
        if len(g) < 20:
            continue
        h = g.h.to_numpy()
        hull = shapely.concave_hull(MultiPoint(g[["x", "y"]].to_numpy()), ratio=ratio)
        area = hull.area
        base = crown_base(h)
        top = g.loc[g.h.idxmax()]
        rows.append({
            "tree_id": int(tid), "x": round(top.x, 2), "y": round(top.y, 2),
            "height_m": round(float(h.max()), 2),
            "p95_m": round(float(np.percentile(h, 95)), 2),
            "p50_m": round(float(np.percentile(h, 50)), 2),
            "crown_base_m": round(base, 2),
            "crown_length_m": round(float(h.max()) - base, 2),
            "crown_area_m2": round(area, 1),
            "crown_diam_m": round(2 * np.sqrt(area / np.pi), 2),
            "crown_volume_m3": round(crown_volume(g, base), 1),
            "points": len(g),
        })
    return pd.DataFrame(rows)


if __name__ == "__main__":
    table = metrics(load(Path("out/stand_12/litree.laz")))
    table.to_csv("out/stand_12/tree_metrics.csv", index=False)
    print(table.describe().round(2).T[["mean", "min", "max"]])
```

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A height histogram for one tree showing the gap that defines crown base height" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Finding the crown base in a histogram</title>
  <desc>A vertical histogram of point counts per half-metre height bin for one tree. Counts are high between 9 and 24 metres, the crown. Between 5 and 9 metres the bins are empty apart from one stray return, the bare stem. A few points near 2 to 4 metres belong to shrubs. The crown base is placed at 9.1 metres, where the continuous run of occupied bins ends when walking down from the top.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <line x1="100" y1="200" x2="100" y2="20" stroke="var(--dg-line)" stroke-width="1.3"/>
  <g fill="var(--dg-d)">
    <rect x="100" y="24" width="40" height="8"/><rect x="100" y="34" width="110" height="8"/><rect x="100" y="44" width="180" height="8"/><rect x="100" y="54" width="240" height="8"/><rect x="100" y="64" width="290" height="8"/><rect x="100" y="74" width="310" height="8"/><rect x="100" y="84" width="280" height="8"/><rect x="100" y="94" width="220" height="8"/><rect x="100" y="104" width="140" height="8"/><rect x="100" y="114" width="60" height="8"/>
  </g>
  <rect x="100" y="144" width="8" height="8" fill="var(--dg-line-soft)"/>
  <g fill="var(--dg-c)"><rect x="100" y="174" width="30" height="8"/><rect x="100" y="184" width="50" height="8"/></g>
  <line x1="90" y1="124" x2="520" y2="124" stroke="var(--dg-e)" stroke-width="1.6" stroke-dasharray="6 4"/>
  <text x="526" y="128" font-size="10.5" fill="var(--dg-e)">crown base 9.1 m</text>
  <text x="420" y="80" font-size="10.5" fill="var(--dg-text)">crown</text>
  <text x="130" y="152" font-size="10.5" fill="var(--dg-muted)">stem gap (one stray return ignored)</text>
  <text x="160" y="190" font-size="10.5" fill="var(--dg-muted)">shrub layer, not part of the crown</text>
  <text x="92" y="28" text-anchor="end" font-size="10" fill="var(--dg-muted)">24 m</text>
  <text x="92" y="204" text-anchor="end" font-size="10" fill="var(--dg-muted)">2 m</text>
</svg>

## Key Parameter Table

| Parameter | Type | Default | Guidance |
|---|---|---|---|
| minimum points per tree | int | 20 | Fewer gives unstable hulls and percentiles |
| concave hull `ratio` | float | 0.4 | 0 is tightest, 1 equals convex hull; 0.3–0.5 follows crowns well |
| histogram bin | float, m | 0.5 | Coarser misses short gaps; finer creates spurious gaps on sparse data |
| `gap_bins` | int | 2 | Empty bins in a row that count as the stem gap (1 m at 0.5 m bins) |
| `floor` | float, m | 2.0 | Heights below are ignored for crown base |
| volume slice | float, m | 1.0 | Thinner slices capture shape better, at more noise |

## Verification

- **Ranges.** Crown base must be below height, crown length positive, and diameter plausible for the species (a 25 m conifer with a 20 m crown diameter is suspicious).
- **Allometric consistency.** Plot crown diameter against height; most forest types show a clear positive trend. Points far off the trend are usually merged or split segments.
- **Against plots.** Where field crown base heights exist, compare them; LiDAR crown base is typically within one to two metres, with larger errors under dense upper canopy that hides the lower crown.

```python
t = pd.read_csv("out/stand_12/tree_metrics.csv")
assert (t.crown_base_m < t.height_m).all()
assert (t.crown_diam_m.between(0.5, 30)).all()
print(t[["height_m", "crown_diam_m"]].corr().iloc[0, 1])
```

## Gotchas and Edge Cases

**Occluded lower crowns.** In dense stands, few pulses reach the lower crown, so crown base can be overestimated. Treat it as a lower-confidence metric and report point counts in the lower crown alongside it.

**Understorey inside a tree's label.** Point-based segmentation sometimes assigns shrub or sapling returns beneath a crown to the tree. The histogram gap method is robust to that, but percentiles like p25 are not; compute them above crown base.

**Concave hull ratio too small.** Very small ratios create spiky, fragmented hulls, sometimes MultiPolygons. If area jumps between neighbouring ratio values, raise it.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Convex hull, concave hull and an over-tight hull around the same crown points" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Three hulls around one crown</title>
  <desc>Three copies of the same asymmetric crown point pattern. The convex hull encloses a large empty notch and reports 41 square metres. A concave hull at ratio 0.4 follows the notch and reports 33 square metres. A concave hull at ratio 0.05 breaks into spiky fragments and reports 19 square metres.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <text x="125" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">convex: 41 m²</text>
  <text x="370" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">ratio 0.4: 33 m²</text>
  <text x="615" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">ratio 0.05: 19 m²</text>
  <path d="M60 60 L150 44 L200 90 L190 160 L80 170 L50 120 Z" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.4"/>
  <path d="M305 60 L395 44 L445 90 L400 110 L435 160 L325 170 L295 120 Z" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.4"/>
  <path d="M550 60 L590 70 L640 44 L630 80 L690 90 L645 110 L680 160 L620 140 L570 170 L580 130 L540 120 L565 95 Z" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.4"/>
  <g fill="var(--dg-text)"><circle cx="70" cy="70" r="2"/><circle cx="140" cy="54" r="2"/><circle cx="185" cy="92" r="2"/><circle cx="178" cy="152" r="2"/><circle cx="90" cy="160" r="2"/><circle cx="62" cy="120" r="2"/><circle cx="110" cy="100" r="2"/><circle cx="150" cy="130" r="2"/></g>
  <text x="125" y="190" text-anchor="middle" font-size="10" fill="var(--dg-muted)">overstates notched crowns</text>
  <text x="370" y="190" text-anchor="middle" font-size="10" fill="var(--dg-muted)">follows the crown</text>
  <text x="615" y="190" text-anchor="middle" font-size="10" fill="var(--dg-muted)">spiky, understates</text>
</svg>

**Crown volume is relative.** Slice-hull volume depends on density, slice thickness and hull choice. Use it to compare trees within one dataset, not as an absolute volume across projects.

## Frequently Asked Questions

**How is crown base height defined from LiDAR?**

As the height where the continuous vertical run of crown returns ends, walking down from the top — in practice the top of the first gap of a metre or more below the crown. Field definitions vary, such as lowest live branch or lowest branch whorl, so state which one your comparison uses.

**Should I use a convex or concave hull for crown area?**

A concave hull with a moderate ratio follows irregular crowns more faithfully; the convex hull overestimates area for asymmetric and gappy crowns. For round conifer crowns the difference is small.

**Can I estimate stem diameter from these metrics?**

Only through allometric equations that relate height and crown size to diameter for a species or region. LiDAR does not measure the stem directly from the air; the accuracy depends entirely on the equation's fit.

**Why use the 95th percentile instead of maximum height?**

The maximum can be a single noisy return or a bird. The 95th percentile is stable, but slightly lower than the true top; report maximum as height and keep p95 as a robustness check.

## Related

- [Individual Tree Segmentation from LiDAR](https://www.pythonlidar.com/lidar-classification-feature-extraction/individual-tree-segmentation/) — producing the tree labels
- [Segmenting Trees Directly from Points](https://www.pythonlidar.com/lidar-classification-feature-extraction/individual-tree-segmentation/segmenting-trees-directly-from-points/) — TreeID from filters.litree
- [Segmenting Trees with a Watershed on a CHM](https://www.pythonlidar.com/lidar-classification-feature-extraction/individual-tree-segmentation/segmenting-trees-with-a-watershed-on-a-chm/) — crowns from a raster
- [Computing Canopy Cover from LiDAR](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/computing-canopy-cover-from-lidar/) — the area-based counterpart to tree metrics
- [Extracting Objects from Segment Labels](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/extracting-objects-from-segment-labels/) — the general per-object table pattern
