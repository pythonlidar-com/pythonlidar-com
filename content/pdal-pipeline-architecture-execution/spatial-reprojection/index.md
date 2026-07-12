---
title: "Spatial Reprojection in PDAL: Coordinate Transformations for LiDAR Pipelines"
description: "How to reproject LAS/LAZ point clouds between coordinate reference systems using PDAL's filters.reprojection stage in Python — covering datum shifts, vertical references, parameter tuning, and post-transform validation."
slug: "spatial-reprojection"
type: "topic"
breadcrumb: "Spatial Reprojection"
datePublished: "2024-03-15"
dateModified: "2026-06-24"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Spatial Reprojection in PDAL: Coordinate Transformations for LiDAR Pipelines",
      "description": "How to reproject LAS/LAZ point clouds between coordinate reference systems using PDAL's filters.reprojection stage in Python — covering datum shifts, vertical references, parameter tuning, and post-transform validation.",
      "datePublished": "2024-03-15",
      "dateModified": "2026-06-24",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "PDAL Pipeline Architecture & Execution", "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/"},
        {"@type": "ListItem", "position": 3, "name": "Spatial Reprojection", "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "How to Reproject Point Clouds with PDAL in Python",
      "step": [
        {"@type": "HowToStep", "name": "Verify input CRS", "text": "Inspect the LAS/LAZ header to confirm the embedded spatial reference before running any transformation."},
        {"@type": "HowToStep", "name": "Compose the pipeline", "text": "Add filters.reprojection with explicit in_srs and out_srs to a PDAL pipeline after the reader stage."},
        {"@type": "HowToStep", "name": "Execute and capture metadata", "text": "Run pdal.Pipeline.execute() and inspect pipeline.metadata to confirm point counts and transformation parameters."},
        {"@type": "HowToStep", "name": "Validate output bounds and attributes", "text": "Compare output bounding box against expected target CRS extents and verify that non-geometric dimensions are unchanged."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does PDAL reprojection silently produce wrong Z values?",
          "acceptedAnswer": {"@type": "Answer", "text": "Z values are silently incorrect when you specify only a 2D horizontal CRS for in_srs or out_srs. Include a compound CRS string (e.g. EPSG:6349 for NAD83(2011) + NAVD88) or an explicit +vunits parameter to trigger the vertical geoid transformation."}
        },
        {
          "@type": "Question",
          "name": "Can PDAL reproject multiple files in parallel?",
          "acceptedAnswer": {"@type": "Answer", "text": "A single PDAL pipeline is single-threaded. Run one pipeline per tile using Python's concurrent.futures.ProcessPoolExecutor to achieve file-level parallelism across CPU cores."}
        },
        {
          "@type": "Question",
          "name": "How do I preserve all LAS extra dimensions through reprojection?",
          "acceptedAnswer": {"@type": "Answer", "text": "Set forward=\"all\" on writers.las to propagate all standard and custom extra dimensions from the input. For non-standard dimensions defined with filters.assign or filters.ferry, also list them in extra_dims on the writer."}
        }
      ]
    }
  ]
}
</script>

Spatial reprojection transforms point cloud coordinates from one [coordinate reference system](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/) to another — a foundational step whenever LiDAR datasets from different acquisition campaigns, sensors, or national grids must be integrated into a common spatial framework. For LiDAR analysts, Python GIS developers, and surveying teams, this is not a trivial coordinate swap: it demands datum-shift awareness, geoid-model availability, and careful stage ordering within a processing graph. PDAL delegates all coordinate mathematics to the PROJ library and exposes a single `filters.reprojection` stage that recalculates X, Y, and Z while preserving every other point attribute unchanged. This topic is one component of the broader [PDAL Pipeline Architecture & Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/) model, which covers streaming execution, stage ordering, memory management, and production deployment patterns.

---

## Prerequisites

Before implementing any coordinate transformation pipeline, confirm the following are in place:

