---
title: "Parallel Execution in PDAL: Multi-Core Point Cloud Processing with Python"
description: "Distribute PDAL-driven LiDAR workflows across all CPU cores using Python's ProcessPoolExecutor — covering fan-out architecture, boundary-safe tiling, error recovery, and memory-aware tuning."
slug: "parallel-execution"
type: "topic"
breadcrumb: "Parallel Execution"
datePublished: "2024-03-15"
dateModified: "2026-06-24"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Parallel Execution in PDAL: Multi-Core Point Cloud Processing with Python",
      "description": "Distribute PDAL-driven LiDAR workflows across all CPU cores using Python's ProcessPoolExecutor — covering fan-out architecture, boundary-safe tiling, error recovery, and memory-aware tuning.",
      "datePublished": "2024-03-15",
      "dateModified": "2026-06-24",
      "author": { "@type": "Organization", "name": "pythonlidar.com" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pythonlidar.com/" },
        { "@type": "ListItem", "position": 2, "name": "PDAL Pipeline Architecture & Execution", "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/" },
        { "@type": "ListItem", "position": 3, "name": "Parallel Execution", "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/" }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Run PDAL point cloud pipelines in parallel with Python",
      "step": [
        { "@type": "HowToStep", "name": "Validate the base pipeline for a single tile", "text": "Confirm the sequential pipeline executes cleanly for one tile before introducing concurrency." },
        { "@type": "HowToStep", "name": "Build a tile manifest", "text": "Scan the input directory, filter by .las/.laz extension, and sort files largest-first to minimise straggler delay." },
        { "@type": "HowToStep", "name": "Serialise the pipeline template per worker", "text": "Deep-copy the base pipeline JSON for each task and inject per-tile input/output paths so each worker is fully isolated." },
        { "@type": "HowToStep", "name": "Dispatch to ProcessPoolExecutor", "text": "Submit all tasks to a ProcessPoolExecutor so each worker spawns its own OS process with an independent PDAL C++ runtime, bypassing the GIL." },
        { "@type": "HowToStep", "name": "Collect and validate results", "text": "Use as_completed() to log each result immediately, detect partial failures, and validate output point counts and CRS before merging." }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why use ProcessPoolExecutor instead of ThreadPoolExecutor for PDAL?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "PDAL's Python bindings execute C++ code that holds the GIL during point buffer transfers. ThreadPoolExecutor workers share one GIL, so only one thread can call into PDAL at a time. ProcessPoolExecutor spawns separate OS processes, each with its own GIL, enabling genuine simultaneous PDAL execution across all cores."
          }
        },
        {
          "@type": "Question",
          "name": "How many parallel workers should I use for PDAL tile processing?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Start with max_workers equal to your physical (not hyperthreaded) core count. Point cloud processing is memory-bandwidth intensive; adding logical cores beyond the physical count typically increases L3 cache evictions and slows throughput. Monitor RSS per worker and reduce max_workers if total RSS approaches available RAM."
          }
        },
        {
          "@type": "Question",
          "name": "How do I prevent seam artifacts at tile boundaries in parallel PDAL runs?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Configure filters.splitter with a buffer parameter (typically 0.5–2.0 metres) so overlapping tiles are emitted. Each worker receives an overlap zone that prevents edge effects in ground classification and outlier removal. Strip the buffer with filters.crop in the output stage of each worker pipeline before aggregation."
          }
        },
        {
          "@type": "Question",
          "name": "How do I resume a parallel PDAL run after a partial failure?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Check for the existence of the output file at the start of the worker function and return early if it already exists and has a non-zero size. This makes the workflow idempotent: re-running with the full manifest will skip completed tiles and only process those that are missing or zero-byte."
          }
        }
      ]
    }
  ]
}
</script>

Point cloud datasets routinely exceed tens of gigabytes, and processing them one tile at a time turns overnight batch jobs into multi-day bottlenecks. This page explains how to distribute PDAL-driven workloads across all available CPU cores using Python's `ProcessPoolExecutor`, covering the worker dispatch architecture, boundary-safe spatial tiling, deterministic error handling, and memory-aware tuning. These techniques operate within the broader [PDAL Pipeline Architecture & Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/) model, which explains how PDAL stages chain, buffer, and write point data. If you need to push beyond a single machine, [Optimizing PDAL for Multi-Core Processing](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/optimizing-pdal-for-multi-core-processing/) covers cache-aware chunking and NUMA-binding strategies.

