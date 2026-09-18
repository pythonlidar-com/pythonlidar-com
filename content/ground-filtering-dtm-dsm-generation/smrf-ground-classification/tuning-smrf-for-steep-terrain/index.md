---
title: "Tuning SMRF for Steep Terrain"
description: "Stop PDAL filters.smrf from cutting off ridges, cliff tops and river banks in mountainous LiDAR: raising slope, shrinking window, adjusting threshold and scalar, slope-stratified evaluation, and per-tile parameters driven by terrain steepness."
slug: "tuning-smrf-for-steep-terrain"
type: "howto"
breadcrumb: "SMRF on Steep Terrain"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Tuning SMRF for Steep Terrain",
      "description": "Stop PDAL filters.smrf from cutting off ridges, cliff tops and river banks in mountainous LiDAR: raising slope, shrinking window, adjusting threshold and scalar, slope-stratified evaluation, and per-tile parameters driven by terrain steepness.",
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
          "name": "Ground Filtering & Terrain Models",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "SMRF Ground Classification",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "SMRF on Steep Terrain",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/tuning-smrf-for-steep-terrain/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Tune SMRF ground classification for steep mountainous terrain",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Measure the terrain",
          "text": "Compute the median and 90th-percentile slope per tile from a coarse DTM. Tiles with median slope above about 15\u00b0 need steep settings."
        },
        {
          "@type": "HowToStep",
          "name": "Raise slope",
          "text": "SMRF's slope is a gradient (rise over run), not degrees. A value of 0.15 corresponds to about 8.5\u00b0; mountainous terrain needs 0.4\u20130.8 (about 22\u201339\u00b0)."
        },
        {
          "@type": "HowToStep",
          "name": "Shrink the window",
          "text": "window should be only as large as the largest non-ground object \u2014 in mountains usually trees, not warehouses. 8\u201312 m keeps the opening from spanning ridges."
        },
        {
          "@type": "HowToStep",
          "name": "Scale the threshold with slope",
          "text": "threshold is the base elevation tolerance; scalar multiplies local slope to add to it. Raising scalar lets points on steep ground sit further above the opened surface and still count as ground."
        },
        {
          "@type": "HowToStep",
          "name": "Evaluate on steep cells",
          "text": "Report type I and II errors separately for cells above 20\u00b0 \u2014 that is where the settings are tested."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does SMRF remove ridges and bank tops?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Its progressive morphological opening treats anything that rises steeply above the local minimum surface as a non-ground object. On steep terrain, ridge crests and bank edges look like that, so with default settings they are rejected."
          }
        },
        {
          "@type": "Question",
          "name": "What SMRF slope value should I use in mountains?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Typically 0.4 to 0.8, which is a gradient of roughly 22 to 39 degrees, together with a smaller window and a higher scalar. Tune against reference ground on a representative steep tile."
          }
        },
        {
          "@type": "Question",
          "name": "Is the SMRF slope parameter in degrees?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. It is a gradient, rise over run. A value of 0.15 is about 8.5 degrees; convert with the tangent of the angle."
          }
        },
        {
          "@type": "Question",
          "name": "Can I use different settings within one tile?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes, by computing a slope class per point or per cell and running SMRF with different parameters under where clauses, or more simply by tiling smaller so each tile is mostly one terrain type."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** On steep terrain, raise `slope` from the default 0.15 toward 0.4–0.8, shrink `window` from 18 m to 8–12 m, and raise `scalar` to about 1.5–2 so the elevation threshold grows with local slope. Evaluate type I errors on steep cells separately — the overall rate hides the ridges and banks SMRF is cutting off — and switch settings per tile by median slope rather than using one compromise everywhere.

## Context and Motivation

This guide is part of [SMRF Ground Classification](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/). SMRF builds a minimum surface on a grid, opens it with progressively larger windows, and rejects points that rise above the opened surface by more than a threshold that depends on local slope. The default settings suit rolling and urban terrain. On mountains, the progressive opening treats the tops of steep slopes the way it treats buildings: as things standing above the local minimum. The result is a DTM with ridges shaved flat, cliff edges rounded and river banks pushed back — type I errors concentrated exactly where terrain matters for slope stability, hydrology and road design.

Three parameters control this behaviour, and they have to move together.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Default SMRF cutting off a ridge versus steep-terrain settings following it" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Shaved ridges and how to keep them</title>
  <desc>A mountain profile with a sharp ridge and a steep river bank. The default SMRF ground surface, dashed, cuts across the ridge top and pulls back from the bank edge, losing several metres of terrain. The tuned surface, solid, follows the ridge and bank closely. Shaded areas show terrain misclassified as non-ground by the default settings.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <path d="M30 190 L200 110 L280 40 L360 110 L500 150 L560 150 L580 190 L710 190" fill="none" stroke="var(--dg-line)" stroke-width="2"/>
  <path d="M30 190 L200 112 L245 80 L315 80 L360 112 L500 152 L548 160 L580 190 L710 190" fill="none" stroke="var(--dg-e)" stroke-width="1.8" stroke-dasharray="6 4"/>
  <path d="M245 80 L280 40 L315 80 Z" fill="var(--dg-e-soft)"/>
  <path d="M30 190 L200 111 L280 43 L360 111 L500 151 L558 151 L580 190 L710 190" fill="none" stroke="var(--dg-a)" stroke-width="1.8"/>
  <text x="330" y="44" font-size="10.5" fill="var(--dg-e)">default: ridge shaved</text>
  <text x="590" y="146" font-size="10.5" fill="var(--dg-e)">bank edge pulled back</text>
  <text x="30" y="36" font-size="10.5" fill="var(--dg-muted)">grey: true terrain · dashed: default SMRF · solid: steep-terrain settings</text>
</svg>

## Prerequisites and Assumptions

- PDAL 2.x with `filters.smrf`.
- Noise removed (classes 7, 18) and a reference ground classification or checkpoints for at least one steep tile.
- A slope raster, or a quick DTM to compute one, for stratifying the evaluation.

## Step-by-Step Implementation

### Step 1 — Measure the terrain

Compute the median and 90th-percentile slope per tile from a coarse DTM. Tiles with median slope above about 15° need steep settings.

### Step 2 — Raise slope

SMRF's `slope` is a gradient (rise over run), not degrees. A value of 0.15 corresponds to about 8.5°; mountainous terrain needs 0.4–0.8 (about 22–39°).

### Step 3 — Shrink the window

`window` should be only as large as the largest non-ground object — in mountains usually trees, not warehouses. 8–12 m keeps the opening from spanning ridges.

### Step 4 — Scale the threshold with slope

`threshold` is the base elevation tolerance; `scalar` multiplies local slope to add to it. Raising `scalar` lets points on steep ground sit further above the opened surface and still count as ground.

### Step 5 — Evaluate on steep cells

Report type I and II errors separately for cells above 20° — that is where the settings are tested.

## Complete Working Example

```python
"""Compare default and steep-terrain SMRF settings, stratified by slope."""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pdal

REF = "reference/mountain_ref_1204.laz"          # reference classification in Classification
SETTINGS = {
    "default": {"slope": 0.15, "window": 18.0, "threshold": 0.5, "scalar": 1.25, "cell": 1.0},
    "steep":   {"slope": 0.6,  "window": 10.0, "threshold": 0.45, "scalar": 1.8, "cell": 1.0},
}


def classify(params: dict) -> np.ndarray:
    spec = {"pipeline": [
        REF,
        {"type": "filters.range", "limits": "Classification![7:7],Classification![18:18]"},
        {"type": "filters.ferry", "dimensions": "Classification=>RefClass"},
        {"type": "filters.assign", "value": ["Classification = 1"]},
        {"type": "filters.smrf", **params},
    ]}
    p = pdal.Pipeline(json.dumps(spec))
    p.execute()
    return p.arrays[0]


def local_slope(a: np.ndarray, cell: float = 5.0) -> np.ndarray:
    """Slope in degrees per point from a coarse min-Z grid of reference ground."""
    g = a[a["RefClass"] == 2]
    x0, y0 = a["X"].min(), a["Y"].min()
    cols = int((a["X"].max() - x0) // cell) + 1
    rows = int((a["Y"].max() - y0) // cell) + 1
    z = np.full((rows, cols), np.nan)
    r, c = ((g["Y"] - y0) // cell).astype(int), ((g["X"] - x0) // cell).astype(int)
    np.fmin.at(z, (r, c), g["Z"])
    gy, gx = np.gradient(z, cell)
    s = np.degrees(np.arctan(np.hypot(gx, gy)))
    return s[((a["Y"] - y0) // cell).astype(int), ((a["X"] - x0) // cell).astype(int)]


def score(a: np.ndarray, mask: np.ndarray) -> tuple[float, float]:
    ref, got = (a["RefClass"] == 2) & mask, (a["Classification"] == 2) & mask
    notref = (a["RefClass"] != 2) & mask
    return float((ref & ~got).sum() / max(ref.sum(), 1)), float((notref & got).sum() / max(notref.sum(), 1))


if __name__ == "__main__":
    rows = []
    for name, params in SETTINGS.items():
        a = classify(params)
        s = local_slope(a)
        for label, m in (("all", np.ones(len(a), bool)), ("slope>20°", np.nan_to_num(s) > 20)):
            t1, t2 = score(a, m)
            rows.append({"settings": name, "cells": label, "type1": round(t1, 4), "type2": round(t2, 4)})
    print(pd.DataFrame(rows).to_string(index=False))
```

Illustrative results on a mountain tile:

```text
settings      cells   type1   type2
 default        all  0.0612  0.0049
 default  slope>20°  0.1874  0.0061
   steep        all  0.0241  0.0093
   steep  slope>20°  0.0452  0.0127
```

On steep cells, the default settings reject nearly one in five ground points; the steep settings cut that to under 5 percent at the cost of a modest rise in type II errors.

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Type I error on steep cells for default and steep settings" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>The overall rate hides the problem</title>
  <desc>Grouped bars of type I error. For all cells, default settings show 6.1 percent and steep settings 2.4 percent. For cells steeper than 20 degrees, default settings show 18.7 percent and steep settings 4.5 percent. The steep subset reveals how much ground the default settings were discarding on slopes.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="170" x2="680" y2="170" stroke="var(--dg-line)" stroke-width="1.3"/>
  <rect x="160" y="140" width="70" height="30" fill="var(--dg-e-soft)" stroke="var(--dg-e)"/>
  <rect x="236" y="158" width="70" height="12" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/>
  <rect x="440" y="80" width="70" height="90" fill="var(--dg-e-soft)" stroke="var(--dg-e)"/>
  <rect x="516" y="148" width="70" height="22" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/>
  <g font-size="10.5" fill="var(--dg-text)"><text text-anchor="middle" x="195" y="132">6.1 %</text><text text-anchor="middle" x="271" y="150">2.4 %</text><text text-anchor="middle" x="475" y="72">18.7 %</text><text text-anchor="middle" x="551" y="140">4.5 %</text></g>
  <text x="233" y="190" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">all cells</text>
  <text x="513" y="190" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">slope &gt; 20°</text>
  <rect x="600" y="40" width="14" height="10" fill="var(--dg-e-soft)" stroke="var(--dg-e)"/><text x="620" y="49" font-size="10" fill="var(--dg-muted)">default</text>
  <rect x="600" y="60" width="14" height="10" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text x="620" y="69" font-size="10" fill="var(--dg-muted)">steep</text>
</svg>

## Key Parameter Table

| Parameter | Default | Steep terrain | Why |
|---|---|---|---|
| `slope` | 0.15 | 0.4–0.8 | Gradient allowed before a point is considered non-ground |
| `window` | 18 m | 8–12 m | Largest object to remove; smaller keeps ridges |
| `threshold` | 0.5 m | 0.4–0.5 m | Base elevation tolerance |
| `scalar` | 1.25 | 1.5–2.0 | Threshold growth with local slope |
| `cell` | 1.0 m | 1.0 m | Grid for the minimum surface; near point spacing |

Slope as gradient: 0.15 ≈ 8.5°, 0.3 ≈ 16.7°, 0.5 ≈ 26.6°, 0.8 ≈ 38.7°.

## Verification

- **Stratified errors**, as above; steep-cell type I should drop substantially without type II doubling.
- **Ridge profiles.** Draw profiles across a few ridge crests and banks from the new DTM against the reference ground; the tuned surface should reach the crest.
- **Hillshade.** Look for flat-topped ridges (still too aggressive) and lumpy slopes (now accepting shrubs).

## Gotchas and Edge Cases

**Mixed tiles.** A tile with a valley floor town and steep sides needs both behaviours. Split by slope: classify with steep settings, then reclassify the flat part with default settings using a `where` clause on a slope-derived dimension, or tile smaller.

**Buildings on slopes.** Raising `slope` lets more building roofs pass as ground on hillside towns. Keep window large enough for the largest building, or run a building classification afterwards and remove class 6 from ground.

**Cliffs.** Near-vertical faces return few ground points and SMRF has little to work with. Accept that cliff faces will be interpolated, and use breaklines if the deliverable must show them.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Choosing SMRF settings per tile from median slope" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Settings by terrain class</title>
  <desc>Three terrain classes by median tile slope. Below 8 degrees, default settings with slope 0.15 and window 18. Between 8 and 20 degrees, intermediate settings with slope 0.3 and window 14. Above 20 degrees, steep settings with slope 0.6 and window 10. Each tile's median slope selects its class.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <line x1="60" y1="60" x2="700" y2="60" stroke="var(--dg-line)" stroke-width="1.4"/>
  <g stroke="var(--dg-line)" stroke-width="1.4"><line x1="260" y1="50" x2="260" y2="70"/><line x1="480" y1="50" x2="480" y2="70"/></g>
  <g font-size="10" fill="var(--dg-muted)"><text text-anchor="middle" x="60" y="44">0°</text><text text-anchor="middle" x="260" y="44">8°</text><text text-anchor="middle" x="480" y="44">20°</text><text text-anchor="middle" x="700" y="44">40°</text></g>
  <rect x="60" y="84" width="196" height="60" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/>
  <rect x="264" y="84" width="212" height="60" rx="8" fill="var(--dg-b-soft)" stroke="var(--dg-b)"/>
  <rect x="484" y="84" width="216" height="60" rx="8" fill="var(--dg-c-soft)" stroke="var(--dg-c)"/>
  <g font-size="10.5" fill="var(--dg-text)"><text text-anchor="middle" x="158" y="110">slope 0.15</text><text text-anchor="middle" x="158" y="128">window 18</text><text text-anchor="middle" x="370" y="110">slope 0.3</text><text text-anchor="middle" x="370" y="128">window 14</text><text text-anchor="middle" x="592" y="110">slope 0.6</text><text text-anchor="middle" x="592" y="128">window 10</text></g>
  <text x="60" y="162" font-size="10.5" fill="var(--dg-muted)">median tile slope selects the parameter set</text>
</svg>

**Units of slope.** Passing degrees (for example 30) as `slope` makes SMRF accept almost everything as ground. The parameter is a gradient.

## Frequently Asked Questions

**Why does SMRF remove ridges and bank tops?**

Its progressive morphological opening treats anything that rises steeply above the local minimum surface as a non-ground object. On steep terrain, ridge crests and bank edges look like that, so with default settings they are rejected.

**What SMRF slope value should I use in mountains?**

Typically 0.4 to 0.8, which is a gradient of roughly 22 to 39 degrees, together with a smaller window and a higher scalar. Tune against reference ground on a representative steep tile.

**Is the SMRF slope parameter in degrees?**

No. It is a gradient, rise over run. A value of 0.15 is about 8.5 degrees; convert with the tangent of the angle.

**Can I use different settings within one tile?**

Yes, by computing a slope class per point or per cell and running SMRF with different parameters under where clauses, or more simply by tiling smaller so each tile is mostly one terrain type.

## Related

- [SMRF Ground Classification](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) — how SMRF works
- [Tuning SMRF for Forested Terrain](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/tuning-smrf-for-forested-terrain/) — the canopy case
- [Benchmarking SMRF Against Reference Ground Points](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/benchmarking-smrf-against-reference-ground-points/) — scoring methods
- [CSF vs SMRF for Forested Ground](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/csf-cloth-simulation-filter/csf-vs-smrf-for-forested-ground/) — an alternative filter on slopes
- [Generating Slope and Aspect Rasters with gdaldem](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/generating-slope-and-aspect-rasters-with-gdaldem/) — the slope raster for stratification