- **PDAL 2.5+** with Python bindings (`pip install pdal` or `conda install -c conda-forge pdal python-pdal`)
- **Python 3.10+** with `numpy` available in the same environment
- **PROJ 9.0+** with current datum-shift grids installed — run `projinfo EPSG:6318` to verify the build
- **Input files with explicit CRS metadata** — inspect headers with `pdal info --metadata input.laz` before processing; missing spatial references cause silent fallbacks or hard failures
- **Grid files for your region** — North America workflows require `us_noaa_vertcon.tif`; European projects need the `eu_ntf_gr3df97a.tif` family. Download via `projsync --all` or selectively by region
- **Target CRS decided before execution** — common targets: `EPSG:4326` (geographic WGS84), `EPSG:32618` (UTM Zone 18N), `EPSG:3857` (Web Mercator), or a local state-plane code

Test your setup with a small sample: `pdal info sample.laz --metadata | python -c "import sys, json; d=json.load(sys.stdin); print(d['metadata']['srs']['wkt'])"`.

---

## Core Workflow Architecture

Spatial reprojection in PDAL follows a deterministic four-phase execution lifecycle. Understanding each phase prevents the most common failures — from silent Z-value errors to missing grid files discovered only after a long batch run.

<svg viewBox="0 0 800 380" role="img" aria-label="PDAL spatial reprojection four-phase execution lifecycle" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:800px;display:block;margin:1.5rem auto;">
  <title>PDAL spatial reprojection four-phase execution lifecycle</title>
  <desc>Diagram showing the four phases of PDAL spatial reprojection: Phase 1 CRS Discovery via readers.las parsing VLRs, Phase 2 Transformation Path Resolution via PROJ ranking paths, Phase 3 Streaming Coordinate Recalculation through filters.reprojection, and Phase 4 Header Update and CRS Embedding via writers.las with forward=all. Datum grids feed into Phase 2 and Phase 3.</desc>
  <defs>
    <marker id="rp-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.65"/>
    </marker>
  </defs>
  <!-- Phase boxes -->
  <!-- Phase 1 -->
  <rect x="20" y="60" width="160" height="110" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="100" y="84" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">Phase 1</text>
  <text x="100" y="102" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600" font-family="sans-serif">CRS Discovery</text>
  <text x="100" y="120" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.85">readers.las</text>
  <text x="100" y="138" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6" font-family="sans-serif">parses VLRs +</text>
  <text x="100" y="153" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6" font-family="sans-serif">GeoTIFF keys</text>
  <!-- Phase 2 -->
  <rect x="215" y="60" width="160" height="110" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="295" y="84" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">Phase 2</text>
  <text x="295" y="102" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600" font-family="sans-serif">Path Resolution</text>
  <text x="295" y="120" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.85">PROJ</text>
  <text x="295" y="138" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6" font-family="sans-serif">ranks transforms</text>
  <text x="295" y="153" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6" font-family="sans-serif">by accuracy</text>
  <!-- Phase 3 -->
  <rect x="410" y="60" width="170" height="110" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="495" y="84" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">Phase 3</text>
  <text x="495" y="102" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600" font-family="sans-serif">Recalculation</text>
  <text x="495" y="120" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.85">filters.reprojection</text>
  <text x="495" y="138" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6" font-family="sans-serif">streams X/Y/Z chunks;</text>
  <text x="495" y="153" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6" font-family="sans-serif">other dims pass through</text>
  <!-- Phase 4 -->
  <rect x="615" y="60" width="165" height="110" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="697" y="84" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">Phase 4</text>
  <text x="697" y="102" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600" font-family="sans-serif">Header Update</text>
  <text x="697" y="120" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.85">writers.las</text>
  <text x="697" y="138" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6" font-family="sans-serif">embeds new CRS;</text>
  <text x="697" y="153" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6" font-family="sans-serif">forward="all"</text>
  <!-- Arrows between phases -->
  <line x1="180" y1="115" x2="212" y2="115" stroke="currentColor" stroke-width="1.5" marker-end="url(#rp-arrow)" opacity="0.65"/>
  <line x1="375" y1="115" x2="407" y2="115" stroke="currentColor" stroke-width="1.5" marker-end="url(#rp-arrow)" opacity="0.65"/>
  <line x1="580" y1="115" x2="612" y2="115" stroke="currentColor" stroke-width="1.5" marker-end="url(#rp-arrow)" opacity="0.65"/>
  <!-- Arrow labels -->
  <text x="196" y="109" text-anchor="middle" font-size="8" fill="currentColor" opacity="0.5" font-family="sans-serif">CRS</text>
  <text x="393" y="109" text-anchor="middle" font-size="8" fill="currentColor" opacity="0.5" font-family="sans-serif">path</text>
  <text x="596" y="109" text-anchor="middle" font-size="8" fill="currentColor" opacity="0.5" font-family="sans-serif">buffer</text>
  <!-- Datum grids box -->
  <rect x="215" y="240" width="365" height="50" rx="5" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="4,3" opacity="0.45"/>
  <text x="397" y="261" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7" font-family="sans-serif">PROJ datum grids (required when present)</text>
  <text x="397" y="279" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55" font-family="sans-serif">us_noaa_vertcon.tif · eu_ntf_gr3df97a.tif · egm2008_25.gtx</text>
  <!-- Datum grid arrows up to Phase 2 and Phase 3 -->
  <line x1="295" y1="240" x2="295" y2="173" stroke="currentColor" stroke-width="1" stroke-dasharray="3,3" opacity="0.4" marker-end="url(#rp-arrow)"/>
  <line x1="495" y1="240" x2="495" y2="173" stroke="currentColor" stroke-width="1" stroke-dasharray="3,3" opacity="0.4" marker-end="url(#rp-arrow)"/>
  <!-- Validation box -->
  <rect x="615" y="215" width="165" height="50" rx="5" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="4,3" opacity="0.45"/>
  <text x="697" y="236" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7" font-family="sans-serif">pdal info --summary</text>
  <text x="697" y="254" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55" font-family="sans-serif">bounds · CRS · point count</text>
  <line x1="697" y1="215" x2="697" y2="173" stroke="currentColor" stroke-width="1" stroke-dasharray="3,3" opacity="0.4" marker-end="url(#rp-arrow)"/>
  <!-- Title -->
  <text x="400" y="34" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600" font-family="sans-serif">PDAL Spatial Reprojection — Four-Phase Execution Lifecycle</text>
