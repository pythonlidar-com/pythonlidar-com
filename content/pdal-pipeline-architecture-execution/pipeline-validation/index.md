# Pipeline Validation in Python LiDAR & Point Cloud Workflows

Unvalidated PDAL pipelines fail in ways that are difficult to trace: a typo like `"reader.las"` instead of `"readers.las"` produces a cryptic C++ exception, a `filters.range` stage referencing a dimension that does not yet exist silently drops every point, and an unbounded dry-run against a 50 GB regional tile exhausts available memory before a single result is written. Pipeline validation is the systematic process of catching these faults before they corrupt production deliverables. Within the broader [PDAL Pipeline Architecture & Execution](/pdal-pipeline-architecture-execution/) framework, validation is a mandatory quality gate that spans three distinct layers: static JSON structure, stage-level dependency resolution, and runtime resource profiling against a representative data sample.

This guide builds a production-ready validation harness for LiDAR analysts, Python GIS developers, and surveying technology teams who need deterministic, auditable point cloud processing at scale.

## Prerequisites

Before implementing validation routines, confirm your environment meets the following requirements:

- **Python 3.10+** with a dedicated virtual environment to prevent dependency conflicts
- **PDAL 2.5+** compiled with `LAS/LAZ`, `EPT`, and `GDAL` support — verify with `pdal --version`
- **`pdal` Python bindings** installed via `pip install pdal` or `conda install -c conda-forge python-pdal`
- **`jsonschema` 4.0+** for structural JSON enforcement (`pip install jsonschema`)
- **`psutil` 5.9+** for cross-platform memory and CPU profiling (`pip install psutil`)
- **Representative test dataset**: a LAS/LAZ tile from USGS 3DEP or OpenTopography that mirrors your production data (known point count, explicit CRS, populated `Classification` and `Intensity` dimensions)
- **Input CRS known and documented** — validation of spatial operations requires confirming what EPSG authority code the input data carries

A common pitfall is validating against synthetic test data that lacks the dimensional variety found in real acquisitions. Always use a file that matches your production schema: the same LAS point format (e.g., Point Data Record Format 6 for waveform-capable sensors), the same attribute set, and the same approximate point density.

---

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 200" role="img" aria-label="PDAL pipeline validation stages: JSON syntax, stage dependencies, filter parameters, dry-run profiling, output integrity" style="width:100%;height:auto;display:block;margin:1.5rem 0">
  <title>PDAL Pipeline Validation Workflow</title>
  <desc>Five sequential validation phases: JSON Syntax, Stage Dependencies, Filter Parameters, Dry-Run Profiling, Output Integrity. Each phase feeds into the next, with a failure path looping back to fix.</desc>
  <defs>
    <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="currentColor" opacity="0.55"/>
    </marker>
  </defs>
  <!-- Phase boxes -->
  <rect x="8" y="60" width="118" height="56" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.25"/>
  <text x="67" y="82" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace" opacity="0.9">1. JSON</text>
  <text x="67" y="97" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace" opacity="0.9">Syntax</text>
  <text x="67" y="112" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55">jsonschema</text>
  <rect x="148" y="60" width="118" height="56" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.25"/>
  <text x="207" y="82" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace" opacity="0.9">2. Stage</text>
  <text x="207" y="97" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace" opacity="0.9">Dependencies</text>
  <text x="207" y="112" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55">pdal --validate</text>
  <rect x="288" y="60" width="118" height="56" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.25"/>
  <text x="347" y="82" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace" opacity="0.9">3. Filter</text>
  <text x="347" y="97" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace" opacity="0.9">Parameters</text>
  <text x="347" y="112" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55">range / outlier</text>
  <rect x="428" y="60" width="118" height="56" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.25"/>
  <text x="487" y="82" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace" opacity="0.9">4. Dry-Run</text>
  <text x="487" y="97" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace" opacity="0.9">Profiling</text>
  <text x="487" y="112" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55">psutil / sample</text>
  <rect x="568" y="60" width="142" height="56" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.25"/>
  <text x="639" y="82" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace" opacity="0.9">5. Output</text>
  <text x="639" y="97" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace" opacity="0.9">Integrity</text>
  <text x="639" y="112" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55">count / CRS / dims</text>
  <!-- Arrows between boxes -->
  <line x1="126" y1="86" x2="146" y2="86" stroke="currentColor" stroke-width="1.5" opacity="0.45" marker-end="url(#arrowhead)"/>
  <line x1="266" y1="86" x2="286" y2="86" stroke="currentColor" stroke-width="1.5" opacity="0.45" marker-end="url(#arrowhead)"/>
  <line x1="406" y1="86" x2="426" y2="86" stroke="currentColor" stroke-width="1.5" opacity="0.45" marker-end="url(#arrowhead)"/>
  <line x1="546" y1="86" x2="566" y2="86" stroke="currentColor" stroke-width="1.5" opacity="0.45" marker-end="url(#arrowhead)"/>
  <!-- FAIL arc below -->
  <path d="M 639 112 Q 639 160 347 160 Q 55 160 67 112" fill="none" stroke="#b91c1c" stroke-width="1.3" stroke-dasharray="5 3"/>
  <text x="347" y="178" text-anchor="middle" font-size="9" fill="#b91c1c">FAIL → fix and re-validate</text>
  <!-- PASS label -->
  <text x="639" y="148" text-anchor="middle" font-size="10" fill="#15803d" opacity="0.9">PASS → promote</text>
