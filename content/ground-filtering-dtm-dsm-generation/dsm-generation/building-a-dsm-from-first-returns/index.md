---
title: "Building a DSM from First Returns"
description: "A PDAL recipe to build a Digital Surface Model from first-return LiDAR points using filters.range on ReturnNumber and writers.gdal output_type=max, with rasterio verification."
slug: "building-a-dsm-from-first-returns"
type: "howto"
breadcrumb: "DSM from First Returns"
datePublished: "2024-06-26"
dateModified: "2026-07-12"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Building a DSM from First Returns",
      "description": "A PDAL recipe to build a Digital Surface Model from first-return LiDAR points using filters.range on ReturnNumber and writers.gdal output_type=max, with rasterio verification.",
      "datePublished": "2024-06-26",
      "dateModified": "2026-07-12",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "Ground Filtering and DTM/DSM Generation with PDAL", "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/"},
        {"@type": "ListItem", "position": 3, "name": "DSM Generation", "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/"},
        {"@type": "ListItem", "position": 4, "name": "DSM from First Returns", "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/building-a-dsm-from-first-returns/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Build a DSM from first-return LiDAR points with PDAL",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Inspect returns", "text": "Run pdal info to confirm ReturnNumber and NumberOfReturns are populated in the tile."},
        {"@type": "HowToStep", "position": 2, "name": "Filter to first returns", "text": "Add filters.range with limits ReturnNumber[1:1] to keep the leading pulse return."},
        {"@type": "HowToStep", "position": 3, "name": "Rasterize the top surface", "text": "Write with writers.gdal output_type=max at a resolution matched to point spacing."},
        {"@type": "HowToStep", "position": 4, "name": "Verify with rasterio", "text": "Open the GeoTIFF, check CRS, elevation range, and void fraction before use."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why filter to ReturnNumber==1 instead of using all points?",
          "acceptedAnswer": {"@type": "Answer", "text": "First returns are the outermost surface the pulse struck — canopy top, roof edge, wire. Keeping only ReturnNumber==1 drops understory and last-return ground hits before rasterization, so the max statistic reflects the true visible skin of the scene rather than being pulled by stray high points from other pulses in the same cell."}
        },
        {
          "@type": "Question",
          "name": "What if my LiDAR only has single returns?",
          "acceptedAnswer": {"@type": "Answer", "text": "Single-return sensors record one point per pulse, so every point has ReturnNumber 1 and NumberOfReturns 1. The filter is then a no-op and the DSM is built from all points — which is correct, because there is no understory signal to exclude. The recipe still works unchanged."}
        },
        {
          "@type": "Question",
          "name": "How do I choose the resolution for a first-return DSM?",
          "acceptedAnswer": {"@type": "Answer", "text": "Filtering to first returns roughly halves the point count on vegetated scenes, so the effective spacing between surviving points is coarser than the raw density suggests. Start at the raw average spacing and coarsen one step if the void fraction exceeds about 10 percent."}
        }
      ]
    }
  ]
}
</script>

# Building a DSM from First Returns

**TL;DR:** Add `{"type": "filters.range", "limits": "ReturnNumber[1:1]"}` to keep only first returns, then rasterize with `writers.gdal` using `output_type=max` at a resolution matched to your point spacing — the maximum first-return elevation in each cell becomes the Digital Surface Model, which you confirm by opening the GeoTIFF in `rasterio` and checking the CRS, elevation range, and void fraction.

## Context and Motivation

This guide is part of [DSM Generation from LiDAR with PDAL](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/), and it drills into one specific, high-value technique: constraining the rasterizer to the leading pulse return so the resulting surface is unambiguously the top of the world. Where the parent page surveys the whole surface-modelling workflow, this recipe is the copy-and-run version you reach for when a client needs a canopy-and-structure raster by end of day.

The reason first returns deserve their own page is that they are the physically cleanest definition of a surface. When an airborne pulse descends into a forest, the first return fires off the outermost leaf it touches; subsequent returns leak through gaps and report twigs, branches, and eventually the ground. If you rasterize every return with a maximum statistic you usually get the right answer, but a single anomalously high second return from an adjacent pulse can poke a spike through your surface. Filtering to `ReturnNumber == 1` first removes that whole failure mode before the grid is ever populated. This recipe uses `EPSG:32611` (WGS84 / UTM Zone 11N) and a 0.4 m grid to keep the examples concrete and distinct from the regional Albers example on the parent page.

