---
title: "Memory Management in Python LiDAR & Point Cloud Processing Workflows"
description: "Control RAM usage in Python PDAL pipelines: tile-based ingestion, explicit dtype casting, buffer lifecycle management, and OS-level validation for billion-point LiDAR datasets."
slug: "memory-management"
type: "topic"
breadcrumb: "Memory Management"
datePublished: "2024-06-01"
dateModified: "2026-06-24"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Memory Management in Python LiDAR & Point Cloud Processing Workflows",
      "description": "Control RAM usage in Python PDAL pipelines: tile-based ingestion, explicit dtype casting, buffer lifecycle management, and OS-level validation for billion-point LiDAR datasets.",
      "datePublished": "2024-06-01",
      "dateModified": "2026-06-24",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "PDAL Pipeline Architecture & Execution", "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/"},
        {"@type": "ListItem", "position": 3, "name": "Memory Management", "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "How to Manage Memory in Python PDAL Point Cloud Pipelines",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Profile baseline memory usage with tracemalloc"},
        {"@type": "HowToStep", "position": 2, "name": "Pre-tile large datasets into bounded spatial extents"},
        {"@type": "HowToStep", "position": 3, "name": "Apply explicit NumPy dtype downcasting after pipeline execution"},
        {"@type": "HowToStep", "position": 4, "name": "Release pipeline buffers and invoke gc.collect()"},
        {"@type": "HowToStep", "position": 5, "name": "Validate peak RSS against thresholds using psutil"}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does a 10 GB LAZ file consume 30–50 GB of RAM in Python?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "PDAL decompresses LAZ on read, and the Python bridge materialises every dimension as a NumPy structured array with 64-bit floats by default. Coordinates alone triple in size; add intensity, return number, classification, and GPS time and the in-memory footprint easily exceeds 4× the compressed file size. Explicit dtype downcasting and tile-by-tile ingestion are the primary remedies."
          }
        },
        {
          "@type": "Question",
          "name": "Does PDAL's chunk_size parameter reduce Python-side memory usage?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Not directly. chunk_size controls how many points per I/O batch pass through PDAL's streaming CLI mode (pdal --stream). In the Python API, pipeline.execute() materialises the full result into pipeline.arrays before returning, so total RAM is bounded by the full tile size. You must pre-tile externally to constrain Python-side memory."
          }
        },
        {
          "@type": "Question",
          "name": "When should I use memory-mapped files instead of tile-based processing?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Memory-mapped access (numpy.memmap or readers.ept with EPT format) suits read-heavy analytical workloads where you need random access across the full dataset without mutation. Tile-based processing is preferable when you need to transform, filter, or write output, because in-place mmap mutation is error-prone and OS page-cache eviction is unpredictable under high write pressure."
          }
        }
      ]
    }
  ]
}
</script>

Processing airborne and terrestrial LiDAR datasets routinely involves hundreds of millions to billions of points, each carrying XYZ coordinates, intensity values, [ASPRS classification codes](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/), and return attributes. In Python-based geospatial pipelines, inefficient memory allocation quickly becomes the primary bottleneck — not CPU speed, not network bandwidth. Effective memory management is not a single configuration toggle but a continuous architectural discipline: how data enters the process, how long it persists, what types it occupies, and when the runtime is allowed to reclaim it. This page is part of the [PDAL Pipeline Architecture & Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/) guide, which covers the full execution model, stage design, and production deployment patterns.

## Prerequisites

Before implementing memory-optimised point cloud workflows, confirm your environment meets these baseline requirements:

- **Python 3.10+** with `pdal` Python bindings (`pip install pdal`)
- **PDAL 2.6+** compiled with LAS/LAZ, GeoTIFF, and EPT support
- **NumPy 1.24+** — structured array behaviour changed in earlier versions
- Working knowledge of NumPy array memory layouts, strides, and dtypes
- `psutil` installed (`pip install psutil`) for RSS/VMS monitoring
- A representative LiDAR tile of 50–200 M points for benchmarking
- Familiarity with Python garbage collection and C-extension reference counting
- OS-level monitoring tools (`htop`, `vmstat`) available for spot checks