## Prerequisites

Confirm the following before introducing concurrency into any point cloud workflow. A fragile sequential pipeline will fail non-deterministically when replicated across multiple workers.

- **PDAL 2.6+** compiled with Python bindings (`pip install pdal` or `conda install -c conda-forge python-pdal`)
- **Python 3.10+** with `concurrent.futures`, `multiprocessing`, `pathlib`, and `logging` in the standard library
- **Pre-tiled or pre-chunked input data** — LAS/LAZ files or EPT tiles where each file is spatially independent; avoid shared mutable input sources
- **Validated base pipeline** that executes cleanly for a single tile in isolation before parallelization
- **Minimum 16 GB RAM** per concurrent worker for municipal-scale datasets (32–64 GB recommended for tiles exceeding 50 million points)
- **Filesystem without aggressive locking** — local NVMe, Lustre, or GPFS for production; CIFS/SMB network mounts are not suitable

Verify your PDAL installation and pipeline schema before scaling:

```python
import pdal, json

pipeline_json = json.dumps({
    "pipeline": [
        {"type": "readers.las", "filename": "test_tile.laz"},
        {"type": "writers.las", "filename": "test_out.laz"}
    ]
})
p = pdal.Pipeline(pipeline_json)
p.execute()
print("Points read:", p.metadata["metadata"]["readers.las"][0]["count"])
```

## Core Workflow Architecture

Parallel point cloud processing follows a fan-out / fan-in model: a coordinator discovers and manifests all input tiles, dispatches each tile to an isolated worker process running its own PDAL instance, and then aggregates results once all workers complete. The diagram below shows this three-phase structure.

<svg viewBox="0 0 780 340" role="img" aria-label="Fan-out fan-in parallel PDAL workflow diagram" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:780px;display:block;margin:1.5rem auto">
  <title>Fan-out / fan-in parallel PDAL workflow</title>
  <desc>A coordinator node fans out to four independent PDAL worker processes, each processing a separate LiDAR tile, and then fans back into a single aggregation step that merges outputs.</desc>
  <defs>
    <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- Coordinator box -->
  <rect x="10" y="135" width="150" height="70" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="85" y="164" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" fill="currentColor" font-weight="600">Coordinator</text>
  <text x="85" y="180" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" fill="currentColor">Tile manifest</text>
  <text x="85" y="194" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" fill="currentColor">+ pipeline template</text>
  <!-- Fan-out arrows -->
  <line x1="160" y1="152" x2="268" y2="55" stroke="currentColor" stroke-width="1.2" marker-end="url(#arrowhead)" opacity="0.7"/>
  <line x1="160" y1="161" x2="268" y2="130" stroke="currentColor" stroke-width="1.2" marker-end="url(#arrowhead)" opacity="0.7"/>
  <line x1="160" y1="179" x2="268" y2="205" stroke="currentColor" stroke-width="1.2" marker-end="url(#arrowhead)" opacity="0.7"/>
  <line x1="160" y1="188" x2="268" y2="280" stroke="currentColor" stroke-width="1.2" marker-end="url(#arrowhead)" opacity="0.7"/>
  <!-- Worker boxes (each 56px tall, spaced 75px apart: y=30,105,180,255) -->
  <rect x="270" y="30" width="210" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="375" y="52" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="currentColor" font-weight="600">Worker 1</text>
  <text x="375" y="68" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" fill="currentColor">readers.las → filters → writers.las</text>
  <rect x="270" y="105" width="210" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="375" y="127" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="currentColor" font-weight="600">Worker 2</text>
  <text x="375" y="143" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" fill="currentColor">readers.las → filters → writers.las</text>
  <rect x="270" y="180" width="210" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="375" y="202" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="currentColor" font-weight="600">Worker 3</text>
  <text x="375" y="218" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" fill="currentColor">readers.las → filters → writers.las</text>
  <rect x="270" y="255" width="210" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="375" y="277" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="currentColor" font-weight="600">Worker 4</text>
  <text x="375" y="293" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" fill="currentColor">readers.las → filters → writers.las</text>
  <!-- Fan-in arrows -->
  <line x1="480" y1="56" x2="578" y2="152" stroke="currentColor" stroke-width="1.2" marker-end="url(#arrowhead)" opacity="0.7"/>
  <line x1="480" y1="131" x2="578" y2="161" stroke="currentColor" stroke-width="1.2" marker-end="url(#arrowhead)" opacity="0.7"/>
  <line x1="480" y1="206" x2="578" y2="179" stroke="currentColor" stroke-width="1.2" marker-end="url(#arrowhead)" opacity="0.7"/>
  <line x1="480" y1="281" x2="578" y2="188" stroke="currentColor" stroke-width="1.2" marker-end="url(#arrowhead)" opacity="0.7"/>
  <!-- Aggregation box -->
  <rect x="580" y="135" width="185" height="70" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="672" y="164" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" fill="currentColor" font-weight="600">Aggregation</text>
  <text x="672" y="180" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" fill="currentColor">Merge LAZ tiles /</text>
  <text x="672" y="194" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" fill="currentColor">validate outputs</text>
