---
title: "DTM Raster Generation with PDAL"
description: "Turning classified ground returns into a bare-earth Digital Terrain Model GeoTIFF with PDAL writers.gdal — resolution, output_type (idw/mean/min), search radius, window_size gap-filling, NoData, and CRS-aware rasterization."
slug: "dtm-raster-generation"
type: "topic"
breadcrumb: "DTM Raster Generation"
datePublished: "2024-06-24"
dateModified: "2026-07-12"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "DTM Raster Generation with PDAL",
      "description": "Turning classified ground returns into a bare-earth Digital Terrain Model GeoTIFF with PDAL writers.gdal — resolution, output_type (idw/mean/min), search radius, window_size gap-filling, NoData, and CRS-aware rasterization.",
      "datePublished": "2024-06-24",
      "dateModified": "2026-07-12",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "Ground Filtering & Terrain Models", "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/"},
        {"@type": "ListItem", "position": 3, "name": "DTM Raster Generation", "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Generate a bare-earth DTM GeoTIFF from classified ground returns with PDAL",
      "step": [
        {"@type": "HowToStep", "name": "Keep only ground points", "text": "Insert filters.range with limits Classification[2:2] so that only ASPRS ground returns reach the rasterizer."},
        {"@type": "HowToStep", "name": "Choose resolution and interpolation", "text": "Set resolution to the target cell size and output_type to idw, mean, or min depending on the surface you need."},
        {"@type": "HowToStep", "name": "Configure the GDAL driver", "text": "Set gdaldriver to GTiff and gdalopts to COMPRESS=DEFLATE,TILED=YES for a compact, tiled output."},
        {"@type": "HowToStep", "name": "Fill small gaps", "text": "Set window_size to a small integer so writers.gdal fills isolated empty cells from their populated neighbours."},
        {"@type": "HowToStep", "name": "Validate the raster", "text": "Open the GeoTIFF with rasterio, confirm the shape, CRS, and NoData fraction, then inspect the elevation histogram."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What does output_type control in writers.gdal?",
          "acceptedAnswer": {"@type": "Answer", "text": "output_type selects the statistic each raster cell reports from the ground points that fall inside its search radius. idw computes an inverse-distance-weighted mean and is the standard choice for a smooth bare-earth DTM; mean is an unweighted average; min returns the lowest Z, which suppresses residual low vegetation but is sensitive to negative noise; max, count, and stdev are diagnostic bands. Passing output_type:all writes every statistic as a separate band."}
        },
        {
          "@type": "Question",
          "name": "How are resolution and radius related in a PDAL DTM?",
          "acceptedAnswer": {"@type": "Answer", "text": "resolution sets the cell size in ground units and radius sets how far around each cell centre PDAL looks for contributing points. If radius is left unset PDAL defaults it to resolution multiplied by the square root of two, which just covers the cell's diagonal. Raising radius above that fills more cells at the cost of smoothing and cross-feature bleed; lowering it leaves more NoData holes in sparse areas."}
        },
        {
          "@type": "Question",
          "name": "Does writers.gdal need the point cloud to already be in a projected CRS?",
          "acceptedAnswer": {"@type": "Answer", "text": "It should be. writers.gdal rasterizes in whatever horizontal units the incoming points carry, so a geographic CRS in degrees produces a cell size of, for example, one degree rather than one metre. Reproject to a metric projected CRS with filters.reprojection before rasterizing, and the GeoTIFF inherits that CRS in its header automatically."}
        },
        {
          "@type": "Question",
          "name": "Why is my DTM full of NoData cells?",
          "acceptedAnswer": {"@type": "Answer", "text": "Empty cells appear where no ground point fell within the search radius. Common causes are a resolution finer than the ground-return spacing, an overly tight radius, or aggressive ground filtering that removed too many points. Coarsen the resolution, widen radius, raise window_size to interpolate across small voids, or post-process with a dedicated void-fill pass."}
        }
      ]
    }
  ]
}
</script>

