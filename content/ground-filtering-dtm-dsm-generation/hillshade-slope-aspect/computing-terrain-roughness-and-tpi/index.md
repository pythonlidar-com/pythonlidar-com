---
title: "Computing Terrain Roughness and TPI"
description: "Derive terrain ruggedness, roughness and topographic position index (TPI) from a LiDAR DTM with gdaldem and NumPy: definitions, choosing neighbourhood radii, multi-scale TPI with annulus windows, and classifying ridges, valleys and slopes."
slug: "computing-terrain-roughness-and-tpi"
type: "howto"
breadcrumb: "Roughness and TPI"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Computing Terrain Roughness and TPI",
      "description": "Derive terrain ruggedness, roughness and topographic position index (TPI) from a LiDAR DTM with gdaldem and NumPy: definitions, choosing neighbourhood radii, multi-scale TPI with annulus windows, and classifying ridges, valleys and slopes.",
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
          "name": "Hillshade, Slope & Aspect",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Roughness and TPI",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/computing-terrain-roughness-and-tpi/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Compute terrain roughness and topographic position index from a DTM",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Quick 3\u00d73 indices with gdaldem",
          "text": "TRI (mean absolute difference to the 8 neighbours), TPI (difference to the mean of neighbours) and roughness (max \u2212 min in the window). Useful for micro-relief and data-quality checks."
        },
        {
          "@type": "HowToStep",
          "name": "Choose landform radii",
          "text": "Pick inner and outer radii for an annulus that matches the features of interest; excluding the centre avoids the cell's own neighbourhood dominating."
        },
        {
          "@type": "HowToStep",
          "name": "Compute annulus TPI",
          "text": "Convolve the DTM with a normalized annulus kernel (FFT convolution is fast for large radii) and subtract."
        },
        {
          "@type": "HowToStep",
          "name": "Standardize",
          "text": "Divide by the TPI's standard deviation so values are comparable across scales and areas."
        },
        {
          "@type": "HowToStep",
          "name": "Classify",
          "text": "Standardized TPI above +1: ridge or upper slope; below \u22121: valley or lower slope; between: mid-slope if slope > 5\u00b0, flat otherwise."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the topographic position index?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The difference between a cell's elevation and the mean elevation of its neighbourhood. Positive values mean the cell is higher than its surroundings, as on ridges; negative values mean lower, as in valleys; values near zero indicate uniform slopes or flat ground."
          }
        },
        {
          "@type": "Question",
          "name": "Which neighbourhood size should I use for TPI?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "One matched to the landforms of interest. Tens of metres pick out field-scale features such as banks and ditches; hundreds of metres identify hillslope positions. Using several scales and comparing them is common."
          }
        },
        {
          "@type": "Question",
          "name": "What is the difference between TRI and roughness?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "TRI is the mean absolute elevation difference between a cell and its eight neighbours; roughness is the range, maximum minus minimum, within the 3 by 3 window. Both measure local ruggedness."
          }
        },
        {
          "@type": "Question",
          "name": "Why standardize TPI?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Raw TPI values depend on relief and neighbourhood size, so thresholds do not transfer between areas or scales. Dividing by the standard deviation makes values comparable and lets fixed thresholds classify landforms."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** `gdaldem TRI`, `gdaldem TPI` and `gdaldem roughness` compute 3×3 ruggedness, topographic position and roughness in one command each. On a 1 m LiDAR DTM a 3×3 window measures micro-relief only, so for landform work compute TPI in Python as elevation minus the mean of an annulus of 20–200 m radius, standardize it, and classify ridges (high TPI), valleys (low TPI) and slopes or flats (near zero, split by slope).

## Context and Motivation

This guide is part of [Hillshade, Slope and Aspect](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/). Slope and aspect describe a surface point by point. Many questions need a neighbourhood view instead: is this cell higher or lower than its surroundings, how rugged is the terrain here, is this a ridge, a valley bottom or a mid-slope? Terrain indices answer that. They feed habitat models, landslide susceptibility, soil mapping, hydrological modelling and archaeological prospection. LiDAR DTMs make them very detailed — sometimes too detailed: indices designed for 30 m DEMs capture only centimetre-scale texture when applied with a 3×3 window at 1 m. The key decision is the neighbourhood scale.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Topographic position index along a profile with ridge, slope and valley" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Higher or lower than the neighbourhood</title>
  <desc>A terrain profile with a ridge, a slope and a valley. Below it, the TPI profile: positive where the terrain rises above the mean of its surroundings, at the ridge; negative in the valley; near zero on the uniform slope and on flat ground. Labels mark ridge, slope and valley classes.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <path d="M30 110 L150 100 L230 40 L310 100 L430 120 L520 160 L600 120 L710 110" fill="none" stroke="var(--dg-line)" stroke-width="2"/>
  <line x1="30" y1="180" x2="710" y2="180" stroke="var(--dg-line-soft)" stroke-width="1" stroke-dasharray="4 3"/>
  <path d="M30 180 L150 176 L230 146 L310 176 L430 180 L520 206 L600 180 L710 180" fill="none" stroke="var(--dg-a)" stroke-width="2"/>
  <text x="230" y="32" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">ridge: TPI &gt; 0</text>
  <text x="380" y="96" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">slope: TPI ≈ 0</text>
  <text x="520" y="150" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">valley: TPI &lt; 0</text>
  <text x="700" y="172" text-anchor="end" font-size="10" fill="var(--dg-muted)">TPI = 0</text>
  <text x="30" y="212" font-size="10" fill="var(--dg-muted)">upper: elevation · lower: TPI at a neighbourhood radius wider than the ridge</text>
</svg>

## Prerequisites and Assumptions

- A void-filled bare-earth DTM in a projected CRS with metric units.
- GDAL command-line tools; NumPy, SciPy and rasterio for multi-scale indices.
- A target landform scale: field-scale features (20–50 m), hillslopes (100–300 m) or regional landforms (500 m+).

## Step-by-Step Implementation

### Step 1 — Quick 3×3 indices with gdaldem

TRI (mean absolute difference to the 8 neighbours), TPI (difference to the mean of neighbours) and roughness (max − min in the window). Useful for micro-relief and data-quality checks.

### Step 2 — Choose landform radii

Pick inner and outer radii for an annulus that matches the features of interest; excluding the centre avoids the cell's own neighbourhood dominating.

### Step 3 — Compute annulus TPI

Convolve the DTM with a normalized annulus kernel (FFT convolution is fast for large radii) and subtract.

### Step 4 — Standardize

Divide by the TPI's standard deviation so values are comparable across scales and areas.

### Step 5 — Classify

Standardized TPI above +1: ridge or upper slope; below −1: valley or lower slope; between: mid-slope if slope > 5°, flat otherwise.

## Complete Working Example

Command line, 3×3 indices:

```bash
gdaldem TRI mosaic/dtm_1m.tif out/tri_3x3.tif -compute_edges
gdaldem TPI mosaic/dtm_1m.tif out/tpi_3x3.tif -compute_edges
gdaldem roughness mosaic/dtm_1m.tif out/rough_3x3.tif -compute_edges
```

Python, multi-scale annulus TPI and a simple landform classification:

```python
"""Multi-scale annulus TPI and a slope-position classification from a DTM."""
from __future__ import annotations

import numpy as np
import rasterio
from scipy.signal import fftconvolve


def annulus(inner_cells: int, outer_cells: int) -> np.ndarray:
    y, x = np.ogrid[-outer_cells:outer_cells + 1, -outer_cells:outer_cells + 1]
    r = np.hypot(x, y)
    k = ((r >= inner_cells) & (r <= outer_cells)).astype(float)
    return k / k.sum()


def tpi(z: np.ndarray, inner_m: float, outer_m: float, res: float) -> np.ndarray:
    k = annulus(max(1, int(inner_m / res)), int(outer_m / res))
    valid = ~np.isnan(z)
    zf = np.where(valid, z, 0.0)
    num = fftconvolve(zf, k, mode="same")
    den = fftconvolve(valid.astype(float), k, mode="same")
    mean = num / np.maximum(den, 1e-6)
    return np.where(valid, z - mean, np.nan)


with rasterio.open("mosaic/dtm_1m.tif") as ds:
    z = ds.read(1, masked=True).filled(np.nan).astype(float)
    profile, res = ds.profile, ds.res[0]

tpi_small = tpi(z, 5, 30, res)        # field-scale features
tpi_large = tpi(z, 50, 250, res)      # hillslope position
std = (tpi_large - np.nanmean(tpi_large)) / np.nanstd(tpi_large)

gy, gx = np.gradient(z, res)
slope = np.degrees(np.arctan(np.hypot(gx, gy)))
cls = np.full(z.shape, 0, dtype="uint8")
cls[std > 1] = 1                                   # ridge / upper slope
cls[std < -1] = 4                                  # valley / lower slope
mid = (std >= -1) & (std <= 1)
cls[mid & (slope > 5)] = 2                         # mid-slope
cls[mid & (slope <= 5)] = 3                        # flat
cls[np.isnan(z)] = 255

profile.update(dtype="uint8", nodata=255)
with rasterio.open("out/slope_position.tif", "w", **profile) as out:
    out.write(cls, 1)
print({name: f"{np.mean(cls == v):.1%}" for v, name in
       {1: "ridge", 2: "mid-slope", 3: "flat", 4: "valley"}.items()})
```

FFT convolution handles a 250-cell radius on a 5000 × 5000 raster in seconds; a direct convolution would take hours.

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Annulus neighbourhoods at small and large scales" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Scale is set by the annulus</title>
  <desc>Two plan views centred on the same cell. A small annulus of 5 to 30 metres captures field-scale features such as a bank or ditch next to the cell. A large annulus of 50 to 250 metres compares the cell with the surrounding hillslope, identifying ridges and valleys. The centre of each annulus is excluded.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <text x="185" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">5–30 m: field features</text>
  <text x="555" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">50–250 m: hillslope position</text>
  <circle cx="185" cy="115" r="60" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <circle cx="185" cy="115" r="12" fill="var(--dg-bg)" stroke="var(--dg-a)" stroke-width="1"/>
  <circle cx="185" cy="115" r="3" fill="var(--dg-e)"/>
  <circle cx="555" cy="115" r="75" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <circle cx="555" cy="115" r="16" fill="var(--dg-bg)" stroke="var(--dg-b)" stroke-width="1"/>
  <circle cx="555" cy="115" r="3" fill="var(--dg-e)"/>
  <text x="185" y="198" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">centre excluded; shaded ring is averaged</text>
  <text x="555" y="198" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">not to scale</text>
</svg>

## Key Parameter Table

| Index | Tool | Definition | Scale |
|---|---|---|---|
| TRI | `gdaldem TRI` | Mean absolute difference to 8 neighbours | 3×3 |
| TPI | `gdaldem TPI` | Cell minus mean of 8 neighbours | 3×3 |
| Roughness | `gdaldem roughness` | Max − min in 3×3 | 3×3 |
| Annulus TPI | NumPy/SciPy | Cell minus annulus mean | chosen radii |
| Standardized TPI | NumPy | TPI ÷ its standard deviation | comparable across scales |
| Slope position | rules | TPI and slope thresholds | per landform scale |

## Verification

- **Known landforms.** Ridge crests and valley bottoms visible in a hillshade should fall into the right classes at the large scale.
- **Scale sanity.** The small-scale TPI should highlight banks and ditches; the large-scale TPI should not respond to them.
- **Edge effects.** Within one outer radius of the raster edge, the annulus is truncated; the normalized convolution handles it, but classes there are less reliable. Compute on a mosaic larger than the area of interest.

## Gotchas and Edge Cases

**3×3 on LiDAR measures noise.** At 1 m, 3×3 TRI and roughness respond to ploughing, vegetation residue and interpolation texture. They are good data-quality indicators and poor landform indicators.

**Buildings in the DTM.** Unfiltered buildings create strong positive TPI spikes. Use a clean bare-earth DTM.

**Non-comparable raw TPI.** Raw TPI grows with relief and radius, so thresholds on raw values do not transfer. Standardize before classifying.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Raw TPI ranges at three radii compared with standardized values" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Standardize before thresholding</title>
  <desc>Bars showing the spread of raw TPI for three annulus sizes on the same DTM: about plus or minus 0.3 metres at 30 metres radius, plus or minus 4 metres at 250 metres, and plus or minus 12 metres at 1,000 metres. After standardization all three span roughly plus or minus 3, so the same thresholds apply.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <line x1="370" y1="20" x2="370" y2="130" stroke="var(--dg-line-soft)" stroke-width="1" stroke-dasharray="4 3"/>
  <g font-size="10.5" fill="var(--dg-text)"><text text-anchor="end" x="150" y="42">30 m</text><text text-anchor="end" x="150" y="78">250 m</text><text text-anchor="end" x="150" y="114">1,000 m</text></g>
  <rect x="362" y="30" width="16" height="16" fill="var(--dg-a)"/>
  <rect x="270" y="66" width="200" height="16" fill="var(--dg-a)"/>
  <rect x="170" y="102" width="400" height="16" fill="var(--dg-a)"/>
  <g font-size="10" fill="var(--dg-muted)"><text x="386" y="43">±0.3 m</text><text x="478" y="79">±4 m</text><text x="578" y="115">±12 m</text></g>
  <text x="370" y="156" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">raw TPI spread by radius; standardized, all span about ±3</text>
</svg>

**Memory.** FFT convolution needs several copies of the raster in float64. For county-scale mosaics, process in overlapping blocks with a margin of one outer radius.

## Frequently Asked Questions

**What is the topographic position index?**

The difference between a cell's elevation and the mean elevation of its neighbourhood. Positive values mean the cell is higher than its surroundings, as on ridges; negative values mean lower, as in valleys; values near zero indicate uniform slopes or flat ground.

**Which neighbourhood size should I use for TPI?**

One matched to the landforms of interest. Tens of metres pick out field-scale features such as banks and ditches; hundreds of metres identify hillslope positions. Using several scales and comparing them is common.

**What is the difference between TRI and roughness?**

TRI is the mean absolute elevation difference between a cell and its eight neighbours; roughness is the range, maximum minus minimum, within the 3 by 3 window. Both measure local ruggedness.

**Why standardize TPI?**

Raw TPI values depend on relief and neighbourhood size, so thresholds do not transfer between areas or scales. Dividing by the standard deviation makes values comparable and lets fixed thresholds classify landforms.

## Related

- [Hillshade, Slope and Aspect](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/) — terrain derivatives overview
- [Generating Slope and Aspect Rasters with gdaldem](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/generating-slope-and-aspect-rasters-with-gdaldem/) — the slope input to classification
- [Multidirectional Hillshade for LiDAR DTMs](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/multidirectional-hillshade-for-lidar-dtms/) — visual interpretation alongside indices
- [Smoothing a LiDAR DTM Before Contouring](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/contour-generation/smoothing-a-lidar-dtm-before-contouring/) — normalized convolution in another context
- [Building a Seamless DTM Mosaic from Tiles](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/building-a-seamless-dtm-mosaic-from-tiles/) — avoiding edge effects
