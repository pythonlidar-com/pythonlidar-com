---
title: "Point Cloud Segmentation with PDAL"
description: "Group points into objects with filters.cluster and filters.dbscan: how Euclidean and density-based segmentation differ, how to choose tolerance, eps and min_points from point spacing, and how to summarise segments in pandas."
slug: "point-cloud-segmentation"
type: "topic"
breadcrumb: "Point Cloud Segmentation"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Point Cloud Segmentation with PDAL",
      "description": "Group points into objects with filters.cluster and filters.dbscan: how Euclidean and density-based segmentation differ, how to choose tolerance, eps and min_points from point spacing, and how to summarise segments in pandas.",
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
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Point Cloud Segmentation with PDAL",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Restrict",
          "text": "Filter to the points that could belong to the objects of interest \u2014 a class, a height band, a feature threshold."
        },
        {
          "@type": "HowToStep",
          "name": "Measure spacing",
          "text": "Compute the median and 90th-percentile nearest-neighbour distance of the restricted points."
        },
        {
          "@type": "HowToStep",
          "name": "Choose the method",
          "text": "Euclidean when objects are well separated and you want every point labelled; DBSCAN when objects touch through thin bridges or the input carries isolated clutter."
        },
        {
          "@type": "HowToStep",
          "name": "Set distances from spacing",
          "text": "tolerance or eps at two to three times the median spacing; min_points from the smallest object you care about."
        },
        {
          "@type": "HowToStep",
          "name": "Segment",
          "text": "Run the stage and read back ClusterID, noting that DBSCAN uses -1 for noise and Euclidean clustering leaves unclustered points at 0 when a where clause excludes them."
        },
        {
          "@type": "HowToStep",
          "name": "Summarise and filter",
          "text": "Aggregate each segment's size, extent and features in pandas, and drop segments that fail size or shape tests."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the difference between filters.cluster and filters.dbscan?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "filters.cluster links any two points within the tolerance, so every point ends up in some group and thin bridges merge objects. filters.dbscan only grows groups through dense neighbourhoods and labels sparse points as noise, which separates objects joined by thin connections and discards clutter."
          }
        },
        {
          "@type": "Question",
          "name": "How do I choose eps or tolerance?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Measure the median nearest-neighbour distance of the points you will segment and start at two to three times that value. Then check that the number of object-sized segments is stable when you change the distance by twenty percent in either direction."
          }
        },
        {
          "@type": "Question",
          "name": "Why are some points labelled 0 and others -1?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "DBSCAN labels noise as -1. filters.cluster uses 0 for points in groups smaller than min_points or larger than max_points, and any stage leaves points excluded by a where clause at 0. Treat both as unassigned, but count them separately when diagnosing."
          }
        },
        {
          "@type": "Question",
          "name": "When should I set max_points on filters.cluster?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Set it whenever there is a known upper bound on object size, such as the largest building in the project at your point density. Groups above the limit are relabelled 0 instead of silently becoming one merged super-object, which turns a hidden failure into a visible count you can alert on in a batch run."
          }
        },
        {
          "@type": "Question",
          "name": "Can I segment in 2D and 3D in the same pipeline?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. Run filters.cluster once with is3d set to false to get footprint groups, copy ClusterID to another dimension with filters.ferry, then run it again in 3D. Each point then carries both labels, which is useful when a building's storeys must be grouped but its separate towers must not."
          }
        },
        {
          "@type": "Question",
          "name": "Can segmentation run in streaming mode?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. Both stages need a spatial index over all input points, so they force standard execution. Restrict the input first and use tiles small enough to fit in memory."
          }
        }
      ]
    }
  ]
}
</script>