</svg>

The execution lifecycle unfolds in five phases:

1. **Tile discovery and manifest generation** — scan directories or EPT catalogs to enumerate independent processing units, filter by extension, and optionally sort by file size for load balancing.
2. **Pipeline serialization and path injection** — deep-copy the base pipeline JSON for each task, substituting input and output file paths so each worker receives a fully self-contained, isolated definition.
3. **GIL bypass via process isolation** — dispatch tasks to `ProcessPoolExecutor` so each worker spawns a separate OS process with its own PDAL C++ heap, bypassing Python's Global Interpreter Lock entirely.
4. **Boundary management** — configure overlap buffers in `filters.splitter` or `filters.crop` to prevent seam artifacts at tile edges; strip overlaps during aggregation.
5. **Result validation and aggregation** — reconcile point counts, verify bounding boxes, and merge outputs into a coherent mosaic or COPC index.

## Full Implementation

The following implementation handles tile dispatch, per-worker isolation, structured logging, and partial-failure recovery. Copy this into your project and adjust `max_workers` and `overlap_m` to match your hardware.

```python
import json
import os
import logging
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
from typing import List, Dict, Any

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(process)d | %(message)s"
)

PIPELINE_TEMPLATE: Dict[str, Any] = {
    "pipeline": [
        {
            "type": "readers.las",
            "filename": "__INPUT__",
            "use_eb_vlr": True
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
            "threshold": 0.5,
            "scalar": 1.25
        },
        {
            "type": "writers.las",
            "filename": "__OUTPUT__",
            "compression": True,
            "a_srs": "EPSG:32632"
        }
    ]
}


def build_manifest(input_dir: str, extensions: tuple = (".las", ".laz")) -> List[Path]:
    """Scan a directory and return sorted tile paths, largest files first."""
    tiles = [
        p for p in Path(input_dir).rglob("*")
        if p.suffix.lower() in extensions and p.stat().st_size > 0
    ]
    return sorted(tiles, key=lambda p: p.stat().st_size, reverse=True)


def process_tile(tile_path: str, pipeline_template: Dict[str, Any], output_dir: str) -> Dict[str, Any]:
    """
    Execute a single PDAL pipeline for one tile.
    Returns a result dict so the coordinator can report per-tile outcomes.
    """
    import pdal  # imported inside worker to avoid pickling issues

    out_name = Path(tile_path).stem + "_proc.laz"
    out_path = str(Path(output_dir) / out_name)

    # Skip already-processed tiles to make the workflow idempotent
    if Path(out_path).exists() and Path(out_path).stat().st_size > 1024:
        logging.info("SKIP (exists) %s", tile_path)
        return {"tile": tile_path, "output": out_path, "points": -1, "ok": True}

    # Deep-copy prevents mutation across worker restarts
    pipeline_def = json.loads(json.dumps(pipeline_template))
    pipeline_def["pipeline"][0]["filename"] = tile_path
    pipeline_def["pipeline"][-1]["filename"] = out_path

    try:
        p = pdal.Pipeline(json.dumps(pipeline_def))
        p.execute()
        point_count = p.metadata["metadata"]["readers.las"][0]["count"]
        logging.info("OK  %s  →  %d pts", tile_path, point_count)
        return {"tile": tile_path, "output": out_path, "points": point_count, "ok": True}
    except RuntimeError as exc:
        logging.error("FAIL %s: %s", tile_path, exc)
        return {"tile": tile_path, "output": None, "points": 0, "ok": False, "error": str(exc)}


def run_parallel_workflow(
    input_dir: str,
    output_dir: str,
    pipeline_template: Dict[str, Any] = PIPELINE_TEMPLATE,
    max_workers: int = 4,
) -> None:
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    manifest = build_manifest(input_dir)
    logging.info("Dispatching %d tiles across %d workers", len(manifest), max_workers)

    results = []
    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(process_tile, str(t), pipeline_template, output_dir): t
            for t in manifest
        }
        for future in as_completed(futures):
            try:
                results.append(future.result())
            except Exception as exc:
                tile = futures[future]
                logging.error("Unhandled exception for %s: %s", tile, exc)
                results.append({"tile": str(tile), "ok": False, "error": str(exc)})

    ok = sum(1 for r in results if r["ok"])
    total_pts = sum(r.get("points", 0) for r in results if r.get("points", 0) > 0)
    logging.info(
        "Complete — %d/%d tiles OK, %d total points written",
        ok, len(manifest), total_pts
    )
    failed = [r["tile"] for r in results if not r["ok"]]
    if failed:
        logging.warning("Failed tiles:\n  %s", "\n  ".join(failed))


if __name__ == "__main__":
    run_parallel_workflow(
        input_dir="/data/lidar/raw_tiles",
        output_dir="/data/lidar/processed",
        max_workers=6
    )
```

