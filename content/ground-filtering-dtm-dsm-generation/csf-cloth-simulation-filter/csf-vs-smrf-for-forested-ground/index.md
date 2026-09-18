---
title: "CSF vs SMRF for Forested Ground"
description: "A head-to-head comparison of PDAL filters.csf and filters.smrf under forest canopy: scoring both against reference ground, DTM differences on slopes and in gullies, run time, and a decision guide for forested LiDAR projects."
slug: "csf-vs-smrf-for-forested-ground"
type: "howto"
breadcrumb: "CSF vs SMRF in Forest"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "CSF vs SMRF for Forested Ground",
      "description": "A head-to-head comparison of PDAL filters.csf and filters.smrf under forest canopy: scoring both against reference ground, DTM differences on slopes and in gullies, run time, and a decision guide for forested LiDAR projects.",
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
          "name": "CSF Cloth Simulation",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/csf-cloth-simulation-filter/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "CSF vs SMRF in Forest",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/csf-cloth-simulation-filter/csf-vs-smrf-for-forested-ground/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Compare CSF and SMRF ground classification under forest canopy",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Freeze the reference classes",
          "text": "Copy the reference classification into RefClass so both runs compare against it in one array."
        },
        {
          "@type": "HowToStep",
          "name": "Run both filters with identical preprocessing",
          "text": "Same noise removal, same reset of old ground, same input returns."
        },
        {
          "@type": "HowToStep",
          "name": "Score both",
          "text": "Type I and type II error overall, and separately on steep cells (slope over 20\u00b0) where the methods usually differ most."
        },
        {
          "@type": "HowToStep",
          "name": "Build both DTMs and difference them",
          "text": "Rasterize each method's ground at the same grid, subtract, and map cells where they differ by more than 0.5 m."
        },
        {
          "@type": "HowToStep",
          "name": "Decide",
          "text": "Pick the method with lower errors on the terrain that matters for the deliverable, or combine: agreed ground, then review disagreement areas."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Is CSF or SMRF better for forests?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Neither universally. In typical comparisons CSF gives smoother, continuous ground on gentle to moderate forested slopes with less tuning, while a well-tuned SMRF keeps steep gullies and banks sharper. Test both on a reference tile from your project."
          }
        },
        {
          "@type": "Question",
          "name": "Why do both filters struggle under dense canopy?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Few pulses reach the ground, so both work from sparse, unevenly spaced ground returns mixed with understorey near the soil. Any filter has to interpolate across gaps, and low vegetation is easily mistaken for ground."
          }
        },
        {
          "@type": "Question",
          "name": "Can I use both filters together?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. Accept points both call ground, then resolve disagreements by review or by a rule based on slope or land cover. The difference raster between their DTMs shows where that effort is needed."
          }
        },
        {
          "@type": "Question",
          "name": "How much does the choice matter for the DTM?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "On most cells the two agree within a few centimetres. The choice matters in a small share of the area \u2014 gullies, banks, dense understorey \u2014 which is often exactly where the DTM is used for hydrology or engineering."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Under forest canopy, both filters work from the sparse last returns that reach the ground. CSF tends to produce smoother, more continuous ground on gentle to moderate slopes with fewer parameters to tune; tuned SMRF tends to hold steep gully walls and ridge crests better. Run both on a reference tile, compare type I and type II errors and a DTM difference map, and choose per terrain — or combine them by accepting agreed ground and reviewing disagreements.

## Context and Motivation

This guide is part of [CSF Cloth Simulation Ground Filtering](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/csf-cloth-simulation-filter/). Forest is where ground filters earn their keep. Ground returns may be a small fraction of all returns, unevenly spread, and mixed with understorey only a metre above the soil. Two failure modes dominate: accepting low vegetation as ground, which lifts the DTM into lumpy mounds, and rejecting real ground on slopes and at breaks, which smooths away gullies and stream banks that matter for hydrology and forestry roads. The comparison below measures both for [SMRF](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) and CSF on the same data, so the choice is made on evidence.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Forest profile with ground surfaces from CSF and SMRF" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Two surfaces through the same canopy</title>
  <desc>A profile of forest terrain with a gully. Tree crowns sit above sparse ground returns. The true ground runs down into the gully and back up. The CSF surface follows gentle slopes smoothly but rounds off the gully walls. The SMRF surface follows the gully more closely but has a small bump where understorey was accepted as ground.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <g fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1"><ellipse cx="100" cy="60" rx="50" ry="30"/><ellipse cx="240" cy="54" rx="50" ry="30"/><ellipse cx="520" cy="56" rx="50" ry="30"/><ellipse cx="650" cy="62" rx="50" ry="30"/></g>
  <path d="M30 150 L300 160 L360 196 L420 162 L710 150" fill="none" stroke="var(--dg-line)" stroke-width="2"/>
  <path d="M30 148 L290 158 C340 176 380 178 430 160 L710 148" fill="none" stroke="var(--dg-a)" stroke-width="1.8" stroke-dasharray="6 3"/>
  <path d="M30 152 L150 154 L170 144 L190 156 L300 162 L358 192 L420 164 L710 152" fill="none" stroke="var(--dg-c)" stroke-width="1.8" stroke-dasharray="2 3"/>
  <text x="170" y="134" text-anchor="middle" font-size="10.5" fill="var(--dg-c)">SMRF bump</text>
  <text x="470" y="186" font-size="10.5" fill="var(--dg-a)">CSF rounds the gully</text>
  <text x="30" y="210" font-size="10.5" fill="var(--dg-muted)">grey: true ground · dashed: CSF · dotted: SMRF (illustrative)</text>
</svg>

## Prerequisites and Assumptions

- A forested reference tile with trusted ground, ideally including slopes and a gully or stream.
- PDAL 2.1+ with both filters; Python with NumPy, pandas and rasterio.
- Each filter tuned reasonably for the tile, not left at defaults — see [tuning CSF cloth resolution and rigidness](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/csf-cloth-simulation-filter/tuning-csf-cloth-resolution-and-rigidness/) and [tuning SMRF for forested terrain](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/tuning-smrf-for-forested-terrain/).

## Step-by-Step Implementation

### Step 1 — Freeze the reference classes

Copy the reference classification into `RefClass` so both runs compare against it in one array.

### Step 2 — Run both filters with identical preprocessing

Same noise removal, same reset of old ground, same input returns.

### Step 3 — Score both

Type I and type II error overall, and separately on steep cells (slope over 20°) where the methods usually differ most.

### Step 4 — Build both DTMs and difference them

Rasterize each method's ground at the same grid, subtract, and map cells where they differ by more than 0.5 m.

### Step 5 — Decide

Pick the method with lower errors on the terrain that matters for the deliverable, or combine: agreed ground, then review disagreement areas.

## Complete Working Example

```python
"""Score CSF and SMRF against a forest reference and difference their DTMs."""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pdal
import rasterio

REF = "reference/forest_ref_0822.laz"
PRE = [
    REF,
    {"type": "filters.range", "limits": "Classification![7:7],Classification![18:18]"},
    {"type": "filters.ferry", "dimensions": "Classification=>RefClass"},
    {"type": "filters.assign", "value": ["Classification = 1"]},
]
METHODS = {
    "csf": {"type": "filters.csf", "resolution": 1.0, "rigidness": 2, "threshold": 0.5, "smooth": True},
    "smrf": {"type": "filters.smrf", "cell": 1.0, "slope": 0.25, "window": 16, "threshold": 0.45, "scalar": 1.25},
}


def run(name: str, stage: dict) -> np.ndarray:
    spec = {"pipeline": PRE + [
        stage, {"type": "filters.hag_nn", "count": 2},
        {"type": "writers.gdal", "filename": f"out/{name}_dtm.tif", "resolution": 1.0,
         "output_type": "idw", "window_size": 6, "data_type": "float32",
         "where": "Classification == 2"},
    ]}
    p = pdal.Pipeline(json.dumps(spec))
    p.execute()
    return p.arrays[0]


def errors(a: np.ndarray) -> dict:
    ref, got = a["RefClass"] == 2, a["Classification"] == 2
    return {"type1": float((ref & ~got).sum() / ref.sum()),
            "type2": float((~ref & got).sum() / (~ref).sum()),
            "ground_pts": int(got.sum())}


if __name__ == "__main__":
    rows = {name: errors(run(name, stage)) for name, stage in METHODS.items()}
    print(pd.DataFrame(rows).T.round(4))

    with rasterio.open("out/csf_dtm.tif") as c, rasterio.open("out/smrf_dtm.tif") as s:
        d = c.read(1, masked=True) - s.read(1, masked=True)
    big = np.ma.abs(d) > 0.5
    print(f"CSF − SMRF median {np.ma.median(d):+.3f} m; |Δ| > 0.5 m on {big.mean():.1%} of cells")
```

Illustrative results for a mixed conifer tile with a stream gully:

```text
       type1   type2  ground_pts
csf   0.0374  0.0071     1204113
smrf  0.0288  0.0112     1231907
CSF − SMRF median -0.004 m; |Δ| > 0.5 m on 1.8% of cells
```

The two methods agree within half a metre on 98 percent of cells; the disagreement is concentrated in the gully (SMRF closer to reference) and in patches of dense understorey (CSF closer).

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Error rates of CSF and SMRF overall and on steep cells" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Where each method wins</title>
  <desc>Grouped bars of total error for CSF and SMRF on two subsets. On gentle terrain, CSF has 3.6 percent total error and SMRF 4.1 percent. On steep cells above 20 degrees, CSF has 9.8 percent and SMRF 6.9 percent. CSF wins on gentle ground, SMRF on steep ground.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="170" x2="680" y2="170" stroke="var(--dg-line)" stroke-width="1.3"/>
  <rect x="160" y="112" width="70" height="58" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/>
  <rect x="236" y="104" width="70" height="66" fill="var(--dg-c-soft)" stroke="var(--dg-c)"/>
  <rect x="440" y="14" width="70" height="156" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/>
  <rect x="516" y="60" width="70" height="110" fill="var(--dg-c-soft)" stroke="var(--dg-c)"/>
  <g font-size="10.5" fill="var(--dg-text)"><text text-anchor="middle" x="195" y="104">3.6 %</text><text text-anchor="middle" x="271" y="96">4.1 %</text><text text-anchor="middle" x="551" y="52">6.9 %</text></g>
  <text x="520" y="30" font-size="10.5" fill="var(--dg-text)">9.8 %</text>
  <text x="233" y="190" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">gentle terrain</text>
  <text x="513" y="190" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">steep cells (&gt; 20°)</text>
  <rect x="610" y="100" width="14" height="10" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text x="630" y="109" font-size="10" fill="var(--dg-muted)">CSF</text>
  <rect x="610" y="120" width="14" height="10" fill="var(--dg-c-soft)" stroke="var(--dg-c)"/><text x="630" y="129" font-size="10" fill="var(--dg-muted)">SMRF</text>
</svg>

## Key Parameter Table

| Aspect | CSF | SMRF |
|---|---|---|
| Main parameters | resolution, rigidness, threshold | cell, slope, window, threshold, scalar |
| Tuning effort | low | moderate |
| Gentle forested slopes | smooth, continuous ground | good, occasional understorey bumps |
| Steep gullies and banks | tends to round off | holds breaks better when slope is tuned |
| Dense understorey | rejects well with rigidness 2–3 | needs a low threshold |
| Run time on 1 km² tile | similar order; depends on cloth size | similar order; depends on window |

## Verification

- **Same preprocessing.** Confirm both runs saw the same number of input points; differences in noise handling make the comparison meaningless.
- **Subset scores.** Report errors on steep and gentle cells separately, as above; overall rates hide the trade-off.
- **Visual check of disagreements.** Overlay the |Δ| > 0.5 m mask on a hillshade and inspect a dozen patches in a point cloud viewer to see which method was right.

## Gotchas and Edge Cases

**Untuned comparisons.** Comparing tuned SMRF with default CSF, or the reverse, measures tuning effort rather than method. Give both a fair sweep.

**Leaf-on versus leaf-off.** Ground penetration differs hugely between seasons in deciduous forest. A comparison on leaf-off data does not transfer to leaf-on collections.

**Reference derived from one method.** If the reference was produced by editing SMRF output, it inherits SMRF's style, and SMRF will score better. Prefer references edited from scratch or from checkpoint surveys.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Combining two ground filters by agreement" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Agree, then review</title>
  <desc>Two overlapping sets of ground points from CSF and SMRF. Points both call ground are accepted automatically. Points only one method calls ground form two small crescents, sent for review or resolved by a rule such as preferring SMRF on steep cells and CSF elsewhere.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <ellipse cx="300" cy="85" rx="160" ry="62" fill="none" stroke="var(--dg-a)" stroke-width="1.8"/>
  <ellipse cx="440" cy="85" rx="160" ry="62" fill="none" stroke="var(--dg-c)" stroke-width="1.8"/>
  <text x="370" y="90" text-anchor="middle" font-size="11" fill="var(--dg-text)">both: accept</text>
  <text x="200" y="90" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">CSF only</text>
  <text x="540" y="90" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">SMRF only</text>
  <text x="370" y="164" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">disagreements: review, or rule by slope</text>
</svg>

**Combining methods.** An intersection of the two ground sets is conservative — few type II errors, more type I. Resolve disagreements with a rule such as "SMRF on steep cells, CSF elsewhere", computed from a slope raster, rather than a blanket union.

## Frequently Asked Questions

**Is CSF or SMRF better for forests?**

Neither universally. In typical comparisons CSF gives smoother, continuous ground on gentle to moderate forested slopes with less tuning, while a well-tuned SMRF keeps steep gullies and banks sharper. Test both on a reference tile from your project.

**Why do both filters struggle under dense canopy?**

Few pulses reach the ground, so both work from sparse, unevenly spaced ground returns mixed with understorey near the soil. Any filter has to interpolate across gaps, and low vegetation is easily mistaken for ground.

**Can I use both filters together?**

Yes. Accept points both call ground, then resolve disagreements by review or by a rule based on slope or land cover. The difference raster between their DTMs shows where that effort is needed.

**How much does the choice matter for the DTM?**

On most cells the two agree within a few centimetres. The choice matters in a small share of the area — gullies, banks, dense understorey — which is often exactly where the DTM is used for hydrology or engineering.

## Related

- [CSF Cloth Simulation Ground Filtering](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/csf-cloth-simulation-filter/) — how CSF works
- [Tuning SMRF for Forested Terrain](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/tuning-smrf-for-forested-terrain/) — getting SMRF right in forest
- [Tuning SMRF for Steep Terrain](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/tuning-smrf-for-steep-terrain/) — the steep-slope case
- [SMRF vs PMF for Dense Urban LiDAR](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/smrf-vs-pmf-for-dense-urban-lidar/) — the urban comparison
- [Measuring Ground Point Density Under Canopy](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/measuring-ground-point-density-under-canopy/) — how much ground there is to work with
