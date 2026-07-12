---
title: "Filling NoData Voids in DTM Rasters"
description: "Techniques to fill NoData holes in a LiDAR DTM after rasterization — writers.gdal window_size, gdal_fillnodata, and rasterio fillnodata — plus how to avoid over-smoothing real terrain."
slug: "filling-nodata-voids-in-dtm-rasters"
type: "long_tail"
breadcrumb: "Filling NoData Voids in DTMs"
datePublished: "2024-06-24"
dateModified: "2026-07-12"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Filling NoData Voids in DTM Rasters",
      "description": "Techniques to fill NoData holes in a LiDAR DTM after rasterization — writers.gdal window_size, gdal_fillnodata, and rasterio fillnodata — plus how to avoid over-smoothing real terrain.",
      "datePublished": "2024-06-24",
      "dateModified": "2026-07-12",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "Ground Filtering & Terrain Models", "item": "https://pythonlidar.com/ground-filtering-dtm-dsm-generation/"},
        {"@type": "ListItem", "position": 3, "name": "DTM Raster Generation", "item": "https://pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/"},
        {"@type": "ListItem", "position": 4, "name": "Filling NoData Voids in DTMs", "item": "https://pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/filling-nodata-voids-in-dtm-rasters/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Fill NoData voids in a LiDAR DTM",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Measure the voids", "text": "Open the DTM with rasterio and compute the NoData fraction and largest hole size before filling."},
        {"@type": "HowToStep", "position": 2, "name": "Fill small holes at write time", "text": "Set window_size on writers.gdal to interpolate isolated empty cells during rasterization."},
        {"@type": "HowToStep", "position": 3, "name": "Fill remaining voids in post", "text": "Run rasterio.fill.fillnodata or gdal_fillnodata with a bounded max_search_distance."},
        {"@type": "HowToStep", "position": 4, "name": "Verify no real terrain was invented", "text": "Compare the filled and original rasters and confirm large voids were left or flagged, not smoothed over."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Should I fill every NoData cell in a DTM?",
          "acceptedAnswer": {"@type": "Answer", "text": "No. Small interpolation gaps between ground returns are safe to fill because the surrounding terrain constrains the answer. Large voids — building footprints, water bodies, dense canopy shadows — have no nearby ground to interpolate from, so filling them fabricates terrain. Fill small holes, and either leave large voids as NoData or replace them from an authoritative external source such as a national elevation dataset."}
        },
        {
          "@type": "Question",
          "name": "What is the difference between window_size and gdal_fillnodata?",
          "acceptedAnswer": {"@type": "Answer", "text": "window_size fills holes inside writers.gdal during rasterization using a moving-window average of populated neighbours, so it runs before the GeoTIFF is even written. gdal_fillnodata and rasterio.fill.fillnodata run afterward on the finished raster and use an inverse-distance interpolation outward from void edges with an optional smoothing pass. window_size is convenient for small holes; the post-processing tools give finer control over search distance and smoothing."}
        },
        {
          "@type": "Question",
          "name": "How large a void can fillnodata safely close?",
          "acceptedAnswer": {"@type": "Answer", "text": "Bound it with max_search_distance, expressed in pixels. A distance of a few cells fills speckle and narrow gaps that are genuinely constrained by surrounding terrain. Allowing an unlimited search lets the algorithm reach across an entire building footprint or lake and invent a smooth ramp that never existed, so always cap the distance to roughly the largest gap you trust the surrounding terrain to explain."}
        },
        {
          "@type": "Question",
          "name": "Does filling voids change the raster CRS or resolution?",
          "acceptedAnswer": {"@type": "Answer", "text": "No. All three techniques operate on cell values only; they preserve the grid geometry, CRS, and pixel size. A void fill changes which cells hold elevation versus NoData, never where those cells sit in space, so the filled DTM overlays the original exactly."}
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Close small, terrain-constrained holes with `writers.gdal` `window_size` during rasterization, then finish the raster with a distance-bounded `rasterio.fill.fillnodata` or `gdal_fillnodata` pass — but cap `max_search_distance` so large voids like buildings and water are left as NoData rather than filled with invented ground.

## Context and Motivation

This guide is part of [DTM Raster Generation with PDAL](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/). Even a well-tuned rasterization leaves gaps: ground returns thin out under dense canopy, water absorbs the laser and returns nothing, and building footprints contain no bare-earth points at all. The result is a DTM peppered with NoData cells that break contouring, leave black holes in hillshades, and trip up hydrological flow routing.

Filling those voids is a balancing act rather than a one-liner. Fill too timidly and derived products still fail on the remaining holes; fill too aggressively and you smooth invented terrain across a lake or a warehouse roof, corrupting the very measurements a survey exists to provide. This guide walks the three tools that matter — the in-writer `window_size`, GDAL's `gdal_fillnodata`, and `rasterio.fill.fillnodata` — and shows how to bound each so it closes honest gaps without manufacturing terrain. The worked raster is a coastal 2 m DTM in `EPSG:32610` (WGS 84 / UTM zone 10N), where tidal flats and forest edges create exactly the mix of small and large voids that makes this decision matter.

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Three void-filling stages: window_size during writing, then bounded fillnodata, leaving a large void untouched" style="width:100%;max-width:720px;display:block;margin:1.5rem auto">
  <title>Void-filling decision flow for a DTM</title>
  <desc>A DTM grid with two small holes and one large hole. Stage one uses window_size in writers.gdal to close the small holes. Stage two uses a distance-bounded fillnodata pass to close a slightly larger constrained gap. The large void, representing a building or lake, is deliberately left as NoData with a flag.</desc>
  <defs>
    <marker id="fn-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <rect x="14" y="60" width="150" height="120" rx="6" fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.7"/>
  <text x="89" y="48" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">raw DTM</text>
  <rect x="40" y="90" width="14" height="14" fill="currentColor" opacity="0.55"/>
  <rect x="100" y="120" width="14" height="14" fill="currentColor" opacity="0.55"/>
  <rect x="70" y="140" width="46" height="30" fill="currentColor" opacity="0.3"/>
  <text x="89" y="196" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6">small + large voids</text>
  <line x1="166" y1="120" x2="200" y2="120" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#fn-arr)"/>
  <rect x="204" y="60" width="150" height="120" rx="6" fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.7"/>
  <text x="279" y="48" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">window_size</text>
  <rect x="260" y="140" width="46" height="30" fill="currentColor" opacity="0.3"/>
  <text x="279" y="196" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6">small holes closed</text>
  <line x1="356" y1="120" x2="390" y2="120" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#fn-arr)"/>
  <rect x="394" y="60" width="150" height="120" rx="6" fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.7"/>
  <text x="469" y="48" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">fillnodata</text>
  <rect x="450" y="140" width="46" height="30" fill="currentColor" opacity="0.3"/>
  <text x="469" y="196" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6">bounded fill</text>
  <line x1="546" y1="120" x2="580" y2="120" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#fn-arr)"/>
  <rect x="584" y="60" width="122" height="120" rx="6" fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.7"/>
  <text x="645" y="48" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">final</text>
  <rect x="622" y="140" width="46" height="30" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="4 3" opacity="0.7"/>
  <text x="645" y="196" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6">large void kept</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| A rasterized DTM | GeoTIFF from [writers.gdal](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/generating-a-dtm-geotiff-with-writers-gdal/) with a valid `nodata` tag |
| `rasterio` | 1.3+ (`fillnodata` lives in `rasterio.fill`) |
| GDAL CLI | 3.x for `gdal_fillnodata` (optional; bundled with a full GDAL install) |
| `numpy` | any recent version |
| CRS | The DTM carries a projected CRS — here `EPSG:32610` |

## Step-by-Step Implementation

### Step 1 — Measure the voids before touching them

Quantify the problem so you can tell whether a fill helped and whether any large voids should be excluded.

```python
import numpy as np
import rasterio
from scipy import ndimage

with rasterio.open("dtm_coastal_2m.tif") as ds:
    band = ds.read(1, masked=True)

void_fraction = band.mask.sum() / band.size
# Label connected NoData regions to find the largest hole
labels, n = ndimage.label(band.mask)
sizes = ndimage.sum(band.mask, labels, range(1, n + 1))
print(f"NoData fraction: {void_fraction:.1%}")
print(f"Void regions:    {n}")
print(f"Largest void:    {int(sizes.max())} cells")
```

A largest-void figure of a few dozen cells is safe to interpolate; thousands of cells signals a building or water body that must be excluded from filling.

### Step 2 — Close small holes at write time with window_size

The cheapest fill happens during rasterization. `window_size` runs a moving-window interpolation over empty cells inside `writers.gdal`, so isolated speckle never reaches the file.

```json
{
  "type": "writers.gdal",
  "filename": "dtm_coastal_2m.tif",
  "resolution": 2.0,
  "output_type": "idw",
  "window_size": 4,
  "nodata": -9999.0,
  "data_type": "float32",
  "gdaldriver": "GTiff",
  "gdalopts": "COMPRESS=DEFLATE,TILED=YES"
}
```

A `window_size` of 4 lets a hole be filled from populated cells up to four cells away. This is ideal for the scattered single-cell gaps between ground returns and handles most of the void count on a well-sampled tile.

### Step 3 — Fill remaining constrained gaps with rasterio

For gaps that survive `window_size`, run a bounded `fillnodata`. The `max_search_distance` cap is the safety valve that stops the algorithm reaching across a large void.

```python
import numpy as np
import rasterio
from rasterio.fill import fillnodata

with rasterio.open("dtm_coastal_2m.tif") as ds:
    profile = ds.profile
    band = ds.read(1)
    mask = ds.read_masks(1)   # 0 where NoData, 255 where valid

filled = fillnodata(
    band,
    mask=mask,
    max_search_distance=6.0,   # pixels — closes gaps up to ~12 m at 2 m cells
    smoothing_iterations=0,
)

profile.update(compress="deflate", tiled=True)
with rasterio.open("dtm_coastal_2m_filled.tif", "w", **profile) as dst:
    dst.write(filled, 1)
```

`max_search_distance=6.0` at 2 m resolution reaches roughly 12 m — enough to bridge a narrow drainage but far too short to cross a building footprint, which stays NoData.

### Step 4 — The GDAL CLI alternative

If you prefer the command line or need to script GDAL directly, `gdal_fillnodata` does the same job with an explicit distance bound:

```bash
gdal_fillnodata.py -md 6 -si 0 \
  dtm_coastal_2m.tif dtm_coastal_2m_filled.tif \
  -co COMPRESS=DEFLATE -co TILED=YES
```

`-md 6` is the maximum search distance in pixels and `-si 0` disables smoothing iterations, keeping filled values honest to their neighbours.

## Complete Working Example

Save as `fill_dtm_voids.py`. It measures voids, applies a bounded fill, protects large voids by re-masking them, and reports before-and-after statistics.

```python
#!/usr/bin/env python3
"""
fill_dtm_voids.py — bounded NoData fill for a LiDAR DTM that protects large voids.

Usage:
    python fill_dtm_voids.py dtm_coastal_2m.tif dtm_filled.tif --max-dist 6 --max-void 400

Requirements:
    conda install -c conda-forge rasterio scipy numpy
"""

import argparse

import numpy as np
import rasterio
from rasterio.fill import fillnodata
from scipy import ndimage


def analyze_voids(mask: np.ndarray) -> dict:
    """mask: True where NoData. Return void statistics."""
    labels, n = ndimage.label(mask)
    sizes = ndimage.sum(mask, labels, range(1, n + 1)) if n else np.array([])
    return {
        "fraction": float(mask.mean()),
        "regions": int(n),
        "largest": int(sizes.max()) if sizes.size else 0,
        "labels": labels,
        "sizes": sizes,
    }


def fill_protecting_large(path_in: str, path_out: str,
                          max_dist: float, max_void_cells: int) -> None:
    """Fill only voids smaller than max_void_cells; leave larger ones as NoData."""
    with rasterio.open(path_in) as ds:
        profile = ds.profile
        band = ds.read(1)
        valid = ds.read_masks(1)          # 255 valid, 0 NoData
        nodata = ds.nodata

    nodata_mask = valid == 0
    stats_before = analyze_voids(nodata_mask)

    # Identify large voids to protect from filling
    protect = np.zeros_like(nodata_mask)
    for region_id, size in enumerate(stats_before["sizes"], start=1):
        if size > max_void_cells:
            protect |= stats_before["labels"] == region_id

    filled = fillnodata(
        band, mask=valid,
        max_search_distance=max_dist,
        smoothing_iterations=0,
    )
    # Re-stamp protected large voids back to NoData
    filled[protect] = nodata

    after_mask = filled == nodata
    stats_after = analyze_voids(after_mask)

    profile.update(compress="deflate", tiled=True)
    with rasterio.open(path_out, "w", **profile) as dst:
        dst.write(filled.astype(profile["dtype"]), 1)

    print(f"NoData before: {stats_before['fraction']:.1%} "
          f"({stats_before['regions']} regions, largest {stats_before['largest']} cells)")
    print(f"NoData after:  {stats_after['fraction']:.1%} "
          f"({stats_after['regions']} regions, largest {stats_after['largest']} cells)")
    print(f"Protected {int((protect).sum()):,} cells in large voids from filling.")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--max-dist", type=float, default=6.0,
                    help="max search distance in pixels")
    ap.add_argument("--max-void", type=int, default=400,
                    help="voids larger than this many cells are left as NoData")
    args = ap.parse_args()
    fill_protecting_large(args.input, args.output, args.max_dist, args.max_void)


if __name__ == "__main__":
    main()
```

## Key Parameter Table

| Parameter | Tool | Example | Notes |
|---|---|---|---|
| `window_size` | `writers.gdal` | `4` | In-writer fill radius in cells; runs before the file is written |
| `max_search_distance` | `rasterio.fill.fillnodata` | `6.0` | Pixels; the primary bound against over-filling |
| `smoothing_iterations` | `rasterio.fill.fillnodata` | `0` | Post-fill 3×3 smoothing passes; keep low to avoid blurring |
| `-md` | `gdal_fillnodata` | `6` | CLI equivalent of max search distance in pixels |
| `-si` | `gdal_fillnodata` | `0` | CLI smoothing iterations |
| `max_void_cells` | custom guard | `400` | Threshold above which a void is protected from filling |

## Verification

Confirm two outcomes: that the small-void count dropped, and that no large void was silently filled. Overlaying the difference reveals exactly which cells changed.

```python
import numpy as np
import rasterio

with rasterio.open("dtm_coastal_2m.tif") as a, \
     rasterio.open("dtm_filled.tif") as b:
    before = a.read(1, masked=True)
    after = b.read(1, masked=True)

newly_filled = before.mask & ~after.mask
print(f"Cells newly filled: {int(newly_filled.sum()):,}")

# Any cell that changed should sit within the elevation range of its surroundings
changed = after.data[newly_filled]
neighbour_lo, neighbour_hi = np.percentile(after.compressed(), [1, 99])
outliers = ((changed < neighbour_lo) | (changed > neighbour_hi)).sum()
print(f"Filled values outside the 1-99 pct terrain band: {outliers}")
```

Zero outliers and a still-present largest void (the building or lake you meant to protect) confirm the fill closed genuine gaps without inventing terrain.

## Gotchas and Edge Cases

**1. Unbounded search invents a smooth lake.** Calling `fillnodata` without `max_search_distance`, or `gdal_fillnodata` without `-md`, lets the interpolation ramp across an entire water body, producing a physically impossible sloped surface. Always cap the distance.

**2. Smoothing iterations blur real breaklines.** `smoothing_iterations` above 1–2 spreads a 3×3 average over the whole fill zone, softening the crisp edges of ditches and road cuts that survey clients rely on. Prefer `0` unless the fill is visibly stepped.

**3. window_size and post-fill can double-count.** If you set a large `window_size` and then run an aggressive `fillnodata`, you interpolate atop interpolated cells, compounding smoothing. Use `window_size` for speckle and a single bounded post-pass for the rest, not both at maximum strength.

**4. Filling before deriving products, not after.** Compute slope, aspect, and hillshade from the filled DTM, but keep the unfilled DTM as the archival elevation record. Filled cells are estimates, and downstream volumetric or accuracy reporting should exclude them — a distinction worth documenting in the file's metadata, much as [Metadata & Header Sync](/point-cloud-data-standards-fundamentals/metadata-header-sync/) recommends for point clouds.

## Frequently Asked Questions

**Should I fill every NoData cell in a DTM?**

No. Small interpolation gaps between ground returns are safe to fill because the surrounding terrain constrains the answer. Large voids — building footprints, water bodies, dense canopy shadows — have no nearby ground to interpolate from, so filling them fabricates terrain. Fill small holes, and either leave large voids as NoData or replace them from an authoritative external source such as a national elevation dataset.

**What is the difference between window_size and gdal_fillnodata?**

`window_size` fills holes inside `writers.gdal` during rasterization using a moving-window average of populated neighbours, so it runs before the GeoTIFF is even written. `gdal_fillnodata` and `rasterio.fill.fillnodata` run afterward on the finished raster and use an inverse-distance interpolation outward from void edges with an optional smoothing pass. `window_size` is convenient for small holes; the post-processing tools give finer control over search distance and smoothing.

**How large a void can fillnodata safely close?**

Bound it with `max_search_distance`, expressed in pixels. A distance of a few cells fills speckle and narrow gaps that are genuinely constrained by surrounding terrain. Allowing an unlimited search lets the algorithm reach across an entire building footprint or lake and invent a smooth ramp that never existed, so always cap the distance to roughly the largest gap you trust the surrounding terrain to explain.

**Does filling voids change the raster CRS or resolution?**

No. All three techniques operate on cell values only; they preserve the grid geometry, CRS, and pixel size. A void fill changes which cells hold elevation versus NoData, never where those cells sit in space, so the filled DTM overlays the original exactly.

---

## Related

- [DTM Raster Generation with PDAL](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/) — parent guide covering window_size and the full rasterization workflow
- [Generating a DTM GeoTIFF with writers.gdal](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/generating-a-dtm-geotiff-with-writers-gdal/) — produces the raster this guide repairs
- [IDW vs Mean Interpolation for DTM Gaps](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/idw-vs-mean-interpolation-for-dtm-gaps/) — how the interpolator choice affects which cells stay empty
- [Metadata & Header Sync](/point-cloud-data-standards-fundamentals/metadata-header-sync/) — documenting which cells are measured versus filled
- [Ground Filtering and DTM/DSM Generation with PDAL](/ground-filtering-dtm-dsm-generation/) — the broader terrain-modelling context
