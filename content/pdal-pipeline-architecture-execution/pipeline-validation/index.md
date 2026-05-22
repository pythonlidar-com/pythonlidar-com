# Pipeline Validation in Python LiDAR & Point Cloud Workflows

Pipeline validation is the systematic verification of point cloud processing configurations before execution. In production-grade Python LiDAR environments, unvalidated pipelines routinely cause silent data corruption, dimension loss, or unbounded memory consumption. For surveying tech teams and infrastructure engineers, a single misconfigured stage can invalidate millions of points, compromise terrain models, or trigger cascading failures in downstream GIS systems. Implementing rigorous validation protocols ensures that every transformation, filter, and spatial operation behaves predictably across heterogeneous datasets.

When integrated into your broader [PDAL Pipeline Architecture & Execution](/pdal-pipeline-architecture-execution/) strategy, validation becomes a proactive quality gate rather than a reactive debugging exercise. This guide establishes a repeatable validation framework tailored to PDAL-driven Python environments, covering schema enforcement, stage dependency resolution, dry-run execution, and output metric verification.

## Prerequisites & Environment Baseline

Before implementing validation routines, ensure your environment meets the following baseline requirements:

* **Python 3.9+** with virtual environment isolation to prevent dependency conflicts
* **PDAL 2.5+** compiled with LAS/LAZ, EPT, and GDAL support
* **`pdal` Python bindings** (`pip install pdal`) for programmatic pipeline control
* **`jsonschema`** for structural validation (`pip install jsonschema`)
* **Sample point cloud data** (`.las`, `.laz`, or `.ept.json`) with known dimensions, classification schemes, and CRS metadata
* **`psutil`** for cross-platform memory and CPU profiling during dry-runs

Validation operates at two distinct layers: static configuration analysis and dynamic execution simulation. Both must pass before a pipeline is promoted to production.

## Core Validation Workflow

### Step 1: JSON Schema & Syntax Verification

PDAL pipelines are defined as JSON arrays containing stage objects. Syntax errors, trailing commas, or invalid key names cause immediate parsing failures that often surface as opaque C++ exceptions. Static validation catches these issues before any backend initialization occurs.

Define a formal JSON schema to enforce required keys (`type`, `inputs`, `filename`, `filters`, `options`) and restrict stage types to the official PDAL registry. This prevents typos like `"reader.las"` instead of `"readers.las"`, which silently bypass execution.

```python
import json
import jsonschema

PDAL_PIPELINE_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "required": ["type"],
        "properties": {
            "type": {"type": "string"},
            "filename": {"type": "string"},
            "inputs": {"type": "array", "items": {"type": "string"}},
            "options": {"type": "object"}
        }
    }
}

def validate_json_syntax(pipeline_json: str) -> bool:
    try:
        pipeline_obj = json.loads(pipeline_json)
        jsonschema.validate(instance=pipeline_obj, schema=PDAL_PIPELINE_SCHEMA)
        return True
    except (json.JSONDecodeError, jsonschema.ValidationError) as e:
        raise ValueError(f"Pipeline schema violation: {e}")
```

