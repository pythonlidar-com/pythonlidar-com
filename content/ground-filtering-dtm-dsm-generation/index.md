---
title: "Ground Filtering and DTM/DSM Generation with PDAL"
description: "Complete guide to LiDAR ground classification and terrain modelling in PDAL: SMRF and PMF ground filters, bare-earth DTM and first-return DSM rasterization with writers.gdal, interpolation and void filling, and hillshade derivation."
slug: "ground-filtering-dtm-dsm-generation"
type: "pillar"
breadcrumb: "Ground Filtering & Terrain Models"
datePublished: "2024-06-15"
dateModified: "2026-07-12"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Ground Filtering and DTM/DSM Generation with PDAL",
      "description": "Complete guide to LiDAR ground classification and terrain modelling in PDAL: SMRF and PMF ground filters, bare-earth DTM and first-return DSM rasterization with writers.gdal, interpolation and void filling, and hillshade derivation.",
      "datePublished": "2024-06-15",
      "dateModified": "2026-07-12",
      "author": { "@type": "Organization", "name": "pythonlidar.com" },
      "publisher": { "@type": "Organization", "name": "pythonlidar.com" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://pythonlidar.com/" },
        { "@type": "ListItem", "position": 2, "name": "Ground Filtering & Terrain Models", "item": "https://pythonlidar.com/ground-filtering-dtm-dsm-generation/" }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Generate a Bare-Earth DTM from a Raw LiDAR Tile with PDAL",
      "step": [
        { "@type": "HowToStep", "name": "Remove noise before classifying", "text": "Run filters.outlier with statistical or radius method to strip low outliers and birds so they do not anchor the ground surface below true terrain." },
        { "@type": "HowToStep", "name": "Classify ground returns", "text": "Apply filters.smrf or filters.pmf so ground points receive ASPRS Classification code 2 while vegetation and structures keep their non-ground codes." },
        { "@type": "HowToStep", "name": "Mask to bare earth", "text": "Insert filters.range with the predicate Classification[2:2] to keep only ground points before rasterizing the terrain surface." },
        { "@type": "HowToStep", "name": "Rasterize with writers.gdal", "text": "Interpolate the ground points onto a regular grid with writers.gdal, choosing output_type, resolution, and radius appropriate to the point spacing and CRS units." },
        { "@type": "HowToStep", "name": "Derive hillshade and slope", "text": "Run gdaldem hillshade or gdaldem slope on the DTM GeoTIFF to produce shaded-relief and gradient products for interpretation and QA." }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the difference between a DTM and a DSM?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A DTM (Digital Terrain Model) represents the bare-earth surface built only from ground-classified returns, so buildings and vegetation are removed. A DSM (Digital Surface Model) represents the topmost reflective surface built from first returns, so it includes canopy, rooftops, and other above-ground features. Subtracting the DTM from the DSM yields a normalized height surface (nDSM or canopy height model)."
          }
        },
        {
          "@type": "Question",
          "name": "Why must ground be classified before rasterizing a DTM?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "writers.gdal rasterizes whatever points reach it. If you rasterize an unclassified cloud, vegetation and rooftop returns fall into the same cells as terrain and pull cell elevations upward, producing a lumpy surface rather than bare earth. Classifying ground with filters.smrf or filters.pmf and masking to Classification[2:2] with filters.range guarantees only terrain points contribute to the grid."
          }
        },
        {
          "@type": "Question",
          "name": "Should I use SMRF or PMF for ground classification?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "SMRF (Simple Morphological Filter) is the modern default and generally handles variable terrain and forested slopes better with fewer parameters. PMF (Progressive Morphological Filter) is the classic algorithm and remains useful for low-density rural scans and reproducing legacy results. Both write ASPRS code 2 to ground points; the choice affects how cleanly steep slopes and dense vegetation are separated."
          }
        },
        {
          "@type": "Question",
          "name": "How do I fill NoData holes in a PDAL-generated DTM?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Increase the writers.gdal radius so each cell samples enough neighbouring ground points to be populated, or raise window_size so the built-in gap-filling pass interpolates across empty cells. For persistent voids under buildings or water, run gdal_fillnodata.py as a post-process, or generate the raster at a coarser resolution where point spacing guarantees coverage."
          }
        },
        {
          "@type": "Question",
          "name": "Why is my DTM resolution producing an absurdly large raster?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The resolution value is expressed in the units of the pipeline CRS. If the cloud is still in a geographic CRS (degrees), a resolution of 1.0 means one degree per cell, or conversely a metric value like 1.0 spread over degrees produces billions of cells and out-of-memory failures. Reproject to a projected metric CRS such as a UTM zone before rasterizing so resolution and radius are in metres."
          }
        }
      ]
    }
  ]
}
</script>

