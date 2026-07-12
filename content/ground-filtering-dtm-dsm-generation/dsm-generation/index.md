---
title: "DSM Generation from LiDAR with PDAL"
description: "Building a Digital Surface Model from LiDAR first returns with PDAL writers.gdal output_type=max — filtering by ReturnNumber, choosing resolution, and producing a canopy-and-structure surface raster for volumetrics and viewsheds."
slug: "dsm-generation"
type: "cluster"
breadcrumb: "DSM Generation"
datePublished: "2024-06-26"
dateModified: "2026-07-12"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "DSM Generation from LiDAR with PDAL",
      "description": "Building a Digital Surface Model from LiDAR first returns with PDAL writers.gdal output_type=max — filtering by ReturnNumber, choosing resolution, and producing a canopy-and-structure surface raster for volumetrics and viewsheds.",
      "datePublished": "2024-06-26",
      "dateModified": "2026-07-12",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "Ground Filtering and DTM/DSM Generation with PDAL", "item": "https://pythonlidar.com/ground-filtering-dtm-dsm-generation/"},
        {"@type": "ListItem", "position": 3, "name": "DSM Generation", "item": "https://pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Generate a Digital Surface Model from LiDAR with PDAL",
      "step": [
        {"@type": "HowToStep", "name": "Read the point cloud", "text": "Declare readers.las pointing at the LAZ tile and confirm the embedded CRS."},
        {"@type": "HowToStep", "name": "Isolate the top surface", "text": "Keep first returns with filters.range on ReturnNumber, or rely on output_type=max over all returns."},
        {"@type": "HowToStep", "name": "Rasterize with writers.gdal", "text": "Set output_type to max, choose a resolution matched to point spacing, and set a nodata sentinel."},
        {"@type": "HowToStep", "name": "Validate the surface raster", "text": "Open the GeoTIFF with rasterio, check the elevation range, void fraction, and CRS tag."},
        {"@type": "HowToStep", "name": "Derive a normalized height model", "text": "Subtract the co-registered DTM from the DSM to produce an nDSM or canopy height model."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Do I need ground classification to build a DSM?",
          "acceptedAnswer": {"@type": "Answer", "text": "No. A DSM records the highest surface hit by the laser, so it never consults the Classification dimension. You either keep first returns with filters.range on ReturnNumber, or let writers.gdal pick the maximum Z per cell with output_type=max. Ground classification only matters when you also want the bare-earth DTM to subtract from the DSM."}
        },
        {
          "@type": "Question",
          "name": "Should I filter to ReturnNumber==1 or just use output_type=max?",
          "acceptedAnswer": {"@type": "Answer", "text": "output_type=max already selects the tallest point per cell, so on clean data the two approaches converge. Filtering to first returns first removes below-canopy multi-return points before rasterization, which produces a cleaner surface on dense vegetation and slightly lowers memory use. Combining both — first returns plus max — is the most defensive choice."}
        },
        {
          "@type": "Question",
          "name": "What resolution should a DSM raster use?",
          "acceptedAnswer": {"@type": "Answer", "text": "Match the cell size to the point spacing so that most cells receive at least one return. For airborne data around 8 points per square metre, a 0.5 m cell keeps voids low; for 20+ points per square metre from a drone, 0.25 m resolves rooftops and tree crowns crisply. Cells smaller than the point spacing produce a speckled raster full of nodata gaps."}
        },
        {
          "@type": "Question",
          "name": "How do I turn a DSM and DTM into a canopy height model?",
          "acceptedAnswer": {"@type": "Answer", "text": "Generate both rasters on an identical grid — same resolution, origin, and CRS — then subtract cell by cell: CHM = DSM - DTM. The result is height above ground, so tree crowns and building roofs appear as their true above-ground elevation and flat bare earth reads near zero. Alignment is the critical requirement; a half-cell offset introduces edge artifacts along every steep feature."}
        }
      ]
    }
  ]
}
</script>

# DSM Generation from LiDAR with PDAL

