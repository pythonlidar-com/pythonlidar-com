---
title: "Smoothing a LiDAR DTM Before Contouring"
description: "Choose and tune the smoothing applied to a LiDAR DTM before contouring: Gaussian, median and resample-based smoothing, NoData-aware filtering, measuring how far smoothing moves the surface, and keeping breaklines sharp."
slug: "smoothing-a-lidar-dtm-before-contouring"
type: "howto"
breadcrumb: "Smoothing Before Contouring"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Smoothing a LiDAR DTM Before Contouring",
      "description": "Choose and tune the smoothing applied to a LiDAR DTM before contouring: Gaussian, median and resample-based smoothing, NoData-aware filtering, measuring how far smoothing moves the surface, and keeping breaklines sharp.",
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
          "name": "Contour Generation",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/contour-generation/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Smoothing Before Contouring",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/contour-generation/smoothing-a-lidar-dtm-before-contouring/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Smooth a LiDAR DTM before generating contours",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Smooth with NoData awareness",
          "text": "Filter values and a validity mask separately and divide, so NoData neither spreads nor pulls edge values toward the fill value."
        },
        {
          "@type": "HowToStep",
          "name": "Measure the change",
          "text": "Compute \u0394z = smoothed \u2212 original on valid cells and summarize: median, 95th and 99th percentiles of |\u0394z|."
        },
        {
          "@type": "HowToStep",
          "name": "Compare with the interval",
          "text": "A reasonable ceiling: 95th percentile of |\u0394z| under a quarter of the contour interval. Beyond that, smoothing is moving contours visibly."
        },
        {
          "@type": "HowToStep",
          "name": "Sweep sigma",
          "text": "Try 0.5, 1, 1.5, 2, 3 cells; contour each and count closed loops shorter than a threshold. Choose the smallest sigma at which loops drop off."
        },
        {
          "@type": "HowToStep",
          "name": "Protect breaklines if required",
          "text": "Blend the original back in along masked features: out = where(mask, original, smoothed), with a feathered mask to avoid steps."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How much should I smooth a DTM before contouring?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Enough to remove micro-relief below the scale the contours represent, but not so much that the surface moves by more than about a quarter of the contour interval. For a 1 metre DTM and 0.5 metre contours, a Gaussian sigma of 1 to 2 cells is typical."
          }
        },
        {
          "@type": "Question",
          "name": "Gaussian or median filter?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Gaussian for general micro-relief such as furrows and interpolation texture; median where isolated spikes or pits remain. Median filters preserve edges better but can look blocky on smooth slopes."
          }
        },
        {
          "@type": "Question",
          "name": "Does smoothing change the accuracy of the DTM?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It changes the surface slightly, so it should be applied to a contouring copy, not the delivered DTM. Measure the change and keep it well below the vertical accuracy."
          }
        },
        {
          "@type": "Question",
          "name": "How do I avoid smoothing across NoData?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Filter the values with NoData set to zero and a separate validity mask, then divide the two results. This normalized filter keeps edge values correct and leaves voids untouched."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Apply a NoData-aware Gaussian filter with sigma of 1–2 cells to a 1 m DTM, measure the change against the original (the 95th percentile of |Δz| should stay well below half the contour interval), and increase sigma only if contours still zigzag or form tiny loops. Use a median filter instead where spikes remain, and mask breaklines such as road edges and river banks if they must stay sharp.

## Context and Motivation

This guide is part of [Contour Generation from LiDAR DTMs](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/contour-generation/). A 1 m LiDAR DTM records relief at a scale no contour map intends to show: plough furrows, tyre ruts, residual low vegetation, interpolation texture. Contouring it directly draws every one of those, so lines zigzag and flat fields fill with small closed loops. Smoothing removes relief below a chosen scale before contouring. Done well, it changes the surface by a few centimetres and makes the contours readable; done badly, it rounds ridges, fills ditches and moves lines by more than the data's own accuracy. The difference is measurement.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A terrain profile before and after light and heavy smoothing" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Light versus heavy smoothing</title>
  <desc>A terrain profile with fine noise, a drainage ditch and a ridge. Light smoothing with sigma 1.5 cells removes the noise but keeps the ditch and ridge nearly intact. Heavy smoothing with sigma 6 cells removes the noise and also fills the ditch and lowers the ridge noticeably, moving contours by more than the data's accuracy.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <polyline points="30,140 60,136 80,142 110,134 140,140 170,136 200,142 230,138 250,170 270,172 290,140 320,136 350,120 380,80 400,60 420,82 450,118 480,134 510,138 540,134 570,140 600,136 630,140 660,136 710,138" fill="none" stroke="var(--dg-line)" stroke-width="1.4"/>
  <path d="M30 139 C120 138 200 139 235 142 C250 164 270 166 285 144 C320 136 350 122 380 84 C395 66 405 66 420 84 C450 118 500 136 710 137" fill="none" stroke="var(--dg-a)" stroke-width="2"/>
  <path d="M30 139 C150 139 220 142 260 148 C300 144 340 126 380 100 C400 90 410 90 430 100 C470 124 520 136 710 138" fill="none" stroke="var(--dg-e)" stroke-width="2" stroke-dasharray="6 4"/>
  <text x="270" y="190" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">heavy: ditch filled</text>
  <text x="410" y="44" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">heavy: ridge lowered</text>
  <text x="560" y="110" font-size="10.5" fill="var(--dg-a)">light: σ = 1.5 cells</text>
  <text x="30" y="210" font-size="10.5" fill="var(--dg-muted)">grey: original 1 m DTM · solid: light smoothing · dashed: heavy smoothing</text>
</svg>

## Prerequisites and Assumptions

- A void-filled DTM GeoTIFF with NoData set.
- Python with rasterio, NumPy and SciPy.
- The planned contour interval, which sets how much smoothing change is acceptable.
- Optionally, breakline polygons or a mask of features that must not be smoothed.

## Step-by-Step Implementation

### Step 1 — Smooth with NoData awareness

Filter values and a validity mask separately and divide, so NoData neither spreads nor pulls edge values toward the fill value.

### Step 2 — Measure the change

Compute Δz = smoothed − original on valid cells and summarize: median, 95th and 99th percentiles of |Δz|.

### Step 3 — Compare with the interval

A reasonable ceiling: 95th percentile of |Δz| under a quarter of the contour interval. Beyond that, smoothing is moving contours visibly.

### Step 4 — Sweep sigma

Try 0.5, 1, 1.5, 2, 3 cells; contour each and count closed loops shorter than a threshold. Choose the smallest sigma at which loops drop off.

### Step 5 — Protect breaklines if required

Blend the original back in along masked features: `out = where(mask, original, smoothed)`, with a feathered mask to avoid steps.

## Complete Working Example

```python
"""Sweep Gaussian smoothing of a DTM and report surface change and contour clutter."""
from __future__ import annotations

import numpy as np
import rasterio
from scipy import ndimage as ndi
from skimage import measure

DTM = "mosaic/county_north_dtm_1m.tif"
INTERVAL = 0.5


def smooth(z: np.ndarray, valid: np.ndarray, sigma: float) -> np.ndarray:
    num = ndi.gaussian_filter(np.where(valid, z, 0.0), sigma)
    den = ndi.gaussian_filter(valid.astype(float), sigma)
    return np.where(valid, num / np.maximum(den, 1e-6), np.nan)


def small_loops(z: np.ndarray, interval: float, max_len_cells: float = 40) -> int:
    levels = np.arange(np.nanmin(z) // interval * interval + interval, np.nanmax(z), interval)
    zz = np.where(np.isnan(z), np.nanmin(z) - 1000, z)
    count = 0
    for lv in levels:
        for c in measure.find_contours(zz, lv):
            closed = np.allclose(c[0], c[-1])
            length = np.sum(np.hypot(*np.diff(c, axis=0).T))
            count += int(closed and length < max_len_cells)
    return count


with rasterio.open(DTM) as ds:
    window = rasterio.windows.Window(0, 0, 2000, 2000)       # a 2 km test block
    z = ds.read(1, window=window, masked=True).filled(np.nan).astype(float)
valid = ~np.isnan(z)

print(f"{'sigma':>6} {'p50|dz|':>9} {'p95|dz|':>9} {'p99|dz|':>9} {'small loops':>12}")
for sigma in (0.0, 0.5, 1.0, 1.5, 2.0, 3.0):
    s = z if sigma == 0 else smooth(z, valid, sigma)
    dz = np.abs(s - z)[valid]
    print(f"{sigma:>6} {np.percentile(dz, 50):>9.3f} {np.percentile(dz, 95):>9.3f} "
          f"{np.percentile(dz, 99):>9.3f} {small_loops(s, INTERVAL):>12}")
```

Illustrative output for rolling farmland at 1 m:

```text
 sigma   p50|dz|   p95|dz|   p99|dz|  small loops
   0.0     0.000     0.000     0.000         4118
   0.5     0.008     0.031     0.058         1307
   1.0     0.015     0.052     0.094          402
   1.5     0.021     0.071     0.131          118
   2.0     0.027     0.089     0.170           61
   3.0     0.038     0.121     0.244           39
```

At 0.5 m contours, sigma 1.5 keeps the 95th-percentile change at 7 cm — well under a quarter of the interval — while removing 97 percent of the tiny loops.

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Trade-off between surface change and contour clutter as sigma grows" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Clutter falls fast; change grows slowly</title>
  <desc>Two curves against smoothing sigma from 0 to 3 cells. The count of small spurious loops falls steeply from over 4,000 to about 120 by sigma 1.5, then flattens. The 95th percentile surface change rises slowly and roughly linearly, crossing a quarter of the contour interval, 12.5 centimetres, near sigma 3. The chosen sigma 1.5 is marked.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="170" x2="680" y2="170" stroke="var(--dg-line)" stroke-width="1.3"/>
  <path d="M80 30 C130 110 180 150 230 160 C330 166 500 168 680 168" fill="none" stroke="var(--dg-c)" stroke-width="2"/>
  <path d="M80 168 L180 158 L280 150 L380 142 L480 134 L680 118" fill="none" stroke="var(--dg-a)" stroke-width="2"/>
  <line x1="80" y1="120" x2="680" y2="120" stroke="var(--dg-e)" stroke-width="1.2" stroke-dasharray="5 4"/>
  <line x1="380" y1="30" x2="380" y2="170" stroke="var(--dg-d)" stroke-width="1.4" stroke-dasharray="3 3"/>
  <text x="140" y="40" font-size="10.5" fill="var(--dg-c)">small loops</text>
  <text x="560" y="116" font-size="10.5" fill="var(--dg-e)">¼ interval = 12.5 cm</text>
  <text x="560" y="148" font-size="10.5" fill="var(--dg-a)">p95 |Δz|</text>
  <text x="388" y="44" font-size="10.5" fill="var(--dg-d)">σ = 1.5</text>
  <g font-size="10" fill="var(--dg-muted)"><text text-anchor="middle" x="80" y="188">0</text><text text-anchor="middle" x="280" y="188">1</text><text text-anchor="middle" x="480" y="188">2</text><text text-anchor="middle" x="680" y="188">3</text></g>
  <text x="380" y="204" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">Gaussian sigma, cells</text>
</svg>

## Key Parameter Table

| Filter | Setting | Good for | Weakness |
|---|---|---|---|
| Gaussian | sigma 1–2 cells | General micro-relief | Rounds sharp breaks |
| Median | 3×3 to 5×5 | Isolated spikes and pits | Blocky on smooth slopes |
| Resample down then up | 2–4× cell size | Regional small-scale maps | Loses detail uniformly |
| Breakline mask | feathered 2–3 cells | Keeping roads, banks sharp | Needs breakline data |
| Acceptance | 95th percentile of abs(Δz) below ¼ interval | Rule of thumb | Adapt to specification |

## Verification

- **Change statistics** within the acceptance rule for the chosen interval.
- **Visual comparison.** Overlay contours from original and smoothed DTMs; lines should shift slightly and lose zigzags, not move across features.
- **Features preserved.** Profile across a known ditch and ridge; depth and height should change by no more than a few centimetres.

## Gotchas and Edge Cases

**Smoothing across NoData.** A plain `gaussian_filter` on a raster with −9999 fill values drags edge cells down by hundreds of metres. Always use the normalized form or fill voids first.

**Smoothing hydro-flattened water.** Smoothing blurs the sharp shoreline of flattened lakes. Mask water polygons out of the smoothing and paste flattened values back afterwards.

**Units of sigma.** Sigma is in cells. On a 0.5 m DTM, sigma 1.5 cells is 0.75 m — half the physical smoothing of the same sigma on a 1 m DTM. Express the choice in metres when comparing projects.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Feathered breakline mask blending original and smoothed surfaces" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Keeping breaklines sharp</title>
  <desc>A plan view of a road crossing a smoothed area. Along the road, a mask of width a few cells takes values from the original DTM, with a feathered transition zone that blends original and smoothed values so no step appears at the mask edge.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <rect x="30" y="20" width="680" height="130" fill="var(--dg-a-soft)"/>
  <rect x="30" y="66" width="680" height="10" fill="var(--dg-surface)"/>
  <rect x="30" y="76" width="680" height="18" fill="var(--dg-surface-2)"/>
  <rect x="30" y="94" width="680" height="10" fill="var(--dg-surface)"/>
  <text x="370" y="89" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">road: original DTM values</text>
  <text x="370" y="46" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">smoothed surface</text>
  <text x="370" y="132" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">feathered edges blend the two</text>
</svg>

**Over-smoothing to hide classification errors.** Heavy smoothing can make bumps from misclassified vegetation disappear from contours, but they remain in the DTM. Fix classification rather than masking it.

## Frequently Asked Questions

**How much should I smooth a DTM before contouring?**

Enough to remove micro-relief below the scale the contours represent, but not so much that the surface moves by more than about a quarter of the contour interval. For a 1 metre DTM and 0.5 metre contours, a Gaussian sigma of 1 to 2 cells is typical.

**Gaussian or median filter?**

Gaussian for general micro-relief such as furrows and interpolation texture; median where isolated spikes or pits remain. Median filters preserve edges better but can look blocky on smooth slopes.

**Does smoothing change the accuracy of the DTM?**

It changes the surface slightly, so it should be applied to a contouring copy, not the delivered DTM. Measure the change and keep it well below the vertical accuracy.

**How do I avoid smoothing across NoData?**

Filter the values with NoData set to zero and a separate validity mask, then divide the two results. This normalized filter keeps edge values correct and leaves voids untouched.

## Related

- [Contour Generation from LiDAR DTMs](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/contour-generation/) — the full workflow
- [Generating Contours from a DTM with gdal_contour](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/contour-generation/generating-contours-from-a-dtm-with-gdal-contour/) — contouring the smoothed surface
- [Exporting Contours to GeoPackage](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/contour-generation/exporting-contours-to-geopackage/) — cleaning the result
- [Filling NoData Voids in DTM Rasters](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/filling-nodata-voids-in-dtm-rasters/) — preparing the input
- [Removing Pits and Spikes from a DSM](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/removing-pits-and-spikes-from-a-dsm/) — median filtering for surfaces