For accurate in-process tracking, Python's `tracemalloc` module is strongly preferred over `sys.getsizeof()` because it traces allocations at the C-extension level, capturing the true footprint of PDAL's underlying C++ buffers. For background on the file formats driving these sizes, see the [LAS/LAZ file structure](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/) reference.

## Core Memory Architecture

Python's garbage collector and reference counting work efficiently for standard data-science tasks, but they struggle with dense, homogeneous point cloud buffers. When a LAS file is loaded entirely into RAM, the interpreter allocates contiguous memory for every attribute column. A single 10 GB LAZ file can expand to 30–50 GB in memory due to NumPy's default 64-bit float casting and Python object overhead on structured arrays.

PDAL mitigates this through C++-level streaming and block-based processing, but the Python bridge (`pdal.Pipeline`) requires explicit configuration to avoid implicit full-dataset materialisation. Calling `pipeline.execute()` pulls the entire result into `pipeline.arrays` before returning; there is no lazy iterator in the Python API. The practical consequence: the unit of memory control is the **tile**, not the stage.

Sustainable memory management in LiDAR workflows relies on three architectural principles:

1. **Tile-bounded ingestion**: Never load an entire survey into a single NumPy array. Process spatially bounded tiles that fit within available RAM.
2. **Explicit dtype discipline**: Downcast coordinates and attributes to the smallest viable precision immediately after execution. Surveying rarely requires 64-bit floats for relative spatial operations.
3. **Pipeline-driven pre-filtering**: Pair [PDAL stage chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/) with [pipeline filtering logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) so that only the points you need reach the Python boundary.

The diagram below illustrates how peak RAM evolves across a typical tile-processing loop.

<svg viewBox="0 0 760 370" role="img" aria-label="Memory lifecycle diagram for a PDAL tile-processing loop" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:760px;display:block;margin:2rem auto">
  <title>PDAL tile-processing memory lifecycle</title>
  <desc>A filled-area chart showing RAM rising during pipeline.execute(), peaking while the NumPy array is held, dropping after dtype downcasting, and returning to baseline after del pipeline and gc.collect(). Six labelled phases are shown on the x-axis.</desc>
  <!-- axes -->
  <line x1="80" y1="20" x2="80" y2="280" stroke="currentColor" stroke-width="1.5"/>
  <line x1="80" y1="280" x2="740" y2="280" stroke="currentColor" stroke-width="1.5"/>
  <!-- y-axis labels -->
  <text x="74" y="284" text-anchor="end" font-size="12" fill="currentColor">0</text>
  <text x="74" y="220" text-anchor="end" font-size="12" fill="currentColor">8 GB</text>
  <text x="74" y="160" text-anchor="end" font-size="12" fill="currentColor">16 GB</text>
  <text x="74" y="100" text-anchor="end" font-size="12" fill="currentColor">24 GB</text>
  <text x="74" y="40"  text-anchor="end" font-size="12" fill="currentColor">32 GB</text>
  <!-- gridlines -->
  <line x1="80" y1="220" x2="740" y2="220" stroke="currentColor" stroke-width="0.5" stroke-dasharray="4,4" opacity="0.4"/>
  <line x1="80" y1="160" x2="740" y2="160" stroke="currentColor" stroke-width="0.5" stroke-dasharray="4,4" opacity="0.4"/>
  <line x1="80" y1="100" x2="740" y2="100" stroke="currentColor" stroke-width="0.5" stroke-dasharray="4,4" opacity="0.4"/>
  <!-- Phase 1: idle baseline -->
  <rect x="90"  y="260" width="80"  height="20" fill="#4c9be8" opacity="0.85" rx="3"/>
  <!-- Phase 2: execute() ramp -->
  <polygon points="170,260 260,68 260,280 170,280" fill="#4c9be8" opacity="0.85"/>
  <!-- Phase 3: peak hold -->
  <rect x="260" y="68" width="120" height="212" fill="#4c9be8" opacity="0.85"/>
  <!-- Phase 4: dtype downcast drop -->
  <polygon points="380,68 460,130 460,280 380,280" fill="#60b97a" opacity="0.85"/>
  <!-- Phase 5: float32 hold -->
  <rect x="460" y="130" width="100" height="150" fill="#60b97a" opacity="0.85"/>
  <!-- Phase 6: gc.collect() return to baseline -->
  <polygon points="560,130 640,260 640,280 560,280" fill="#60b97a" opacity="0.85"/>
  <!-- Phase 7: idle baseline again -->
  <rect x="640" y="260" width="80"  height="20" fill="#4c9be8" opacity="0.85" rx="3"/>
  <!-- phase x-axis labels (below chart) -->
  <text x="130"  y="306" text-anchor="middle" font-size="11" fill="currentColor">idle</text>
  <text x="215"  y="306" text-anchor="middle" font-size="11" fill="currentColor">execute()</text>
  <text x="320"  y="306" text-anchor="middle" font-size="11" fill="currentColor">arrays held</text>
  <text x="420"  y="306" text-anchor="middle" font-size="11" fill="currentColor">downcast</text>
  <text x="510"  y="306" text-anchor="middle" font-size="11" fill="currentColor">float32 hold</text>
  <text x="600"  y="306" text-anchor="middle" font-size="11" fill="currentColor">gc.collect()</text>
  <text x="680"  y="306" text-anchor="middle" font-size="11" fill="currentColor">idle</text>
  <!-- peak annotation -->
  <line x1="320" y1="68" x2="320" y2="55" stroke="currentColor" stroke-width="1" stroke-dasharray="3,3" opacity="0.6"/>
  <text x="320" y="48" text-anchor="middle" font-size="11" fill="currentColor">peak RSS</text>
  <!-- post-downcast annotation -->
  <line x1="510" y1="130" x2="510" y2="117" stroke="currentColor" stroke-width="1" stroke-dasharray="3,3" opacity="0.6"/>
  <text x="510" y="110" text-anchor="middle" font-size="11" fill="currentColor">~50% saved</text>
  <!-- axis titles -->
  <text x="22" y="160" text-anchor="middle" font-size="12" fill="currentColor" transform="rotate(-90,22,160)">RAM usage</text>
  <text x="410" y="340" text-anchor="middle" font-size="12" fill="currentColor">Processing time →</text>
