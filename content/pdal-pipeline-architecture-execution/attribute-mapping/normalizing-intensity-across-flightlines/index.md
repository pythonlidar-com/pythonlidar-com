---
title: "Normalizing Intensity Across Flightlines"
description: "Make LiDAR intensity comparable between flightlines: range normalization from flying height and scan angle, overlap-based histogram matching per PointSourceId, writing a NormIntensity dimension, and checking seams in an intensity raster."
slug: "normalizing-intensity-across-flightlines"
type: "howto"
breadcrumb: "Normalizing Intensity"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Normalizing Intensity Across Flightlines",
      "description": "Make LiDAR intensity comparable between flightlines: range normalization from flying height and scan angle, overlap-based histogram matching per PointSourceId, writing a NormIntensity dimension, and checking seams in an intensity raster.",
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
          "name": "PDAL Pipeline Architecture and Execution",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Attribute Mapping",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Normalizing Intensity",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/normalizing-intensity-across-flightlines/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Normalize LiDAR intensity across flightlines",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Estimate range per return",
          "text": "Without a trajectory, range \u2248 (flying height above ground \u2212 height above ground of the point) \u00f7 cos(scan angle). Flying height above ground can be taken from the project's flight plan per line."
        },
        {
          "@type": "HowToStep",
          "name": "Range-normalize",
          "text": "Multiply intensity by (R / R_ref)\u00b2, where R_ref is a reference range such as the nominal flying height. This removes the inverse-square fall-off with distance for extended targets."
        },
        {
          "@type": "HowToStep",
          "name": "Measure line-to-line offsets in overlap",
          "text": "For each pair of overlapping lines, grid their ground and road points at 2 m and compare median normalized intensity per cell. Cells that both lines cover give a paired sample."
        },
        {
          "@type": "HowToStep",
          "name": "Match each line to a reference",
          "text": "Choose a central line as reference and fit a linear mapping (gain and offset) from each other line to it using the paired cell medians, chaining through neighbours where lines do not overlap the reference directly."
        },
        {
          "@type": "HowToStep",
          "name": "Write NormIntensity and check seams",
          "text": "Apply the mapping, clip to the 16-bit range, write NormIntensity as an extra dimension, and rasterize both raw and normalized intensity to compare seams."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does LiDAR intensity vary between flightlines?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Intensity depends on range, incidence angle, atmospheric conditions and receiver settings as well as target reflectance. Adjacent lines see the same ground at different ranges and angles, and sometimes with different gain, producing visible stripes."
          }
        },
        {
          "@type": "Question",
          "name": "Can I get true reflectance from LiDAR intensity?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Not without radiometric calibration of the sensor and full trajectory information. Normalization removes most geometric and line-to-line variation, producing values that are comparable within a project, but not physical reflectance."
          }
        },
        {
          "@type": "Question",
          "name": "Should I overwrite the Intensity dimension?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. Keep raw intensity and write the normalized values to a separate dimension. Different users need different corrections, and raw values cannot be recovered once overwritten."
          }
        },
        {
          "@type": "Question",
          "name": "What if I have the aircraft trajectory?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Use it. True range from the sensor position to each return is more accurate than the geometric estimate from flying height and scan angle, and it captures altitude changes along the line."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Intensity drops with range, so first scale each return by (R / R_ref)², estimating range from height above ground and scan angle when trajectory data is missing. Then remove what remains of the line-to-line offset by matching each flightline's intensity quantiles to a reference line inside their overlap. Store the result as a separate `NormIntensity` dimension and keep the raw `Intensity` untouched.

## Context and Motivation

This guide is part of [Attribute Mapping in PDAL Pipelines](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/). Raw LiDAR intensity is a relative, uncalibrated number. It depends on the target's reflectance — which is what you want — but also on range to the target, incidence angle, atmospheric conditions, receiver gain and sometimes automatic gain control that changes during a flight. The result is visible in any intensity image as stripes along flightlines: the same asphalt road is brighter where one line saw it near nadir and darker where another saw it at the swath edge.

Those stripes break anything that uses intensity as evidence — water detection, road-marking extraction, classification features. Normalization does not produce true reflectance, but it removes most of the geometric and line-to-line variation, which is usually enough.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Intensity stripes by flightline before and after normalization" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Stripes that are not in the ground</title>
  <desc>Two panels of the same area as an intensity image. Before normalization, three overlapping flightline swaths show as bands of different brightness across a uniform field. After normalization the bands are no longer visible and the field has uniform intensity, while a road crossing it remains brighter because that difference is real.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <text x="185" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">raw Intensity</text>
  <text x="555" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">NormIntensity</text>
  <rect x="30" y="36" width="310" height="54" fill="var(--dg-surface-2)"/>
  <rect x="30" y="90" width="310" height="54" fill="var(--dg-line-soft)"/>
  <rect x="30" y="144" width="310" height="54" fill="var(--dg-surface)"/>
  <path d="M160 36 h24 v162 h-24 Z" fill="var(--dg-c-soft)"/>
  <rect x="400" y="36" width="310" height="162" fill="var(--dg-surface-2)"/>
  <path d="M530 36 h24 v162 h-24 Z" fill="var(--dg-c-soft)"/>
  <text x="352" y="66" font-size="10" fill="var(--dg-muted)">line 1</text>
  <text x="352" y="120" font-size="10" fill="var(--dg-muted)">line 2</text>
  <text x="352" y="174" font-size="10" fill="var(--dg-muted)">line 3</text>
  <text x="555" y="214" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">the road stays brighter — that difference is real</text>
</svg>

## Prerequisites and Assumptions

- Points with `Intensity`, `PointSourceId` (one ID per flightline), `ScanAngleRank` and ground classified.
- Height above ground or, better, the aircraft trajectory (SBET) to compute true range. This guide assumes no trajectory and estimates range geometrically.
- Overlap between adjacent flightlines of at least 10–20 percent, which is standard for airborne surveys.
- Python with NumPy, pandas and PDAL bindings.

## Step-by-Step Implementation

### Step 1 — Estimate range per return

Without a trajectory, range ≈ (flying height above ground − height above ground of the point) ÷ cos(scan angle). Flying height above ground can be taken from the project's flight plan per line.

### Step 2 — Range-normalize

Multiply intensity by (R / R_ref)², where R_ref is a reference range such as the nominal flying height. This removes the inverse-square fall-off with distance for extended targets.

### Step 3 — Measure line-to-line offsets in overlap

For each pair of overlapping lines, grid their ground and road points at 2 m and compare median normalized intensity per cell. Cells that both lines cover give a paired sample.

### Step 4 — Match each line to a reference

Choose a central line as reference and fit a linear mapping (gain and offset) from each other line to it using the paired cell medians, chaining through neighbours where lines do not overlap the reference directly.

### Step 5 — Write NormIntensity and check seams

Apply the mapping, clip to the 16-bit range, write `NormIntensity` as an extra dimension, and rasterize both raw and normalized intensity to compare seams.

## Complete Working Example

```python
"""Range normalization plus overlap-based gain/offset matching per flightline."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import numpy.lib.recfunctions as rfn
import pandas as pd
import pdal

FLYING_HEIGHT_AGL = {1101: 1200.0, 1102: 1200.0, 1103: 1250.0}   # metres, from flight plan
R_REF = 1200.0
CELL = 2.0


def load(src: Path) -> np.ndarray:
    p = pdal.Pipeline(json.dumps({"pipeline": [
        str(src),
        {"type": "filters.range", "limits": "Classification![7:7],Classification![18:18]"},
        {"type": "filters.hag_nn", "count": 2},
    ]}))
    p.execute()
    return p.arrays[0]


def range_normalized(a: np.ndarray) -> np.ndarray:
    h = np.array([FLYING_HEIGHT_AGL.get(int(s), R_REF) for s in a["PointSourceId"]])
    angle = np.radians(np.abs(a["ScanAngleRank"].astype(float)))
    rng = (h - a["HeightAboveGround"]) / np.cos(angle)
    return a["Intensity"] * (rng / R_REF) ** 2


def line_mapping(a: np.ndarray, inten: np.ndarray, ref: int) -> dict[int, tuple[float, float]]:
    ground = a["Classification"] == 2
    df = pd.DataFrame({"line": a["PointSourceId"][ground], "i": inten[ground],
                       "cx": (a["X"][ground] // CELL).astype(int),
                       "cy": (a["Y"][ground] // CELL).astype(int)})
    cells = df.groupby(["line", "cx", "cy"]).i.median().unstack("line")
    maps = {ref: (1.0, 0.0)}
    for line in cells.columns:
        if line == ref:
            continue
        both = cells[[ref, line]].dropna()
        if len(both) < 200:
            print(f"line {line}: only {len(both)} shared cells with reference; left unmatched")
            maps[int(line)] = (1.0, 0.0)
            continue
        gain, offset = np.polyfit(both[line], both[ref], 1)
        maps[int(line)] = (float(gain), float(offset))
        print(f"line {line}: gain {gain:.3f} offset {offset:+.1f} from {len(both)} cells")
    return maps


def normalize(src: Path, dst: Path, ref: int = 1102) -> None:
    a = load(src)
    inten = range_normalized(a)
    maps = line_mapping(a, inten, ref)
    gain = np.array([maps.get(int(s), (1.0, 0.0))[0] for s in a["PointSourceId"]])
    off = np.array([maps.get(int(s), (1.0, 0.0))[1] for s in a["PointSourceId"]])
    norm = np.clip(inten * gain + off, 0, 65535).astype(np.uint16)
    out = rfn.append_fields(a, "NormIntensity", norm, usemask=False)
    pdal.Writer.las(filename=str(dst), minor_version=4, dataformat_id=6, forward="all",
                    extra_dims="NormIntensity=uint16").pipeline(out).execute()


if __name__ == "__main__":
    normalize(Path("tiles/t_0431.laz"), Path("out/t_0431_norm.laz"))
```

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Paired cell medians between two flightlines with a fitted gain and offset" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Fitting one line to another in the overlap</title>
  <desc>A scatter of median intensity per shared ground cell: line 1103 on the horizontal axis against reference line 1102 on the vertical axis. The points fall along a straight line with slope 1.18 and a small offset, below the one-to-one diagonal, showing that line 1103 reads consistently darker. The fitted line is the gain and offset applied to line 1103.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="180" x2="680" y2="180" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="80" y1="180" x2="80" y2="20" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="80" y1="180" x2="240" y2="20" stroke="var(--dg-line-soft)" stroke-width="1.2" stroke-dasharray="5 4"/>
  <line x1="80" y1="176" x2="420" y2="24" stroke="var(--dg-a)" stroke-width="2"/>
  <g fill="var(--dg-b)"><circle cx="120" cy="160" r="3"/><circle cx="150" cy="144" r="3"/><circle cx="170" cy="140" r="3"/><circle cx="200" cy="120" r="3"/><circle cx="230" cy="112" r="3"/><circle cx="260" cy="96" r="3"/><circle cx="290" cy="86" r="3"/><circle cx="320" cy="70" r="3"/><circle cx="350" cy="58" r="3"/><circle cx="380" cy="44" r="3"/><circle cx="210" cy="118" r="3"/><circle cx="300" cy="78" r="3"/></g>
  <text x="430" y="36" font-size="10.5" fill="var(--dg-a)">fit: gain 1.18, offset +12</text>
  <text x="250" y="30" font-size="10.5" fill="var(--dg-muted)">1:1</text>
  <text x="380" y="200" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">line 1103 median per cell</text>
  <text x="40" y="100" font-size="10.5" fill="var(--dg-muted)" transform="rotate(-90 40 100)" text-anchor="middle">line 1102 (reference)</text>
</svg>

## Key Parameter Table

| Parameter | Type | Default | Guidance |
|---|---|---|---|
| `R_REF` | float, m | nominal flying height | Only scales the result; keep constant across a project |
| flying height per line | float, m | from flight plan | Use trajectory-derived range if an SBET exists |
| overlap cell | float, m | 2.0 | Large enough for several returns per line per cell |
| minimum shared cells | int | 200 | Below this, the fit is unreliable |
| surfaces used | classes | ground (2) | Add road-surface class 11 if present; avoid vegetation |

## Verification

- **Seam contrast.** Rasterize raw and normalized intensity at 1 m and compute the difference in median intensity across each overlap boundary; normalized seams should be a fraction of raw ones.
- **Gains near 1.** Fitted gains between 0.8 and 1.25 are typical. Much larger values usually mean a gain change inside a line, which a single mapping cannot fix.
- **Raw intensity untouched.** The written file still has the original `Intensity`; downstream users can choose.

## Gotchas and Edge Cases

**Automatic gain control.** Some sensors adjust receiver gain continuously. Then intensity varies within a line, and per-line matching leaves residual banding. Normalizing in time windows (by `GpsTime`) rather than per line helps.

**Vegetation in the overlap.** Multiple returns from canopy split pulse energy between returns; comparing canopy intensities between lines mostly measures differences in penetration. Restrict matching to ground and hard surfaces.

**Incidence angle on slopes.** The range correction assumes near-vertical incidence. On steep terrain, incidence angle effects remain; a full correction needs surface normals and is rarely worth it for classification features.

<svg viewBox="0 0 740 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Intensity fall-off with range and its correction" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>The inverse-square fall-off</title>
  <desc>A curve of raw intensity for the same surface against range, falling from about 2,400 at 1,000 metres to about 1,300 at 1,350 metres. A flat line shows range-normalized intensity at about 1,900 across the same ranges, after multiplying by the square of range over the reference range.</desc>
  <rect x="0" y="0" width="740" height="180" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="150" x2="680" y2="150" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="80" y1="150" x2="80" y2="20" stroke="var(--dg-line)" stroke-width="1.3"/>
  <path d="M100 30 C250 70 420 100 660 122" fill="none" stroke="var(--dg-c)" stroke-width="2"/>
  <line x1="100" y1="72" x2="660" y2="72" stroke="var(--dg-d)" stroke-width="2"/>
  <text x="560" y="112" font-size="10.5" fill="var(--dg-c)">raw</text>
  <text x="560" y="64" font-size="10.5" fill="var(--dg-d)">range-normalized</text>
  <text x="100" y="168" font-size="10" fill="var(--dg-muted)">1,000 m</text>
  <text x="660" y="168" text-anchor="end" font-size="10" fill="var(--dg-muted)">1,350 m</text>
</svg>

**Different sensors or campaigns.** Mapping between flights with different sensors is possible with the same method, but the relationship is often non-linear. Fit a quantile mapping instead of a linear one, or keep intensity out of cross-campaign analyses.

## Frequently Asked Questions

**Why does LiDAR intensity vary between flightlines?**

Intensity depends on range, incidence angle, atmospheric conditions and receiver settings as well as target reflectance. Adjacent lines see the same ground at different ranges and angles, and sometimes with different gain, producing visible stripes.

**Can I get true reflectance from LiDAR intensity?**

Not without radiometric calibration of the sensor and full trajectory information. Normalization removes most geometric and line-to-line variation, producing values that are comparable within a project, but not physical reflectance.

**Should I overwrite the Intensity dimension?**

No. Keep raw intensity and write the normalized values to a separate dimension. Different users need different corrections, and raw values cannot be recovered once overwritten.

**What if I have the aircraft trajectory?**

Use it. True range from the sensor position to each return is more accurate than the geometric estimate from flying height and scan angle, and it captures altitude changes along the line.

## Related

- [Attribute Mapping in PDAL Pipelines](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/) — adding dimensions to point clouds
- [Classifying Water from Intensity and Returns](https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/classifying-water-from-intensity-and-returns/) — a consumer of normalized intensity
- [Machine Learning Point Classification](https://www.pythonlidar.com/lidar-classification-feature-extraction/machine-learning-point-classification/) — why intensity features transfer badly without this
- [Measuring Swath-to-Swath Relative Accuracy](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/measuring-swath-to-swath-relative-accuracy/) — the geometric counterpart of the same overlap analysis
- [Mapping Custom Attributes in PDAL Pipelines](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/mapping-custom-attributes-in-pdal-pipelines/) — writing NormIntensity as extra bytes