A Digital Surface Model captures the world as the laser first meets it — the tops of tree crowns, the ridge of every roof, the deck of a bridge, the crown of a transmission tower. Where a bare-earth terrain model strips vegetation and structures away, a DSM deliberately keeps them, encoding the elevation of the highest reflective surface in each grid cell. That single design choice — record the top, not the ground — drives every parameter decision on this page, from which returns you keep to how `writers.gdal` collapses points into pixels. This guide is part of [Ground Filtering and DTM/DSM Generation with PDAL](/ground-filtering-dtm-dsm-generation/), and it deliberately avoids the ground-classification machinery that the bare-earth workflow depends on.

The surface a DSM describes is what an observer standing at altitude would actually see, which is why it underpins viewshed analysis, line-of-sight modelling, solar and telecom planning, and volumetric estimates of stockpiles or forest canopy. Because the DSM needs no notion of "ground," it is often the fastest raster you can extract from a point cloud: read the tile, keep the first returns, and ask GDAL for the maximum Z per cell. The subtlety lives in resolution choice, void handling, and — when you pair it with a terrain model — grid alignment.

<svg viewBox="0 0 760 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Diagram showing multi-return LiDAR pulses over a tree and a building, with first returns forming the DSM top surface and ground returns forming the DTM" style="width:100%;max-width:760px;display:block;margin:1.5rem auto">
  <title>First returns form the DSM top surface; ground returns form the DTM</title>
  <desc>A cross-section shows laser pulses striking a tree canopy and a rooftop. The highest hit in each column defines the DSM surface drawn across the top. Lower ground hits define the DTM near the base. The vertical gap between the two surfaces is labelled as normalized height, or canopy height model.</desc>
  <defs>
    <marker id="dsm-arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- DSM top surface line -->
  <path d="M20,70 Q120,40 200,60 T360,55 L470,55 L470,120 L600,120 L600,55 L740,80" fill="none" stroke="currentColor" stroke-width="2" opacity="0.9"/>
  <text x="60" y="35" font-size="12" fill="currentColor" font-family="monospace">DSM = max Z (first returns)</text>
  <!-- ground / DTM line -->
  <path d="M20,235 Q200,225 380,232 T740,235" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="6 4" opacity="0.6"/>
  <text x="560" y="255" font-size="12" fill="currentColor" font-family="monospace" opacity="0.75">DTM = bare earth</text>
  <!-- tree trunk + canopy hits -->
  <line x1="200" y1="235" x2="200" y2="120" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <!-- building block -->
  <rect x="470" y="120" width="130" height="115" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.55"/>
  <text x="535" y="185" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.6">building</text>
  <!-- sensor flight line (pulse origin) -->
  <line x1="20" y1="12" x2="740" y2="12" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="20" y="9" font-size="10" fill="currentColor" opacity="0.6">sensor flight line — laser pulses</text>
  <!-- descending pulses (emanate from the flight line) -->
  <line x1="120" y1="12" x2="120" y2="52" stroke="currentColor" stroke-width="1" opacity="0.5" marker-end="url(#dsm-arr)"/>
  <line x1="300" y1="12" x2="300" y2="50" stroke="currentColor" stroke-width="1" opacity="0.5" marker-end="url(#dsm-arr)"/>
  <line x1="535" y1="12" x2="535" y2="112" stroke="currentColor" stroke-width="1" opacity="0.5" marker-end="url(#dsm-arr)"/>
  <line x1="680" y1="12" x2="680" y2="72" stroke="currentColor" stroke-width="1" opacity="0.5" marker-end="url(#dsm-arr)"/>
  <!-- nDSM gap bracket -->
  <line x1="300" y1="52" x2="300" y2="230" stroke="currentColor" stroke-width="1" opacity="0.35"/>
  <text x="312" y="150" font-size="11" fill="currentColor" opacity="0.7">nDSM = DSM − DTM</text>
  <text x="312" y="166" font-size="10" fill="currentColor" opacity="0.55">(canopy / structure height)</text>
</svg>

## Prerequisites

Before building a surface raster, confirm you have the following in place:

- **PDAL 2.5+** with Python bindings (`pip install pdal` or `conda install -c conda-forge pdal python-pdal`).
- **`rasterio` 1.3+** for opening and validating the output GeoTIFF, plus `numpy`.
- **A LAS/LAZ tile with populated `ReturnNumber` and `NumberOfReturns` dimensions.** Single-return sensors still produce a DSM, but multi-return data lets you separate canopy top from understory.
- **A known projected CRS in metres.** Surface models are area rasters; a geographic CRS in degrees makes resolution meaningless. This page uses `EPSG:6350` (NAD83(2011) / Conus Albers) for a regional example.
- **Point density awareness.** Knowing your average returns per square metre — see [Point Density Metrics](/point-cloud-data-standards-fundamentals/point-density-metrics/) — is the single best predictor of a sensible cell size.

If your input arrives in a different projection than the grid you want to publish, run a reprojection first; the [Spatial Reprojection](/pdal-pipeline-architecture-execution/spatial-reprojection/) guide covers folding `filters.reprojection` into the same pipeline so the raster lands in its final CRS in one pass.

## Core Workflow Architecture

DSM generation is a four-stage lifecycle. Unlike bare-earth extraction it has no classification step, which is what makes it both faster and conceptually simpler:

1. **Ingest.** `readers.las` streams the tile into a `PointView`. The only header field that matters here is the CRS; the elevation values in `Z` are taken as-is.
2. **Top-surface selection.** You keep the points that represent the visible surface. The cleanest approach filters to `ReturnNumber == 1` with `filters.range`, discarding intermediate and last returns that came back from below the canopy. This is a pure selection step and shares its mechanics with the broader [Pipeline Filtering Logic](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) used across PDAL.
3. **Rasterization.** `writers.gdal` bins the surviving points onto a regular grid. `output_type=max` writes the highest `Z` in each cell, which is exactly the top-surface definition of a DSM. Resolution and `nodata` are set here.
4. **Validation and derivation.** You open the GeoTIFF, confirm the elevation range and void fraction are plausible, and — if you also hold a bare-earth grid — subtract to produce a normalized surface.

The pivotal decision is how you define "top." Two levers exist and they are complementary. `filters.range` on `ReturnNumber` reduces the point set *before* rasterization; `output_type=max` picks the tallest survivor *during* rasterization. On pristine data either alone suffices, because the first return in a column is usually also the highest point. On messy data — high noise points, overlapping flight lines, birds — you want both: keep first returns to drop below-surface hits, then let `max` guard against the occasional low first return. Note that first returns are not guaranteed to be the geometric maximum in a cell when multiple pulses with slightly different geometry fall in the same pixel, which is precisely why layering `max` on top is the defensive default.

## Full Implementation

The module below builds a DSM from a LAZ tile end to end. It filters to first returns, rasterizes the maximum elevation per cell with `writers.gdal`, and reports the void fraction so you can judge whether the resolution was too aggressive. It is written with typed signatures, logging, and explicit error handling so it drops into a batch harness unchanged.