</svg>

## Execution Lifecycle: 6-Phase Buffer Model

Understanding the lifecycle of a PDAL buffer in Python is necessary before deciding where to intervene:

1. **Pipeline construction** — `pdal.Pipeline(json_list)` validates the stage graph and allocates the PDAL execution context. No point data is loaded yet.
2. **Reader initialisation** — `pipeline.execute()` opens file handles, reads header metadata, and prepares block iterators. Memory starts climbing.
3. **Stage-chain evaluation** — PDAL pulls data through readers → filters → writers in pull-based order. Each stage receives a pointer to the upstream buffer, so well-chained pipelines do not duplicate data internally. See [PDAL stage chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/) for how dimension pointers propagate.
4. **Python bridge materialisation** — On execute() completion, PDAL marshals the resulting buffer into a NumPy structured array. This is the peak allocation event for the Python process.
5. **Application-layer processing** — Your code reads `pipeline.arrays[0]`, performs dtype casting, writes derived outputs, or feeds downstream analytics. This is the window where you control how long peak allocation persists.
6. **Release and reclamation** — Explicit `del pipeline`, `del arrays`, and `gc.collect()` signal Python and C++ to release the buffer. OS memory is returned to the pool (RSS drops) once the C++ destructor fires.

Knowing which phase consumes RAM lets you target interventions precisely: pre-tile before phase 2, downcast during phase 5, and force release at phase 6.

## Full Implementation: Memory-Efficient Tile Processor

The function below processes an entire directory of LAZ tiles with bounded peak RAM. It wraps every phase in the lifecycle above with explicit profiling hooks, typed signatures, structured logging, and error handling.