A Digital Terrain Model is the deliverable most LiDAR projects are ultimately commissioned to produce: a continuous bare-earth elevation surface with vegetation, buildings, and vehicles stripped away. Once ground returns have been isolated by an algorithm such as SMRF or PMF, the remaining task is rasterization — collapsing an irregular scatter of classified ground points into a regular grid of elevation values written to a GeoTIFF. PDAL performs this final step with `writers.gdal`, a rasterizing sink that bins points into cells, interpolates a value per cell, and hands the array to GDAL for encoding. This guide is part of [Ground Filtering and DTM/DSM Generation with PDAL](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/), and it focuses on the parameters that decide whether the resulting terrain model is survey-usable or riddled with holes and artefacts.

<svg viewBox="-14 44 784 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="DTM raster generation flow from classified ground points through filters.range to writers.gdal cell binning and GeoTIFF output" style="width:100%;max-width:760px;display:block;margin:1.5rem auto">
  <title>DTM Raster Generation Data Flow</title>
  <desc>A left-to-right diagram: a classified point cloud enters filters.range which keeps only Classification 2 ground points, those points flow into writers.gdal where they are binned into a regular grid and each cell is filled by an interpolator using a search radius, and the grid is encoded as a compressed tiled GeoTIFF with a NoData value and CRS.</desc>
  <rect x="-14" y="44" width="784" height="195" fill="var(--dg-bg)" rx="10"/>
  <defs>
    <marker id="dtm-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <rect x="8" y="86" width="150" height="66" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="83" y="112" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">readers.las</text>
  <text x="83" y="130" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">classified cloud</text>
  <rect x="186" y="86" width="158" height="66" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="265" y="108" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">filters.range</text>
  <text x="265" y="126" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">Classification[2:2]</text>
  <text x="265" y="141" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">ground only</text>
  <rect x="372" y="66" width="180" height="106" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="462" y="90" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">writers.gdal</text>
  <text x="462" y="110" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">bin points to grid</text>
  <text x="462" y="126" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">idw / mean / min</text>
  <text x="462" y="142" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">radius + window_size</text>
  <text x="462" y="158" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">nodata = -9999</text>
  <rect x="580" y="86" width="168" height="66" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="664" y="108" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">GTiff</text>
  <text x="664" y="126" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">DEFLATE + TILED</text>
  <text x="664" y="141" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">CRS in header</text>
  <line x1="158" y1="119" x2="182" y2="119" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#dtm-arr)"/>
  <line x1="344" y1="119" x2="368" y2="119" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#dtm-arr)"/>
  <line x1="552" y1="119" x2="576" y2="119" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#dtm-arr)"/>
  <text x="380" y="214" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.5">one contiguous streaming pass — no full in-memory point array required</text>
</svg>

## Prerequisites

Confirm the following before rasterizing a terrain model:

- **PDAL 2.5 or later** with Python bindings (`pip install pdal`) and a working GDAL 3.x underneath.
- **A ground-classified point cloud** — Classification code 2 already assigned by [SMRF Ground Classification](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) or an equivalent filter. Rasterizing an unclassified cloud produces a first-surface DSM, not a DTM.
- **A projected, metric CRS.** DTM cell sizes only make sense in metres or feet; a cloud still in `EPSG:4326` degrees must be reprojected first. See [Spatial Reprojection](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/).
- **`rasterio` installed** for validation (`pip install rasterio`), plus `numpy`.
- **Knowledge of your ground-point spacing** — the average distance between ground returns sets the finest resolution you can rasterize without holes. The [Point Density Metrics](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/) guide covers how to measure it.

## Core Workflow Architecture

Producing a DTM with PDAL is a five-phase lifecycle. Each phase maps onto one or two pipeline stages, and the whole sequence executes in a single streaming pass.

1. **Ingest and confirm CRS** — a `readers.las` stage loads the classified tile. If the horizontal CRS is geographic or missing, prepend a `filters.reprojection` stage targeting a projected code such as `EPSG:6339` (NAD83(2011) / UTM zone 12N).
2. **Select ground returns** — a `filters.range` stage with `limits: "Classification[2:2]"` discards every non-ground point. This is the single most important step: skip it and every rooftop and tree crown contaminates the surface. The mechanics of this stage are covered in [Pipeline Filtering Logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/).
3. **Rasterize** — `writers.gdal` bins the surviving points into a grid defined by `resolution`, interpolates a value per cell using `output_type`, and searches within `radius` for contributing points.
4. **Interpolate small gaps** — `window_size` triggers an in-writer moving-window fill that closes isolated NoData cells from their populated neighbours before the array is encoded.
5. **Encode and tag** — `gdaldriver: "GTiff"` with `gdalopts` sets compression and tiling, `nodata` marks empty cells, and the CRS carried by the points is written into the GeoTIFF header automatically.