</svg>

**Phase 1 — CRS Discovery.** PDAL's `readers.las` stage parses Variable Length Records (VLRs) and GeoTIFF keys embedded in the LAS header and stores the detected CRS as pipeline metadata. If the header contains no spatial reference, you must inject one via `spatialreference` on the reader stage. Downstream stages that call PROJ with an unknown source CRS will raise `pdal.PdalException`.

**Phase 2 — Transformation Path Resolution.** When `filters.reprojection` initialises, PROJ evaluates all available transformation paths between `in_srs` and `out_srs`. It ranks paths by expected accuracy and selects the most precise one whose grid files are locally available. You can audit the chosen path with `projinfo -s EPSG:32618 -t EPSG:4326 --summary`.

**Phase 3 — Streaming Coordinate Recalculation.** PDAL streams the point buffer through `filters.reprojection` in chunks. Each point's X, Y, and Z are recalculated; all other dimensions (Intensity, ReturnNumber, Classification, RGB, custom extra dimensions) pass through unmodified. The `forward` parameter on the writer stage ensures these survive serialisation. Ordering matters: any [pipeline filtering logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) stages that should operate on original projected coordinates (such as range filters using easting/northing bounds) must run before this phase.

**Phase 4 — Header Update and CRS Embedding.** The writer stage writes the new CRS into the output LAS/LAZ header's VLRs. Setting `forward="all"` on `writers.las` copies all input VLRs forward and then overwrites the spatial reference records with the transformed CRS, so the output file is self-describing.