## Code Breakdown

**`build_manifest`** sorts tiles largest-first so the longest-running jobs start immediately, minimising the straggler effect where a single large tile delays the entire batch after all smaller tiles finish.

**`process_tile` imports `pdal` inside the function body.** Importing PDAL at module level would require the `pdal` module to be picklable across process boundaries; importing it inside the worker function sidesteps serialization entirely and guarantees each worker initialises its own PDAL C++ runtime.

**Idempotent skip check** — the early-return guard on `out_path` lets you safely re-run the workflow after a hardware failure or quota limit without reprocessing completed tiles. Only tiles with a missing or zero-byte output file are dispatched.

**Deep-copy via `json.loads(json.dumps(...))`** creates a fully independent pipeline dictionary per call. Mutating a shared template dict — even accidentally — would cause race conditions when multiple workers reference the same object during startup.

**`as_completed()` versus `executor.map()`** — `as_completed()` lets you log each result immediately, retry individual failures, and avoid blocking until the slowest tile finishes. `executor.map()` buffers all results and re-raises the first exception, which hides partial successes in batch runs.

**Structured result dicts** make it straightforward to build a retry loop: filter `results` for `ok == False`, rebuild a manifest from failed tiles, and call `run_parallel_workflow` again with the subset.

The pipeline template writes to `EPSG:32632` (UTM Zone 32N). Replace with the EPSG code appropriate for your survey area before production use. Understanding how [spatial reprojection](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/) interacts with PDAL's CRS metadata is essential when combining tiles from multiple acquisition zones.

## Parameter Reference Table

| Parameter | Stage | Type | Default | Recommended range | Effect |
|---|---|---|---|---|---|
| `max_workers` | Python executor | int | 4 | physical core count | Controls OS-level process parallelism; exceeding physical cores triggers cache thrashing |
| `chunk_size` | readers.las | int | 1,000,000 | 500,000 – 2,000,000 | Points loaded per I/O block; larger values reduce syscall overhead but raise peak RAM |
| `mean_k` | filters.outlier | int | 8 | 8 – 20 | Neighbourhood size for statistical outlier removal; higher = fewer false positives |
| `multiplier` | filters.outlier | float | 2.0 | 2.0 – 3.5 | Standard-deviation threshold; lower removes more noise but risks clipping valid returns |
| `slope` | filters.smrf | float | 0.15 | 0.05 – 0.30 | Maximum terrain slope fraction; increase for hilly terrain |
| `window` | filters.smrf | float | 18.0 | 5.0 – 33.0 | Maximum window size in metres for ground surface extraction |
| `threshold` | filters.smrf | float | 0.5 | 0.1 – 1.0 | Object height threshold in metres above provisional ground surface |
| `compression` | writers.las | bool | False | True for production | Writes LAZ (LASzip) output; reduces disk I/O at the cost of ~5 % CPU per worker |
| `buffer` | filters.splitter | float | 0.0 | 0.5 – 2.0 | Overlap buffer at tile boundaries; prevents ground-filter edge artifacts |