Turning a raw LiDAR scan into a usable terrain product hinges on one decision the sensor never makes for you: which returns are the ground. Airborne and drone point clouds arrive as an undifferentiated cloud of X, Y, Z hits off canopy, rooftops, wires, water, and soil alike. Before you can build a bare-earth Digital Terrain Model (DTM) or a first-return Digital Surface Model (DSM), you have to separate terrain from everything above it, encode that decision in the point cloud, and then interpolate the selected points onto a regular grid. This guide walks the full PDAL path from a noisy tile to finished terrain rasters: ground classification with `filters.smrf` and `filters.pmf`, height-above-ground computation, rasterization with `writers.gdal`, void filling, and shaded-relief derivation with `gdaldem`. It is written for LiDAR analysts, surveying teams, and Python GIS developers who need repeatable, script-driven terrain products rather than one-off desktop clicks.

---

<svg viewBox="0 0 1140 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Workflow from raw LiDAR points through ground classification to DTM and DSM terrain rasters" style="width:100%;max-width:960px;display:block;margin:1.5rem auto">
  <title>Ground Filtering to DTM and DSM Workflow</title>
  <desc>A branching PDAL workflow: raw points pass through noise removal, then split into a ground path that classifies terrain, masks to Classification 2, rasterizes a DTM with writers.gdal, and derives a hillshade with gdaldem, and a surface path that selects first returns and rasterizes a DSM with writers.gdal.</desc>
  <defs>
    <marker id="arr-gnd" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- branch captions -->
  <text x="785" y="24" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.5" font-weight="600">Bare-earth terrain (DTM)</text>
  <text x="510" y="348" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.5" font-weight="600">Reflective surface (DSM)</text>
  <!-- b1 Raw -->
  <rect x="20" y="148" width="150" height="64" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="95" y="176" text-anchor="middle" font-size="12.5" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">Raw point cloud</text>
  <text x="95" y="195" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">readers.las</text>
  <!-- b1 -> b2 -->
  <line x1="170" y1="180" x2="208" y2="180" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-gnd)" opacity="0.6"/>
  <!-- b2 Noise -->
  <rect x="210" y="148" width="150" height="64" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="285" y="176" text-anchor="middle" font-size="12.5" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">Noise removal</text>
  <text x="285" y="195" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">filters.outlier</text>
  <!-- b2 -> b3 (up) -->
  <line x1="360" y1="170" x2="398" y2="104" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-gnd)" opacity="0.6"/>
  <!-- b2 -> b7 (down) -->
  <line x1="360" y1="190" x2="398" y2="256" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-gnd)" opacity="0.6"/>
  <!-- b3 Ground classify -->
  <rect x="400" y="40" width="150" height="64" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="475" y="68" text-anchor="middle" font-size="12.5" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">Ground classify</text>
  <text x="475" y="87" text-anchor="middle" font-size="10.5" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">filters.smrf / pmf</text>
  <!-- b3 -> b4 -->
  <line x1="550" y1="72" x2="588" y2="72" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-gnd)" opacity="0.6"/>
  <!-- b4 mask -->
  <rect x="590" y="40" width="150" height="64" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="665" y="68" text-anchor="middle" font-size="12.5" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">Bare-earth mask</text>
  <text x="665" y="87" text-anchor="middle" font-size="10.5" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">range Class[2:2]</text>
  <!-- b4 -> b5 -->
  <line x1="740" y1="72" x2="778" y2="72" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-gnd)" opacity="0.6"/>
  <!-- b5 DTM -->
  <rect x="780" y="40" width="150" height="64" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="855" y="68" text-anchor="middle" font-size="12.5" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">DTM GeoTIFF</text>
  <text x="855" y="87" text-anchor="middle" font-size="10.5" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">writers.gdal</text>
  <!-- b5 -> b6 -->
  <line x1="930" y1="72" x2="968" y2="72" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-gnd)" opacity="0.6"/>
  <!-- b6 hillshade -->
  <rect x="970" y="40" width="150" height="64" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="1045" y="68" text-anchor="middle" font-size="12.5" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">Hillshade</text>
  <text x="1045" y="87" text-anchor="middle" font-size="10.5" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">gdaldem</text>
  <!-- b7 first returns -->
  <rect x="400" y="256" width="150" height="64" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="475" y="284" text-anchor="middle" font-size="12.5" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">First returns</text>
  <text x="475" y="303" text-anchor="middle" font-size="10.5" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">range Return[1:1]</text>
  <!-- b7 -> b8 -->
  <line x1="550" y1="288" x2="588" y2="288" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-gnd)" opacity="0.6"/>
  <!-- b8 DSM -->
  <rect x="590" y="256" width="150" height="64" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="665" y="284" text-anchor="middle" font-size="12.5" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">DSM GeoTIFF</text>
  <text x="665" y="303" text-anchor="middle" font-size="10.5" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">writers.gdal</text>
