---
title: "PDAL Pipeline Architecture and Execution"
description: "The complete technical guide to PDAL's pipeline execution model: stage DAGs, streaming memory, readers/filters/writers, Python integration, performance tuning, and production deployment for LiDAR and point cloud processing workflows."
slug: "pdal-pipeline-architecture-execution"
type: "guide"
breadcrumb: "PDAL Pipeline Architecture and Execution"
datePublished: "2024-01-15"
dateModified: "2026-06-24"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "PDAL Pipeline Architecture and Execution",
      "description": "The complete technical guide to PDAL's pipeline execution model: stage DAGs, streaming memory, readers/filters/writers, Python integration, performance tuning, and production deployment for LiDAR and point cloud processing workflows.",
      "datePublished": "2024-01-15",
      "dateModified": "2026-06-24",
      "author": { "@type": "Organization", "name": "pythonlidar.com" },
      "publisher": { "@type": "Organization", "name": "pythonlidar.com" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pythonlidar.com/" },
        { "@type": "ListItem", "position": 2, "name": "PDAL Pipeline Architecture and Execution", "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/" }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Build and Execute a Production PDAL Pipeline in Python",
      "step": [
        { "@type": "HowToStep", "name": "Define the pipeline as JSON", "text": "Express your reader, filter chain, and writer as a JSON array of stage objects with explicit type keys and realistic parameter values for your dataset's CRS, point format, and target output." },
        { "@type": "HowToStep", "name": "Validate the pipeline before execution", "text": "Run pdal pipeline --validate pipeline.json to catch schema violations, missing stage parameters, and incompatible dimension names before processing large datasets." },
        { "@type": "HowToStep", "name": "Execute via pdal.Pipeline in Python", "text": "Construct a pdal.Pipeline from the JSON string, call pipeline.execute(), and capture the returned point count for logging and assertions." },
        { "@type": "HowToStep", "name": "Inspect pipeline.metadata for diagnostics", "text": "Examine the nested metadata dict for per-stage point counts, bounding boxes, CRS strings, and timing data to confirm correctness and catch silent data-loss failures." },
        { "@type": "HowToStep", "name": "Tune capacity and parallelism for throughput", "text": "Adjust the capacity parameter on readers and filters, set OMP_NUM_THREADS for ground-classification stages, and distribute tiles across ProcessPoolExecutor workers for near-linear multi-core scaling." }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does PDAL use a pull-based execution model instead of push?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Pull-based execution means the writer controls flow: it requests a batch only when it is ready to consume one. This backpressure mechanism prevents upstream stages from producing data faster than downstream stages can consume it, keeping the in-flight point count bounded and memory predictable regardless of dataset size."
          }
        },
        {
          "@type": "Question",
          "name": "Can I run a single PDAL pipeline across multiple CPU cores?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A single pipeline instance is single-threaded except for stages that internally use OpenMP (notably filters.smrf and filters.pmf). To use all cores, run independent pipeline processes in parallel — one per spatial tile — using Python's ProcessPoolExecutor."
          }
        },
        {
          "@type": "Question",
          "name": "What happens to custom LAS dimensions (extra bytes) when I chain filters?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Extra bytes dimensions propagate through the pipeline unless a filter explicitly drops them via drop_dims. Set extra_dims=all on writers.las to preserve them in the output. If you need a custom dimension that does not exist in the input, use filters.ferry to create it with a default value before passing to filters that expect it."
          }
        },
        {
          "@type": "Question",
          "name": "How do I process a file that is larger than available RAM?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Use stream mode: pdal pipeline --stream pipeline.json. Stream mode requires all stages to support streaming (most readers, filters.range, filters.reprojection, filters.expression, and writers.las do; filters.sort does not). In Python, pass stream=True to pipeline.execute()."
          }
        },
        {
          "@type": "Question",
          "name": "Should I compress output to LAZ or write uncompressed LAS?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "For final delivery or archival, LAZ (LASzip compression) reduces file size by 70–90% with no precision loss. For iterative development where you re-read outputs multiple times, uncompressed LAS is 2–4x faster to read because it eliminates decompression overhead. Store intermediate tiles as uncompressed LAS; compress only at the final write step."
          }
        }
      ]
    }
  ]
}
</script>

