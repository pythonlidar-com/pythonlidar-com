---
title: "LiDAR Classification and Feature Extraction in Python"
description: "Turning a ground-classified point cloud into buildings, trees, power lines, water and bridges: the geometric features PDAL computes, the segmentation stages that group points into objects, and the machine-learning loop that ties them together."
slug: "lidar-classification-feature-extraction"
type: "guide"
breadcrumb: "Classification & Feature Extraction"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "LiDAR Classification and Feature Extraction in Python",
      "description": "Turning a ground-classified point cloud into buildings, trees, power lines, water and bridges: the geometric features PDAL computes, the segmentation stages that group points into objects, and the machine-learning loop that ties them together.",
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
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "LiDAR Classification and Feature Extraction in Python",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Normalize heights",
          "text": "Compute HeightAboveGround with filters.hag_nn or filters.hag_delaunay so that \"tall\" means tall relative to the terrain, not relative to sea level. A two-storey house on a hillside and one on a plain then look alike."
        },
        {
          "@type": "HowToStep",
          "name": "Describe neighbourhoods",
          "text": "Run filters.covariancefeatures, filters.normal or filters.eigenvalues to attach per-point shape descriptors \u2014 linearity, planarity, scattering, verticality, normal vectors."
        },
        {
          "@type": "HowToStep",
          "name": "Group into candidates",
          "text": "Use filters.cluster (Euclidean) or filters.dbscan to give every point in a contiguous object the same ClusterID, usually after restricting the input to a height band."
        },
        {
          "@type": "HowToStep",
          "name": "Decide per object",
          "text": "Aggregate the descriptors per ClusterID in pandas \u2014 median planarity, height range, footprint area, point count \u2014 and assign an ASPRS class or reject the group. Rules first; a trained model when rules plateau."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Do I need machine learning to classify buildings and vegetation?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Not usually to start. Height above ground plus planarity and scattering, aggregated per segment, separates buildings from vegetation well on most airborne data. A trained model earns its place when rules plateau \u2014 mixed urban canopy, unusual roof materials, or many classes at once \u2014 and it uses the same features as input."
          }
        },
        {
          "@type": "Question",
          "name": "Which neighbourhood size should I use for covariance features?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Aim for a neighbourhood about one metre across on the objects you care about. At 8 pts/m\u00b2 that is roughly 10 neighbours; at 30 pts/m\u00b2 it is closer to 25. Plot the feature histogram for known roofs and known crowns and pick the knn at which the two distributions separate most cleanly."
          }
        },
        {
          "@type": "Question",
          "name": "Why compute height above ground before segmentation?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because segmentation without a height band merges objects with the terrain beneath them. Removing everything under 2 or 3 metres above ground leaves elevated objects isolated, so connected-component segmentation finds each roof or crown as its own group."
          }
        },
        {
          "@type": "Question",
          "name": "Can these stages run in streaming mode on huge tiles?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. Every neighbourhood stage needs a spatial index over the full input, so they all block streaming. Keep tiles to a size that fits in memory, cut points early with range filters, and use buffered tiles so objects at edges are seen whole."
          }
        },
        {
          "@type": "Question",
          "name": "How do I keep the computed features in the output file?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Set extra_dims to all, or to an explicit list with types, on writers.las. LAS 1.4 stores them as extra bytes with names, and PDAL and laspy both read them back by name."
          }
        }
      ]
    }
  ]
}
</script>

Ground classification answers one question about every point — is it the bare earth or not? — and most LiDAR deliverables need a great deal more than that. An asset owner wants building footprints with roof heights, a utility wants every conductor span and every tree within striking distance of it, a forester wants stems per hectare and crown diameters, and a hydrologist wants lakes flattened and bridges removed from the terrain before water is routed across it. This section is for the LiDAR analysts, Python GIS developers and surveying teams who have to deliver those products from the same classified tiles. It covers the per-point geometric features PDAL can compute, the segmentation stages that group points into candidate objects, the rules and models that decide what each object is, and the checks that tell you whether the classification is good enough to ship.

