---
title: "Optimizing PDAL for Multi-Core Processing"
description: "Learn how to tune PDAL for multi-core throughput: set OMP_NUM_THREADS, size chunk_size to L3 cache, and orchestrate parallel tile pipelines with Python's ProcessPoolExecutor."
slug: "optimizing-pdal-for-multi-core-processing"
type: "long_tail"
breadcrumb: "Optimizing PDAL for Multi-Core Processing"
datePublished: "2024-11-01"
dateModified: "2026-06-24"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Optimizing PDAL for Multi-Core Processing",
      "description": "Learn how to tune PDAL for multi-core throughput: set OMP_NUM_THREADS, size chunk_size to L3 cache, and orchestrate parallel tile pipelines with Python's ProcessPoolExecutor.",
      "datePublished": "2024-11-01",
      "dateModified": "2026-06-24",
      "author": { "@type": "Organization", "name": "pythonlidar.com" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://pythonlidar.com/" },
        { "@type": "ListItem", "position": 2, "name": "PDAL Pipeline Architecture & Execution", "item": "https://pythonlidar.com/pdal-pipeline-architecture-execution/" },
        { "@type": "ListItem", "position": 3, "name": "Parallel Execution", "item": "https://pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/" },
        { "@type": "ListItem", "position": 4, "name": "Optimizing PDAL for Multi-Core Processing", "item": "https://pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/optimizing-pdal-for-multi-core-processing/" }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Optimize PDAL for Multi-Core Processing",
      "step": [
        { "@type": "HowToStep", "position": 1, "name": "Set OMP_NUM_THREADS to physical core count", "text": "Export OMP_NUM_THREADS equal to the number of physical (not logical/hyperthreaded) cores before launching worker processes." },
        { "@type": "HowToStep", "position": 2, "name": "Size chunk_size to L3 cache capacity", "text": "Set chunk_size in readers.las between 500,000 and 2,000,000 points so each read batch fits within the L3 cache and avoids page faults." },
        { "@type": "HowToStep", "position": 3, "name": "Partition input tiles spatially before dispatch", "text": "Use filters.splitter or pre-tiled LAZ files so each worker receives an independent, non-overlapping spatial partition." },
        { "@type": "HowToStep", "position": 4, "name": "Launch parallel pipelines with ProcessPoolExecutor", "text": "Wrap pdal.Pipeline.execute() in Python's ProcessPoolExecutor so each tile runs in its own process with a separate PDAL C++ heap." },
        { "@type": "HowToStep", "position": 5, "name": "Verify outputs and assert point counts", "text": "After all futures complete, assert output point counts match input totals and inspect pipeline.metadata for CRS and schema consistency." }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Does PDAL have a threads parameter in pipeline JSON?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. PDAL does not expose a 'threads' key at the pipeline root or in individual stage definitions. Per-stage threading for OpenMP-enabled filters (such as filters.smrf) is controlled by the OMP_NUM_THREADS environment variable set before the process starts."
          }
        },
        {
          "@type": "Question",
          "name": "Why use ProcessPoolExecutor instead of ThreadPoolExecutor for PDAL?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "pdal.Pipeline.execute() is a CPU-bound C++ call. Python's Global Interpreter Lock serializes threads even when the GIL is released during the C extension call, because concurrent memory allocation in a shared PDAL heap causes contention. ProcessPoolExecutor gives each worker an independent Python interpreter and PDAL C++ heap, delivering true parallelism."
          }
        },
        {
          "@type": "Question",
          "name": "What chunk_size should I use for aerial LiDAR tiles?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "For standard aerial LiDAR with a 6-dimension schema (X, Y, Z, Intensity, ReturnNumber, Classification), 1,000,000 points per chunk uses roughly 48 MB and fits comfortably in a 16–32 MB L3 cache per core. Increase to 2,000,000 for high-core-count servers with large L3 caches; reduce to 500,000 for high-density TLS/MLS data with wide schemas."
          }
        }
      ]
    }
  ]
}
</script>

# Optimizing PDAL for Multi-Core Processing