Almost every object-level product built from LiDAR — a building footprint, a tree, a pole, a parked car, a power-line span — starts with the same move: take a set of points and decide which of them belong together. That is segmentation, and in PDAL it comes down to two stages. `filters.cluster` performs Euclidean connected-component labelling: any two points closer than a tolerance end up in the same group. `filters.dbscan` performs density-based clustering: points join a group only if they sit in a dense enough neighbourhood, and isolated points are labelled noise. Both write a `ClusterID` dimension. Choosing between them, and choosing their two or three parameters, decides whether the objects that come out are the objects you meant. This topic is the shared foundation for the rest of the [classification and feature extraction](https://www.pythonlidar.com/lidar-classification-feature-extraction/) section.

<svg viewBox="0 0 740 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The same points segmented by Euclidean clustering and by DBSCAN" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Same points, two answers</title>
  <desc>Two panels of the same scattered points: two dense groups joined by a thin bridge of points, plus a few isolated points. On the left, Euclidean clustering links everything through the bridge into one segment and keeps each isolated point as its own tiny segment. On the right, DBSCAN keeps the two dense groups separate because the bridge is not dense enough, and labels the isolated points as noise.</desc>
  <rect x="0" y="0" width="740" height="250" fill="var(--dg-bg)" rx="10"/>
  <text x="185" y="28" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">filters.cluster: 1 big + 3 tiny</text>
  <text x="555" y="28" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">filters.dbscan: 2 + noise</text>
  <g fill="var(--dg-a)">
    <circle cx="70" cy="110" r="3.4"/><circle cx="86" cy="96" r="3.4"/><circle cx="100" cy="118" r="3.4"/><circle cx="82" cy="130" r="3.4"/><circle cx="110" cy="100" r="3.4"/><circle cx="96" cy="140" r="3.4"/>
    <circle cx="128" cy="120" r="3.4"/><circle cx="146" cy="122" r="3.4"/><circle cx="164" cy="124" r="3.4"/><circle cx="182" cy="126" r="3.4"/><circle cx="200" cy="128" r="3.4"/>
    <circle cx="220" cy="120" r="3.4"/><circle cx="236" cy="104" r="3.4"/><circle cx="252" cy="126" r="3.4"/><circle cx="232" cy="142" r="3.4"/><circle cx="262" cy="110" r="3.4"/><circle cx="248" cy="150" r="3.4"/>
  </g>
  <g fill="var(--dg-c)"><circle cx="60" cy="200" r="3.4"/><circle cx="190" cy="60" r="3.4"/><circle cx="300" cy="190" r="3.4"/></g>
  <g fill="var(--dg-a)">
    <circle cx="440" cy="110" r="3.4"/><circle cx="456" cy="96" r="3.4"/><circle cx="470" cy="118" r="3.4"/><circle cx="452" cy="130" r="3.4"/><circle cx="480" cy="100" r="3.4"/><circle cx="466" cy="140" r="3.4"/>
  </g>
  <g fill="var(--dg-line-soft)"><circle cx="498" cy="120" r="3.4"/><circle cx="516" cy="122" r="3.4"/><circle cx="534" cy="124" r="3.4"/><circle cx="552" cy="126" r="3.4"/><circle cx="570" cy="128" r="3.4"/></g>
  <g fill="var(--dg-d)">
    <circle cx="590" cy="120" r="3.4"/><circle cx="606" cy="104" r="3.4"/><circle cx="622" cy="126" r="3.4"/><circle cx="602" cy="142" r="3.4"/><circle cx="632" cy="110" r="3.4"/><circle cx="618" cy="150" r="3.4"/>
  </g>
  <g fill="var(--dg-line-soft)"><circle cx="430" cy="200" r="3.4"/><circle cx="560" cy="60" r="3.4"/><circle cx="670" cy="190" r="3.4"/></g>
  <text x="185" y="228" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">the bridge links both blobs; isolated points become segments</text>
  <text x="555" y="228" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">grey points are labelled -1 (noise), including the thin bridge</text>
</svg>

## Prerequisites

- **PDAL 2.3+**; `filters.dbscan` arrived in the 2.x series and `filters.cluster` has been available much longer. Check both with `pdal --options filters.dbscan`.
- **Python 3.10+** with NumPy, pandas and SciPy for spacing estimates and segment statistics.
- **A projected CRS in metres.** Tolerances and `eps` are distances; in a geographic CRS they would be degrees and meaningless.
- **Points already restricted to the objects you want.** Segmentation is only as good as its input: remove ground with a class filter and cut to a height band with [height above ground](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/computing-height-above-ground-with-filters-hag-nn/) before grouping.
- **A sense of point spacing.** Both methods are parameterized by distance; the median nearest-neighbour distance of your input is the number every setting is measured against.

## Core Workflow Architecture

1. **Restrict.** Filter to the points that could belong to the objects of interest — a class, a height band, a feature threshold.
2. **Measure spacing.** Compute the median and 90th-percentile nearest-neighbour distance of the restricted points.
3. **Choose the method.** Euclidean when objects are well separated and you want every point labelled; DBSCAN when objects touch through thin bridges or the input carries isolated clutter.
4. **Set distances from spacing.** `tolerance` or `eps` at two to three times the median spacing; `min_points` from the smallest object you care about.
5. **Segment.** Run the stage and read back `ClusterID`, noting that DBSCAN uses `-1` for noise and Euclidean clustering leaves unclustered points at `0` when a `where` clause excludes them.
6. **Summarise and filter.** Aggregate each segment's size, extent and features in pandas, and drop segments that fail size or shape tests.

## Full Implementation

```python
"""Segment points with Euclidean or DBSCAN clustering and summarise each segment."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Literal

import numpy as np
import pandas as pd
import pdal
from scipy.spatial import cKDTree

log = logging.getLogger("segment")


def restricted(src: Path, where: str, hag_band: tuple[float, float]) -> np.ndarray:
    lo, hi = hag_band
    p = pdal.Pipeline(json.dumps({"pipeline": [
        {"type": "readers.las", "filename": str(src)},
        {"type": "filters.hag_nn", "count": 2},
        {"type": "filters.range", "limits": f"HeightAboveGround[{lo}:{hi}]"},
        {"type": "filters.expression", "expression": where},
    ]}))
    p.execute()
    return p.arrays[0]


def spacing(points: np.ndarray, sample: int = 200_000) -> tuple[float, float]:
    xyz = np.column_stack([points["X"], points["Y"], points["Z"]])
    if len(xyz) > sample:
        xyz = xyz[np.random.default_rng(0).choice(len(xyz), sample, replace=False)]
    d, _ = cKDTree(xyz).query(xyz, k=2)
    return float(np.median(d[:, 1])), float(np.percentile(d[:, 1], 90))


def segment(points: np.ndarray, method: Literal["euclidean", "dbscan"],
            min_points: int, factor: float = 2.5) -> np.ndarray:
    median, p90 = spacing(points)
    dist = round(max(median * factor, p90), 2)
    if method == "euclidean":
        stage = {"type": "filters.cluster", "tolerance": dist,
                 "min_points": min_points, "is3d": True}
    else:
        stage = {"type": "filters.dbscan", "eps": dist,
                 "min_points": min_points, "dimensions": "X,Y,Z"}
    log.info("median spacing %.2f m, p90 %.2f m -> %s distance %.2f m",
             median, p90, method, dist)
    p = pdal.Pipeline(json.dumps({"pipeline": [stage]}), arrays=[points])
    p.execute()
    return p.arrays[0]


def summarise(points: np.ndarray) -> pd.DataFrame:
    df = pd.DataFrame({k: points[k] for k in ("X", "Y", "Z", "HeightAboveGround", "ClusterID")})
    noise = int((df.ClusterID < 0).sum())
    unassigned = int((df.ClusterID == 0).sum())
    df = df[df.ClusterID > 0]
    seg = df.groupby("ClusterID").agg(
        n=("X", "size"),
        x=("X", "mean"), y=("Y", "mean"),
        dx=("X", lambda s: s.max() - s.min()),
        dy=("Y", lambda s: s.max() - s.min()),
        height=("HeightAboveGround", "max"),
    )
    log.info("%d segments, %d noise points, %d unassigned", len(seg), noise, unassigned)
    return seg


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    pts = restricted(Path("block_07.laz"), "Classification == 1", (1.0, 60.0))
    labelled = segment(pts, "dbscan", min_points=10)
    table = summarise(labelled)
    print(table.sort_values("n", ascending=False).head(20))
```

## Code Breakdown

**Restriction happens in PDAL, segmentation on an array.** The restricted points are passed back into a second pipeline with `arrays=[points]`. That split lets you measure spacing on exactly the points that will be segmented, then choose distances from the measurement, without reading the file twice. The mechanics are covered in [passing NumPy arrays into a PDAL pipeline](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/passing-numpy-arrays-into-a-pdal-pipeline/).

**Spacing on a sample.** A k-d tree query over two hundred thousand points is fast and gives a stable median; querying every point of a dense tile would take longer than the segmentation itself.

**`max(median * factor, p90)`.** The median alone underestimates gaps in sparse parts of an object — the far side of a roof from the scanner, the underside of a crown. Taking at least the 90th percentile of spacing keeps those parts connected.

**`is3d: true`.** Euclidean clustering in 3D keeps a bridge deck separate from the road beneath it and a crown separate from a car under it. Set it to false only when you deliberately want plan-view grouping, for example to merge all returns of a building regardless of storey.

**`dimensions: "X,Y,Z"` for DBSCAN.** The stage can cluster on any dimensions, which is powerful — clustering on `X,Y,HeightAboveGround` removes the effect of terrain slope — but it means distances are only meaningful if every listed dimension is in the same units.

**Three kinds of label.** DBSCAN writes `-1` for noise. Euclidean clustering drops groups smaller than `min_points` back to label `0`, and points excluded by a `where` clause also stay `0`. The summary counts them separately because a sudden change in either is the first sign of badly chosen parameters.

<svg viewBox="0 0 740 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Number of segments as the Euclidean tolerance grows relative to point spacing" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Tolerance against point spacing</title>
  <desc>A curve of segment count against tolerance expressed as a multiple of the median point spacing. Below one times spacing, nearly every point is its own segment. Between two and three times spacing the curve flattens into a plateau where objects are stable. Above about five times spacing the count collapses as neighbouring objects merge. The plateau is shaded as the safe region.</desc>
  <rect x="0" y="0" width="740" height="240" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="200" x2="680" y2="200" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="80" y1="200" x2="80" y2="24" stroke="var(--dg-line)" stroke-width="1.3"/>
  <rect x="230" y="24" width="150" height="176" fill="var(--dg-d-soft)"/>
  <path d="M90 34 C130 60 170 110 230 130 L380 136 C430 150 470 180 520 190 L670 194" fill="none" stroke="var(--dg-a)" stroke-width="2"/>
  <text x="305" y="48" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">stable plateau</text>
  <text x="96" y="58" font-size="10.5" fill="var(--dg-text)">every point alone</text>
  <text x="560" y="178" font-size="10.5" fill="var(--dg-text)">objects merge</text>
  <text x="80" y="218" text-anchor="middle" font-size="10" fill="var(--dg-muted)">0×</text>
  <text x="230" y="218" text-anchor="middle" font-size="10" fill="var(--dg-muted)">2×</text>
  <text x="380" y="218" text-anchor="middle" font-size="10" fill="var(--dg-muted)">3×</text>
  <text x="530" y="218" text-anchor="middle" font-size="10" fill="var(--dg-muted)">5×</text>
  <text x="380" y="234" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">tolerance as a multiple of median point spacing</text>
  <text x="46" y="112" font-size="10.5" fill="var(--dg-muted)" transform="rotate(-90 46 112)" text-anchor="middle">segments</text>
</svg>

## Choosing the Space You Segment In

Distance is only meaningful in the space where you measure it, and the default — raw `X,Y,Z` — is not always the right one. `filters.dbscan` makes the choice explicit through its `dimensions` option, and thinking about it saves a lot of threshold tuning.

**Raw coordinates** are right when objects are separated in three dimensions: a bridge deck above a road, a crown above a car, stacked pipes in a plant. Here height matters, and removing it would merge things that are genuinely apart.

**Plan position plus height above ground** — `X,Y,HeightAboveGround` — is right on slopes. A hedge running down a hillside spans ten metres of elevation but only one metre of height above ground; in raw coordinates its points are far apart vertically and the hedge fragments, while in normalized space it is a compact band. The same applies to terraced houses stepping down a street.

**Plan position only** — `X,Y`, or `is3d: false` on `filters.cluster` — is right when you want a footprint, not an object: all returns of a building including balconies and eaves, or all returns under one crown including the understorey.

**Scaled feature spaces** are possible but need care. Clustering on `X,Y,Z,Intensity` mixes metres with intensity counts, so a difference of 1 in intensity weighs the same as a metre of distance. If you want to include a non-spatial dimension, rescale it first with a [Python filter](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/) so that one unit means something comparable to the spatial tolerance.

<svg viewBox="0 0 740 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A hedge on a slope fragments in raw coordinates but stays whole in height-above-ground space" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Why slope matters to segmentation</title>
  <desc>Left panel: a hedge running down a slope, drawn in raw elevation, with points spread over a large vertical range; gaps along the slope break it into three segments shown in three colours. Right panel: the same points plotted as height above ground, forming a flat compact band that segments as one object in a single colour.</desc>
  <rect x="0" y="0" width="740" height="230" fill="var(--dg-bg)" rx="10"/>
  <text x="185" y="28" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">X, Y, Z: three pieces</text>
  <text x="555" y="28" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">X, Y, HeightAboveGround: one</text>
  <line x1="30" y1="70" x2="340" y2="200" stroke="var(--dg-line)" stroke-width="1.4"/>
  <g fill="var(--dg-a)"><circle cx="50" cy="66" r="3"/><circle cx="64" cy="70" r="3"/><circle cx="78" cy="78" r="3"/><circle cx="92" cy="82" r="3"/></g>
  <g fill="var(--dg-c)"><circle cx="150" cy="106" r="3"/><circle cx="164" cy="112" r="3"/><circle cx="178" cy="118" r="3"/><circle cx="192" cy="124" r="3"/></g>
  <g fill="var(--dg-d)"><circle cx="250" cy="148" r="3"/><circle cx="264" cy="154" r="3"/><circle cx="278" cy="160" r="3"/><circle cx="292" cy="166" r="3"/></g>
  <line x1="400" y1="170" x2="710" y2="170" stroke="var(--dg-line)" stroke-width="1.4"/>
  <g fill="var(--dg-b)"><circle cx="420" cy="150" r="3"/><circle cx="434" cy="152" r="3"/><circle cx="448" cy="148" r="3"/><circle cx="462" cy="151" r="3"/><circle cx="520" cy="150" r="3"/><circle cx="534" cy="152" r="3"/><circle cx="548" cy="148" r="3"/><circle cx="562" cy="151" r="3"/><circle cx="620" cy="150" r="3"/><circle cx="634" cy="152" r="3"/><circle cx="648" cy="148" r="3"/><circle cx="662" cy="151" r="3"/><circle cx="490" cy="150" r="3"/><circle cx="592" cy="150" r="3"/></g>
  <text x="185" y="220" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">vertical gaps on the slope exceed eps</text>
  <text x="555" y="220" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">normalized heights close the gaps</text>
</svg>

## Parameter Reference Table

| Stage | Parameter | Type | Default | Typical value | Effect |
|---|---|---|---|---|---|
| `filters.cluster` | `tolerance` | float | 1.0 | 2–3 × spacing | Link distance; larger merges neighbours |
| `filters.cluster` | `min_points` | int | 1 | 20–100 | Smaller groups are relabelled 0 |
| `filters.cluster` | `max_points` | int | unlimited | project-specific | Larger groups are relabelled 0; guards against merged blocks |
| `filters.cluster` | `is3d` | bool | true | true | 2D groups by plan position only |
| `filters.dbscan` | `eps` | float | 1.0 | 2–3 × spacing | Neighbourhood radius for density |
| `filters.dbscan` | `min_points` | int | 6 | 6–20 | Neighbours needed to be a core point |
| `filters.dbscan` | `dimensions` | string | `X,Y,Z` | `X,Y,Z` or `X,Y,HeightAboveGround` | Space in which distance is measured |

## Validation and Integrity Checks

- **Label accounting.** Segmented plus noise plus unassigned must equal the input count. Segmentation stages do not drop points, so any mismatch means a stage between reading and summarising did.
- **Size distribution.** Plot a histogram of segment sizes on a log scale. A healthy result has a long tail of small segments and a clear population of object-sized ones. A single enormous segment holding most of the points means the distance is far too large.
- **Spot checks by colour.** Write the labelled points with `ClusterID` as an extra dimension and colour by it in a viewer. Two minutes looking at a handful of blocks catches merges that no statistic will.
- **Stability across settings.** Rerun at 0.8 and 1.2 times the chosen distance. If the number of object-sized segments changes by more than about ten percent, you are on the slope of the curve above, not on the plateau.

```python
def label_accounting(before: int, labelled: np.ndarray) -> None:
    ids = labelled["ClusterID"]
    parts = int((ids > 0).sum()) + int((ids < 0).sum()) + int((ids == 0).sum())
    assert parts == before == len(labelled), "segmentation changed the point count"
```

## Performance Tuning

Both stages build a k-d tree and then do one radius search per point, so run time grows with point count and with the number of neighbours inside the distance. Two consequences follow. First, restricting the input is by far the biggest saving — segmenting only elevated, non-ground points typically handles a third of the tile. Second, an overly large `eps` or `tolerance` is slow as well as wrong, because every search returns hundreds of neighbours.

| Input points | Method | Distance | Illustrative time | Notes |
|---|---|---|---|---|
| 2 M | cluster | 1.0 m | 6 s | Well-separated suburban objects |
| 2 M | dbscan | 1.0 m | 11 s | Extra cost is the core-point test |
| 10 M | cluster | 1.0 m | 35 s | Scales close to linearly |
| 10 M | dbscan | 3.0 m | 140 s | Large eps multiplies neighbour counts |

Neither stage is multithreaded, so parallelism comes from running tiles in separate processes; see [parallel tile processing](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/parallel-tile-processing-with-processpoolexecutor/). Use buffered tiles and keep only segments whose centroid lies in the unbuffered area, so objects on edges are counted once.

## Common Errors and Troubleshooting

**One segment contains most of the tile.** Ground or low vegetation was not removed, and it connects everything. Check the restriction step; a single `filters.range` on `HeightAboveGround` usually fixes it.

**Thousands of one-point segments.** `min_points` is left at its default of 1 for `filters.cluster`. Set it to the smallest meaningful object size.

**`ClusterID` is -1 everywhere after DBSCAN.** `min_points` is higher than the number of neighbours within `eps` anywhere in the data. Either the data is sparser than you think or `eps` is in the wrong units; measure spacing first.

**Segments differ from run to run.** DBSCAN assigns border points to whichever core point reaches them first, which can depend on order. The objects are the same, but a few border points move. If exact reproducibility matters, sort the input with `filters.sort` on `GpsTime` before segmenting.

**Buildings on a slope segment in pieces.** Terrain slope stretches objects vertically. Cluster on `X,Y,HeightAboveGround` with DBSCAN instead of raw `Z`, which flattens the terrain out of the distance calculation.

## Frequently Asked Questions

**What is the difference between filters.cluster and filters.dbscan?**

filters.cluster links any two points within the tolerance, so every point ends up in some group and thin bridges merge objects. filters.dbscan only grows groups through dense neighbourhoods and labels sparse points as noise, which separates objects joined by thin connections and discards clutter.

**How do I choose eps or tolerance?**

Measure the median nearest-neighbour distance of the points you will segment and start at two to three times that value. Then check that the number of object-sized segments is stable when you change the distance by twenty percent in either direction.

**Why are some points labelled 0 and others -1?**

DBSCAN labels noise as -1. filters.cluster uses 0 for points in groups smaller than min_points or larger than max_points, and any stage leaves points excluded by a where clause at 0. Treat both as unassigned, but count them separately when diagnosing.

**When should I set max_points on filters.cluster?**

Set it whenever there is a known upper bound on object size, such as the largest building in the project at your point density. Groups above the limit are relabelled 0 instead of silently becoming one merged super-object, which turns a hidden failure into a visible count you can alert on in a batch run.

**Can I segment in 2D and 3D in the same pipeline?**

Yes. Run filters.cluster once with is3d set to false to get footprint groups, copy ClusterID to another dimension with filters.ferry, then run it again in 3D. Each point then carries both labels, which is useful when a building's storeys must be grouped but its separate towers must not.

**Can segmentation run in streaming mode?**

No. Both stages need a spatial index over all input points, so they force standard execution. Restrict the input first and use tiles small enough to fit in memory.

## Related

- [Euclidean Segmentation with filters.cluster](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/euclidean-segmentation-with-filters-cluster/) — tolerance, size limits and 2D versus 3D
- [DBSCAN Segmentation with filters.dbscan](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/dbscan-segmentation-with-filters-dbscan/) — eps, min_points and the noise label
- [Extracting Objects from Segment Labels](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/extracting-objects-from-segment-labels/) — from ClusterID to per-object tables and files
- [Building Extraction from LiDAR](https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/) — segmentation applied to roofs
- [Power Line Detection](https://www.pythonlidar.com/lidar-classification-feature-extraction/power-line-detection/) — DBSCAN applied to gappy wires
