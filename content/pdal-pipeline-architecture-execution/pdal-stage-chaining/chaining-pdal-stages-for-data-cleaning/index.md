# Chaining PDAL Stages for Data Cleaning

Chaining PDAL stages for data cleaning involves defining a sequential JSON pipeline where each filter, reader, or writer consumes a point cloud buffer, applies targeted transformations, and passes the modified dataset downstream. In Python, you construct this pipeline as a dictionary or JSON string, pass it to `pdal.Pipeline()`, and execute it entirely in-memory. This linear execution model enables noise removal, elevation clamping, outlier rejection, and classification refinement without writing intermediate files to disk.

### How the Execution Engine Works
PDAL treats point cloud data as a streaming `PointView` buffer. When you submit a pipeline configuration, the C++ backend resolves stage dependencies, allocates memory for standard dimensions (X, Y, Z, Intensity, Classification, ScanAngleRank), and executes stages in strict topological order. Understanding this flow is essential for [PDAL Stage Chaining](/pdal-pipeline-architecture-execution/pdal-stage-chaining/), because stage sequencing directly impacts cleaning accuracy and computational overhead. Spatial indexing must precede statistical filters, geometric bounds should be applied before classification, and metadata extraction should occur after all destructive operations. The [PDAL Pipeline Architecture & Execution](/pdal-pipeline-architecture-execution/) specification details how each stage operates on a mutable view of the point cloud, minimizing unnecessary data copies and optimizing memory throughput.

### Recommended Stage Sequence
A robust cleaning workflow follows a deterministic progression to prevent data loss or filter conflicts:

1. **Reader**: Ingests LAS/LAZ, EPT, or CSV sources. Configure `spatialreference` early to prevent projection mismatches during downstream filtering.
2. **Coordinate Normalization**: Use `filters.reprojection` or `filters.assign` to standardize units and vertical datums before applying geometric constraints.
3. **Geometric Cleaners**: Apply `filters.range` to clamp unrealistic elevation values, scan angles, or intensity thresholds based on sensor specifications.
4. **Statistical & Noise Filters**: Deploy `filters.outlier` (SOR or radius-based) and `filters.statistical` to remove isolated noise points and atmospheric scatter.
5. **Classification Refinement**: Use `filters.assign` or `filters.hag` (Height Above Ground) to normalize elevations relative to terrain and update classification codes.
6. **Writer**: Outputs cleaned LAS/LAZ or returns structured NumPy arrays for downstream analysis in Python.

### Production-Ready Python Implementation
The following snippet demonstrates a complete cleaning chain. It chains an LAS reader, statistical outlier removal, elevation range filtering, classification assignment, and a compressed LAZ writer. The code includes explicit error handling, pipeline validation, and metadata extraction.

```python
import pdal
import numpy as np
import json
import sys

def build_cleaning_pipeline(input_file: str, output_file: str) -> list[dict]:
    """Construct a PDAL pipeline configuration for point cloud cleaning."""
    return [
        {
            "type": "readers.las",
            "filename": input_file,
            "spatialreference": "EPSG:32618"
        },
        {
            "type": "filters.outlier",
            "method": "statistical",
            "mean_k": 10,
            "multiplier": 2.5,
            "tag": "outlier_flag"
        },
        {
            "type": "filters.range",
            "limits": "Z[10:150], ScanAngleRank[-30:30]"
        },
        {
            "type": "filters.assign",
            "assignment": "Classification[:=2]"
        },
        {
            "type": "writers.las",
            "filename": output_file,
            "compression": "true",
            "extra_dims": "all"
        }
    ]

def run_cleaning_pipeline(pipeline_json: list[dict]) -> dict:
    """Execute the PDAL pipeline and return execution metadata."""
    try:
        # PDAL accepts either a list of dicts or a JSON string
        pipeline = pdal.Pipeline(pipeline_json)
        count = pipeline.execute()

        # Capture stage-level logs for debugging
        if pipeline.loglevel > 2:
            print(f"Pipeline warnings/errors: {pipeline.log}")

        metadata = pipeline.metadata
        arrays = pipeline.arrays

        return {
            "points_processed": count,
            "metadata": metadata,
            "array_shape": arrays[0].shape if arrays else (0,),
            "status": "success"
        }
    except pdal.PDALException as e:
        print(f"PDAL execution failed: {e}", file=sys.stderr)
        return {"status": "error", "message": str(e)}
    except Exception as e:
        print(f"Unexpected error: {e}", file=sys.stderr)
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    INPUT_LAS = "raw_survey.las"
    OUTPUT_LAZ = "cleaned_survey.laz"

    pipeline_config = build_cleaning_pipeline(INPUT_LAS, OUTPUT_LAZ)
    result = run_cleaning_pipeline(pipeline_config)

    if result["status"] == "success":
        print(f"Processed {result['points_processed']} points.")
        print(f"Output array shape: {result['array_shape']}")
```

### Key Implementation Notes
- **In-Memory Execution**: `pdal.Pipeline()` compiles the configuration into a C++ execution graph. Calling `.execute()` runs the entire chain without intermediate disk I/O, drastically reducing latency for iterative workflows.
- **Metadata Access**: The `.metadata` property returns a nested dictionary containing stage-specific outputs, bounding boxes, and schema information. This aligns with the [OGC LAS Specification](https://www.ogc.org/standards/las) for standardized point cloud attributes and header validation.
- **NumPy Integration**: The `.arrays` property returns a list of structured NumPy arrays. Each array maps directly to PDAL dimensions, enabling seamless integration with `pyvista`, `open3d`, or `geopandas` for visualization and spatial analysis.
- **Error Handling**: PDAL raises `pdal.PDALException` on malformed JSON, missing files, or invalid filter parameters. Always wrap execution in try/except blocks for production scripts and CI/CD pipelines.

### Memory Management & Chunking
When processing multi-gigabyte LiDAR surveys, memory constraints become the primary bottleneck. PDAL's default behavior loads the entire point cloud into RAM unless explicitly configured otherwise. For large datasets, insert `filters.splitter` early in the chain to divide the point cloud into manageable tiles. You can control tile size using the `length` or `threshold` parameters, which forces PDAL to process chunks sequentially and release memory before moving to the next tile. For distributed environments, consider pairing PDAL with `writers.parquet` to enable columnar compression and parallel query execution. Always validate filter thresholds against your sensor’s native precision; overly aggressive `filters.range` or `filters.outlier` parameters can strip valid edge points, building facades, or vegetation returns.

### Debugging & Validation Strategies
Use `pdal info --schema` to inspect dimension types and ranges before chaining filters. If a stage fails silently or produces unexpected output, enable verbose logging by setting the `PDAL_LOG_LEVEL` environment variable to `debug` or passing `{"log_level": "debug"}` in the pipeline JSON. Verify output integrity by comparing pre- and post-cleaning bounding boxes, point counts, and classification distributions. For automated structural validation, integrate `lasvalidate` or cross-reference outputs against the official [PDAL Pipeline Documentation](https://pdal.io/pipeline.html) to ensure filter compatibility across PDAL versions.

### Conclusion
Chaining PDAL stages for data cleaning provides a deterministic, memory-efficient workflow for LiDAR preprocessing. By respecting topological execution order, leveraging in-memory buffers, and applying targeted filters, engineering teams can transform raw survey data into analysis-ready point clouds without intermediate file overhead. Proper sequencing, chunked processing for large datasets, and rigorous metadata validation ensure consistent results across urban planning, infrastructure modeling, and topographic mapping projects.