Set `OMP_NUM_THREADS` to your physical core count, size `chunk_size` to fit L3 cache, and wrap `pdal.Pipeline.execute()` in `ProcessPoolExecutor` — PDAL has no internal thread-pool key, so all multi-core throughput comes from process-level orchestration.

This guide is part of [Parallel Execution](/pdal-pipeline-architecture-execution/parallel-execution/) within [PDAL Pipeline Architecture & Execution](/pdal-pipeline-architecture-execution/).

---

## Context and Motivation

A production aerial LiDAR survey covering 500 km² at 8 pts/m² produces roughly 4 billion points across thousands of LAZ tiles. Sequential processing of that volume — classify ground, filter outliers, write LAS 1.4 — takes 6–10 hours on a 16-core workstation when pipelines run one tile at a time. Multi-core tuning collapses that to under 90 minutes by dispatching one PDAL pipeline per tile, each on its own CPU core.

The tuning challenge is subtle. PDAL deliberately exposes no `"threads"` key in pipeline JSON — the design assumes external orchestration. Multi-core throughput depends on three independently tuned levers: **process concurrency** (how many pipeline instances run at once), **OpenMP threading** (how many threads each filter allocates internally), and **I/O chunking** (how many points each reader or writer buffers per syscall). Getting all three wrong simultaneously is the primary reason teams see only 2–3x speedups on 16-core hardware instead of the 8–12x achievable with proper tuning.

---

## Prerequisites and Assumptions

- PDAL 2.6 or later, compiled with OpenMP support (verify with `pdal --version` — the build info line should include `OpenMP`)
- Python 3.10+ with `python-pdal` installed (`pip install pdal`)
- Input data partitioned into independent spatial tiles (pre-tiled LAZ/LAS or EPT chunks) — tiles must not share points with neighbors for classification stages, or must carry an overlap buffer stripped post-processing
- Sufficient RAM: at minimum `max_workers × tile_RAM_footprint`; for 1M-point 6-dimension tiles that is roughly `workers × 50 MB`
- A validated sequential pipeline that processes one tile correctly before parallelization

If your input is a single large LAS file rather than pre-tiled data, insert a `filters.splitter` stage with `length=500` (500-metre tiles) to partition it before dispatch — see the [PDAL stage chaining](/pdal-pipeline-architecture-execution/pdal-stage-chaining/) guide for how splitter output feeds downstream pipeline stages.

---

## Architecture Overview

The diagram below shows how three tuning levers interact across a multi-worker deployment. Each `ProcessPoolExecutor` worker owns an isolated PDAL heap; `OMP_NUM_THREADS` governs threads within each filter call; `chunk_size` controls the I/O buffer per reader/writer syscall.