</svg>

## Where Ground Filtering Fits in PDAL

Ground filtering is not a special mode in PDAL — it is an ordinary filter stage in the same streaming directed acyclic graph described in [PDAL Pipeline Architecture & Execution](/pdal-pipeline-architecture-execution/). A ground filter reads the point buffer, evaluates each return against a terrain model it builds internally, and writes a value into the `Classification` dimension. Nothing is deleted. The cloud that leaves `filters.smrf` has exactly the same point count that entered; what changed is that ground returns now carry the ASPRS code for terrain and everything else keeps its prior code.

That distinction matters for how you build the rest of the pipeline. Because classification only *labels* points, you separate the DTM and DSM paths downstream with [Pipeline Filtering Logic](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) rather than by running two different classifiers. One `filters.range` predicate selects ground for the terrain model; another selects first returns for the surface model. Both draw from the same classified buffer.

### The Classification dimension

`Classification` is a standard LAS dimension defined by the ASPRS point classification scheme. The code that matters most for terrain work is **2 = Ground**. Other frequently encountered codes are 1 (Unclassified), 3–5 (low/medium/high vegetation), 6 (Building), 7 (Low point / noise), and 9 (Water). A full treatment of the numbering and its edge cases lives in [ASPRS Classification Codes](/point-cloud-data-standards-fundamentals/asprs-classification-codes/); for this workflow the essential fact is that ground filters write code 2 and leave the choice of what to do with the rest to you.

### Height above ground

Once ground is classified, PDAL can compute each point's height above the terrain surface without you ever building a raster. `filters.hag_nn` assigns a `HeightAboveGround` dimension by taking, for every point, the elevation difference to its nearest ground neighbours; `filters.hag_delaunay` does the same using a Delaunay triangulation of the ground points for a smoother interpolated reference surface. This normalized height is what powers canopy height models, above-ground filtering (`HeightAboveGround > 2.0` to isolate vegetation and structures), and building extraction — all computed in point space before any rasterization step.