Stage order is not negotiable. `filters.range` must precede `writers.gdal`, and any reprojection must precede the range filter so that the classification codes are evaluated on the same points that get rasterized. This is the same buffer-passing discipline described in [PDAL Stage Chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/).

## Full Implementation

The module below ingests a classified LAZ tile, keeps ground returns, and writes a 1 m inverse-distance-weighted DTM as a compressed, tiled GeoTIFF. It carries typed signatures, logging, and defensive error handling so it can drop into a batch harness unchanged.

```python
import json
import logging
import pdal
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


def build_dtm_pipeline(
    input_path: str,
    output_tif: str,
    resolution: float = 1.0,
    output_type: str = "idw",
    radius: float | None = None,
    window_size: int = 3,
    nodata: float = -9999.0,
    ground_class: int = 2,
) -> pdal.Pipeline:
    """
    Build a PDAL pipeline that rasterizes ground-classified points into a DTM GeoTIFF.

    Parameters
    ----------
    input_path  : path to a classified LAS/LAZ tile (Classification 2 = ground)
    output_tif  : destination GeoTIFF path
    resolution  : output cell size in ground units (metres for a UTM CRS)
    output_type : cell interpolator — "idw", "mean", "min", "max", "count", "stdev", "all"
    radius      : point search radius; None lets PDAL use resolution * sqrt(2)
    window_size : moving-window radius (in cells) used to fill isolated NoData holes
    nodata      : value written to empty cells
    ground_class : ASPRS classification code to retain (2 = ground)
    """
    gdal_stage: dict = {
        "type": "writers.gdal",
        "filename": str(output_tif),
        "resolution": resolution,
        "output_type": output_type,
        "window_size": window_size,
        "nodata": nodata,
        "gdaldriver": "GTiff",
        "gdalopts": "COMPRESS=DEFLATE,TILED=YES,BLOCKXSIZE=256,BLOCKYSIZE=256,ZLEVEL=6",
        "data_type": "float32",
    }
    if radius is not None:
        gdal_stage["radius"] = radius

    pipeline_def = [
        {"type": "readers.las", "filename": str(input_path)},
        {"type": "filters.range", "limits": f"Classification[{ground_class}:{ground_class}]"},
        gdal_stage,
    ]
    return pdal.Pipeline(json.dumps({"pipeline": pipeline_def}))


def run_dtm(pipeline: pdal.Pipeline) -> int:
    """Validate, execute, and return the number of ground points rasterized."""
    try:
        pipeline.validate()
    except RuntimeError as exc:
        logging.error("DTM pipeline failed validation: %s", exc)
        raise

    count = pipeline.execute()
    if count == 0:
        raise RuntimeError(
            "Zero ground points reached writers.gdal. Check that the input is "
            "classified and that Classification 2 exists in the tile."
        )
    logging.info("Rasterized %d ground points into the DTM.", count)
    return count


if __name__ == "__main__":
    INPUT = Path("ground_classified_utm12n.laz")
    OUTPUT = Path("dtm_1m_idw.tif")

    if not INPUT.exists():
        raise FileNotFoundError(f"Input tile not found: {INPUT}")

    pipe = build_dtm_pipeline(str(INPUT), str(OUTPUT), resolution=1.0, output_type="idw")
    run_dtm(pipe)
    logging.info("DTM written to %s", OUTPUT)
```

The equivalent declarative JSON, useful for the `pdal pipeline` CLI or for storing pipelines as version-controlled assets, is:

```json
{
  "pipeline": [
    {
      "type": "readers.las",
      "filename": "ground_classified_utm12n.laz"
    },
    {
      "type": "filters.range",
      "limits": "Classification[2:2]"
    },
    {
      "type": "writers.gdal",
      "filename": "dtm_1m_idw.tif",
      "resolution": 1.0,
      "output_type": "idw",
      "window_size": 3,
      "radius": 1.5,
      "nodata": -9999.0,
      "gdaldriver": "GTiff",
      "gdalopts": "COMPRESS=DEFLATE,TILED=YES,BLOCKXSIZE=256,BLOCKYSIZE=256",
      "data_type": "float32"
    }
  ]
}
```