<svg viewBox="0 0 760 320" role="img" aria-label="PDAL multi-core tuning: three levers across a multi-worker deployment" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:760px;display:block;margin:1.5rem auto;">
  <title>PDAL Multi-Core Tuning Architecture</title>
  <desc>Diagram showing ProcessPoolExecutor dispatching multiple worker processes, each containing a PDAL pipeline with readers, filters using OpenMP threads, and writers. A chunk-size I/O buffer sits between the reader and the filter stages.</desc>
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- Orchestrator box -->
  <rect x="10" y="10" width="180" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="100" y="35" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">ProcessPoolExecutor</text>
  <text x="100" y="52" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">max_workers=N</text>
  <!-- Worker 1 -->
  <rect x="240" y="10" width="490" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <text x="485" y="26" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.8">Worker 1 (isolated Python interpreter + PDAL C++ heap)</text>
  <rect x="255" y="33" width="100" height="26" rx="4" fill="none" stroke="currentColor" stroke-width="1" opacity="0.55"/>
  <text x="305" y="50" text-anchor="middle" font-size="10" fill="currentColor">readers.las</text>
  <rect x="375" y="33" width="110" height="26" rx="4" fill="none" stroke="currentColor" stroke-width="1" opacity="0.55"/>
  <text x="430" y="44" text-anchor="middle" font-size="9.5" fill="currentColor">filters.smrf</text>
  <text x="430" y="56" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.7">[OMP threads]</text>
  <rect x="505" y="33" width="100" height="26" rx="4" fill="none" stroke="currentColor" stroke-width="1" opacity="0.55"/>
  <text x="555" y="50" text-anchor="middle" font-size="10" fill="currentColor">writers.las</text>
  <rect x="620" y="33" width="95" height="26" rx="4" fill="none" stroke="currentColor" stroke-width="1" opacity="0.55"/>
  <text x="668" y="44" text-anchor="middle" font-size="9.5" fill="currentColor">chunk_size</text>
  <text x="668" y="56" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.7">I/O buffer</text>
  <line x1="355" y1="46" x2="373" y2="46" stroke="currentColor" stroke-width="1.2" marker-end="url(#arr)" opacity="0.6"/>
  <line x1="485" y1="46" x2="503" y2="46" stroke="currentColor" stroke-width="1.2" marker-end="url(#arr)" opacity="0.6"/>
  <line x1="605" y1="46" x2="618" y2="46" stroke="currentColor" stroke-width="1.2" marker-end="url(#arr)" opacity="0.6"/>
  <!-- Worker 2 -->
  <rect x="240" y="90" width="490" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <text x="485" y="106" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.8">Worker 2 (isolated Python interpreter + PDAL C++ heap)</text>
  <rect x="255" y="113" width="100" height="26" rx="4" fill="none" stroke="currentColor" stroke-width="1" opacity="0.55"/>
  <text x="305" y="130" text-anchor="middle" font-size="10" fill="currentColor">readers.las</text>
  <rect x="375" y="113" width="110" height="26" rx="4" fill="none" stroke="currentColor" stroke-width="1" opacity="0.55"/>
  <text x="430" y="124" text-anchor="middle" font-size="9.5" fill="currentColor">filters.smrf</text>
  <text x="430" y="136" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.7">[OMP threads]</text>
  <rect x="505" y="113" width="100" height="26" rx="4" fill="none" stroke="currentColor" stroke-width="1" opacity="0.55"/>
  <text x="555" y="130" text-anchor="middle" font-size="10" fill="currentColor">writers.las</text>
  <rect x="620" y="113" width="95" height="26" rx="4" fill="none" stroke="currentColor" stroke-width="1" opacity="0.55"/>
  <text x="668" y="124" text-anchor="middle" font-size="9.5" fill="currentColor">chunk_size</text>
  <text x="668" y="136" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.7">I/O buffer</text>
  <line x1="355" y1="126" x2="373" y2="126" stroke="currentColor" stroke-width="1.2" marker-end="url(#arr)" opacity="0.6"/>
  <line x1="485" y1="126" x2="503" y2="126" stroke="currentColor" stroke-width="1.2" marker-end="url(#arr)" opacity="0.6"/>
  <line x1="605" y1="126" x2="618" y2="126" stroke="currentColor" stroke-width="1.2" marker-end="url(#arr)" opacity="0.6"/>
  <!-- Ellipsis -->
  <text x="485" y="185" text-anchor="middle" font-size="14" fill="currentColor" opacity="0.5">· · ·</text>
  <!-- Worker N -->
  <rect x="240" y="205" width="490" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <text x="485" y="221" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.8">Worker N (isolated Python interpreter + PDAL C++ heap)</text>
  <rect x="255" y="228" width="100" height="26" rx="4" fill="none" stroke="currentColor" stroke-width="1" opacity="0.55"/>
  <text x="305" y="245" text-anchor="middle" font-size="10" fill="currentColor">readers.las</text>
  <rect x="375" y="228" width="110" height="26" rx="4" fill="none" stroke="currentColor" stroke-width="1" opacity="0.55"/>
  <text x="430" y="239" text-anchor="middle" font-size="9.5" fill="currentColor">filters.smrf</text>
  <text x="430" y="251" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.7">[OMP threads]</text>
  <rect x="505" y="228" width="100" height="26" rx="4" fill="none" stroke="currentColor" stroke-width="1" opacity="0.55"/>
  <text x="555" y="245" text-anchor="middle" font-size="10" fill="currentColor">writers.las</text>
  <rect x="620" y="228" width="95" height="26" rx="4" fill="none" stroke="currentColor" stroke-width="1" opacity="0.55"/>
  <text x="668" y="239" text-anchor="middle" font-size="9.5" fill="currentColor">chunk_size</text>
  <text x="668" y="251" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.7">I/O buffer</text>
  <line x1="355" y1="241" x2="373" y2="241" stroke="currentColor" stroke-width="1.2" marker-end="url(#arr)" opacity="0.6"/>
  <line x1="485" y1="241" x2="503" y2="241" stroke="currentColor" stroke-width="1.2" marker-end="url(#arr)" opacity="0.6"/>
  <line x1="605" y1="241" x2="618" y2="241" stroke="currentColor" stroke-width="1.2" marker-end="url(#arr)" opacity="0.6"/>
  <!-- Arrows from orchestrator to workers -->
  <line x1="190" y1="40" x2="238" y2="40" stroke="currentColor" stroke-width="1.2" marker-end="url(#arr)" opacity="0.6"/>
  <line x1="190" y1="40" x2="215" y2="40" stroke="currentColor" stroke-width="1.2" opacity="0.5"/>
  <line x1="215" y1="40" x2="215" y2="235" stroke="currentColor" stroke-width="1.2" opacity="0.5"/>
  <line x1="215" y1="120" x2="238" y2="120" stroke="currentColor" stroke-width="1.2" marker-end="url(#arr)" opacity="0.6"/>
  <line x1="215" y1="235" x2="238" y2="235" stroke="currentColor" stroke-width="1.2" marker-end="url(#arr)" opacity="0.6"/>
  <!-- Legend -->
  <text x="10" y="295" font-size="9.5" fill="currentColor" opacity="0.65">Lever 1: max_workers (process count)</text>
  <text x="210" y="295" font-size="9.5" fill="currentColor" opacity="0.65">Lever 2: OMP_NUM_THREADS (per-filter threads)</text>
  <text x="500" y="295" font-size="9.5" fill="currentColor" opacity="0.65">Lever 3: chunk_size (I/O buffer)</text>