<svg viewBox="0 0 760 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The feature-extraction flow from a ground-classified tile to finished object layers" style="width:100%;max-width:760px;display:block;margin:1.6rem auto">
  <title>From classified points to object layers</title>
  <desc>A left-to-right flow. A ground-classified tile passes through height normalization, then per-point geometric features, then segmentation into candidate objects. Candidate objects branch to four products: building footprints, individual trees, power-line spans, and water and bridge surfaces. A feedback arrow runs from an accuracy check back to the feature step.</desc>
  <defs><marker id="ov5-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="760" height="300" fill="var(--dg-bg)" rx="10"/>
  <rect x="16" y="118" width="120" height="56" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.4"/>
  <text x="76" y="142" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">classified tile</text>
  <text x="76" y="160" text-anchor="middle" font-size="10" fill="var(--dg-muted)">ground = class 2</text>
  <rect x="160" y="118" width="120" height="56" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.4"/>
  <text x="220" y="142" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">normalize</text>
  <text x="220" y="160" text-anchor="middle" font-size="10" fill="var(--dg-muted)">height above ground</text>
  <rect x="304" y="118" width="120" height="56" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.4"/>
  <text x="364" y="142" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">features</text>
  <text x="364" y="160" text-anchor="middle" font-size="10" fill="var(--dg-muted)">planarity, linearity</text>
  <rect x="448" y="118" width="120" height="56" rx="8" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.4"/>
  <text x="508" y="142" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">segment</text>
  <text x="508" y="160" text-anchor="middle" font-size="10" fill="var(--dg-muted)">ClusterID per object</text>
  <line x1="136" y1="146" x2="158" y2="146" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#ov5-arw)"/>
  <line x1="280" y1="146" x2="302" y2="146" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#ov5-arw)"/>
  <line x1="424" y1="146" x2="446" y2="146" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#ov5-arw)"/>
  <rect x="604" y="30" width="140" height="40" rx="7" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="674" y="55" text-anchor="middle" font-size="11" fill="var(--dg-text)">building footprints</text>
  <rect x="604" y="90" width="140" height="40" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="674" y="115" text-anchor="middle" font-size="11" fill="var(--dg-text)">individual trees</text>
  <rect x="604" y="150" width="140" height="40" rx="7" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="674" y="175" text-anchor="middle" font-size="11" fill="var(--dg-text)">power-line spans</text>
  <rect x="604" y="210" width="140" height="40" rx="7" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="674" y="235" text-anchor="middle" font-size="11" fill="var(--dg-text)">water and bridges</text>
  <path d="M568 146 L586 146 L586 50 L602 50" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#ov5-arw)"/>
  <path d="M586 110 L602 110" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#ov5-arw)"/>
  <path d="M586 146 L586 170 L602 170" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#ov5-arw)"/>
  <path d="M586 170 L586 230 L602 230" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#ov5-arw)"/>
  <rect x="304" y="228" width="200" height="40" rx="7" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="404" y="253" text-anchor="middle" font-size="11" fill="var(--dg-text)">accuracy check per class</text>
  <path d="M602 248 L520 248" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#ov5-arw)"/>
  <path d="M364 228 L364 176" fill="none" stroke="var(--dg-e)" stroke-width="1.3" stroke-dasharray="4 3" marker-end="url(#ov5-arw)"/>
  <text x="372" y="208" font-size="10" fill="var(--dg-muted)">retune</text>
  <text x="16" y="36" font-size="10.5" fill="var(--dg-muted)">every product starts from the same normalized, feature-rich cloud</text>
</svg>

## Why Feature Extraction Is Its Own Discipline

A LiDAR tile that has been through [SMRF ground classification](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) is already worth something: it yields a terrain model and, with a little more work, a surface model. But everything above the ground is still lumped together as "not ground", and the questions people actually pay for — how many buildings, how tall, how close is that oak to the 132 kV line — live in that lump. Extracting them is a different kind of problem from ground filtering, for three reasons.

