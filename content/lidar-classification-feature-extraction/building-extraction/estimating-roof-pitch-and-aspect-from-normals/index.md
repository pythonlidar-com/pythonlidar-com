---
title: "Estimating Roof Pitch and Aspect from Normals"
description: "Compute per-plane roof pitch and aspect from PDAL filters.normal: split each roof into planes by normal direction, fit planes robustly, and report slope in degrees and compass aspect for solar and 3D modelling."
slug: "estimating-roof-pitch-and-aspect-from-normals"
type: "howto"
breadcrumb: "Roof Pitch and Aspect"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Estimating Roof Pitch and Aspect from Normals",
      "description": "Compute per-plane roof pitch and aspect from PDAL filters.normal: split each roof into planes by normal direction, fit planes robustly, and report slope in degrees and compass aspect for solar and 3D modelling.",
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
          "name": "Roof Pitch and Aspect",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/estimating-roof-pitch-and-aspect-from-normals/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Estimate roof pitch and aspect per roof plane from LiDAR normals",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Compute normals facing upward",
          "text": "always_up: true flips any normal with a negative Z component, so every roof normal points to the sky and aspects are not reversed at random."
        },
        {
          "@type": "HowToStep",
          "name": "Group each building's points by normal direction",
          "text": "Within one building, points on the same face share a normal. DBSCAN on the three normal components with a small eps (0.08, roughly 5 degrees) separates faces; add scaled X and Y if parallel faces on opposite sides of a courtyard must stay apart."
        },
        {
          "@type": "HowToStep",
          "name": "Fit a plane per face",
          "text": "The normal averaged over a face is decent, but an SVD plane fit over the face's coordinates is better, because it uses every point at once rather than averaging noisy local estimates."
        },
        {
          "@type": "HowToStep",
          "name": "Convert the normal to pitch and aspect",
          "text": "Pitch is the angle between the normal and vertical. Aspect is the compass bearing of the normal's horizontal component, measured clockwise from north."
        },
        {
          "@type": "HowToStep",
          "name": "Filter and report",
          "text": "Drop faces with fewer than about 30 points or an area under 4 m\u00b2, and flag faces with pitch under 5\u00b0 as flat, where aspect is meaningless."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why fit a plane instead of averaging point normals?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Point normals come from small neighbourhoods and are noisy, especially at edges. A plane fitted to all of a face's points uses far more information, gives a more accurate orientation and also provides residuals that tell you whether the face was segmented correctly."
          }
        },
        {
          "@type": "Question",
          "name": "What does always_up do in filters.normal?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The sign of an eigenvector is arbitrary, so half the normals could point into the roof. always_up flips any normal with a negative vertical component, making all roof normals point upward and aspects consistent."
          }
        },
        {
          "@type": "Question",
          "name": "How accurate is LiDAR roof pitch?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "On well-sampled faces, within one or two degrees of design pitch. Small faces, low density and dormers degrade it; report the point count per face so users can judge."
          }
        },
        {
          "@type": "Question",
          "name": "Can I compute solar potential from these values?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Pitch, aspect and area are the main geometric inputs to solar yield models. Shading from trees and neighbouring buildings also matters, which requires a DSM-based horizon analysis on top of these per-face values."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Run `filters.normal` with `always_up: true` on class-6 points, cluster each building's points by normal direction to separate roof planes, fit a plane to each group with a least-squares SVD, and report pitch as `degrees(arccos(|nz|))` and aspect as `degrees(atan2(nx, ny)) mod 360` — a south-facing 35° plane comes out as pitch 35, aspect 180.

## Context and Motivation

This guide is part of [Building Extraction from LiDAR](https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/). Solar potential studies, insurance roof surveys and LOD2 city models all need the same two numbers per roof face: how steep it is and which way it faces. A footprint with a single height cannot answer either. The surface normal at each roof point already encodes both, and PDAL computes it from the same kind of neighbourhood analysis used for planarity: the normal is the eigenvector of the smallest eigenvalue.

Per-point normals are noisy, though, and a roof has several faces. The useful output is per plane, which means grouping points into faces first and then estimating one normal per face from all of its points.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A roof plane with its normal vector decomposed into pitch and aspect" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Pitch and aspect from one vector</title>
  <desc>Left: a side view of a roof plane tilted at 35 degrees with a normal vector perpendicular to it; the angle between the normal and vertical equals the roof pitch. Right: a plan view compass with the horizontal component of the normal pointing south, giving an aspect of 180 degrees.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <text x="190" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">side view: pitch</text>
  <text x="560" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">plan view: aspect</text>
  <line x1="40" y1="190" x2="340" y2="190" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="80" y1="190" x2="300" y2="36" stroke="var(--dg-a)" stroke-width="3"/>
  <line x1="190" y1="113" x2="146" y2="50" stroke="var(--dg-c)" stroke-width="2"/>
  <line x1="190" y1="113" x2="190" y2="44" stroke="var(--dg-line)" stroke-width="1.2" stroke-dasharray="4 3"/>
  <text x="120" y="46" font-size="10.5" fill="var(--dg-c)">normal</text>
  <text x="196" y="56" font-size="10.5" fill="var(--dg-muted)">vertical</text>
  <text x="112" y="182" font-size="10.5" fill="var(--dg-text)">35°</text>
  <text x="172" y="78" font-size="10.5" fill="var(--dg-text)">35°</text>
  <circle cx="560" cy="115" r="72" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="560" y="36" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">N 0°</text>
  <text x="560" y="204" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">S 180°</text>
  <text x="644" y="119" font-size="10.5" fill="var(--dg-muted)">E 90°</text>
  <text x="476" y="119" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">W 270°</text>
  <line x1="560" y1="115" x2="560" y2="170" stroke="var(--dg-c)" stroke-width="2.4"/>
  <circle cx="560" cy="115" r="3.5" fill="var(--dg-c)"/>
  <text x="568" y="160" font-size="10.5" fill="var(--dg-c)">(nx, ny)</text>
</svg>

## Prerequisites and Assumptions

- Class-6 roof points, from the [building extraction workflow](https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/) or a vendor delivery.
- Building IDs per point, either `ClusterID` from segmentation or a footprint polygon burned in with `filters.overlay`.
- PDAL 2.4+ with `filters.normal`; Python with NumPy, pandas and scikit-learn (for DBSCAN on normal vectors).
- A projected CRS whose Y axis points to grid north. Aspect is measured relative to grid north; the difference from true north (grid convergence) is usually under two degrees but matters for precise solar work.

## Step-by-Step Implementation

### Step 1 — Compute normals facing upward

`always_up: true` flips any normal with a negative Z component, so every roof normal points to the sky and aspects are not reversed at random.

```json
{ "type": "filters.normal", "knn": 12, "always_up": true, "where": "Classification == 6" }
```

### Step 2 — Group each building's points by normal direction

Within one building, points on the same face share a normal. DBSCAN on the three normal components with a small `eps` (0.08, roughly 5 degrees) separates faces; add scaled X and Y if parallel faces on opposite sides of a courtyard must stay apart.

### Step 3 — Fit a plane per face

The normal averaged over a face is decent, but an SVD plane fit over the face's coordinates is better, because it uses every point at once rather than averaging noisy local estimates.

### Step 4 — Convert the normal to pitch and aspect

Pitch is the angle between the normal and vertical. Aspect is the compass bearing of the normal's horizontal component, measured clockwise from north.

### Step 5 — Filter and report

Drop faces with fewer than about 30 points or an area under 4 m², and flag faces with pitch under 5° as flat, where aspect is meaningless.

## Complete Working Example

```python
"""Per-face roof pitch and aspect from PDAL normals."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import pdal
from sklearn.cluster import DBSCAN


def roof_points(src: Path) -> np.ndarray:
    p = pdal.Pipeline(json.dumps({"pipeline": [
        {"type": "readers.las", "filename": str(src)},
        {"type": "filters.range", "limits": "Classification[6:6]"},
        {"type": "filters.normal", "knn": 12, "always_up": True},
        {"type": "filters.cluster", "tolerance": 1.0, "min_points": 50, "is3d": True},
    ]}))
    p.execute()
    return p.arrays[0]


def fit_plane(xyz: np.ndarray) -> np.ndarray:
    centred = xyz - xyz.mean(axis=0)
    _, _, vt = np.linalg.svd(centred, full_matrices=False)
    n = vt[2]
    return n if n[2] >= 0 else -n


def pitch_aspect(n: np.ndarray) -> tuple[float, float]:
    pitch = float(np.degrees(np.arccos(np.clip(abs(n[2]), 0.0, 1.0))))
    aspect = float(np.degrees(np.arctan2(n[0], n[1])) % 360.0)
    return pitch, aspect


def faces(points: np.ndarray, eps: float = 0.08, min_pts: int = 30) -> pd.DataFrame:
    rows = []
    for bid in np.unique(points["ClusterID"]):
        if bid == 0:
            continue
        b = points[points["ClusterID"] == bid]
        normals = np.column_stack([b["NormalX"], b["NormalY"], b["NormalZ"]])
        labels = DBSCAN(eps=eps, min_samples=10).fit_predict(normals)
        for face in np.unique(labels[labels >= 0]):
            sel = b[labels == face]
            if len(sel) < min_pts:
                continue
            xyz = np.column_stack([sel["X"], sel["Y"], sel["Z"]])
            n = fit_plane(xyz)
            pitch, aspect = pitch_aspect(n)
            # Plan area of the face from its points, corrected for slope.
            plan = len(sel) / max(len(b), 1) * np.ptp(b["X"]) * np.ptp(b["Y"])
            rows.append({"building": int(bid), "face": int(face), "points": len(sel),
                         "pitch_deg": round(pitch, 1),
                         "aspect_deg": round(aspect, 0) if pitch >= 5 else np.nan,
                         "flat": pitch < 5,
                         "area_m2": round(plan / max(np.cos(np.radians(pitch)), 0.2), 1)})
    return pd.DataFrame(rows)


if __name__ == "__main__":
    table = faces(roof_points(Path("tile_5840_2710_bldg.laz")))
    print(table.head(12).to_string(index=False))
```

Example output for a hip-roofed house and a flat-roofed garage:

```text
 building  face  points  pitch_deg  aspect_deg   flat  area_m2
       14     0     612       31.8       178.0  False     41.2
       14     1     588       32.4       358.0  False     39.6
       14     2     204       33.1        88.0  False     13.8
       14     3     197       32.6       269.0  False     13.1
       15     0     341        1.9         NaN   True     22.4
```

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Roof points of a hip roof separated into four faces by clustering their normals" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Four faces from four normal directions</title>
  <desc>Left: a plan view of a hip roof divided into two trapezoidal faces facing north and south and two triangular faces facing east and west, each coloured differently. Right: the same points plotted by their normal X and Y components, forming four tight clusters at the four compass directions, one per face.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <text x="190" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">plan view of the roof</text>
  <text x="550" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">normals, nx against ny</text>
  <path d="M60 50 L320 50 L260 115 L120 115 Z" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <path d="M60 180 L320 180 L260 115 L120 115 Z" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <path d="M60 50 L120 115 L60 180 Z" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <path d="M320 50 L260 115 L320 180 Z" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <line x1="430" y1="115" x2="670" y2="115" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <line x1="550" y1="40" x2="550" y2="190" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <g fill="var(--dg-a)"><circle cx="548" cy="62" r="3"/><circle cx="553" cy="58" r="3"/><circle cx="551" cy="66" r="3"/></g>
  <g fill="var(--dg-c)"><circle cx="548" cy="168" r="3"/><circle cx="553" cy="172" r="3"/><circle cx="550" cy="164" r="3"/></g>
  <g fill="var(--dg-d)"><circle cx="496" cy="113" r="3"/><circle cx="492" cy="118" r="3"/><circle cx="500" cy="117" r="3"/></g>
  <g fill="var(--dg-b)"><circle cx="604" cy="113" r="3"/><circle cx="608" cy="118" r="3"/><circle cx="600" cy="117" r="3"/></g>
  <text x="560" y="52" font-size="10" fill="var(--dg-muted)">north face</text>
  <text x="560" y="186" font-size="10" fill="var(--dg-muted)">south face</text>
  <text x="440" y="104" font-size="10" fill="var(--dg-muted)">west</text>
  <text x="620" y="104" font-size="10" fill="var(--dg-muted)">east</text>
</svg>

## Key Parameter Table

| Parameter | Type | Default | Guidance |
|---|---|---|---|
| `filters.normal` `knn` | int | 8 | 10–16 on roofs; larger smooths small dormers away |
| `always_up` | bool | true | Keep true for roofs so aspect is consistent |
| DBSCAN `eps` on normals | float | 0.08 | About 5° of normal difference; raise for noisy data |
| `min_samples` | int | 10 | Minimum points for a face core; filters edge noise |
| `min_pts` per face | int | 30 | Smaller faces give unstable plane fits |
| flat cutoff | float, ° | 5 | Below this, report aspect as undefined |

## Verification

- **Symmetric roofs agree.** Opposite faces of a gable or hip roof should have pitches within a degree or two and aspects 180° apart. Large asymmetry on a roof you know is symmetric points to a face that absorbed ridge or eave points.
- **Plane residuals.** The RMS distance of face points to the fitted plane should be a few centimetres. Residuals above 0.15 m mean two faces were merged.
- **Known roofs.** Check two or three roofs against drawings or a site visit; typical residential pitches of 25 to 45 degrees give an immediate sanity check.

```python
def plane_rms(xyz: np.ndarray, n: np.ndarray) -> float:
    d = (xyz - xyz.mean(axis=0)) @ n
    return float(np.sqrt(np.mean(d ** 2)))
```

## Gotchas and Edge Cases

**Aspect flips on near-flat roofs.** Tiny tilts from drainage falls produce arbitrary aspects. That is why aspect is reported only above 5 degrees of pitch.

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Aspect uncertainty rising sharply as roof pitch approaches zero" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Why flat roofs have no aspect</title>
  <desc>A curve of aspect uncertainty in degrees against roof pitch in degrees, for a fixed normal noise of about one degree. At 30 degrees pitch the aspect uncertainty is about 2 degrees. At 10 degrees it is about 6. Below 5 degrees it climbs steeply past 20 and toward 90 at 1 degree. The region below 5 degrees is shaded as the zone where aspect is reported as undefined.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <rect x="80" y="20" width="60" height="150" fill="var(--dg-e-soft)"/>
  <line x1="80" y1="170" x2="680" y2="170" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="80" y1="170" x2="80" y2="20" stroke="var(--dg-line)" stroke-width="1.3"/>
  <path d="M92 26 C104 90 122 128 140 142 C180 156 240 162 320 165 L680 167" fill="none" stroke="var(--dg-a)" stroke-width="2"/>
  <text x="110" y="44" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">undefined</text>
  <text x="80" y="188" text-anchor="middle" font-size="10" fill="var(--dg-muted)">0°</text>
  <text x="140" y="188" text-anchor="middle" font-size="10" fill="var(--dg-muted)">5°</text>
  <text x="320" y="188" text-anchor="middle" font-size="10" fill="var(--dg-muted)">20°</text>
  <text x="680" y="188" text-anchor="middle" font-size="10" fill="var(--dg-muted)">50°</text>
  <text x="380" y="204" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">roof pitch</text>
  <text x="330" y="120" font-size="10.5" fill="var(--dg-text)">aspect error ≈ normal error ÷ sin(pitch)</text>
</svg>

**Dormers join the main face.** A dormer with the same aspect but different pitch has a slightly different normal; with a generous `eps` it merges into the main face. Lower `eps`, or cluster on pitch and aspect angles instead of raw normal components.

**Grid north is not true north.** Aspect is measured against the projected CRS's Y axis. In UTM, grid convergence reaches a couple of degrees toward zone edges. For solar yield it rarely matters; for anything precise, correct with the convergence angle from pyproj.

**Walls contaminate faces.** Wall returns along eaves have near-horizontal normals and pitches near 90 degrees. Filter points with `NormalZ < 0.3` before clustering; no roof you care about is steeper than about 72 degrees.

## Frequently Asked Questions

**Why fit a plane instead of averaging point normals?**

Point normals come from small neighbourhoods and are noisy, especially at edges. A plane fitted to all of a face's points uses far more information, gives a more accurate orientation and also provides residuals that tell you whether the face was segmented correctly.

**What does always_up do in filters.normal?**

The sign of an eigenvector is arbitrary, so half the normals could point into the roof. always_up flips any normal with a negative vertical component, making all roof normals point upward and aspects consistent.

**How accurate is LiDAR roof pitch?**

On well-sampled faces, within one or two degrees of design pitch. Small faces, low density and dormers degrade it; report the point count per face so users can judge.

**Can I compute solar potential from these values?**

Pitch, aspect and area are the main geometric inputs to solar yield models. Shading from trees and neighbouring buildings also matters, which requires a DSM-based horizon analysis on top of these per-face values.

## Related

- [Building Extraction from LiDAR](https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/) — classifying the roof points used here
- [Detecting Planar Roofs with Covariance Features](https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/detecting-planar-roofs-with-covariance-features/) — the same neighbourhood analysis applied to classification
- [Extracting Building Footprints from LiDAR](https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/extracting-building-footprints-from-lidar/) — the outlines these faces sit inside
- [Generating Slope and Aspect Rasters with gdaldem](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/generating-slope-and-aspect-rasters-with-gdaldem/) — the raster equivalent for terrain
- [DBSCAN Segmentation with filters.dbscan](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/dbscan-segmentation-with-filters-dbscan/) — the clustering method used on normals