</svg>

---

## Step-by-Step Implementation

### Step 1 — Configure the OpenMP environment

Set these environment variables before launching any worker processes. They must be in the environment of each spawned process, not just the parent.

```bash
# Physical cores only — hyperthreading adds cache contention for point cloud buffers
export OMP_NUM_THREADS=8
export OMP_PROC_BIND=close
export OMP_PLACES=cores
export OMP_MAX_ACTIVE_LEVELS=1   # prevent nested parallelism across workers
```

In Python, inject them before the executor is created:

```python
import os
import multiprocessing

# Set before ProcessPoolExecutor spawns child processes
physical_cores = multiprocessing.cpu_count() // 2  # conservative: physical only
os.environ["OMP_NUM_THREADS"] = str(max(1, physical_cores))
os.environ["OMP_MAX_ACTIVE_LEVELS"] = "1"
```

### Step 2 — Size chunk_size for your tile schema

`chunk_size` in `readers.las` controls how many points are loaded per I/O syscall. It does not create threads — it is purely a memory buffer tuning parameter. A standard 6-dimension LAS schema (X, Y, Z, Intensity, ReturnNumber, Classification) stores ~48 bytes per point after type promotion. For a 16 MB L3 cache slice per core, the formula is:

```
chunk_size = L3_cache_per_core_bytes / bytes_per_point
           = 16,000,000 / 48 ≈ 333,000
```

Round up to 500,000 for a comfortable fit. For servers with 32–64 MB L3 per core, 1–2 million points per chunk is appropriate.

### Step 3 — Partition input data

Each worker must receive an independent spatial partition. If your data is already tiled to 500 m × 500 m LAZ files, skip this step. If you have a monolithic LAS file, pre-split it:

```python
import pdal, json

split_pipeline = {
    "pipeline": [
        {"type": "readers.las", "filename": "survey_full.las"},
        {
            "type": "filters.splitter",
            "length": 500,       # 500-metre tiles
            "origin_x": 300000,  # UTM easting origin (EPSG:32632 example)
            "origin_y": 5000000  # UTM northing origin
        },
        {
            "type": "writers.las",
            "filename": "tiles/tile_#.laz",
            "minor_version": 4,
            "dataformat_id": 6,
            "a_srs": "EPSG:32632"
        }
    ]
}

p = pdal.Pipeline(json.dumps(split_pipeline))
p.execute()
```