<svg viewBox="0 0 720 262" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Search radius around one raster cell centre and the parameters that set it" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What writers.gdal looks at when it fills one cell</title>
  <desc>A grid of raster cells with points scattered over it. A dashed circle of the search radius is drawn around one cell centre; the points inside it are highlighted and are the only ones the reducer sees for that cell. Beside the grid, the four parameters that control the operation: resolution, radius, window_size and output_type.</desc>
  <rect x="0" y="0" width="720" height="262" fill="var(--dg-bg)" rx="10"/>
  <rect x="40" y="48" width="42" height="42" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="82" y="48" width="42" height="42" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="124" y="48" width="42" height="42" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="166" y="48" width="42" height="42" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="208" y="48" width="42" height="42" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="250" y="48" width="42" height="42" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="292" y="48" width="42" height="42" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="40" y="90" width="42" height="42" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="82" y="90" width="42" height="42" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="124" y="90" width="42" height="42" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="166" y="90" width="42" height="42" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="208" y="90" width="42" height="42" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="250" y="90" width="42" height="42" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="292" y="90" width="42" height="42" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="40" y="132" width="42" height="42" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="82" y="132" width="42" height="42" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="124" y="132" width="42" height="42" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="166" y="132" width="42" height="42" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="208" y="132" width="42" height="42" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="250" y="132" width="42" height="42" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="292" y="132" width="42" height="42" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="40" y="174" width="42" height="42" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="82" y="174" width="42" height="42" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="124" y="174" width="42" height="42" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="166" y="174" width="42" height="42" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="208" y="174" width="42" height="42" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="250" y="174" width="42" height="42" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="292" y="174" width="42" height="42" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <circle cx="62" cy="70" r="3.2" fill="var(--dg-line-soft)"/>
  <circle cx="96" cy="62" r="3.2" fill="var(--dg-line-soft)"/>
  <circle cx="128" cy="84" r="3.2" fill="var(--dg-a)"/>
  <circle cx="160" cy="74" r="3.2" fill="var(--dg-a)"/>
  <circle cx="196" cy="66" r="3.2" fill="var(--dg-line-soft)"/>
  <circle cx="238" cy="90" r="3.2" fill="var(--dg-line-soft)"/>
  <circle cx="286" cy="70" r="3.2" fill="var(--dg-line-soft)"/>
  <circle cx="58" cy="118" r="3.2" fill="var(--dg-line-soft)"/>
  <circle cx="104" cy="104" r="3.2" fill="var(--dg-a)"/>
  <circle cx="132" cy="122" r="3.2" fill="var(--dg-a)"/>
  <circle cx="168" cy="110" r="3.2" fill="var(--dg-a)"/>
  <circle cx="206" cy="130" r="3.2" fill="var(--dg-line-soft)"/>
  <circle cx="252" cy="116" r="3.2" fill="var(--dg-line-soft)"/>
  <circle cx="300" cy="128" r="3.2" fill="var(--dg-line-soft)"/>
  <circle cx="74" cy="158" r="3.2" fill="var(--dg-line-soft)"/>
  <circle cx="112" cy="172" r="3.2" fill="var(--dg-line-soft)"/>
  <circle cx="150" cy="150" r="3.2" fill="var(--dg-a)"/>
  <circle cx="188" cy="168" r="3.2" fill="var(--dg-line-soft)"/>
  <circle cx="230" cy="156" r="3.2" fill="var(--dg-line-soft)"/>
  <circle cx="274" cy="176" r="3.2" fill="var(--dg-line-soft)"/>
  <circle cx="312" cy="160" r="3.2" fill="var(--dg-line-soft)"/>
  <circle cx="66" cy="200" r="3.2" fill="var(--dg-line-soft)"/>
  <circle cx="140" cy="196" r="3.2" fill="var(--dg-line-soft)"/>
  <circle cx="222" cy="204" r="3.2" fill="var(--dg-line-soft)"/>
  <circle cx="296" cy="198" r="3.2" fill="var(--dg-line-soft)"/>
  <circle cx="145" cy="111" r="58" fill="none" stroke="var(--dg-a)" stroke-width="1.8" stroke-dasharray="6 4"/>
  <circle cx="145" cy="111" r="3.6" fill="var(--dg-c)"/>
  <text x="145" y="30" text-anchor="middle" font-size="10.5" fill="var(--dg-a)">radius around the cell centre</text>
  <rect x="380" y="48" width="320" height="168" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="398" y="80" font-size="11.5" fill="var(--dg-text)">resolution 1.0 — cell side, in CRS units</text>
  <text x="398" y="114" font-size="11.5" fill="var(--dg-text)">radius 1.4 — points considered per cell</text>
  <text x="398" y="148" font-size="11.5" fill="var(--dg-text)">window_size 4 — focal fill for empty cells</text>
  <text x="398" y="182" font-size="11.5" fill="var(--dg-text)">output_type idw — how they are reduced</text>
  <text x="40" y="240" font-size="10.5" fill="var(--dg-muted)">a cell with no point inside its radius is written as NoData, and only then does window_size get a say</text>
