---
title: "Classifying Ground with filters.csf"
description: "A complete PDAL run of the cloth simulation filter on a LiDAR tile: noise removal, resetting old ground, filters.csf settings for rolling terrain, writing classified LAZ and a DTM in one pipeline, and checking the result."
slug: "classifying-ground-with-filters-csf"
type: "howto"
breadcrumb: "Ground with filters.csf"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Classifying Ground with filters.csf",
      "description": "A complete PDAL run of the cloth simulation filter on a LiDAR tile: noise removal, resetting old ground, filters.csf settings for rolling terrain, writing classified LAZ and a DTM in one pipeline, and checking the result.",
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
          "name": "Ground with filters.csf",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/csf-cloth-simulation-filter/classifying-ground-with-filters-csf/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Classify ground points with PDAL filters.csf",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Remove noise",
          "text": "A single low outlier becomes the top of the inverted cloud and catches the cloth. Drop classes 7 and 18 immediately after reading."
        },
        {
          "@type": "HowToStep",
          "name": "Reset previous ground",
          "text": "Move existing class 2 points to class 1 with filters.assign, so the output ground reflects CSF alone."
        },
        {
          "@type": "HowToStep",
          "name": "Run filters.csf",
          "text": "Resolution near ground spacing, rigidness 2 for rolling terrain, threshold 0.5 m, slope smoothing on."
        },
        {
          "@type": "HowToStep",
          "name": "Write both outputs",
          "text": "Tag the classified view, write it to LAZ, and branch a ground-only view to writers.gdal for the DTM."
        },
        {
          "@type": "HowToStep",
          "name": "Check the result",
          "text": "Compare ground share with neighbouring tiles, count ground points that are early returns, and render a hillshade."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is a good default configuration for filters.csf?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "For rolling terrain at about 8 to 15 points per square metre: resolution 1.0, rigidness 2, threshold 0.5 and slope smoothing on. Adjust rigidness for flat or steep terrain and resolution for density."
          }
        },
        {
          "@type": "Question",
          "name": "Why reset existing ground before running CSF?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "So the output reflects only CSF's decisions. Without the reset, points the vendor called ground stay ground even if CSF would reject them, which makes comparisons and tuning misleading."
          }
        },
        {
          "@type": "Question",
          "name": "Can I write the classified cloud and DTM in one run?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. Tag the stage after filters.csf, write it with writers.las, and start a second branch from that tag that keeps class 2 and ends in writers.gdal."
          }
        },
        {
          "@type": "Question",
          "name": "How do I know CSF worked on a tile?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Compare its ground share with neighbouring tiles, check that very few ground points are early returns of multi-return pulses, and inspect a hillshade of the DTM for bumps and flattened ridges."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Remove noise, reset any existing class 2 to 1, run `{"type": "filters.csf", "resolution": 1.0, "rigidness": 2, "threshold": 0.5}`, then write the classified cloud and a 1 m IDW DTM from ground points. Check the ground share against neighbouring tiles and inspect a hillshade before trusting it.

## Context and Motivation

This guide is part of [CSF Cloth Simulation Ground Filtering](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/csf-cloth-simulation-filter/). The topic explains how the cloth settles; this page is the shortest path from a raw tile to a classified cloud and terrain model, with the few decisions that actually matter made explicit. It suits a first pass on a new project, a comparison against an existing vendor classification, or a batch job where CSF has already been chosen.

The run below targets rolling terrain with mixed land cover — farmland, woodland and scattered buildings — which is where CSF's default behaviour is closest to right without tuning.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The CSF pipeline from reader to classified LAZ and DTM" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Five stages, two outputs</title>
  <desc>A pipeline of stages: readers.las, a range filter removing noise, filters.assign resetting old ground to class 1, and filters.csf. From there one branch writes the classified LAZ and another keeps class 2 and writes a DTM GeoTIFF.</desc>
  <defs><marker id="cg-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <g font-size="10.5" fill="var(--dg-text)">
    <rect x="16" y="76" width="100" height="44" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="66" y="102">readers.las</text>
    <rect x="136" y="76" width="110" height="44" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="191" y="102">drop 7, 18</text>
    <rect x="266" y="76" width="110" height="44" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="321" y="102">reset 2 → 1</text>
    <rect x="396" y="76" width="110" height="44" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="451" y="102">filters.csf</text>
    <rect x="560" y="24" width="160" height="44" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="640" y="50">classified LAZ</text>
    <rect x="560" y="128" width="160" height="44" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="640" y="154">class 2 → DTM</text>
  </g>
  <g stroke="var(--dg-line)" stroke-width="1.3"><line x1="116" y1="98" x2="132" y2="98" marker-end="url(#cg-arw)"/><line x1="246" y1="98" x2="262" y2="98" marker-end="url(#cg-arw)"/><line x1="376" y1="98" x2="392" y2="98" marker-end="url(#cg-arw)"/></g>
  <path d="M506 92 L530 92 L530 46 L556 46" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#cg-arw)"/>
  <path d="M506 104 L530 104 L530 150 L556 150" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#cg-arw)"/>
</svg>

## Prerequisites and Assumptions

- PDAL 2.1+ with `filters.csf` and the Python bindings.
- A tile in a projected CRS in metres, ideally with a 30–50 m buffer from its neighbours.
- Noise classified as 7 and 18, or an outlier step added before CSF.
- Ground point spacing around 1 m or finer (roughly 4+ last returns per m²).

## Step-by-Step Implementation

### Step 1 — Remove noise

A single low outlier becomes the top of the inverted cloud and catches the cloth. Drop classes 7 and 18 immediately after reading.

### Step 2 — Reset previous ground

Move existing class 2 points to class 1 with `filters.assign`, so the output ground reflects CSF alone.

### Step 3 — Run filters.csf

Resolution near ground spacing, rigidness 2 for rolling terrain, threshold 0.5 m, slope smoothing on.

### Step 4 — Write both outputs

Tag the classified view, write it to LAZ, and branch a ground-only view to `writers.gdal` for the DTM.

### Step 5 — Check the result

Compare ground share with neighbouring tiles, count ground points that are early returns, and render a hillshade.

## Complete Working Example

```json
{
  "pipeline": [
    { "type": "readers.las", "filename": "tiles/rolling_0417.laz" },
    { "type": "filters.range", "limits": "Classification![7:7],Classification![18:18]" },
    { "type": "filters.assign", "value": ["Classification = 1 WHERE Classification == 2"] },
    { "type": "filters.csf", "resolution": 1.0, "rigidness": 2, "threshold": 0.5,
      "smooth": true, "iterations": 500, "step": 0.65 },
    { "type": "writers.las", "filename": "out/rolling_0417_csf.laz",
      "minor_version": 4, "dataformat_id": 6, "forward": "all", "tag": "classified" },
    { "type": "filters.range", "inputs": ["classified"], "limits": "Classification[2:2]" },
    { "type": "writers.gdal", "filename": "out/rolling_0417_dtm.tif", "resolution": 1.0,
      "output_type": "idw", "window_size": 6, "data_type": "float32",
      "gdalopts": "COMPRESS=DEFLATE,TILED=YES" }
  ]
}
```

Run it and check the obvious things in Python:

```python
"""Run the CSF pipeline and print quick quality indicators."""
import json
import subprocess
from pathlib import Path

import numpy as np
import pdal

subprocess.run(["pdal", "pipeline", "csf_rolling.json"], check=True)

p = pdal.Pipeline(json.dumps({"pipeline": ["out/rolling_0417_csf.laz"]}))
p.execute()
a = p.arrays[0]
g = a["Classification"] == 2
early = a["ReturnNumber"] < a["NumberOfReturns"]
print(f"ground share {g.mean():.1%}")
print(f"ground points that are early returns: {(g & early).sum():,} ({(g & early).sum() / g.sum():.2%})")

subprocess.run(["gdaldem", "hillshade", "-multidirectional", "out/rolling_0417_dtm.tif",
                "out/rolling_0417_hs.tif"], check=True)
print("hillshade written for visual inspection:", Path("out/rolling_0417_hs.tif").exists())
```

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Ground share of the CSF tile compared with neighbouring tiles" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Is this tile in line with its neighbours?</title>
  <desc>Bars of ground share for the processed tile and its eight neighbours. The neighbours range from 41 to 52 percent. The processed tile, highlighted, shows 47 percent, well inside the range, which is a quick sign the run behaved normally.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <line x1="40" y1="170" x2="700" y2="170" stroke="var(--dg-line)" stroke-width="1.3"/>
  <g fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1"><rect x="60" y="72" width="50" height="98"/><rect x="130" y="62" width="50" height="108"/><rect x="200" y="80" width="50" height="90"/><rect x="270" y="66" width="50" height="104"/><rect x="410" y="58" width="50" height="112"/><rect x="480" y="76" width="50" height="94"/><rect x="550" y="70" width="50" height="100"/><rect x="620" y="84" width="50" height="86"/></g>
  <rect x="340" y="68" width="50" height="102" fill="var(--dg-a)"/>
  <text x="365" y="58" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">47 %</text>
  <text x="365" y="188" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">this tile</text>
  <text x="370" y="30" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">neighbours 41–52 % ground (illustrative)</text>
</svg>

## Running It Across a Project

The single-tile pipeline scales to a whole project with three additions. First, parameterize the input and output paths — command-line overrides are enough, `--readers.las.filename=... --stage.classified.filename=...` — so one validated JSON file serves every tile, as described in [overriding stage options from the command line](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-templating-parameterization/overriding-stage-options-from-the-command-line/). Second, feed each tile its neighbours' edge strips and add a crop before both writers, so every tile is classified with context and written without overlap. Third, keep the per-tile quality indicators — ground share, early-return ground count — in a CSV as each tile finishes.

That CSV is the most useful artefact of the batch. Sorted by ground share relative to the neighbourhood median, it tells you which few tiles to open in a viewer out of thousands. In practice most outliers are explained by land cover — a reservoir, a quarry, a dense town centre — and the handful that are not usually share a cause, such as a flight block with sparse ground returns where a coarser cloth helps.

CSF is single-threaded, so throughput comes from running tiles in parallel processes with `OMP_NUM_THREADS=1`; see [load balancing uneven LiDAR tiles](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/load-balancing-uneven-lidar-tiles/) for keeping every core busy when tile sizes vary.

## Key Parameter Table

| Option | Value here | When to change |
|---|---|---|
| `resolution` | 1.0 m | Finer for dense drone data, coarser (1.5–2) for sparse data |
| `rigidness` | 2 | 3 on flat land and in towns, 1 in mountains |
| `threshold` | 0.5 m | 0.3 m if low vegetation creeps into ground |
| `smooth` | true | Keep on unless the terrain is entirely flat |
| `iterations` | 500 | 200–300 on flat land to save time |
| DTM `resolution` | 1.0 m | Match ground density; see [choosing a DTM resolution](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/choosing-a-dtm-resolution-from-point-density/) |

## Verification

- **Ground share** within the range of similar neighbouring tiles.
- **Early-return ground** under about 1 percent of ground points; more means the cloth sagged into canopy.
- **Hillshade** free of building-shaped bumps and without flattened ridge lines.
- **Checkpoints**, if available: the DTM compared against surveyed ground as in [vertical accuracy assessment](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/).

## Gotchas and Edge Cases

**Buffered input, cropped output.** Run on a buffered tile and crop both outputs back to the nominal extent; otherwise edge effects appear as a frame around every tile in the mosaic.

**Existing ground classes.** Skipping the reset merges old and new ground. That can be intended — "accept vendor ground plus anything CSF finds" — but decide explicitly.

**Water.** Water returns few last returns, so the cloth spans lakes. The DTM then interpolates across water, which you will hydro-flatten later; see [hydro-flattening water bodies in a DTM](https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/hydro-flattening-water-bodies-in-a-dtm/).

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Edge artefacts from an unbuffered tile versus a buffered run" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Buffer, then crop</title>
  <desc>Two tile outlines. The unbuffered tile shows a band of unreliable ground classification along its edges. The buffered run processes a larger area whose unreliable band lies outside the nominal tile; cropping back keeps only the reliable interior.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <path d="M60 20 h260 v130 h-260 Z" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <path d="M80 40 h220 v90 h-220 Z" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="190" y="90" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">unbuffered: unreliable rim</text>
  <path d="M400 20 h300 v130 h-300 Z" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <path d="M420 40 h260 v90 h-260 Z" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.6"/>
  <text x="550" y="90" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">nominal tile: all reliable</text>
</svg>

**Very steep terrain.** Rolling-terrain settings cut off ridges and river banks in mountains. Move to rigidness 1 and consider slope-adaptive tuning, covered in [tuning CSF cloth resolution and rigidness](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/csf-cloth-simulation-filter/tuning-csf-cloth-resolution-and-rigidness/).

## Frequently Asked Questions

**What is a good default configuration for filters.csf?**

For rolling terrain at about 8 to 15 points per square metre: resolution 1.0, rigidness 2, threshold 0.5 and slope smoothing on. Adjust rigidness for flat or steep terrain and resolution for density.

**Why reset existing ground before running CSF?**

So the output reflects only CSF's decisions. Without the reset, points the vendor called ground stay ground even if CSF would reject them, which makes comparisons and tuning misleading.

**Can I write the classified cloud and DTM in one run?**

Yes. Tag the stage after filters.csf, write it with writers.las, and start a second branch from that tag that keeps class 2 and ends in writers.gdal.

**How do I know CSF worked on a tile?**

Compare its ground share with neighbouring tiles, check that very few ground points are early returns of multi-return pulses, and inspect a hillshade of the DTM for bumps and flattened ridges.

## Related

- [CSF Cloth Simulation Ground Filtering](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/csf-cloth-simulation-filter/) — how the method works
- [Tuning CSF Cloth Resolution and Rigidness](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/csf-cloth-simulation-filter/tuning-csf-cloth-resolution-and-rigidness/) — systematic tuning
- [CSF vs SMRF for Forested Ground](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/csf-cloth-simulation-filter/csf-vs-smrf-for-forested-ground/) — comparing methods
- [Generating a DTM GeoTIFF with writers.gdal](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/generating-a-dtm-geotiff-with-writers-gdal/) — the DTM branch
- [Removing Noise Classes Before Processing](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/removing-noise-classes-before-processing/) — why step 1 matters