## Core Components

The terrain workflow is assembled from a small, stable set of PDAL stages plus the GDAL `gdaldem` utility for relief derivatives. Each has a focused role.

| Stage | Role | Key parameters |
|---|---|---|
| `filters.outlier` | Strip low noise and high birds before classification | `method` (statistical/radius), `mean_k`, `multiplier` |
| `filters.smrf` | Simple Morphological Filter ground classification | `slope`, `window`, `threshold`, `scalar`, `cell` |
| `filters.pmf` | Progressive Morphological Filter ground classification | `max_window_size`, `slope`, `initial_distance`, `cell_size` |
| `filters.range` | Predicate mask (select ground, or first returns) | `limits` (e.g. `Classification[2:2]`, `ReturnNumber[1:1]`) |
| `filters.hag_nn` | Compute HeightAboveGround from nearest ground points | `count`, `allow_extrapolation` |
| `writers.gdal` | Rasterize points onto a regular grid | `output_type`, `resolution`, `radius`, `window_size`, `gdaldriver`, `nodata` |
| `gdaldem` | Derive hillshade, slope, aspect from a DEM raster | `hillshade`/`slope`/`aspect`, `-z`, `-az`, `-alt` |

### writers.gdal output_type and interpolation

`writers.gdal` builds a raster by binning points into cells and reducing the values that fall within a search `radius` of each cell centre. The `output_type` parameter chooses the reducer, and you can request several in one pass:

- `idw` — inverse-distance-weighted mean; the smoothest, best general-purpose choice for a DTM.
- `mean` — arithmetic mean of points in range; simple and stable.
- `min` — lowest elevation in range; useful for a conservative bare-earth surface that resists residual vegetation.
- `max` — highest elevation in range; the natural choice for a first-return DSM that should capture canopy tops and roof ridges.
- `count` — number of points per cell; a diagnostic layer for coverage and density.

`resolution` sets the cell size **in CRS units**, `radius` sets the search distance around each cell centre (default is `resolution` × √2 if omitted), and `window_size` enables a focal gap-filling pass that interpolates empty cells from populated neighbours within that many cells. `nodata` sets the fill value for cells with no data, and `gdaldriver` selects the output format (`GTiff` for GeoTIFF).

## Annotated Reference Pipeline

The pipeline below is the canonical bare-earth DTM recipe: read a compressed tile, remove statistical noise, classify ground with SMRF, keep only ground returns, and rasterize a 1.0 m GeoTIFF with inverse-distance weighting. The tile is in EPSG:6347 (NAD83(2011) / UTM zone 17N), a projected metric CRS, so `resolution` and `radius` are safely expressed in metres.

```json
{
  "pipeline": [
    {
      "type": "readers.las",
      "filename": "tile_0457_ground.laz",
      "spatialreference": "EPSG:6347"
    },
    {
      "type": "filters.outlier",
      "method": "statistical",
      "mean_k": 12,
      "multiplier": 2.5
    },
    {
      "type": "filters.smrf",
      "slope": 0.15,
      "window": 18.0,
      "threshold": 0.45,
      "scalar": 1.2,
      "cell": 1.0
    },
    {
      "type": "filters.range",
      "limits": "Classification[2:2]"
    },
    {
      "type": "writers.gdal",
      "filename": "dtm_0457_1m.tif",
      "gdaldriver": "GTiff",
      "output_type": "idw",
      "resolution": 1.0,
      "radius": 1.5,
      "window_size": 4,
      "nodata": -9999
    }
  ]
}
```

Two ordering decisions are load-bearing. `filters.outlier` runs *before* `filters.smrf` because a single low noise point — a multipath return beneath the surface — can anchor SMRF's morphological surface below true ground and carve a pit into the DTM. And `filters.range` runs *after* classification but *before* the writer, so only the code-2 points are handed to `writers.gdal`; the `window_size: 4` gap-filling pass then interpolates the small voids left where buildings and dense canopy blocked the ground.