<svg viewBox="0 0 720 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A single LiDAR pulse producing four returns through a tree canopy, with only the first return kept for the DSM" style="width:100%;max-width:720px;display:block;margin:1.5rem auto">
  <title>Selecting the first return from a multi-return pulse</title>
  <desc>A vertical pulse enters a tree canopy and produces four returns at descending heights: return 1 at the canopy top, returns 2 and 3 in the mid-canopy, and return 4 at the ground. A callout marks return 1 as the point kept by the ReturnNumber filter and fed into the DSM.</desc>
  <defs>
    <marker id="fr-arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- sensor origin + incoming pulse -->
  <line x1="150" y1="12" x2="210" y2="12" stroke="currentColor" stroke-width="1.4" opacity="0.5"/>
  <line x1="180" y1="12" x2="180" y2="52" stroke="currentColor" stroke-width="1.4" opacity="0.6" marker-end="url(#fr-arr)"/>
  <text x="222" y="28" font-size="11" fill="currentColor" opacity="0.7">incoming pulse</text>
  <!-- ground line -->
  <line x1="40" y1="220" x2="680" y2="220" stroke="currentColor" stroke-width="1.5" stroke-dasharray="6 4" opacity="0.6"/>
  <text x="600" y="238" font-size="11" fill="currentColor" opacity="0.6">ground</text>
  <!-- returns -->
  <circle cx="180" cy="58" r="6" fill="currentColor"/>
  <text x="196" y="62" font-size="12" fill="currentColor" font-family="monospace">ReturnNumber = 1</text>
  <circle cx="180" cy="110" r="5" fill="currentColor" opacity="0.5"/>
  <text x="196" y="114" font-size="11" fill="currentColor" font-family="monospace" opacity="0.55">2</text>
  <circle cx="180" cy="158" r="5" fill="currentColor" opacity="0.5"/>
  <text x="196" y="162" font-size="11" fill="currentColor" font-family="monospace" opacity="0.55">3</text>
  <circle cx="180" cy="214" r="5" fill="currentColor" opacity="0.5"/>
  <text x="196" y="210" font-size="11" fill="currentColor" font-family="monospace" opacity="0.55">4 (last, ground)</text>
  <!-- kept callout -->
  <rect x="420" y="40" width="250" height="40" rx="6" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.7"/>
  <text x="545" y="58" text-anchor="middle" font-size="11" fill="currentColor">filters.range keeps this point</text>
  <text x="545" y="73" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">→ writers.gdal output_type = max</text>
  <line x1="192" y1="58" x2="418" y2="60" stroke="currentColor" stroke-width="1" opacity="0.4" marker-end="url(#fr-arr)"/>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL | 2.5+ with Python bindings (`pip install pdal`) |
| `rasterio` | 1.3+ for output verification |
| Input file | LAS/LAZ with populated `ReturnNumber` and `NumberOfReturns` |
| CRS | Metre-based projected CRS; this recipe uses `EPSG:32611` |
| Point density | Known average spacing — see [Point Density Metrics](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/) |

Before writing any pipeline, confirm the tile actually carries multi-return data. A file where every point reports `ReturnNumber == 1` came from a single-return sensor, and the filter below will be a harmless no-op:

```bash
pdal info --stats --dimensions ReturnNumber,NumberOfReturns first_return_tile.laz
```

Look for `NumberOfReturns` maxima above 1. If the maximum is 1 everywhere, skip straight to rasterization — there is no understory to exclude.

## Step-by-Step Implementation

### Step 1 — Keep only the first return

`filters.range` selects points by a numeric interval on any dimension. The interval `ReturnNumber[1:1]` means "keep points where `ReturnNumber` is between 1 and 1 inclusive" — i.e. exactly the first return. This shares the interval syntax used across [Pipeline Filtering Logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/).

```json
{
  "type": "filters.range",
  "limits": "ReturnNumber[1:1]"
}
```

### Step 2 — Rasterize the maximum elevation

`writers.gdal` bins the surviving points onto a grid and writes one statistic per cell. `output_type` set to `max` records the highest first-return `Z` in each cell — the top surface.

```json
{
  "type": "writers.gdal",
  "filename": "first_return_dsm.tif",
  "gdaldriver": "GTiff",
  "output_type": "max",
  "resolution": 0.4,
  "nodata": -9999.0,
  "override_srs": "EPSG:32611",
  "data_type": "float32"
}
```

### Step 3 — Assemble the full pipeline

Wired together, the reader, range filter, and GDAL writer form a three-stage pipeline. This is the same reader-filter-writer chaining pattern described in [PDAL Stage Chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/).

```json
{
  "pipeline": [
    {"type": "readers.las", "filename": "first_return_tile.laz"},
    {"type": "filters.range", "limits": "ReturnNumber[1:1]"},
    {
      "type": "writers.gdal",
      "filename": "first_return_dsm.tif",
      "gdaldriver": "GTiff",
      "output_type": "max",
      "resolution": 0.4,
      "nodata": -9999.0,
      "override_srs": "EPSG:32611",
      "data_type": "float32"
    }
  ]
}
```