</svg>

## Code Breakdown

### Keeping ground with filters.range

`filters.range` with `limits: "Classification[2:2]"` passes only points whose classification equals 2. The bracket syntax is an inclusive range; `[2:2]` is a single value. If your workflow labels water (class 9) as part of the terrain, widen the expression to `"Classification[2:2],Classification[9:9]"` — comma-separated ranges are ORed. Because this filter runs before the rasterizer, `writers.gdal` never sees a rooftop point, so the interpolator cannot pull a cell upward toward a building edge.

### resolution versus radius

`resolution` fixes the grid: a value of `1.0` in a UTM CRS produces 1 m cells, while `0.5` produces 0.5 m cells and quadruples the pixel count. `radius` is the search neighbourhood used to gather points for each cell. Left unset, PDAL derives it as `resolution * sqrt(2)` — just enough to reach the corner of a cell. Explicitly setting `radius` to roughly 1.5 times the resolution gives the interpolator more points to work with and reduces speckle, at the cost of mild smoothing. Setting it much larger blurs breaklines and drags valley elevations up toward ridge points.

### output_type interpolators

| `output_type` | Cell value | Typical use |
|---------------|-----------|-------------|
| `idw` | Inverse-distance-weighted mean of points in radius | Default smooth bare-earth DTM |
| `mean` | Unweighted average of points in radius | Fast, slightly noisier surface |
| `min` | Lowest Z in the cell | Suppresses residual low vegetation; sensitive to negative noise |
| `max` | Highest Z in the cell | Rarely used for a DTM; useful as a QA band |
| `count` | Number of points in the cell | Coverage/density diagnostic band |
| `stdev` | Standard deviation of Z | Roughness / uncertainty band |
| `all` | Every statistic as separate bands | One-pass diagnostics |

For a production terrain model, `idw` is the standard. The trade-offs between `idw` and `mean` for gap-prone tiles are examined in depth in [IDW vs Mean Interpolation for DTM Gaps](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/idw-vs-mean-interpolation-for-dtm-gaps/).

### window_size gap filling

`window_size` is an integer radius, expressed in cells, for a moving-window interpolation that runs after binning but before encoding. A value of `3` lets PDAL fill an empty cell if it can see populated cells within three cells in any direction. This closes the small, scattered holes that appear at the finest resolutions without a separate post-processing tool. Larger values invent terrain across genuine voids, so keep `window_size` modest and reach for a dedicated fill only when needed — see [Filling NoData Voids in DTM Rasters](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/filling-nodata-voids-in-dtm-rasters/).

### GDAL driver, options, and NoData

`gdaldriver: "GTiff"` selects the GeoTIFF encoder. `gdalopts` is a comma-separated creation-option string passed straight to GDAL: `COMPRESS=DEFLATE` shrinks the file losslessly, `TILED=YES` with 256-pixel blocks makes windowed reads fast, and `ZLEVEL=6` balances size against write time. `nodata: -9999.0` is the sentinel written to every cell no point or interpolation could fill; downstream tools must be told to honour it. `data_type: "float32"` keeps sub-centimetre vertical precision at half the size of float64.

## Parameter Reference Table

