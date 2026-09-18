---
title: "Euclidean Segmentation with filters.cluster"
description: "Group points into connected objects with PDAL filters.cluster: choosing tolerance from point spacing, min_points and max_points as guards, 2D versus 3D linking, and restricting the stage with a where clause."
slug: "euclidean-segmentation-with-filters-cluster"
type: "howto"
breadcrumb: "Euclidean Segmentation"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Euclidean Segmentation with filters.cluster",
      "description": "Group points into connected objects with PDAL filters.cluster: choosing tolerance from point spacing, min_points and max_points as guards, 2D versus 3D linking, and restricting the stage with a where clause.",
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
          "name": "Euclidean Segmentation",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/euclidean-segmentation-with-filters-cluster/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Segment points into connected objects with PDAL filters.cluster",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Restrict to candidate points",
          "text": "Drop ground and noise, and cut to a height band, so that the terrain cannot connect objects. Either filter them out, or use a where clause on the cluster stage to keep every point in the output."
        },
        {
          "@type": "HowToStep",
          "name": "Set tolerance from spacing",
          "text": "Start at 2.5 \u00d7 median spacing. Too small fragments objects along sparse edges; too large merges neighbours."
        },
        {
          "@type": "HowToStep",
          "name": "Set size guards",
          "text": "min_points relabels small groups to 0; max_points relabels oversized groups to 0. Both keep the object table clean and make failures visible."
        },
        {
          "@type": "HowToStep",
          "name": "Choose 2D or 3D",
          "text": "With is3d: true, distance includes Z. With false, only plan position matters, which merges stacked objects \u2014 useful for footprints, harmful for bridges over roads."
        },
        {
          "@type": "HowToStep",
          "name": "Run and inspect the label distribution",
          "text": "Count points per ClusterID, check how many are 0, and look at the largest groups first."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What tolerance should I use for filters.cluster?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Start at two to three times the median spacing between neighbouring points on your objects, then check that the number of object-sized groups is stable when you change the tolerance by twenty percent either way."
          }
        },
        {
          "@type": "Question",
          "name": "Why is ClusterID zero for many points?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Zero means unassigned: the point was in a group smaller than min_points or larger than max_points, or it was excluded by a where clause. Count the zeros and look at why they occur before tuning anything else."
          }
        },
        {
          "@type": "Question",
          "name": "Should is3d be true or false?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "True in almost every case, because objects separated vertically, such as a bridge over a road, should stay apart. Use false when you deliberately want everything above one footprint merged, such as all storeys and balconies of one building."
          }
        },
        {
          "@type": "Question",
          "name": "Is filters.cluster deterministic?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. Connected components do not depend on processing order, so the same input and tolerance always produce the same groups, although the numeric IDs assigned to them may differ between PDAL versions."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** `filters.cluster` links any two points closer than `tolerance` and writes a `ClusterID` per connected group. Set `tolerance` to two to three times the median point spacing, `min_points` to the smallest object you care about, `max_points` to catch merged blocks, keep `is3d: true` unless you want plan-view footprints, and restrict it with a `where` clause so ground never links everything together.

## Context and Motivation

This guide is part of [Point Cloud Segmentation with PDAL](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/). Euclidean segmentation is the simplest grouping rule there is: points belong together if you can walk from one to the other in steps no longer than the tolerance. That simplicity is its strength. It is fast, deterministic, has essentially one parameter, and does exactly what you expect on well-separated objects — parked cars on an empty car park, buildings with gardens between them, poles along a road.

Its weakness is equally simple: any chain of points closer than the tolerance joins two objects, however thin. A hedge touching a house, a branch overhanging a roof, or a single noise return between two cars is enough. Most of the craft is in what you feed the stage, not in the stage itself.

<svg viewBox="40 36 620 146" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Points linked by edges shorter than the tolerance forming two connected groups" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Connected by short steps</title>
  <desc>Two groups of points with edges drawn between every pair closer than the tolerance. Within each group, edges connect every point to the rest. Between the groups, the shortest gap is longer than the tolerance, so no edge crosses and the groups receive ClusterID 1 and 2. A scale bar shows the tolerance length.</desc>
  <rect x="40" y="36" width="620" height="146" fill="var(--dg-bg)" rx="10"/>
  <g stroke="var(--dg-a)" stroke-width="1.2"><line x1="80" y1="80" x2="120" y2="60"/><line x1="120" y1="60" x2="160" y2="84"/><line x1="80" y1="80" x2="110" y2="116"/><line x1="110" y1="116" x2="160" y2="84"/><line x1="110" y1="116" x2="150" y2="140"/><line x1="160" y1="84" x2="200" y2="110"/><line x1="150" y1="140" x2="200" y2="110"/></g>
  <g fill="var(--dg-a)"><circle cx="80" cy="80" r="4"/><circle cx="120" cy="60" r="4"/><circle cx="160" cy="84" r="4"/><circle cx="110" cy="116" r="4"/><circle cx="150" cy="140" r="4"/><circle cx="200" cy="110" r="4"/></g>
  <g stroke="var(--dg-c)" stroke-width="1.2"><line x1="400" y1="70" x2="440" y2="90"/><line x1="440" y1="90" x2="480" y2="66"/><line x1="440" y1="90" x2="430" y2="130"/><line x1="430" y1="130" x2="474" y2="140"/><line x1="480" y1="66" x2="516" y2="96"/><line x1="474" y1="140" x2="516" y2="96"/></g>
  <g fill="var(--dg-c)"><circle cx="400" cy="70" r="4"/><circle cx="440" cy="90" r="4"/><circle cx="480" cy="66" r="4"/><circle cx="430" cy="130" r="4"/><circle cx="474" cy="140" r="4"/><circle cx="516" cy="96" r="4"/></g>
  <line x1="200" y1="110" x2="400" y2="70" stroke="var(--dg-line-soft)" stroke-width="1.2" stroke-dasharray="4 4"/>
  <text x="300" y="80" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">gap &gt; tolerance: no link</text>
  <text x="140" y="172" text-anchor="middle" font-size="10.5" fill="var(--dg-a)">ClusterID 1</text>
  <text x="458" y="172" text-anchor="middle" font-size="10.5" fill="var(--dg-c)">ClusterID 2</text>
  <line x1="580" y1="150" x2="630" y2="150" stroke="var(--dg-text)" stroke-width="2"/>
  <text x="605" y="170" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">tolerance</text>
</svg>

## Prerequisites and Assumptions

- PDAL 2.x with `filters.cluster`; `max_points` and `is3d` are available in current releases (`pdal --options filters.cluster` lists them).
- A projected CRS in metres.
- An idea of median point spacing on the objects to segment — for airborne data, roughly `1/sqrt(density)`, so 0.3 m at 10 pts/m².

## Step-by-Step Implementation

### Step 1 — Restrict to candidate points

Drop ground and noise, and cut to a height band, so that the terrain cannot connect objects. Either filter them out, or use a `where` clause on the cluster stage to keep every point in the output.

### Step 2 — Set tolerance from spacing

Start at 2.5 × median spacing. Too small fragments objects along sparse edges; too large merges neighbours.

### Step 3 — Set size guards

`min_points` relabels small groups to 0; `max_points` relabels oversized groups to 0. Both keep the object table clean and make failures visible.

### Step 4 — Choose 2D or 3D

With `is3d: true`, distance includes Z. With `false`, only plan position matters, which merges stacked objects — useful for footprints, harmful for bridges over roads.

### Step 5 — Run and inspect the label distribution

Count points per `ClusterID`, check how many are 0, and look at the largest groups first.

## Complete Working Example

```json
{
  "pipeline": [
    { "type": "readers.las", "filename": "carpark_03.laz" },
    { "type": "filters.hag_nn", "count": 2 },
    {
      "type": "filters.cluster",
      "tolerance": 0.6,
      "min_points": 40,
      "max_points": 20000,
      "is3d": true,
      "where": "HeightAboveGround > 0.4 && HeightAboveGround < 3.5 && Classification != 2"
    },
    {
      "type": "writers.las",
      "filename": "carpark_03_vehicles.laz",
      "minor_version": 4,
      "dataformat_id": 6,
      "extra_dims": "ClusterID=int64,HeightAboveGround=float"
    }
  ]
}
```

And the Python that summarises the result:

```python
"""Run the vehicle segmentation and summarise groups."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import pdal

spec = json.loads(Path("cluster_vehicles.json").read_text())
p = pdal.Pipeline(json.dumps(spec))
p.execute()
a = p.arrays[0]

df = pd.DataFrame({"x": a["X"], "y": a["Y"], "h": a["HeightAboveGround"], "id": a["ClusterID"]})
unassigned = int((df.id == 0).sum())
groups = (df[df.id > 0].groupby("id")
          .agg(n=("x", "size"), dx=("x", np.ptp), dy=("y", np.ptp), h=("h", "max")))
groups["length"] = groups[["dx", "dy"]].max(axis=1)
vehicles = groups[groups.length.between(3.0, 6.5) & groups.h.between(1.2, 2.2)]
print(f"{len(groups)} groups, {unassigned} unassigned points, {len(vehicles)} car-sized groups")
```

The example segments parked cars: objects between 0.4 and 3.5 m above ground, then kept if they are 3 to 6.5 m long and 1.2 to 2.2 m tall. The same shape — restrict, cluster, filter by extent — works for any discrete object class.

## Key Parameter Table

| Option | Type | Default | Guidance |
|---|---|---|---|
| `tolerance` | float | 1.0 | 2–3 × median spacing; the single most important setting |
| `min_points` | int | 1 | Smallest meaningful object; always raise from the default |
| `max_points` | int | unlimited | Largest plausible object; oversized groups become 0 |
| `is3d` | bool | true | false for plan-view grouping only |
| `where` | expression | none | Segment a subset while keeping all points in the output |

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Number of car-sized groups found as tolerance increases" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Tolerance on a car park</title>
  <desc>Bars showing car-sized groups found at five tolerances on a car park with 64 parked cars. At 0.2 metres only 21 are found because cars fragment. At 0.4 metres 55. At 0.6 metres 63. At 1.0 metre 49 because adjacent cars merge. At 1.5 metres 22.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="170" x2="680" y2="170" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="80" y1="44" x2="680" y2="44" stroke="var(--dg-d)" stroke-width="1.2" stroke-dasharray="5 4"/>
  <text x="676" y="38" text-anchor="end" font-size="10.5" fill="var(--dg-d)">64 cars present</text>
  <rect x="110" y="129" width="70" height="41" fill="var(--dg-line-soft)"/>
  <rect x="220" y="62" width="70" height="108" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.1"/>
  <rect x="330" y="46" width="70" height="124" fill="var(--dg-a)"/>
  <rect x="440" y="75" width="70" height="95" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.1"/>
  <rect x="550" y="127" width="70" height="43" fill="var(--dg-line-soft)"/>
  <text x="145" y="122" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">21</text>
  <text x="255" y="56" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">55</text>
  <text x="365" y="62" text-anchor="middle" font-size="10.5" fill="var(--dg-bg)">63</text>
  <text x="475" y="68" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">49</text>
  <text x="585" y="120" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">22</text>
  <text x="145" y="188" text-anchor="middle" font-size="10" fill="var(--dg-muted)">0.2 m</text>
  <text x="255" y="188" text-anchor="middle" font-size="10" fill="var(--dg-muted)">0.4 m</text>
  <text x="365" y="188" text-anchor="middle" font-size="10" fill="var(--dg-muted)">0.6 m</text>
  <text x="475" y="188" text-anchor="middle" font-size="10" fill="var(--dg-muted)">1.0 m</text>
  <text x="585" y="188" text-anchor="middle" font-size="10" fill="var(--dg-muted)">1.5 m</text>
  <text x="380" y="204" text-anchor="middle" font-size="10" fill="var(--dg-muted)">illustrative, 25 pts/m² (spacing about 0.2 m)</text>
</svg>

## Verification

- **Label accounting.** Groups plus unassigned must equal the point count; segmentation never adds or removes points.
- **Size histogram.** Plot points per group on a log axis. A healthy result shows many small groups and a distinct population at the object size you expect.
- **Stability test.** Rerun at 0.8× and 1.2× the chosen tolerance. The number of object-sized groups should change little; if it swings, you are on a steep part of the curve above.

```python
ids = a["ClusterID"].astype(np.int64)
assert (ids >= 0).all(), "filters.cluster never writes negative labels"
sizes = np.bincount(ids)[1:]
sizes = sizes[sizes > 0]
print(f"groups: {len(sizes)}, median size {np.median(sizes):.0f}, largest {sizes.max()}")
```

## Gotchas and Edge Cases

**Default `min_points` of 1.** Every isolated point becomes its own group. The object table fills with thousands of one-point groups that slow every aggregation. Always set it.

**Ground left in the input.** One ground point between two objects connects them, and the whole tile becomes one group, which `max_points` then relabels to 0 — leaving you with apparently nothing. If almost everything is 0, check the restriction step first.

**Overlap stripes.** Where flightlines overlap, density doubles and spacing halves, so the same tolerance links more readily there. It rarely matters for well-separated objects, but it does for touching ones; use DBSCAN or a spacing-aware tolerance in such areas.

<svg viewBox="0 0 740 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A single ground point bridging two cars into one group" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>One stray point is enough</title>
  <desc>Two car-shaped point groups side by side, 0.9 metres apart. A single ground return left in the input sits between them, within the tolerance of both. Edges connect it to each car, so both cars and the ground point become one group. With ground excluded, the same cars form two groups.</desc>
  <rect x="0" y="0" width="740" height="190" fill="var(--dg-bg)" rx="10"/>
  <rect x="120" y="70" width="190" height="60" rx="18" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.4"/>
  <rect x="430" y="70" width="190" height="60" rx="18" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.4"/>
  <circle cx="370" cy="140" r="5" fill="var(--dg-e)"/>
  <line x1="310" y1="120" x2="366" y2="138" stroke="var(--dg-e)" stroke-width="1.4"/>
  <line x1="374" y1="138" x2="430" y2="120" stroke="var(--dg-e)" stroke-width="1.4"/>
  <text x="370" y="164" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">ground return inside tolerance of both</text>
  <text x="215" y="104" text-anchor="middle" font-size="11" fill="var(--dg-text)">car A</text>
  <text x="525" y="104" text-anchor="middle" font-size="11" fill="var(--dg-text)">car B</text>
  <text x="370" y="40" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">result: one group — exclude ground and it becomes two</text>
</svg>

**`where` versus removal.** A `where` clause keeps excluded points in the output with `ClusterID` 0, which is what you want when writing classifications back. Removing points with `filters.range` is faster for analysis-only runs.

## Frequently Asked Questions

**What tolerance should I use for filters.cluster?**

Start at two to three times the median spacing between neighbouring points on your objects, then check that the number of object-sized groups is stable when you change the tolerance by twenty percent either way.

**Why is ClusterID zero for many points?**

Zero means unassigned: the point was in a group smaller than min_points or larger than max_points, or it was excluded by a where clause. Count the zeros and look at why they occur before tuning anything else.

**Should is3d be true or false?**

True in almost every case, because objects separated vertically, such as a bridge over a road, should stay apart. Use false when you deliberately want everything above one footprint merged, such as all storeys and balconies of one building.

**Is filters.cluster deterministic?**

Yes. Connected components do not depend on processing order, so the same input and tolerance always produce the same groups, although the numeric IDs assigned to them may differ between PDAL versions.

## Related

- [Point Cloud Segmentation](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/) — choosing between Euclidean and density-based methods
- [DBSCAN Segmentation with filters.dbscan](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/dbscan-segmentation-with-filters-dbscan/) — when thin bridges and clutter need handling
- [Extracting Objects from Segment Labels](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/extracting-objects-from-segment-labels/) — the object table and per-object files
- [Building Extraction from LiDAR](https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/) — Euclidean segmentation of roofs
- [Filtering Points with filters.expression](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/filtering-points-with-filters-expression/) — writing the restriction expressions