```python
import gc
import logging
import os
from pathlib import Path

import numpy as np
import pdal
import psutil
import tracemalloc

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

_PROCESS = psutil.Process(os.getpid())


def _rss_mb() -> float:
    """Return current process RSS in megabytes."""
    return _PROCESS.memory_info().rss / 1024**2


def build_filter_pipeline(input_path: str, output_path: str) -> list:
    """Return a PDAL pipeline definition for ground-class extraction with reprojection."""
    return [
        {
            "type": "readers.las",
            "filename": input_path,
        },
        {
            "type": "filters.range",
            "limits": "Classification[2:2]",  # Ground points only
        },
        {
            "type": "filters.reprojection",
            "in_srs": "EPSG:26917",
            "out_srs": "EPSG:4326",
        },
        {
            "type": "writers.las",
            "filename": output_path,
            "compression": "laszip",
            "minor_version": 4,
        },
    ]


def process_tile(input_path: str, output_path: str) -> dict:
    """
    Process a single spatial tile: filter, reproject, write, then release.

    Returns a summary dict with point count and peak RSS (MB).
    """
    tracemalloc.start()
    rss_before = _rss_mb()

    pipeline_def = build_filter_pipeline(input_path, output_path)
    pipeline = pdal.Pipeline(pipeline_def)

    try:
        point_count = pipeline.execute()
        rss_peak_execute = _rss_mb()

        arrays = pipeline.arrays
        if arrays:
            arr = arrays[0]
            # --- dtype downcast: halves memory for coordinate columns ---
            x_f32 = arr["X"].astype(np.float32, copy=False)
            y_f32 = arr["Y"].astype(np.float32, copy=False)
            z_f32 = arr["Z"].astype(np.float32, copy=False)
            rss_after_cast = _rss_mb()
            log.info(
                "Tile %s | points=%d | RSS before=%.1f MB | peak=%.1f MB | after cast=%.1f MB",
                Path(input_path).name,
                point_count,
                rss_before,
                rss_peak_execute,
                rss_after_cast,
            )
            # Discard views immediately — output was already written via writers.las
            del x_f32, y_f32, z_f32, arr, arrays

    except RuntimeError as exc:
        log.error("Pipeline failed for %s: %s", input_path, exc)
        raise
    finally:
        del pipeline
        gc.collect()  # Encourage C++ buffer release between tiles

    _, tracemalloc_peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    return {
        "tile": input_path,
        "point_count": point_count,
        "tracemalloc_peak_mb": tracemalloc_peak / 1024**2,
        "rss_peak_mb": rss_peak_execute,
    }


def process_tile_directory(
    tile_dir: str,
    output_dir: str,
    rss_limit_mb: float = 16_384.0,
) -> list[dict]:
    """
    Process all LAZ tiles in tile_dir, writing results to output_dir.

    Aborts if any single tile exceeds rss_limit_mb peak RSS.
    Returns a list of per-tile summary dicts.
    """
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    tiles = sorted(Path(tile_dir).glob("*.laz"))
    if not tiles:
        raise FileNotFoundError(f"No .laz files found in {tile_dir}")

    results = []
    for i, tile_path in enumerate(tiles, start=1):
        out_path = Path(output_dir) / (tile_path.stem + "_ground_wgs84.laz")
        log.info("Processing tile %d/%d: %s", i, len(tiles), tile_path.name)

        summary = process_tile(str(tile_path), str(out_path))

        if summary["rss_peak_mb"] > rss_limit_mb:
            raise MemoryError(
                f"Tile {tile_path.name} exceeded RSS limit: "
                f"{summary['rss_peak_mb']:.1f} MB > {rss_limit_mb:.1f} MB. "
                "Reduce tile size or lower filter complexity."
            )

        results.append(summary)

    return results
```

## Code Breakdown

### `build_filter_pipeline` — keep the PDAL graph lean

Applying `filters.range` before `filters.reprojection` means only ground-class points are projected, not the full point cloud. Order matters for peak allocation: push the most selective filter first. The [pipeline filtering logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) page covers optimal filter sequencing in detail. Writing directly to LAZ via `writers.las` with `compression: laszip` avoids an intermediate in-memory copy that would occur if you built an output array in Python.

### `process_tile` — phase-accurate profiling

`tracemalloc.start()` is called before `pdal.Pipeline()` construction so the tracer captures even the context-allocation overhead. `_rss_mb()` is sampled at three points — before execution, after `execute()`, and after dtype casting — to produce a three-point profile per tile. This granularity pinpoints whether the bottleneck is in the C++ stage chain or the Python bridge.

The `copy=False` flag on `astype` returns a view when the data is already contiguous in the requested dtype, and a copy only when a conversion is necessary. For a 200 M point tile, this avoids a 1.6 GB allocation when coordinates are already within float32 range.

