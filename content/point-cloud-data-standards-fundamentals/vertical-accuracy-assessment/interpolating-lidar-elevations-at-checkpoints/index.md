---
title: "Interpolating LiDAR Elevations at Checkpoints"
description: "Get the LiDAR elevation at a surveyed checkpoint the way accuracy standards intend: a TIN of nearby ground returns with barycentric interpolation, handling checkpoints outside the triangulation, sparse ground, breaklines and slope, compared with IDW and raster lookups."
slug: "interpolating-lidar-elevations-at-checkpoints"
type: "howto"
breadcrumb: "Interpolating at Checkpoints"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Interpolating LiDAR Elevations at Checkpoints",
      "description": "Get the LiDAR elevation at a surveyed checkpoint the way accuracy standards intend: a TIN of nearby ground returns with barycentric interpolation, handling checkpoints outside the triangulation, sparse ground, breaklines and slope, compared with IDW and raster lookups.",
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
          "name": "Point Cloud Data Standards & Fundamentals",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Vertical Accuracy Assessment",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Interpolating at Checkpoints",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/interpolating-lidar-elevations-at-checkpoints/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Interpolate LiDAR ground elevations at checkpoint locations",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Gather local ground",
          "text": "Crop class 2 points to a square of about 3 m around the checkpoint (more under canopy, where ground is sparse)."
        },
        {
          "@type": "HowToStep",
          "name": "Triangulate",
          "text": "scipy.spatial.Delaunay on the X, Y of those points. Local triangulations are fast and avoid the numerical trouble of triangulating millions of points."
        },
        {
          "@type": "HowToStep",
          "name": "Locate and interpolate",
          "text": "find_simplex returns the triangle containing the checkpoint; barycentric weights from Delaunay.transform interpolate Z linearly."
        },
        {
          "@type": "HowToStep",
          "name": "Apply rejection rules",
          "text": "Reject if the checkpoint is outside the hull, if the triangle's longest edge exceeds about three times the nominal spacing, or if fewer than a minimum number of ground points were found."
        },
        {
          "@type": "HowToStep",
          "name": "Record diagnostics",
          "text": "Store the triangle edge length, number of points and distance to the nearest return with each result, so reviewers can see how well supported each value is."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How should LiDAR elevation be interpolated at a checkpoint?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "From a triangulated irregular network of ground-classified returns around the checkpoint, interpolating linearly within the triangle that contains it. This estimates the surface at the checkpoint's exact position without horizontal offsets or raster smoothing."
          }
        },
        {
          "@type": "Question",
          "name": "Why not use the nearest LiDAR point?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The nearest return can be a metre or more away horizontally. On any slope, that horizontal distance creates a vertical difference that is not LiDAR error, inflating RMSEz."
          }
        },
        {
          "@type": "Question",
          "name": "When should a checkpoint be rejected?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "When too few ground returns surround it, when it lies outside the local triangulation, or when the enclosing triangle is much larger than the nominal point spacing. Report rejected checkpoints and the reason rather than silently dropping them."
          }
        },
        {
          "@type": "Question",
          "name": "Can I use a DTM raster instead?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "For assessing the DTM product, yes. For assessing the point cloud itself, a TIN of ground points is preferred because the raster adds its own interpolation error."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Collect class 2 returns within a few metres of each checkpoint, build a Delaunay triangulation with SciPy, find the triangle containing the checkpoint and interpolate Z with barycentric weights. Reject the checkpoint (and say so) if it falls outside the triangulation or if the enclosing triangle is larger than a few times the nominal point spacing — the surface there is an extrapolation, not a measurement.

## Context and Motivation

This guide is part of [Vertical Accuracy Assessment for LiDAR](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/). A checkpoint almost never coincides with a LiDAR return, so an accuracy assessment has to estimate what the LiDAR says the ground elevation is at the checkpoint's exact horizontal position. The method matters more than people expect. Nearest-neighbour lookup mixes horizontal offset into vertical error. A DEM lookup adds the DEM's own interpolation and cell-size smoothing. Inverse-distance weighting pulls toward whichever returns happen to be clustered on one side. A triangulated irregular network of ground returns, interpolated linearly inside the enclosing triangle, is what accuracy standards describe and what gives the most defensible number.

The implementation is short; the value is in the rejection rules, which keep a handful of badly supported checkpoints from contaminating the statistic.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A checkpoint inside a triangle of ground returns with barycentric weights" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Barycentric interpolation inside one triangle</title>
  <desc>Plan view of ground returns triangulated into a mesh. A checkpoint sits inside one triangle whose vertices have elevations 212.41, 212.58 and 212.36 metres. Lines from the checkpoint to each vertex show the barycentric weights 0.52, 0.31 and 0.17, which combine the three elevations into the interpolated value 212.45 metres.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <g stroke="var(--dg-line-soft)" stroke-width="1" fill="none">
    <path d="M60 60 L180 40 L140 150 Z"/><path d="M180 40 L300 70 L140 150 Z"/><path d="M300 70 L260 190 L140 150 Z"/><path d="M60 60 L140 150 L40 180 Z"/><path d="M140 150 L260 190 L120 200 Z"/>
  </g>
  <path d="M180 40 L300 70 L140 150 Z" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.6"/>
  <g fill="var(--dg-d)"><circle cx="60" cy="60" r="4"/><circle cx="180" cy="40" r="4"/><circle cx="300" cy="70" r="4"/><circle cx="140" cy="150" r="4"/><circle cx="260" cy="190" r="4"/><circle cx="40" cy="180" r="4"/><circle cx="120" cy="200" r="4"/></g>
  <path d="M200 88 L208 74 L216 88 Z" fill="var(--dg-c)"/>
  <g stroke="var(--dg-c)" stroke-width="1" stroke-dasharray="3 3"><line x1="208" y1="84" x2="180" y2="40"/><line x1="208" y1="84" x2="300" y2="70"/><line x1="208" y1="84" x2="140" y2="150"/></g>
  <text x="360" y="50" font-size="10.5" fill="var(--dg-text)">vertex A 212.41 m · weight 0.52</text>
  <text x="360" y="74" font-size="10.5" fill="var(--dg-text)">vertex B 212.58 m · weight 0.31</text>
  <text x="360" y="98" font-size="10.5" fill="var(--dg-text)">vertex C 212.36 m · weight 0.17</text>
  <line x1="360" y1="112" x2="700" y2="112" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="360" y="134" font-size="11" fill="var(--dg-text)">Z at checkpoint = Σ weight × Z = 212.45 m</text>
  <text x="360" y="176" font-size="10.5" fill="var(--dg-muted)">weights are the checkpoint's barycentric coordinates;</text>
  <text x="360" y="194" font-size="10.5" fill="var(--dg-muted)">they sum to one and are all positive inside the triangle</text>
</svg>

## Prerequisites and Assumptions

- Ground-classified LiDAR (class 2) in the same horizontal and vertical CRS as the checkpoints.
- Checkpoint coordinates with enough precision that their horizontal position is known to a few centimetres.
- Python with NumPy, SciPy and PDAL bindings.
- Nominal point spacing of the ground returns, used to judge triangle size.

## Step-by-Step Implementation

### Step 1 — Gather local ground

Crop class 2 points to a square of about 3 m around the checkpoint (more under canopy, where ground is sparse).

### Step 2 — Triangulate

`scipy.spatial.Delaunay` on the X, Y of those points. Local triangulations are fast and avoid the numerical trouble of triangulating millions of points.

### Step 3 — Locate and interpolate

`find_simplex` returns the triangle containing the checkpoint; barycentric weights from `Delaunay.transform` interpolate Z linearly.

### Step 4 — Apply rejection rules

Reject if the checkpoint is outside the hull, if the triangle's longest edge exceeds about three times the nominal spacing, or if fewer than a minimum number of ground points were found.

### Step 5 — Record diagnostics

Store the triangle edge length, number of points and distance to the nearest return with each result, so reviewers can see how well supported each value is.

## Complete Working Example

```python
"""TIN interpolation of LiDAR ground elevation at a checkpoint, with rejection rules."""
from __future__ import annotations

import json
from dataclasses import dataclass

import numpy as np
import pdal
from scipy.spatial import Delaunay


@dataclass
class Interp:
    z: float
    status: str
    n_points: int
    max_edge_m: float
    nearest_m: float


def local_ground(tile: str, x: float, y: float, r: float) -> np.ndarray:
    p = pdal.Pipeline(json.dumps({"pipeline": [
        tile,
        {"type": "filters.crop", "bounds": f"([{x - r}, {x + r}], [{y - r}, {y + r}])"},
        {"type": "filters.range", "limits": "Classification[2:2]"},
    ]}))
    p.execute()
    return p.arrays[0]


def interpolate(pts: np.ndarray, x: float, y: float, spacing: float,
                min_points: int = 6, edge_factor: float = 3.0) -> Interp:
    n = len(pts)
    if n < min_points:
        return Interp(np.nan, f"too few ground points ({n})", n, np.nan, np.nan)
    xy = np.column_stack([pts["X"], pts["Y"]])
    nearest = float(np.min(np.hypot(xy[:, 0] - x, xy[:, 1] - y)))
    tri = Delaunay(xy)
    s = int(tri.find_simplex(np.array([[x, y]]))[0])
    if s < 0:
        return Interp(np.nan, "outside triangulation", n, np.nan, nearest)
    v = tri.simplices[s]
    corners = xy[v]
    edges = np.linalg.norm(corners - np.roll(corners, 1, axis=0), axis=1)
    max_edge = float(edges.max())
    if max_edge > edge_factor * spacing:
        return Interp(np.nan, f"triangle too large ({max_edge:.2f} m)", n, max_edge, nearest)
    T = tri.transform[s]
    b = T[:2] @ (np.array([x, y]) - T[2])
    w = np.append(b, 1.0 - b.sum())
    return Interp(float(w @ pts["Z"][v]), "ok", n, max_edge, nearest)


if __name__ == "__main__":
    cp = {"id": "CP-017", "x": 431522.314, "y": 4471380.902, "z": 212.418}
    g = local_ground("tiles/t_0431.laz", cp["x"], cp["y"], r=3.0)
    res = interpolate(g, cp["x"], cp["y"], spacing=0.35)
    print(cp["id"], res, "dz =", None if np.isnan(res.z) else round(res.z - cp["z"], 3))
```

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Three methods estimating elevation at a checkpoint on a slope" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Why TIN beats nearest neighbour on slopes</title>
  <desc>A profile of sloping ground with returns at irregular spacing. A checkpoint lies between two returns. The TIN estimate lies on the line between them, matching the ground. The nearest-neighbour estimate takes the elevation of the closest return, which is uphill, producing a vertical error of 0.14 metres. An inverse-distance estimate using a cluster of returns on one side is pulled toward them.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <line x1="40" y1="170" x2="700" y2="40" stroke="var(--dg-d)" stroke-width="1.6"/>
  <g fill="var(--dg-d)"><circle cx="100" cy="158" r="4"/><circle cx="130" cy="152" r="4"/><circle cx="150" cy="148" r="4"/><circle cx="420" cy="95" r="4"/><circle cx="600" cy="60" r="4"/></g>
  <line x1="340" y1="30" x2="340" y2="180" stroke="var(--dg-line-soft)" stroke-width="1" stroke-dasharray="4 3"/>
  <circle cx="340" cy="111" r="5" fill="var(--dg-a)"/>
  <text x="330" y="126" text-anchor="end" font-size="10.5" fill="var(--dg-a)">TIN: on the surface</text>
  <circle cx="340" cy="95" r="5" fill="var(--dg-e)"/>
  <text x="350" y="86" font-size="10.5" fill="var(--dg-e)">nearest return: +0.14 m</text>
  <circle cx="340" cy="140" r="5" fill="var(--dg-c)"/>
  <text x="350" y="152" font-size="10.5" fill="var(--dg-c)">IDW: pulled toward the cluster</text>
  <text x="40" y="192" font-size="10.5" fill="var(--dg-muted)">the checkpoint's true ground elevation is where the dashed line meets the slope</text>
</svg>

## Key Parameter Table

| Parameter | Type | Default | Guidance |
|---|---|---|---|
| search half-width `r` | float, m | 3.0 | 2–3 × spacing minimum; 5–10 m under dense canopy |
| `min_points` | int | 6 | Enough for a local TIN with a few triangles |
| `spacing` | float, m | nominal ground spacing | Sets the triangle-size rejection threshold |
| `edge_factor` | float | 3.0 | Longest edge allowed as a multiple of spacing |
| method | TIN | — | Nearest neighbour and raster lookups add their own error |

## Verification

- **Synthetic plane.** Generate points on an inclined plane, add a checkpoint on the plane, and confirm interpolation returns the exact plane elevation. Nearest neighbour will not.
- **Diagnostics distribution.** Plot `max_edge_m` for all accepted checkpoints; a long tail indicates sparse ground that the rejection threshold might be allowing through.
- **Sensitivity to radius.** Rerun with twice the search radius. Accepted checkpoints should not change elevation; if they do, the local TIN was on the hull edge.

```python
rng = np.random.default_rng(3)
xs, ys = rng.uniform(0, 6, 60), rng.uniform(0, 6, 60)
plane = np.zeros(60, dtype=[("X", "f8"), ("Y", "f8"), ("Z", "f8")])
plane["X"], plane["Y"], plane["Z"] = xs, ys, 100 + 0.3 * xs - 0.1 * ys
r = interpolate(plane, 3.0, 3.0, spacing=0.8)
assert abs(r.z - (100 + 0.3 * 3.0 - 0.1 * 3.0)) < 1e-9
```

## Gotchas and Edge Cases

**Breaklines near the checkpoint.** A checkpoint near a kerb, ditch or wall can land in a triangle spanning the break, averaging two surfaces. Checkpoints should be sited away from breaklines; if one is not, flag it rather than interpolating across the edge.

**Misclassified ground.** A few low vegetation or building-edge returns in class 2 near a checkpoint bias the TIN. Inspecting the local points for a sample of checkpoints — especially outliers — often reveals classification issues worth reporting.

**Checkpoints on the hull.** Where a checkpoint sits near the edge of the local point set, the enclosing triangle is long and thin. The edge-length test catches most of these; increasing the search radius resolves the rest.

<svg viewBox="90 40 640 140" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A well-supported checkpoint and one in an oversized triangle" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>When the triangle is too big</title>
  <desc>Left: a checkpoint in a small, compact triangle with edges under one metre, accepted. Right: a checkpoint in a gap under dense canopy, enclosed by a long thin triangle with a 4.1 metre edge, more than three times the nominal spacing, rejected as an extrapolation.</desc>
  <rect x="90" y="40" width="640" height="140" fill="var(--dg-bg)" rx="10"/>
  <path d="M120 70 L200 60 L170 130 Z" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.5"/>
  <path d="M160 94 L166 82 L172 94 Z" fill="var(--dg-c)"/>
  <text x="170" y="160" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">edges &lt; 1 m: accepted</text>
  <path d="M420 60 L700 80 L440 130 Z" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.5"/>
  <path d="M520 98 L526 86 L532 98 Z" fill="var(--dg-c)"/>
  <text x="560" y="160" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">4.1 m edge &gt; 3 × spacing: rejected</text>
</svg>

**Rasters as a shortcut.** Sampling a 1 m DTM at checkpoints is fine for assessing the DTM deliverable, but it measures the DTM's interpolation and smoothing too. Report point-cloud accuracy from the TIN and DEM accuracy from the raster, labelled as such.

## Frequently Asked Questions

**How should LiDAR elevation be interpolated at a checkpoint?**

From a triangulated irregular network of ground-classified returns around the checkpoint, interpolating linearly within the triangle that contains it. This estimates the surface at the checkpoint's exact position without horizontal offsets or raster smoothing.

**Why not use the nearest LiDAR point?**

The nearest return can be a metre or more away horizontally. On any slope, that horizontal distance creates a vertical difference that is not LiDAR error, inflating RMSEz.

**When should a checkpoint be rejected?**

When too few ground returns surround it, when it lies outside the local triangulation, or when the enclosing triangle is much larger than the nominal point spacing. Report rejected checkpoints and the reason rather than silently dropping them.

**Can I use a DTM raster instead?**

For assessing the DTM product, yes. For assessing the point cloud itself, a TIN of ground points is preferred because the raster adds its own interpolation error.

## Related

- [Vertical Accuracy Assessment for LiDAR](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/) — where this step fits
- [Computing RMSEz Against Survey Checkpoints](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/computing-rmsez-against-survey-checkpoints/) — using the interpolated values
- [Measuring Swath-to-Swath Relative Accuracy](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/measuring-swath-to-swath-relative-accuracy/) — accuracy without checkpoints
- [IDW vs Mean Interpolation for DTM Gaps](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/idw-vs-mean-interpolation-for-dtm-gaps/) — interpolation choices for rasters
- [Measuring Ground Point Density Under Canopy](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/measuring-ground-point-density-under-canopy/) — why vegetated checkpoints lack support