First, the unit of reasoning changes from the point to the **object**. SMRF can decide about each point by comparing it with an interpolated surface; deciding that a set of points is a roof requires knowing that they are coplanar, contiguous, elevated and large enough, which are properties of the set, not of any member. That is why this section leans so heavily on segmentation: until points are grouped, most object rules cannot even be expressed.

Second, the evidence is **geometric and local**. Intensity and return number help at the margins, but the dependable signal for most above-ground classes is the shape of each point's neighbourhood — flat for a roof, linear for a wire, volumetric and scattered for a crown. PDAL computes those shape descriptors from the eigenvalues of each neighbourhood's covariance matrix, and a surprisingly large share of practical classification is thresholding them sensibly.

Third, the output is usually **vector or per-object**, not a raster. A footprint layer, a tree table, a list of conductor spans with clearance violations: these are what people consume, and the point cloud is the evidence behind them. The pages here therefore end in GeoPackages and data frames as often as in LAS files.

The ASPRS classes you will be writing are covered in [ASPRS classification codes](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/): 6 for buildings, 3 to 5 for vegetation by height, 9 for water, 13 to 16 for the wire and tower family, 17 for bridge decks. Getting the codes right matters because every downstream consumer — a DTM builder, a GIS viewer, a client QA script — keys on them.

## Conceptual Architecture: Normalize, Describe, Group, Decide

Every workflow in this section follows the same four moves, in the same order, and most failures come from skipping or reordering one.

1. **Normalize heights.** Compute `HeightAboveGround` with [filters.hag_nn or filters.hag_delaunay](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/computing-height-above-ground-with-filters-hag-nn/) so that "tall" means tall relative to the terrain, not relative to sea level. A two-storey house on a hillside and one on a plain then look alike.
2. **Describe neighbourhoods.** Run `filters.covariancefeatures`, `filters.normal` or `filters.eigenvalues` to attach per-point shape descriptors — linearity, planarity, scattering, verticality, normal vectors.
3. **Group into candidates.** Use `filters.cluster` (Euclidean) or `filters.dbscan` to give every point in a contiguous object the same `ClusterID`, usually after restricting the input to a height band.
4. **Decide per object.** Aggregate the descriptors per `ClusterID` in pandas — median planarity, height range, footprint area, point count — and assign an ASPRS class or reject the group. Rules first; a trained model when rules plateau.

The order is not arbitrary. Features computed before normalization mix terrain slope into verticality. Segmentation before height filtering merges a roof with the lawn around it. And deciding per point instead of per object produces the speckle — isolated "building" points in a tree crown — that makes a classification look amateur however good its aggregate accuracy.

