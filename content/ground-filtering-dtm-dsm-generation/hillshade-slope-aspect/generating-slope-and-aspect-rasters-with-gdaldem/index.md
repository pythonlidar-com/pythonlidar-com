---
title: "Generating Slope and Aspect Rasters with gdaldem"
description: "Deriving slope and aspect from a LiDAR DTM, the unit and edge flags that matter, and why aspect is a circular quantity that ordinary averaging gets exactly backwards."
slug: "generating-slope-and-aspect-rasters-with-gdaldem"
type: "howto"
breadcrumb: "Slope and Aspect with gdaldem"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Generating Slope and Aspect Rasters with gdaldem",
      "description": "Deriving slope and aspect from a LiDAR DTM, the unit and edge flags that matter, and why aspect is a circular quantity that ordinary averaging gets exactly backwards.",
      "datePublished": "2026-08-07",
      "dateModified": "2026-08-07",
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
          "name": "Ground Filtering and DTM/DSM Generation with PDAL",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Hillshade, Slope and Aspect",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Slope and Aspect with gdaldem",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/generating-slope-and-aspect-rasters-with-gdaldem/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Derive slope and aspect rasters from a LiDAR DTM",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Confirm the units agree",
          "text": "Supply a scale factor when the vertical unit differs from the horizontal one, or every slope is wrong by that ratio."
        },
        {
          "@type": "HowToStep",
          "name": "Compute slope with the Horn algorithm",
          "text": "Run gdaldem slope with -alg Horn and -compute_edges so the border is not NoData."
        },
        {
          "@type": "HowToStep",
          "name": "Compute aspect and decide about flat cells",
          "text": "Run gdaldem aspect and choose deliberately between -zero_for_flat and the default NoData."
        },
        {
          "@type": "HowToStep",
          "name": "Reclassify aspect before any statistics",
          "text": "Convert to sectors or unit vectors, because raw degrees wrap and do not average."
        },
        {
          "@type": "HowToStep",
          "name": "Verify against known flat and steep areas",
          "text": "Sample a car park and a known slope to confirm the values are physically plausible."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why can I not average aspect values?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because aspect wraps at 360 degrees. Five cells facing 340, 350, 358, 6 and 18 degrees all face north, and their arithmetic mean is 176 degrees \u2014 almost due south. Average the unit vectors instead, with atan2 of the mean sine over the mean cosine, or reclassify to sectors first."
          }
        },
        {
          "@type": "Question",
          "name": "Should I use -zero_for_flat?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It depends what consumes the raster, and the important thing is to decide rather than inherit a default. Without it flat cells are NoData, which is honest and awkward. With it they are zero, which is a legitimate aspect value meaning north, so a downstream statistic will treat every flat cell as north-facing."
          }
        },
        {
          "@type": "Question",
          "name": "Why does my slope raster look far too steep?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Almost always a unit mismatch: elevations in US survey feet on a metric grid, with no scale factor. Every slope then comes out 3.28 times too steep. Pass the ratio with -s, or better, rasterize in a CRS whose vertical unit matches its horizontal one."
          }
        },
        {
          "@type": "Question",
          "name": "Can I resample an aspect raster to a coarser grid?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. Interpolating between 355 and 5 degrees gives 180, so resampling manufactures south-facing cells out of north-facing ones. Resample the DTM and re-derive the aspect from it."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** `gdaldem slope dtm.tif slope.tif -alg Horn -compute_edges` and `gdaldem aspect dtm.tif aspect.tif -zero_for_flat`, both on a DTM whose vertical and horizontal units match — and remember that slope is a magnitude you can average and aspect is a direction you cannot.

## Context and Motivation

This guide is part of [Hillshade, Slope and Aspect](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/), which covers the derivatives a terrain model supports. Hillshade is for looking at; slope and aspect are for computing with, and that difference is where the mistakes live.

Both come from the same two gradients that hillshade uses — the Horn stencil over a three by three neighbourhood. Slope is the magnitude of that gradient, in degrees or percent. Aspect is its direction, in degrees clockwise from north. They are produced by one pass each over the raster and cost almost nothing. What costs is using them without noticing that one of them is circular.

<svg viewBox="0 0 720 252" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Slope and aspect derived from the same gradient, one a magnitude and one a direction" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>One gradient, two very different numbers</title>
  <desc>The same terrain gradient produces two outputs. Slope is its magnitude, a value from zero to ninety degrees that can be averaged, differenced and compared like any other measurement. Aspect is its direction, a value from zero to 360 that wraps, so an ordinary mean of 350 and 10 degrees gives 180 — the exact opposite of the right answer.</desc>
  <rect x="0" y="0" width="720" height="252" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="46" width="200" height="70" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.4"/>
  <text x="120" y="76" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">the Horn gradient</text>
  <text x="120" y="98" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">dz/dx and dz/dy</text>
  <rect x="270" y="30" width="200" height="70" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.4"/>
  <text x="370" y="58" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">slope — a magnitude</text>
  <text x="370" y="80" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">0–90°, averages normally</text>
  <rect x="270" y="120" width="200" height="70" rx="8" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.4"/>
  <text x="370" y="148" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">aspect — a direction</text>
  <text x="370" y="170" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">0–360°, wraps at north</text>
  <text x="490" y="58" font-size="10.5" fill="var(--dg-d)">mean, deviation, difference</text>
  <text x="490" y="78" font-size="10.5" fill="var(--dg-d)">between epochs — all valid</text>
  <text x="490" y="148" font-size="10.5" fill="var(--dg-e)">mean(350°, 10°) = 180°,</text>
  <text x="490" y="168" font-size="10.5" fill="var(--dg-e)">south when it should be north</text>
  <text x="20" y="222" font-size="10.5" fill="var(--dg-muted)">for aspect, average the unit vectors — atan2(mean(sin θ), mean(cos θ)) — or reclassify to sectors first</text>
  <text x="20" y="240" font-size="10.5" fill="var(--dg-muted)">and never feed a raw aspect raster to a tool that will resample it.</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| GDAL | 3.x, for `gdaldem` |
| A DTM | bare earth; slope over a DSM measures roof pitch |
| Matching units | vertical and horizontal in the same unit, or a `-s` scale factor |
| A void-aware workflow | NoData cells propagate to their neighbours in the derivatives |

## Step-by-Step Implementation

### Step 1 — Confirm the units agree

A DTM in US survey feet on a metric grid needs `-s 0.3048`. Without it every slope is 3.28 times too steep — the failure shown in [exporting hillshade from a LiDAR DTM](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/exporting-hillshade-from-a-lidar-dtm/).

### Step 2 — Compute slope

```bash
gdaldem slope dtm.tif slope_deg.tif -alg Horn -compute_edges \
  -co COMPRESS=DEFLATE -co TILED=YES
```

Add `-p` for percent rise instead of degrees. `-compute_edges` fills the one-pixel border that would otherwise be NoData.

### Step 3 — Compute aspect

```bash
gdaldem aspect dtm.tif aspect_deg.tif -compute_edges -zero_for_flat \
  -co COMPRESS=DEFLATE -co TILED=YES
```

Without `-zero_for_flat`, flat cells get −9999, which is correct and awkward; with it they get 0, which is north and wrong. Choose deliberately and record which you chose.

### Step 4 — Reclassify aspect before any statistics

Eight sectors, or a north-south exposure index, both behave arithmetically. Raw degrees do not.

## Complete Working Example

```python
"""Derive slope and aspect, then summarise them correctly."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

import numpy as np
import rasterio


def derive(dtm: Path, out_dir: Path, z_factor: float = 1.0) -> dict[str, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    slope = out_dir / "slope_deg.tif"
    aspect = out_dir / "aspect_deg.tif"
    common = ["-compute_edges", "-co", "COMPRESS=DEFLATE", "-co", "TILED=YES"]

    subprocess.run(["gdaldem", "slope", str(dtm), str(slope),
                    "-alg", "Horn", "-s", str(1.0 / z_factor), *common], check=True)
    subprocess.run(["gdaldem", "aspect", str(dtm), str(aspect),
                    "-zero_for_flat", *common], check=True)
    return {"slope": slope, "aspect": aspect}


def summarise(slope: Path, aspect: Path) -> dict:
    with rasterio.open(slope) as s:
        sl = s.read(1).astype("float64")
        sl_nodata = s.nodata
    with rasterio.open(aspect) as a:
        asp = a.read(1).astype("float64")

    valid = np.isfinite(sl)
    if sl_nodata is not None:
        valid &= sl != sl_nodata

    # Slope is a magnitude: ordinary statistics are fine.
    slope_stats = {
        "mean_deg": round(float(sl[valid].mean()), 2),
        "p95_deg": round(float(np.percentile(sl[valid], 95)), 2),
    }

    # Aspect is circular: average the unit vectors, not the degrees.
    sloped = valid & (sl > 2.0)  # a flat cell has no meaningful aspect
    theta = np.radians(asp[sloped])
    mean_dir = np.degrees(np.arctan2(np.sin(theta).mean(), np.cos(theta).mean())) % 360.0
    resultant = float(np.hypot(np.sin(theta).mean(), np.cos(theta).mean()))

    return {
        "slope": slope_stats,
        "aspect": {
            "mean_direction_deg": round(float(mean_dir), 1),
            "concentration": round(resultant, 3),
            "naive_mean_deg": round(float(asp[sloped].mean()), 1),
        },
    }


if __name__ == "__main__":
    paths = derive(Path("dtm.tif"), Path("derivatives"))
    print(json.dumps(summarise(paths["slope"], paths["aspect"]), indent=2))
```

The `naive_mean_deg` field is deliberate: printing both makes the difference visible to whoever reads the output next.

## Key Parameter Table

| Flag | Applies to | Effect |
|---|---|---|
| `-alg Horn` | slope, aspect | The standard 3×3 estimator; `ZevenbergenThorne` is smoother |
| `-p` | slope | Percent rise instead of degrees |
| `-s` | slope, hillshade | Ratio of vertical to horizontal units; 0.3048 for feet over metres |
| `-compute_edges` | all | Fills the one-pixel NoData border |
| `-zero_for_flat` | aspect | Flat cells become 0 rather than −9999 |
| `-co` | all | GeoTIFF creation options; compress and tile by default |

<svg viewBox="-2 30 724 233" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The same four gradients expressed in degrees and in percent rise" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Degrees and percent are not interchangeable</title>
  <desc>Four gradients in both units. A gentle 5 degree slope is 8.7 percent. A moderate 15 degrees is 26.8 percent. A steep 30 degrees is 57.7 percent. And 45 degrees is exactly 100 percent, above which percent rise climbs without bound while degrees cannot exceed 90 — which is why a threshold written in one unit cannot be reused in the other.</desc>
  <rect x="-2" y="30" width="724" height="233" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="52" width="300" height="34" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="170" y="73" text-anchor="middle" font-size="11" fill="var(--dg-text)">5° — gentle</text>
  <rect x="340" y="52" width="360" height="34" rx="6" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="520" y="73" text-anchor="middle" font-size="11" fill="var(--dg-text)">8.7% rise</text>
  <rect x="20" y="96" width="300" height="34" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="170" y="117" text-anchor="middle" font-size="11" fill="var(--dg-text)">15° — moderate</text>
  <rect x="340" y="96" width="360" height="34" rx="6" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="520" y="117" text-anchor="middle" font-size="11" fill="var(--dg-text)">26.8% rise</text>
  <rect x="20" y="140" width="300" height="34" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="170" y="161" text-anchor="middle" font-size="11" fill="var(--dg-text)">30° — steep</text>
  <rect x="340" y="140" width="360" height="34" rx="6" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="520" y="161" text-anchor="middle" font-size="11" fill="var(--dg-text)">57.7% rise</text>
  <rect x="20" y="184" width="300" height="34" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="170" y="205" text-anchor="middle" font-size="11" fill="var(--dg-text)">45°</text>
  <rect x="340" y="184" width="360" height="34" rx="6" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="520" y="205" text-anchor="middle" font-size="11" fill="var(--dg-text)">exactly 100% rise</text>
  <text x="20" y="238" font-size="10.5" fill="var(--dg-muted)">percent rise is unbounded above 45°, degrees stop at 90 — a ported threshold is always wrong</text>
</svg>

## Verification

**Slope has no impossible values.** Nothing above 90 degrees, and a maximum near 90 over natural terrain means the DTM has a spike.

**Flat areas read as flat.** Sample a car park or a lake margin; slope should be under a degree.

**The circular mean differs from the naive one.** On terrain with a genuine dominant aspect the two will disagree, and that disagreement is the whole reason for the extra code.

**The derivative is of the DTM, not the DSM.** Slope over a surface model measures roof pitch and canopy, which is occasionally what you want and usually not.

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Aspect values around a compass with the naive and circular means marked" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Why the naive mean lands in the wrong place</title>
  <desc>A compass with a cluster of aspect values gathered around north, spanning 340 to 20 degrees. The circular mean sits at 358 degrees, inside the cluster. The naive arithmetic mean sits at 176 degrees, almost due south, because averaging numbers that wrap at 360 pulls the result to the middle of the numeric range rather than the middle of the directions.</desc>
  <rect x="0" y="0" width="720" height="250" fill="var(--dg-bg)" rx="10"/>
  <circle cx="200" cy="126" r="82" fill="none" stroke="var(--dg-line-soft)" stroke-width="1.4"/>
  <text x="200" y="30" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">N</text>
  <text x="200" y="226" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">S</text>
  <text x="300" y="130" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">E</text>
  <text x="100" y="130" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">W</text>
  <line x1="200" y1="126" x2="186" y2="46" stroke="var(--dg-a)" stroke-width="1.6"/>
  <line x1="200" y1="126" x2="200" y2="44" stroke="var(--dg-a)" stroke-width="1.6"/>
  <line x1="200" y1="126" x2="214" y2="46" stroke="var(--dg-a)" stroke-width="1.6"/>
  <line x1="200" y1="126" x2="228" y2="52" stroke="var(--dg-a)" stroke-width="1.6"/>
  <line x1="200" y1="126" x2="174" y2="50" stroke="var(--dg-a)" stroke-width="1.6"/>
  <line x1="200" y1="126" x2="197" y2="40" stroke="var(--dg-d)" stroke-width="3"/>
  <line x1="200" y1="126" x2="206" y2="212" stroke="var(--dg-e)" stroke-width="3"/>
  <rect x="330" y="56" width="360" height="40" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="510" y="81" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">circular mean 358° — inside the cluster</text>
  <rect x="330" y="112" width="360" height="40" rx="7" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="510" y="137" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">naive mean 176° — almost due south</text>
  <text x="330" y="184" font-size="10.5" fill="var(--dg-muted)">the same five values: 340°, 350°, 358°, 6°, 18°</text>
  <text x="330" y="204" font-size="10.5" fill="var(--dg-muted)">every one faces north; their arithmetic mean faces away from all of them.</text>
</svg>

## Gotchas and Edge Cases

**Resampling an aspect raster produces nonsense.** Interpolating between 355 and 5 gives 180. Resample the DTM and re-derive instead.

**NoData spreads.** A single void becomes a 3×3 block of NoData in every derivative. Fill voids in the DTM first — see [filling NoData voids](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/filling-nodata-voids-in-dtm-rasters/).

**Slope depends on cell size.** A 0.5 m DTM yields steeper slopes than a 2 m DTM of the same hill. Comparisons must use one grid.

**Flat cells have no aspect.** Mask by slope before using aspect for anything.

## Frequently Asked Questions

**Why can I not average aspect values?**

Because aspect wraps at 360 degrees. Five cells facing 340, 350, 358, 6 and 18 degrees all face north, and their arithmetic mean is 176 degrees — almost due south. Average the unit vectors instead, with atan2 of the mean sine over the mean cosine, or reclassify to sectors first.

**Should I use -zero_for_flat?**

It depends what consumes the raster, and the important thing is to decide rather than inherit a default. Without it flat cells are NoData, which is honest and awkward. With it they are zero, which is a legitimate aspect value meaning north, so a downstream statistic will treat every flat cell as north-facing.

**Why does my slope raster look far too steep?**

Almost always a unit mismatch: elevations in US survey feet on a metric grid, with no scale factor. Every slope then comes out 3.28 times too steep. Pass the ratio with -s, or better, rasterize in a CRS whose vertical unit matches its horizontal one.

**Can I resample an aspect raster to a coarser grid?**

No. Interpolating between 355 and 5 degrees gives 180, so resampling manufactures south-facing cells out of north-facing ones. Resample the DTM and re-derive the aspect from it.

---

## Related

- [Hillshade, Slope and Aspect](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/) — the parent guide to terrain derivatives
- [Exporting Hillshade from a LiDAR DTM](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/exporting-hillshade-from-a-lidar-dtm/) — the third derivative, and the unit trap in its original setting
- [Building a Seamless DTM Mosaic from Tiles](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/building-a-seamless-dtm-mosaic-from-tiles/) — why a seam in the DTM becomes a line in every derivative
- [Filling NoData Voids in DTM Rasters](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/filling-nodata-voids-in-dtm-rasters/) — because a void spreads to a 3×3 block in every derivative
- [Ground Filtering and DTM/DSM Generation with PDAL](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/) — the section overview
