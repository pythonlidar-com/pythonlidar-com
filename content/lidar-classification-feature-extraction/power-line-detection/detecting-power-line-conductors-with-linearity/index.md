---
title: "Detecting Power Line Conductors with Linearity"
description: "Tune the linearity test that finds conductor points: neighbourhood size along a sparse wire, a verticality cap for poles and trunks, and a height band — with a sweep that measures recall on labelled spans."
slug: "detecting-power-line-conductors-with-linearity"
type: "howto"
breadcrumb: "Conductors with Linearity"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Detecting Power Line Conductors with Linearity",
      "description": "Tune the linearity test that finds conductor points: neighbourhood size along a sparse wire, a verticality cap for poles and trunks, and a height band \u2014 with a sweep that measures recall on labelled spans.",
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
          "name": "Power Line Detection",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/power-line-detection/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Conductors with Linearity",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/power-line-detection/detecting-power-line-conductors-with-linearity/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Detect conductor points using PDAL linearity features",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Band by height above ground",
          "text": "Everything below about 5 m and above the highest structure is irrelevant and expensive."
        },
        {
          "@type": "HowToStep",
          "name": "Label your sample spans",
          "text": "Burn the buffered conductor polygons into a Truth dimension with filters.overlay so each banded point knows whether it is a known wire point."
        },
        {
          "@type": "HowToStep",
          "name": "Compute features over a range of k",
          "text": "Run filters.covariancefeatures with feature_set: \"Dimensionality\" at several knn values on the same banded points."
        },
        {
          "@type": "HowToStep",
          "name": "Measure recall and precision for each setting",
          "text": "For each combination of knn, linearity threshold and verticality cap, count labelled wire points that pass (recall) and the share of passing points inside the labelled corridor that are wire (precision within the sample area)."
        },
        {
          "@type": "HowToStep",
          "name": "Pick the setting on the plateau",
          "text": "Choose the smallest knn whose recall is within a point or two of the best, because larger neighbourhoods cost time and blur parallel conductors."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why is linearity better than height for finding wires?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Height separates wires from the ground but not from tall trees, which occupy the same band. Linearity measures shape, and conductors are the only common object that is one-dimensional at the scale of a metre, so it isolates them even above dense canopy."
          }
        },
        {
          "@type": "Question",
          "name": "What linearity threshold should I use?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Around 0.85 on dense corridor data, lowered toward 0.75 on sparse data. Confirm it by measuring recall on a few labelled spans; the right value is the one that keeps recall above about 0.9 without flooding the next step with canopy points."
          }
        },
        {
          "@type": "Question",
          "name": "Do I need to remove poles before span grouping?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The verticality cap removes most pole and trunk points at the candidate stage. Any that remain form short vertical groups that the span length and elongation tests reject."
          }
        },
        {
          "@type": "Question",
          "name": "Can I use this on mobile or terrestrial scans?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes, with larger knn because density is far higher, and with care near the scanner where wires are seen from below at steep angles. The height band may also need adjusting for lines along streets."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Restrict to points 5–80 m above ground, compute `filters.covariancefeatures` with a `knn` large enough to reach several wire returns (15–25), keep points with `Linearity >= 0.85` and `Verticality <= 0.2`, and validate the choice by measuring recall on a few hand-labelled spans rather than by eye.

## Context and Motivation

This guide is part of [Power Line Detection in LiDAR Point Clouds](https://www.pythonlidar.com/lidar-classification-feature-extraction/power-line-detection/). The candidate test is the step that decides everything downstream: a conductor point it misses is never recovered by span grouping, and a canopy point it admits has to be removed later by shape tests. Linearity — the share of a neighbourhood's spread that lies along one direction — is the natural signal, because a wire is the only common object that is one-dimensional at the scale of a metre.

The complication is that wires are sparse. Along a conductor the returns may be half a metre to two metres apart, while the canopy beneath is dense. A neighbourhood defined by the k nearest points reaches along the wire only if k is large enough, and if the wire passes close to a crown, some of those k neighbours will be leaves.

<svg viewBox="0 50 740 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A kNN neighbourhood on a wire point for small and large k" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>How far k reaches along a wire</title>
  <desc>A row of evenly spaced wire returns about a metre apart. Around one of them, a small ellipse shows k equal to 4 reaching only the two nearest returns on each side, too few for a stable direction. A larger ellipse shows k equal to 20 reaching ten returns along the wire, giving a clean linear neighbourhood with linearity near 0.95.</desc>
  <rect x="0" y="50" width="740" height="150" fill="var(--dg-bg)" rx="10"/>
  <line x1="30" y1="100" x2="710" y2="100" stroke="var(--dg-line-soft)" stroke-width="1" stroke-dasharray="3 4"/>
  <g fill="var(--dg-c)"><circle cx="50" cy="100" r="3.5"/><circle cx="110" cy="99" r="3.5"/><circle cx="170" cy="100" r="3.5"/><circle cx="230" cy="101" r="3.5"/><circle cx="290" cy="100" r="3.5"/><circle cx="350" cy="100" r="3.5"/><circle cx="410" cy="99" r="3.5"/><circle cx="470" cy="100" r="3.5"/><circle cx="530" cy="101" r="3.5"/><circle cx="590" cy="100" r="3.5"/><circle cx="650" cy="100" r="3.5"/></g>
  <ellipse cx="350" cy="100" rx="130" ry="16" fill="none" stroke="var(--dg-a)" stroke-width="1.6"/>
  <ellipse cx="350" cy="100" rx="310" ry="30" fill="none" stroke="var(--dg-d)" stroke-width="1.6" stroke-dasharray="6 4"/>
  <text x="350" y="76" text-anchor="middle" font-size="10.5" fill="var(--dg-a)">k = 4: two returns each side, direction unstable</text>
  <text x="350" y="152" text-anchor="middle" font-size="10.5" fill="var(--dg-d)">k = 20: reaches along the wire, Linearity ≈ 0.95</text>
  <text x="30" y="186" font-size="10.5" fill="var(--dg-muted)">return spacing along a conductor is often wider than point spacing on the ground</text>
</svg>

## Prerequisites and Assumptions

- Corridor data at 20 pts/m² or denser, ground classified, noise removed or classified 7/18.
- PDAL 2.4+ and Python bindings; NumPy and GeoPandas.
- A few labelled spans: digitize line strings along three to five conductors in a GIS and buffer them by 0.3 m. Those polygons are your ground truth.

## Step-by-Step Implementation

### Step 1 — Band by height above ground

Everything below about 5 m and above the highest structure is irrelevant and expensive.

```json
[
  { "type": "filters.hag_nn", "count": 1 },
  { "type": "filters.range", "limits": "HeightAboveGround[5:80]" }
]
```

### Step 2 — Label your sample spans

Burn the buffered conductor polygons into a `Truth` dimension with `filters.overlay` so each banded point knows whether it is a known wire point.

### Step 3 — Compute features over a range of k

Run `filters.covariancefeatures` with `feature_set: "Dimensionality"` at several `knn` values on the same banded points.

### Step 4 — Measure recall and precision for each setting

For each combination of `knn`, linearity threshold and verticality cap, count labelled wire points that pass (recall) and the share of passing points inside the labelled corridor that are wire (precision within the sample area).

### Step 5 — Pick the setting on the plateau

Choose the smallest `knn` whose recall is within a point or two of the best, because larger neighbourhoods cost time and blur parallel conductors.

## Complete Working Example

```python
"""Sweep knn and thresholds for conductor detection against labelled spans."""
from __future__ import annotations

import itertools
import json
from pathlib import Path

import numpy as np
import pdal


def banded_with_truth(tile: Path, truth_gpkg: Path) -> np.ndarray:
    p = pdal.Pipeline(json.dumps({"pipeline": [
        {"type": "readers.las", "filename": str(tile)},
        {"type": "filters.range", "limits": "Classification![7:7],Classification![18:18]"},
        {"type": "filters.hag_nn", "count": 1},
        {"type": "filters.range", "limits": "HeightAboveGround[5:80]"},
        {"type": "filters.ferry", "dimensions": "=>Truth"},
        {"type": "filters.overlay", "dimension": "Truth", "datasource": str(truth_gpkg),
         "layer": "wires", "column": "is_wire"},
    ]}))
    p.execute()
    return p.arrays[0]


def features(points: np.ndarray, knn: int) -> np.ndarray:
    p = pdal.Pipeline(json.dumps({"pipeline": [
        {"type": "filters.covariancefeatures", "knn": knn, "threads": 4,
         "feature_set": "Dimensionality"}]}), arrays=[points])
    p.execute()
    return p.arrays[0]


def score(a: np.ndarray, lin: float, vert: float) -> tuple[float, int]:
    passed = (a["Linearity"] >= lin) & (a["Verticality"] <= vert)
    truth = a["Truth"] == 1
    recall = float((passed & truth).sum() / max(truth.sum(), 1))
    false_pos = int((passed & ~truth).sum())
    return recall, false_pos


if __name__ == "__main__":
    base = banded_with_truth(Path("corridor_0082.laz"), Path("wires_truth.gpkg"))
    print(f"{int((base['Truth'] == 1).sum())} labelled wire points in the band")
    for knn in (8, 12, 16, 20, 28):
        a = features(base, knn)
        for lin, vert in itertools.product((0.75, 0.85, 0.9), (0.2, 0.3)):
            r, fp = score(a, lin, vert)
            print(f"knn={knn:>2} lin>={lin:.2f} vert<={vert:.1f}  "
                  f"recall={r:.3f}  non-wire passing={fp}")
```

The false-positive count is taken over the whole band, not only near labelled wires, so it tells you how much clutter the span tests downstream will have to reject.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Recall and false positives against knn for the conductor test" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Recall plateaus; clutter keeps falling</title>
  <desc>Two lines against knn from 8 to 28. Recall of labelled wire points rises from 0.71 at knn 8 to 0.93 at knn 16 and stays near 0.94 at 20 and 28. Non-wire points passing the test fall from about 9,000 at knn 8 to 2,100 at knn 20, then rise slightly at 28 as neighbourhoods start to include both wire and canopy. The chosen setting at knn 20 is highlighted.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="180" x2="660" y2="180" stroke="var(--dg-line)" stroke-width="1.3"/>
  <polyline points="100,104 230,62 360,40 490,38 620,37" fill="none" stroke="var(--dg-a)" stroke-width="2"/>
  <polyline points="100,60 230,118 360,146 490,160 620,154" fill="none" stroke="var(--dg-e)" stroke-width="2" stroke-dasharray="6 3"/>
  <circle cx="490" cy="38" r="5" fill="var(--dg-a)"/>
  <circle cx="490" cy="160" r="5" fill="var(--dg-e)"/>
  <rect x="468" y="22" width="44" height="160" fill="none" stroke="var(--dg-d)" stroke-width="1.3" stroke-dasharray="3 3"/>
  <text x="100" y="198" text-anchor="middle" font-size="10" fill="var(--dg-muted)">8</text>
  <text x="230" y="198" text-anchor="middle" font-size="10" fill="var(--dg-muted)">12</text>
  <text x="360" y="198" text-anchor="middle" font-size="10" fill="var(--dg-muted)">16</text>
  <text x="490" y="198" text-anchor="middle" font-size="10" fill="var(--dg-muted)">20</text>
  <text x="620" y="198" text-anchor="middle" font-size="10" fill="var(--dg-muted)">28</text>
  <text x="370" y="214" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">knn</text>
  <text x="240" y="54" font-size="10.5" fill="var(--dg-a)">recall</text>
  <text x="240" y="138" font-size="10.5" fill="var(--dg-e)">non-wire passing</text>
  <text x="520" y="100" font-size="10.5" fill="var(--dg-d)">chosen</text>
</svg>

## Key Parameter Table

| Parameter | Type | Default | Guidance |
|---|---|---|---|
| height band | m | 5–80 | Lower bound 4 m for distribution lines; upper above the tallest tower |
| `knn` | int | 20 | About 4–6 returns along the wire each side; larger on sparse wires |
| `Linearity` threshold | float | 0.85 | 0.75 for sparse data or low-contrast wires |
| `Verticality` cap | float | 0.2 | Raise to 0.3 near attachment points if spans break there |
| `threads` | int | 4 | Speeds the covariance stage roughly linearly up to 4–8 |
| `radius` alternative | float, m | unset | 1.5–2.5 m keeps scale fixed where wire density varies |

## Verification

- **Recall above 0.9 on labelled spans** is realistic on dense corridor data. Lower recall concentrated near towers is expected and is handled by span merging.
- **Visual inspection by linearity.** Colour the banded points by `Linearity`; conductors should appear as continuous bright lines, canopy as a dark mottle, crown edges as occasional bright specks.
- **Stable across tiles.** Run the chosen setting on two tiles not used for tuning and check that the passing count per kilometre of corridor is similar.

## Gotchas and Edge Cases

**Crown edges look linear.** The outer edge of a narrow crown, sampled by a single scan line, can be highly linear over a metre. It fails the span tests later — short, not elongated — so do not raise the linearity threshold to kill it here at the cost of wire recall.

**Wires close to canopy lose linearity.** Where a conductor passes within a metre of a crown, some neighbours are leaves, and linearity drops. These are exactly the spans where clearance matters most, so check recall in the labelled spans that pass close to vegetation specifically.

<svg viewBox="0 0 740 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Linearity dropping where a conductor passes close to a tree crown" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Where the canopy touches the neighbourhood</title>
  <desc>A conductor drawn as a row of points crosses above a tree crown. Points far from the crown are drawn dark, meaning high linearity around 0.95. Directly above the crown, where neighbourhoods include leaves, points are drawn lighter with linearity around 0.6, below the threshold. A bracket marks this weakened stretch.</desc>
  <rect x="0" y="0" width="740" height="190" fill="var(--dg-bg)" rx="10"/>
  <ellipse cx="370" cy="130" rx="110" ry="46" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <g fill="var(--dg-c)"><circle cx="60" cy="70" r="3.5"/><circle cx="110" cy="72" r="3.5"/><circle cx="160" cy="74" r="3.5"/><circle cx="210" cy="76" r="3.5"/><circle cx="530" cy="76" r="3.5"/><circle cx="580" cy="74" r="3.5"/><circle cx="630" cy="72" r="3.5"/><circle cx="680" cy="70" r="3.5"/></g>
  <g fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1"><circle cx="270" cy="78" r="3.5"/><circle cx="320" cy="79" r="3.5"/><circle cx="370" cy="80" r="3.5"/><circle cx="420" cy="79" r="3.5"/><circle cx="470" cy="78" r="3.5"/></g>
  <path d="M262 56 L262 48 L478 48 L478 56" fill="none" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="370" y="40" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">Linearity ≈ 0.6 — leaves in the neighbourhood</text>
  <text x="60" y="100" font-size="10.5" fill="var(--dg-text)">≈ 0.95</text>
  <text x="640" y="100" font-size="10.5" fill="var(--dg-text)">≈ 0.95</text>
</svg>

**Parallel conductors merge.** Two phases 0.8 m apart share neighbourhoods; linearity stays high because they are parallel, so detection is fine, but per-phase analysis needs re-segmentation later.

**Density stripes from overlap.** Where two flightlines overlap, wire returns double and a fixed `knn` covers half the length. The `radius` option avoids this; so does running each flightline separately using `PointSourceId` in a `where` clause.

## Frequently Asked Questions

**Why is linearity better than height for finding wires?**

Height separates wires from the ground but not from tall trees, which occupy the same band. Linearity measures shape, and conductors are the only common object that is one-dimensional at the scale of a metre, so it isolates them even above dense canopy.

**What linearity threshold should I use?**

Around 0.85 on dense corridor data, lowered toward 0.75 on sparse data. Confirm it by measuring recall on a few labelled spans; the right value is the one that keeps recall above about 0.9 without flooding the next step with canopy points.

**Do I need to remove poles before span grouping?**

The verticality cap removes most pole and trunk points at the candidate stage. Any that remain form short vertical groups that the span length and elongation tests reject.

**Can I use this on mobile or terrestrial scans?**

Yes, with larger knn because density is far higher, and with care near the scanner where wires are seen from below at steep angles. The height band may also need adjusting for lines along streets.

## Related

- [Power Line Detection in LiDAR Point Clouds](https://www.pythonlidar.com/lidar-classification-feature-extraction/power-line-detection/) — the full detection workflow
- [Fitting Catenary Curves to Conductor Points](https://www.pythonlidar.com/lidar-classification-feature-extraction/power-line-detection/fitting-catenary-curves-to-conductor-points/) — what happens to the detected spans
- [Measuring Vegetation Clearance to Power Lines](https://www.pythonlidar.com/lidar-classification-feature-extraction/power-line-detection/measuring-vegetation-clearance-to-power-lines/) — the clearance deliverable
- [Detecting Planar Roofs with Covariance Features](https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/detecting-planar-roofs-with-covariance-features/) — the same threshold-sweep method for planarity
- [Computing Height Above Ground with filters.hag_nn](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/computing-height-above-ground-with-filters-hag-nn/) — the height band's foundation