### Step 4 — Verify the raster

Never ship a surface raster you have not opened. `rasterio` reads the CRS, cell size, elevation range, and void mask in a few lines — enough to catch every common failure.

## Complete Working Example

Save this as `first_return_dsm.py` and run it against any multi-return LAZ tile. It builds the pipeline in Python, executes it, then verifies the output GeoTIFF and raises loudly if anything looks wrong.

```python
#!/usr/bin/env python3
"""
first_return_dsm.py
Build a Digital Surface Model from first-return LiDAR points with PDAL,
then verify the output raster with rasterio.

Usage:
    python first_return_dsm.py input_tile.laz output_dsm.tif 0.4 32611

Requirements:
    pip install pdal rasterio
    PDAL 2.5+ (conda install -c conda-forge pdal python-pdal)
"""

import json
import sys

import pdal
import rasterio


def build_first_return_dsm(
    input_path: str,
    output_path: str,
    resolution: float,
    epsg: int,
    nodata: float = -9999.0,
) -> int:
    """
    Rasterize the first-return top surface of a LiDAR tile into a DSM GeoTIFF.

    Args:
        input_path:  source LAS/LAZ tile with multi-return data.
        output_path: destination GeoTIFF for the surface raster.
        resolution:  cell size in CRS units (metres).
        epsg:        projected EPSG code stamped into the raster.
        nodata:      sentinel written to cells with no first return.

    Returns:
        Number of points rasterized (first returns only).
    """
    pipeline_dict = {
        "pipeline": [
            {"type": "readers.las", "filename": input_path},
            # Keep only the leading pulse return — the visible top surface.
            {"type": "filters.range", "limits": "ReturnNumber[1:1]"},
            {
                "type": "writers.gdal",
                "filename": output_path,
                "gdaldriver": "GTiff",
                "output_type": "max",
                "resolution": resolution,
                "nodata": nodata,
                "override_srs": f"EPSG:{epsg}",
                "data_type": "float32",
            },
        ]
    }

    pipeline = pdal.Pipeline(json.dumps(pipeline_dict))
    count = pipeline.execute()

    if count == 0:
        raise RuntimeError(
            f"No first returns rasterized from '{input_path}'. "
            "Check that ReturnNumber is populated and non-zero."
        )
    return count


def verify_dsm(output_path: str, nodata: float = -9999.0) -> None:
    """Assert the DSM has a CRS, a plausible elevation range, and low voids."""
    with rasterio.open(output_path) as src:
        band = src.read(1, masked=True)
        void_fraction = float(band.mask.mean()) if band.mask.ndim else 0.0

        assert src.crs is not None, "Output has no CRS — check override_srs"
        assert band.min() > nodata, "nodata sentinel leaking into valid elevations"

        print(f"CRS:            {src.crs}")
        print(f"Grid:           {src.width} x {src.height} @ {src.res[0]} m")
        print(f"Elevation:      {band.min():.2f} to {band.max():.2f} m")
        print(f"Void fraction:  {void_fraction:.1%}")

        if void_fraction > 0.10:
            print(
                "WARNING: void fraction above 10% — resolution may be finer "
                "than the first-return spacing; try coarsening the grid."
            )


def main() -> None:
    if len(sys.argv) != 5:
        print("Usage: python first_return_dsm.py <in.laz> <out.tif> <resolution> <epsg>")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]
    resolution = float(sys.argv[3])
    epsg = int(sys.argv[4])

    print(f"Building DSM from first returns: {input_path} -> {output_path}")
    n = build_first_return_dsm(input_path, output_path, resolution, epsg)
    print(f"Rasterized {n:,} first-return points.")
    verify_dsm(output_path)


if __name__ == "__main__":
    main()
```

## Key Parameter Table

| Parameter | Stage | Type | Value here | Notes |
|---|---|---|---|---|
| `limits` | `filters.range` | string | `ReturnNumber[1:1]` | Keeps first returns only; the interval is inclusive on both ends |
| `output_type` | `writers.gdal` | string | `max` | Highest Z per cell — the top-surface definition of a DSM |
| `resolution` | `writers.gdal` | float | `0.4` | Cell size in metres; coarsen if voids climb above ~10% |
| `nodata` | `writers.gdal` | float | `-9999.0` | Empty-cell sentinel; keep outside the real elevation range |
| `override_srs` | `writers.gdal` | string | `EPSG:32611` | Stamps the CRS into the GeoTIFF |
| `data_type` | `writers.gdal` | string | `float32` | Preserves centimetre-level elevation precision |