This produces files named `tile_0.laz`, `tile_1.laz`, etc., each independent for parallel processing.

### Step 4 — Build the per-tile pipeline function

```python
import pdal
import json
from pathlib import Path

def run_ground_classification(input_path: str, output_path: str, chunk_size: int = 1_000_000) -> dict:
    """
    Run SMRF ground classification on one tile.
    Returns a dict with point count and output path.
    Raises RuntimeError on empty output so callers can distinguish corrupt input
    from genuine zero-point edge tiles.
    """
    pipeline_def = {
        "pipeline": [
            {
                "type": "readers.las",
                "filename": input_path,
                "chunk_size": chunk_size
            },
            {
                "type": "filters.smrf",
                "slope": 0.15,       # degrees — typical for gentle terrain
                "window": 18.0,      # metres — matches 0.5 m point spacing
                "elevation": 0.5,    # metres above ground surface
                "threshold": 0.5,    # metres — cut point for classification
                "scalar": 1.25
            },
            {
                "type": "writers.las",
                "filename": output_path,
                "minor_version": 4,
                "dataformat_id": 6,
                "extra_dims": "all"
            }
        ]
    }

    pipeline = pdal.Pipeline(json.dumps(pipeline_def))
    count = pipeline.execute()
    metadata = pipeline.metadata

    if count == 0:
        raise RuntimeError(f"Zero points in output for {input_path} — verify input file integrity.")

    return {
        "input": input_path,
        "output": output_path,
        "points_processed": count,
        "crs": metadata.get("metadata", {}).get("readers.las", {}).get("srs", {}).get("wkt", "unknown")
    }
```

### Step 5 — Dispatch in parallel with ProcessPoolExecutor

```python
import os
import multiprocessing
import logging
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

def run_parallel_classification(
    tile_manifest: list[str],
    output_dir: str,
    max_workers: int | None = None,
    chunk_size: int = 1_000_000
) -> dict:
    """
    Classify ground points across multiple tiles in parallel.

    Args:
        tile_manifest: List of absolute paths to input LAZ/LAS tiles.
        output_dir:    Directory for classified output files.
        max_workers:   Worker process count. Defaults to physical_cores // 2.
        chunk_size:    Points per I/O batch for readers.las.

    Returns:
        Summary dict with success/failure counts and error details.
    """
    # Set OpenMP environment before spawning workers
    physical_cores = multiprocessing.cpu_count() // 2
    os.environ.setdefault("OMP_NUM_THREADS", str(max(1, physical_cores)))
    os.environ.setdefault("OMP_MAX_ACTIVE_LEVELS", "1")

    if max_workers is None:
        max_workers = max(1, physical_cores)

    Path(output_dir).mkdir(parents=True, exist_ok=True)
    results = {"success": 0, "failed": 0, "errors": [], "outputs": []}

    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        futures: dict = {}
        for tile_path in tile_manifest:
            out = os.path.join(output_dir, Path(tile_path).stem + "_ground.laz")
            future = executor.submit(run_ground_classification, tile_path, out, chunk_size)
            futures[future] = tile_path

        for future in as_completed(futures):
            tile_path = futures[future]
            try:
                result = future.result()
                results["success"] += 1
                results["outputs"].append(result["output"])
                logging.info("OK  %s → %d pts", result["input"], result["points_processed"])
            except Exception as exc:
                results["failed"] += 1
                results["errors"].append({"tile": tile_path, "error": str(exc)})
                logging.error("ERR %s: %s", tile_path, exc)

    logging.info(
        "Finished: %d/%d tiles OK", results["success"], len(tile_manifest)
    )
    return results
```

---

## Complete Working Example

The following self-contained script brings together all five steps. Copy it to your project, adjust `TILE_DIR`, `OUTPUT_DIR`, and `MAX_WORKERS` to match your hardware, and run it against a folder of pre-tiled LAZ files.