### `del` and `gc.collect()` in the `finally` block

Python's reference counter will eventually free the pipeline object, but the `finally` block ensures it fires within the loop iteration rather than accumulating across multiple tiles. `gc.collect()` handles any cyclic references between the Python wrapper and the C++ shared pointer, which can delay the destructor call by several seconds on large objects.

## Parameter Reference Table

| Parameter / Setting | Type | Default | Valid range | Memory effect |
|---|---|---|---|---|
| `readers.las` `chunk_size` | int | 1 000 000 | 1 000 – 10 000 000 | Controls streaming batch size in CLI `--stream` mode only; no effect on `pipeline.execute()` |
| `writers.las` `compression` | string | `"none"` | `"none"`, `"laszip"` | `"laszip"` reduces on-disk size 5–7×; no effect on in-memory footprint |
| `numpy.ndarray.astype` `copy` | bool | `True` | `True`, `False` | `False` avoids a duplicate allocation when input dtype matches target |
| `gc.collect()` | — | auto | — | Forces immediate cyclic-reference cleanup; reduces tile-to-tile accumulation |
| `psutil.Process.memory_info().rss` | bytes | — | — | Measures actual physical RAM pages; use this, not VMS, for wall-clock comparisons |
| `tracemalloc` peak | bytes | — | — | Counts Python-side C-extension allocations; more accurate than `sys.getsizeof()` |

## Validation and Data Integrity Checks

After each tile completes, verify the output is geometrically sound before continuing the batch:

```python
import json
import pdal

def validate_tile_output(output_path: str, expected_srs: str = "EPSG:4326") -> None:
    """Assert that the output LAZ has the expected CRS and a non-zero point count."""
    probe = pdal.Pipeline([{"type": "readers.las", "filename": output_path}])
    count = probe.execute()

    if count == 0:
        raise ValueError(f"Output tile {output_path} contains zero points.")

    meta_dict = json.loads(probe.metadata)
    srs = meta_dict.get("metadata", {}).get("readers.las", [{}])[0].get("srs", {}).get("wkt", "")
    if expected_srs not in srs and "WGS 84" not in srs:
        raise ValueError(
            f"CRS mismatch in {output_path}. Expected {expected_srs}, got: {srs[:120]}"
        )

    print(f"Validated {output_path}: {count} points, CRS OK.")
```

Also assert that the dimension schema you expect is present before accessing it:

```python
arr = pipeline.arrays[0]
required_dims = {"X", "Y", "Z", "Classification", "Intensity"}
missing = required_dims - set(arr.dtype.names)
if missing:
    raise KeyError(f"Missing dimensions in pipeline output: {missing}")
```

For [spatial reprojection](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/) stages, perform a coordinate bounding-box sanity check: WGS84 longitudes must lie within −180 to 180, latitudes within −90 to 90. Any value outside these ranges indicates a datum or axis-order error. The [pipeline validation](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/) page covers schema and CRS round-trip checks in greater depth.

## Performance Tuning

### Tile-size vs. peak-RAM trade-off

The most impactful tuning lever is tile footprint. The table below shows representative values for a typical airborne survey at 8 pts/m².

| Tile size | Approx. point count | Peak RSS (float64) | Peak RSS (float32 cast) |
|---|---|---|---|
| 250 × 250 m | 500 K | 0.3 GB | 0.15 GB |
| 500 × 500 m | 2 M | 1.2 GB | 0.6 GB |
| 1 000 × 1 000 m | 8 M | 4.8 GB | 2.4 GB |
| 2 000 × 2 000 m | 32 M | 19.2 GB | 9.6 GB |

For workstations with 32 GB RAM, 1 km × 1 km tiles with float32 downcasting are the practical maximum for single-process pipelines. Larger tiles require distributing work with [parallel execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/), which isolates each tile in a separate subprocess with its own RSS budget.

### Pre-filtering reduces peak before Python sees the data

PDAL filters execute in C++ before data crosses to Python. Applying `filters.range` to extract only ground or building classes before `pipeline.execute()` can reduce the Python-side array by 80–95% on typical surveys. This is the highest-return optimisation available: it costs a few milliseconds of filter time and saves gigabytes of peak allocation.

