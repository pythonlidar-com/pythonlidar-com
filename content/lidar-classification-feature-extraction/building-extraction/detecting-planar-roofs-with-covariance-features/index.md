---
title: "Detecting Planar Roofs with Covariance Features"
description: "Use filters.covariancefeatures to separate roofs from tree crowns: what planarity and scattering measure, how to pick knn from point density, and how to set thresholds from labelled histograms instead of guessing."
slug: "detecting-planar-roofs-with-covariance-features"
type: "howto"
breadcrumb: "Planar Roofs with Covariance Features"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Detecting Planar Roofs with Covariance Features",
      "description": "Use filters.covariancefeatures to separate roofs from tree crowns: what planarity and scattering measure, how to pick knn from point density, and how to set thresholds from labelled histograms instead of guessing.",
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
          "name": "Building Extraction",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Planar Roofs with Covariance Features",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/detecting-planar-roofs-with-covariance-features/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Detect planar roof points with PDAL covariance features",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Estimate the right neighbourhood size",
          "text": "The neighbourhood should cover about one metre of roof: large enough that three or four returns are not accidentally coplanar, small enough that it rarely straddles a ridge or a roof edge. At density \u03c1 points per m\u00b2, a one-metre-radius disc holds about \u03c0\u03c1 points, so start with knn \u2248 3\u03c1 and round."
        },
        {
          "@type": "HowToStep",
          "name": "Compute features on elevated points only",
          "text": "Restrict the stage with a where clause so ground and low objects do not consume time."
        },
        {
          "@type": "HowToStep",
          "name": "Sample features inside labelled polygons",
          "text": "Burn the labelled roof and crown polygons into a Label dimension with filters.overlay, then read Planarity and Scattering for each group."
        },
        {
          "@type": "HowToStep",
          "name": "Choose thresholds from the histograms",
          "text": "Plot the two distributions for each feature and set the threshold where they cross. Planarity usually separates cleanly at 0.6 to 0.75; scattering at 0.08 to 0.12."
        },
        {
          "@type": "HowToStep",
          "name": "Apply thresholds per segment, not per point",
          "text": "Segment elevated points with filters.cluster and test each segment's median planarity and scattering. Medians absorb the noisy edge points that would otherwise speckle the classification."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the difference between planarity and filters.approximatecoplanar?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Planarity is a continuous value from 0 to 1 that you threshold yourself. filters.approximatecoplanar applies fixed eigenvalue-ratio tests and writes a boolean Coplanar flag. The continuous value is more useful because you can aggregate it per segment and tune the threshold to your data."
          }
        },
        {
          "@type": "Question",
          "name": "Why do my roof points have low planarity?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Most often knn is too small for the density, so each neighbourhood holds only a few points that happen to be noisy, or so large that it crosses roof edges. Run the knn sweep on labelled samples and pick the value with the best separation."
          }
        },
        {
          "@type": "Question",
          "name": "Should I use knn or radius neighbourhoods?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "kNN adapts to density, which is good when density is uniform. A radius keeps the physical scale constant, which is better when overlap or scan pattern makes density vary strongly across the tile."
          }
        },
        {
          "@type": "Question",
          "name": "Are the thresholds transferable between projects?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Approximately, when density and knn are similar, but not exactly. Re-derive them from a few labelled samples on each project; it takes minutes."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Run `filters.covariancefeatures` with `feature_set: "Dimensionality"` and a `knn` that spans about a metre at your density (roughly 16 at 15 pts/m²), then pick planarity and scattering thresholds from histograms of a few hand-labelled roofs and crowns — typically planarity above 0.7 and scattering below 0.1, applied per segment rather than per point.

## Context and Motivation

This guide is part of [Building Extraction from LiDAR](https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/). Height above ground puts roofs and tree crowns in the same band; what separates them is shape. A roof is a surface — its points spread in two directions and hardly at all in the third. A crown is a volume — points spread in all three directions. PDAL's `filters.covariancefeatures` measures exactly that, from the eigenvalues of the 3×3 covariance matrix of each point's k nearest neighbours.

With eigenvalues sorted so that λ1 ≥ λ2 ≥ λ3, the dimensionality features are ratios:

- **Linearity** = (λ1 − λ2) / λ1 — high for wires and edges.
- **Planarity** = (λ2 − λ3) / λ1 — high for roofs, walls and roads.
- **Scattering** = λ3 / λ1 — high for vegetation and noise.

They sum to one, which is useful: a point cannot be both strongly planar and strongly scattered. The difficulty is not the maths but the parameters, because the same roof looks planar at one neighbourhood size and noisy at another.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The three dimensionality features as shares of one bar for a roof, a crown and a wire" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Three features that always sum to one</title>
  <desc>Three stacked horizontal bars, each divided into linearity, planarity and scattering shares. A roof point is mostly planarity at 0.86, with linearity 0.10 and scattering 0.04. A crown point is mostly scattering at 0.52, with planarity 0.30 and linearity 0.18. A wire point is mostly linearity at 0.91.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <text x="110" y="62" text-anchor="end" font-size="11.5" fill="var(--dg-text)">roof</text>
  <rect x="120" y="46" width="55" height="24" fill="var(--dg-c)"/><rect x="175" y="46" width="473" height="24" fill="var(--dg-a)"/><rect x="648" y="46" width="22" height="24" fill="var(--dg-d)"/>
  <text x="110" y="112" text-anchor="end" font-size="11.5" fill="var(--dg-text)">crown</text>
  <rect x="120" y="96" width="99" height="24" fill="var(--dg-c)"/><rect x="219" y="96" width="165" height="24" fill="var(--dg-a)"/><rect x="384" y="96" width="286" height="24" fill="var(--dg-d)"/>
  <text x="110" y="162" text-anchor="end" font-size="11.5" fill="var(--dg-text)">wire</text>
  <rect x="120" y="146" width="500" height="24" fill="var(--dg-c)"/><rect x="620" y="146" width="33" height="24" fill="var(--dg-a)"/><rect x="653" y="146" width="17" height="24" fill="var(--dg-d)"/>
  <rect x="120" y="190" width="14" height="12" fill="var(--dg-c)"/><text x="140" y="200" font-size="10.5" fill="var(--dg-muted)">Linearity</text>
  <rect x="240" y="190" width="14" height="12" fill="var(--dg-a)"/><text x="260" y="200" font-size="10.5" fill="var(--dg-muted)">Planarity</text>
  <rect x="360" y="190" width="14" height="12" fill="var(--dg-d)"/><text x="380" y="200" font-size="10.5" fill="var(--dg-muted)">Scattering</text>
  <text x="120" y="30" font-size="10.5" fill="var(--dg-muted)">illustrative values at knn = 16, about 15 pts/m²</text>
</svg>

## Prerequisites and Assumptions

- PDAL 2.4 or newer; confirm the options with `pdal --options filters.covariancefeatures`.
- Ground classified, and `HeightAboveGround` available or computable with `filters.hag_nn`.
- A handful of hand-labelled examples: ten roofs and ten crowns digitized as polygons are enough to set thresholds.
- Python with NumPy and GeoPandas for the histogram step.

## Step-by-Step Implementation

### Step 1 — Estimate the right neighbourhood size

The neighbourhood should cover about one metre of roof: large enough that three or four returns are not accidentally coplanar, small enough that it rarely straddles a ridge or a roof edge. At density ρ points per m², a one-metre-radius disc holds about πρ points, so start with `knn` ≈ 3ρ and round.

| Density (pts/m²) | Suggested `knn` | Neighbourhood radius |
|---|---|---|
| 4 | 12 | ~1.0 m |
| 8 | 16 | ~0.8 m |
| 15 | 20 | ~0.65 m |
| 30 | 32 | ~0.6 m |

### Step 2 — Compute features on elevated points only

Restrict the stage with a `where` clause so ground and low objects do not consume time.

```json
{
  "type": "filters.covariancefeatures",
  "knn": 20,
  "threads": 4,
  "feature_set": "Dimensionality",
  "where": "HeightAboveGround > 2.5 && Classification != 2"
}
```

### Step 3 — Sample features inside labelled polygons

Burn the labelled roof and crown polygons into a `Label` dimension with `filters.overlay`, then read `Planarity` and `Scattering` for each group.

### Step 4 — Choose thresholds from the histograms

Plot the two distributions for each feature and set the threshold where they cross. Planarity usually separates cleanly at 0.6 to 0.75; scattering at 0.08 to 0.12.

### Step 5 — Apply thresholds per segment, not per point

Segment elevated points with `filters.cluster` and test each segment's median planarity and scattering. Medians absorb the noisy edge points that would otherwise speckle the classification.

## Complete Working Example

```python
"""Pick roof/crown thresholds for covariance features from labelled polygons."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pdal


def labelled_features(tile: Path, labels_gpkg: Path, knn: int) -> np.ndarray:
    stages = [
        {"type": "readers.las", "filename": str(tile)},
        {"type": "filters.hag_nn", "count": 2},
        {"type": "filters.range", "limits": "HeightAboveGround[2.5:80]"},
        {"type": "filters.ferry", "dimensions": "=>Label"},
        {"type": "filters.overlay", "dimension": "Label", "datasource": str(labels_gpkg),
         "layer": "samples", "column": "label"},          # 1 = roof, 2 = crown
        {"type": "filters.range", "limits": "Label[1:2]"},
        {"type": "filters.covariancefeatures", "knn": knn, "threads": 4,
         "feature_set": "Dimensionality"},
    ]
    p = pdal.Pipeline(json.dumps({"pipeline": stages}))
    p.execute()
    return p.arrays[0]


def best_threshold(roof: np.ndarray, crown: np.ndarray, roof_high: bool) -> tuple[float, float]:
    """Threshold maximizing balanced accuracy between the two samples."""
    grid = np.linspace(0.0, 1.0, 201)
    best = (0.0, 0.0)
    for t in grid:
        tpr = (roof > t).mean() if roof_high else (roof < t).mean()
        tnr = (crown <= t).mean() if roof_high else (crown >= t).mean()
        score = 0.5 * (tpr + tnr)
        if score > best[1]:
            best = (float(t), float(score))
    return best


if __name__ == "__main__":
    for knn in (12, 16, 20, 28):
        a = labelled_features(Path("tile_5840_2710.laz"), Path("samples.gpkg"), knn)
        roof, crown = a[a["Label"] == 1], a[a["Label"] == 2]
        tp, sp = best_threshold(roof["Planarity"], crown["Planarity"], roof_high=True)
        ts, ss = best_threshold(roof["Scattering"], crown["Scattering"], roof_high=False)
        print(f"knn={knn:>2}  planarity>{tp:.2f} (bal.acc {sp:.3f})  "
              f"scattering<{ts:.2f} (bal.acc {ss:.3f})")
```

Typical output shows the separation improving up to a point and then degrading as neighbourhoods start to cross roof edges:

```text
knn=12  planarity>0.58 (bal.acc 0.884)  scattering<0.14 (bal.acc 0.902)
knn=16  planarity>0.66 (bal.acc 0.917)  scattering<0.11 (bal.acc 0.931)
knn=20  planarity>0.70 (bal.acc 0.926)  scattering<0.10 (bal.acc 0.938)
knn=28  planarity>0.71 (bal.acc 0.912)  scattering<0.09 (bal.acc 0.927)
```

<svg viewBox="0 0 740 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Overlapping planarity histograms for roof and crown samples with the chosen threshold" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Reading the threshold off the histograms</title>
  <desc>Two overlapping histograms of planarity. Crown points peak around 0.3 and tail off by 0.7. Roof points peak around 0.85 and tail down to about 0.5. A vertical dashed line at 0.70 marks the threshold where the two distributions cross, which maximizes balanced accuracy.</desc>
  <rect x="0" y="0" width="740" height="230" fill="var(--dg-bg)" rx="10"/>
  <line x1="60" y1="190" x2="700" y2="190" stroke="var(--dg-line)" stroke-width="1.3"/>
  <path d="M60 190 C120 186 160 90 250 70 C330 60 380 150 460 180 L520 190 Z" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.5"/>
  <path d="M340 190 C420 186 470 160 520 110 C580 40 620 40 660 120 C680 170 690 186 700 190 Z" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.5"/>
  <line x1="508" y1="30" x2="508" y2="190" stroke="var(--dg-e)" stroke-width="1.6" stroke-dasharray="5 4"/>
  <text x="514" y="42" font-size="10.5" fill="var(--dg-e)">threshold 0.70</text>
  <text x="250" y="60" text-anchor="middle" font-size="11" fill="var(--dg-d)">crowns</text>
  <text x="620" y="30" text-anchor="middle" font-size="11" fill="var(--dg-a)">roofs</text>
  <text x="60" y="208" text-anchor="middle" font-size="10" fill="var(--dg-muted)">0</text>
  <text x="380" y="208" text-anchor="middle" font-size="10" fill="var(--dg-muted)">0.5</text>
  <text x="700" y="208" text-anchor="middle" font-size="10" fill="var(--dg-muted)">1.0</text>
  <text x="380" y="224" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">Planarity</text>
</svg>

## Key Parameter Table

| Option | Type | Default | Guidance |
|---|---|---|---|
| `knn` | int | 10 | About 3 × density in pts/m²; confirm with the sweep above |
| `threads` | int | 1 | 4 roughly halves run time; little gain beyond 8 |
| `feature_set` | string | `Dimensionality` | `all` adds omnivariance, eigenentropy and more at extra cost |
| `mode` | string | `SQRT` | Whether eigenvalues are square-rooted before ratios; keep one setting for training and use |
| `min_k` | int | 3 | Minimum neighbours for a valid result |
| `radius` | float | unset | Radius neighbourhood instead of kNN; steadier across density changes |

## Verification

- **Distributions.** After running on a new tile, the planarity histogram of elevated points should be bimodal, with a clear roof peak above 0.7. A unimodal hump means `knn` is badly mismatched to density.
- **Spot check.** Colour the output by `Planarity` in a viewer. Roof interiors should be uniformly high, ridges and edges lower, crowns mottled.
- **Consistency across tiles.** Compute the median planarity of segments classified as roofs on each tile; a tile that differs by more than 0.1 from the others was flown at different density or processed with different options.

## Gotchas and Edge Cases

**Ridges and hips look non-planar.** A neighbourhood that straddles two roof planes has two dominant directions and a larger third eigenvalue. That is why thresholds are applied to segment medians: ridges are a small fraction of each roof.

**Flat roofs with gravel or plant.** Rooftop HVAC units, solar panels on racks and parapets reduce planarity locally. They rarely change a segment median enough to matter, but they will fail a per-point test.

**Green roofs and very steep roofs.** Vegetated roofs scatter like crowns, and near-vertical mansard faces return few points. Both are legitimate exceptions; label a few in the training polygons if the project has many.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Neighbourhoods on a roof plane, a ridge and a crown" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Where the neighbourhood falls matters</title>
  <desc>A gable roof profile with three circled neighbourhoods. One circle sits in the middle of a roof plane and reads as planar. One circle straddles the ridge and mixes two planes, reading as partly scattered. A third circle inside a nearby tree crown reads as scattered. Labels give example planarity values of 0.88, 0.52 and 0.27.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <path d="M80 170 L260 50 L440 170" fill="none" stroke="var(--dg-a)" stroke-width="2.5"/>
  <circle cx="160" cy="116" r="26" fill="none" stroke="var(--dg-d)" stroke-width="1.6"/>
  <circle cx="260" cy="54" r="26" fill="none" stroke="var(--dg-c)" stroke-width="1.6"/>
  <ellipse cx="590" cy="100" rx="70" ry="60" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <circle cx="600" cy="96" r="26" fill="none" stroke="var(--dg-e)" stroke-width="1.6"/>
  <text x="160" y="160" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">plane: 0.88</text>
  <text x="300" y="30" font-size="10.5" fill="var(--dg-text)">ridge: 0.52</text>
  <text x="590" y="186" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">crown: 0.27</text>
</svg>

**Density changes within a tile.** Flightline overlap doubles density, so a fixed `knn` covers a smaller area there. If your data has strong overlap stripes, use the `radius` option instead, which keeps the neighbourhood physically constant. Normalizing density first with [decimation](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/) is another option.

## Frequently Asked Questions

**What is the difference between planarity and filters.approximatecoplanar?**

Planarity is a continuous value from 0 to 1 that you threshold yourself. filters.approximatecoplanar applies fixed eigenvalue-ratio tests and writes a boolean Coplanar flag. The continuous value is more useful because you can aggregate it per segment and tune the threshold to your data.

**Why do my roof points have low planarity?**

Most often knn is too small for the density, so each neighbourhood holds only a few points that happen to be noisy, or so large that it crosses roof edges. Run the knn sweep on labelled samples and pick the value with the best separation.

**Should I use knn or radius neighbourhoods?**

kNN adapts to density, which is good when density is uniform. A radius keeps the physical scale constant, which is better when overlap or scan pattern makes density vary strongly across the tile.

**Are the thresholds transferable between projects?**

Approximately, when density and knn are similar, but not exactly. Re-derive them from a few labelled samples on each project; it takes minutes.

## Related

- [Building Extraction from LiDAR](https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/) — the full roof classification workflow
- [Extracting Building Footprints from LiDAR](https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/extracting-building-footprints-from-lidar/) — what to do with the classified roofs
- [Estimating Roof Pitch and Aspect from Normals](https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/estimating-roof-pitch-and-aspect-from-normals/) — the orientation counterpart to planarity
- [Computing Geometric Features for Classification](https://www.pythonlidar.com/lidar-classification-feature-extraction/machine-learning-point-classification/computing-geometric-features-for-classification/) — the same features used as model inputs
- [Detecting Power Line Conductors with Linearity](https://www.pythonlidar.com/lidar-classification-feature-extraction/power-line-detection/detecting-power-line-conductors-with-linearity/) — the linear counterpart