```python
import json
import logging
from pathlib import Path

import numpy as np
import pdal
import rasterio

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


def build_dsm(
    input_path: str,
    output_path: str,
    resolution: float = 0.5,
    crs: str = "EPSG:6350",
    nodata: float = -9999.0,
    first_returns_only: bool = True,
    window_size: int = 0,
) -> pdal.Pipeline:
    """
    Construct a PDAL pipeline that rasterizes a LiDAR tile into a DSM GeoTIFF.

    Parameters
    ----------
    input_path         : source LAZ / LAS tile
    output_path        : destination GeoTIFF path for the surface raster
    resolution         : output cell size in CRS units (metres) — match to point spacing
    crs                : projected CRS to assign to the raster (metre-based)
    nodata             : sentinel value written to cells with no returns
    first_returns_only : keep ReturnNumber == 1 before rasterizing the top surface
    window_size        : radius (in cells) for GDAL's void-filling pass; 0 disables it
    """
    stages: list = [
        {"type": "readers.las", "filename": str(input_path)},
    ]

    if first_returns_only:
        # Keep only the leading pulse return — the visible top surface.
        # This drops understory and last-return ground hits before binning.
        stages.append({"type": "filters.range", "limits": "ReturnNumber[1:1]"})

    stages.append(
        {
            "type": "writers.gdal",
            "filename": str(output_path),
            "gdaldriver": "GTiff",
            "output_type": "max",          # DSM = highest Z per cell
            "resolution": resolution,
            "nodata": nodata,
            "window_size": window_size,    # small radius interpolation over voids
            "override_srs": crs,
            "data_type": "float32",
        }
    )

    return pdal.Pipeline(json.dumps({"pipeline": stages}))


def run_and_report(pipeline: pdal.Pipeline, output_path: str) -> dict:
    """Validate, execute, and summarise the resulting DSM raster."""
    try:
        pipeline.validate()
    except RuntimeError as exc:
        logging.error("DSM pipeline failed validation: %s", exc)
        raise

    count = pipeline.execute()
    logging.info("Rasterized %d points into %s", count, output_path)

    with rasterio.open(output_path) as src:
        band = src.read(1, masked=True)
        void_fraction = float(band.mask.mean()) if band.mask.ndim else 0.0
        summary = {
            "width": src.width,
            "height": src.height,
            "resolution": src.res,
            "crs": str(src.crs),
            "z_min": float(band.min()),
            "z_max": float(band.max()),
            "void_fraction": void_fraction,
        }

    logging.info(
        "DSM %sx%s  z=[%.2f, %.2f]  voids=%.1f%%",
        summary["width"], summary["height"],
        summary["z_min"], summary["z_max"], summary["void_fraction"] * 100,
    )
    if summary["void_fraction"] > 0.15:
        logging.warning(
            "Void fraction %.1f%% is high — resolution may be finer than point spacing.",
            summary["void_fraction"] * 100,
        )
    return summary


if __name__ == "__main__":
    SRC = Path("canopy_tile.laz")
    DST = Path("canopy_dsm.tif")

    if not SRC.exists():
        raise FileNotFoundError(f"Input tile not found: {SRC}")

    pipe = build_dsm(str(SRC), str(DST), resolution=0.5, crs="EPSG:6350")
    stats = run_and_report(pipe, str(DST))
    print(json.dumps(stats, indent=2))
```

## Code Breakdown

### The range filter selects the visible surface

`{"type": "filters.range", "limits": "ReturnNumber[1:1]"}` retains only points whose `ReturnNumber` equals 1. In a multi-return pulse the first return is the first thing the beam struck on its way down — the outer canopy, the roof edge, the wire. Everything after it (returns 2, 3, and the last) came from progressively lower surfaces glimpsed through gaps. Dropping them here means the DSM is built purely from the outermost skin of the scene. This is a semantic inversion of bare-earth work, which keeps `Classification[2:2]`; here we never look at `Classification` at all.

### output_type=max is the DSM definition in one keyword

`writers.gdal` can emit several statistics per cell — `min`, `max`, `mean`, `idw`, `count`, `stdev`. A DSM is `max`: the highest `Z` among the points that landed in the cell. Because we already filtered to first returns, `max` is choosing the tallest first return, which is the correct top surface. If you skip the range filter, `output_type=max` over *all* returns still yields a valid DSM on most data, since the top of a column is normally a first return anyway — the two knobs reinforce each other.

### Resolution must respect point spacing

`resolution` is the cell size in CRS units. Set it too coarse and you smear detail; set it finer than the average point spacing and cells start missing every return, punching `nodata` holes into the raster. A tile at roughly 8 returns/m² supports a 0.5 m grid comfortably. The `run_and_report` helper surfaces the void fraction precisely so this mistake is caught immediately rather than discovered in a downstream viewshed.

### window_size fills small gaps

`window_size` tells `writers.gdal` to interpolate over empty cells using a moving window of the given radius (in cells). A value of `1` or `2` closes pinhole voids between points without inventing large flat patches. Leave it at `0` when you want to see the raw coverage — useful during the resolution-tuning phase — then raise it for the published product. Larger voids should be handled deliberately rather than papered over here.

### override_srs stamps the output CRS

`override_srs` writes the projection into the GeoTIFF so GIS tools read the raster correctly. Omit it and the `.tif` may carry no CRS at all, since `writers.gdal` does not always inherit the reader's spatial reference cleanly. Always set it to the metre-based CRS you rasterized in.

## Parameter Reference Table