For LiDAR analysts, Python GIS developers, and surveying tech teams, mastering how PDAL constructs and executes processing pipelines is the foundation of scalable, reproducible point cloud workflows. Raw airborne or terrestrial scan data arrives in formats that need filtering, reprojection, classification, and export — often across hundreds of tiles and dozens of gigabytes. PDAL's declarative, stage-based architecture lets you express that logic once in JSON, drive it from Python, and run it identically in a laptop terminal or a Kubernetes worker node. This guide covers the complete execution model: how stages connect into a directed graph, how points stream through memory, how to tune throughput, and how to deploy reliably in production CI/CD systems.

---

<svg viewBox="-2 53 824 171" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="PDAL pipeline execution flow from reader through filters to writer" style="width:100%;max-width:820px;display:block;margin:1.5rem auto">
  <title>PDAL Pipeline Execution Flow</title>
  <desc>Directed acyclic graph showing how a PDAL pipeline pulls data from a Reader stage through one or more Filter stages and into a Writer stage, with the pull-based request model indicated by arrows flowing left to right.</desc>
  <rect x="-2" y="53" width="824" height="171" fill="var(--dg-bg)" rx="10"/>
  <defs>
    <marker id="arr-flow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- Reader box -->
  <rect x="20" y="75" width="145" height="65" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="92" y="101" text-anchor="middle" font-size="13" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">Reader</text>
  <text x="92" y="118" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">readers.las</text>
  <text x="92" y="132" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">readers.e57</text>
  <!-- Arrow 1 -->
  <line x1="165" y1="107" x2="218" y2="107" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-flow)" opacity="0.6"/>
  <text x="191" y="100" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.6">pull</text>
  <!-- Filter 1 box -->
  <rect x="220" y="75" width="158" height="65" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="299" y="101" text-anchor="middle" font-size="13" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">Filter</text>
  <text x="299" y="118" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">filters.outlier</text>
  <text x="299" y="132" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">filters.smrf</text>
  <!-- Arrow 2 -->
  <line x1="378" y1="107" x2="428" y2="107" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-flow)" opacity="0.6"/>
  <text x="403" y="100" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.6">pull</text>
  <!-- Filter 2 box -->
  <rect x="430" y="75" width="168" height="65" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="514" y="101" text-anchor="middle" font-size="13" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">Filter</text>
  <text x="514" y="118" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">filters.reprojection</text>
  <text x="514" y="132" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">filters.range</text>
  <!-- Arrow 3 -->
  <line x1="598" y1="107" x2="645" y2="107" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-flow)" opacity="0.6"/>
  <text x="621" y="100" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.6">pull</text>
  <!-- Writer box -->
  <rect x="647" y="75" width="153" height="65" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="723" y="101" text-anchor="middle" font-size="13" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">Writer</text>
  <text x="723" y="118" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">writers.las</text>
  <text x="723" y="132" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">writers.copc</text>
  <!-- Label row -->
  <text x="92" y="165" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.5">Ingest</text>
  <text x="299" y="165" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.5">Transform / Classify</text>
  <text x="514" y="165" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.5">Project / Subset</text>
  <text x="723" y="165" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.5">Serialize</text>
  <!-- Batch note -->
  <text x="410" y="200" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.45">Points flow in configurable batches (capacity); data is never fully loaded into RAM at once</text>
</svg>

## How the PDAL Execution Model Works

PDAL does not process point clouds through procedural scripts that load data upfront. Instead it builds a directed acyclic graph (DAG) where each node is a processing stage and each edge is a point buffer. The pipeline is expressed in JSON — PDAL 2.0 dropped XML support — which maps cleanly to Python dictionaries and round-trips through distributed job queues without ambiguity.

At execution time PDAL parses the pipeline definition, validates stage compatibility, allocates point buffers, then streams batches through the chain using a **pull-based model**: the writer requests a batch, which triggers the preceding filter, which triggers the one before it, all the way back to the reader. Only the points needed for the current batch are materialized in memory at any moment. This lazy streaming architecture is what allows PDAL to process datasets that are many times larger than available RAM — an essential property when working with statewide 3DEP coverage or dense mobile mapping campaigns.