</svg>

---

## Core Validation Workflow

### Phase 1: JSON Schema and Syntax Verification

PDAL pipelines are JSON arrays of stage objects. Syntax errors — trailing commas, invalid key names, incorrect stage name prefixes — cause immediate parsing failures that surface as opaque C++ exceptions with no line reference. Static validation catches these before any backend initialization.

The most common typo in production is writing `"reader.las"` (singular) instead of `"readers.las"` (plural). PDAL's error message for this is a generic "Stage not found" exception that does not identify the offending key. A formal JSON schema check intercepts it in milliseconds:

```python
import json
import jsonschema

PDAL_PIPELINE_SCHEMA = {
    "type": "array",
    "minItems": 2,
    "items": {
        "type": "object",
        "required": ["type"],
        "properties": {
            "type": {
                "type": "string",
                "pattern": "^(readers|filters|writers)\\."
            },
            "filename": {"type": "string"},
            "inputs": {"type": "array", "items": {"type": "string"}}
        }
    }
}

def validate_json_syntax(pipeline_json: str) -> list[dict]:
    """
    Parse and schema-validate a PDAL pipeline JSON string.
    Returns the parsed pipeline list on success; raises ValueError on failure.
    """
    try:
        pipeline_obj = json.loads(pipeline_json)
    except json.JSONDecodeError as exc:
        raise ValueError(f"JSON parse error at line {exc.lineno}: {exc.msg}") from exc

    try:
        jsonschema.validate(instance=pipeline_obj, schema=PDAL_PIPELINE_SCHEMA)
    except jsonschema.ValidationError as exc:
        raise ValueError(f"Pipeline schema violation: {exc.message}") from exc

    return pipeline_obj
```

The `pattern` constraint `^(readers|filters|writers)\\.` rejects both `"reader.las"` and invented stage names, turning a runtime mystery into a clear schema error.

### Phase 2: Stage Dependency and Compatibility Resolution

Each stage in a [PDAL stage chain](/pdal-pipeline-architecture-execution/pdal-stage-chaining/) consumes specific input dimensions and produces transformed outputs. Feeding a rasterized output into a point-cloud-only filter, or applying `filters.smrf` before `filters.reprojection` when the CRS uses geographic coordinates, breaks execution or produces geometrically distorted results.

PDAL exposes a `--validate` flag that checks stage compatibility without reading any point data:

```python
import subprocess

def check_stage_compatibility(pipeline_json: str) -> dict:
    """
    Invoke PDAL's built-in validator to check stage dependencies.
    No data is read; only the pipeline graph is analyzed.
    Raises RuntimeError on incompatibility.
    """
    result = subprocess.run(
        ["pdal", "pipeline", "--validate", "--stdin"],
        input=pipeline_json,
        text=True,
        capture_output=True
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"Stage dependency failure:\n{result.stderr.strip()}"
        )
    return {"status": "compatible", "details": result.stdout.strip()}
```

This check catches ordering violations such as applying a classification-dependent filter (`filters.range` on `Classification[2:2]`) before a ground classification stage has run, or chaining a `writers.gdal` rasterizer before a `filters.reprojection` that operates on point coordinates.

### Phase 3: Filter Parameter Verification

Filters modify point attributes, classify returns, or remove outliers. Validation must confirm that referenced dimensions exist in the input schema and that numeric thresholds fall within valid operational ranges. A `filters.range` stage with an empty `limits` string silently drops all points — no error, no warning, just zero output.

The checks below address the two most commonly misconfigured filter stages:

```python
def verify_filter_stages(pipeline_obj: list[dict]) -> list[str]:
    """
    Scan filter stages for common configuration issues.
    Returns a list of warning strings; empty list means all checks passed.
    """
    warnings: list[str] = []

    for stage in pipeline_obj:
        stage_type = stage.get("type", "")

        if stage_type == "filters.range":
            limits = stage.get("limits", "")
            if not limits:
                warnings.append(
                    "filters.range: 'limits' is empty — all points will be dropped."
                )
            elif not any(op in limits for op in ["[", "("]):
                warnings.append(
                    f"filters.range: 'limits' value '{limits}' lacks interval brackets."
                )

        if stage_type == "filters.outlier":
            method = stage.get("method", "")
            if method not in ("statistical", "radius"):
                warnings.append(
                    f"filters.outlier: 'method' must be 'statistical' or 'radius', got '{method}'."
                )
            mean_k = stage.get("mean_k", 8)
            multiplier = stage.get("multiplier", 2.0)
            if mean_k < 2:
                warnings.append(
                    f"filters.outlier: mean_k={mean_k} is dangerously low; minimum useful value is 4."
                )
            if multiplier <= 0:
                warnings.append(
                    f"filters.outlier: multiplier={multiplier} must be positive."
                )

        if stage_type == "filters.smrf":
            slope = stage.get("slope", 0.15)
            window = stage.get("window", 18.0)
            if slope <= 0 or slope > 1.0:
                warnings.append(
                    f"filters.smrf: slope={slope} is outside the typical range (0.05–0.4)."
                )
            if window < 1.0:
                warnings.append(
                    f"filters.smrf: window={window} m is unusually small for ground filtering."
                )

    return warnings
```

For detailed guidance on how [pipeline filtering logic](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) sequences these stages in production, including dimension propagation and predicate evaluation order, refer to the dedicated filtering workflow guide.

### Phase 4: Dry-Run Execution and Resource Profiling

Static checks cannot catch runtime memory spikes or I/O bottlenecks. Execute the pipeline against a representative sample of your dataset — typically 500,000–1,000,000 points extracted from the target region — while profiling memory consumption. This reveals unbounded allocations, disk-swapping under heavy tiling, or thread contention before full-scale processing begins.