```python
#!/usr/bin/env python3
"""
pdal_parallel_classify.py — ground-classify a folder of LAZ tiles across all physical cores.

Usage:
    python pdal_parallel_classify.py

Requirements:
    pip install pdal          # python-pdal >= 3.0
    PDAL 2.6+ compiled with OpenMP

Adjust TILE_DIR, OUTPUT_DIR, MAX_WORKERS, and CHUNK_SIZE before running.
"""
import os
import glob
import json
import logging
import multiprocessing
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import pdal

# ── Configuration ──────────────────────────────────────────────────────────────
TILE_DIR   = "tiles/"          # directory containing *.laz input tiles
OUTPUT_DIR = "classified/"     # classified output goes here
MAX_WORKERS = multiprocessing.cpu_count() // 2  # physical cores
CHUNK_SIZE  = 1_000_000        # points per I/O batch — tune to your L3 cache
# ───────────────────────────────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")


def run_ground_classification(input_path: str, output_path: str, chunk_size: int) -> dict:
    """Classify ground returns in one tile; return result dict or raise."""
    pipeline_def = {
        "pipeline": [
            {"type": "readers.las", "filename": input_path, "chunk_size": chunk_size},
            {
                "type": "filters.smrf",
                "slope": 0.15,
                "window": 18.0,
                "elevation": 0.5,
                "threshold": 0.5,
                "scalar": 1.25
            },
            {
                "type": "writers.las",
                "filename": output_path,
                "minor_version": 4,
                "dataformat_id": 6,
                "extra_dims": "all"
            }
        ]
    }
    p = pdal.Pipeline(json.dumps(pipeline_def))
    count = p.execute()
    if count == 0:
        raise RuntimeError(f"Zero output points — check {input_path}")
    meta = p.metadata
    return {
        "input": input_path,
        "output": output_path,
        "points": count,
        "crs": meta.get("metadata", {}).get("readers.las", {}).get("srs", {}).get("wkt", "unknown")
    }


def main() -> None:
    # Propagate OpenMP settings into every spawned worker process
    os.environ.setdefault("OMP_NUM_THREADS", str(max(1, MAX_WORKERS)))
    os.environ.setdefault("OMP_MAX_ACTIVE_LEVELS", "1")

    tiles = sorted(glob.glob(os.path.join(TILE_DIR, "*.laz")))
    if not tiles:
        raise FileNotFoundError(f"No .laz files found in {TILE_DIR!r}")

    Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
    success, failed, errors = 0, 0, []

    with ProcessPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(
                run_ground_classification,
                t,
                os.path.join(OUTPUT_DIR, Path(t).stem + "_ground.laz"),
                CHUNK_SIZE
            ): t
            for t in tiles
        }
        for future in as_completed(futures):
            tile = futures[future]
            try:
                r = future.result()
                success += 1
                logging.info("OK  %s  →  %d pts", r["input"], r["points"])
            except Exception as exc:
                failed += 1
                errors.append((tile, str(exc)))
                logging.error("ERR %s: %s", tile, exc)

    logging.info("Done: %d/%d tiles succeeded.", success, len(tiles))
    if errors:
        logging.warning("Failed tiles:")
        for t, e in errors:
            logging.warning("  %s: %s", t, e)


if __name__ == "__main__":
    main()
```

---

## Key Parameter Table

| Parameter | Stage | Type | Default | Recommended Range | Effect |
|---|---|---|---|---|---|
| `chunk_size` | `readers.las` | int | 10,000 | 500,000–2,000,000 | Points buffered per I/O syscall; larger fits more data in L3 cache |
| `OMP_NUM_THREADS` | env var | int | all logical cores | physical cores / max_workers | OpenMP thread count inside filters; excess causes cache thrashing |
| `OMP_MAX_ACTIVE_LEVELS` | env var | int | unlimited | 1 | Prevents nested OpenMP regions when multiple workers each use threads |
| `max_workers` | `ProcessPoolExecutor` | int | `os.cpu_count()` | physical cores | Concurrent pipeline instances; cap at RAM / per-tile footprint |
| `slope` | `filters.smrf` | float | 0.15 | 0.1–0.4 | Max slope in degrees for ground surface model |
| `window` | `filters.smrf` | float | 18.0 | 8–33 | Search window in metres; increase for sparser data |
| `minor_version` | `writers.las` | int | 2 | 2 or 4 | LAS spec minor version; 4 supports 64-bit point counts |
| `dataformat_id` | `writers.las` | int | 0 | 0, 1, 6, 7 | Point data record format; 6 = GPS time, no RGB |

