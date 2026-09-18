---
title: "Measuring Vegetation Clearance to Power Lines"
description: "Compute the 3D distance from every vegetation point to the nearest conductor with a SciPy k-d tree, densify fitted catenaries so gaps do not hide encroachments, and export violations as a GeoPackage for field crews."
slug: "measuring-vegetation-clearance-to-power-lines"
type: "howto"
breadcrumb: "Vegetation Clearance"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Measuring Vegetation Clearance to Power Lines",
      "description": "Compute the 3D distance from every vegetation point to the nearest conductor with a SciPy k-d tree, densify fitted catenaries so gaps do not hide encroachments, and export violations as a GeoPackage for field crews.",
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
          "name": "Vegetation Clearance",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/power-line-detection/measuring-vegetation-clearance-to-power-lines/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Measure vegetation clearance to power-line conductors from LiDAR",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Densify conductors",
          "text": "Evaluate each fitted catenary every 0.2 m along its span and map (s, z) back to (x, y, z) using the span's axis. If you have no fits, use the conductor points directly but accept that distances between returns are overestimated."
        },
        {
          "@type": "HowToStep",
          "name": "Load vegetation near the corridor",
          "text": "Read classes 3\u20135, cropped to the corridor buffer if one is known. Points far from any conductor cannot violate clearance and only cost query time."
        },
        {
          "@type": "HowToStep",
          "name": "Query nearest conductor distances",
          "text": "Build a cKDTree on the densified conductor samples and query each vegetation point with distance_upper_bound set a little above the clearance distance, which makes the query much faster because distant points return early."
        },
        {
          "@type": "HowToStep",
          "name": "Group violations into sites",
          "text": "Cluster flagged points in plan view with DBSCAN at a 2 m radius. Each cluster is one encroachment site \u2014 typically one tree or one hedge section."
        },
        {
          "@type": "HowToStep",
          "name": "Export for the field",
          "text": "Write one row per site with the span ID, the minimum distance, the number of points, the site centroid and a small polygon, to a GeoPackage the crew can load on a tablet."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Should clearance be measured in 3D or separately horizontally and vertically?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It depends on the specification. A single 3D distance is simplest and conservative for many cases, but some rules define different horizontal and vertical clearances. Compute both components from the nearest-point vector if your specification needs them."
          }
        },
        {
          "@type": "Question",
          "name": "Why densify the fitted curve instead of using conductor points?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Conductor returns are often more than a metre apart. A branch between two returns is closer to the wire than to either return, so distances to returns overestimate clearance. The densified curve represents the wire everywhere along the span."
          }
        },
        {
          "@type": "Question",
          "name": "How do I handle spans with no catenary fit?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Use the conductor points directly and flag those sites as lower confidence. Also report the span as unfitted so it can be re-flown or checked manually."
          }
        },
        {
          "@type": "Question",
          "name": "What point density is needed for clearance work?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Dense enough to capture both the wire and the outer branches of crowns near it \u2014 typically corridor surveys at 30 points per square metre or more. Sparse data underestimates how far crowns reach toward the wire."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Densify each span's fitted catenary to a point every 0.2 m, build a `scipy.spatial.cKDTree` on those conductor samples, query every vegetation point (classes 3–5) for its nearest conductor distance, and flag points inside your utility's clearance distance — then cluster flagged points into encroachment sites with a span ID, minimum distance and location for the field crew.

## Context and Motivation

This guide is part of [Power Line Detection in LiDAR Point Clouds](https://www.pythonlidar.com/lidar-classification-feature-extraction/power-line-detection/). Vegetation clearance is the product that justifies most utility LiDAR flights: regulators and insurers require utilities to keep trees out of a clearance zone around conductors, and walking or driving every kilometre of line is slow and misses what cannot be seen from the ground. LiDAR measures the three-dimensional distance from every branch to every wire across the whole network in one pass.

Two details separate a trustworthy clearance product from a misleading one. First, distance must be measured to the wire, not to the sparse wire returns — a branch can sit between two returns 1.5 m apart and appear farther from the conductor than it is. Densifying the fitted catenary fixes that. Second, the output must be sites, not points: a field crew needs one record per tree with a location and the worst distance, not ten thousand flagged returns.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A clearance zone around a conductor with encroaching vegetation points highlighted" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>The clearance zone in cross-section</title>
  <desc>A cross-section looking along a power line. The conductor is a dot at the centre of a circular clearance zone of fixed radius. Tree crowns rise from below on both sides. Vegetation points inside the circle are highlighted as encroachments; points outside are ordinary vegetation. The shortest distance from the nearest encroaching point to the conductor is drawn and labelled.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <circle cx="370" cy="80" r="62" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.4" stroke-dasharray="6 4"/>
  <circle cx="370" cy="80" r="5" fill="var(--dg-c)"/>
  <text x="380" y="72" font-size="10.5" fill="var(--dg-text)">conductor</text>
  <ellipse cx="250" cy="170" rx="90" ry="60" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <ellipse cx="520" cy="180" rx="80" ry="40" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <g fill="var(--dg-e)"><circle cx="318" cy="120" r="3.2"/><circle cx="326" cy="128" r="3.2"/><circle cx="312" cy="132" r="3.2"/></g>
  <g fill="var(--dg-d)"><circle cx="230" cy="130" r="3"/><circle cx="260" cy="126" r="3"/><circle cx="290" cy="138" r="3"/><circle cx="500" cy="150" r="3"/><circle cx="540" cy="148" r="3"/></g>
  <line x1="370" y1="80" x2="320" y2="119" stroke="var(--dg-e)" stroke-width="1.6"/>
  <text x="300" y="98" text-anchor="end" font-size="10.5" fill="var(--dg-e)">3.1 m &lt; 4.0 m limit</text>
  <text x="470" y="40" font-size="10.5" fill="var(--dg-muted)">dashed circle: clearance distance</text>
  <text x="20" y="210" font-size="10.5" fill="var(--dg-muted)">distance is 3D — a branch beside the wire counts as much as one below it</text>
</svg>

## Prerequisites and Assumptions

- A classified tile with conductors in class 14 and vegetation in classes 3, 4 and 5.
- Catenary fits per span from [fitting catenary curves to conductor points](https://www.pythonlidar.com/lidar-classification-feature-extraction/power-line-detection/fitting-catenary-curves-to-conductor-points/), or at least span groups of conductor points.
- Python with NumPy, SciPy, pandas and GeoPandas; PDAL bindings to read the tile.
- The clearance distance your utility or regulator specifies. It varies with voltage, jurisdiction and conductor temperature; this guide uses 4.0 m as a placeholder, not a recommendation.

## Step-by-Step Implementation

### Step 1 — Densify conductors

Evaluate each fitted catenary every 0.2 m along its span and map `(s, z)` back to `(x, y, z)` using the span's axis. If you have no fits, use the conductor points directly but accept that distances between returns are overestimated.

### Step 2 — Load vegetation near the corridor

Read classes 3–5, cropped to the corridor buffer if one is known. Points far from any conductor cannot violate clearance and only cost query time.

### Step 3 — Query nearest conductor distances

Build a `cKDTree` on the densified conductor samples and query each vegetation point with `distance_upper_bound` set a little above the clearance distance, which makes the query much faster because distant points return early.

### Step 4 — Group violations into sites

Cluster flagged points in plan view with DBSCAN at a 2 m radius. Each cluster is one encroachment site — typically one tree or one hedge section.

### Step 5 — Export for the field

Write one row per site with the span ID, the minimum distance, the number of points, the site centroid and a small polygon, to a GeoPackage the crew can load on a tablet.

## Complete Working Example

```python
"""Vegetation clearance to fitted conductors, grouped into encroachment sites."""
from __future__ import annotations

import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import pdal
from scipy.spatial import cKDTree
from shapely.geometry import MultiPoint
from sklearn.cluster import DBSCAN

CLEARANCE_M = 4.0          # replace with your utility's specified distance


def densify(fits: pd.DataFrame, step: float = 0.2) -> tuple[np.ndarray, np.ndarray]:
    """fits: one row per span with a, s0, z0, cx, cy, ux, uy, s_min, s_max."""
    xyz, span_of = [], []
    for f in fits.itertuples():
        s = np.arange(f.s_min, f.s_max + step, step)
        z = f.z0 + f.a * (np.cosh((s - f.s0) / f.a) - 1.0)
        x = f.cx + s * f.ux
        y = f.cy + s * f.uy
        xyz.append(np.column_stack([x, y, z]))
        span_of.append(np.full(len(s), f.span))
    return np.vstack(xyz), np.concatenate(span_of)


def vegetation(src: Path) -> np.ndarray:
    p = pdal.Pipeline(json.dumps({"pipeline": [
        {"type": "readers.las", "filename": str(src)},
        {"type": "filters.range", "limits": "Classification[3:5]"},
    ]}))
    p.execute()
    return p.arrays[0]


def clearance_sites(src: Path, fits: pd.DataFrame, crs: str) -> gpd.GeoDataFrame:
    wire_xyz, wire_span = densify(fits)
    tree = cKDTree(wire_xyz)
    veg = vegetation(src)
    pts = np.column_stack([veg["X"], veg["Y"], veg["Z"]])
    dist, idx = tree.query(pts, k=1, distance_upper_bound=CLEARANCE_M + 1.0)
    bad = dist < CLEARANCE_M
    if not bad.any():
        return gpd.GeoDataFrame(columns=["span", "min_dist_m", "points", "geometry"], crs=crs)

    bad_pts, bad_dist, bad_span = pts[bad], dist[bad], wire_span[idx[bad]]
    labels = DBSCAN(eps=2.0, min_samples=3).fit_predict(bad_pts[:, :2])
    rows = []
    for lab in np.unique(labels):
        sel = labels == lab
        hull = MultiPoint(bad_pts[sel, :2]).convex_hull.buffer(0.5)
        rows.append({
            "site": int(lab),
            "span": int(np.bincount(bad_span[sel]).argmax()),
            "min_dist_m": round(float(bad_dist[sel].min()), 2),
            "points": int(sel.sum()),
            "max_height_m": round(float(bad_pts[sel, 2].max()), 2),
            "geometry": hull,
        })
    sites = gpd.GeoDataFrame(rows, crs=crs).sort_values("min_dist_m")
    return sites


if __name__ == "__main__":
    fits = pd.read_parquet("corridor_0082_fits.parquet")
    sites = clearance_sites(Path("corridor_0082_wire.laz"), fits, "EPSG:6340")
    sites.to_file("corridor_0082_clearance.gpkg", layer="encroachments", driver="GPKG")
    print(sites.head(10).drop(columns="geometry").to_string(index=False))
```

DBSCAN labels isolated flagged points as `-1`; they are kept as their own site here because a single branch tip inside the zone is still a violation. If your specification allows ignoring isolated returns, drop label `-1` instead.

## Key Parameter Table

| Parameter | Type | Default | Guidance |
|---|---|---|---|
| `CLEARANCE_M` | float, m | 4.0 (placeholder) | Set from your utility's specification for the voltage class |
| densify `step` | float, m | 0.2 | Smaller than typical branch size; 0.5 m is too coarse for close work |
| `distance_upper_bound` | float, m | clearance + 1 | Speeds queries; larger lets you also report near misses |
| site DBSCAN `eps` | float, m | 2.0 | Plan-view grouping radius; roughly one crown radius |
| site `min_samples` | int | 3 | Lower keeps single-branch sites together |

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Distance to sparse returns overestimates clearance compared with a densified wire" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Why the wire must be densified</title>
  <desc>A wire drawn as a continuous curve with sparse returns every 1.5 metres. A branch point sits below the wire between two returns. Measured to the nearest return, the distance is 4.3 metres and passes. Measured to the densified curve directly above it, the distance is 3.7 metres and fails a 4 metre limit.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <path d="M40 60 C240 80 500 80 700 60" fill="none" stroke="var(--dg-a)" stroke-width="2"/>
  <g fill="var(--dg-c)"><circle cx="120" cy="69" r="4"/><circle cx="600" cy="69" r="4"/></g>
  <circle cx="360" cy="160" r="5" fill="var(--dg-d)"/>
  <line x1="360" y1="160" x2="120" y2="69" stroke="var(--dg-line)" stroke-width="1.3" stroke-dasharray="5 4"/>
  <line x1="360" y1="160" x2="360" y2="75" stroke="var(--dg-e)" stroke-width="1.8"/>
  <text x="220" y="136" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">to nearest return: 4.3 m, passes</text>
  <text x="370" y="120" font-size="10.5" fill="var(--dg-e)">to densified wire: 3.7 m, fails</text>
  <text x="372" y="180" font-size="10.5" fill="var(--dg-text)">branch</text>
  <text x="40" y="30" font-size="10.5" fill="var(--dg-muted)">dots: LiDAR returns on the conductor · line: fitted catenary sampled every 0.2 m</text>
</svg>

## Verification

- **Known encroachments.** If the utility has recent patrol records, check that every reported tree appears as a site. Missed sites usually mean the span was not detected or the vegetation was classified as something other than 3–5.
- **Distance distribution.** Plot a histogram of distances for all vegetation within 10 m of a conductor. It should be smooth; a hard cut or spike at one value means `distance_upper_bound` or a crop is clipping the data.
- **Spot measurement.** Pick two sites and measure the distance manually in a 3D viewer from the branch to the fitted curve.

```python
assert (sites.min_dist_m >= 0).all() and (sites.min_dist_m < CLEARANCE_M).all()
assert sites.span.isin(fits.span).all(), "site attached to an unknown span"
```

## Gotchas and Edge Cases

**Flight-time sag is not worst-case sag.** Conductors sag more when hot or iced. A site that clears at flight conditions can violate at maximum operating temperature. Many utilities rescale sag to a design condition before measuring; the point cloud provides the geometry, the engineering model provides the rescaling.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Conductor position at flight temperature and at maximum operating temperature above a tree" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>The same span, hot and cold</title>
  <desc>Two catenaries between the same attachment points. The upper solid curve is the conductor as flown on a cool morning, clearing a tree crown by 4.6 metres. The lower dashed curve is the same conductor rescaled to maximum operating temperature, sagging further and clearing the crown by only 2.9 metres, inside a 4 metre limit.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <path d="M60 30 C240 90 500 90 680 30" fill="none" stroke="var(--dg-a)" stroke-width="2"/>
  <path d="M60 30 C240 124 500 124 680 30" fill="none" stroke="var(--dg-e)" stroke-width="2" stroke-dasharray="6 4"/>
  <ellipse cx="370" cy="170" rx="80" ry="36" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <line x1="410" y1="75" x2="410" y2="136" stroke="var(--dg-a)" stroke-width="1.4"/>
  <line x1="330" y1="100" x2="330" y2="136" stroke="var(--dg-e)" stroke-width="1.4"/>
  <text x="418" y="108" font-size="10.5" fill="var(--dg-a)">flight: 4.6 m</text>
  <text x="322" y="122" text-anchor="end" font-size="10.5" fill="var(--dg-e)">max temperature: 2.9 m</text>
  <text x="560" y="60" font-size="10.5" fill="var(--dg-muted)">solid: as flown</text>
  <text x="560" y="96" font-size="10.5" fill="var(--dg-muted)">dashed: design condition</text>
</svg>

**Blowout.** Wind swings conductors sideways. Some specifications define a horizontal clearance larger than the vertical one to allow for it. If so, compute horizontal and vertical components of the distance separately rather than a single 3D distance.

**Misclassified vegetation.** Points in class 1 near the wire are invisible to this workflow. Check the classification near conductors; a tree left unclassified is a missed violation.

**Growth since the flight.** A site at 4.2 m in spring may be at 3.5 m by late summer. Report near misses — within a metre of the limit — as a watch list, which is why the query bound extends beyond the limit.

## Frequently Asked Questions

**Should clearance be measured in 3D or separately horizontally and vertically?**

It depends on the specification. A single 3D distance is simplest and conservative for many cases, but some rules define different horizontal and vertical clearances. Compute both components from the nearest-point vector if your specification needs them.

**Why densify the fitted curve instead of using conductor points?**

Conductor returns are often more than a metre apart. A branch between two returns is closer to the wire than to either return, so distances to returns overestimate clearance. The densified curve represents the wire everywhere along the span.

**How do I handle spans with no catenary fit?**

Use the conductor points directly and flag those sites as lower confidence. Also report the span as unfitted so it can be re-flown or checked manually.

**What point density is needed for clearance work?**

Dense enough to capture both the wire and the outer branches of crowns near it — typically corridor surveys at 30 points per square metre or more. Sparse data underestimates how far crowns reach toward the wire.

## Related

- [Fitting Catenary Curves to Conductor Points](https://www.pythonlidar.com/lidar-classification-feature-extraction/power-line-detection/fitting-catenary-curves-to-conductor-points/) — the curves densified here
- [Power Line Detection in LiDAR Point Clouds](https://www.pythonlidar.com/lidar-classification-feature-extraction/power-line-detection/) — the full detection workflow
- [Detecting Power Line Conductors with Linearity](https://www.pythonlidar.com/lidar-classification-feature-extraction/power-line-detection/detecting-power-line-conductors-with-linearity/) — finding the conductor points
- [Individual Tree Segmentation](https://www.pythonlidar.com/lidar-classification-feature-extraction/individual-tree-segmentation/) — attributing sites to individual trees
- [Canopy Height Models](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/) — a raster view of vegetation under the corridor