<svg viewBox="0 0 760 270" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The three eigenvalue-derived shape descriptors and the objects each one isolates" style="width:100%;max-width:760px;display:block;margin:1.6rem auto">
  <title>Three shapes, three descriptors</title>
  <desc>Three panels. A linear neighbourhood along a wire has one dominant eigenvalue and high linearity. A flat neighbourhood on a roof has two dominant eigenvalues and high planarity. A volumetric neighbourhood inside a tree crown has three similar eigenvalues and high scattering. Each panel shows the eigenvalue bars beneath a sketch of the points.</desc>
  <rect x="0" y="0" width="760" height="270" fill="var(--dg-bg)" rx="10"/>
  <rect x="16" y="20" width="236" height="232" rx="9" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <rect x="262" y="20" width="236" height="232" rx="9" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <rect x="508" y="20" width="236" height="232" rx="9" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="134" y="44" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">wire: linear</text>
  <text x="380" y="44" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">roof: planar</text>
  <text x="626" y="44" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">crown: scattered</text>
  <g fill="var(--dg-c)"><circle cx="46" cy="98" r="3"/><circle cx="72" cy="94" r="3"/><circle cx="98" cy="91" r="3"/><circle cx="124" cy="89" r="3"/><circle cx="150" cy="89" r="3"/><circle cx="176" cy="91" r="3"/><circle cx="202" cy="94" r="3"/><circle cx="226" cy="98" r="3"/></g>
  <path d="M296 110 L372 76 L464 90 L388 124 Z" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <g fill="var(--dg-a)"><circle cx="330" cy="100" r="2.6"/><circle cx="356" cy="92" r="2.6"/><circle cx="382" cy="86" r="2.6"/><circle cx="410" cy="92" r="2.6"/><circle cx="436" cy="96" r="2.6"/><circle cx="360" cy="108" r="2.6"/><circle cx="390" cy="104" r="2.6"/><circle cx="416" cy="106" r="2.6"/></g>
  <g fill="var(--dg-d)"><circle cx="600" cy="74" r="2.8"/><circle cx="628" cy="66" r="2.8"/><circle cx="652" cy="80" r="2.8"/><circle cx="584" cy="96" r="2.8"/><circle cx="614" cy="92" r="2.8"/><circle cx="642" cy="104" r="2.8"/><circle cx="668" cy="96" r="2.8"/><circle cx="598" cy="118" r="2.8"/><circle cx="630" cy="124" r="2.8"/><circle cx="660" cy="118" r="2.8"/></g>
  <text x="30" y="160" font-size="10" fill="var(--dg-muted)">λ1</text><rect x="50" y="151" width="170" height="11" fill="var(--dg-c)"/>
  <text x="30" y="180" font-size="10" fill="var(--dg-muted)">λ2</text><rect x="50" y="171" width="14" height="11" fill="var(--dg-c)"/>
  <text x="30" y="200" font-size="10" fill="var(--dg-muted)">λ3</text><rect x="50" y="191" width="6" height="11" fill="var(--dg-c)"/>
  <text x="276" y="160" font-size="10" fill="var(--dg-muted)">λ1</text><rect x="296" y="151" width="160" height="11" fill="var(--dg-a)"/>
  <text x="276" y="180" font-size="10" fill="var(--dg-muted)">λ2</text><rect x="296" y="171" width="138" height="11" fill="var(--dg-a)"/>
  <text x="276" y="200" font-size="10" fill="var(--dg-muted)">λ3</text><rect x="296" y="191" width="8" height="11" fill="var(--dg-a)"/>
  <text x="522" y="160" font-size="10" fill="var(--dg-muted)">λ1</text><rect x="542" y="151" width="150" height="11" fill="var(--dg-d)"/>
  <text x="522" y="180" font-size="10" fill="var(--dg-muted)">λ2</text><rect x="542" y="171" width="126" height="11" fill="var(--dg-d)"/>
  <text x="522" y="200" font-size="10" fill="var(--dg-muted)">λ3</text><rect x="542" y="191" width="104" height="11" fill="var(--dg-d)"/>
  <text x="134" y="236" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">Linearity near 1</text>
  <text x="380" y="236" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">Planarity near 1</text>
  <text x="626" y="236" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">Scattering high</text>
</svg>

## Core Components

The stages below do almost all of the work in this section. None of them classifies anything on its own; they produce the evidence that your rules or your model will read.

| Stage | Writes | Typical options | Role |
|---|---|---|---|
| `filters.hag_nn` | `HeightAboveGround` | `count: 2`, `max_distance: 0` | Height normalization from nearest ground points |
| `filters.hag_delaunay` | `HeightAboveGround` | `count: 10` | Smoother normalization on sparse ground |
| `filters.covariancefeatures` | `Linearity`, `Planarity`, `Scattering`, `Verticality` | `knn: 16`, `feature_set: "Dimensionality"`, `threads: 4` | Neighbourhood shape descriptors |
| `filters.normal` | `NormalX`, `NormalY`, `NormalZ`, `Curvature` | `knn: 12`, `always_up: true` | Surface orientation for roof pitch and aspect |
| `filters.eigenvalues` | `Eigenvalue0..2` | `knn: 10` | Raw eigenvalues when you want your own ratios |
| `filters.approximatecoplanar` | `Coplanar` | `knn: 8`, `thresh1: 25`, `thresh2: 6` | Quick boolean planarity test |
| `filters.cluster` | `ClusterID` | `tolerance: 1.0`, `min_points: 50`, `is3d: true` | Euclidean connected-component segmentation |
| `filters.dbscan` | `ClusterID` | `eps: 1.2`, `min_points: 10`, `dimensions: "X,Y,Z"` | Density-based segmentation that labels noise `-1` |
| `filters.litree` | `TreeID` | `min_points: 50`, `min_height: 3.0`, `radius: 100` | Point-based individual tree segmentation |
| `filters.overlay` | any dimension | `datasource`, `column`, `dimension` | Burn vector attributes (footprints, water polygons) into points |
| `filters.neighborclassifier` | `Classification` | `k: 9`, `candidate`, `domain` | Majority-vote smoothing of noisy labels |

