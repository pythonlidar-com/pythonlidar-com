---
title: "Tuning PMF for Flat Agricultural Terrain"
description: "Configure PDAL filters.pmf for flat farmland: low slope, small initial and maximum distances to reject crops and hedges, window sizes matched to farm buildings, keeping field drains and ditches, and checking the DTM for crop residue."
slug: "tuning-pmf-for-flat-agricultural-terrain"
type: "howto"
breadcrumb: "PMF on Flat Farmland"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Tuning PMF for Flat Agricultural Terrain",
      "description": "Configure PDAL filters.pmf for flat farmland: low slope, small initial and maximum distances to reject crops and hedges, window sizes matched to farm buildings, keeping field drains and ditches, and checking the DTM for crop residue.",
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
          "name": "PMF Ground Classification",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/pmf-ground-classification/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "PMF on Flat Farmland",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/pmf-ground-classification/tuning-pmf-for-flat-agricultural-terrain/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Tune PMF ground classification for flat agricultural land",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Lower the slope parameter",
          "text": "PMF's slope scales how much the elevation threshold grows with window size. On flat land 0.1\u20130.3 prevents the threshold from growing large enough to accept crops."
        },
        {
          "@type": "HowToStep",
          "name": "Tighten the distances",
          "text": "initial_distance is the threshold at the smallest window; max_distance caps it. 0.1\u20130.15 m and 1\u20131.5 m reject crops and hedges while tolerating ploughed soil roughness."
        },
        {
          "@type": "HowToStep",
          "name": "Size the maximum window",
          "text": "max_window_size must exceed the largest object to remove. Farm buildings and machinery sheds are typically 15\u201330 m across; at 1 m cells, a 31-cell window is usually enough."
        },
        {
          "@type": "HowToStep",
          "name": "Keep exponential growth",
          "text": "exponential: true grows windows geometrically (1, 3, 7, 15, 31\u2026), reaching the maximum quickly with few iterations. Linear growth offers finer control but is slower."
        },
        {
          "@type": "HowToStep",
          "name": "Check drains and crops",
          "text": "Profile across ditches and field boundaries, and compare the DTM over cropped fields with a post-harvest collection if one exists."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What PMF settings suit flat agricultural land?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A low slope around 0.1 to 0.3, a small initial distance around 0.12 metres, a maximum distance around 1 to 1.5 metres and a maximum window just larger than the largest farm building, with exponential window growth."
          }
        },
        {
          "@type": "Question",
          "name": "Why does PMF classify crops as ground?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "With the default slope and maximum distance, the elevation threshold grows large enough to accept flat-topped crop canopies a metre or more above the soil. Lowering slope and max_distance keeps the threshold below crop height."
          }
        },
        {
          "@type": "Question",
          "name": "How do I preserve drainage ditches?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Keep max_window_size no larger than needed and max_distance small, and verify with profiles across known ditches. Narrow ditches can still be interpolated over if few ground returns fall inside them; breaklines help where they are critical."
          }
        },
        {
          "@type": "Question",
          "name": "Is PMF or SMRF better for farmland?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Both work well on flat land when tuned. PMF's parameters are simple and map directly onto crop and building heights; SMRF offers more control on mixed terrain. Compare them on a reference tile if the project matters."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** On flat farmland, set `slope` low (0.1–0.3), `initial_distance` small (0.1–0.15 m) and `max_distance` modest (1–1.5 m) so standing crops and hedges are rejected, choose `max_window_size` just larger than the biggest farm building (20–30 m at 1 m cells), and keep `exponential: true`. Check the DTM for crop-height bumps and for field drains that were filled in.

## Context and Motivation

This guide is part of [PMF Ground Classification](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/pmf-ground-classification/). Flat agricultural land looks like the easiest possible ground classification job, and for the morphological filter it mostly is: there are few steep slopes for the opening to cut off. The difficulty is subtler. Crops half a metre to two metres tall form dense, flat-topped canopies that return few ground points in summer; hedgerows and field margins sit a metre or two above fields; field drains and ditches are narrow and shallow. Default PMF settings, which allow a gentle slope and a generous height tolerance, accept crop tops as ground and flatten away drains — both of which matter for the drainage and flood studies that farmland DTMs are typically used for.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Farmland profile with crops, a hedge and a drainage ditch" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Small features that matter on flat land</title>
  <desc>A nearly flat profile across two fields separated by a hedge and a drainage ditch. A standing crop about one metre tall covers the left field. Default PMF settings produce a ground surface that rides on the crop top in places and fills the ditch. Tuned settings keep the ground at the soil surface and preserve the ditch.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <path d="M30 170 L350 172 L370 172 L380 196 L400 196 L410 172 L710 170" fill="none" stroke="var(--dg-line)" stroke-width="2"/>
  <rect x="40" y="136" width="290" height="34" fill="var(--dg-d-soft)"/>
  <ellipse cx="450" cy="140" rx="30" ry="30" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <path d="M30 168 L120 150 L200 140 L280 148 L350 170 L370 170 L410 170 L710 168" fill="none" stroke="var(--dg-e)" stroke-width="1.8" stroke-dasharray="6 4"/>
  <path d="M30 170 L350 172 L372 172 L382 194 L398 194 L410 172 L710 170" fill="none" stroke="var(--dg-a)" stroke-width="1.8"/>
  <text x="185" y="128" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">default: rides on the crop</text>
  <text x="390" y="212" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">ditch</text>
  <text x="450" y="100" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">hedge</text>
  <text x="560" y="150" font-size="10.5" fill="var(--dg-a)">tuned: soil surface kept</text>
  <text x="30" y="30" font-size="10.5" fill="var(--dg-muted)">grey: true ground · dashed: default PMF · solid: tuned PMF (illustrative)</text>
</svg>

## Prerequisites and Assumptions

- PDAL 2.x with `filters.pmf`.
- Flat or gently undulating terrain (median slope under about 3°).
- Noise removed, and ideally a leaf-off or post-harvest collection; summer data over tall crops limits any filter.
- A few reference profiles or checkpoints across drains and field boundaries.

## Step-by-Step Implementation

### Step 1 — Lower the slope parameter

PMF's `slope` scales how much the elevation threshold grows with window size. On flat land 0.1–0.3 prevents the threshold from growing large enough to accept crops.

### Step 2 — Tighten the distances

`initial_distance` is the threshold at the smallest window; `max_distance` caps it. 0.1–0.15 m and 1–1.5 m reject crops and hedges while tolerating ploughed soil roughness.

### Step 3 — Size the maximum window

`max_window_size` must exceed the largest object to remove. Farm buildings and machinery sheds are typically 15–30 m across; at 1 m cells, a 31-cell window is usually enough. Larger windows add time and flatten broad but real features.

### Step 4 — Keep exponential growth

`exponential: true` grows windows geometrically (1, 3, 7, 15, 31…), reaching the maximum quickly with few iterations. Linear growth offers finer control but is slower.

### Step 5 — Check drains and crops

Profile across ditches and field boundaries, and compare the DTM over cropped fields with a post-harvest collection if one exists.

## Complete Working Example

```json
{
  "pipeline": [
    "tiles/fens_2206.laz",
    { "type": "filters.range", "limits": "Classification![7:7],Classification![18:18]" },
    { "type": "filters.assign", "value": ["Classification = 1 WHERE Classification == 2"] },
    { "type": "filters.pmf", "cell_size": 1.0, "slope": 0.2, "initial_distance": 0.12,
      "max_distance": 1.2, "max_window_size": 31, "exponential": true },
    { "type": "writers.las", "filename": "out/fens_2206_pmf.laz", "minor_version": 4,
      "dataformat_id": 6, "forward": "all", "tag": "classified" },
    { "type": "filters.range", "inputs": ["classified"], "limits": "Classification[2:2]" },
    { "type": "writers.gdal", "filename": "out/fens_2206_dtm.tif", "resolution": 1.0,
      "output_type": "idw", "window_size": 4, "data_type": "float32" }
  ]
}
```

A quick comparison of default and tuned settings on the same tile, measuring how high "ground" sits above the lowest returns in each cell — a crop-residue indicator:

```python
"""Crop-residue indicator: ground points well above the cell minimum."""
import json

import numpy as np
import pdal

SETTINGS = {
    "default": {"slope": 1.0, "initial_distance": 0.15, "max_distance": 2.5, "max_window_size": 33},
    "tuned":   {"slope": 0.2, "initial_distance": 0.12, "max_distance": 1.2, "max_window_size": 31},
}
for name, s in SETTINGS.items():
    p = pdal.Pipeline(json.dumps({"pipeline": [
        "tiles/fens_2206.laz",
        {"type": "filters.range", "limits": "Classification![7:7],Classification![18:18]"},
        {"type": "filters.assign", "value": ["Classification = 1"]},
        {"type": "filters.pmf", "cell_size": 1.0, "exponential": True, **s},
    ]}))
    p.execute()
    a = p.arrays[0]
    cell = (a["X"] // 2).astype(np.int64) * 1_000_000 + (a["Y"] // 2).astype(np.int64)
    order = np.argsort(cell)
    c, z = cell[order], a["Z"][order]
    starts = np.r_[0, np.nonzero(np.diff(c))[0] + 1]
    cell_min = np.repeat(np.minimum.reduceat(z, starts), np.diff(np.r_[starts, len(z)]))
    g = a["Classification"][order] == 2
    high = (z - cell_min)[g]
    print(f"{name:>8}: ground {g.mean():.1%}, ground >0.4 m above cell min: {(high > 0.4).mean():.2%}")
```

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Share of ground points sitting well above the local minimum for default and tuned PMF" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Crop residue in the ground class</title>
  <desc>Two bars for the share of ground points more than 0.4 metres above the lowest return in their 2 metre cell. Default PMF settings: 6.8 percent, mostly crop tops. Tuned settings: 0.9 percent, close to the level expected from genuine micro-relief such as ridges and furrows.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <text x="180" y="66" text-anchor="end" font-size="11" fill="var(--dg-text)">default PMF</text>
  <rect x="190" y="50" width="460" height="24" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="642" y="92" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">6.8 %</text>
  <text x="180" y="136" text-anchor="end" font-size="11" fill="var(--dg-text)">tuned PMF</text>
  <rect x="190" y="120" width="61" height="24" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="259" y="137" font-size="10.5" fill="var(--dg-muted)">0.9 %</text>
  <text x="190" y="30" font-size="10.5" fill="var(--dg-muted)">ground points more than 0.4 m above their 2 m cell minimum (illustrative)</text>
  <text x="190" y="176" font-size="10.5" fill="var(--dg-muted)">summer collection over cereal crops</text>
</svg>

## Key Parameter Table

| Option | Default | Flat farmland | Effect |
|---|---|---|---|
| `slope` | 1.0 | 0.1–0.3 | How fast the threshold grows with window size |
| `initial_distance` | 0.15 m | 0.1–0.15 m | Tolerance at the smallest window |
| `max_distance` | 2.5 m | 1.0–1.5 m | Cap on the tolerance; below crop and hedge heights |
| `max_window_size` | 33 | 25–31 | Just above the largest building, in cells |
| `cell_size` | 1.0 m | 1.0 m | Grid for the morphological surface |
| `exponential` | true | true | Window growth pattern |

## Verification

- **Crop-residue indicator** as in the script: a low share of ground points far above the local minimum.
- **Ditch profiles.** Depths across field drains should match the reference within a decimetre.
- **Seasonal comparison.** If a leaf-off or post-harvest flight exists, difference the two DTMs over fields; residual crop shows as positive differences confined to field boundaries.

## Gotchas and Edge Cases

**Tall summer crops.** Maize or oilseed rape at two metres or more with dense canopy may leave almost no ground returns. No setting recovers ground that was never measured; flag those fields and interpolate from margins.

**Levees and embankments.** Flood banks are narrow, raised and real. A small `max_distance` can reject their crests as non-ground. Check known embankments explicitly, and relax settings locally or use breaklines.

**Glasshouses and polytunnels.** Large, flat structures just above ground look like terrain to morphology. Their footprint needs the maximum window to exceed it; add a building mask if they are common.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Exponential window growth reaching the maximum window size" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Window sizes with exponential growth</title>
  <desc>A sequence of square windows growing 1, 3, 7, 15 and 31 cells wide, reaching a maximum window of 31 cells in five iterations. A farm building 24 metres across fits inside the final window, so it is removed; a larger maximum would add iterations without benefit.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <g fill="none" stroke="var(--dg-a)" stroke-width="1.4"><rect x="60" y="80" width="4" height="4"/><rect x="120" y="76" width="12" height="12"/><rect x="190" y="68" width="28" height="28"/><rect x="270" y="52" width="60" height="60"/><rect x="380" y="20" width="124" height="124"/></g>
  <rect x="400" y="46" width="84" height="60" fill="var(--dg-surface-2)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="442" y="80" text-anchor="middle" font-size="10" fill="var(--dg-text)">24 m shed</text>
  <g font-size="10.5" fill="var(--dg-muted)"><text text-anchor="middle" x="62" y="130">1</text><text text-anchor="middle" x="126" y="130">3</text><text text-anchor="middle" x="204" y="130">7</text><text text-anchor="middle" x="300" y="130">15</text><text text-anchor="middle" x="442" y="160">31 cells = max_window_size</text></g>
  <text x="560" y="80" font-size="10.5" fill="var(--dg-text)">five iterations</text>
</svg>

**Default slope of 1.0.** PMF's default slope was chosen for varied terrain; on flat land it lets the threshold reach `max_distance` quickly, which is why crops pass. Lowering `slope` is the most effective single change.

## Frequently Asked Questions

**What PMF settings suit flat agricultural land?**

A low slope around 0.1 to 0.3, a small initial distance around 0.12 metres, a maximum distance around 1 to 1.5 metres and a maximum window just larger than the largest farm building, with exponential window growth.

**Why does PMF classify crops as ground?**

With the default slope and maximum distance, the elevation threshold grows large enough to accept flat-topped crop canopies a metre or more above the soil. Lowering slope and max_distance keeps the threshold below crop height.

**How do I preserve drainage ditches?**

Keep max_window_size no larger than needed and max_distance small, and verify with profiles across known ditches. Narrow ditches can still be interpolated over if few ground returns fall inside them; breaklines help where they are critical.

**Is PMF or SMRF better for farmland?**

Both work well on flat land when tuned. PMF's parameters are simple and map directly onto crop and building heights; SMRF offers more control on mixed terrain. Compare them on a reference tile if the project matters.

## Related

- [PMF Ground Classification](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/pmf-ground-classification/) — the filter in general
- [Tuning PMF Window and Slope](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/pmf-ground-classification/tuning-pmf-window-and-slope/) — parameter behaviour in depth
- [Classifying Ground with Progressive Morphological Filter](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/pmf-ground-classification/classifying-ground-with-progressive-morphological-filter/) — a complete PMF run
- [SMRF vs PMF for Dense Urban LiDAR](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/smrf-vs-pmf-for-dense-urban-lidar/) — the urban comparison
- [Hydro-Flattening Water Bodies in a DTM](https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/hydro-flattening-water-bodies-in-a-dtm/) — drainage-ready terrain models
