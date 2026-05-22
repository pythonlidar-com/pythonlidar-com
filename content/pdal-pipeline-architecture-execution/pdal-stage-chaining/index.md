# PDAL Stage Chaining: Orchestrating Point Cloud Processing in Python

Point cloud processing in production environments rarely operates as a single monolithic operation. Surveying teams, infrastructure engineers, and Python GIS developers routinely require sequential transformations: ingesting raw LAS/LAZ tiles, removing acquisition artifacts, normalizing coordinate systems, computing terrain derivatives, and exporting to optimized spatial formats. **PDAL Stage Chaining** provides the architectural foundation for these multi-step operations. By connecting discrete processing modules into a directed execution graph, engineers can build deterministic, reproducible pipelines that scale from single-tile validation to regional LiDAR campaigns. This methodology sits at the core of [PDAL Pipeline Architecture & Execution](/pdal-pipeline-architecture-execution/), enabling teams to transition from ad-hoc scripting to engineered data workflows.

## Prerequisites & Environment Configuration

Before implementing chained pipelines, ensure your environment meets the following baseline requirements:

- **PDAL 2.5+** compiled with Python bindings (`python-pdal`)
- **Python 3.9+** environment with `numpy` and `json` available
- **Test LiDAR dataset** (USGS 3DEP, OpenTopography, or locally collected TLS/UAV scans)
- **Coordinate Reference System (CRS) awareness** for input and target projections
- **Familiarity with point cloud schemas** (X, Y, Z, Intensity, ReturnNumber, Classification, etc.) as defined in the [ASPRS LAS Specification](https://github.com/ASPRSorg/LAS)
- **Basic JSON syntax proficiency** for pipeline declaration

Install the official Python bindings via `pip install python-pdal` or compile from source if your workflow requires custom GDAL/OGR drivers. The [python-pdal repository](https://github.com/PDAL/python) provides detailed build instructions and environment isolation guidelines for production deployments.

## Core Workflow Architecture

Stage chaining follows a strict buffer-passing model. PDAL allocates an in-memory point buffer, passes it through each declared stage, and serializes the final state to disk or downstream memory. The execution lifecycle unfolds in six deterministic phases:

1. **Pipeline Declaration**: Define the stage sequence in JSON or Python dictionary format.
2. **Anchor Configuration**: Declare `readers.*` and `writers.*` stages to establish I/O boundaries.
3. **Intermediate Insertion**: Place transformation, filtering, and computation stages in execution order.
4. **Schema Validation**: Verify dimension compatibility between consecutive stages to prevent runtime schema violations.
5. **Execution & Buffer Management**: Run the pipeline while monitoring memory allocation and thread utilization.
6. **Metadata Extraction**: Capture execution statistics, point counts, and transformation logs for audit trails.

The order of stages is critical. PDAL evaluates the pipeline array sequentially, meaning spatial operations must occur after coordinate transformations, and classification-dependent filters require ground/vegetation labels to exist beforehand. Misaligned stage ordering frequently triggers `SchemaMismatch` exceptions or silent data truncation. When designing complex workflows, mapping out the data flow against established [Pipeline Filtering Logic](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) prevents downstream bottlenecks and ensures dimensional consistency across the chain.

## Implementation & Code Breakdown

The following Python implementation demonstrates a production-ready chained pipeline. It ingests a compressed LAZ file, applies a statistical outlier filter, reprojects coordinates, classifies ground points, and exports a cleaned LAS file.

```python
import json
import pdal
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

def build_cleaning_pipeline(input_path: str, output_path: str, target_crs: str = "EPSG:32618") -> pdal.Pipeline:
    """
    Constructs and returns a PDAL pipeline for LAZ ingestion, filtering,
    reprojection, ground classification, and export.
    """
    pipeline_dict = [
        {
            "type": "readers.las",
            "filename": input_path,
            "spatialreference": "EPSG:6347"  # Example: USGS 3DEP NAD83(2011) / UTM zone 18N
        },
        {
            "type": "filters.outlier",
            "method": "statistical",
            "mean_k": 10,
            "multiplier": 3.0
        },
        {
            "type": "filters.reprojection",
            "out_srs": target_crs
        },
        {
            "type": "filters.smrf",
            "slope": 0.15,
            "threshold": 0.5,
            "window": 18.0,
            "elevation": 2.0
        },
        {
            "type": "writers.las",
            "filename": output_path,
            "forward": "all",
            "extra_dims": "all"
        }
    ]

    pipeline_json = json.dumps(pipeline_dict)
    return pdal.Pipeline(pipeline_json)

def execute_pipeline(pipeline: pdal.Pipeline) -> dict:
    """Executes the pipeline and returns execution metadata."""
    try:
        count = pipeline.execute()
        logging.info(f"Successfully processed {count} points.")
        return pipeline.metadata
    except RuntimeError as e:
        logging.error(f"Pipeline execution failed: {e}")
        raise

if __name__ == "__main__":
    INPUT_LAZ = "raw_survey_tile.laz"
    OUTPUT_LAS = "processed_survey_tile.las"

    pipe = build_cleaning_pipeline(INPUT_LAZ, OUTPUT_LAS)
    meta = execute_pipeline(pipe)

    # Extract stage-level statistics
    for stage_meta in meta.get("stages", []):
        stage_type = stage_meta.get("name", "unknown")
        point_count = stage_meta.get("count", 0)
        logging.info(f"Stage {stage_type} output: {point_count} points")
```

### Buffer Flow & Execution Lifecycle
The `pdal.Pipeline` object parses the JSON array into a directed acyclic graph (DAG). During `execute()`, PDAL streams data through each node in chunks rather than loading the entire dataset into RAM. This streaming architecture is essential when handling multi-gigabyte regional tiles. Coordinate transformations, such as those handled by `filters.reprojection`, must be positioned before any spatial indexing or ground classification occurs. For teams managing multi-zone projects, reviewing [Spatial Reprojection](/pdal-pipeline-architecture-execution/spatial-reprojection/) ensures that datum shifts and vertical offsets are applied consistently across the chain.

## Schema Validation & Data Integrity

PDAL enforces strict schema propagation between stages. Each stage declares its expected input dimensions and outputs. If a downstream stage requires `Classification` but the upstream stage dropped it, execution halts with a clear schema error. To prevent this, use `forward: "all"` in writer stages or explicitly map dimensions using `filters.assign` or `filters.range`.

When building automated cleaning routines, always validate the pipeline before execution:

```python
pipe.validate()  # Raises pdal.PipelineError if schema or syntax is invalid
```

Schema mismatches often surface during outlier removal or noise stripping. Implementing [Chaining PDAL Stages for Data Cleaning](/pdal-pipeline-architecture-execution/pdal-stage-chaining/chaining-pdal-stages-for-data-cleaning/) establishes repeatable patterns for handling return number filtering, intensity normalization, and classification standardization. Always log `pipeline.schema` after execution to verify that required dimensions (`X`, `Y`, `Z`, `Intensity`, `Classification`, `ReturnNumber`, `NumberOfReturns`) survived the transformation chain intact.

## Performance Optimization & Memory Management

Production LiDAR workflows demand careful resource allocation. PDAL exposes several tuning parameters that directly impact throughput and memory footprint:

- **Chunk Size**: Readers and writers process data in configurable blocks. The default chunk size (typically 10,000–50,000 points) balances memory overhead with I/O efficiency. For dense urban scans, reducing chunk size prevents `std::bad_alloc` crashes.
- **Thread Pool**: PDAL leverages OpenMP for parallel stage execution. Set the `PDAL_NUM_THREADS` environment variable to match available physical cores. Avoid oversubscription, which degrades performance due to context switching.
- **Memory Limits**: Use `--writers.las` with `forward: "false"` when exporting only essential dimensions. Stripping unused attributes (e.g., `UserData`, `ScanAngleRank`) reduces file size by 15–30% and accelerates downstream GIS consumption.
- **Compression Trade-offs**: `readers.las` and `writers.las` support LAZ compression natively. While LAZ reduces storage costs, decompression adds CPU overhead during ingestion. Archive raw data as LAZ, but process in uncompressed LAS when running iterative algorithmic tests.

Monitor pipeline execution with `pipeline.metadata["stages"]` to identify bottlenecks. If a specific stage consistently consumes disproportionate time, isolate it into a standalone pipeline for profiling.

## Production Deployment Patterns

Transitioning from local scripts to enterprise-grade workflows requires standardized validation, logging, and error recovery:

1. **Pipeline Versioning**: Store pipeline JSON definitions in version control alongside processing scripts. Tag releases with dataset versions to guarantee reproducibility.
2. **CI/CD Validation**: Integrate `pdal info` and `pdal pipeline --validate` into GitHub Actions or GitLab CI. Catch syntax errors and schema drift before deployment.
3. **Graceful Degradation**: Wrap `pipeline.execute()` in retry logic with exponential backoff for transient I/O failures. Log partial outputs when processing fails mid-stream to avoid full re-runs.
4. **Audit Trails**: Extract `pipeline.metadata["stats"]` and write to a centralized logging database. Track point counts before/after filtering, CRS transformations applied, and execution duration per tile.

For large-scale campaigns, partition regional extents into tile grids using `filters.splitter` or external tiling utilities. Process tiles independently, then merge outputs with `filters.merge` or `writers.ogr` for seamless regional mosaics.

## Conclusion

PDAL Stage Chaining transforms fragmented point cloud operations into reliable, auditable data pipelines. By adhering to strict buffer-passing semantics, validating schemas between stages, and optimizing chunk/thread parameters, engineering teams can process terabytes of LiDAR data with predictable performance. The methodology scales effortlessly from single-site UAV surveys to statewide infrastructure inventories, providing a consistent foundation for automated spatial data engineering. As point cloud standards evolve and sensor densities increase, mastering chained pipeline architecture remains essential for delivering high-fidelity geospatial products at scale.