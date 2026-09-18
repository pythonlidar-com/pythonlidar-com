---
title: "Segmenting Trees Directly from Points"
description: "Point-based individual tree segmentation with PDAL filters.litree: preparing a normalized vegetation cloud, choosing min_height, min_points and radius, reading TreeID in Python, and comparing results with a CHM watershed."
slug: "segmenting-trees-directly-from-points"
type: "howto"
breadcrumb: "Trees from Points"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Segmenting Trees Directly from Points",
      "description": "Point-based individual tree segmentation with PDAL filters.litree: preparing a normalized vegetation cloud, choosing min_height, min_points and radius, reading TreeID in Python, and comparing results with a CHM watershed.",
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
          "name": "Trees from Points",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/individual-tree-segmentation/segmenting-trees-directly-from-points/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Segment individual trees from points with PDAL filters.litree",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Normalize heights and keep vegetation",
          "text": "Compute HeightAboveGround, drop ground and noise, and keep points above 2 m so grass and shrubs do not seed trees."
        },
        {
          "@type": "HowToStep",
          "name": "Put height above ground into Z",
          "text": "The region growing uses Z for ordering and spacing. On sloping terrain, raw elevation would put the uphill side of a crown \"above\" the downhill tree next to it."
        },
        {
          "@type": "HowToStep",
          "name": "Run filters.litree",
          "text": "Set min_height to the lowest tree top you want, min_points to the smallest tree worth keeping, and radius to bound the search for competing trees."
        },
        {
          "@type": "HowToStep",
          "name": "Summarise per TreeID",
          "text": "Group points by TreeID in pandas: count, maximum height, plan extent and centroid of the highest points."
        },
        {
          "@type": "HowToStep",
          "name": "Compare with the CHM result",
          "text": "Match tops from both methods within 2 m. Trees found only by filters.litree are candidates for understorey; inspect a few to confirm they are real."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Is filters.litree better than a CHM watershed?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It finds more trees below the main canopy and gives per-point labels, at the cost of much longer run times and fewer tuning options. For dominant trees in open stands both methods perform similarly; for multi-layered forests the point method has a real advantage."
          }
        },
        {
          "@type": "Question",
          "name": "Why must height above ground replace Z before filters.litree?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The algorithm orders and compares points by Z. On a slope, raw elevation mixes terrain height into that comparison, so trees uphill appear taller than their neighbours downhill. Normalized heights compare trees as they actually stand."
          }
        },
        {
          "@type": "Question",
          "name": "How do I speed up filters.litree on dense data?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Restrict input to vegetation above 2 m, reduce radius to 40 to 60 metres, and voxel-thin to about 0.25 metres. Labels can be transferred back to the full-density cloud afterwards."
          }
        },
        {
          "@type": "Question",
          "name": "What does TreeID 0 mean?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The point was not assigned to any tree, usually because it lies below min_height and never connected to a seeded tree, or belongs to a group smaller than min_points."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Normalize heights with `filters.hag_nn`, keep vegetation above about 2 m, swap `HeightAboveGround` into `Z` with `filters.ferry`, then run `filters.litree` with `min_height: 3`, `min_points: 50` and a `radius` of 50–100 m; each point gets a `TreeID`, and a pandas groupby turns those labels into a tree table.

## Context and Motivation

This guide is part of [Individual Tree Segmentation from LiDAR](https://www.pythonlidar.com/lidar-classification-feature-extraction/individual-tree-segmentation/). A canopy height model throws away every return below the top surface, which is most of the returns in a multi-layered forest. Point-based segmentation keeps them. `filters.litree` implements the region-growing method of Li, Guo, Jakubowski and Kelly (2012): it repeatedly takes the highest unassigned point as a new tree top, then walks down through the remaining points in height order, assigning each to the current tree if it is closer to that tree's points than to the competing set, using spacing thresholds that relax lower in the crown.

The benefit is twofold. Understorey trees that grow in gaps or beneath taller crowns can be found, because their points exist even when the CHM hides them. And the output is a label on every point, so per-tree structural metrics — height percentiles, crown base height, vertical profile — come straight from the points rather than from a raster.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The top-down region-growing order used by filters.litree" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Growing trees from the top down</title>
  <desc>A side view of two crowns. Points are processed from highest to lowest. The highest point seeds tree 1. The next high point, far from tree 1, seeds tree 2. Lower points are assigned to whichever tree's existing points are nearer, shown by arrows. A horizontal sweep line marks the current height being processed.</desc>
  <defs><marker id="lt-arw" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <line x1="40" y1="200" x2="700" y2="200" stroke="var(--dg-line)" stroke-width="1.3"/>
  <g fill="var(--dg-a)"><circle cx="220" cy="40" r="5"/><circle cx="200" cy="66" r="3.4"/><circle cx="240" cy="70" r="3.4"/><circle cx="180" cy="96" r="3.4"/><circle cx="262" cy="98" r="3.4"/></g>
  <g fill="var(--dg-c)"><circle cx="480" cy="64" r="5"/><circle cx="460" cy="90" r="3.4"/><circle cx="502" cy="92" r="3.4"/></g>
  <g fill="var(--dg-line-soft)"><circle cx="330" cy="124" r="3.4"/><circle cx="420" cy="128" r="3.4"/><circle cx="160" cy="130" r="3.4"/></g>
  <line x1="40" y1="126" x2="700" y2="126" stroke="var(--dg-e)" stroke-width="1.2" stroke-dasharray="6 4"/>
  <line x1="330" y1="124" x2="270" y2="102" stroke="var(--dg-line)" stroke-width="1.2" marker-end="url(#lt-arw)"/>
  <line x1="420" y1="128" x2="456" y2="96" stroke="var(--dg-line)" stroke-width="1.2" marker-end="url(#lt-arw)"/>
  <text x="228" y="34" font-size="10.5" fill="var(--dg-a)">seed tree 1</text>
  <text x="488" y="58" font-size="10.5" fill="var(--dg-c)">seed tree 2</text>
  <text x="696" y="120" text-anchor="end" font-size="10.5" fill="var(--dg-e)">current height</text>
  <text x="40" y="188" font-size="10.5" fill="var(--dg-muted)">grey points below the sweep line are still unassigned</text>
</svg>

## Prerequisites and Assumptions

- PDAL 2.3+ with `filters.litree` (check with `pdal --options filters.litree`) and the Python bindings.
- Ground classified to class 2 for height normalization.
- Density of at least 10 pts/m²; the method relies on vertical structure inside crowns.
- Tiles of a few hectares to 1 km². The algorithm's cost grows faster than linearly with points per tree, so very dense tiles benefit from thinning.

## Step-by-Step Implementation

### Step 1 — Normalize heights and keep vegetation

Compute `HeightAboveGround`, drop ground and noise, and keep points above 2 m so grass and shrubs do not seed trees.

### Step 2 — Put height above ground into Z

The region growing uses `Z` for ordering and spacing. On sloping terrain, raw elevation would put the uphill side of a crown "above" the downhill tree next to it. Ferrying `HeightAboveGround` into `Z` removes the slope; keep a copy of the original if you need it later.

```json
{ "type": "filters.ferry", "dimensions": "Z=>Elevation, HeightAboveGround=>Z" }
```

### Step 3 — Run filters.litree

Set `min_height` to the lowest tree top you want, `min_points` to the smallest tree worth keeping, and `radius` to bound the search for competing trees.

### Step 4 — Summarise per TreeID

Group points by `TreeID` in pandas: count, maximum height, plan extent and centroid of the highest points.

### Step 5 — Compare with the CHM result

Match tops from both methods within 2 m. Trees found only by `filters.litree` are candidates for understorey; inspect a few to confirm they are real.

## Complete Working Example

```python
"""Point-based tree segmentation with filters.litree and a per-tree summary."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import pdal


def litree(src: Path, dst: Path, min_height: float = 3.0, min_points: int = 50,
           radius: float = 60.0) -> np.ndarray:
    stages = [
        {"type": "readers.las", "filename": str(src)},
        {"type": "filters.range", "limits": "Classification![7:7],Classification![18:18]"},
        {"type": "filters.hag_nn", "count": 2},
        {"type": "filters.range",
         "limits": "Classification![2:2],HeightAboveGround[2:70]"},
        {"type": "filters.ferry", "dimensions": "Z=>Elevation, HeightAboveGround=>Z"},
        {"type": "filters.litree", "min_points": min_points, "min_height": min_height,
         "radius": radius},
        {"type": "writers.las", "filename": str(dst), "minor_version": 4,
         "dataformat_id": 6, "extra_dims": "TreeID=uint32,Elevation=double"},
    ]
    p = pdal.Pipeline(json.dumps({"pipeline": stages}))
    n = p.execute()
    print(f"{n} vegetation points processed")
    return p.arrays[0]


def tree_table(points: np.ndarray) -> pd.DataFrame:
    df = pd.DataFrame({"x": points["X"], "y": points["Y"], "h": points["Z"],
                       "tree": points["TreeID"]})
    df = df[df.tree > 0]
    top = df.loc[df.groupby("tree").h.idxmax(), ["tree", "x", "y", "h"]].set_index("tree")
    stats = df.groupby("tree").agg(points=("h", "size"),
                                   h95=("h", lambda s: float(np.percentile(s, 95))),
                                   x_span=("x", np.ptp), y_span=("y", np.ptp))
    out = top.join(stats).rename(columns={"h": "height_m"})
    out["crown_diam_m"] = (out.x_span + out.y_span) / 2
    return out.drop(columns=["x_span", "y_span"]).round(2)


if __name__ == "__main__":
    pts = litree(Path("stand_12.laz"), Path("out/stand_12/litree.laz"))
    trees = tree_table(pts)
    print(f"{len(trees)} trees; median height {trees.height_m.median():.1f} m")
    print(trees.sort_values("height_m", ascending=False).head(10))
```

The label value 0 marks points not assigned to any tree — usually low vegetation or isolated returns below `min_height` that never reached a seeded tree.

## Key Parameter Table

| Option | Type | Default | Guidance |
|---|---|---|---|
| `min_points` | int | 10 | Minimum points for a tree; 30–80 at 20 pts/m² removes branch fragments |
| `min_height` | float, m | 3.0 | Lowest tree top considered; matches the inventory's height threshold |
| `radius` | float, m | 100.0 | Search radius for competing trees; 40–60 m is ample and faster |
| lower height cut | float, m | 2.0 | Points below never join trees; prevents shrubs seeding |
| input thinning | voxel, m | none | 0.2–0.3 m voxels speed dense tiles with little effect on results |

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Detection counts from CHM watershed and litree split by canopy layer" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Where each method finds its trees</title>
  <desc>Grouped bars comparing trees detected by a CHM watershed and by filters.litree on a plot with 140 field-measured trees. For dominant trees both find about 70. For intermediate trees the watershed finds 28 and litree 34. For suppressed understorey trees the watershed finds 4 and litree 17. A note says litree's advantage is almost entirely below the main canopy.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="170" x2="680" y2="170" stroke="var(--dg-line)" stroke-width="1.3"/>
  <rect x="130" y="30" width="50" height="140" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.1"/>
  <rect x="186" y="28" width="50" height="142" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.1"/>
  <rect x="330" y="114" width="50" height="56" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.1"/>
  <rect x="386" y="102" width="50" height="68" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.1"/>
  <rect x="530" y="162" width="50" height="8" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.1"/>
  <rect x="586" y="136" width="50" height="34" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.1"/>
  <text x="183" y="188" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">dominant</text>
  <text x="383" y="188" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">intermediate</text>
  <text x="583" y="188" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">understorey</text>
  <rect x="470" y="30" width="14" height="12" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.1"/><text x="490" y="40" font-size="10.5" fill="var(--dg-muted)">CHM watershed</text>
  <rect x="470" y="52" width="14" height="12" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.1"/><text x="490" y="62" font-size="10.5" fill="var(--dg-muted)">filters.litree</text>
  <text x="80" y="204" font-size="10" fill="var(--dg-muted)">illustrative plot of 140 trees — the difference sits almost entirely below the main canopy</text>
</svg>

## Verification

- **Seed count sanity.** The number of trees should be in the range of stand records. Many more usually means `min_points` is too low and branch clusters are becoming trees.
- **Height agreement.** For trees found by both methods, heights should agree within about half a metre; the point method is often slightly higher because it reads the actual top return.
- **Visual check by TreeID.** Colour points by `TreeID` in a viewer with a random palette. Crowns should be contiguous blobs; a tree whose points appear in two separate places indicates a spacing problem.

```python
labelled = int((pts["TreeID"] > 0).sum())
share = labelled / len(pts)
assert 0.5 < share <= 1.0, f"only {share:.0%} of vegetation points assigned to trees"
```

## Gotchas and Edge Cases

**Slope without normalization.** Skipping the ferry step makes uphill crowns dominate their downhill neighbours on any real slope. It is the most common cause of implausibly large trees on hillsides.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Two equal trees on a slope in raw elevation and in height above ground" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Slope turns equal trees into giants and dwarfs</title>
  <desc>Left: two 18 metre trees on a 20 degree slope drawn in raw elevation; the uphill tree's top is 14 metres higher than the downhill tree's, so region growing treats the downhill crown as lower branches of the uphill tree. Right: the same trees after height normalization stand on a flat baseline with equal tops, and are segmented as two trees.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <text x="185" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">raw Z: merged into one</text>
  <text x="555" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">height above ground: two</text>
  <line x1="30" y1="120" x2="340" y2="190" stroke="var(--dg-line)" stroke-width="1.4"/>
  <line x1="110" y1="138" x2="110" y2="84" stroke="var(--dg-line)" stroke-width="2"/>
  <ellipse cx="110" cy="70" rx="34" ry="26" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <line x1="260" y1="172" x2="260" y2="118" stroke="var(--dg-line)" stroke-width="2"/>
  <ellipse cx="260" cy="104" rx="34" ry="26" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <line x1="400" y1="176" x2="710" y2="176" stroke="var(--dg-line)" stroke-width="1.4"/>
  <line x1="480" y1="176" x2="480" y2="122" stroke="var(--dg-line)" stroke-width="2"/>
  <ellipse cx="480" cy="108" rx="34" ry="26" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <line x1="630" y1="176" x2="630" y2="122" stroke="var(--dg-line)" stroke-width="2"/>
  <ellipse cx="630" cy="108" rx="34" ry="26" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
</svg>

**Very dense data is slow.** Run time grows quickly with points per crown. Thinning with `filters.voxelcenternearestneighbor` at 0.25 m before segmentation typically cuts time several-fold; then transfer labels back to full-density points with a nearest-neighbour join if you need every point labelled.

**Leaning and multi-stemmed trees.** Top-down growth assumes each tree has one highest point above its crown. Leaning trees whose top overhangs a neighbour, and coppiced trees with several leaders, get split or merged. No setting fixes that; report it as a known limitation for those stand types.

**Tile edges.** Like every tree method, crowns cut by the tile edge are wrong. Use a buffer and keep trees whose top lies inside the nominal tile.

## Frequently Asked Questions

**Is filters.litree better than a CHM watershed?**

It finds more trees below the main canopy and gives per-point labels, at the cost of much longer run times and fewer tuning options. For dominant trees in open stands both methods perform similarly; for multi-layered forests the point method has a real advantage.

**Why must height above ground replace Z before filters.litree?**

The algorithm orders and compares points by Z. On a slope, raw elevation mixes terrain height into that comparison, so trees uphill appear taller than their neighbours downhill. Normalized heights compare trees as they actually stand.

**How do I speed up filters.litree on dense data?**

Restrict input to vegetation above 2 m, reduce radius to 40 to 60 metres, and voxel-thin to about 0.25 metres. Labels can be transferred back to the full-density cloud afterwards.

**What does TreeID 0 mean?**

The point was not assigned to any tree, usually because it lies below min_height and never connected to a seeded tree, or belongs to a group smaller than min_points.

## Related

- [Individual Tree Segmentation from LiDAR](https://www.pythonlidar.com/lidar-classification-feature-extraction/individual-tree-segmentation/) — the overall workflow and evaluation
- [Segmenting Trees with a Watershed on a CHM](https://www.pythonlidar.com/lidar-classification-feature-extraction/individual-tree-segmentation/segmenting-trees-with-a-watershed-on-a-chm/) — the raster alternative
- [Computing Crown Metrics per Tree](https://www.pythonlidar.com/lidar-classification-feature-extraction/individual-tree-segmentation/computing-crown-metrics-per-tree/) — per-tree metrics from TreeID
- [Copying Dimensions with filters.ferry](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/copying-dimensions-with-filters-ferry/) — the Z swap used here
- [Computing Height Above Ground with filters.hag_nn](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/computing-height-above-ground-with-filters-hag-nn/) — the normalization step