Two practical notes. `knn` is the parameter that matters most in every feature stage: too small and descriptors are noisy, too large and neighbourhoods straddle object boundaries. Scale it to point density — a value that works at 8 pts/m² is far too small at 60 pts/m². And every one of these stages needs a spatial index over the whole input, which means none of them streams; the implications are covered in [which filters break streaming mode](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/which-pdal-filters-break-streaming-mode/).

## Annotated Reference Pipeline

The pipeline below takes a ground-classified tile to the point where every candidate building has a `ClusterID` and every point carries the descriptors needed to decide. JSON has no comments, so the reasoning for each stage follows the block.

```json
{
  "pipeline": [
    { "type": "readers.las", "filename": "tile_4710_5285.laz" },
    { "type": "filters.range", "limits": "Classification![7:7],Classification![18:18]" },
    { "type": "filters.hag_nn", "count": 2 },
    { "type": "filters.range", "limits": "HeightAboveGround[2.5:120]" },
    {
      "type": "filters.covariancefeatures",
      "knn": 16,
      "threads": 4,
      "feature_set": "Dimensionality"
    },
    { "type": "filters.normal", "knn": 12, "always_up": true },
    {
      "type": "filters.cluster",
      "tolerance": 1.0,
      "min_points": 60,
      "is3d": true,
      "where": "Planarity > 0.6"
    },
    {
      "type": "writers.las",
      "filename": "tile_4710_5285_features.laz",
      "minor_version": 4,
      "dataformat_id": 6,
      "extra_dims": "all"
    }
  ]
}
```

- **Noise first.** Classes 7 and 18 are removed before anything computes neighbourhoods; a single high-noise return above a roof can swing its planarity and pull the normal off vertical.
- **`count: 2` for HAG.** Averaging two ground neighbours smooths the normalization on rough terrain without the cost of a triangulation.
- **Height band 2.5 to 120 m.** Below 2.5 m sit cars, hedges and garden sheds; above 120 m sit only birds and towers. Restricting the band before segmentation is what stops roofs merging with the ground around them.
- **`knn: 16` for covariance.** At roughly 10 to 20 pts/m², sixteen neighbours span about a metre — small enough to stay on one roof plane, large enough for a stable eigen-decomposition.
- **`where: "Planarity > 0.6"` on the cluster stage.** Only planar points are grouped, so tree crowns never join a building segment even when they overhang it. Non-planar points pass through with `ClusterID` 0.
- **`extra_dims: "all"`.** Without it the features you just paid to compute are dropped at write time, which is the single most common surprise in this workflow.

## Python Integration

The same pipeline, driven from Python, becomes a function that returns a per-object table — the form in which classification decisions are easiest to write and to test.