| Parameter | Type | Default | Valid range | Effect |
|-----------|------|---------|-------------|--------|
| `resolution` | float | — (required) | 0.1–30 | Cell size in ground units; finer = more cells and more holes |
| `output_type` | string | `mean` | `idw`,`mean`,`min`,`max`,`count`,`stdev`,`all` | Statistic reported per cell |
| `radius` | float | `resolution * sqrt(2)` | ≥ resolution | Point search neighbourhood per cell |
| `window_size` | int | 0 | 0–10 | Cells searched to fill isolated NoData holes |
| `nodata` | float | -9999 | any | Empty-cell sentinel value |
| `data_type` | string | `double` | `float32`,`float64`,`int32`,… | Raster band data type |
| `gdaldriver` | string | `GTiff` | any GDAL raster driver | Output format |
| `gdalopts` | string | — | driver creation options | Compression, tiling, block size |
| `dimension` | string | `Z` | any point dimension | Attribute to rasterize (Z for elevation) |
| `bounds` | string | data extent | `([xmin,xmax],[ymin,ymax])` | Force a fixed output extent |

## Validation and Integrity Checks

Never ship a DTM you have not opened. Load the GeoTIFF with `rasterio` and confirm its shape, CRS, NoData handling, and elevation distribution:

```python
import numpy as np
import rasterio


def validate_dtm(path: str, max_void_fraction: float = 0.05) -> dict:
    """Open a DTM GeoTIFF and assert basic integrity properties."""
    with rasterio.open(path) as ds:
        band = ds.read(1, masked=True)
        total = band.size
        void = int(band.mask.sum())
        void_fraction = void / total

        report = {
            "shape": (ds.height, ds.width),
            "crs": ds.crs.to_string() if ds.crs else None,
            "resolution": ds.res,
            "nodata": ds.nodata,
            "void_fraction": round(void_fraction, 4),
            "z_min": float(band.min()),
            "z_max": float(band.max()),
            "z_mean": float(band.mean()),
        }

    assert report["crs"] is not None, "DTM has no CRS — reproject before rasterizing"
    assert report["nodata"] is not None, "DTM has no NoData value set"
    assert void_fraction <= max_void_fraction, (
        f"{void_fraction:.1%} of cells are NoData (limit {max_void_fraction:.0%}). "
        "Coarsen resolution, widen radius, or run a void-fill pass."
    )
    return report


if __name__ == "__main__":
    print(validate_dtm("dtm_1m_idw.tif"))
```

Three checks matter most. First, **CRS must be present** — a null CRS means the source points were untagged, and the raster is spatially meaningless. Second, **the NoData fraction** should sit below a project threshold; a sudden jump usually means the resolution outran the ground-point spacing. Third, **the elevation range** should match known site relief — a `z_max` in the thousands over a floodplain betrays unfiltered noise or a stray high point that ground classification missed.