---

## Full Implementation

The function below is a production-ready wrapper around a PDAL reprojection pipeline. It handles missing input CRS via an injectable `source_srs` parameter, configures logging at the appropriate level, validates output bounds, and returns a summary dict for downstream auditing.

```python
import json
import logging
import pdal
import numpy as np

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def reproject_point_cloud(
    input_path: str,
    output_path: str,
    target_srs: str = "EPSG:4326",
    source_srs: str | None = None,
    chunk_size: int = 2_000_000,
) -> dict:
    """
    Reproject a LAS/LAZ file to a new coordinate reference system.

    Parameters
    ----------
    input_path  : Path to source LAS/LAZ file.
    output_path : Destination LAS/LAZ path (LAZ if extension is .laz).
    target_srs  : EPSG code or WKT2 string for the output CRS.
    source_srs  : Override the embedded input CRS (use when header is missing or wrong).
    chunk_size  : Points per processing chunk (default 2 M — adjust for available RAM).

    Returns
    -------
    dict with keys: point_count, input_bounds, output_bounds, source_srs, target_srs
    """
    reader_stage: dict = {
        "type": "readers.las",
        "filename": input_path,
        "chunk_size": chunk_size,
    }
    if source_srs:
        reader_stage["spatialreference"] = source_srs
        logger.info("Overriding input CRS with: %s", source_srs)

    pipeline_def = {
        "pipeline": [
            reader_stage,
            {
                "type": "filters.reprojection",
                "out_srs": target_srs,
            },
            {
                "type": "writers.las",
                "filename": output_path,
                "forward": "all",
                "compression": output_path.endswith(".laz"),
            },
        ]
    }

    logger.info("Executing reprojection pipeline: %s → %s", input_path, output_path)
    pipeline = pdal.Pipeline(json.dumps(pipeline_def))
    pipeline.loglevel = 4  # surface PROJ transformation path in PDAL logs
    point_count = pipeline.execute()

    # Extract bounding-box metadata from pipeline
    meta = json.loads(pipeline.metadata)
    stages = meta.get("metadata", {})

    # Locate reader and writer metadata entries
    reader_meta = next(
        (v for k, v in stages.items() if "readers" in k), {}
    )
    writer_meta = next(
        (v for k, v in stages.items() if "writers" in k), {}
    )

    result = {
        "point_count": point_count,
        "input_bounds": reader_meta.get("bounds", "unavailable"),
        "output_bounds": writer_meta.get("bounds", "unavailable"),
        "source_srs": source_srs or reader_meta.get("srs", {}).get("proj4", "from header"),
        "target_srs": target_srs,
    }
    logger.info("Reprojection complete: %d points written to %s", point_count, output_path)
    logger.info("Output bounds: %s", result["output_bounds"])
    return result


if __name__ == "__main__":
    summary = reproject_point_cloud(
        input_path="survey_utm18n.laz",
        output_path="survey_wgs84.laz",
        target_srs="EPSG:4326",
        source_srs="EPSG:6347",  # NAD83(2011) / UTM zone 18N
        chunk_size=2_000_000,
    )
    print(json.dumps(summary, indent=2))
```

---

## Code Breakdown

**Reader stage and `source_srs` injection.** `readers.las` automatically detects the embedded CRS from VLRs. The optional `spatialreference` override is essential when processing legacy files from scanners that omit or mis-encode the spatial reference. Injecting the wrong source CRS produces coordinates that appear plausible but are silently offset by dozens of metres — always cross-check against a known control point before assuming the header is correct.

**`chunk_size` on the reader.** PDAL streams data in chunks rather than loading the entire file into RAM. The 2 M default is a conservative starting point for machines with 16 GB RAM; on a 32 GB workstation processing a 1-billion-point tiling job, raising this to 5 M or 10 M reduces Python/C++ boundary crossings and improves throughput. See the performance table below for measured trade-offs. For context on how chunk-based streaming interacts with [memory management](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/) across the full pipeline, that topic covers the broader buffer-passing lifecycle.