```python
"""Compute per-object building candidates from a ground-classified tile."""
from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np
import pandas as pd
import pdal

log = logging.getLogger("features")


def feature_pipeline(src: Path, dst: Path, knn: int = 16) -> pdal.Pipeline:
    stages = [
        {"type": "readers.las", "filename": str(src)},
        {"type": "filters.range", "limits": "Classification![7:7],Classification![18:18]"},
        {"type": "filters.hag_nn", "count": 2},
        {"type": "filters.range", "limits": "HeightAboveGround[2.5:120]"},
        {"type": "filters.covariancefeatures", "knn": knn, "threads": 4,
         "feature_set": "Dimensionality"},
        {"type": "filters.normal", "knn": 12, "always_up": True},
        {"type": "filters.cluster", "tolerance": 1.0, "min_points": 60, "is3d": True,
         "where": "Planarity > 0.6"},
        {"type": "writers.las", "filename": str(dst), "minor_version": 4,
         "dataformat_id": 6, "extra_dims": "all"},
    ]
    return pdal.Pipeline(json.dumps({"pipeline": stages}))


def object_table(points: np.ndarray) -> pd.DataFrame:
    df = pd.DataFrame({name: points[name] for name in (
        "X", "Y", "HeightAboveGround", "Planarity", "Scattering", "NormalZ", "ClusterID")})
    df = df[df["ClusterID"] > 0]
    grouped = df.groupby("ClusterID").agg(
        n=("X", "size"),
        hag_p90=("HeightAboveGround", lambda s: float(np.percentile(s, 90))),
        planarity=("Planarity", "median"),
        scattering=("Scattering", "median"),
        flat_share=("NormalZ", lambda s: float((s > 0.95).mean())),
        x_span=("X", lambda s: float(s.max() - s.min())),
        y_span=("Y", lambda s: float(s.max() - s.min())),
    )
    grouped["bbox_area"] = grouped["x_span"] * grouped["y_span"]
    return grouped


def run(src: Path, dst: Path) -> pd.DataFrame:
    pipeline = feature_pipeline(src, dst)
    n = pipeline.execute()
    log.info("%s: %d points above 2.5 m", src.name, n)
    table = object_table(pipeline.arrays[0])
    table["is_building"] = (
        (table["planarity"] > 0.75)
        & (table["scattering"] < 0.08)
        & (table["bbox_area"] > 30.0)
        & (table["hag_p90"] > 3.0)
    )
    log.info("%d candidate objects, %d kept as buildings",
             len(table), int(table["is_building"].sum()))
    return table


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    print(run(Path("tile_4710_5285.laz"), Path("tile_4710_5285_features.laz")).head())
```

The design choice worth copying is the split between `feature_pipeline`, which is pure PDAL, and `object_table`, which is pure pandas. The first is expensive and changes rarely; the second is cheap and is where you will iterate on thresholds for days. Caching the feature output and re-running only the aggregation turns a ten-minute tuning loop into a two-second one.

## Schema and Data-Flow Considerations

Feature extraction adds more dimensions to a cloud than any other workflow on this site, and each one has to survive every stage and writer between where it is computed and where it is read.

**New dimensions are doubles.** `Linearity`, `Planarity`, `HeightAboveGround` and the normals are created as 8-byte floats. Four covariance features, three normal components, curvature, HAG and a `ClusterID` add about 76 bytes per point — more than doubling the in-memory footprint of a PDRF 6 cloud. Plan memory accordingly, or drop what you no longer need before the next blocking stage.

**LAS stores them as extra bytes.** `writers.las` with `extra_dims: "all"` writes each as an extra-bytes VLR entry, and `readers.las` restores them by name. If you want smaller files, declare types explicitly — `"extra_dims": "Planarity=float,HeightAboveGround=float,ClusterID=uint32"` — because a 4-byte float is ample precision for a shape descriptor.

**`ClusterID` is per-run, not global.** Segment numbers restart in every tile and every execution. Anything that must be joined across tiles — a building that straddles a tile edge — needs a global key built from the tile name plus the local ID, and a [buffered tiling](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/buffered-tiling-to-avoid-edge-artefacts/) step so that the straddling object is seen whole in at least one tile.

**Classification is written last.** Keep candidate labels in a scratch dimension (`CandidateClass` via `filters.ferry`) until the per-object decision is made, then copy into `Classification` with [filters.assign and a WHERE clause](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/assigning-classification-with-conditional-filters-assign/). Writing into `Classification` early destroys the ground/non-ground evidence that later stages read.

## Performance and Scaling

Neighbourhood features dominate the run time of every pipeline in this section, and they scale with `knn` roughly linearly and with point count slightly worse than linearly. The table gives illustrative timings for a 1 km² tile at about 18 pts/m² (roughly 18 million points after the height band removes ground) on an 8-core worker; use it for proportions rather than absolutes and measure your own hardware.

