---
title: "Running SMRF on Photogrammetric Point Clouds"
description: "Classify ground in drone photogrammetry (structure-from-motion) point clouds with PDAL filters.smrf: why dense-matching clouds differ from LiDAR, thinning and noise removal, SMRF settings without return numbers, and where photogrammetric ground cannot be trusted."
slug: "running-smrf-on-photogrammetric-point-clouds"
type: "howto"
breadcrumb: "SMRF on Photogrammetry"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Running SMRF on Photogrammetric Point Clouds",
      "description": "Classify ground in drone photogrammetry (structure-from-motion) point clouds with PDAL filters.smrf: why dense-matching clouds differ from LiDAR, thinning and noise removal, SMRF settings without return numbers, and where photogrammetric ground cannot be trusted.",
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
          "name": "SMRF on Photogrammetry",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/running-smrf-on-photogrammetric-point-clouds/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Run SMRF ground classification on a photogrammetric point cloud",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Thin to a manageable density",
          "text": "Voxel thinning at 0.1\u20130.2 m keeps plenty of points for a 0.25\u20130.5 m DTM while cutting run time by an order of magnitude."
        },
        {
          "@type": "HowToStep",
          "name": "Remove matching noise",
          "text": "filters.outlier (statistical) removes floating blobs; a range filter on Z removes gross errors above and below the site."
        },
        {
          "@type": "HowToStep",
          "name": "Set return fields",
          "text": "Photogrammetric exports often leave ReturnNumber and NumberOfReturns at 0. SMRF by default considers \"last,only\" returns; set both fields to 1 with filters.assign so every point counts as an only return."
        },
        {
          "@type": "HowToStep",
          "name": "Run SMRF with fine settings",
          "text": "Small cell, tight threshold, window matched to the largest object on site (a stockpile, a building, a machine)."
        },
        {
          "@type": "HowToStep",
          "name": "Mask vegetation from ground",
          "text": "Use colour (a vegetation index from RGB) or height to identify canopy areas and exclude them from ground, reporting them as interpolated in the DTM."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Can SMRF classify ground in drone photogrammetry point clouds?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes, on open ground, with adjustments: thin the cloud, remove matching noise, set return numbers to 1, and use a finer cell and tighter threshold than for LiDAR. Under vegetation there are no ground points, so the result there is interpolation."
          }
        },
        {
          "@type": "Question",
          "name": "Why does SMRF find no ground in my photogrammetric cloud?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Usually because ReturnNumber and NumberOfReturns are zero, so SMRF's default filter for last and only returns selects nothing. Set both fields to 1 before running it, or change the returns option."
          }
        },
        {
          "@type": "Question",
          "name": "How dense should a photogrammetric cloud be for SMRF?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A few tens of points per square metre is plenty for a DTM at 0.25 to 0.5 metres. Thinning denser clouds speeds processing greatly with little effect on the result."
          }
        },
        {
          "@type": "Question",
          "name": "Is a photogrammetric DTM as accurate as a LiDAR DTM?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "On open, well-textured ground with good control it can be comparable. Under vegetation it cannot, because the ground is never seen. Report the vegetated area as interpolated."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Photogrammetric clouds are dense, single-surface and noisy, with no return numbers. Thin them to a few points per square metre with `filters.voxelcenternearestneighbor`, remove statistical outliers, then run `filters.smrf` with `returns` unrestricted (there are only "first" returns), a small `cell` (0.25–0.5 m), a tight `threshold` (0.15–0.3 m) and a window matched to the largest object. Treat classified "ground" under vegetation as unreliable: dense matching sees only the canopy.

## Context and Motivation

This guide is part of [SMRF Ground Classification](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/). Drone surveys increasingly produce point clouds from overlapping photographs rather than lasers. Structure-from-motion and dense image matching yield hundreds of points per square metre with colour, and SMRF can classify them — but three differences from LiDAR change how. There are no multiple returns: every point is the visible surface, so under trees there is no ground at all, only canopy. Density is very high and uneven, which makes SMRF slow and its grid choices different. And noise has a different character: matching errors produce fuzzy surfaces and occasional floating blobs rather than isolated low returns.

Handled correctly, SMRF produces good bare-earth models of open sites — quarries, construction sites, agricultural fields, stockpiles. Handled naively, it produces a DTM that follows the tree canopy.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="What LiDAR and photogrammetry each see under a tree" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>No returns beneath the canopy</title>
  <desc>Two side-by-side profiles of a tree over ground. LiDAR: pulses penetrate the canopy and produce last returns on the ground beneath, so SMRF can find ground there. Photogrammetry: points exist only on the visible top of the canopy; the ground beneath has no points, so any ground surface there is interpolated across the gap.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <text x="185" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">LiDAR</text>
  <text x="555" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">photogrammetry</text>
  <line x1="30" y1="180" x2="340" y2="180" stroke="var(--dg-line)" stroke-width="1.4"/>
  <line x1="400" y1="180" x2="710" y2="180" stroke="var(--dg-line)" stroke-width="1.4"/>
  <ellipse cx="185" cy="90" rx="80" ry="45" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <ellipse cx="555" cy="90" rx="80" ry="45" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <g fill="var(--dg-d)"><circle cx="150" cy="60" r="3"/><circle cx="190" cy="50" r="3"/><circle cx="220" cy="66" r="3"/><circle cx="170" cy="100" r="3"/><circle cx="200" cy="112" r="3"/></g>
  <g fill="var(--dg-a)"><circle cx="140" cy="177" r="3.5"/><circle cx="180" cy="177" r="3.5"/><circle cx="225" cy="177" r="3.5"/></g>
  <text x="185" y="200" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">last returns reach the ground</text>
  <g fill="var(--dg-c)"><circle cx="490" cy="70" r="3"/><circle cx="510" cy="58" r="3"/><circle cx="535" cy="50" r="3"/><circle cx="560" cy="47" r="3"/><circle cx="585" cy="50" r="3"/><circle cx="610" cy="58" r="3"/><circle cx="628" cy="70" r="3"/></g>
  <line x1="480" y1="180" x2="630" y2="180" stroke="var(--dg-e)" stroke-width="3" stroke-dasharray="4 4"/>
  <text x="555" y="200" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">no points: ground must be interpolated</text>
</svg>

## Prerequisites and Assumptions

- A photogrammetric point cloud in LAS/LAZ with a projected CRS, typically from software such as OpenDroneMap, Metashape or Pix4D.
- PDAL 2.x.
- Ground control used in the photogrammetric solution, so absolute heights are meaningful.
- An open or mostly open site; closed canopy cannot be classified meaningfully from images.

## Step-by-Step Implementation

### Step 1 — Thin to a manageable density

Voxel thinning at 0.1–0.2 m keeps plenty of points for a 0.25–0.5 m DTM while cutting run time by an order of magnitude.

### Step 2 — Remove matching noise

`filters.outlier` (statistical) removes floating blobs; a range filter on Z removes gross errors above and below the site.

### Step 3 — Set return fields

Photogrammetric exports often leave `ReturnNumber` and `NumberOfReturns` at 0. SMRF by default considers "last,only" returns; set both fields to 1 with `filters.assign` so every point counts as an only return.

### Step 4 — Run SMRF with fine settings

Small cell, tight threshold, window matched to the largest object on site (a stockpile, a building, a machine).

### Step 5 — Mask vegetation from ground

Use colour (a vegetation index from RGB) or height to identify canopy areas and exclude them from ground, reporting them as interpolated in the DTM.

## Complete Working Example

```json
{
  "pipeline": [
    { "type": "readers.las", "filename": "drone/quarry_2026_08.laz" },
    { "type": "filters.voxelcenternearestneighbor", "cell": 0.15 },
    { "type": "filters.outlier", "method": "statistical", "mean_k": 16, "multiplier": 2.2 },
    { "type": "filters.range", "limits": "Classification![7:7]" },
    { "type": "filters.assign", "value": [
        "ReturnNumber = 1", "NumberOfReturns = 1", "Classification = 1" ] },
    { "type": "filters.smrf", "cell": 0.4, "slope": 0.3, "window": 20,
      "threshold": 0.2, "scalar": 1.2 },
    { "type": "writers.las", "filename": "out/quarry_ground.laz", "minor_version": 4,
      "dataformat_id": 7, "forward": "all", "tag": "classified" },
    { "type": "filters.range", "inputs": ["classified"], "limits": "Classification[2:2]" },
    { "type": "writers.gdal", "filename": "out/quarry_dtm_025.tif", "resolution": 0.25,
      "radius": 0.35, "output_type": "idw", "window_size": 8, "data_type": "float32" }
  ]
}
```

A vegetation mask from RGB, excluding green points from ground after the fact:

```python
"""Remove likely vegetation from photogrammetric ground using an RGB index."""
import json

import numpy as np
import pdal

p = pdal.Pipeline(json.dumps({"pipeline": ["out/quarry_ground.laz"]}))
p.execute()
a = p.arrays[0]
r, g, b = (a[c].astype(float) for c in ("Red", "Green", "Blue"))
exg = (2 * g - r - b) / np.maximum(r + g + b, 1)          # excess green, about -1 to 1
veg = exg > 0.08
changed = (a["Classification"] == 2) & veg
a["Classification"][changed] = 3                          # low vegetation, pending review
pdal.Writer.las(filename="out/quarry_ground_vegmask.laz", minor_version=4,
                dataformat_id=7, forward="all").pipeline(a).execute()
print(f"{changed.sum():,} ground points reassigned as vegetation ({changed.mean():.1%})")
```

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Run time and ground quality against voxel thinning size" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Thinning buys speed cheaply</title>
  <desc>Bars of SMRF run time on a drone photogrammetry site for four voxel sizes. With no thinning at about 400 points per square metre, the run takes 21 minutes. At 0.1 metre voxels, 4 minutes. At 0.15 metres, 2 minutes. At 0.3 metres, 40 seconds. DTM differences from the unthinned result stay under 2 centimetres up to 0.15 metre voxels.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <g font-size="11" fill="var(--dg-text)"><text text-anchor="end" x="200" y="44">no thinning</text><text text-anchor="end" x="200" y="84">0.10 m voxels</text><text text-anchor="end" x="200" y="124">0.15 m voxels</text><text text-anchor="end" x="200" y="164">0.30 m voxels</text></g>
  <rect x="210" y="30" width="460" height="20" fill="var(--dg-e)"/>
  <rect x="210" y="70" width="88" height="20" fill="var(--dg-c)"/>
  <rect x="210" y="110" width="44" height="20" fill="var(--dg-d)"/>
  <rect x="210" y="150" width="15" height="20" fill="var(--dg-d)"/>
  <g font-size="10.5" fill="var(--dg-muted)"><text x="662" y="66" text-anchor="end">21 min</text><text x="306" y="85">4 min</text><text x="262" y="125">2 min · Δ &lt; 2 cm</text><text x="233" y="165">40 s · Δ ≈ 5 cm</text></g>
  <text x="210" y="198" font-size="10.5" fill="var(--dg-muted)">illustrative 12 ha site</text>
</svg>

## Key Parameter Table

| Setting | LiDAR typical | Photogrammetry typical | Reason |
|---|---|---|---|
| voxel thinning | none | 0.1–0.2 m | Hundreds of pts/m² are unnecessary for SMRF |
| `cell` | 1.0 m | 0.25–0.5 m | Dense data supports a finer minimum surface |
| `threshold` | 0.5 m | 0.15–0.3 m | Matched surfaces are smoother on bare ground |
| `window` | 18 m | size of largest object | Stockpiles and buildings set it |
| return fields | from sensor | set to 1 | SMRF's default return filter needs them |
| vegetation handling | returns reach ground | mask and interpolate | No ground under canopy |

## Verification

- **Checkpoints on open ground.** Compare the DTM with GNSS checkpoints on hard surfaces; photogrammetric DTMs on open ground often reach a few centimetres.
- **Vegetated areas flagged.** Map where the vegetation mask removed ground; the DTM there is interpolation and should be labelled so.
- **Stockpile edges.** Profile across a stockpile toe; SMRF should classify the toe as ground and the pile as non-ground, not cut into the pile.

## Gotchas and Edge Cases

**Zero return numbers.** If `ReturnNumber` is 0, SMRF's default `returns: "last,only"` may select nothing, and the output has no ground at all. Set the fields, or set `returns` explicitly.

**Doming and bowling.** Photogrammetric solutions without enough ground control can bend the whole surface by decimetres. No ground filter fixes that; check the block's residuals and control distribution.

**Shadows and water.** Dark shadows and water surfaces match poorly and produce noise or holes. The outlier filter removes the worst; flatten water separately.

<svg viewBox="10 74 720 110" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Surface doming from weak ground control" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Doming is not a classification problem</title>
  <desc>A flat site surface drawn as a straight line, and the photogrammetric surface bowed upward in the middle by about 0.3 metres because ground control was only placed around the edges. Checkpoints near the centre reveal the bow. Ground classification cannot remove it; the photogrammetric solution must be redone with better control.</desc>
  <rect x="10" y="74" width="720" height="110" fill="var(--dg-bg)" rx="10"/>
  <line x1="40" y1="130" x2="700" y2="130" stroke="var(--dg-line)" stroke-width="1.6"/>
  <path d="M40 130 C200 80 540 80 700 130" fill="none" stroke="var(--dg-e)" stroke-width="2"/>
  <g fill="var(--dg-c)"><path d="M34 140 L40 128 L46 140 Z"/><path d="M694 140 L700 128 L706 140 Z"/></g>
  <circle cx="370" cy="130" r="5" fill="var(--dg-a)"/>
  <line x1="370" y1="93" x2="370" y2="126" stroke="var(--dg-e)" stroke-width="1.4"/>
  <text x="378" y="112" font-size="10.5" fill="var(--dg-e)">≈ 0.3 m dome</text>
  <text x="40" y="160" font-size="10.5" fill="var(--dg-muted)">triangles: control only at the edges · dot: central checkpoint</text>
</svg>

**Colour-based masks.** Excess-green works on healthy vegetation in daylight. Dry grass, autumn leaves and shaded canopy need other cues — height above the SMRF surface is often more robust.

## Frequently Asked Questions

**Can SMRF classify ground in drone photogrammetry point clouds?**

Yes, on open ground, with adjustments: thin the cloud, remove matching noise, set return numbers to 1, and use a finer cell and tighter threshold than for LiDAR. Under vegetation there are no ground points, so the result there is interpolation.

**Why does SMRF find no ground in my photogrammetric cloud?**

Usually because ReturnNumber and NumberOfReturns are zero, so SMRF's default filter for last and only returns selects nothing. Set both fields to 1 before running it, or change the returns option.

**How dense should a photogrammetric cloud be for SMRF?**

A few tens of points per square metre is plenty for a DTM at 0.25 to 0.5 metres. Thinning denser clouds speeds processing greatly with little effect on the result.

**Is a photogrammetric DTM as accurate as a LiDAR DTM?**

On open, well-textured ground with good control it can be comparable. Under vegetation it cannot, because the ground is never seen. Report the vegetated area as interpolated.

## Related

- [SMRF Ground Classification](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) — the filter in general
- [Passing NumPy Arrays into a PDAL Pipeline](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/passing-numpy-arrays-into-a-pdal-pipeline/) — feeding photogrammetry exports to PDAL
- [Calculating Point Density for Drone Surveys](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/calculating-point-density-for-drone-surveys/) — density of UAV data
- [Choosing a DTM Resolution from Point Density](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/choosing-a-dtm-resolution-from-point-density/) — raster size for dense clouds
- [Applying Statistical Outlier Filters in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/applying-statistical-outlier-filters-in-pdal/) — the noise step