## Verification

Beyond the assertions baked into the script, three checks confirm the surface is trustworthy.

**Confirm the point count dropped as expected.** On multi-return vegetated data, filtering to first returns typically retains 55–75% of points. If the count barely changed, the data is largely single-return; if it collapsed to a tiny fraction, `ReturnNumber` may be mis-encoded.

```python
import pdal, json

def count(path, first_only):
    stages = [{"type": "readers.las", "filename": path}]
    if first_only:
        stages.append({"type": "filters.range", "limits": "ReturnNumber[1:1]"})
    p = pdal.Pipeline(json.dumps({"pipeline": stages}))
    return p.execute()

raw = count("first_return_tile.laz", False)
first = count("first_return_tile.laz", True)
print(f"first returns: {first:,} / {raw:,}  ({first/raw:.0%})")
```

**Eyeball the elevation range.** `z_max` should equal the tallest feature in the scene. A DSM over a forested UTM tile might read 612 m of bare valley floor up to 648 m of canopy crown; a max that matches the ground minimum means first returns never reached anything tall.

**Render a quick hillshade.** Loading the DSM into a hillshade — see [Hillshade, Slope and Aspect](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/) — instantly reveals whether buildings and tree crowns cast crisp shadows (good) or the surface is mushy and full of holes (resolution too fine).

## Gotchas and Edge Cases

**1. `ReturnNumber` is zero-based or unpopulated.**
A handful of exporters write `ReturnNumber` starting at 0, or leave it at 0 entirely. The interval `[1:1]` then keeps nothing and the pipeline rasterizes zero points. Run `pdal info --stats` on `ReturnNumber` first; if the minimum is 0 and the maximum is 0, the field is empty — rasterize all points instead.

**2. Overlapping flight lines double-count first returns.**
Where two flight lines overlap, a cell may receive first returns from both passes. `max` still picks the highest, so the surface stays correct, but the point density in the overlap is inflated, which can mask a resolution that is otherwise too fine elsewhere. Judge void fraction from a non-overlap region.

**3. Birds, dust, and low noise become spikes.**
A first return off a bird sits well above the canopy and will win the `max` for its cell. If your hillshade shows isolated pinnacle spikes, insert an outlier removal stage before the range filter — the [statistical outlier filter](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/applying-statistical-outlier-filters-in-pdal/) handles exactly this.

**4. The CRS is geographic, not projected.**
If the tile is in `EPSG:4326`, `resolution: 0.4` means 0.4 *degrees* — tens of kilometres per cell. Reproject to a metre-based CRS first with [Spatial Reprojection](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/), or the raster will be a single meaningless pixel.

## Frequently Asked Questions

**Why filter to ReturnNumber==1 instead of using all points?**

First returns are the outermost surface the pulse struck — canopy top, roof edge, wire. Keeping only `ReturnNumber == 1` drops understory and last-return ground hits before rasterization, so the `max` statistic reflects the true visible skin of the scene rather than being pulled by stray high points from other pulses in the same cell. On clean data the difference is small, but it eliminates a whole class of spike artifacts for free.

**What if my LiDAR only has single returns?**

Single-return sensors record one point per pulse, so every point has `ReturnNumber` 1 and `NumberOfReturns` 1. The filter is then a no-op and the DSM is built from all points — which is correct, because there is no understory signal to exclude. The recipe still works unchanged.

**How do I choose the resolution for a first-return DSM?**

Filtering to first returns roughly halves the point count on vegetated scenes, so the effective spacing between surviving points is coarser than the raw density suggests. Start at the raw average spacing and coarsen one step if the void fraction exceeds about 10 percent. The parent [DSM Generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/) page tabulates the resolution-versus-void tradeoff.

**Can I keep last returns instead to approximate the ground?**

You can filter `ReturnNumber` against `NumberOfReturns` to keep last returns, but last returns are not the same as classified ground — they include understory and building interiors. For a true bare-earth surface use ground classification and [DTM Raster Generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/) rather than a last-return proxy.

---

## Related

- [DSM Generation from LiDAR with PDAL](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/) — parent guide covering the full surface-modelling workflow and derivations
- [DTM vs DSM: Which Surface Model to Generate](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/dtm-vs-dsm-which-surface-model/) — choosing between top-surface and bare-earth models
- [DTM Raster Generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/) — the bare-earth counterpart built from classified ground returns
- [Pipeline Filtering Logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) — the range and expression filter mechanics behind ReturnNumber selection
- [Point Density Metrics](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/) — measuring returns per square metre to set the grid resolution