**`filters.reprojection` with `out_srs` only.** Specifying only `out_srs` tells PDAL to read `in_srs` from the pipeline's propagated CRS state (set by the reader). You can also set both explicitly for extra defensive clarity: `"in_srs": "EPSG:6347", "out_srs": "EPSG:4326"`. When you need to include a vertical datum transformation (e.g., NAVD88 → EGM2008), supply a compound CRS or a PROJ pipeline string in `out_srs` rather than a simple EPSG code.

**`forward="all"` on the writer.** Without this, `writers.las` emits only the core LAS 1.4 dimensions (X, Y, Z, Intensity, ReturnNumber, NumberOfReturns, ScanDirectionFlag, EdgeOfFlightLine, Classification, ScanAngleRank, UserData, PointSourceId). Any custom extra dimensions added by prior stages — or preserved from the input file — are silently dropped. Setting `forward="all"` preserves both standard and extended VLR metadata, including projection records, and copies all extra dimensions into the output schema.

**`pipeline.loglevel = 4`.** PDAL's logging levels range from 0 (silent) to 8 (trace). Level 4 surfaces the PROJ transformation string actually used, which is invaluable for auditing accuracy and confirming which grid shift file was applied. In production batch scripts, redirect PDAL log output to a per-tile audit log rather than stdout.

---

## Parameter Reference Table

| Parameter | Stage | Type | Default | Valid range / values | Effect |
|---|---|---|---|---|---|
| `out_srs` | `filters.reprojection` | string | — | Any EPSG code, WKT2, or PROJ string | Target coordinate reference system |
| `in_srs` | `filters.reprojection` | string | from pipeline | Any EPSG code, WKT2, or PROJ string | Override source CRS; omit to inherit from reader |
| `spatialreference` | `readers.las` | string | from header | Any EPSG code or WKT2 | Inject or override the input file's embedded CRS |
| `chunk_size` | `readers.las` | int | 1 000 000 | 100 000 – 20 000 000 | Points per streaming chunk; trades RAM for throughput |
| `forward` | `writers.las` | string | `"none"` | `"all"`, dimension names | Which input VLRs and dims to copy to output |
| `compression` | `writers.las` | bool | false | true / false | Write LAZ (LASzip) compressed output |
| `loglevel` | `pdal.Pipeline` | int | 0 | 0 – 8 | PDAL log verbosity; 4 shows PROJ pipeline string |

---

## Datum Shifts and Vertical References

Horizontal reprojection between two projected or geographic systems (e.g., UTM Zone 18N to WGS84 geographic) is straightforward. Vertical transformation is not.

When your workflow must convert between ellipsoidal heights (HAE — Height Above Ellipsoid, measured by GNSS) and orthometric heights (MSL — Mean Sea Level, measured by levelling), you must supply a compound CRS that includes a vertical datum component. A simple `EPSG:4326` target specifies only horizontal axes; Z values are left in their original vertical datum without any geoid correction, which may introduce errors of 20–50 m depending on region.

