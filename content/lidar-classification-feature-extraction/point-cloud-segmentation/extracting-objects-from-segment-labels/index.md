---
title: "Extracting Objects from Segment Labels"
description: "From ClusterID to usable objects: build a per-object table with pandas, filter objects by size and shape, decide classes per object by majority vote, write each object to its own file, and export footprints and centroids to GeoPackage."
slug: "extracting-objects-from-segment-labels"
type: "howto"
breadcrumb: "Objects from Segment Labels"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Extracting Objects from Segment Labels",
      "description": "From ClusterID to usable objects: build a per-object table with pandas, filter objects by size and shape, decide classes per object by majority vote, write each object to its own file, and export footprints and centroids to GeoPackage.",
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
          "name": "Objects from Segment Labels",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/extracting-objects-from-segment-labels/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Turn segmentation labels into per-object tables, classes and files",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Build the object table",
          "text": "Put the dimensions you need into a DataFrame and aggregate by label with named aggregations, so every column has a clear meaning."
        },
        {
          "@type": "HowToStep",
          "name": "Filter objects",
          "text": "Apply size, extent and height rules as boolean expressions on the table. Keep the rules in one place and log how many objects each removes."
        },
        {
          "@type": "HowToStep",
          "name": "Decide a class per object",
          "text": "Rules on medians are the simplest; a majority vote of per-point model predictions is the alternative when a classifier exists."
        },
        {
          "@type": "HowToStep",
          "name": "Map the decision back to points",
          "text": "Series.map from label to class gives a per-point class column in one vectorized step; points of dropped objects keep their original class."
        },
        {
          "@type": "HowToStep",
          "name": "Export",
          "text": "Write classified points to LAS, each object to its own LAZ with filters.groupby if the client wants object files, and footprints plus attributes to a GeoPackage."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why decide classes per object instead of per point?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because many properties that identify an object, such as its footprint area, height range or median planarity, only exist at object level, and because one decision per object removes the scattered misclassified points that per-point decisions leave behind."
          }
        },
        {
          "@type": "Question",
          "name": "How do I write one LAS file per object?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Use filters.groupby on the label dimension followed by writers.las with a # in the filename. Each group is written to its own file with the placeholder replaced by a running number."
          }
        },
        {
          "@type": "Question",
          "name": "What should happen to objects that no rule accepts?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Leave their points' classification unchanged, usually class 1. Record them in the object table with a reason so you can review the rejected objects nearest the thresholds."
          }
        },
        {
          "@type": "Question",
          "name": "How do I carry object IDs into the delivered LAS?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Write the label as an extra dimension with writers.las extra_dims, for example ClusterID as int64. Readers such as PDAL and laspy return it by name."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Load the labelled points into pandas, `groupby("ClusterID")` to build one row per object with count, extent, height statistics and median features, filter objects with plain boolean rules, assign a class per object by rule or majority vote and map it back to points with `Series.map`, then export object points with a PDAL `filters.groupby` pipeline and object footprints with GeoPandas.

## Context and Motivation

This guide is part of [Point Cloud Segmentation with PDAL](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/). Segmentation stages stop at a label per point. Every workflow in this section then needs the same second half: describe each labelled group, decide which groups are real objects, give each object a class, and deliver it in a form someone can use. Doing that consistently — one table, one set of rules, one mapping back to points — is what separates a reproducible extraction from a notebook full of one-off masks.

The pattern also fixes the most visible flaw of per-point classification: speckle. When the class is decided per object and written to every point of that object, a roof cannot contain a handful of "vegetation" points, because the decision was never made per point.

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Points with labels aggregated into an object table and mapped back to points" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Aggregate, decide, map back</title>
  <desc>Left: a column of labelled points with ClusterID values 1, 1, 2, 2, 2 and 3. Middle: an object table with one row per ClusterID holding point count, height and planarity, plus a decided class. Right: the same points now carrying the class of their object. Arrows show the groupby from points to table and the map from table back to points.</desc>
  <defs><marker id="obj-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="34" width="150" height="150" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="95" y="54" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">points</text>
  <text x="40" y="78" font-size="10.5" fill="var(--dg-text)">pt 1 · id 1</text>
  <text x="40" y="96" font-size="10.5" fill="var(--dg-text)">pt 2 · id 1</text>
  <text x="40" y="114" font-size="10.5" fill="var(--dg-text)">pt 3 · id 2</text>
  <text x="40" y="132" font-size="10.5" fill="var(--dg-text)">pt 4 · id 2</text>
  <text x="40" y="150" font-size="10.5" fill="var(--dg-text)">pt 5 · id 2</text>
  <text x="40" y="168" font-size="10.5" fill="var(--dg-text)">pt 6 · id 3</text>
  <rect x="240" y="34" width="260" height="150" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="370" y="54" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">object table</text>
  <text x="256" y="82" font-size="10.5" fill="var(--dg-text)">id 1 · n 2 · h 7.9 · plan 0.84 → 6</text>
  <text x="256" y="110" font-size="10.5" fill="var(--dg-text)">id 2 · n 3 · h 14.2 · plan 0.31 → 5</text>
  <text x="256" y="138" font-size="10.5" fill="var(--dg-text)">id 3 · n 1 · too small → drop</text>
  <rect x="570" y="34" width="150" height="150" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="645" y="54" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">points, classed</text>
  <text x="588" y="78" font-size="10.5" fill="var(--dg-text)">pt 1 · class 6</text>
  <text x="588" y="96" font-size="10.5" fill="var(--dg-text)">pt 2 · class 6</text>
  <text x="588" y="114" font-size="10.5" fill="var(--dg-text)">pt 3 · class 5</text>
  <text x="588" y="132" font-size="10.5" fill="var(--dg-text)">pt 4 · class 5</text>
  <text x="588" y="150" font-size="10.5" fill="var(--dg-text)">pt 5 · class 5</text>
  <text x="588" y="168" font-size="10.5" fill="var(--dg-muted)">pt 6 · unchanged</text>
  <line x1="172" y1="100" x2="236" y2="100" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#obj-arw)"/>
  <line x1="502" y1="100" x2="566" y2="100" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#obj-arw)"/>
  <text x="204" y="200" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">groupby</text>
  <text x="534" y="200" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">map</text>
</svg>

## Prerequisites and Assumptions

- Points with a segment label — `ClusterID` from [filters.cluster](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/euclidean-segmentation-with-filters-cluster/) or [filters.dbscan](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/dbscan-segmentation-with-filters-dbscan/), or `TreeID` from `filters.litree`.
- Any per-point features you want to aggregate, such as `HeightAboveGround`, `Planarity`, `Scattering`.
- Python with pandas, NumPy, Shapely 2.x and GeoPandas; PDAL bindings.

## Step-by-Step Implementation

### Step 1 — Build the object table

Put the dimensions you need into a DataFrame and aggregate by label with named aggregations, so every column has a clear meaning.

### Step 2 — Filter objects

Apply size, extent and height rules as boolean expressions on the table. Keep the rules in one place and log how many objects each removes.

### Step 3 — Decide a class per object

Rules on medians are the simplest; a majority vote of per-point model predictions is the alternative when a classifier exists.

### Step 4 — Map the decision back to points

`Series.map` from label to class gives a per-point class column in one vectorized step; points of dropped objects keep their original class.

### Step 5 — Export

Write classified points to LAS, each object to its own LAZ with `filters.groupby` if the client wants object files, and footprints plus attributes to a GeoPackage.

## Complete Working Example

```python
"""Object table, per-object classes, and exports from segment labels."""
from __future__ import annotations

import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import pdal
import shapely
from shapely.geometry import MultiPoint


def object_table(a: np.ndarray, label: str = "ClusterID") -> pd.DataFrame:
    df = pd.DataFrame({"x": a["X"], "y": a["Y"], "hag": a["HeightAboveGround"],
                       "planarity": a["Planarity"], "scattering": a["Scattering"],
                       "label": a[label]})
    df = df[df.label > 0]
    return df.groupby("label").agg(
        n=("x", "size"),
        cx=("x", "mean"), cy=("y", "mean"),
        dx=("x", np.ptp), dy=("y", np.ptp),
        h_max=("hag", "max"), h_p50=("hag", "median"),
        planarity=("planarity", "median"), scattering=("scattering", "median"),
    )


def decide(obj: pd.DataFrame) -> pd.Series:
    cls = pd.Series(0, index=obj.index, dtype="uint8")        # 0 = leave unchanged
    big = obj.n >= 50
    cls[big & (obj.planarity > 0.7) & (obj.scattering < 0.1) & (obj.h_max > 2.5)] = 6
    cls[big & (obj.scattering >= 0.2) & (obj.h_max > 5.0)] = 5
    cls[big & (obj.scattering >= 0.2) & obj.h_max.between(2.0, 5.0)] = 4
    print(cls.value_counts().rename({0: "unchanged", 4: "medium veg", 5: "high veg", 6: "building"}))
    return cls


def apply(a: np.ndarray, cls: pd.Series, label: str = "ClusterID") -> np.ndarray:
    out = a.copy()
    per_point = pd.Series(out[label]).map(cls).fillna(0).to_numpy().astype("uint8")
    change = per_point > 0
    out["Classification"][change] = per_point[change]
    return out


def footprints(a: np.ndarray, obj: pd.DataFrame, cls: pd.Series, crs: str) -> gpd.GeoDataFrame:
    rows = []
    for lab in cls.index[cls == 6]:
        sel = a["ClusterID"] == lab
        hull = shapely.concave_hull(MultiPoint(np.column_stack([a["X"][sel], a["Y"][sel]])),
                                    ratio=0.3)
        rows.append({"object": int(lab), "height_m": round(float(obj.at[lab, "h_max"]), 2),
                     "points": int(obj.at[lab, "n"]), "geometry": hull})
    return gpd.GeoDataFrame(rows, crs=crs)


def per_object_files(src_with_labels: Path, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    pdal.Pipeline(json.dumps({"pipeline": [
        str(src_with_labels),
        {"type": "filters.range", "limits": "Classification[6:6]"},
        {"type": "filters.groupby", "dimension": "ClusterID"},
        {"type": "writers.las", "filename": str(out_dir / "building_#.laz")},
    ]})).execute()


if __name__ == "__main__":
    p = pdal.Pipeline(json.dumps({"pipeline": ["block_07_features.laz"]}))
    p.execute()
    arr = p.arrays[0]
    objects = object_table(arr)
    classes = decide(objects)
    classified = apply(arr, classes)
    pdal.Writer.las(filename="block_07_classified.laz", minor_version=4, dataformat_id=6,
                    forward="all", extra_dims="ClusterID=int64").pipeline(classified).execute()
    footprints(classified, objects, classes, "EPSG:6347").to_file(
        "block_07_objects.gpkg", layer="buildings", driver="GPKG")
    per_object_files(Path("block_07_classified.laz"), Path("out/buildings"))
```

In `writers.las`, the `#` in the filename is replaced by a running number for each group that `filters.groupby` produces, which is how one pipeline writes one file per object.

## Key Parameter Table

| Setting | Where | Guidance |
|---|---|---|
| minimum object size | `decide` | Filter tiny groups before any class rule |
| aggregation statistic | `object_table` | Medians for features, max or p98 for height |
| unchanged class code | `decide` | 0 means "do not touch"; never write 0 into Classification |
| hull `ratio` | `footprints` | 0.3–0.5 for buildings; 1.0 gives the convex hull |
| `filters.groupby` `dimension` | `per_object_files` | The label dimension; must be preserved in the input file |

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Per-point predictions versus per-object majority on a roof" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Why deciding per object removes speckle</title>
  <desc>Left: a roof segment where per-point predictions are mostly building but include a scattering of vegetation labels at edges and near a chimney. Right: the same segment after a per-object majority vote, uniformly building. A note gives the vote: 412 building, 23 vegetation, so the whole segment becomes building.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <text x="185" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">per point</text>
  <text x="555" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">per object</text>
  <rect x="70" y="44" width="230" height="110" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <g fill="var(--dg-d)"><circle cx="80" cy="52" r="4"/><circle cx="290" cy="60" r="4"/><circle cx="180" cy="98" r="4"/><circle cx="186" cy="92" r="4"/><circle cx="84" cy="144" r="4"/><circle cx="260" cy="146" r="4"/><circle cx="296" cy="120" r="4"/></g>
  <rect x="440" y="44" width="230" height="110" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="185" y="176" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">green dots: points predicted as vegetation</text>
  <text x="555" y="176" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">vote 412 building to 23 vegetation</text>
</svg>

## Verification

- **Point conservation.** The classified array has the same length as the input, and only points in decided objects changed class.
- **Table and points agree.** For a sample of objects, the class in the table equals the class of every point with that label.
- **Rules removed what you expect.** Log how many objects each rule accepted, and look at the rejected objects closest to each threshold.

```python
before, after = arr["Classification"], classified["Classification"]
changed = before != after
labels_changed = np.unique(arr["ClusterID"][changed])
assert set(labels_changed) <= set(classes.index[classes > 0]), "points outside decided objects changed"
```

## Gotchas and Edge Cases

**Label 0 and -1.** Euclidean clustering uses 0 for unassigned points and DBSCAN uses -1 for noise. Exclude both before aggregating, or they become one giant "object" that dominates every statistic.

**Labels are per tile.** The same number means different objects in different tiles. Build a global key such as `f"{tile}_{label}"` before merging tables across tiles.

**Mapping with missing keys.** `Series.map` returns NaN for labels not in the decision table; the `fillna(0)` is what keeps those points unchanged. Forgetting it turns them into class 0 after the cast.

<svg viewBox="0 0 740 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Local labels in two tiles colliding and a global key resolving them" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Local labels need a global key</title>
  <desc>Two adjacent tiles each contain an object labelled 17: a house in tile A and a tree in tile B. Merged naively, both become one object 17. With a global key combining tile name and label, they become A_17 and B_17 and stay distinct.</desc>
  <rect x="0" y="0" width="740" height="180" fill="var(--dg-bg)" rx="10"/>
  <rect x="30" y="30" width="200" height="120" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <rect x="230" y="30" width="200" height="120" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="130" y="50" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">tile A</text>
  <text x="330" y="50" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">tile B</text>
  <path d="M80 110 L130 80 L180 110 Z" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <circle cx="330" cy="100" r="26" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="130" y="134" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">label 17</text>
  <text x="330" y="140" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">label 17</text>
  <text x="470" y="70" font-size="10.5" fill="var(--dg-e)">naive merge: one object 17</text>
  <text x="470" y="110" font-size="10.5" fill="var(--dg-d)">global key: A_17 and B_17</text>
</svg>

**Objects on tile edges.** A building cut by the tile edge becomes two partial objects in two tiles. Process buffered tiles and keep objects whose centroid lies inside the nominal tile.

## Frequently Asked Questions

**Why decide classes per object instead of per point?**

Because many properties that identify an object, such as its footprint area, height range or median planarity, only exist at object level, and because one decision per object removes the scattered misclassified points that per-point decisions leave behind.

**How do I write one LAS file per object?**

Use filters.groupby on the label dimension followed by writers.las with a # in the filename. Each group is written to its own file with the placeholder replaced by a running number.

**What should happen to objects that no rule accepts?**

Leave their points' classification unchanged, usually class 1. Record them in the object table with a reason so you can review the rejected objects nearest the thresholds.

**How do I carry object IDs into the delivered LAS?**

Write the label as an extra dimension with writers.las extra_dims, for example ClusterID as int64. Readers such as PDAL and laspy return it by name.

## Related

- [Point Cloud Segmentation](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/) — producing the labels
- [Euclidean Segmentation with filters.cluster](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/euclidean-segmentation-with-filters-cluster/) — connected-component labels
- [DBSCAN Segmentation with filters.dbscan](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/dbscan-segmentation-with-filters-dbscan/) — density-based labels and noise
- [Extracting Building Footprints from LiDAR](https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/extracting-building-footprints-from-lidar/) — the dedicated footprint route
- [Training a Random Forest Point Classifier](https://www.pythonlidar.com/lidar-classification-feature-extraction/machine-learning-point-classification/training-a-random-forest-point-classifier/) — per-point predictions to vote over
