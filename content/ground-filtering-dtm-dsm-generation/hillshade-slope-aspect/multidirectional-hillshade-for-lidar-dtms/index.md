---
title: "Multidirectional Hillshade for LiDAR DTMs"
description: "Render LiDAR terrain with multidirectional hillshading: gdaldem -multidirectional and -combined, a custom weighted multi-azimuth hillshade in NumPy, z-factors for geographic rasters, and blending with slope for archaeology and geomorphology interpretation."
slug: "multidirectional-hillshade-for-lidar-dtms"
type: "howto"
breadcrumb: "Multidirectional Hillshade"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Multidirectional Hillshade for LiDAR DTMs",
      "description": "Render LiDAR terrain with multidirectional hillshading: gdaldem -multidirectional and -combined, a custom weighted multi-azimuth hillshade in NumPy, z-factors for geographic rasters, and blending with slope for archaeology and geomorphology interpretation.",
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
          "name": "Multidirectional Hillshade",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/multidirectional-hillshade-for-lidar-dtms/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Create a multidirectional hillshade from a LiDAR DTM",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Standard multidirectional hillshade",
          "text": "gdaldem hillshade -multidirectional combines hillshades from four azimuths \u2014 225\u00b0, 270\u00b0, 315\u00b0 and 360\u00b0 \u2014 weighted by the local aspect, following the method of Mark (1992) as implemented in GDAL."
        },
        {
          "@type": "HowToStep",
          "name": "Combined shading for low relief",
          "text": "-combined blends slope and oblique shading, which brings out subtle relief on flat ground without the overall grey cast of a standard hillshade."
        },
        {
          "@type": "HowToStep",
          "name": "Custom azimuth sets",
          "text": "For interpretation, compute hillshades at 8 or 16 azimuths and average them, optionally weighting a preferred direction."
        },
        {
          "@type": "HowToStep",
          "name": "Vertical exaggeration",
          "text": "A z-factor of 2\u20133 emphasizes low relief; keep it at 1 for honest cartography."
        },
        {
          "@type": "HowToStep",
          "name": "Blend with slope",
          "text": "Multiplying hillshade by a slope-derived layer (dark on steep slopes) separates true steepness from lighting effects."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is a multidirectional hillshade?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A hillshade that combines illumination from several azimuths rather than one, so terrain features of every orientation cast visible shading. GDAL's gdaldem supports it with the multidirectional option."
          }
        },
        {
          "@type": "Question",
          "name": "Why do some features disappear in a normal hillshade?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Features running parallel to the light direction are lit along their length and cast no shadow, so they show little contrast. With the default light from the north-west, north-west to south-east features are hardest to see."
          }
        },
        {
          "@type": "Question",
          "name": "What z-factor should I use?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "One for faithful cartography in projected coordinates with metric heights. Two or three emphasizes low relief for interpretation. Geographic rasters need a scale conversion rather than an arbitrary z-factor."
          }
        },
        {
          "@type": "Question",
          "name": "Should I use -combined or -multidirectional?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Multidirectional for general terrain visualization with no directional blind spots; combined for very flat terrain, where blending slope shading brings out subtle relief. Try both on a sample area."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** `gdaldem hillshade -multidirectional dtm.tif hs_multi.tif` combines illumination from several azimuths so linear features at any orientation are visible, unlike a single 315° light that hides features running parallel to it. For interpretation work, compute your own weighted multi-azimuth hillshade in NumPy, then blend it with a slope layer to separate relief from shading artefacts.

## Context and Motivation

This guide is part of [Hillshade, Slope and Aspect](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/). A standard hillshade lights the terrain from one direction, conventionally the north-west at 315°. It is intuitive, but it has a blind spot: a ditch, bank, field boundary or fault scarp running north-west to south-east is lit along its length and casts no shadow, so it nearly disappears. On LiDAR DTMs, which are used precisely to find subtle linear features — relict field systems, hollow ways, drainage lines, landslide scarps — that blind spot matters. Multidirectional hillshading averages illumination from several directions so no orientation is favoured, while keeping the familiar top-left-lit look.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A linear feature hidden by single-azimuth light and revealed by multidirectional light" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Features parallel to the light disappear</title>
  <desc>Two panels of the same terrain with two small banks, one running north-east and one running north-west. With a single light from 315 degrees, the north-west bank casts no shadow and is almost invisible, while the north-east bank is clear. With multidirectional light, both banks are visible.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <text x="185" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">single azimuth 315°</text>
  <text x="555" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">multidirectional</text>
  <rect x="40" y="36" width="290" height="160" fill="var(--dg-surface-2)"/>
  <rect x="410" y="36" width="290" height="160" fill="var(--dg-surface-2)"/>
  <line x1="70" y1="170" x2="300" y2="60" stroke="var(--dg-text)" stroke-width="3"/>
  <line x1="70" y1="60" x2="300" y2="170" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <line x1="440" y1="170" x2="670" y2="60" stroke="var(--dg-text)" stroke-width="3"/>
  <line x1="440" y1="60" x2="670" y2="170" stroke="var(--dg-text)" stroke-width="3"/>
  <text x="185" y="212" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">NW–SE bank nearly invisible</text>
  <text x="555" y="212" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">both banks visible</text>
</svg>

## Prerequisites and Assumptions

- A bare-earth DTM GeoTIFF in a projected CRS with metres for both horizontal and vertical units.
- GDAL 2.2+ for `-multidirectional` (the option has been available for years in `gdaldem`).
- For the custom version: NumPy, rasterio.

## Step-by-Step Implementation

### Step 1 — Standard multidirectional hillshade

`gdaldem hillshade -multidirectional` combines hillshades from four azimuths — 225°, 270°, 315° and 360° — weighted by the local aspect, following the method of Mark (1992) as implemented in GDAL.

### Step 2 — Combined shading for low relief

`-combined` blends slope and oblique shading, which brings out subtle relief on flat ground without the overall grey cast of a standard hillshade.

### Step 3 — Custom azimuth sets

For interpretation, compute hillshades at 8 or 16 azimuths and average them, optionally weighting a preferred direction.

### Step 4 — Vertical exaggeration

A z-factor of 2–3 emphasizes low relief; keep it at 1 for honest cartography.

### Step 5 — Blend with slope

Multiplying hillshade by a slope-derived layer (dark on steep slopes) separates true steepness from lighting effects.

## Complete Working Example

Command line:

```bash
gdaldem hillshade -multidirectional -z 1.0 -compute_edges -co COMPRESS=DEFLATE \
  mosaic/dtm_1m.tif out/hs_multi.tif
gdaldem hillshade -combined -z 2.0 -compute_edges mosaic/dtm_1m.tif out/hs_combined.tif
gdaldem hillshade -az 315 -alt 45 -compute_edges mosaic/dtm_1m.tif out/hs_315.tif
```

A custom 16-azimuth hillshade blended with slope in NumPy:

```python
"""Custom multi-azimuth hillshade blended with slope."""
from __future__ import annotations

import numpy as np
import rasterio


def hillshade(z: np.ndarray, res: float, azimuth: float, altitude: float = 45.0,
              zfactor: float = 1.0) -> np.ndarray:
    dzdy, dzdx = np.gradient(z * zfactor, res)
    slope = np.arctan(np.hypot(dzdx, dzdy))
    aspect = np.arctan2(-dzdx, dzdy)                     # radians, clockwise from north
    az, alt = np.radians(azimuth), np.radians(altitude)
    hs = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    return np.clip(hs, 0, 1)


def multi(z: np.ndarray, res: float, n: int = 16, zfactor: float = 1.0) -> np.ndarray:
    stack = [hillshade(z, res, az, zfactor=zfactor) for az in np.linspace(0, 360, n, endpoint=False)]
    return np.mean(stack, axis=0)


with rasterio.open("mosaic/dtm_1m.tif") as ds:
    z = ds.read(1, masked=True).filled(np.nan)
    profile, res = ds.profile, ds.res[0]

hs = multi(z, res, n=16, zfactor=2.0)
dzdy, dzdx = np.gradient(z, res)
slope_deg = np.degrees(np.arctan(np.hypot(dzdx, dzdy)))
slope_term = 1 - np.clip(slope_deg / 45.0, 0, 1) * 0.5      # darken steep slopes by up to half
out = (np.nan_to_num(hs * slope_term) * 255).astype("uint8")

profile.update(dtype="uint8", nodata=0, count=1, compress="deflate")
with rasterio.open("out/hs_multi16_slope.tif", "w", **profile) as o:
    o.write(out, 1)
```

Averaging many azimuths removes directional bias entirely, producing a flatter-looking image; that is ideal for detecting features, less so for maps meant to look natural. GDAL's multidirectional mode keeps a dominant north-west light and is the better choice for cartography.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Azimuth rose for single, GDAL multidirectional and 16-direction hillshades" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Where the light comes from</title>
  <desc>Three compass roses. The single hillshade has one arrow from 315 degrees. GDAL's multidirectional mode has several arrows concentrated between west and north, keeping a north-west feel. The custom 16-direction version has sixteen equal arrows all around the compass, with no preferred direction.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <g fill="none" stroke="var(--dg-line-soft)" stroke-width="1"><circle cx="130" cy="95" r="60"/><circle cx="370" cy="95" r="60"/><circle cx="610" cy="95" r="60"/></g>
  <line x1="130" y1="95" x2="88" y2="53" stroke="var(--dg-c)" stroke-width="3"/>
  <g stroke="var(--dg-c)" stroke-width="2.4"><line x1="370" y1="95" x2="328" y2="137"/><line x1="370" y1="95" x2="310" y2="95"/><line x1="370" y1="95" x2="328" y2="53"/><line x1="370" y1="95" x2="370" y2="35"/></g>
  <g stroke="var(--dg-c)" stroke-width="1.6"><line x1="610" y1="95" x2="610" y2="35"/><line x1="610" y1="95" x2="633" y2="40"/><line x1="610" y1="95" x2="652" y2="53"/><line x1="610" y1="95" x2="665" y2="72"/><line x1="610" y1="95" x2="670" y2="95"/><line x1="610" y1="95" x2="665" y2="118"/><line x1="610" y1="95" x2="652" y2="137"/><line x1="610" y1="95" x2="633" y2="150"/><line x1="610" y1="95" x2="610" y2="155"/><line x1="610" y1="95" x2="587" y2="150"/><line x1="610" y1="95" x2="568" y2="137"/><line x1="610" y1="95" x2="555" y2="118"/><line x1="610" y1="95" x2="550" y2="95"/><line x1="610" y1="95" x2="555" y2="72"/><line x1="610" y1="95" x2="568" y2="53"/><line x1="610" y1="95" x2="587" y2="40"/></g>
  <g font-size="10.5" fill="var(--dg-text)"><text text-anchor="middle" x="130" y="182">single 315°</text><text text-anchor="middle" x="370" y="182">GDAL -multidirectional</text><text text-anchor="middle" x="610" y="182">16 equal azimuths</text></g>
  <g font-size="10" fill="var(--dg-muted)"><text text-anchor="middle" x="130" y="28">N</text><text text-anchor="middle" x="370" y="28">N</text><text text-anchor="middle" x="610" y="28">N</text></g>
</svg>

## Choosing a Rendering for the Job

Different audiences need different renderings of the same DTM, and it is worth producing more than one rather than arguing for a single "best" hillshade.

For **general maps and reports**, GDAL's multidirectional hillshade at z-factor 1 reads naturally: light still appears to come from the upper left, which readers expect, and no terrain orientation is hidden. Overlay it semi-transparently on imagery or a colour-ramped elevation layer.

For **feature detection and interpretation** — archaeological survey, mapping landslide scarps, tracing drainage — an equal-weight multi-azimuth hillshade with mild exaggeration, blended with slope, is more useful. It looks flatter and less natural, but relief of every orientation carries equal contrast, which is what a searching eye needs. Local relief models and sky-view factor are further options in the same family, and interpreters often switch between several.

For **very flat terrain**, `-combined` or a hillshade with a low sun altitude (20–30°) brings out centimetre-scale relief that a standard rendering flattens into uniform grey.

Whatever the choice, record the parameters — azimuths, altitude, z-factor — with the output, because a feature that is visible under one rendering and not another is itself a finding.

## Key Parameter Table

| Option | gdaldem | Typical | Effect |
|---|---|---|---|
| multidirectional | `-multidirectional` | on | Several azimuths, NW-dominant |
| combined | `-combined` | for flat terrain | Slope plus oblique shading |
| azimuth | `-az` | 315 | Single light direction |
| altitude | `-alt` | 45 | Sun elevation; lower exaggerates relief |
| z-factor | `-z` | 1 (2–3 for low relief) | Vertical exaggeration |
| edges | `-compute_edges` | on | Avoids a NoData border |

## Verification

- **Orientation test.** Find a known linear feature parallel to 315° and confirm it is visible in the multidirectional output but faint in the single-azimuth one.
- **No NoData border.** With `-compute_edges`, edge cells are valid.
- **Units.** If the output is nearly uniformly white or black, horizontal and vertical units differ; see below.

## Gotchas and Edge Cases

**Geographic rasters.** A DTM in degrees with heights in metres needs a z-factor or `-s 111120` (scale) so slopes are computed correctly; otherwise the hillshade is flat grey. Better, reproject to a projected CRS first.

**Tile seams.** Hillshading tiles separately leaves a one-pixel seam at every edge. Hillshade a VRT mosaic, or use `-compute_edges` on buffered tiles.

**Interpretation bias.** Every hillshade is a rendering choice. For archaeological or geomorphological interpretation, inspect several renderings — multidirectional, slope, local relief — rather than trusting one.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Hillshade of a geographic raster without a scale factor" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Degrees and metres do not mix</title>
  <desc>Left: a hillshade of a DTM with horizontal units in degrees and heights in metres, computed without a scale factor; slopes appear enormous and the image is saturated to black and white noise. Right: the same terrain after reprojection to metres, with normal shading.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <rect x="40" y="20" width="290" height="120" fill="var(--dg-surface-2)"/>
  <g fill="var(--dg-text)"><rect x="60" y="40" width="20" height="20"/><rect x="100" y="60" width="20" height="20"/><rect x="140" y="30" width="20" height="20"/><rect x="190" y="80" width="20" height="20"/><rect x="240" y="50" width="20" height="20"/><rect x="280" y="100" width="20" height="20"/><rect x="80" y="100" width="20" height="20"/><rect x="160" y="110" width="20" height="20"/></g>
  <rect x="410" y="20" width="290" height="120" fill="var(--dg-surface-2)"/>
  <path d="M430 120 C500 60 560 60 620 90 C650 104 670 110 690 112" fill="none" stroke="var(--dg-line)" stroke-width="3"/>
  <text x="185" y="160" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">degrees, no scale: saturated noise</text>
  <text x="555" y="160" text-anchor="middle" font-size="10.5" fill="var(--dg-d)">metres: readable relief</text>
</svg>

**Output bit depth.** Hillshades are usually 8-bit; computing in float and scaling once avoids banding when blending several layers.

## Frequently Asked Questions

**What is a multidirectional hillshade?**

A hillshade that combines illumination from several azimuths rather than one, so terrain features of every orientation cast visible shading. GDAL's gdaldem supports it with the multidirectional option.

**Why do some features disappear in a normal hillshade?**

Features running parallel to the light direction are lit along their length and cast no shadow, so they show little contrast. With the default light from the north-west, north-west to south-east features are hardest to see.

**What z-factor should I use?**

One for faithful cartography in projected coordinates with metric heights. Two or three emphasizes low relief for interpretation. Geographic rasters need a scale conversion rather than an arbitrary z-factor.

**Should I use -combined or -multidirectional?**

Multidirectional for general terrain visualization with no directional blind spots; combined for very flat terrain, where blending slope shading brings out subtle relief. Try both on a sample area.

## Related

- [Hillshade, Slope and Aspect](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/) — terrain derivatives overview
- [Exporting Hillshade from a LiDAR DTM](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/exporting-hillshade-from-a-lidar-dtm/) — the standard single-azimuth product
- [Generating Slope and Aspect Rasters with gdaldem](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/generating-slope-and-aspect-rasters-with-gdaldem/) — the slope layer used in blending
- [Computing Terrain Roughness and TPI](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/computing-terrain-roughness-and-tpi/) — relief metrics without lighting
- [Building a Seamless DTM Mosaic from Tiles](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/building-a-seamless-dtm-mosaic-from-tiles/) — hillshading without seams
