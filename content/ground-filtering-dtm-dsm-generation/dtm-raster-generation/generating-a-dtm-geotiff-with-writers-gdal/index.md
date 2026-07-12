---
title: "Generating a DTM GeoTIFF with writers.gdal"
description: "A complete PDAL recipe to rasterize ground-classified LiDAR into a compressed, tiled DTM GeoTIFF using writers.gdal — resolution, output_type=idw, and rasterio verification."
slug: "generating-a-dtm-geotiff-with-writers-gdal"
type: "long_tail"
breadcrumb: "DTM GeoTIFF with writers.gdal"
datePublished: "2024-06-24"
dateModified: "2026-07-12"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Generating a DTM GeoTIFF with writers.gdal",
      "description": "A complete PDAL recipe to rasterize ground-classified LiDAR into a compressed, tiled DTM GeoTIFF using writers.gdal — resolution, output_type=idw, and rasterio verification.",
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
        {"@type": "ListItem", "position": 4, "name": "DTM GeoTIFF with writers.gdal", "item": "https://pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/generating-a-dtm-geotiff-with-writers-gdal/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Generate a DTM GeoTIFF with PDAL writers.gdal",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Confirm ground classification", "text": "Run pdal info --metadata and verify a non-zero count of Classification 2 points in the tile."},
        {"@type": "HowToStep", "position": 2, "name": "Filter to ground", "text": "Add filters.range with limits Classification[2:2] to pass only ground returns."},
        {"@type": "HowToStep", "position": 3, "name": "Rasterize with writers.gdal", "text": "Set resolution, output_type to idw, gdaldriver to GTiff, and gdalopts to a compressed tiled profile."},
        {"@type": "HowToStep", "position": 4, "name": "Execute the pipeline", "text": "Run the pipeline in Python and confirm a non-zero point count."},
        {"@type": "HowToStep", "position": 5, "name": "Verify with rasterio", "text": "Open the GeoTIFF, check the CRS, shape, NoData value, and elevation range."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Do I need a separate GDAL install to use writers.gdal?",
          "acceptedAnswer": {"@type": "Answer", "text": "No. PDAL links GDAL internally, so writers.gdal works out of the box when PDAL is installed from conda-forge or a distribution package. You only need a standalone GDAL if you later run command-line tools such as gdaladdo or gdal_translate on the output GeoTIFF."}
        },
        {
          "@type": "Question",
          "name": "What resolution should I pick for a DTM GeoTIFF?",
          "acceptedAnswer": {"@type": "Answer", "text": "Match the cell size to the average spacing of ground returns. For typical airborne surveys of 8 to 20 ground points per square metre, 1 m is a safe default and 0.5 m is achievable in dense areas. Going finer than the ground spacing produces a raster dominated by interpolation and NoData holes rather than measured elevation."}
        },
        {
          "@type": "Question",
          "name": "Why is my output GeoTIFF so large?",
          "acceptedAnswer": {"@type": "Answer", "text": "An uncompressed GeoTIFF stores four bytes per cell with no reduction. Add COMPRESS=DEFLATE (or LZW) and TILED=YES to gdalopts; DEFLATE typically shrinks a DTM by three to five times because adjacent elevations are highly correlated. Predictor=3 in gdalopts squeezes floating-point rasters further."}
        },
        {
          "@type": "Question",
          "name": "Can writers.gdal write more than one statistic at once?",
          "acceptedAnswer": {"@type": "Answer", "text": "Yes. Setting output_type to all writes a multi-band GeoTIFF containing min, max, mean, idw, count, and stdev bands in one pass. It is a fast way to get an IDW DTM plus a coverage and roughness band together, at the cost of a larger file."}
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Chain `filters.range` with `limits: "Classification[2:2]"` into `writers.gdal` set to `output_type: "idw"`, a metric `resolution`, `gdaldriver: "GTiff"`, and `gdalopts: "COMPRESS=DEFLATE,TILED=YES"`, then open the result in `rasterio` to confirm the CRS, shape, and NoData fraction before you ship it.

## Context and Motivation

This guide is part of [DTM Raster Generation with PDAL](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/), the broader treatment of turning classified ground returns into terrain surfaces. Here the goal is narrow and practical: produce one correct, compact, GIS-ready DTM GeoTIFF from a classified tile and prove it is correct.

The reason this deserves its own recipe is that a DTM is only as trustworthy as the small set of `writers.gdal` options behind it. A pipeline that omits the ground filter silently rasterizes tree canopy; one that forgets `gdalopts` emits a file several times larger than necessary; one that runs on a cloud still in degrees produces a raster with degree-sized pixels. Getting the exact stage list right once, and verifying it, saves hours of confused debugging in downstream slope, contour, and hydrology work. The classification step this recipe depends on is produced upstream by [SMRF Ground Classification](/ground-filtering-dtm-dsm-generation/smrf-ground-classification/).

<svg viewBox="0 0 720 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Recipe flow: classified tile to ground filter to writers.gdal IDW rasterizer to compressed tiled GeoTIFF verified with rasterio" style="width:100%;max-width:720px;display:block;margin:1.5rem auto">
  <title>DTM GeoTIFF recipe stage flow</title>
  <desc>Three processing boxes connected left to right: a ground filter keeping Classification 2, a writers.gdal stage set to IDW at one metre resolution writing a DEFLATE-compressed tiled GeoTIFF, and a rasterio verification box confirming CRS, shape and NoData. A note below marks that the CRS travels from the points into the raster header.</desc>
  <defs>
    <marker id="gt-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <rect x="12" y="70" width="180" height="72" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="102" y="98" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">filters.range</text>
  <text x="102" y="117" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">Classification[2:2]</text>
  <text x="102" y="132" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">ground returns</text>
  <rect x="250" y="60" width="200" height="92" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="350" y="86" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">writers.gdal</text>
  <text x="350" y="106" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">output_type: idw</text>
  <text x="350" y="121" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">resolution: 1.0 m</text>
  <text x="350" y="136" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">DEFLATE + TILED</text>
  <rect x="508" y="70" width="196" height="72" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="606" y="98" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">rasterio.open</text>
  <text x="606" y="117" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">CRS · shape · nodata</text>
  <text x="606" y="132" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">z-range check</text>
  <line x1="192" y1="106" x2="246" y2="106" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#gt-arr)"/>
  <line x1="450" y1="106" x2="504" y2="106" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#gt-arr)"/>
  <text x="350" y="184" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.5">EPSG:32615 travels from the point CRS into the GeoTIFF header automatically</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL | 2.5+ with GDAL 3.x linked (conda-forge recommended) |
| Python `pdal` bindings | `pip install pdal` |
| `rasterio` | 1.3+ for verification |
| Input tile | LAS/LAZ already ground-classified (Classification 2 present) |
| CRS | Projected metric CRS in the header — this recipe assumes `EPSG:32615` (WGS 84 / UTM zone 15N) |

Confirm the tile actually contains ground points before you rasterize anything:

```bash
pdal info --metadata tile_utm15n.laz | python -m json.tool | grep -i classification
```

If the classification histogram shows no class 2, the cloud is unclassified — run a ground filter first. Files whose header CRS is empty or geographic should be reprojected, since a DTM's `resolution` is only meaningful in metres; the [Spatial Reprojection](/pdal-pipeline-architecture-execution/spatial-reprojection/) guide covers that repair.

## Step-by-Step Implementation

### Step 1 — Filter to ground returns

Everything hinges on removing non-ground points before rasterization. `filters.range` reads the `Classification` dimension and passes only the codes you allow.

```json
{
  "type": "filters.range",
  "limits": "Classification[2:2]"
}
```

The `[2:2]` range is inclusive on both ends, so it matches exactly the ASPRS ground code. This is the same conditional selection described in [Pipeline Filtering Logic](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/).

### Step 2 — Configure writers.gdal

Attach the rasterizer with an IDW interpolator at 1 m and a compact GeoTIFF profile.

```json
{
  "type": "writers.gdal",
  "filename": "dtm_utm15n_1m.tif",
  "resolution": 1.0,
  "output_type": "idw",
  "radius": 1.5,
  "window_size": 3,
  "nodata": -9999.0,
  "data_type": "float32",
  "gdaldriver": "GTiff",
  "gdalopts": "COMPRESS=DEFLATE,PREDICTOR=3,TILED=YES,BLOCKXSIZE=256,BLOCKYSIZE=256"
}
```

`PREDICTOR=3` is a floating-point-specific option that improves DEFLATE compression of smoothly varying elevation data. `radius: 1.5` gives each cell a slightly larger catchment than the default so speckle is reduced, and `window_size: 3` closes small isolated holes in one pass.

### Step 3 — Assemble and execute

```python
import json
import pdal

pipeline = {
    "pipeline": [
        {"type": "readers.las", "filename": "tile_utm15n.laz"},
        {"type": "filters.range", "limits": "Classification[2:2]"},
        {
            "type": "writers.gdal",
            "filename": "dtm_utm15n_1m.tif",
            "resolution": 1.0,
            "output_type": "idw",
            "radius": 1.5,
            "window_size": 3,
            "nodata": -9999.0,
            "data_type": "float32",
            "gdaldriver": "GTiff",
            "gdalopts": "COMPRESS=DEFLATE,PREDICTOR=3,TILED=YES,BLOCKXSIZE=256,BLOCKYSIZE=256",
        },
    ]
}

count = pdal.Pipeline(json.dumps(pipeline)).execute()
print(f"Rasterized {count:,} ground points into dtm_utm15n_1m.tif")
```

A returned count of `0` means no ground points reached the writer — revisit Step 1.

### Step 4 — Verify with rasterio

Open the output and confirm the essentials before it enters any downstream process.

```python
import rasterio

with rasterio.open("dtm_utm15n_1m.tif") as ds:
    print("CRS:       ", ds.crs)
    print("Shape:     ", (ds.height, ds.width))
    print("Pixel size:", ds.res)
    print("NoData:    ", ds.nodata)
```

Expect `CRS: EPSG:32615`, a pixel size of `(1.0, 1.0)`, and a NoData of `-9999.0`.

## Complete Working Example

Save as `make_dtm.py` and run against any ground-classified tile.

```python
#!/usr/bin/env python3
"""
make_dtm.py — rasterize a ground-classified LAS/LAZ tile into a DTM GeoTIFF.

Usage:
    python make_dtm.py tile_utm15n.laz dtm_utm15n_1m.tif 1.0

Requirements:
    conda install -c conda-forge pdal python-pdal rasterio
"""

import json
import sys

import pdal
import rasterio


def build_dtm(input_path: str, output_tif: str, resolution: float) -> int:
    """Rasterize Classification 2 points into an IDW DTM GeoTIFF; return point count."""
    pipeline = {
        "pipeline": [
            {"type": "readers.las", "filename": input_path},
            {"type": "filters.range", "limits": "Classification[2:2]"},
            {
                "type": "writers.gdal",
                "filename": output_tif,
                "resolution": resolution,
                "output_type": "idw",
                "radius": resolution * 1.5,
                "window_size": 3,
                "nodata": -9999.0,
                "data_type": "float32",
                "gdaldriver": "GTiff",
                "gdalopts": (
                    "COMPRESS=DEFLATE,PREDICTOR=3,TILED=YES,"
                    "BLOCKXSIZE=256,BLOCKYSIZE=256"
                ),
            },
        ]
    }

    count = pdal.Pipeline(json.dumps(pipeline)).execute()
    if count == 0:
        raise RuntimeError(
            f"No ground points found in '{input_path}'. "
            "Is the tile classified (Classification 2 present)?"
        )
    return count


def verify_dtm(output_tif: str) -> None:
    """Print and sanity-check the DTM's CRS, geometry, and elevation range."""
    with rasterio.open(output_tif) as ds:
        band = ds.read(1, masked=True)
        void_fraction = band.mask.sum() / band.size

        print(f"CRS:            {ds.crs}")
        print(f"Shape (r x c):  {ds.height} x {ds.width}")
        print(f"Pixel size:     {ds.res}")
        print(f"NoData:         {ds.nodata}")
        print(f"NoData cells:   {void_fraction:.1%}")
        print(f"Z range:        {band.min():.2f} .. {band.max():.2f} m")

        assert ds.crs is not None, "Output DTM has no CRS"
        assert ds.nodata is not None, "Output DTM has no NoData value"
        if void_fraction > 0.10:
            print("WARNING: over 10% NoData — consider coarser resolution or a void fill.")


def main() -> None:
    if len(sys.argv) != 4:
        print("Usage: python make_dtm.py <input.laz> <output.tif> <resolution_m>")
        sys.exit(1)

    input_path, output_tif, resolution = sys.argv[1], sys.argv[2], float(sys.argv[3])
    n = build_dtm(input_path, output_tif, resolution)
    print(f"Rasterized {n:,} ground points -> {output_tif}")
    verify_dtm(output_tif)


if __name__ == "__main__":
    main()
```

## Key Parameter Table

| Parameter | Stage | Example | Notes |
|---|---|---|---|
| `limits` | `filters.range` | `Classification[2:2]` | Keep only ground; add `,Classification[9:9]` to include water |
| `resolution` | `writers.gdal` | `1.0` | Cell size in metres for a UTM CRS |
| `output_type` | `writers.gdal` | `idw` | Smooth bare-earth surface; use `all` for diagnostics |
| `radius` | `writers.gdal` | `1.5` | Search neighbourhood; ~1.5× resolution reduces speckle |
| `window_size` | `writers.gdal` | `3` | Fills small NoData holes from neighbours |
| `nodata` | `writers.gdal` | `-9999.0` | Empty-cell sentinel |
| `data_type` | `writers.gdal` | `float32` | Half the size of float64 with ample precision |
| `gdalopts` | `writers.gdal` | `COMPRESS=DEFLATE,PREDICTOR=3,TILED=YES` | Compact, tiled, fast to window-read |

## Verification

Beyond the CRS and shape checks, confirm the elevation surface is physically plausible and that compression actually took effect.

```bash
# Confirm the GeoTIFF advertises DEFLATE compression and tiling
gdalinfo dtm_utm15n_1m.tif | grep -i "compression\|block"
```

```python
import numpy as np
import rasterio

with rasterio.open("dtm_utm15n_1m.tif") as ds:
    z = ds.read(1, masked=True)

# Terrain sanity: no cell should sit far below sea level or above local relief
assert z.min() > -50, "Suspiciously low elevation — check for negative noise"
print(f"Elevation p1={np.percentile(z.compressed(),1):.1f} "
      f"p99={np.percentile(z.compressed(),99):.1f} m")
```

A DTM whose 1st-to-99th-percentile band matches the site's known relief, with the NoData fraction under a few percent, is ready for slope and hillshade derivation.

## Gotchas and Edge Cases

**1. The tile was never classified.** Running this recipe on a raw cloud yields a first-surface model, not terrain, because every point counts as ground once `filters.range` finds no class-2 subset — or the writer produces an empty raster. Always confirm classification first.

**2. Degree-sized pixels.** If the header CRS is `EPSG:4326`, `resolution: 1.0` produces one-degree cells spanning roughly 111 km. Reproject to a projected CRS such as `EPSG:32615` before rasterizing.

**3. Interpolation invents terrain across large voids.** `window_size` and a generous `radius` will happily fill a river channel or building footprint with fabricated ground. Keep both modest and treat genuinely large holes deliberately, as in [Filling NoData Voids in DTM Rasters](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/filling-nodata-voids-in-dtm-rasters/).

**4. NoData ignored downstream.** A few tools disregard the GeoTIFF NoData tag and average `-9999` into slope calculations, producing cliff artefacts at void edges. Mask explicitly with `rasterio` masked reads when feeding such tools.

## Frequently Asked Questions

**Do I need a separate GDAL install to use writers.gdal?**

No. PDAL links GDAL internally, so `writers.gdal` works out of the box when PDAL is installed from conda-forge or a distribution package. You only need a standalone GDAL if you later run command-line tools such as `gdaladdo` or `gdal_translate` on the output GeoTIFF.

**What resolution should I pick for a DTM GeoTIFF?**

Match the cell size to the average spacing of ground returns. For typical airborne surveys of 8 to 20 ground points per square metre, 1 m is a safe default and 0.5 m is achievable in dense areas. Going finer than the ground spacing produces a raster dominated by interpolation and NoData holes rather than measured elevation — measure spacing with [Point Density Metrics](/point-cloud-data-standards-fundamentals/point-density-metrics/).

**Why is my output GeoTIFF so large?**

An uncompressed GeoTIFF stores four bytes per cell with no reduction. Add `COMPRESS=DEFLATE` (or `LZW`) and `TILED=YES` to `gdalopts`; DEFLATE typically shrinks a DTM by three to five times because adjacent elevations are highly correlated. `PREDICTOR=3` squeezes floating-point rasters further.

**Can writers.gdal write more than one statistic at once?**

Yes. Setting `output_type: "all"` writes a multi-band GeoTIFF containing min, max, mean, idw, count, and stdev bands in one pass. It is a fast way to get an IDW DTM plus a coverage and roughness band together, at the cost of a larger file.

---

## Related

- [DTM Raster Generation with PDAL](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/) — parent guide covering every writers.gdal parameter
- [IDW vs Mean Interpolation for DTM Gaps](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/idw-vs-mean-interpolation-for-dtm-gaps/) — choosing the cell interpolator
- [Filling NoData Voids in DTM Rasters](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/filling-nodata-voids-in-dtm-rasters/) — closing holes the recipe leaves behind
- [SMRF Ground Classification](/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) — producing the Classification 2 labels this recipe consumes
- [Ground Filtering and DTM/DSM Generation with PDAL](/ground-filtering-dtm-dsm-generation/) — the surrounding terrain-modelling overview