| Stage and setting | Threads | Wall time | Peak memory |
|---|---|---|---|
| `filters.hag_nn`, `count: 2` | 1 | 40 s | 2.1 GB |
| `filters.covariancefeatures`, `knn: 10` | 4 | 95 s | 3.0 GB |
| `filters.covariancefeatures`, `knn: 16` | 4 | 150 s | 3.2 GB |
| `filters.covariancefeatures`, `knn: 16` | 8 | 90 s | 3.3 GB |
| `filters.normal`, `knn: 12` | 1 | 110 s | 3.4 GB |
| `filters.cluster`, `tolerance: 1.0` | 1 | 35 s | 3.5 GB |
| `filters.dbscan`, `eps: 1.2`, `min_points: 10` | 1 | 60 s | 3.6 GB |

Three levers matter. Cut the input first — the height band and a class filter routinely remove 60 to 80 percent of points before any neighbourhood is computed. Use the `threads` option on `filters.covariancefeatures`, which is one of the few PDAL stages that parallelizes internally. And parallelize across tiles rather than within them, exactly as in [parallel tile processing](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/parallel-tile-processing-with-processpoolexecutor/), giving each process a thread count so that processes times threads does not exceed the core count.

<svg viewBox="0 0 760 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="How much each preprocessing step shrinks the input before neighbourhood features are computed" style="width:100%;max-width:760px;display:block;margin:1.6rem auto">
  <title>Shrink the cloud before you describe it</title>
  <desc>A horizontal bar chart of point counts through the preprocessing steps of a 1 square kilometre tile. The raw tile has about 42 million points. Removing noise barely changes it. Removing ground points drops it to about 19 million. Applying a height band of 2.5 to 120 metres leaves about 11 million. Feature computation then runs on a quarter of the original points.</desc>
  <rect x="0" y="0" width="760" height="250" fill="var(--dg-bg)" rx="10"/>
  <text x="200" y="68" text-anchor="end" font-size="11" fill="var(--dg-text)">raw tile</text>
  <rect x="210" y="54" width="480" height="20" rx="3" fill="var(--dg-line-soft)"/>
  <text x="700" y="69" font-size="10.5" fill="var(--dg-muted)">42 M</text>
  <text x="200" y="108" text-anchor="end" font-size="11" fill="var(--dg-text)">noise removed</text>
  <rect x="210" y="94" width="474" height="20" rx="3" fill="var(--dg-b)"/>
  <text x="694" y="109" font-size="10.5" fill="var(--dg-muted)">41.5 M</text>
  <text x="200" y="148" text-anchor="end" font-size="11" fill="var(--dg-text)">ground removed</text>
  <rect x="210" y="134" width="217" height="20" rx="3" fill="var(--dg-a)"/>
  <text x="437" y="149" font-size="10.5" fill="var(--dg-muted)">19 M</text>
  <text x="200" y="188" text-anchor="end" font-size="11" fill="var(--dg-text)">height band 2.5–120 m</text>
  <rect x="210" y="174" width="126" height="20" rx="3" fill="var(--dg-d)"/>
  <text x="346" y="189" font-size="10.5" fill="var(--dg-muted)">11 M</text>
  <text x="210" y="36" font-size="10.5" fill="var(--dg-muted)">points entering the neighbourhood stages, 1 km² urban tile at about 42 pts/m²</text>
  <text x="210" y="228" font-size="10.5" fill="var(--dg-muted)">each feature stage now runs on roughly a quarter of the tile</text>
</svg>

## Production Deployment Patterns

Classification pipelines change more often than any other kind on this site, because the thresholds are tuned against each new project's vegetation, roof styles and sensor. That makes versioning and regression testing unusually important.