```python
import pdal
import psutil
import time
import logging

logger = logging.getLogger(__name__)

def profile_dry_run(
    pipeline_obj: list[dict],
    sample_file: str,
    memory_limit_mb: float = 2048.0
) -> dict:
    """
    Execute the pipeline against a sample file and measure resource usage.
    The first stage's filename is replaced with sample_file.
    Raises RuntimeError if memory consumption exceeds memory_limit_mb.
    """
    test_pipeline = [dict(stage) for stage in pipeline_obj]
    test_pipeline[0]["filename"] = sample_file

    process = psutil.Process()
    mem_before_mb = process.memory_info().rss / (1024 * 1024)

    t0 = time.perf_counter()
    pipeline = pdal.Pipeline(test_pipeline)
    count = pipeline.execute()
    elapsed = time.perf_counter() - t0

    mem_after_mb = process.memory_info().rss / (1024 * 1024)
    delta_mb = mem_after_mb - mem_before_mb

    result = {
        "points_processed": count,
        "duration_sec": round(elapsed, 3),
        "memory_delta_mb": round(delta_mb, 1),
        "memory_ok": delta_mb <= memory_limit_mb,
        "throughput_kpts_sec": round(count / max(elapsed, 0.001) / 1000, 1),
    }

    if not result["memory_ok"]:
        raise RuntimeError(
            f"Dry-run consumed {delta_mb:.0f} MB on {count:,} sample points, "
            f"exceeding limit of {memory_limit_mb:.0f} MB. "
            "Consider tiling input or reducing chunk_size."
        )

    logger.info(
        "Dry-run passed: %d pts in %.3fs, %.1f MB delta",
        count, elapsed, delta_mb
    )
    return result
```

Dry-run memory warnings are the primary signal that a pipeline needs [memory management](/pdal-pipeline-architecture-execution/memory-management/) intervention — specifically `filters.splitter`-based tiling, reduced `chunk_size` on readers, or selective dimension forwarding to reduce buffer width.

### Phase 5: Output Integrity Verification

After a successful pipeline execution, verify that the output matches expected spatial and statistical baselines. A valid pipeline should maintain point count within tolerance unless explicit thinning filters are applied, preserve CRS metadata, and retain required dimensions (`X`, `Y`, `Z`, `Intensity`, `Classification`, `ReturnNumber`).

```python
import numpy as np

REQUIRED_DIMS = {"X", "Y", "Z", "Intensity", "Classification", "ReturnNumber"}

def verify_output_integrity(
    pipeline: pdal.Pipeline,
    expected_count: int,
    tolerance: float = 0.05,
    required_dims: set[str] | None = None
) -> dict:
    """
    Verify pipeline output after pipeline.execute() has been called.
    Args:
        pipeline:       Executed pdal.Pipeline instance.
        expected_count: Baseline point count to compare against.
        tolerance:      Acceptable fractional deviation (default 5%).
        required_dims:  Set of dimension names that must be present in output.
    Returns:
        Dict with per-check results; raises AssertionError on any failure.
    """
    if required_dims is None:
        required_dims = REQUIRED_DIMS

    arrays = pipeline.arrays
    if not arrays or len(arrays[0]) == 0:
        raise AssertionError("Pipeline produced zero output points.")

    actual_count = len(arrays[0])
    count_ratio = abs(actual_count - expected_count) / max(expected_count, 1)
    count_ok = count_ratio <= tolerance

    output_dims = set(arrays[0].dtype.names or [])
    missing_dims = required_dims - output_dims

    metadata_str = str(pipeline.metadata).lower()
    crs_ok = "epsg" in metadata_str or "wkt" in metadata_str

    report = {
        "actual_count": actual_count,
        "expected_count": expected_count,
        "count_deviation": round(count_ratio, 4),
        "count_ok": count_ok,
        "missing_dims": sorted(missing_dims),
        "dims_ok": len(missing_dims) == 0,
        "crs_ok": crs_ok,
    }

    failures = []
    if not count_ok:
        failures.append(
            f"Point count {actual_count:,} deviates {count_ratio:.1%} "
            f"from expected {expected_count:,} (tolerance {tolerance:.0%})."
        )
    if missing_dims:
        failures.append(f"Missing required dimensions: {sorted(missing_dims)}.")
    if not crs_ok:
        failures.append("No CRS reference found in pipeline metadata.")

    if failures:
        raise AssertionError("Output integrity checks failed:\n" + "\n".join(failures))

    return report
```

## Full Validation Harness

The five phases compose into a single callable function that acts as a pre-flight checklist for any pipeline before it touches production data:

```python
import json
import logging

logger = logging.getLogger(__name__)

def run_full_validation(
    pipeline_json: str,
    sample_file: str,
    expected_point_count: int,
    memory_limit_mb: float = 2048.0,
) -> dict:
    """
    Run all five validation phases for a PDAL pipeline definition.

    Args:
        pipeline_json:        Raw JSON string of the PDAL pipeline array.
        sample_file:          Path to a representative LAS/LAZ sample file.
        expected_point_count: Baseline point count from a reference run.
        memory_limit_mb:      Maximum permissible memory delta during dry-run.

    Returns:
        Consolidated validation report dict.

    Raises:
        ValueError on JSON/schema violations.
        RuntimeError on stage incompatibility or resource over-run.
        AssertionError on output integrity failures.
    """
    report: dict = {}

    # Phase 1: JSON syntax and schema
    logger.info("Phase 1: JSON syntax validation")
    pipeline_obj = validate_json_syntax(pipeline_json)
    report["json_valid"] = True

    # Phase 2: Stage dependency resolution via pdal --validate
    logger.info("Phase 2: Stage dependency check")
    compat = check_stage_compatibility(pipeline_json)
    report["stage_compat"] = compat["status"]

    # Phase 3: Filter parameter audit
    logger.info("Phase 3: Filter parameter verification")
    warnings = verify_filter_stages(pipeline_obj)
    report["filter_warnings"] = warnings
    if warnings:
        for w in warnings:
            logger.warning("Filter warning: %s", w)

    # Phase 4: Dry-run profiling
    logger.info("Phase 4: Dry-run profiling against %s", sample_file)
    import pdal
    dry = profile_dry_run(pipeline_obj, sample_file, memory_limit_mb)
    report["dry_run"] = dry

    # Phase 5: Output integrity
    logger.info("Phase 5: Output integrity verification")
    pipeline_instance = pdal.Pipeline(
        [dict(s) for s in pipeline_obj]
    )
    pipeline_instance[0]["filename"] = sample_file  # inject sample
    pipeline_instance.execute()
    integrity = verify_output_integrity(pipeline_instance, expected_point_count)
    report["integrity"] = integrity

    logger.info("All validation phases passed.")
    return report
```

## Code Breakdown: Key Decisions Explained

**Why `jsonschema` before `pdal --validate`?**
`pdal --validate` initializes the PDAL plugin registry, which takes 200–400 ms on cold start. Running `jsonschema` first filters out trivial syntax errors in under a millisecond, avoiding unnecessary plugin loading for malformed input.

**Why inject a sample file in Phase 4 rather than running against production?**
Production tiles range from 500 MB to multiple gigabytes. Running an unvalidated pipeline against full data risks OOM crashes, partial writes, or corrupted outputs. A 1 M-point sample from the same acquisition reproduces the dimensional variety while keeping resource use bounded.

**Why 5% count tolerance in Phase 5?**
Lossless pipelines (reprojection, attribute assignment) should return exactly the input count. Thinning pipelines (`filters.sample`, `filters.voxelcentroidnearestneighbor`) produce non-deterministic counts. A 5% threshold accepts statistical thinning variance while catching catastrophic over-filtering. Adjust to 0% for lossless-only pipelines.

**Why check for `"epsg"` or `"wkt"` in metadata strings?**
`pipeline.metadata` returns a JSON-serialized dict. CRS information is nested under stage-specific keys that differ between PDAL versions. String-searching for `"epsg"` or `"wkt"` is more robust than navigating the full metadata tree, which changed structure between PDAL 2.4 and 2.6.

## Parameter Reference