For authoritative guidance on structuring PDAL JSON configurations, consult the official [PDAL pipeline documentation](https://pdal.io/pipeline.html).

### Step 2: Stage Dependency & Compatibility Resolution

Each stage in a PDAL pipeline consumes specific input dimensions and produces transformed outputs. Invalid chaining—such as feeding a rasterized output into a point-cloud-only filter, or misaligning CRS definitions between sequential readers—breaks execution or produces geometrically distorted results. Validate that every stage's declared inputs align with the preceding stage's outputs.

This step directly informs robust [PDAL Stage Chaining](/pdal-pipeline-architecture-execution/pdal-stage-chaining/) practices by ensuring dimensional continuity across the processing graph. Programmatically, you can inspect stage metadata to verify that `X`, `Y`, `Z`, and `Intensity` dimensions propagate correctly before heavy computation begins.

```python
import pdal
import subprocess

def check_stage_compatibility(pipeline_json: str) -> dict:
    # PDAL's --validate flag performs dependency graph analysis without reading data
    result = subprocess.run(
        ["pdal", "pipeline", "--validate", "--stdin"],
        input=pipeline_json,
        text=True,
        capture_output=True
    )
    if result.returncode != 0:
        raise RuntimeError(f"Stage dependency failure: {result.stderr}")
    return {"status": "compatible", "details": result.stdout}
```

### Step 3: Filter Logic & Data Type Verification

Filters modify point attributes, classify returns, or remove outliers. Validation must confirm that referenced attributes exist in the input schema, numeric thresholds fall within valid ranges, and classification codes align with ASPRS standards. A common failure mode is applying a `filters.range` operation to a dimension that hasn't been populated yet, which silently drops all points.

Cross-reference your filter parameters against the expected data types and value bounds. When designing complex attribute transformations, align your logic with established [Pipeline Filtering Logic](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) patterns to prevent type coercion errors and unintended point culling.

```python
def verify_filter_bounds(pipeline_json: str) -> None:
    pipeline_obj = json.loads(pipeline_json)
    for stage in pipeline_obj:
        if stage.get("type", "").startswith("filters."):
            opts = stage.get("options", {})
            if "limits" in opts:
                for dim, bounds in opts["limits"].items():
                    if not isinstance(bounds, (list, tuple)) or len(bounds) != 2:
                        raise ValueError(f"Invalid range bounds for {dim}: {bounds}")
                    if bounds[0] > bounds[1]:
                        raise ValueError(f"Lower bound exceeds upper bound for {dim}")
```

### Step 4: Dry-Run Execution & Resource Profiling

Static checks cannot catch runtime memory spikes or I/O bottlenecks. Execute a dry-run against a representative subset of your dataset (e.g., the first 100,000 points) while monitoring system resources. This reveals unbounded memory allocation, inefficient disk swapping, or thread contention before full-scale processing begins.

```python
import psutil
import time

def profile_dry_run(pipeline_json: str, sample_file: str) -> dict:
    # Inject a sample file into the pipeline for testing
    test_pipeline = pipeline_json.replace("INPUT_FILE", sample_file)
    process = psutil.Process()
    mem_start = process.memory_info().rss

    start_time = time.time()
    pipeline = pdal.Pipeline(test_pipeline)
    count = pipeline.execute()
    duration = time.time() - start_time

    mem_peak = process.memory_info().rss
    mem_delta = (mem_peak - mem_start) / (1024 * 1024)

    return {
        "points_processed": count,
        "duration_sec": round(duration, 2),
        "memory_delta_mb": round(mem_delta, 2),
        "memory_warning": mem_delta > 2048  # Flag if >2GB used for sample
    }
```

### Step 5: Output Metric & Spatial Integrity Verification

After a successful dry-run, verify that the output matches expected spatial and statistical baselines. Check bounding box coordinates, point density distributions, CRS preservation, and attribute null rates. A valid pipeline should maintain coordinate precision within tolerance thresholds and preserve the original point count unless explicit thinning filters are applied.

```python
def verify_output_integrity(pipeline: pdal.Pipeline, expected_count: int) -> dict:
    metadata = pipeline.metadata
    bbox = metadata.get("metadata", {}).get("bounds", {})
    actual_count = pipeline.execute()

    integrity_report = {
        "point_count_match": abs(actual_count - expected_count) / expected_count < 0.05,
        "bounds_valid": all(k in bbox for k in ["minx", "maxx", "miny", "maxy"]),
        "crs_preserved": "epsg" in str(metadata).lower() or "wkt" in str(metadata).lower()
    }

    if not all(integrity_report.values()):
        raise AssertionError("Output integrity check failed: spatial or count mismatch detected.")
    return integrity_report
```

## Automating Validation in CI/CD

Embedding validation into continuous integration prevents configuration drift. Wrap the workflow in a `pytest` suite that runs against a curated dataset repository. Use GitHub Actions or GitLab CI to trigger validation on every pull request that modifies pipeline JSON files.

```yaml
# .github/workflows/validate-pipelines.yml
name: Validate PDAL Pipelines
on: [pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Python & PDAL
        run: |
          sudo apt-get install -y libpdal-dev pdal
          pip install pdal jsonschema psutil pytest
      - name: Run Validation Suite
        run: pytest tests/test_pipeline_validation.py -v
```

Pre-commit hooks can also intercept malformed JSON before it reaches version control. By treating pipeline definitions as code, you enforce review standards and maintain an auditable history of configuration changes.

## Common Failure Modes & Mitigation

| Failure Mode | Root Cause | Validation Mitigation |
|--------------|------------|------------------------|
| Silent point truncation | Misconfigured `filters.range` or `filters.outlier` thresholds | Step 3 bound verification + Step 5 count comparison |
| CRS mismatch in output | Missing `filters.reprojection` or invalid EPSG codes | Step 2 dependency check + metadata EPSG validation |
| Memory exhaustion | Unbounded `filters.split` or missing `--threads` limits | Step 4 dry-run profiling with `psutil` thresholds |
| Invalid JSON structure | Manual edits, missing commas, or unsupported keys | Step 1 `jsonschema` enforcement |
| Stage execution order error | Circular dependencies or missing `inputs` arrays | Step 2 `pdal --validate` graph analysis |

## Conclusion

Pipeline validation transforms unpredictable point cloud processing into a deterministic, auditable engineering discipline. By enforcing JSON schema compliance, verifying stage dependencies, profiling memory consumption, and validating output metrics, teams eliminate silent failures before they impact production deliverables. As LiDAR datasets grow in volume and complexity, treating pipeline validation as a mandatory quality gate ensures spatial accuracy, computational efficiency, and long-term system reliability.