- **Version thresholds with the pipeline.** Keep rule thresholds in the same repository as the pipeline JSON, ideally as parameters in a [templated pipeline](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-templating-parameterization/), so that a delivered tile can always be traced to the exact numbers that classified it.
- **Keep a labelled reference tile per project.** A few hundred metres of hand-edited classification is enough to compute per-class precision and recall on every change; the method is in [evaluating point classification with a confusion matrix](https://www.pythonlidar.com/lidar-classification-feature-extraction/machine-learning-point-classification/evaluating-point-classification-with-a-confusion-matrix/).
- **Separate the expensive pass.** Store the feature-enriched LAZ once, then run the cheap per-object decisions as a second job. The split mirrors [splitting a blocking pipeline into two passes](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/splitting-a-blocking-pipeline-into-two-passes/) and makes reclassification after a threshold change nearly free.
- **Run in the same container everywhere.** Feature values differ slightly between PDAL releases as neighbourhood code evolves, so the image that tuned the thresholds must be the image that applies them — see [pinning PDAL versions with conda-lock](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/pinning-pdal-versions-with-conda-lock/).

## Failure Modes and Debugging

**Everything is planar.** On sparse data (under 4 pts/m²) with a small `knn`, three or four neighbours always look planar and `Planarity` saturates near 1 for crowns as well as roofs. Raise `knn`, or switch to a radius-based neighbourhood, and check the distribution with a histogram before trusting any threshold.

**Roofs merge with trees.** Euclidean clustering links any two points closer than `tolerance`, so an overhanging branch bridges a roof and a crown into one segment. Restrict clustering with a `where` clause on planarity, or use DBSCAN with a `min_points` high enough that a thin branch is not dense enough to bridge.

**`ClusterID` is all zero.** The `where` clause excluded everything, usually because the feature dimension name was misspelled or the feature stage was placed after the cluster stage. Set `"loglevel": 4` in the pipeline options or read `pipeline.log` after execution; PDAL reports how many points each stage saw.

**Extra dimensions vanish.** A writer without `extra_dims` silently drops them. Check the output with `pdal info --schema out.laz` and assert the names you expect before shipping the tile.

**Results change between machines.** Covariance features on ties and near-duplicate points are order-sensitive, and different thread counts can visit neighbourhoods in different orders. The differences are tiny per point but can flip a borderline object. Pin `threads` along with the PDAL version when reproducibility matters.

## Frequently Asked Questions

**Do I need machine learning to classify buildings and vegetation?**

Not usually to start. Height above ground plus planarity and scattering, aggregated per segment, separates buildings from vegetation well on most airborne data. A trained model earns its place when rules plateau — mixed urban canopy, unusual roof materials, or many classes at once — and it uses the same features as input.

**Which neighbourhood size should I use for covariance features?**

Aim for a neighbourhood about one metre across on the objects you care about. At 8 pts/m² that is roughly 10 neighbours; at 30 pts/m² it is closer to 25. Plot the feature histogram for known roofs and known crowns and pick the knn at which the two distributions separate most cleanly.

**Why compute height above ground before segmentation?**

Because segmentation without a height band merges objects with the terrain beneath them. Removing everything under 2 or 3 metres above ground leaves elevated objects isolated, so connected-component segmentation finds each roof or crown as its own group.

**Can these stages run in streaming mode on huge tiles?**

No. Every neighbourhood stage needs a spatial index over the full input, so they all block streaming. Keep tiles to a size that fits in memory, cut points early with range filters, and use buffered tiles so objects at edges are seen whole.

**How do I keep the computed features in the output file?**

Set extra_dims to all, or to an explicit list with types, on writers.las. LAS 1.4 stores them as extra bytes with names, and PDAL and laspy both read them back by name.

## Related

- [Building Extraction from LiDAR](https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/) — planar roof segments to footprint polygons with heights
- [Individual Tree Segmentation](https://www.pythonlidar.com/lidar-classification-feature-extraction/individual-tree-segmentation/) — watershed and point-based methods for stems and crowns
- [Power Line Detection](https://www.pythonlidar.com/lidar-classification-feature-extraction/power-line-detection/) — conductors from linearity, catenary fits and clearance checks
- [Point Cloud Segmentation](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/) — Euclidean and DBSCAN grouping, the step every object workflow depends on
- [Machine Learning Point Classification](https://www.pythonlidar.com/lidar-classification-feature-extraction/machine-learning-point-classification/) — features, training and honest evaluation
- [Water and Bridge Classification](https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/) — the two classes that make or break a hydrologic DTM