For the parallel DSM, the same cleaned cloud is masked to first returns and reduced with `max` instead of `idw`:

```json
{
  "type": "filters.range",
  "limits": "ReturnNumber[1:1]"
},
{
  "type": "writers.gdal",
  "filename": "dsm_0457_1m.tif",
  "gdaldriver": "GTiff",
  "output_type": "max",
  "resolution": 1.0,
  "radius": 1.0,
  "nodata": -9999
}
```

## Python Integration

Driving the DTM pipeline from Python lets you parameterise paths and CRS, execute against the C++ engine, and — critically — assert that a raster was actually produced. The `pdal` package returns per-stage metadata after execution, which you can inspect to confirm ground points survived the mask before the writer ran.

```python
import json
import logging
import os
import pdal

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


def build_dtm(
    input_path: str,
    output_tif: str,
    srs: str = "EPSG:6347",
    resolution: float = 1.0,
) -> dict:
    """
    Classify ground with SMRF, mask to Classification 2, and rasterize a
    bare-earth DTM GeoTIFF. Returns the pipeline metadata dict.
    """
    pipeline_def = {
        "pipeline": [
            {"type": "readers.las", "filename": input_path, "spatialreference": srs},
            {"type": "filters.outlier", "method": "statistical",
             "mean_k": 12, "multiplier": 2.5},
            {"type": "filters.smrf", "slope": 0.15, "window": 18.0,
             "threshold": 0.45, "scalar": 1.2, "cell": 1.0},
            {"type": "filters.range", "limits": "Classification[2:2]"},
            {"type": "writers.gdal", "filename": output_tif, "gdaldriver": "GTiff",
             "output_type": "idw", "resolution": resolution,
             "radius": resolution * 1.5, "window_size": 4, "nodata": -9999},
        ]
    }

    pipeline = pdal.Pipeline(json.dumps(pipeline_def))
    pipeline.loglevel = 3  # INFO output from the C++ engine

    try:
        ground_count = pipeline.execute()
    except RuntimeError as exc:
        logging.error("DTM pipeline failed: %s", exc)
        raise

    if ground_count == 0:
        raise ValueError(
            "No ground points survived classification — check SMRF slope/window "
            "and that filters.outlier did not strip the terrain."
        )

    if not os.path.exists(output_tif):
        raise FileNotFoundError(f"writers.gdal reported success but {output_tif} is missing")

    meta = pipeline.metadata
    logging.info("DTM written: %s (%d ground points rasterized)", output_tif, ground_count)
    return meta


if __name__ == "__main__":
    build_dtm("tile_0457_ground.laz", "dtm_0457_1m.tif")
```

The return value of `pipeline.execute()` is the count of points reaching the writer — here, the number of ground points after the `Classification[2:2]` mask. A count of zero is the single most useful early-warning signal that classification or noise removal went wrong, which is why the function raises on it rather than silently writing an all-NoData raster.

## Schema and Data-Flow Considerations

### Classification must precede rasterization

`writers.gdal` has no concept of ground; it rasterizes whatever buffer arrives. The entire correctness of a DTM therefore rests on the ordering `classify → mask → rasterize`. If you rasterize before classifying, canopy and rooftop returns land in terrain cells and inflate elevations. If you classify but forget the `filters.range` mask, every point still reaches the writer and the "DTM" is really a `min`-reduced surface model at best. Chaining these stages correctly is the same discipline covered in [PDAL Stage Chaining](/pdal-pipeline-architecture-execution/pdal-stage-chaining/): each stage must receive exactly the buffer the next one expects.

### Classification propagation

Because `filters.range` drops non-matching points rather than editing them, the DTM and DSM branches must each start from the cleaned, classified cloud — not from the output of the other branch. In a single-file pipeline that means splitting after `filters.smrf`; in a scripted workflow it is cleaner to run classification once, write a classified intermediate LAZ, then run two independent rasterization pipelines against it. The intermediate carries the `Classification` codes forward so both branches see consistent ground labelling.