### OMP thread count and memory pressure

PDAL's multi-threaded filters (notably `filters.smrf` and `filters.pmf`) allocate intermediate per-thread buffers proportional to `OMP_NUM_THREADS`. On memory-constrained systems, reducing the thread count via `export OMP_NUM_THREADS=4` lowers peak memory at the cost of throughput. On systems with many cores and abundant RAM, the default (all logical cores) is optimal.

### Avoid accumulating arrays across tiles

A common anti-pattern is collecting all tile arrays into a Python list before writing:

```python
# AVOID: accumulates ALL tiles in RAM simultaneously
all_arrays = [pipeline.arrays[0] for pipeline in tile_pipelines]
```

Instead, write each tile result to disk inside the processing loop and discard the in-memory array immediately. The `writers.las` stage handles this correctly when included in the pipeline definition.

## Common Errors and Troubleshooting

**`MemoryError: Unable to allocate X GB for array`**
Root cause: A single tile exceeds available RAM before dtype casting can reduce it. Fix: reduce tile footprint by 50% and re-run. Confirm tile size with `readers.las` metadata before executing.

**`pdal.PdalException: writers.las: Error opening file`**
Root cause: Output directory does not exist or the process lacks write permission. Fix: call `Path(output_dir).mkdir(parents=True, exist_ok=True)` before the loop, and verify filesystem permissions.

**`KeyError: 'X'` on `pipeline.arrays[0]`**
Root cause: A `filters.range` expression excluded all points in the tile, returning an empty array with no dimensions. Fix: check `point_count` after `execute()` before accessing `pipeline.arrays`. Guard with `if point_count == 0: continue`.

**RSS does not drop after `gc.collect()`**
Root cause: A reference to `pipeline.arrays` persists in a Python list, dict, or closure in the enclosing scope. Fix: audit all references to the array after the tile loop. Use `del` explicitly on every variable that holds a reference to the structured array or the pipeline object.

**`tracemalloc` peak is much lower than `psutil` RSS**
Root cause: PDAL's C++ allocations are not visible to `tracemalloc` at the Python heap level; they appear in RSS but not in the Python allocator trace. Both measurements are useful: `tracemalloc` tracks Python-object overhead and `psutil` RSS tracks total physical memory including C++ buffers. Use RSS as your capacity-planning number.

## Frequently Asked Questions

**Why does a 10 GB LAZ file consume 30–50 GB of RAM in Python?**

PDAL decompresses LAZ on read, and the Python bridge materialises every dimension as a NumPy structured array with 64-bit floats by default. Coordinates alone triple in size; add intensity, return number, classification, and GPS time and the in-memory footprint easily exceeds 4× the compressed file size. Explicit dtype downcasting and tile-by-tile ingestion are the primary remedies. See the [LAS/LAZ file structure](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/) page for a breakdown of which dimensions carry the most weight.

**Does PDAL's `chunk_size` parameter reduce Python-side memory usage?**

Not directly. `chunk_size` controls how many points per I/O batch pass through PDAL's streaming CLI mode (`pdal --stream`). In the Python API, `pipeline.execute()` materialises the full result into `pipeline.arrays` before returning, so total RAM is bounded by the full tile size. You must pre-tile externally to constrain Python-side memory.

**When should I use memory-mapped files instead of tile-based processing?**

Memory-mapped access (`numpy.memmap` or `readers.ept` with EPT format) suits read-heavy analytical workloads where you need random access across the full dataset without mutation. Tile-based processing is preferable when you need to transform, filter, or write output, because in-place mmap mutation is error-prone and OS page-cache eviction is unpredictable under high write pressure.

---

## Related

- [PDAL Pipeline Architecture & Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/) — parent guide covering the full execution model, stage design, and deployment patterns
- [PDAL Stage Chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/) — how dimension pointers propagate through filter chains without duplication
- [Pipeline Filtering Logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) — optimal filter sequencing to reduce data volume before it reaches the Python boundary
- [Parallel Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/) — subprocess-per-tile strategies that isolate RSS across cores
- [Pipeline Validation](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/) — how to catch schema violations and CRS mismatches before they cause silent data loss