---

## Verification

After the executor exits, verify that output point counts match the expected total:

```python
import pdal, json

def verify_tile(output_path: str, expected_min_count: int = 1) -> bool:
    """Quick metadata-only check: read header without loading all points."""
    info_pipeline = {
        "pipeline": [
            {"type": "readers.las", "filename": output_path, "count": 0}
        ]
    }
    p = pdal.Pipeline(json.dumps(info_pipeline))
    p.execute()
    meta = p.metadata
    point_count = meta.get("metadata", {}).get("readers.las", {}).get("count", 0)
    return int(point_count) >= expected_min_count

# Check all outputs
for out_path in summary["outputs"]:
    ok = verify_tile(out_path, expected_min_count=100)
    print(f"{'PASS' if ok else 'FAIL'}  {out_path}")
```

Also confirm that the [spatial reprojection](/pdal-pipeline-architecture-execution/spatial-reprojection/) metadata is consistent across tiles by checking the `srs.wkt` field in each output's `pipeline.metadata` — mismatched CRS across workers is a common silent corruption that the [pipeline validation](/pdal-pipeline-architecture-execution/pipeline-validation/) stage should catch before any downstream rasterization.

---

## Gotchas and Edge Cases

**1. OpenMP oversubscription silently degrades throughput.**
When `max_workers=8` and `OMP_NUM_THREADS=8`, each worker spawns 8 OpenMP threads, creating 64 OS threads competing for 8 physical cores. CPU utilization looks high in `htop` but wall-clock time doubles. Solution: `OMP_NUM_THREADS = max(1, physical_cores // max_workers)` — if running 8 workers on 8 cores, set `OMP_NUM_THREADS=1`.

**2. chunk_size larger than file size wastes memory without error.**
If a tile holds 200,000 points and `chunk_size=1,000,000`, PDAL allocates a 1M-point buffer that is never filled. With 16 workers each holding a 48 MB buffer, you exhaust 768 MB on empty allocations. Set `chunk_size` to the median tile point count, not to a fixed ceiling.

**3. filters.smrf requires a minimum point density.**
SMRF's window search needs at least a few points per square metre to reliably distinguish ground returns. Tiles with fewer than ~0.5 pts/m² (e.g., forest interiors with heavy canopy) frequently produce zero classified ground points — a silent empty-ground-class result, not an exception. Add a post-processing check: assert that at least 5% of points carry `Classification == 2`. Refer to the [pipeline filtering logic](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) guide for strategies to handle these edge tiles with adaptive filter parameters.

**4. LAZ decompression adds CPU overhead that scales non-linearly.**
LASzip decompression is single-threaded per file. With 16 workers each decompressing a 200 MB LAZ tile, decompression becomes the bottleneck, not classification. For iterative workflows (classify → inspect → re-classify), stage intermediate results as uncompressed LAS. Reserve LAZ for final archival output only.

---

## Related

- [Parallel Execution in PDAL](/pdal-pipeline-architecture-execution/parallel-execution/) — parent page covering the full execution model and tile dispatch patterns
- [PDAL Stage Chaining](/pdal-pipeline-architecture-execution/pdal-stage-chaining/) — how pipeline stages pass buffers and why order matters for parallel workflows
- [Applying Statistical Outlier Filters in PDAL](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/applying-statistical-outlier-filters-in-pdal/) — combining outlier removal with ground classification in a multi-stage parallel pipeline
- [Pipeline Filtering Logic](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) — boundary handling, overlap buffers, and filter ordering for spatially partitioned data
- [PDAL Pipeline Architecture & Execution](/pdal-pipeline-architecture-execution/) — foundational overview of stage types, execution lifecycle, and memory model