### CRS units drive resolution and radius

Every distance parameter in this workflow — `resolution`, `radius`, SMRF's `window`, PMF's `max_window_size` — is interpreted in the units of the current pipeline CRS. In a projected UTM zone those are metres and a `resolution` of 1.0 means a one-metre cell. In a geographic CRS those are degrees, and a `resolution` of 1.0 spans an entire degree of latitude while a metric value like 0.5 over degrees demands billions of cells. Always reproject to a projected metric system first; see [Spatial Reprojection](/pdal-pipeline-architecture-execution/spatial-reprojection/) for datum and vertical-component handling. Insert `filters.reprojection` before `filters.smrf` so the morphological window is in metres, not degrees.

## Performance and Scaling

Rasterization cost scales with output cell count, and cell count scales with the inverse square of resolution — halving the cell size quadruples both the raster and the peak RAM `writers.gdal` holds while accumulating cells. Ground classification cost scales with point count and window size. The table summarises the main trade-offs for a typical 1 km² tile at roughly 8 points/m².

| Lever | Setting | Effect | Guidance |
|---|---|---|---|
| `resolution` | 1.0 m | ~1M cells, modest RAM | Default for airborne 8–15 pts/m² |
| `resolution` | 0.25 m | ~16M cells, 16× RAM | Only where density truly supports it; watch OOM |
| `resolution` | 2.0 m | ~250K cells, low RAM | Regional/statewide products, faster tiling |
| `window_size` | 0 | No gap filling | Fastest; leaves NoData voids |
| `window_size` | 4–6 | Focal interpolation of small gaps | Fills building/canopy shadows; adds a pass over cells |
| `radius` | ~1.5 × resolution | Wider point search per cell | Larger radius fills gaps but oversmooths terrain edges |
| Tiling | 1 process / tile | Near-linear multi-core scaling | Buffer tiles by the radius to avoid edge seams |

Ground filters `filters.smrf` and `filters.pmf` use OpenMP internally, so set `OMP_NUM_THREADS` to your physical core count for the classification stage. For area-wide production, the dominant pattern is file-level parallelism: tile the campaign, run one pipeline process per tile with a `ProcessPoolExecutor`, and add an overlap buffer equal to the search radius so DTM cells at tile edges have neighbours on both sides. Merging the tiles afterwards with `gdalbuildvrt` or `gdal_merge.py` produces a seamless mosaic.

## Production Deployment

### Classify once, rasterize many

In a pipeline you rerun as parameters evolve, separate the expensive, stable step from the cheap, iterated one. Classification is deterministic and slow; rasterization is fast and you will re-run it while tuning resolution or interpolation. Write a classified intermediate LAZ once, then generate DTM, DSM, and height-above-ground products from it without re-classifying. This also gives QA a single classified artifact to audit.

### Version the pipeline JSON

Keep the classification and rasterization pipelines as checked-in JSON, parameterised at runtime for filename, CRS, and resolution. Validate before large runs:

```bash
pdal pipeline --validate dtm_pipeline.json
```

### Derive relief products with gdaldem

Once the DTM GeoTIFF exists, shaded relief, slope, and aspect are one command each against GDAL:

```bash
gdaldem hillshade dtm_0457_1m.tif hs_0457.tif -z 1.5 -az 315 -alt 45
gdaldem slope     dtm_0457_1m.tif slope_0457.tif -p
gdaldem aspect    dtm_0457_1m.tif aspect_0457.tif
```

The `-z` vertical exaggeration, `-az` illumination azimuth, and `-alt` sun altitude control the hillshade's readability; slope with `-p` reports degrees as a percentage grade.

### Failure modes and debugging