Setting `OMP_NUM_THREADS` to your physical core count before launching the script prevents SMRF's OpenMP loops from over-subscribing the CPU when multiple workers run simultaneously:

```bash
export OMP_NUM_THREADS=6
python workflow.py
```

## Validation and Data Integrity Checks

After a parallel run, verify outputs programmatically before merging tiles into a final product.

```python
from pathlib import Path
import pdal, json

def validate_tile(path: str, expected_crs_auth: str = "EPSG", expected_crs_code: int = 32632) -> bool:
    """Check point count > 0, CRS matches expectation, and Classification dimension exists."""
    meta_pipeline = json.dumps({
        "pipeline": [
            {"type": "readers.las", "filename": path, "count": 0}
        ]
    })
    p = pdal.Pipeline(meta_pipeline)
    p.execute()
    meta = p.metadata["metadata"]["readers.las"][0]

    point_count = meta.get("count", 0)
    if point_count == 0:
        print(f"WARN: {path} has 0 points")
        return False

    srs = meta.get("srs", {}).get("proj4", "")
    if str(expected_crs_code) not in srs:
        print(f"WARN: {path} CRS mismatch — {srs}")
        return False

    dims = {d["name"] for d in meta.get("dimensions", [])}
    if "Classification" not in dims:
        print(f"WARN: {path} missing Classification dimension")
        return False

    return True

output_dir = Path("/data/lidar/processed")
tiles = list(output_dir.glob("*_proc.laz"))
passed = sum(1 for t in tiles if validate_tile(str(t)))
print(f"Validation: {passed}/{len(tiles)} tiles passed")
assert passed == len(tiles), "One or more output tiles failed validation"
```

A bounding-box check can catch silent coordinate corruption: compare the union of all output bounding boxes against the known survey extent. Use `pipeline.metadata["metadata"]["readers.las"][0]["bounds"]` for each tile — it returns an object with `minx`, `miny`, `maxx`, `maxy` keys. See [pipeline validation](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/) for systematic schema and metadata verification patterns.

## Performance Tuning

Parallel point cloud processing is usually I/O- or memory-bound rather than CPU-bound. The table below shows the primary knobs and their trade-offs.

| Bottleneck | Symptom | Remedy |
|---|---|---|
| I/O saturation | Workers idle while reads/writes queue | Reduce `max_workers`; use NVMe local storage; enable LAZ compression to halve write volume |
| Memory pressure | OOM kills in kernel logs | Reduce `chunk_size`; lower `max_workers`; switch to streaming EPT source |
| CPU under-use | Core utilisation < 60 % between I/O bursts | Increase `max_workers` up to physical core count; pre-sort tiles by size |
| Straggler tiles | 95 % complete but blocked on one large tile | Sort manifest largest-first; set a per-future timeout and requeue oversize tiles separately |
| Cache thrashing | Performance degrades with > N workers | Cap `max_workers` at L3 cache capacity ÷ per-tile working set; set `OMP_NUM_THREADS=1` per worker |

For datasets exceeding 500 GB, consider streaming from EPT (Entwine Point Tile) sources using `readers.ept` instead of individual LAS files. EPT hierarchical indexing allows workers to request spatially bounded subsets without pre-tiling, eliminating the manifest-generation phase. Consult [Optimizing PDAL for Multi-Core Processing](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/optimizing-pdal-for-multi-core-processing/) for NUMA-node binding and L3 cache-aligned `chunk_size` derivation.