| Stage | Parameter | Type | Typical value | Effect |
|-------|-----------|------|---------------|--------|
| `filters.range` | `limits` | string | `ReturnNumber[1:1]` | Keeps only first returns — the visible top surface |
| `writers.gdal` | `output_type` | string | `max` | Statistic per cell; `max` defines the DSM top surface |
| `writers.gdal` | `resolution` | float | 0.25–1.0 | Cell size in CRS units; match to point spacing |
| `writers.gdal` | `nodata` | float | `-9999.0` | Sentinel for empty cells; keep out of the real Z range |
| `writers.gdal` | `window_size` | int | 0–3 | Void-fill radius in cells; 0 shows raw coverage |
| `writers.gdal` | `gdaldriver` | string | `GTiff` | Output raster format |
| `writers.gdal` | `data_type` | string | `float32` | Pixel type; float32 preserves centimetre elevations |
| `writers.gdal` | `override_srs` | string | `EPSG:6350` | CRS stamped into the output raster |

## Validation and Integrity Checks

A DSM that looks fine at a glance can hide subtle failures — an inverted nodata sentinel bleeding into statistics, a resolution too fine for the data, or a CRS that never got written. Validate every raster before it enters a viewshed or volumetric calculation.

**Elevation range sanity.** The `z_max` should approach the tallest feature in the scene (canopy, tower, roof) and `z_min` should sit near the lowest ground the first returns reached. If `z_min` equals your nodata value, the sentinel is leaking into statistics — read the band masked, as the implementation does.

```python
import rasterio
import numpy as np

with rasterio.open("canopy_dsm.tif") as src:
    band = src.read(1, masked=True)
    print(f"CRS: {src.crs}")
    print(f"Cell size: {src.res}")
    print(f"Elevation range: {band.min():.2f} to {band.max():.2f} m")
    print(f"Void fraction: {band.mask.mean():.1%}")
    assert src.crs is not None, "Raster has no CRS — set override_srs on writers.gdal"
    assert band.min() > -9999.0, "nodata sentinel leaking into valid data"
```

**Void fraction.** More than 10–15% empty cells usually means the resolution is finer than the point spacing. Coarsen the grid or raise `window_size`. A void map — `band.mask` rendered as an image — quickly reveals whether gaps are scattered (density problem) or clustered (water bodies, occlusion shadows).

**Surface-above-terrain check.** If you hold a co-registered bare-earth grid, the DSM should be greater than or equal to the DTM almost everywhere; cells where DSM sits below DTM point to misalignment or noise. This same subtraction is the basis of the normalized height model described next.

## Performance Tuning

Rasterization cost scales with point count and inversely with cell size — a finer grid means more cells to accumulate into. Representative timings for a 120 M-point tile on a 12-core workstation with NVMe storage:

| Configuration | Resolution | First-return filter | Time (s) | Peak RAM (GB) |
|---------------|-----------|---------------------|----------|---------------|
| All returns → max | 1.0 m | no | 41 | 2.6 |
| First returns → max | 1.0 m | yes | 33 | 2.1 |
| First returns → max | 0.5 m | yes | 38 | 2.4 |
| First returns → max | 0.25 m | yes | 52 | 2.9 |

Practical guidance:

- **Filtering to first returns lowers both time and memory** because roughly a third of multi-return points never reach the writer. It is essentially free accuracy on vegetated scenes.
- **`writers.gdal` streams**, so peak RAM tracks the raster size, not the point count. Doubling resolution quadruples the cell grid and the memory it occupies.
- **Batch many tiles in parallel** rather than throwing many cores at one tile; DSM rasterization is not strongly multi-threaded. Tile-level parallelism, as covered in [Parallel Execution](/pdal-pipeline-architecture-execution/parallel-execution/), scales far better across a survey.

## Common Errors and Troubleshooting

**The raster is full of nodata speckle.**
Root cause: `resolution` is finer than the average point spacing, so many cells receive no first return. Fix: coarsen the grid to match density (see [Point Density Metrics](/point-cloud-data-standards-fundamentals/point-density-metrics/)), or set `window_size` to 1–2 to interpolate across pinholes.