**Empty or all-ground output.** If `pipeline.execute()` returns zero, the `Classification[2:2]` mask found no ground — usually SMRF `slope` set too aggressively, or `filters.outlier` stripping the terrain as noise. If nearly every point classifies as ground on hilly terrain, `slope` is too permissive; raise it and reduce `window`.

**Checkerboard NoData gaps.** A DTM speckled with `-9999` cells means the search `radius` is smaller than the ground-point spacing after masking. Increase `radius`, enable `window_size` gap filling, or coarsen `resolution`. For stubborn voids under buildings, post-process with `gdal_fillnodata.py`.

**Absurd resolution / runaway cell count.** A pipeline that hangs or dies allocating memory at the writer, with a bounding box spanning fractions of a unit, is running in a geographic CRS. Reproject to UTM before rasterizing so `resolution` is in metres.

**Out-of-memory on high-res rasters.** `writers.gdal` accumulates the full grid in memory. A 0.25 m raster over a large tile can exhaust RAM. Split into smaller tiles, coarsen the resolution, or raise container memory limits; the [Memory Management](/pdal-pipeline-architecture-execution/memory-management/) guide covers container-specific tuning that applies equally here.

---

## Frequently Asked Questions

**What is the difference between a DTM and a DSM?**

A DTM (Digital Terrain Model) represents the bare-earth surface built only from ground-classified returns, so buildings and vegetation are removed. A DSM (Digital Surface Model) represents the topmost reflective surface built from first returns, so it includes canopy, rooftops, and other above-ground features. Subtracting the DTM from the DSM yields a normalized height surface (nDSM or canopy height model).

**Why must ground be classified before rasterizing a DTM?**

`writers.gdal` rasterizes whatever points reach it. If you rasterize an unclassified cloud, vegetation and rooftop returns fall into the same cells as terrain and pull cell elevations upward, producing a lumpy surface rather than bare earth. Classifying ground with `filters.smrf` or `filters.pmf` and masking to `Classification[2:2]` with `filters.range` guarantees only terrain points contribute to the grid.

**Should I use SMRF or PMF for ground classification?**

SMRF (Simple Morphological Filter) is the modern default and generally handles variable terrain and forested slopes better with fewer parameters. PMF (Progressive Morphological Filter) is the classic algorithm and remains useful for low-density rural scans and reproducing legacy results. Both write ASPRS code 2 to ground points; the choice affects how cleanly steep slopes and dense vegetation are separated.

**How do I fill NoData holes in a PDAL-generated DTM?**

Increase the `writers.gdal` radius so each cell samples enough neighbouring ground points to be populated, or raise `window_size` so the built-in gap-filling pass interpolates across empty cells. For persistent voids under buildings or water, run `gdal_fillnodata.py` as a post-process, or generate the raster at a coarser resolution where point spacing guarantees coverage.

**Why is my DTM resolution producing an absurdly large raster?**

The `resolution` value is expressed in the units of the pipeline CRS. If the cloud is still in a geographic CRS (degrees), a resolution of 1.0 means one degree per cell, or conversely a metric value like 1.0 spread over degrees produces billions of cells and out-of-memory failures. Reproject to a projected metric CRS such as a UTM zone before rasterizing so `resolution` and `radius` are in metres.

---

## Related

- [SMRF Ground Classification](/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) — tuning the Simple Morphological Filter across forested and urban terrain
- [PMF Ground Classification](/ground-filtering-dtm-dsm-generation/pmf-ground-classification/) — the Progressive Morphological Filter and its window and slope parameters
- [DTM Raster Generation](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/) — building bare-earth GeoTIFFs, interpolation choices, and void filling with writers.gdal
- [DSM Generation](/ground-filtering-dtm-dsm-generation/dsm-generation/) — first-return surface models and choosing between DTM and DSM
- [Hillshade, Slope and Aspect](/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/) — deriving shaded relief and terrain gradients from a LiDAR DTM