<svg viewBox="0 0 720 236" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The same five points reduced five different ways by writers.gdal" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Five reducers, one set of points, five cell values</title>
  <desc>Five panels each showing the identical five points that fall inside one cell's search radius. The line across each panel marks the value that reducer writes: inverse distance weighting gives 21.94 metres, mean 21.97, min 21.61, max 22.44, and count simply reports five points.</desc>
  <rect x="0" y="0" width="720" height="236" fill="var(--dg-bg)" rx="10"/>
  <rect x="30" y="54" width="124" height="120" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="92" y="44" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">idw</text>
  <circle cx="50" cy="148" r="3.2" fill="var(--dg-line)"/>
  <circle cx="71" cy="96" r="3.2" fill="var(--dg-line)"/>
  <circle cx="92" cy="122" r="3.2" fill="var(--dg-line)"/>
  <circle cx="113" cy="84" r="3.2" fill="var(--dg-line)"/>
  <circle cx="134" cy="136" r="3.2" fill="var(--dg-line)"/>
  <line x1="38" y1="112" x2="146" y2="112" stroke="var(--dg-c)" stroke-width="2.2"/>
  <rect x="168" y="54" width="124" height="120" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="230" y="44" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">mean</text>
  <circle cx="188" cy="148" r="3.2" fill="var(--dg-line)"/>
  <circle cx="209" cy="96" r="3.2" fill="var(--dg-line)"/>
  <circle cx="230" cy="122" r="3.2" fill="var(--dg-line)"/>
  <circle cx="251" cy="84" r="3.2" fill="var(--dg-line)"/>
  <circle cx="272" cy="136" r="3.2" fill="var(--dg-line)"/>
  <line x1="176" y1="117" x2="284" y2="117" stroke="var(--dg-c)" stroke-width="2.2"/>
  <rect x="306" y="54" width="124" height="120" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="368" y="44" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">min</text>
  <circle cx="326" cy="148" r="3.2" fill="var(--dg-line)"/>
  <circle cx="347" cy="96" r="3.2" fill="var(--dg-line)"/>
  <circle cx="368" cy="122" r="3.2" fill="var(--dg-line)"/>
  <circle cx="389" cy="84" r="3.2" fill="var(--dg-line)"/>
  <circle cx="410" cy="136" r="3.2" fill="var(--dg-line)"/>
  <line x1="314" y1="148" x2="422" y2="148" stroke="var(--dg-c)" stroke-width="2.2"/>
  <rect x="444" y="54" width="124" height="120" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="506" y="44" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">max</text>
  <circle cx="464" cy="148" r="3.2" fill="var(--dg-line)"/>
  <circle cx="485" cy="96" r="3.2" fill="var(--dg-line)"/>
  <circle cx="506" cy="122" r="3.2" fill="var(--dg-line)"/>
  <circle cx="527" cy="84" r="3.2" fill="var(--dg-line)"/>
  <circle cx="548" cy="136" r="3.2" fill="var(--dg-line)"/>
  <line x1="452" y1="84" x2="560" y2="84" stroke="var(--dg-c)" stroke-width="2.2"/>
  <rect x="582" y="54" width="124" height="120" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="644" y="44" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">count</text>
  <circle cx="602" cy="148" r="4.6" fill="none" stroke="var(--dg-c)" stroke-width="1.8"/>
  <circle cx="623" cy="96" r="4.6" fill="none" stroke="var(--dg-c)" stroke-width="1.8"/>
  <circle cx="644" cy="122" r="4.6" fill="none" stroke="var(--dg-c)" stroke-width="1.8"/>
  <circle cx="665" cy="84" r="4.6" fill="none" stroke="var(--dg-c)" stroke-width="1.8"/>
  <circle cx="686" cy="136" r="4.6" fill="none" stroke="var(--dg-c)" stroke-width="1.8"/>
  <text x="92" y="196" text-anchor="middle" font-size="11" fill="var(--dg-c)">21.94 m</text>
  <text x="230" y="196" text-anchor="middle" font-size="11" fill="var(--dg-c)">21.97 m</text>
  <text x="368" y="196" text-anchor="middle" font-size="11" fill="var(--dg-c)">21.61 m</text>
  <text x="506" y="196" text-anchor="middle" font-size="11" fill="var(--dg-c)">22.44 m</text>
  <text x="644" y="196" text-anchor="middle" font-size="11" fill="var(--dg-c)">5 points</text>
  <text x="30" y="222" font-size="10.5" fill="var(--dg-muted)">ask for several at once — "output_type": "idw,count" writes one band per reducer and costs a single pass</text>
</svg>

## Performance Tuning

Rasterization cost is dominated by the output grid size, which scales with the inverse square of resolution. Halving the cell size quadruples the cells and the memory GDAL holds while building the raster. The table below shows representative figures for a 40 million ground-point tile covering roughly 1 km² on a 16-core workstation:

| Resolution | Grid cells | Wall time (s) | Peak RAM (GB) | GeoTIFF size (DEFLATE) |
|-----------|-----------|---------------|---------------|------------------------|
| 2.0 m | 250 k | 11 | 0.6 | 3 MB |
| 1.0 m | 1.0 M | 19 | 1.1 | 9 MB |
| 0.5 m | 4.0 M | 41 | 2.8 | 28 MB |
| 0.25 m | 16.0 M | 96 | 7.9 | 74 MB |

Practical guidance:

- **Match resolution to ground-point spacing.** If ground returns average 0.7 m apart, a 0.25 m DTM is mostly interpolation and holes; 1 m is honest. Measure spacing with [Point Density Metrics](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/) before choosing.
- **Prefer float32 over float64** unless you genuinely need sub-millimetre vertical precision — it halves both RAM and file size with no visible quality loss for airborne LiDAR.
- **Keep TILED=YES** so downstream slope, aspect, and hillshade derivations read windows efficiently rather than scanning whole scanlines.
- **Tile large areas rather than rasterizing a whole survey at once**; a fixed `bounds` per tile keeps peak memory bounded and lets a batch system parallelise across cores, as covered in [Parallel Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/).