| Parameter | Stage | Type | Default | Valid Range | Effect |
|---|---|---|---|---|---|
| `limits` | `filters.range` | string | — | e.g. `Z[0.5:100.0]` | Defines inclusive/exclusive bounds per dimension |
| `method` | `filters.outlier` | string | `statistical` | `statistical`, `radius` | Neighbor search algorithm |
| `mean_k` | `filters.outlier` | int | 8 | 4–50 | Neighbors used for mean distance estimation |
| `multiplier` | `filters.outlier` | float | 2.0 | 0.5–6.0 | Std-dev multiplier for outlier threshold |
| `slope` | `filters.smrf` | float | 0.15 | 0.05–0.4 | Max terrain slope (rise/run) for ground acceptance |
| `window` | `filters.smrf` | float | 18.0 m | 1.0–100.0 | Max window radius for progressive morphological filter |
| `threshold` | `filters.smrf` | float | 0.5 m | 0.1–2.0 | Max elevation difference for ground classification |
| `chunk_size` | `readers.las` | int | 10000 | 1000–100000 | Points per processing block; reduce for memory-constrained runs |
| `forward` | `writers.las` | string | `none` | `all`, `none`, dim list | Which header fields to carry through from the reader |

## Validation and Data Integrity Checks

Beyond the five-phase harness, embed these checks directly into your processing scripts:

```python
import pdal
import numpy as np

def assert_pipeline_output(pipeline: pdal.Pipeline) -> None:
    """
    Quick post-execute assertions suitable for embedding in scripts.
    Call immediately after pipeline.execute().
    """
    arrays = pipeline.arrays
    assert arrays and len(arrays) > 0, "No output arrays — pipeline may have filtered all points."

    arr = arrays[0]
    assert len(arr) > 0, "Output point cloud is empty."

    # Verify canonical spatial dimensions are present and finite
    for dim in ("X", "Y", "Z"):
        assert dim in arr.dtype.names, f"Required dimension '{dim}' missing from output."
        vals = arr[dim]
        assert np.isfinite(vals).all(), f"Non-finite values detected in dimension '{dim}'."

    # Verify CRS round-trip (presence of spatial reference in metadata)
    meta_str = str(pipeline.metadata).lower()
    assert "spatialreference" in meta_str or "epsg" in meta_str, \
        "No spatial reference detected in pipeline metadata — CRS may have been dropped."
```

For pipelines that include [spatial reprojection](/pdal-pipeline-architecture-execution/spatial-reprojection/), add a coordinate bounds check: verify that output `X`/`Y` values fall within the expected geographic or projected extent for the target CRS. A silent datum shift from NAD27 to NAD83 can introduce 20–30 m horizontal error that only manifests when overlaying outputs with reference data.

## Performance Tuning

| Scenario | Bottleneck | Remedy |
|---|---|---|
| Dry-run memory spike >2 GB on 1 M-point sample | Unfiltered dimension forwarding inflating buffer width | Add `"extra_dims": "none"` to writers; drop unused dims with `filters.ferry` |
| `pdal --validate` taking >3 s | Plugin registry scan on slow storage | Pre-warm registry by running `pdal --drivers` once per container startup |
| Phase 5 integrity check fails only on large files | Edge points near tile boundaries dropped by `filters.crop` | Use `filters.crop` with an inset buffer of 0.5–1.0 m and validate with buffered reference count |
| `filters.outlier` removing >15% of points on dense urban scan | `mean_k` too low or `multiplier` too aggressive for building edge points | Increase `mean_k` to 12–20; raise `multiplier` to 3.5 for urban datasets |
| CI/CD validation runs add >2 min to pipeline | Full dry-run on 1 M-point sample in every build | Cache validated pipeline hash; only re-run dry-run when pipeline JSON changes |

For [parallel execution](/pdal-pipeline-architecture-execution/parallel-execution/) environments, run validation on one worker before dispatching the pipeline to a pool. A pipeline that passes validation on a 1 M-point sample can be safely broadcast to a `ProcessPoolExecutor` without per-worker re-validation overhead.

## Automating Validation in CI/CD

Wrap the validation harness in a `pytest` suite that runs against a curated reference dataset stored in your repository. Gate pull requests that modify any pipeline JSON definition on a passing validation run:

```yaml
# .github/workflows/validate-pipelines.yml
name: Validate PDAL Pipelines
on:
  pull_request:
    paths:
      - "pipelines/**/*.json"
      - "tests/test_pipeline_validation.py"

jobs:
  validate:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4

      - name: Install PDAL and Python dependencies
        run: |
          sudo apt-get update -qq
          sudo apt-get install -y libpdal-dev pdal
          pip install pdal jsonschema psutil pytest numpy

      - name: Run pipeline validation suite
        run: pytest tests/test_pipeline_validation.py -v --tb=short
```

Pre-commit hooks can intercept malformed JSON before it reaches version control. Add a hook that runs Phase 1 and Phase 2 on every modified `.json` file in the `pipelines/` directory. This catches the majority of configuration errors at the source, before CI resources are consumed.

## Common Errors and Troubleshooting

**`RuntimeError: Stage not found: reader.las`**
Cause: Stage name typo — singular `reader` instead of plural `readers`. PDAL stage namespaces always use plural prefixes.
Fix: Correct to `readers.las`. Phase 1 schema validation with `^(readers|filters|writers)\\.` pattern catches this before execution.

**`RuntimeError: filters.range: No bounds specified`**
Cause: `"limits"` key present but value is an empty string or omitted.
Fix: Always set a non-empty `limits` value, e.g., `"Classification[2:2]"`. Phase 3 filter parameter check flags empty `limits`.

**`AssertionError: Point count 0 deviates 100.0% from expected 824331`**
Cause: A `filters.range` dimension reference like `Classification[2:2]` applied before ground classification has run — no points carry `Classification == 2` at that stage.
Fix: Reorder pipeline to place `filters.smrf` or `filters.pmf` before any classification-dependent range filter. Phase 2 stage dependency check identifies ordering violations.

**`RuntimeError: Dry-run consumed 3842 MB on 1000000 sample points`**
Cause: Pipeline forwards all extra dimensions (`"extra_dims": "all"`), including waveform data or custom sensor metadata, inflating the per-point buffer from ~40 bytes to 200+ bytes.
Fix: Enumerate only required output dimensions. Use `filters.ferry` to drop high-cardinality extras before the writer. Consult the [memory management](/pdal-pipeline-architecture-execution/memory-management/) guide for `chunk_size` and tiling strategies.

**`AssertionError: No spatial reference detected in pipeline metadata`**
Cause: A `writers.las` stage with `"forward": "none"` was used without an explicit `"a_srs"` parameter, causing the output file to lose its CRS record. Alternatively, an intermediate `filters.reprojection` that uses an invalid EPSG code silently drops the spatial reference.
Fix: Always set `"forward": "header"` or specify `"a_srs": "EPSG:32618"` explicitly in the writer. Validate EPSG codes against the [EPSG registry](https://epsg.org/) and confirm with `pdal info --metadata output.laz | grep spatialreference`.

**`jsonschema.ValidationError: 'reader.las' does not match '^(readers|filters|writers)\\.'`**
Cause: Stage name fails the prefix pattern. This is the most common error caught by Phase 1.
Fix: Check the PDAL stage reference for the correct namespace. All stages use plural prefix: `readers.*`, `filters.*`, `writers.*`.

---

## Related

- [PDAL Pipeline Architecture & Execution](/pdal-pipeline-architecture-execution/) — parent overview: execution model, stage categories, and production deployment patterns
- [PDAL Stage Chaining](/pdal-pipeline-architecture-execution/pdal-stage-chaining/) — orchestrating multi-stage processing graphs with strict buffer-passing semantics
- [Pipeline Filtering Logic](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) — designing predicate sequences, handling dimension propagation, and avoiding over-filtering
- [Spatial Reprojection](/pdal-pipeline-architecture-execution/spatial-reprojection/) — CRS transformation stages that validation must account for when checking metadata integrity
- [Memory Management](/pdal-pipeline-architecture-execution/memory-management/) — tiling, chunking, and dimension-forwarding strategies flagged by dry-run profiling
