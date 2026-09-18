---
title: "Computing Geometric Features for Classification"
description: "Build a multi-scale per-point feature set in PDAL for machine-learning classification: covariance features at two neighbourhood sizes, normals, height statistics and return ratios, cached as extra bytes in LAZ."
slug: "computing-geometric-features-for-classification"
type: "howto"
breadcrumb: "Geometric Features"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Computing Geometric Features for Classification",
      "description": "Build a multi-scale per-point feature set in PDAL for machine-learning classification: covariance features at two neighbourhood sizes, normals, height statistics and return ratios, cached as extra bytes in LAZ.",
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
          "name": "Machine Learning Classification",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/machine-learning-point-classification/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Geometric Features",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/machine-learning-point-classification/computing-geometric-features-for-classification/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Compute multi-scale geometric features for LiDAR point classification",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Normalize heights",
          "text": "filters.hag_nn with count: 2 writes HeightAboveGround, the most important single feature."
        },
        {
          "@type": "HowToStep",
          "name": "Compute small-scale covariance features and move them aside",
          "text": "Run filters.covariancefeatures with knn: 10, then filters.ferry to copy each feature to a suffixed name. Ferry copies rather than renames, so the originals will be overwritten by the next stage, which is what we want."
        },
        {
          "@type": "HowToStep",
          "name": "Compute large-scale covariance features",
          "text": "Run filters.covariancefeatures again with knn: 40; its outputs remain under the default names and serve as the large-scale set."
        },
        {
          "@type": "HowToStep",
          "name": "Add normals and curvature",
          "text": "filters.normal with knn: 12 adds NormalZ (surface orientation) and Curvature (local roughness)."
        },
        {
          "@type": "HowToStep",
          "name": "Add derived columns in Python and cache",
          "text": "Compute ReturnRatio = ReturnNumber / NumberOfReturns in NumPy, then write everything to LAZ with explicit float types for compactness."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why compute features at more than one scale?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A single neighbourhood size cannot see both local detail and surrounding context. Small neighbourhoods describe edges, wires and leaves; large ones describe the surface or volume those details belong to. Together they resolve confusions neither can alone."
          }
        },
        {
          "@type": "Question",
          "name": "How do I stop the second covariance stage overwriting the first?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Copy the first stage's outputs to new names with filters.ferry immediately after it. The second stage then overwrites only the original names, and both sets survive."
          }
        },
        {
          "@type": "Question",
          "name": "Which features matter most?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Height above ground almost always ranks first, followed by scattering and planarity at one scale or the other. Return ratio and normal Z are valuable for specific confusions. Intensity is often the least transferable between flights."
          }
        },
        {
          "@type": "Question",
          "name": "Should I store features in the LAZ or in a separate table?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Storing them as typed extra bytes in LAZ keeps features and points together and is readable by PDAL and laspy. A Parquet table is faster for repeated training on sampled rows; many workflows keep both."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Chain `filters.hag_nn`, `filters.covariancefeatures` at a small and a large `knn` (renaming the first set with `filters.ferry` so the second does not overwrite it), `filters.normal`, and a return-ratio column computed in Python; write the result once as LAZ with typed `extra_dims` and reuse it for every training run.

## Context and Motivation

This guide is part of [Machine Learning Point Classification for LiDAR](https://www.pythonlidar.com/lidar-classification-feature-extraction/machine-learning-point-classification/). A classifier can only separate what its features describe, and the most common reason a point classifier plateaus is a feature set computed at one neighbourhood scale. At a small scale, a roof edge and a branch look alike; at a large scale, a narrow wall and a hedge look alike. Computing the same descriptors at two scales lets the model see both the local surface and its surroundings, and it is usually the single largest accuracy gain available after height above ground.

There is a PDAL-specific wrinkle. `filters.covariancefeatures` always writes to the same dimension names — `Linearity`, `Planarity`, `Scattering`, `Verticality`. Running it twice overwrites the first result unless you move it aside, which is what `filters.ferry` is for.

<svg viewBox="50 0 560 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Small and large neighbourhoods around a roof-edge point" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Two scales see two different things</title>
  <desc>A roof edge next to a tree crown. A small neighbourhood around a point on the roof edge contains only a few roof-edge points and looks linear, similar to a branch. A large neighbourhood around the same point includes the flat roof interior and reads as planar, which identifies it as part of a building. Both readings are kept as features.</desc>
  <rect x="50" y="0" width="560" height="210" fill="var(--dg-bg)" rx="10"/>
  <rect x="80" y="70" width="260" height="90" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <ellipse cx="480" cy="110" rx="90" ry="70" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <circle cx="340" cy="110" r="22" fill="none" stroke="var(--dg-c)" stroke-width="1.8"/>
  <circle cx="340" cy="110" r="70" fill="none" stroke="var(--dg-b)" stroke-width="1.6" stroke-dasharray="6 4"/>
  <circle cx="340" cy="110" r="4" fill="var(--dg-e)"/>
  <text x="200" y="118" text-anchor="middle" font-size="11" fill="var(--dg-text)">roof</text>
  <text x="520" y="114" text-anchor="middle" font-size="11" fill="var(--dg-text)">crown</text>
  <text x="340" y="30" text-anchor="middle" font-size="10.5" fill="var(--dg-c)">knn 10: edge looks linear</text>
  <text x="340" y="200" text-anchor="middle" font-size="10.5" fill="var(--dg-b)">knn 40: context looks planar</text>
</svg>

## Prerequisites and Assumptions

- PDAL 2.4+ and Python bindings; NumPy.
- Ground classified to class 2; noise classes 7 and 18 present or already removed.
- Enough memory for roughly 100 extra bytes per point once all features are attached (see the table below).

## Step-by-Step Implementation

### Step 1 — Normalize heights

`filters.hag_nn` with `count: 2` writes `HeightAboveGround`, the most important single feature.

### Step 2 — Compute small-scale covariance features and move them aside

Run `filters.covariancefeatures` with `knn: 10`, then `filters.ferry` to copy each feature to a suffixed name. Ferry copies rather than renames, so the originals will be overwritten by the next stage, which is what we want.

```json
{ "type": "filters.ferry",
  "dimensions": "Linearity=>Linearity_s, Planarity=>Planarity_s, Scattering=>Scattering_s, Verticality=>Verticality_s" }
```

### Step 3 — Compute large-scale covariance features

Run `filters.covariancefeatures` again with `knn: 40`; its outputs remain under the default names and serve as the large-scale set.

### Step 4 — Add normals and curvature

`filters.normal` with `knn: 12` adds `NormalZ` (surface orientation) and `Curvature` (local roughness).

### Step 5 — Add derived columns in Python and cache

Compute `ReturnRatio = ReturnNumber / NumberOfReturns` in NumPy, then write everything to LAZ with explicit float types for compactness.

## Complete Working Example

```python
"""Compute a two-scale feature set and cache it as LAZ extra bytes."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import numpy.lib.recfunctions as rfn
import pdal

ABOVE = "Classification != 2 && Classification != 7 && Classification != 18"
FEATURES = ["Linearity", "Planarity", "Scattering", "Verticality"]


def feature_pipeline(src: Path, small: int = 10, large: int = 40) -> list[dict]:
    ferry = ", ".join(f"{f}=>{f}_s" for f in FEATURES)
    return [
        {"type": "readers.las", "filename": str(src)},
        {"type": "filters.hag_nn", "count": 2},
        {"type": "filters.covariancefeatures", "knn": small, "threads": 4,
         "feature_set": "Dimensionality", "where": ABOVE},
        {"type": "filters.ferry", "dimensions": ferry},
        {"type": "filters.covariancefeatures", "knn": large, "threads": 4,
         "feature_set": "Dimensionality", "where": ABOVE},
        {"type": "filters.normal", "knn": 12, "always_up": True, "where": ABOVE},
    ]


def compute(src: Path, dst: Path) -> np.ndarray:
    p = pdal.Pipeline(json.dumps({"pipeline": feature_pipeline(src)}))
    p.execute()
    a = p.arrays[0]
    ratio = (a["ReturnNumber"] / np.maximum(a["NumberOfReturns"], 1)).astype("f4")
    a = rfn.append_fields(a, "ReturnRatio", ratio, usemask=False)

    keep = (["HeightAboveGround", "ReturnRatio", "NormalZ", "Curvature"]
            + FEATURES + [f"{f}_s" for f in FEATURES])
    extra = ",".join(f"{k}=float" for k in keep)
    pdal.Writer.las(filename=str(dst), minor_version=4, dataformat_id=6,
                    forward="all", extra_dims=extra).pipeline(a).execute()
    print(f"{dst.name}: {len(a)} points, {len(keep)} feature dimensions")
    return a


if __name__ == "__main__":
    compute(Path("labelled/tile_6011_4402.laz"), Path("features/tile_6011_4402.laz"))
```

<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The stage chain with dimensions added at each step" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>What each stage adds to the schema</title>
  <desc>Six stages in a column, each with the dimensions it adds listed beside it. hag_nn adds HeightAboveGround. The first covariance stage adds Linearity, Planarity, Scattering and Verticality. Ferry copies them to names with an _s suffix. The second covariance stage overwrites the unsuffixed names with large-scale values. Normal adds NormalX, NormalY, NormalZ and Curvature. Python adds ReturnRatio.</desc>
  <rect x="0" y="0" width="560" height="220" fill="var(--dg-bg)" rx="10"/>
  <g fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.1">
    <rect x="30" y="16" width="230" height="26" rx="5"/><rect x="30" y="50" width="230" height="26" rx="5"/><rect x="30" y="84" width="230" height="26" rx="5"/><rect x="30" y="118" width="230" height="26" rx="5"/><rect x="30" y="152" width="230" height="26" rx="5"/><rect x="30" y="186" width="230" height="26" rx="5"/>
  </g>
  <text x="44" y="34" font-size="10.5" fill="var(--dg-text)">filters.hag_nn</text>
  <text x="44" y="68" font-size="10.5" fill="var(--dg-text)">covariancefeatures knn 10</text>
  <text x="44" y="102" font-size="10.5" fill="var(--dg-text)">filters.ferry</text>
  <text x="44" y="136" font-size="10.5" fill="var(--dg-text)">covariancefeatures knn 40</text>
  <text x="44" y="170" font-size="10.5" fill="var(--dg-text)">filters.normal</text>
  <text x="44" y="204" font-size="10.5" fill="var(--dg-text)">NumPy</text>
  <text x="280" y="34" font-size="10.5" fill="var(--dg-muted)">+ HeightAboveGround</text>
  <text x="280" y="68" font-size="10.5" fill="var(--dg-muted)">+ Linearity, Planarity, Scattering, Verticality</text>
  <text x="280" y="102" font-size="10.5" fill="var(--dg-muted)">+ Linearity_s … Verticality_s (copies)</text>
  <text x="280" y="136" font-size="10.5" fill="var(--dg-muted)">overwrites the four unsuffixed names</text>
  <text x="280" y="170" font-size="10.5" fill="var(--dg-muted)">+ NormalX, NormalY, NormalZ, Curvature</text>
  <text x="280" y="204" font-size="10.5" fill="var(--dg-muted)">+ ReturnRatio</text>
</svg>

## Key Parameter Table

| Feature | Stage | Scale | Why it helps |
|---|---|---|---|
| `HeightAboveGround` | `filters.hag_nn` | — | Separates vegetation strata; places roofs and wires in bands |
| `*_s` features | covariance, knn 10 | small | Local surface: edges, wires, leaves |
| unsuffixed features | covariance, knn 40 | large | Context: roof interior around an edge, crown around a branch |
| `NormalZ` | `filters.normal` | knn 12 | Flat roofs and roads versus walls and slopes |
| `Curvature` | `filters.normal` | knn 12 | Rough vegetation versus smooth surfaces |
| `ReturnRatio` | NumPy | per pulse | Last and single returns versus penetrable targets |

Memory: each float feature costs 8 bytes per point in PDAL's table and 4 bytes on disk when written as `float`. Twelve features add about 96 bytes per point in memory — plan tile sizes accordingly.

## Verification

- **Schema check.** `pdal info --schema features/tile_6011_4402.laz` must list every feature name; a missing one means a writer option or a `where` clause excluded it.
- **Scales differ.** The correlation between `Planarity` and `Planarity_s` should be clearly below 1. Near-perfect correlation means the ferry step ran after the second stage, copying large-scale values.
- **No NaNs in features for above-ground points.** Points excluded by `where` carry zeros; points with too few neighbours can carry NaN.

```python
import numpy as np
r = np.corrcoef(a["Planarity"][a["HeightAboveGround"] > 2], a["Planarity_s"][a["HeightAboveGround"] > 2])[0, 1]
assert r < 0.95, f"scales nearly identical (r={r:.2f}); check stage order"
for k in ("Planarity", "Planarity_s", "NormalZ"):
    assert not np.isnan(a[k]).any(), f"NaN in {k}"
```

## Gotchas and Edge Cases

**Feature values depend on density.** A model trained on features from 10 pts/m² data sees different distributions on 40 pts/m² data with the same `knn`. Either keep density consistent, thin to a common density before computing features, or use radius neighbourhoods.

**`where` leaves zeros, not NaN.** Ground points excluded from the covariance stage get 0 for every feature. That is fine as long as the model never sees ground points; if it does, zeros look like a strongly meaningful value.

**Ferry after, never before.** Ferrying before the first covariance stage copies empty columns; ferrying after the second copies large-scale values. The order in Step 2 is the only one that works.

<svg viewBox="0 0 740 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Correct and incorrect positions of the ferry stage" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Where the ferry must go</title>
  <desc>Three stage orders. In the first, ferry runs before any covariance stage and copies empty columns, marked wrong. In the second, ferry sits between the small and large covariance stages and preserves the small-scale values, marked correct. In the third, ferry runs after both and copies the large-scale values, marked wrong.</desc>
  <rect x="0" y="0" width="740" height="180" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="44" font-size="10.5" fill="var(--dg-e)">wrong</text>
  <text x="20" y="94" font-size="10.5" fill="var(--dg-d)">right</text>
  <text x="20" y="144" font-size="10.5" fill="var(--dg-e)">wrong</text>
  <g font-size="10.5" fill="var(--dg-text)">
    <rect x="80" y="26" width="130" height="28" rx="5" fill="var(--dg-e-soft)" stroke="var(--dg-e)"/><text x="145" y="44" text-anchor="middle">ferry</text>
    <rect x="230" y="26" width="160" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text x="310" y="44" text-anchor="middle">covariance knn 10</text>
    <rect x="410" y="26" width="160" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text x="490" y="44" text-anchor="middle">covariance knn 40</text>
    <rect x="80" y="76" width="160" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text x="160" y="94" text-anchor="middle">covariance knn 10</text>
    <rect x="260" y="76" width="130" height="28" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text x="325" y="94" text-anchor="middle">ferry</text>
    <rect x="410" y="76" width="160" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text x="490" y="94" text-anchor="middle">covariance knn 40</text>
    <rect x="80" y="126" width="160" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text x="160" y="144" text-anchor="middle">covariance knn 10</text>
    <rect x="260" y="126" width="160" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text x="340" y="144" text-anchor="middle">covariance knn 40</text>
    <rect x="440" y="126" width="130" height="28" rx="5" fill="var(--dg-e-soft)" stroke="var(--dg-e)"/><text x="505" y="144" text-anchor="middle">ferry</text>
  </g>
  <text x="590" y="44" font-size="10" fill="var(--dg-muted)">copies empty columns</text>
  <text x="590" y="94" font-size="10" fill="var(--dg-muted)">keeps small scale</text>
  <text x="590" y="144" font-size="10" fill="var(--dg-muted)">copies large scale</text>
</svg>

**Thread count and reproducibility.** Feature values are deterministic for a given input and `knn`, but rounding of ties can differ with thread count on some builds. Pin `threads` along with the PDAL version for bit-identical reruns.

## Frequently Asked Questions

**Why compute features at more than one scale?**

A single neighbourhood size cannot see both local detail and surrounding context. Small neighbourhoods describe edges, wires and leaves; large ones describe the surface or volume those details belong to. Together they resolve confusions neither can alone.

**How do I stop the second covariance stage overwriting the first?**

Copy the first stage's outputs to new names with filters.ferry immediately after it. The second stage then overwrites only the original names, and both sets survive.

**Which features matter most?**

Height above ground almost always ranks first, followed by scattering and planarity at one scale or the other. Return ratio and normal Z are valuable for specific confusions. Intensity is often the least transferable between flights.

**Should I store features in the LAZ or in a separate table?**

Storing them as typed extra bytes in LAZ keeps features and points together and is readable by PDAL and laspy. A Parquet table is faster for repeated training on sampled rows; many workflows keep both.

## Related

- [Machine Learning Point Classification](https://www.pythonlidar.com/lidar-classification-feature-extraction/machine-learning-point-classification/) — the full training loop
- [Training a Random Forest Point Classifier](https://www.pythonlidar.com/lidar-classification-feature-extraction/machine-learning-point-classification/training-a-random-forest-point-classifier/) — using these features
- [Evaluating Point Classification with a Confusion Matrix](https://www.pythonlidar.com/lidar-classification-feature-extraction/machine-learning-point-classification/evaluating-point-classification-with-a-confusion-matrix/) — measuring the gain from each feature
- [Copying Dimensions with filters.ferry](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/copying-dimensions-with-filters-ferry/) — the renaming trick in detail
- [Detecting Planar Roofs with Covariance Features](https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/detecting-planar-roofs-with-covariance-features/) — the same features used with thresholds