## Common Errors and Troubleshooting

**`RuntimeError: readers.las: Unable to open file`**
The worker received a path that does not exist or is not readable by the worker process. Check that the output directory is accessible from all worker processes, especially under network mounts. Verify the manifest-generation step resolves absolute rather than relative paths.

**`RuntimeError: writers.las: Could not open file for writing`**
Two workers attempted to write the same output filename. This occurs when `Path(tile_path).stem` collides across input directories. Prefix output filenames with a hash of the full input path: `hashlib.md5(tile_path.encode()).hexdigest()[:8] + "_" + stem + ".laz"`.

**`MemoryError` or silent worker kill (exit code -9)**
A worker exceeded available RAM. The kernel OOM killer terminates the process without raising a Python exception, so `future.result()` raises `concurrent.futures.process.BrokenProcessPool`. Catch `BrokenProcessPool`, reduce `max_workers` or `chunk_size`, and resume from the last successful checkpoint in your manifest.

**`PDAL: filters.smrf: No ground points found`**
`filters.smrf` requires a minimum point density to fit the ground surface model. Tiles with fewer than ~5 points/m² may produce empty ground sets. Inspect point density with `pdal info --metadata tile.laz` and either merge sparse tiles before dispatch or skip SMRF for tiles below the density threshold.

**`concurrent.futures.process.BrokenProcessPool`**
One worker raised a fatal signal (segfault, OOM kill). Because `ProcessPoolExecutor` cannot recover from a killed worker process, the entire pool is torn down. Wrap `run_parallel_workflow` in a retry loop that re-runs only failed tiles using a fresh executor:

```python
retry_manifest = [r["tile"] for r in results if not r["ok"]]
if retry_manifest:
    run_parallel_workflow(retry_manifest, output_dir, max_workers=1)
```

Running failed tiles with `max_workers=1` isolates the problematic tile and prevents cascading executor failures.

## Frequently Asked Questions

**Why use `ProcessPoolExecutor` instead of `ThreadPoolExecutor`?**
PDAL's Python bindings execute C++ code that holds the GIL during point buffer transfers. `ThreadPoolExecutor` workers share a single GIL, so only one thread can execute Python or call into PDAL at a time — defeating the purpose of concurrent execution. `ProcessPoolExecutor` spawns separate OS processes, each with its own GIL, allowing genuine simultaneous PDAL execution across all cores.

**How many workers should I use?**
Start with `max_workers` equal to your physical (not logical/hyperthreaded) core count. Point cloud processing is memory-bandwidth intensive; adding logical cores beyond the physical count typically increases L3 cache evictions and slows throughput. Monitor RSS per worker with `psutil.Process(pid).memory_info().rss` and reduce `max_workers` if total RSS approaches available RAM.

**Can I process tiles that share boundary regions?**
Yes, but seam artifacts from spatial filters (SMRF, outlier removal) require overlap buffers. Configure `filters.splitter` with an `"origin_x"`, `"origin_y"`, `"length"`, and `"buffer"` to emit overlapping tiles, then strip the buffer zone with `filters.crop` during the output-writing stage of each worker pipeline. The `buffer` parameter is typically 0.5–2.0 metres, depending on point density and filter window size. See [pipeline filtering logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) for how filter stages consume and emit dimension buffers.

**How do I resume a partial run without reprocessing completed tiles?**
The idempotent skip check in `process_tile` already handles this — it returns early if the output file exists and exceeds 1 KB. Re-running the full manifest will skip completed tiles and only process those that are missing or zero-byte, making safe restarts after hardware failures or quota limits straightforward.

---

## Related

- [PDAL Pipeline Architecture & Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/) — parent topic covering the full PDAL execution model
- [Optimizing PDAL for Multi-Core Processing](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/optimizing-pdal-for-multi-core-processing/) — cache-aware chunking, OMP settings, NUMA binding
- [Pipeline Filtering Logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) — how filter stages consume and emit dimension buffers
- [PDAL Stage Chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/) — building multi-stage pipelines with correct buffer propagation
- [Pipeline Validation](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/) — schema and metadata verification before and after execution
- [Memory Management](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/) — controlling heap allocation and chunk size in large-scale workflows