The `capacity` parameter (default 65536 points per batch) on readers and filters controls how large each batch is. Tuning this is covered in the [performance section below](#performance-and-scaling).

## Core Stage Categories

Every PDAL pipeline is composed from three fundamental stage types.

### Readers

Readers ingest point cloud data and expose it as a typed point buffer with a declared schema (the set of dimensions such as `X`, `Y`, `Z`, `Intensity`, `ReturnNumber`, `Classification`). The most common readers and their key parameters:

| Stage | Primary use | Key parameters |
|---|---|---|
| `readers.las` | LAS/LAZ files (most LiDAR deliverables) | `filename`, `spatialreference`, `nosrs` |
| `readers.e57` | Terrestrial scanner E57 archives | `filename`, `scan_index` |
| `readers.ply` | Mesh-derived or photogrammetric point clouds | `filename` |
| `readers.text` | CSV/XYZ ASCII point files | `filename`, `separator`, `header`, `skip` |
| `readers.copc` | Cloud-Optimised Point Cloud streaming | `filename` (HTTP or local path), `requests` |

Always set `spatialreference` explicitly on `readers.las` when the LAZ header embeds an ambiguous or missing SRS — silently inheriting a wrong projection is one of the most common sources of misaligned outputs.

### Filters

Filters sit between readers and writers and either modify the point buffer in-place or produce a derived buffer. They can drop dimensions to save memory, add computed fields (`extra_dims`), subset by spatial or attribute predicates, or classify ground returns. Understanding how [PDAL stage chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/) propagates buffers between filters is key to building pipelines where each stage receives the dimensions it expects.

Key filters and their roles:

| Stage | Role | Performance note |
|---|---|---|
| `filters.outlier` | Statistical or radius noise removal | Run before classification; `mean_k=10`, `multiplier=3.0` typical |
| `filters.smrf` | Progressive ground classification (SMRF algorithm) | CPU-intensive; set `OMP_NUM_THREADS` |
| `filters.pmf` | Progressive Morphological Filter for ground | Good for low-density rural scans |
| `filters.reprojection` | CRS transformation via PROJ | Must precede any spatial operation that assumes a target SRS |
| `filters.range` | Attribute-predicate subsetting | Use for classification masking, return-number filtering |
| `filters.splitter` | Spatial tiling into grid cells | Foundation of file-level parallel workflows |
| `filters.merge` | Recombine split branches | Use after parallel tile processing |
| `filters.expression` | Compute derived dimensions from expressions | Replaces deprecated `filters.assign` in PDAL 2.6+ |

### Writers

Writers serialize the processed point buffer to disk, database, or network. The `writers.las` stage is the workhorse for LAS/LAZ output. `writers.copc` produces Cloud-Optimised Point Clouds suitable for web streaming without pre-tiling. `writers.gdal` rasterizes point clouds into GeoTIFF DEMs or intensity grids. Always declare `minor_version`, `dataformat_id`, and `extra_dims` explicitly on `writers.las` to avoid header ambiguity and dropped custom dimensions.

<svg viewBox="0 0 720 268" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The three PDAL stage categories with five common stages under each" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Every PDAL stage is one of three things</title>
  <desc>Three columns. Readers pull points in from LAS, COPC, EPT, text or a GDAL raster. Filters reshape them — range selection, SMRF ground classification, reprojection, outlier removal, height above ground. Writers put them somewhere: LAS, a GDAL raster, COPC, an OGR vector layer or text. A pipeline is one reader, any number of filters, and usually one writer.</desc>
  <rect x="0" y="0" width="720" height="268" fill="var(--dg-bg)" rx="10"/>
  <rect x="24" y="40" width="216" height="34" rx="7" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.4"/>
  <text x="132" y="62" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">readers · pull points in</text>
  <rect x="24" y="84" width="216" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="132" y="103" text-anchor="middle" font-size="11" fill="var(--dg-text)">readers.las</text>
  <rect x="24" y="118" width="216" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="132" y="137" text-anchor="middle" font-size="11" fill="var(--dg-text)">readers.copc</text>
  <rect x="24" y="152" width="216" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="132" y="171" text-anchor="middle" font-size="11" fill="var(--dg-text)">readers.ept</text>
  <rect x="24" y="186" width="216" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="132" y="205" text-anchor="middle" font-size="11" fill="var(--dg-text)">readers.text</text>
  <rect x="24" y="220" width="216" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="132" y="239" text-anchor="middle" font-size="11" fill="var(--dg-text)">readers.gdal</text>
  <rect x="252" y="40" width="216" height="34" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.4"/>
  <text x="360" y="62" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">filters · reshape them</text>
  <rect x="252" y="84" width="216" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="360" y="103" text-anchor="middle" font-size="11" fill="var(--dg-text)">filters.range</text>
  <rect x="252" y="118" width="216" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="360" y="137" text-anchor="middle" font-size="11" fill="var(--dg-text)">filters.smrf</text>
  <rect x="252" y="152" width="216" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="360" y="171" text-anchor="middle" font-size="11" fill="var(--dg-text)">filters.reprojection</text>
  <rect x="252" y="186" width="216" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="360" y="205" text-anchor="middle" font-size="11" fill="var(--dg-text)">filters.outlier</text>
  <rect x="252" y="220" width="216" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="360" y="239" text-anchor="middle" font-size="11" fill="var(--dg-text)">filters.hag_nn</text>
  <rect x="480" y="40" width="216" height="34" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.4"/>
  <text x="588" y="62" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">writers · put them somewhere</text>
  <rect x="480" y="84" width="216" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="588" y="103" text-anchor="middle" font-size="11" fill="var(--dg-text)">writers.las</text>
  <rect x="480" y="118" width="216" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="588" y="137" text-anchor="middle" font-size="11" fill="var(--dg-text)">writers.gdal</text>
  <rect x="480" y="152" width="216" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="588" y="171" text-anchor="middle" font-size="11" fill="var(--dg-text)">writers.copc</text>
  <rect x="480" y="186" width="216" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="588" y="205" text-anchor="middle" font-size="11" fill="var(--dg-text)">writers.ogr</text>
  <rect x="480" y="220" width="216" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="588" y="239" text-anchor="middle" font-size="11" fill="var(--dg-text)">writers.text</text>
  <text x="24" y="26" font-size="10.5" fill="var(--dg-muted)">the type key in a pipeline stage always names one of these three families</text>
</svg>

## Annotated Reference Pipeline

The pipeline below is the minimal production starting point for airborne LiDAR cleaning: ingest a compressed LAZ tile, remove statistical noise, reproject to a target CRS, classify ground returns, and write a cleaned output. Every parameter value is production-realistic.

```json
{
  "pipeline": [
    {
      "type": "readers.las",
      "filename": "tile_6342_NE.laz",
      "spatialreference": "EPSG:6347"
    },
    {
      "type": "filters.outlier",
      "method": "statistical",
      "mean_k": 10,
      "multiplier": 3.0
    },
    {
      "type": "filters.reprojection",
      "out_srs": "EPSG:32618"
    },
    {
      "type": "filters.smrf",
      "window": 18.0,
      "slope": 0.15,
      "threshold": 0.5,
      "scalar": 1.25,
      "cell": 1.0
    },
    {
      "type": "writers.las",
      "filename": "tile_6342_NE_clean.laz",
      "minor_version": 4,
      "dataformat_id": 6,
      "compression": true,
      "extra_dims": "all"
    }
  ]
}
```

Stage ordering matters: the outlier filter runs before reprojection because statistical distances are consistent within the source CRS; [ground classification](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) with `filters.smrf` runs after reprojection so the window size in metres matches the target coordinate system. Once ground returns are labelled, the same pipeline can feed [DTM and DSM raster generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/) for terrain products.

Validate any pipeline before running it at scale:

```bash
pdal pipeline --validate pipeline.json
```

## Python Integration

The `pdal` Python package wraps the C++ execution engine and lets you construct pipelines from dictionaries, inject runtime parameters, and capture per-stage metadata without leaving Python.

```python
import json
import logging
import pdal

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

def run_cleaning_pipeline(
    input_path: str,
    output_path: str,
    source_srs: str = "EPSG:6347",
    target_srs: str = "EPSG:32618",
) -> dict:
    """
    Run statistical outlier removal, reprojection, and SMRF ground
    classification on a single LAZ tile. Returns pipeline metadata.
    """
    pipeline_def = {
        "pipeline": [
            {
                "type": "readers.las",
                "filename": input_path,
                "spatialreference": source_srs,
            },
            {
                "type": "filters.outlier",
                "method": "statistical",
                "mean_k": 10,
                "multiplier": 3.0,
            },
            {
                "type": "filters.reprojection",
                "out_srs": target_srs,
            },
            {
                "type": "filters.smrf",
                "window": 18.0,
                "slope": 0.15,
                "threshold": 0.5,
                "scalar": 1.25,
                "cell": 1.0,
            },
            {
                "type": "writers.las",
                "filename": output_path,
                "minor_version": 4,
                "dataformat_id": 6,
                "compression": True,
                "extra_dims": "all",
            },
        ]
    }

    pipeline = pdal.Pipeline(json.dumps(pipeline_def))
    pipeline.loglevel = 3  # INFO-level output from the C++ engine

    try:
        count = pipeline.execute()
    except RuntimeError as exc:
        logging.error("Pipeline failed: %s", exc)
        raise

    meta = pipeline.metadata
    reader_meta = meta["metadata"]["readers.las"]
    logging.info(
        "Processed %d points (in: %d, out: %d) from %s",
        count,
        reader_meta["count"],
        count,
        input_path,
    )
    return meta


if __name__ == "__main__":
    result = run_cleaning_pipeline(
        "tile_6342_NE.laz",
        "tile_6342_NE_clean.laz",
    )
```

`pipeline.execute()` returns the number of points written. `pipeline.metadata` is a nested dict containing bounding boxes, point counts, CRS strings, and per-stage timing — use it for assertions in CI tests.

## Schema and Data-Flow Considerations

### Dimension propagation

Every stage in a PDAL pipeline operates on a shared point table. Readers declare the initial schema; filters can add, remove, or rename dimensions. If a downstream filter expects `Classification` but an upstream filter dropped it to save memory, the pipeline raises a schema violation at runtime. Always audit dimension propagation when combining filters — run a short dry-run against a 50 000-point sample and inspect `pipeline.metadata` to confirm the expected dimensions survive.

Proper [attribute mapping](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/) is especially important when ingesting data from multiple sensors with different field names. Use `filters.ferry` to copy or rename dimensions before passing them to stages that expect a canonical name.

### CRS handling

PDAL carries CRS metadata through the entire pipeline. When a reader declares `spatialreference`, every subsequent stage inherits it unless a `filters.reprojection` stage changes it. Always insert an explicit [spatial reprojection](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/) stage before any operation that assumes metric distances — SMRF's `window` parameter is in the units of the current CRS, so running it in geographic (degree) coordinates produces nonsensical results.

For vertical datums, PROJ 7+ handles ellipsoid-to-NAVD88 transformations via `filters.reprojection` when the pipeline CRS string includes a vertical component (e.g., `EPSG:6349+5703`). Omitting the vertical authority is the most common source of systematic elevation bias.

### `forward` and `extra_dims`

`writers.las` has two parameters that control header and attribute preservation:

- `forward`: Controls which LAS header fields (scale, offset, VLRs, point format) are forwarded from the reader. Set `forward=all` to preserve the source header exactly; omit fields you want to override explicitly.
- `extra_dims`: Controls non-standard dimensions. Set `extra_dims=all` to preserve every computed or custom field; list specific names (e.g., `extra_dims=Amplitude=float,Deviation=float`) to include only what downstream consumers need.

## Performance and Scaling

Raw CPU is rarely the bottleneck in point cloud workflows. I/O latency, memory fragmentation, and single-threaded execution are the common limiters. The table below summarises the key knobs and their trade-offs:

| Lever | Default | Tuning guidance | Expected effect |
|---|---|---|---|
| `capacity` (batch size) | 65536 pts | 131072–524288 for large homogeneous tiles; 16384 for RAM-constrained containers | Larger batches amortise per-call overhead; too large triggers swap |
| `OMP_NUM_THREADS` | All cores | Match to physical cores, not hyperthreads, for `filters.smrf` / `filters.pmf` | Linear scaling up to ~8 cores for ground classification |
| File-level parallelism | 1 process | Use `concurrent.futures.ProcessPoolExecutor` with one process per tile | Near-linear scaling; PDAL's C++ threads do not contend across processes |
| LAZ vs uncompressed LAS | LAZ default | Use uncompressed LAS for iterative development (no decompress overhead per run) | 2–4× faster read on re-runs; 3–7× larger files |
| `readers.copc` | — | Stream only the spatial region and LOD needed | Eliminates reading entire file when a spatial subset suffices |

[Parallel execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/) in PDAL means orchestrating multiple independent pipeline processes — one per tile — rather than parallelising a single pipeline internally. Python's `ProcessPoolExecutor` with a pool sized to `os.cpu_count()` and a tile list as the work queue is the standard pattern for regional campaigns.

[Memory management](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/) under constrained infrastructure requires setting `capacity` conservatively, using `--stream` mode for linear pipelines (no branching), and avoiding filters that buffer the entire point set (e.g., `filters.sort`) unless necessary.

## Production Deployment Patterns

### Version-controlled pipeline JSON

Store pipeline definitions as checked-in JSON files alongside the Python scripts that invoke them. Parameterise file paths and SRS strings at runtime by loading the JSON, updating the relevant keys, and passing the modified dict to `pdal.Pipeline`. Never hard-code absolute paths inside committed JSON.

### CI/CD validation

Add `pdal --validate pipeline.json` as a CI step that runs on every commit. Pair it with a Python test that executes the pipeline against a 5 000-point sample tile and asserts:

```python
assert pipeline.execute() > 0
meta = pipeline.metadata
assert meta["metadata"]["readers.las"]["srs"]["json"]["name"] != ""
```

Before running [pipeline validation](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/) in CI, ensure the test environment has the same PDAL version as production — schema behaviour and stage parameters differ across minor versions.

### Containerisation

Official PDAL Docker images (`ghcr.io/pdal/pdal`) bundle GDAL, PROJ, and the Python bindings, eliminating dependency drift between environments. Pin the image tag to a specific PDAL version in `docker-compose.yml` and in your Kubernetes job manifests. See [batch automation and cloud integration](https://www.pythonlidar.com/batch-automation-cloud-integration/) for running these containers at scale on AWS Batch and Airflow.

### Cloud object-storage readers and writers

PDAL's HTTP/HTTPS and GDAL VSIAZ/VSIGS virtual file system support allows pipelines to stream directly from S3, Azure Blob, or GCS without staging to local disk:

```json
{
  "type": "readers.las",
  "filename": "/vsicurl/https://your-bucket.s3.amazonaws.com/tiles/tile_001.laz"
}
```

Network throughput must be provisioned to match the reader's consumption rate. On bandwidth-constrained nodes, prefetch tiles to local NVMe before execution.

<svg viewBox="0 0 720 282" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Four common PDAL runtime errors mapped to the stage that raises them and the fix" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Four errors, and the stage each one is really about</title>
  <desc>Each row pairs an error message with the stage that raises it and the change that fixes it. A scaled-value conversion error comes from the LAS writer and needs a wider scale. A missing transformation comes from reprojection and needs the PROJ grids installed. A bad_alloc comes from a buffering stage and needs a smaller chunk_size. A file creation error comes from the GDAL writer and is usually a path or driver option.</desc>
  <rect x="0" y="0" width="720" height="282" fill="var(--dg-bg)" rx="10"/>
  <defs><marker id="fm-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <text x="145" y="52" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">what you see</text>
  <text x="380" y="52" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">where it comes from</text>
  <text x="595" y="52" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">what to change</text>
  <rect x="20" y="64" width="250" height="40" rx="7" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="145" y="89" text-anchor="middle" font-size="11" fill="var(--dg-text)">Unable to convert scaled value</text>
  <rect x="290" y="64" width="180" height="40" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="380" y="89" text-anchor="middle" font-size="11" fill="var(--dg-text)">writers.las</text>
  <rect x="490" y="64" width="210" height="40" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="595" y="89" text-anchor="middle" font-size="11" fill="var(--dg-text)">widen scale_x/y/z in the writer</text>
  <line x1="270" y1="84" x2="284" y2="84" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#fm-arw)"/>
  <line x1="470" y1="84" x2="484" y2="84" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#fm-arw)"/>
  <rect x="20" y="114" width="250" height="40" rx="7" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="145" y="139" text-anchor="middle" font-size="11" fill="var(--dg-text)">No transformation found</text>
  <rect x="290" y="114" width="180" height="40" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="380" y="139" text-anchor="middle" font-size="11" fill="var(--dg-text)">filters.reprojection</text>
  <rect x="490" y="114" width="210" height="40" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="595" y="139" text-anchor="middle" font-size="11" fill="var(--dg-text)">install the PROJ datum grids</text>
  <line x1="270" y1="134" x2="284" y2="134" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#fm-arw)"/>
  <line x1="470" y1="134" x2="484" y2="134" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#fm-arw)"/>
  <rect x="20" y="164" width="250" height="40" rx="7" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="145" y="189" text-anchor="middle" font-size="11" fill="var(--dg-text)">std::bad_alloc</text>
  <rect x="290" y="164" width="180" height="40" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="380" y="189" text-anchor="middle" font-size="11" fill="var(--dg-text)">any buffering stage</text>
  <rect x="490" y="164" width="210" height="40" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="595" y="189" text-anchor="middle" font-size="11" fill="var(--dg-text)">lower chunk_size, tile the input</text>
  <line x1="270" y1="184" x2="284" y2="184" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#fm-arw)"/>
  <line x1="470" y1="184" x2="484" y2="184" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#fm-arw)"/>
  <rect x="20" y="214" width="250" height="40" rx="7" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="145" y="239" text-anchor="middle" font-size="11" fill="var(--dg-text)">Couldn’t create file</text>
  <rect x="290" y="214" width="180" height="40" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="380" y="239" text-anchor="middle" font-size="11" fill="var(--dg-text)">writers.gdal</text>
  <rect x="490" y="214" width="210" height="40" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="595" y="239" text-anchor="middle" font-size="11" fill="var(--dg-text)">check path, driver and nodata</text>
  <line x1="270" y1="234" x2="284" y2="234" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#fm-arw)"/>
  <line x1="470" y1="234" x2="484" y2="234" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#fm-arw)"/>
  <text x="20" y="272" font-size="10.5" fill="var(--dg-muted)">set pipeline.loglevel to 8 and the offending stage names itself in the log before the exception</text>
</svg>

Two execution choices sit above all of this and are covered in their own topics. [Streaming mode execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/) changes what the pipeline holds in memory — points move through in fixed-size chunks, so peak memory stops tracking the file size — and it is available whenever every stage in the chain decides about a point without looking at its neighbours. [Programmable Python filters](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/) cover the opposite case: the rule you need is not a stage at all, and `filters.python` hands your NumPy function the buffer to work on.

## Failure Modes and Debugging

### Schema violations

**Symptom:** `RuntimeError: Unable to find dimension 'Classification'`

**Cause:** A filter upstream removed the dimension, or the reader's point format does not include it.

**Fix:** Inspect `pipeline.metadata` for the reader's declared dimensions, add `filters.ferry` to create the dimension if absent, and check that no upstream filter has `drop_dims` set to include it.

### CRS mismatches

**Symptom:** Output coordinates are in the wrong units (metres vs degrees), or spatial operations produce incorrect bounding boxes.

**Cause:** Missing or incorrect `spatialreference` on the reader; `filters.reprojection` inserted after spatial operations that assumed the target CRS.

**Fix:** Set `spatialreference` explicitly on every reader; insert `filters.reprojection` as the first filter if inputs arrive in mixed projections. See [spatial reprojection](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/) for datum-shift edge cases.

### Out-of-memory kills

**Symptom:** Process killed mid-run with no Python exception; `dmesg` shows OOM killer.

**Cause:** `capacity` too large for available RAM; a buffering filter (e.g., `filters.sort`) materialised the entire dataset.

**Fix:** Reduce `capacity` to 32768; replace `filters.sort` with a tiled workflow; use `--stream` mode where filters support it. [Memory management](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/) covers container-specific settings.

### Pipeline stalls at large tile counts

**Symptom:** File-level parallel job appears to hang; CPU utilisation drops to near zero.

**Cause:** GIL contention when running PDAL inside a Python thread pool (not a process pool); or I/O bottleneck when all workers read from the same spinning disk.

**Fix:** Switch from `ThreadPoolExecutor` to `ProcessPoolExecutor`; distribute tiles across SSD-backed NVMe or read from object storage to separate I/O bandwidth.

### Loglevel and metadata inspection

Set `pipeline.loglevel = 5` for verbose C++ trace output during development. In production, `loglevel = 3` (INFO) captures stage timings and point counts without flooding logs. After execution, inspect `pipeline.metadata` to confirm per-stage point counts are non-zero and that the output CRS matches the expected EPSG code.

The [pipeline filtering logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) guide covers debugging specific filter-chain failures including range predicate mismatches and statistical outlier threshold selection.

---

## Frequently Asked Questions

**Why does PDAL use a pull-based execution model instead of push?**

Pull-based execution means the writer controls flow: it requests a batch only when it is ready to consume one. This backpressure mechanism prevents upstream stages from producing data faster than downstream stages can consume it, keeping the in-flight point count bounded and memory predictable regardless of dataset size.

**Can I run a single PDAL pipeline across multiple CPU cores?**

A single pipeline instance is single-threaded except for stages that internally use OpenMP (notably `filters.smrf` and `filters.pmf`). To use all cores, run independent pipeline processes in parallel — one per spatial tile — using Python's `ProcessPoolExecutor`. See [parallel execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/) for implementation patterns.

**What happens to custom LAS dimensions (extra bytes) when I chain filters?**

Extra bytes dimensions propagate through the pipeline unless a filter explicitly drops them via `drop_dims`. Set `extra_dims=all` on `writers.las` to preserve them in the output. If you need a custom dimension that does not exist in the input, use `filters.ferry` to create it with a default value before passing to filters that expect it.

**How do I process a file that is larger than available RAM?**

Use `--stream` mode: `pdal pipeline --stream pipeline.json`. Stream mode requires all stages to support streaming (most readers, `filters.range`, `filters.reprojection`, `filters.expression`, and `writers.las` do; `filters.sort` does not). In Python, pass `stream=True` to `pipeline.execute()`.

**Should I compress output to LAZ or write uncompressed LAS?**

For final delivery or archival, LAZ (LASzip compression) reduces file size by 70–90% with no precision loss. For iterative development where you re-read outputs multiple times, uncompressed LAS is 2–4× faster to read because it eliminates decompression overhead. Store intermediate tiles as uncompressed LAS; compress only at the final write step.

---

## Related

- [PDAL Stage Chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/) — how to wire readers, filters, and writers into multi-step execution graphs
- [Pipeline Filtering Logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) — applying range predicates, statistical classifiers, and morphological filters
- [Spatial Reprojection](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/) — CRS transformation, datum handling, and PROJ pipeline strings
- [Attribute Mapping](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/) — dimension propagation, extra_dims, and ferry patterns
- [Parallel Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/) — file-level and stage-level strategies for multi-core throughput
- [Memory Management](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/) — capacity tuning, stream mode, and container memory limits
- [Pipeline Validation](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/) — validate-only runs, schema checks, and CI integration
- [Streaming Mode Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/) — chunked execution that bounds peak memory by chunk size rather than file size
- [Programmable Python Filters](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/) — filters.python, for the rule no built-in stage implements
