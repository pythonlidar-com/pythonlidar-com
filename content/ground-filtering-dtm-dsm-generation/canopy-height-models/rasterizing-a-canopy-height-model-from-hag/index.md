---
title: "Rasterizing a Canopy Height Model from HAG"
description: "The three writers.gdal choices that decide whether you get a canopy height model or an accidental DSM, plus why cell size changes the answer and not only the picture."
slug: "rasterizing-a-canopy-height-model-from-hag"
type: "howto"
breadcrumb: "Rasterizing a Canopy Height Model"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Rasterizing a Canopy Height Model from HAG",
      "description": "The three writers.gdal choices that decide whether you get a canopy height model or an accidental DSM, plus why cell size changes the answer and not only the picture.",
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
          "name": "Canopy Height Models",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Rasterizing a Canopy Height Model",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/rasterizing-a-canopy-height-model-from-hag/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Rasterize a canopy height model from a normalised point cloud",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Point the writer at HeightAboveGround",
          "text": "Set the dimension option or writers.gdal rasterizes Z and produces a surface model instead."
        },
        {
          "@type": "HowToStep",
          "name": "Choose the reducer",
          "text": "Use max for the canopy top, or a high percentile where a single spurious return is a risk."
        },
        {
          "@type": "HowToStep",
          "name": "Set a cell size the data supports",
          "text": "Choose resolution from ground-return density rather than from how the raster looks."
        },
        {
          "@type": "HowToStep",
          "name": "Fill only pinholes",
          "text": "A window_size of about three closes gaps between crowns; larger values bridge real clearings."
        },
        {
          "@type": "HowToStep",
          "name": "Write a count band alongside",
          "text": "Request max and count together so the product carries its own confidence layer."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does my canopy height model look like a surface model?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because the dimension option was not set, so writers.gdal rasterized Z. The result is elevations above sea level and looks entirely reasonable, which is why it usually survives until someone compares it with field measurements."
          }
        },
        {
          "@type": "Question",
          "name": "Should I use max or mean as the reducer?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Max, in almost every case \u2014 it reports the tallest return in the cell, which is the canopy top. A mean over returns spread through a crown reports a height at which no physical surface sits. Where one spurious high return is a real risk, a high percentile is the robust compromise."
          }
        },
        {
          "@type": "Question",
          "name": "Does cell size change the numbers or just the picture?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The numbers. A larger cell is more likely to contain a gap, so mean canopy height falls as the grid coarsens \u2014 around four metres between a half-metre and a four-metre raster over the same block. Change detection between epochs is only meaningful if the cell sizes match."
          }
        },
        {
          "@type": "Question",
          "name": "What should NoData be?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Anything but zero. Zero is a legitimate canopy height over bare ground, so using it as the NoData value silently deletes every open cell from the product."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** `writers.gdal` with `"dimension": "HeightAboveGround"`, `"output_type": "max"` and a cell size your ground density can actually support — then clamp negatives to zero at the raster stage, not in the point cloud, so the evidence survives.

## Context and Motivation

This guide is part of [Canopy Height Models with filters.hag_nn](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/). The normalised cloud already knows how tall everything is; this page is about turning that into a raster without losing the information that made the point-domain route worth taking.

Three choices do all the work. The dimension, which decides whether you get a canopy height model or an accidental DSM. The reducer, which decides whether a cell reports its tallest return or a smoothed crown surface. And the cell size, which is not a quality dial but a statement about how much ground data supports the product — a one-metre CHM over a block with 0.4 ground returns per square metre is mostly interpolation wearing a resolution.

<svg viewBox="0 0 720 258" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The same canopy cell reduced four different ways" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Four reducers over one canopy cell</title>
  <desc>One cell containing eight returns spread through a crown. The max reducer reports the tallest at 26.4 metres, which is the canopy top. The mean reports 18.1, a value no physical surface sits at. The 95th percentile reports 25.1, more robust to a single high return. The count reports eight, which is a density layer rather than a height.</desc>
  <rect x="0" y="0" width="720" height="258" fill="var(--dg-bg)" rx="10"/>
  <rect x="30" y="46" width="200" height="160" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="130" y="36" text-anchor="middle" font-size="11" fill="var(--dg-muted)">one 1 m cell</text>
  <circle cx="70" cy="70" r="4" fill="var(--dg-a)"/>
  <circle cx="120" cy="82" r="4" fill="var(--dg-a)"/>
  <circle cx="170" cy="96" r="4" fill="var(--dg-a)"/>
  <circle cx="90" cy="112" r="4" fill="var(--dg-a)"/>
  <circle cx="150" cy="128" r="4" fill="var(--dg-a)"/>
  <circle cx="110" cy="150" r="4" fill="var(--dg-a)"/>
  <circle cx="180" cy="168" r="4" fill="var(--dg-a)"/>
  <circle cx="60" cy="188" r="4" fill="var(--dg-a)"/>
  <rect x="266" y="46" width="200" height="34" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="366" y="68" text-anchor="middle" font-size="11" fill="var(--dg-text)">max → 26.4 m</text>
  <text x="486" y="68" font-size="10.5" fill="var(--dg-muted)">canopy top; the usual choice</text>
  <rect x="266" y="88" width="200" height="34" rx="6" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="366" y="110" text-anchor="middle" font-size="11" fill="var(--dg-text)">p95 → 25.1 m</text>
  <text x="486" y="110" font-size="10.5" fill="var(--dg-muted)">robust to one high return</text>
  <rect x="266" y="130" width="200" height="34" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="366" y="152" text-anchor="middle" font-size="11" fill="var(--dg-text)">mean → 18.1 m</text>
  <text x="486" y="152" font-size="10.5" fill="var(--dg-muted)">no surface sits at this height</text>
  <rect x="266" y="172" width="200" height="34" rx="6" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="366" y="194" text-anchor="middle" font-size="11" fill="var(--dg-text)">count → 8</text>
  <text x="486" y="194" font-size="10.5" fill="var(--dg-muted)">a density layer, not a height</text>
  <text x="30" y="238" font-size="10.5" fill="var(--dg-muted)">ask for several at once — "output_type": "max,count" writes both bands in a single pass over the cloud</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| A normalised cloud | carrying `HeightAboveGround`, from [filters.hag_nn](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/computing-height-above-ground-with-filters-hag-nn/) |
| PDAL | 2.4+ with `writers.gdal` |
| A defensible cell size | supported by ground density, not chosen for appearance |
| GDAL | for the post-processing clamp and for validation |

## Step-by-Step Implementation

### Step 1 — Point the writer at the right dimension

```json
{"type": "writers.gdal", "filename": "chm.tif",
 "dimension": "HeightAboveGround", "output_type": "max",
 "resolution": 1.0, "nodata": -9999, "gdaldriver": "GTiff"}
```

Omit `dimension` and you rasterize Z, producing a perfectly plausible DSM that nobody notices is wrong until it is compared against field measurements.

### Step 2 — Fill small gaps, and only small ones

```json
{"window_size": 3}
```

Three cells fills the pinholes between crowns. Larger windows bridge real gaps and manufacture canopy where there is none — the same trade as in [filling NoData voids in DTM rasters](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/filling-nodata-voids-in-dtm-rasters/).

### Step 3 — Clamp negatives at the raster, not in the cloud

Small negative heights are interpolation noise. Clamping them to zero in the raster is honest presentation; deleting the points that produced them destroys the evidence that the ground surface was slightly wrong.

### Step 4 — Write a count band alongside

```json
{"output_type": "max,count"}
```

The count band is the confidence layer: a cell with two returns and a cell with forty both report a height, and only one of them means much.

## Complete Working Example

```python
"""Rasterize a canopy height model from a normalised cloud, with a count band."""
from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np
import pdal

LOG = logging.getLogger("chm_raster")


def rasterize(src: Path, out: Path, resolution: float = 1.0, window: int = 3) -> int:
    spec = json.dumps({"pipeline": [
        {"type": "readers.las", "filename": str(src)},
        # Non-vegetation returns are heights above ground too; exclude them
        # explicitly rather than hoping the maximum happens to be a tree.
        {"type": "filters.range", "limits": "Classification[3:5]"},
        {"type": "writers.gdal", "filename": str(out),
         "dimension": "HeightAboveGround",
         "output_type": "max,count",
         "resolution": resolution,
         "window_size": window,
         "nodata": -9999,
         "gdaldriver": "GTiff",
         "gdalopts": "COMPRESS=DEFLATE,TILED=YES"},
    ]})
    return pdal.Pipeline(spec).execute()


def summarise(src: Path) -> dict:
    """Report the height distribution from the cloud, which the raster generalises."""
    p = pdal.Pipeline(json.dumps({"pipeline": [
        {"type": "readers.las", "filename": str(src)},
        {"type": "filters.range", "limits": "Classification[3:5]"},
    ]}))
    p.execute()
    hag = p.arrays[0]["HeightAboveGround"]
    return {
        "vegetation_points": int(len(hag)),
        "p50": round(float(np.percentile(hag, 50)), 2),
        "p95": round(float(np.percentile(hag, 95)), 2),
        "max": round(float(hag.max()), 2),
        "below_zero": int((hag < 0).sum()),
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    n = rasterize(Path("normalised.laz"), Path("chm.tif"))
    LOG.info("rasterized %d vegetation returns", n)
    print(json.dumps(summarise(Path("normalised.laz")), indent=2))
```

## Key Parameter Table

| Option | Value | Effect |
|---|---|---|
| `dimension` | `HeightAboveGround` | Without it the raster is a DSM |
| `output_type` | `max` | Canopy top; `p95` where a single high return is a risk |
| `resolution` | 1.0–2.0 m | Set by ground density, not by how it looks |
| `window_size` | 3 | Fills pinholes; larger bridges real gaps |
| `nodata` | −9999 | Never 0, which is a legitimate height |
| `gdalopts` | `COMPRESS=DEFLATE,TILED=YES` | Cheap, and makes the product usable over a network |

<svg viewBox="18 30 684 217" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The two bands a canopy height product should ship" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Ship the confidence band with the height band</title>
  <desc>A two-band product. Band one is the maximum height above ground per cell, which is the canopy height model itself. Band two is the count of returns that produced it, which distinguishes a cell backed by forty returns from one backed by two. Without the second band nothing downstream can tell them apart.</desc>
  <rect x="18" y="30" width="684" height="217" fill="var(--dg-bg)" rx="10"/>
  <rect x="40" y="52" width="300" height="120" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.4"/>
  <text x="190" y="86" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">band 1 — max</text>
  <text x="190" y="112" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">height above ground, metres</text>
  <text x="190" y="136" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">float32, nodata −9999</text>
  <text x="190" y="158" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">the product everyone asks for</text>
  <rect x="380" y="52" width="300" height="120" rx="8" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.4"/>
  <text x="530" y="86" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">band 2 — count</text>
  <text x="530" y="112" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">returns contributing to the cell</text>
  <text x="530" y="136" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">uint16, nodata 0</text>
  <text x="530" y="158" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">the one that says how much to trust it</text>
  <text x="40" y="204" font-size="10.5" fill="var(--dg-muted)">"output_type": "max,count" writes both in one pass — the cost is one extra band and the benefit is that</text>
  <text x="40" y="222" font-size="10.5" fill="var(--dg-muted)">a cell backed by two returns can be told apart from one backed by forty.</text>
</svg>

## Verification

**The raster is heights, not elevations.** Sample a cell over open ground: it should read near zero, not near the terrain elevation. This single check catches the missing `dimension` option.

**The maximum is plausible.** Compare against the tallest local species.

**NoData is where you expect it.** Over water and hard surfaces if you filtered to vegetation classes; not scattered randomly through the canopy, which would mean the cell size is too fine for the data.

**The count band supports the height band.** Cells with one or two returns should be treated as provisional, and a product that does not ship the count band cannot express that.

<svg viewBox="158 7 555 259" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Share of empty CHM cells and mean canopy height at four cell sizes" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Cell size changes the answer, not just the picture</title>
  <desc>Four cell sizes over the same block. At half a metre, 38 percent of cells are empty and the mean canopy height reads 24.9 metres. At one metre, 11 percent empty and 23.8. At two metres, 1 percent empty and 22.4. At four metres, no empty cells and 20.9. The coarser the grid, the lower the reported canopy, because a larger cell is more likely to include a gap.</desc>
  <rect x="158" y="7" width="555" height="259" fill="var(--dg-bg)" rx="10"/>
  <text x="220" y="40" font-size="10.5" fill="var(--dg-muted)">the same normalised cloud, four rasterizations</text>
  <text x="210" y="76" text-anchor="end" font-size="11.5" fill="var(--dg-text)">0.5 m</text>
  <rect x="220" y="58" width="228" height="28" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="334" y="77" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">38% empty</text>
  <text x="458" y="77" font-size="10.5" fill="var(--dg-muted)">mean height 24.9 m</text>
  <text x="210" y="120" text-anchor="end" font-size="11.5" fill="var(--dg-text)">1.0 m</text>
  <rect x="220" y="102" width="66" height="28" rx="4" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="296" y="121" font-size="10.5" fill="var(--dg-muted)">11% empty</text>
  <text x="458" y="121" font-size="10.5" fill="var(--dg-muted)">mean height 23.8 m</text>
  <text x="210" y="164" text-anchor="end" font-size="11.5" fill="var(--dg-text)">2.0 m</text>
  <rect x="220" y="146" width="12" height="28" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="242" y="165" font-size="10.5" fill="var(--dg-muted)">1% empty</text>
  <text x="458" y="165" font-size="10.5" fill="var(--dg-muted)">mean height 22.4 m</text>
  <text x="210" y="208" text-anchor="end" font-size="11.5" fill="var(--dg-text)">4.0 m</text>
  <rect x="220" y="190" width="6" height="28" rx="3" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="236" y="209" font-size="10.5" fill="var(--dg-muted)">0% empty</text>
  <text x="458" y="209" font-size="10.5" fill="var(--dg-muted)">mean height 20.9 m</text>
  <text x="220" y="240" font-size="10.5" fill="var(--dg-muted)">a change-detection study that compares two epochs at different cell sizes measures the cell size</text>
</svg>

## Gotchas and Edge Cases

**Non-vegetation returns are heights too.** A building roof is 12 m above ground and will win the max reducer. Filter to Classification 3 to 5 if the product is about vegetation.

**Zero is a legitimate height.** Setting `nodata` to 0 makes every bare-earth cell disappear. Use −9999.

**A large `window_size` invents canopy.** The fill does not know that the gap it is bridging is a clearing.

**Epochs must match.** Comparing a 0.5 m CHM against a 2 m one measures the cell size, as the chart above shows.

## Frequently Asked Questions

**Why does my canopy height model look like a surface model?**

Because the dimension option was not set, so writers.gdal rasterized Z. The result is elevations above sea level and looks entirely reasonable, which is why it usually survives until someone compares it with field measurements.

**Should I use max or mean as the reducer?**

Max, in almost every case — it reports the tallest return in the cell, which is the canopy top. A mean over returns spread through a crown reports a height at which no physical surface sits. Where one spurious high return is a real risk, a high percentile is the robust compromise.

**Does cell size change the numbers or just the picture?**

The numbers. A larger cell is more likely to contain a gap, so mean canopy height falls as the grid coarsens — around four metres between a half-metre and a four-metre raster over the same block. Change detection between epochs is only meaningful if the cell sizes match.

**What should NoData be?**

Anything but zero. Zero is a legitimate canopy height over bare ground, so using it as the NoData value silently deletes every open cell from the product.

---

## Related

- [Canopy Height Models with filters.hag_nn](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/) — the parent workflow and its two routes
- [Computing Height Above Ground with filters.hag_nn](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/computing-height-above-ground-with-filters-hag-nn/) — producing the normalised cloud this rasterizes
- [Extracting Individual Tree Heights from a CHM](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/extracting-individual-tree-heights-from-a-chm/) — what to do with the raster once it exists
- [Generating a DTM GeoTIFF with writers.gdal](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/generating-a-dtm-geotiff-with-writers-gdal/) — the same writer, configured for bare earth
- [Filling NoData Voids in DTM Rasters](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/filling-nodata-voids-in-dtm-rasters/) — the fill-window trade-off, in its original setting
