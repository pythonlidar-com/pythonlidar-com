---
title: "DBSCAN Segmentation with filters.dbscan"
description: "Density-based segmentation in PDAL: how eps and min_points define core, border and noise points, choosing eps from a k-distance curve, clustering in normalized height space, and handling the -1 noise label."
slug: "dbscan-segmentation-with-filters-dbscan"
type: "howto"
breadcrumb: "DBSCAN Segmentation"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "DBSCAN Segmentation with filters.dbscan",
      "description": "Density-based segmentation in PDAL: how eps and min_points define core, border and noise points, choosing eps from a k-distance curve, clustering in normalized height space, and handling the -1 noise label.",
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
          "name": "Point Cloud Segmentation",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "DBSCAN Segmentation",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/dbscan-segmentation-with-filters-dbscan/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Segment a point cloud with PDAL filters.dbscan",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Choose min_points",
          "text": "A common rule is twice the number of dimensions: 6 for X,Y,Z. Raise it to 10\u201320 on dense data or when you want thin structures treated as noise; lower it to 4 for sparse wires."
        },
        {
          "@type": "HowToStep",
          "name": "Compute the k-distance curve",
          "text": "For each point, find the distance to its k-th nearest neighbour with k = min_points. Sort those distances."
        },
        {
          "@type": "HowToStep",
          "name": "Read eps at the elbow",
          "text": "The elbow \u2014 where the sorted curve bends upward \u2014 is the natural eps: small enough that clutter fails the density test, large enough that object interiors pass it."
        },
        {
          "@type": "HowToStep",
          "name": "Pick the clustering space",
          "text": "Use dimensions: \"X,Y,Z\" for objects separated vertically. Use \"X,Y,HeightAboveGround\" on slopes, where terrain would otherwise stretch objects."
        },
        {
          "@type": "HowToStep",
          "name": "Run and account for labels",
          "text": "Count -1 points separately. A noise share of a few percent is normal; above 20 percent usually means eps is too small or min_points too high."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How do I choose eps for filters.dbscan?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Compute the distance from each point to its k-th nearest neighbour, where k equals min_points, sort those distances and pick the value at the elbow where the curve bends upward. That separates object interiors from fringes and clutter."
          }
        },
        {
          "@type": "Question",
          "name": "What does ClusterID -1 mean?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Noise: the point is not a core point and is not within eps of any core point. It belongs to no group. Treat it as unassigned, and track its share as a diagnostic."
          }
        },
        {
          "@type": "Question",
          "name": "When should I use DBSCAN instead of filters.cluster?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "When objects touch through thin connections, or when the input contains scattered clutter you want discarded. On clean, well-separated objects Euclidean clustering is simpler and faster."
          }
        },
        {
          "@type": "Question",
          "name": "Can DBSCAN cluster on attributes as well as coordinates?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes, through the dimensions option, but every dimension must be on a comparable scale because eps is a single distance. Rescale non-spatial dimensions first."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** `filters.dbscan` grows groups only through "core" points that have at least `min_points` neighbours within `eps`, and labels everything unreachable as `-1`. Pick `min_points` around 2 × the number of dimensions (6–12 for 3D), read `eps` off the elbow of a k-distance curve, and cluster on `X,Y,HeightAboveGround` when terrain slope would otherwise stretch objects apart.

## Context and Motivation

This guide is part of [Point Cloud Segmentation with PDAL](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/). DBSCAN — density-based spatial clustering of applications with noise — solves the two problems Euclidean clustering cannot. First, a thin bridge of a few points no longer merges two objects, because those bridge points do not have enough neighbours to be core points and cannot pass the group on. Second, isolated clutter is labelled noise rather than becoming thousands of tiny groups.

The cost is a second parameter and a little more thought about density. `eps` is still a distance; `min_points` turns it into a density threshold. Together they say: a region is part of an object if it contains at least `min_points` points within any `eps`-radius ball.

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Core, border and noise points in DBSCAN" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Core, border, noise</title>
  <desc>A small point set with eps circles drawn around three example points. A core point has five neighbours inside its circle, meeting min_points. A border point has only two neighbours but lies inside a core point's circle, so it joins that group without extending it. A noise point has one neighbour and lies in no core point's circle, so it is labelled -1.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <circle cx="200" cy="105" r="56" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <circle cx="264" cy="130" r="56" fill="none" stroke="var(--dg-c)" stroke-width="1.3" stroke-dasharray="5 4"/>
  <circle cx="560" cy="100" r="56" fill="none" stroke="var(--dg-line)" stroke-width="1.3" stroke-dasharray="5 4"/>
  <g fill="var(--dg-a)"><circle cx="200" cy="105" r="5"/><circle cx="170" cy="86" r="3.5"/><circle cx="226" cy="84" r="3.5"/><circle cx="176" cy="130" r="3.5"/><circle cx="220" cy="136" r="3.5"/><circle cx="160" cy="108" r="3.5"/></g>
  <circle cx="264" cy="130" r="5" fill="var(--dg-c)"/>
  <circle cx="300" cy="160" r="3.5" fill="var(--dg-line-soft)"/>
  <circle cx="560" cy="100" r="5" fill="var(--dg-line)"/>
  <circle cx="600" cy="126" r="3.5" fill="var(--dg-line-soft)"/>
  <text x="200" y="186" text-anchor="middle" font-size="10.5" fill="var(--dg-a)">core: 5 neighbours ≥ min_points</text>
  <text x="330" y="112" font-size="10.5" fill="var(--dg-c)">border: joins, cannot extend</text>
  <text x="560" y="186" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">noise: labelled −1</text>
  <text x="20" y="24" font-size="10.5" fill="var(--dg-muted)">circles show the eps radius; min_points = 5 here</text>
</svg>

## Prerequisites and Assumptions

- PDAL 2.3+ with `filters.dbscan` and the Python bindings.
- SciPy for the k-distance curve.
- Points restricted to candidates (ground and noise removed), in a projected CRS with metres in every clustered dimension.

## Step-by-Step Implementation

### Step 1 — Choose min_points

A common rule is twice the number of dimensions: 6 for `X,Y,Z`. Raise it to 10–20 on dense data or when you want thin structures treated as noise; lower it to 4 for sparse wires.

### Step 2 — Compute the k-distance curve

For each point, find the distance to its k-th nearest neighbour with k = `min_points`. Sort those distances. The curve is flat for points inside objects and rises sharply for points on the fringes and in clutter.

### Step 3 — Read eps at the elbow

The elbow — where the sorted curve bends upward — is the natural `eps`: small enough that clutter fails the density test, large enough that object interiors pass it.

### Step 4 — Pick the clustering space

Use `dimensions: "X,Y,Z"` for objects separated vertically. Use `"X,Y,HeightAboveGround"` on slopes, where terrain would otherwise stretch objects.

### Step 5 — Run and account for labels

Count `-1` points separately. A noise share of a few percent is normal; above 20 percent usually means `eps` is too small or `min_points` too high.

## Complete Working Example

```python
"""Choose eps from a k-distance curve, then run filters.dbscan."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pdal
from scipy.spatial import cKDTree


def candidates(src: Path) -> np.ndarray:
    p = pdal.Pipeline(json.dumps({"pipeline": [
        {"type": "readers.las", "filename": str(src)},
        {"type": "filters.range", "limits": "Classification![2:2],Classification![7:7]"},
        {"type": "filters.hag_nn", "count": 2},
        {"type": "filters.range", "limits": "HeightAboveGround[1.0:60]"},
    ]}))
    p.execute()
    return p.arrays[0]


def elbow_eps(points: np.ndarray, k: int, dims: tuple[str, ...], sample: int = 150_000) -> float:
    xyz = np.column_stack([points[d] for d in dims])
    if len(xyz) > sample:
        xyz = xyz[np.random.default_rng(1).choice(len(xyz), sample, replace=False)]
    d, _ = cKDTree(xyz).query(xyz, k=k + 1)
    kd = np.sort(d[:, -1])
    # Elbow: point of maximum distance from the chord joining the curve's ends.
    x = np.linspace(0.0, 1.0, len(kd))
    y = (kd - kd[0]) / (kd[-1] - kd[0])
    elbow = int(np.argmax(x - y))
    return float(kd[elbow])


def dbscan(points: np.ndarray, eps: float, min_points: int, dims: str) -> np.ndarray:
    p = pdal.Pipeline(json.dumps({"pipeline": [
        {"type": "filters.dbscan", "eps": round(eps, 2), "min_points": min_points,
         "dimensions": dims}]}), arrays=[points])
    p.execute()
    return p.arrays[0]


if __name__ == "__main__":
    pts = candidates(Path("hillside_22.laz"))
    k = 8
    dims = ("X", "Y", "HeightAboveGround")
    eps = elbow_eps(pts, k, dims)
    out = dbscan(pts, eps, k, ",".join(dims))
    ids = out["ClusterID"]
    print(f"eps={eps:.2f} m  groups={len(np.unique(ids[ids >= 0]))}  "
          f"noise={np.mean(ids < 0):.1%}")
```

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Sorted k-distance curve with the elbow marking eps" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Reading eps off the k-distance curve</title>
  <desc>A curve of the distance to the eighth nearest neighbour, sorted from smallest to largest over all points. It stays nearly flat around 0.4 to 0.6 metres for the first ninety percent of points, then bends sharply upward to over 3 metres for the last few percent. The elbow at about 0.8 metres is marked as the chosen eps, with a dashed chord drawn from the curve's start to its end.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="170" x2="680" y2="170" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="80" y1="170" x2="80" y2="24" stroke="var(--dg-line)" stroke-width="1.3"/>
  <path d="M80 158 C300 154 480 150 560 140 C600 130 630 100 650 60 L670 28" fill="none" stroke="var(--dg-a)" stroke-width="2"/>
  <line x1="80" y1="158" x2="670" y2="28" stroke="var(--dg-line-soft)" stroke-width="1.2" stroke-dasharray="5 4"/>
  <circle cx="590" cy="133" r="5" fill="var(--dg-e)"/>
  <text x="580" y="152" text-anchor="end" font-size="10.5" fill="var(--dg-e)">elbow: eps ≈ 0.8 m</text>
  <text x="200" y="146" font-size="10.5" fill="var(--dg-text)">object interiors: flat</text>
  <text x="560" y="44" text-anchor="end" font-size="10.5" fill="var(--dg-text)">fringes and clutter</text>
  <text x="380" y="190" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">points sorted by k-distance</text>
  <text x="40" y="98" font-size="10.5" fill="var(--dg-muted)" transform="rotate(-90 40 98)" text-anchor="middle">8th-NN distance</text>
</svg>

## Interpreting the Output

The run prints three numbers worth reading together. The chosen `eps` should sit within a small multiple of the point spacing you expect from the flight — if it comes out at 3 m on 20 pts/m² data, the elbow detection latched onto something odd, usually a sparse region such as water or a swath edge dominating the sample. The group count should be in the range of objects you expect in the tile. And the noise share tells you how much the density test threw away.

It helps to look at noise in space, not only as a percentage. Write the result with `ClusterID` as an extra dimension and colour noise points distinctly. Noise concentrated on crown fringes and roof edges is healthy — those are exactly the sparse regions DBSCAN is meant to reject. Noise covering whole objects means those objects were sampled more sparsely than the rest of the tile, and a single `eps` cannot serve both; that is the cue to thin the dense areas or segment them separately.

Finally, remember that noise is not deleted. The points are still in the array with label `-1`, and a later step can reassign them — for example, giving each noise point the label of its nearest grouped neighbour within a short distance, which recovers crown fringes after the groups themselves have been found cleanly.

## Key Parameter Table

| Option | Type | Default | Guidance |
|---|---|---|---|
| `eps` | float | 1.0 | Elbow of the k-distance curve; roughly 2–4 × median spacing |
| `min_points` | int | 6 | 2 × dimensions as a floor; higher treats thin structures as noise |
| `dimensions` | string | `X,Y,Z` | Any dimensions in consistent units; `X,Y,HeightAboveGround` on slopes |
| `where` | expression | none | Run on a subset while keeping all points (unprocessed get the default label) |

## Verification

- **Noise share.** Report the fraction of `-1` points; compare across tiles for consistency.
- **Thin-bridge test.** Find a known case — a hedge touching a house, a branch over a roof — and confirm the two objects receive different IDs.
- **Group count stability.** As with Euclidean clustering, rerun at ±20 percent `eps`. DBSCAN is usually more stable than Euclidean clustering around its chosen setting.

```python
ids = out["ClusterID"]
noise = float(np.mean(ids < 0))
assert noise < 0.2, f"{noise:.0%} noise: eps too small or min_points too high"
```

## Gotchas and Edge Cases

**Varying density defeats one eps.** DBSCAN assumes one density defines objects. Near nadir and in overlap zones density doubles; at swath edges it halves. A single `eps` then over-segments sparse areas or merges dense ones. Normalizing density with voxel thinning first, or running per flightline, helps.

**Border points are order-dependent.** A border point within `eps` of core points in two groups joins whichever group reaches it first. The groups themselves are stable; a few border assignments can change between runs or versions.

**Mixed units in dimensions.** Adding `Intensity` or `ReturnNumber` to `dimensions` mixes metres with counts. Rescale such dimensions before clustering, or leave them out.

<svg viewBox="0 0 740 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The same object sampled at nadir density and at swath-edge density" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>One eps, two densities</title>
  <desc>Two identical shrubs. The left one, near nadir in an overlap zone, is densely sampled and forms one group. The right one, at the swath edge, is sampled at half the density; with the same eps, many of its points fail the core test and are labelled noise, splitting the shrub into a small group and scattered noise.</desc>
  <rect x="0" y="0" width="740" height="190" fill="var(--dg-bg)" rx="10"/>
  <text x="185" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">overlap zone: one group</text>
  <text x="555" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">swath edge: fragments</text>
  <g fill="var(--dg-a)"><circle cx="150" cy="70" r="3"/><circle cx="170" cy="62" r="3"/><circle cx="190" cy="66" r="3"/><circle cx="210" cy="72" r="3"/><circle cx="140" cy="90" r="3"/><circle cx="160" cy="86" r="3"/><circle cx="180" cy="88" r="3"/><circle cx="200" cy="90" r="3"/><circle cx="220" cy="94" r="3"/><circle cx="150" cy="110" r="3"/><circle cx="170" cy="112" r="3"/><circle cx="190" cy="108" r="3"/><circle cx="210" cy="114" r="3"/><circle cx="160" cy="130" r="3"/><circle cx="185" cy="132" r="3"/><circle cx="205" cy="128" r="3"/></g>
  <g fill="var(--dg-c)"><circle cx="530" cy="70" r="3"/><circle cx="560" cy="66" r="3"/><circle cx="545" cy="90" r="3"/></g>
  <g fill="var(--dg-line-soft)"><circle cx="590" cy="94" r="3"/><circle cx="520" cy="112" r="3"/><circle cx="575" cy="120" r="3"/><circle cx="545" cy="134" r="3"/><circle cx="600" cy="130" r="3"/></g>
  <text x="185" y="166" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">every point has ≥ min_points within eps</text>
  <text x="555" y="166" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">grey: labelled −1 at the same eps</text>
</svg>

## Frequently Asked Questions

**How do I choose eps for filters.dbscan?**

Compute the distance from each point to its k-th nearest neighbour, where k equals min_points, sort those distances and pick the value at the elbow where the curve bends upward. That separates object interiors from fringes and clutter.

**What does ClusterID -1 mean?**

Noise: the point is not a core point and is not within eps of any core point. It belongs to no group. Treat it as unassigned, and track its share as a diagnostic.

**When should I use DBSCAN instead of filters.cluster?**

When objects touch through thin connections, or when the input contains scattered clutter you want discarded. On clean, well-separated objects Euclidean clustering is simpler and faster.

**Can DBSCAN cluster on attributes as well as coordinates?**

Yes, through the dimensions option, but every dimension must be on a comparable scale because eps is a single distance. Rescale non-spatial dimensions first.

## Related

- [Point Cloud Segmentation](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/) — the overview of both methods
- [Euclidean Segmentation with filters.cluster](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/euclidean-segmentation-with-filters-cluster/) — the simpler alternative
- [Extracting Objects from Segment Labels](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/extracting-objects-from-segment-labels/) — turning labels into objects
- [Power Line Detection](https://www.pythonlidar.com/lidar-classification-feature-extraction/power-line-detection/) — DBSCAN applied to gappy wires
- [Passing NumPy Arrays into a PDAL Pipeline](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/passing-numpy-arrays-into-a-pdal-pipeline/) — the array hand-off used in the example