**The DSM looks identical to the DTM.**
Root cause: the input tile is single-return, or `ReturnNumber` is unpopulated (all zeros), so first-return filtering keeps everything and `max` barely differs from ground. Fix: confirm `NumberOfReturns` varies across the file; if the sensor only records one return per pulse, the DSM legitimately equals the surface and there is no canopy signal to recover.

**`z_min` reads -9999 and statistics are nonsense.**
Root cause: the nodata sentinel is being read as a real value. Fix: open the band with `masked=True`, or set the nodata tag explicitly so GDAL masks it. Never let the sentinel fall inside the plausible elevation range.

**Output GeoTIFF has no projection.**
Root cause: `override_srs` was omitted and the writer did not inherit the reader CRS. Fix: pass `override_srs` with the metre-based EPSG code you rasterized in, and verify with `rasterio` that `src.crs` is populated.

**CHM has ringing artifacts along building edges.**
Root cause: the DSM and DTM grids are not perfectly aligned — different origin, resolution, or CRS. Fix: generate both on an identical grid definition, or resample one to the other before subtracting. Alignment is the whole game for normalized surfaces.

## Frequently Asked Questions

**Do I need ground classification to build a DSM?**

No. A DSM records the highest surface hit by the laser, so it never consults the `Classification` dimension. You either keep first returns with `filters.range` on `ReturnNumber`, or let `writers.gdal` pick the maximum `Z` per cell with `output_type=max`. Ground classification only matters when you also want the bare-earth [DTM Raster Generation](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/) surface to subtract from the DSM.

**Should I filter to ReturnNumber==1 or just use output_type=max?**

`output_type=max` already selects the tallest point per cell, so on clean data the two approaches converge. Filtering to first returns first removes below-canopy multi-return points before rasterization, which produces a cleaner surface on dense vegetation and slightly lowers memory use. Combining both — first returns plus `max` — is the most defensive choice, as [Building a DSM from First Returns](/ground-filtering-dtm-dsm-generation/dsm-generation/building-a-dsm-from-first-returns/) walks through in detail.

**What resolution should a DSM raster use?**

Match the cell size to the point spacing so that most cells receive at least one return. For airborne data around 8 points per square metre, a 0.5 m cell keeps voids low; for 20+ points per square metre from a drone, 0.25 m resolves rooftops and tree crowns crisply. Cells smaller than the point spacing produce a speckled raster full of nodata gaps.

**How do I turn a DSM and DTM into a canopy height model?**

Generate both rasters on an identical grid — same resolution, origin, and CRS — then subtract cell by cell: `CHM = DSM - DTM`. The result is height above ground, so tree crowns and building roofs appear as their true above-ground elevation and flat bare earth reads near zero. The [DTM vs DSM](/ground-filtering-dtm-dsm-generation/dsm-generation/dtm-vs-dsm-which-surface-model/) comparison shows the full derivation.

**Does the classification of returns affect a DSM at all?**

Not directly. Two returns classified as high vegetation and one as building both contribute their `Z` to the `max` statistic identically — the DSM cares about elevation, not label. Classification codes, catalogued in [ASPRS Classification Codes](/point-cloud-data-standards-fundamentals/asprs-classification-codes/), matter only if you deliberately exclude a class (for example, dropping noise) before rasterizing.

---

## Related

- [Ground Filtering and DTM/DSM Generation with PDAL](/ground-filtering-dtm-dsm-generation/) — parent overview of terrain and surface modelling from LiDAR
- [Building a DSM from First Returns](/ground-filtering-dtm-dsm-generation/dsm-generation/building-a-dsm-from-first-returns/) — a focused recipe filtering on ReturnNumber with rasterio verification
- [DTM vs DSM: Which Surface Model to Generate](/ground-filtering-dtm-dsm-generation/dsm-generation/dtm-vs-dsm-which-surface-model/) — when each surface is the right tool and how to derive a canopy height model
- [DTM Raster Generation](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/) — the bare-earth counterpart that pairs with the DSM for normalized heights
- [Point Density Metrics](/point-cloud-data-standards-fundamentals/point-density-metrics/) — measuring returns per square metre to choose a sensible resolution
- [Spatial Reprojection](/pdal-pipeline-architecture-execution/spatial-reprojection/) — folding a CRS transform into the pipeline so the raster lands in its final projection