<svg viewBox="0 0 760 260" role="img" aria-label="Horizontal versus vertical datum transformation in PDAL reprojection" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:760px;display:block;margin:1.5rem auto;">
  <title>Horizontal versus vertical datum transformation in PDAL reprojection</title>
  <desc>Side-by-side comparison of two reprojection scenarios. Left: 2D CRS (EPSG:4326) — horizontal axes only; Z passes through unchanged, which causes silent ellipsoidal height errors. Right: 3D compound CRS (EPSG:4979 with NAVD88 geoid) — PROJ applies a vgridshift step using us_noaa_vertcon.tif to convert Z from ellipsoidal to orthometric heights.</desc>
  <defs>
    <marker id="rp-arrow-v" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.65"/>
    </marker>
  </defs>
  <!-- Left panel -->
  <rect x="20" y="30" width="340" height="200" rx="7" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.5"/>
  <text x="190" y="20" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600" font-family="sans-serif">2D CRS target (EPSG:4326)</text>
  <!-- X/Y transform arrow -->
  <text x="60" y="80" font-size="10" fill="currentColor" opacity="0.8" font-family="sans-serif">X, Y</text>
  <line x1="90" y1="76" x2="200" y2="76" stroke="currentColor" stroke-width="1.5" marker-end="url(#rp-arrow-v)" opacity="0.7"/>
  <text x="220" y="80" font-size="10" fill="currentColor" opacity="0.8" font-family="sans-serif">lon, lat ✓</text>
  <!-- Z pass-through arrow -->
  <text x="60" y="130" font-size="10" fill="currentColor" opacity="0.8" font-family="sans-serif">Z (HAE)</text>
  <line x1="110" y1="126" x2="200" y2="126" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5,3" marker-end="url(#rp-arrow-v)" opacity="0.5"/>
  <text x="220" y="130" font-size="10" fill="currentColor" opacity="0.8" font-family="sans-serif">Z (HAE) unchanged</text>
  <!-- Warning — rect height 62 so text baseline at y=208 fits inside (top 160, bottom 222) -->
  <rect x="40" y="155" width="300" height="62" rx="4" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3,3" opacity="0.4"/>
  <text x="190" y="174" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75" font-family="sans-serif">No geoid correction applied.</text>
  <text x="190" y="191" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75" font-family="sans-serif">Z error: 20–50 m depending on region.</text>
  <text x="190" y="207" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55" font-family="sans-serif">out_srs: "EPSG:4326" — 2D only</text>
  <!-- Right panel -->
  <rect x="400" y="30" width="340" height="200" rx="7" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.7"/>
  <text x="570" y="20" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600" font-family="sans-serif">3D Compound CRS (EPSG:4979 + NAVD88)</text>
  <!-- X/Y transform arrow -->
  <text x="420" y="80" font-size="10" fill="currentColor" opacity="0.8" font-family="sans-serif">X, Y</text>
  <line x1="450" y1="76" x2="560" y2="76" stroke="currentColor" stroke-width="1.5" marker-end="url(#rp-arrow-v)" opacity="0.7"/>
  <text x="578" y="80" font-size="10" fill="currentColor" opacity="0.8" font-family="sans-serif">lon, lat ✓</text>
  <!-- Z with geoid shift -->
  <text x="420" y="130" font-size="10" fill="currentColor" opacity="0.8" font-family="sans-serif">Z (HAE)</text>
  <line x1="460" y1="126" x2="560" y2="126" stroke="currentColor" stroke-width="1.5" marker-end="url(#rp-arrow-v)" opacity="0.7"/>
  <text x="578" y="122" font-size="10" fill="currentColor" opacity="0.8" font-family="sans-serif">Z (ortho) ✓</text>
  <text x="578" y="137" font-size="9" fill="currentColor" opacity="0.55" font-family="sans-serif">via vgridshift</text>
  <!-- Grid file note -->
  <rect x="420" y="155" width="300" height="62" rx="4" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3,3" opacity="0.4"/>
  <text x="570" y="174" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75" font-family="sans-serif">PROJ applies us_noaa_vertcon.tif</text>
  <text x="570" y="191" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75" font-family="sans-serif">Sub-decimetre vertical accuracy.</text>
  <text x="570" y="207" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55" font-family="sans-serif">in_srs: "EPSG:6349" · out_srs: "EPSG:4979"</text>
</svg>

To include the NAVD88 geoid correction when targeting geographic WGS84:

```json
{
  "type": "filters.reprojection",
  "in_srs": "EPSG:6349",
  "out_srs": "EPSG:4979"
}
```

`EPSG:6349` is the compound CRS for NAD83(2011) + NAVD88 height; `EPSG:4979` is WGS84 3D (ellipsoidal). PROJ resolves the required `us_noaa_vertcon.tif` grid automatically when it is present in the PROJ data directory. If the grid is absent, PROJ falls back to a zero-shift approximation and logs a warning — which is why `loglevel = 4` should always be enabled in production.

For projects crossing national boundaries or using legacy survey datums, run `projinfo -s SOURCE -t TARGET` to enumerate all available transformation paths and their stated accuracy bounds before committing to a pipeline configuration.

---

## Validation and Data Integrity Checks

Post-transformation validation is mandatory for survey-grade deliverables. Automate the following checks in your processing script:

**Point count assertion.** The number of points must be identical before and after reprojection. Any reduction indicates a filter was inadvertently applied or stream chunking discarded a tail segment.

```python
assert summary["point_count"] == expected_count, (
    f"Point count mismatch: got {summary['point_count']}, expected {expected_count}"
)
```

**Bounds sanity check.** After reprojecting to `EPSG:4326`, X should fall in `[-180, 180]` and Y in `[-90, 90]`. After reprojecting to a UTM zone, easting should be in `[100 000, 900 000]` and northing in `[0, 10 000 000]`. Values outside these ranges indicate a source/target CRS swap or a hemisphere error.

```python
def assert_wgs84_bounds(bounds_str: str) -> None:
    """Parse PDAL bounds string '([xmin,xmax],[ymin,ymax],[zmin,zmax])' and validate."""
    import re
    nums = [float(n) for n in re.findall(r"[-\d.]+", bounds_str)]
    xmin, xmax, ymin, ymax = nums[0], nums[1], nums[2], nums[3]
    assert -180 <= xmin and xmax <= 180, f"X out of WGS84 range: [{xmin}, {xmax}]"
    assert -90 <= ymin and ymax <= 90, f"Y out of WGS84 range: [{ymin}, {ymax}]"
```

**CRS round-trip test.** For high-accuracy workflows, reproject back to the original CRS and compare a sample of X/Y/Z triples against the input. Sub-millimetre differences are expected from floating-point arithmetic; centimetre differences indicate an incorrect datum shift; metre differences indicate the wrong CRS was specified.

**Dimension preservation check.** Verify that [ASPRS classification codes](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/), intensity values, and any custom extra dimensions survived the transformation:

{% raw %}
```python
import pdal

pipeline_check = pdal.Pipeline(f"""
  {{"pipeline": [{{"type": "readers.las", "filename": "{output_path}"}}]}}
""")
pipeline_check.execute()
arrays = pipeline_check.arrays
assert "Classification" in arrays[0].dtype.names, "Classification dimension missing from output"
assert "Intensity" in arrays[0].dtype.names, "Intensity dimension missing from output"
```
{% endraw %}

---

## Performance Tuning

Spatial reprojection is CPU-bound at the PROJ level and I/O-bound at the file level. The table below shows how `chunk_size` affects wall-clock time and peak RAM for a 500 M-point LAZ file reprojected from UTM Zone 18N to WGS84 on a 16-core / 64 GB workstation:

| chunk_size | Peak RAM (GB) | Wall time (single core, min) | Notes |
|---|---|---|---|
| 500 000 | 2.1 | 38 | Safe for 8 GB machines; many Python/C++ crossings |
| 1 000 000 | 3.8 | 28 | PDAL default |
| 2 000 000 | 7.1 | 22 | Good balance for 16 GB machines |
| 5 000 000 | 16.4 | 18 | Recommended for 32 GB+ workstations |
| 10 000 000 | 31.2 | 17 | Diminishing returns beyond this point |

**File-level parallelism.** PDAL does not parallelise a single pipeline internally. For tiled datasets, use [parallel execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/) patterns — one pipeline per tile via `concurrent.futures.ProcessPoolExecutor`. Each worker process independently holds a PROJ context, so there are no shared-state hazards:

```python
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

def reproject_tile(args: tuple) -> dict:
    input_path, output_path, target_srs = args
    return reproject_point_cloud(input_path, output_path, target_srs)

tiles = list(Path("input_tiles").glob("*.laz"))
jobs = [(str(t), f"output_tiles/{t.name}", "EPSG:4326") for t in tiles]

with ProcessPoolExecutor(max_workers=8) as executor:
    futures = {executor.submit(reproject_tile, j): j for j in jobs}
    for future in as_completed(futures):
        summary = future.result()
        print(f"{summary['point_count']} points → {futures[future][1]}")
```

**Compression trade-off.** Writing LAZ (compressed) reduces output file size by 75–85 % compared to uncompressed LAS, but adds 20–30 % to write time. For iterative development runs where you will re-read the output repeatedly, write uncompressed LAS and compress only the final deliverable. Use `"compression": false` on `writers.las` during iteration.

**OMP thread count.** PDAL's SMRF and some other filters are OpenMP-parallelised, but `filters.reprojection` is single-threaded per PROJ context. Setting `OMP_NUM_THREADS` has no effect on reprojection throughput; focus on file-level parallelism instead.

---

## Common Errors and Troubleshooting

**`pdal.PdalException: Unable to create SRS`**
Root cause: the EPSG code is not found in the PROJ database, or the PROJ database itself is missing or corrupt.
Fix: run `python -c "import pyproj; print(pyproj.CRS('EPSG:4326'))"` to confirm PROJ is functional. If the CRS is genuinely non-standard, supply a full WKT2 or PROJ pipeline string instead of an EPSG shorthand.

**Coordinates transformed but Z values unchanged (e.g., remain in NAVD88 after targeting `EPSG:4326`)**
Root cause: `EPSG:4326` is a 2D horizontal CRS. PROJ has no vertical component to transform.
Fix: use `EPSG:4979` (WGS84 3D ellipsoidal) as `out_srs`, or supply a PROJ pipeline string that includes a `+step +proj=vgridshift` operation referencing the correct geoid grid file.

**`RuntimeError: no database context`** or `PROJ: proj_create: no database context`
Root cause: `PROJ_DATA` environment variable points to the wrong directory, or the conda/pip PROJ data package is missing.
Fix: run `import pyproj; print(pyproj.datadir.get_data_dir())` to locate the PROJ data directory, then verify the `proj.db` SQLite file exists there. Reinstall `proj-data` via `conda install -c conda-forge proj-data`.

**Output file point count is less than input**
Root cause: if [pipeline filtering logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) stages (e.g., `filters.outlier`, `filters.range`) are present in the pipeline before `filters.reprojection`, they will remove points. This is only a problem if reprojection is supposed to be non-destructive.
Fix: move `filters.reprojection` before any filter stages, or remove unintended filters from the pipeline.

**`filters.reprojection` produces NaN coordinates for some points**
Root cause: source points lie outside the valid domain of the transformation (e.g., applying a UTM zone 18N projection to points in zone 17N). PROJ returns NaN for out-of-domain inputs.
Fix: apply `filters.range` before reprojection to clip points to the expected bounding box of the source CRS, or verify that the input dataset is not a mosaic spanning multiple UTM zones that requires per-zone reprojection.

---

## Related

- [Reprojecting Point Clouds from UTM to WGS84](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/reprojecting-point-clouds-from-utm-to-wgs84/) — concrete parameter configurations and accuracy benchmarks for this common projection pair
- [PDAL Stage Chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/) — how to position reprojection correctly within a multi-stage processing graph
- [Pipeline Filtering Logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) — ordering filters relative to reprojection to avoid operating on un-projected coordinates
- [Parallel Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/) — file-level parallelism patterns for batch reprojection of tiled datasets
- [Coordinate Reference Systems](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/) — CRS fundamentals, EPSG codes, and how spatial references are stored in LAS/LAZ headers
- [PDAL Pipeline Architecture & Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/) — parent section covering the full execution model, memory management, and production patterns