## Common Errors and Troubleshooting

**`writers.gdal: could not create raster` / empty output**
Root cause: no points survived `filters.range`, so there is nothing to rasterize. Fix: confirm the tile is actually classified — run `pdal info --metadata` and check for a non-zero count of Classification 2 points before rasterizing.

**DTM cell size is one degree, not one metre**
Root cause: the point cloud is still in a geographic CRS (`EPSG:4326`), so `resolution: 1.0` means one degree. Fix: insert `filters.reprojection` targeting a projected CRS such as `EPSG:6339` before the range filter, as detailed in [Spatial Reprojection](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/).

**Sawtooth or terraced terrain**
Root cause: `output_type: "min"` combined with sparse points quantises the surface, or the vertical values were stored as integers. Fix: switch to `idw`, set `data_type: "float32"`, and add a small `radius` so each cell draws from several points.

**Speckled NoData holes at fine resolution**
Root cause: `resolution` is finer than the ground spacing and `window_size` is 0. Fix: raise `window_size` to 3–4 to interpolate across small gaps, widen `radius`, or coarsen the grid. Persistent large voids need the techniques in [Filling NoData Voids in DTM Rasters](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/filling-nodata-voids-in-dtm-rasters/).

**Downstream tools treat -9999 as real elevation**
Root cause: some consumers ignore the GeoTIFF NoData tag. Fix: confirm `nodata` is set in the writer and, if a specific tool still mishandles it, mask explicitly with `rasterio`'s masked reads or re-tag with `gdal_edit.py -a_nodata`.

## Frequently Asked Questions

**What does output_type control in writers.gdal?**

`output_type` selects the statistic each raster cell reports from the ground points that fall inside its search radius. `idw` computes an inverse-distance-weighted mean and is the standard choice for a smooth bare-earth DTM; `mean` is an unweighted average; `min` returns the lowest Z, which suppresses residual low vegetation but is sensitive to negative noise; `max`, `count`, and `stdev` are diagnostic bands. Passing `output_type: "all"` writes every statistic as a separate band.

**How are resolution and radius related in a PDAL DTM?**

`resolution` sets the cell size in ground units and `radius` sets how far around each cell centre PDAL looks for contributing points. If `radius` is left unset PDAL defaults it to `resolution` multiplied by the square root of two, which just covers the cell's diagonal. Raising `radius` above that fills more cells at the cost of smoothing and cross-feature bleed; lowering it leaves more NoData holes in sparse areas.

**Does writers.gdal need the point cloud to already be in a projected CRS?**

It should be. `writers.gdal` rasterizes in whatever horizontal units the incoming points carry, so a geographic CRS in degrees produces a cell size of, for example, one degree rather than one metre. Reproject to a metric projected CRS with `filters.reprojection` before rasterizing, and the GeoTIFF inherits that CRS in its header automatically.

**Why is my DTM full of NoData cells?**

Empty cells appear where no ground point fell within the search radius. Common causes are a resolution finer than the ground-return spacing, an overly tight `radius`, or aggressive ground filtering that removed too many points. Coarsen the resolution, widen `radius`, raise `window_size` to interpolate across small voids, or post-process with a dedicated void-fill pass.

---

## Related

- [Ground Filtering and DTM/DSM Generation with PDAL](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/) — parent overview of ground filtering and terrain modelling
- [Generating a DTM GeoTIFF with writers.gdal](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/generating-a-dtm-geotiff-with-writers-gdal/) — the complete step-by-step recipe
- [IDW vs Mean Interpolation for DTM Gaps](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/idw-vs-mean-interpolation-for-dtm-gaps/) — how the two interpolators treat sparse cells
- [Filling NoData Voids in DTM Rasters](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/filling-nodata-voids-in-dtm-rasters/) — closing holes with window_size and post-processing
- [DSM Generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/) — the first-return surface counterpart to a DTM
- [SMRF Ground Classification](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) — how ground points are labelled before rasterization
- [Point Density Metrics](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/) — measuring ground spacing to choose a resolution
