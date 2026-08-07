---
title: "LAZ vs Uncompressed LAS for Iterative Processing"
description: "A decision guide on when to keep LiDAR as compressed LAZ versus uncompressed LAS during iterative PDAL development — the decompression cost per run, disk trade-offs, and a benchmark-style comparison."
slug: "laz-vs-uncompressed-las-for-iterative-processing"
type: "howto"
breadcrumb: "LAZ vs Uncompressed LAS"
datePublished: "2024-07-03"
dateModified: "2026-07-12"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "LAZ vs Uncompressed LAS for Iterative Processing",
      "description": "A decision guide on when to keep LiDAR as compressed LAZ versus uncompressed LAS during iterative PDAL development — the decompression cost per run, disk trade-offs, and a benchmark-style comparison.",
      "datePublished": "2024-07-03",
      "dateModified": "2026-07-12",
      "author": { "@type": "Organization", "name": "pythonlidar.com" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pythonlidar.com/" },
        { "@type": "ListItem", "position": 2, "name": "PDAL Pipeline Architecture & Execution", "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/" },
        { "@type": "ListItem", "position": 3, "name": "Memory Management", "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/" },
        { "@type": "ListItem", "position": 4, "name": "LAZ vs Uncompressed LAS", "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/laz-vs-uncompressed-las-for-iterative-processing/" }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Benchmark LAZ against uncompressed LAS for iterative PDAL work",
      "description": "Measure read time, write time, file size, and CPU cost of LAZ versus uncompressed LAS so you can decide which format to keep on disk during development.",
      "step": [
        { "@type": "HowToStep", "position": 1, "name": "Stage one working copy in each format", "text": "Convert the source tile to both an uncompressed .las and a compressed .laz with writers.las so the point content is identical." },
        { "@type": "HowToStep", "position": 2, "name": "Time a repeated read of each format", "text": "Run the same read-only PDAL pipeline against both files across several iterations and record wall-clock time." },
        { "@type": "HowToStep", "position": 3, "name": "Record file size and CPU cost", "text": "Compare on-disk bytes and per-run CPU seconds using os.stat and time.process_time." },
        { "@type": "HowToStep", "position": 4, "name": "Choose a format for the current stage of work", "text": "Keep uncompressed LAS for tight edit-run loops; keep LAZ for archival, transfer, and cold storage." }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How much slower is reading LAZ than uncompressed LAS in PDAL?",
          "acceptedAnswer": { "@type": "Answer", "text": "On a typical 8-core workstation, decompressing LAZ adds roughly 2–4x to the read time of an equivalent LAS file, because LASzip must reconstruct every point record before PDAL can hand the buffer to the next stage. The exact ratio depends on point format width and disk speed, but the CPU cost is real and recurs on every single run." }
        },
        {
          "@type": "Question",
          "name": "Does LAZ use less RAM than LAS once loaded?",
          "acceptedAnswer": { "@type": "Answer", "text": "No. Compression only affects the on-disk representation. Once PDAL materialises the point buffer, LAZ and LAS occupy identical memory because both expand to the same NumPy structured array. The savings are purely storage and transfer bandwidth, not runtime footprint." }
        },
        {
          "@type": "Question",
          "name": "Is LAZ compression lossless?",
          "acceptedAnswer": { "@type": "Answer", "text": "Yes. LASzip is bit-exact: coordinates, intensity, classification, GPS time, and extra dimensions round-trip identically. Converting LAS to LAZ and back yields the same integer point records, so there is no accuracy reason to avoid it — only a speed reason during repeated reads." }
        },
        {
          "@type": "Question",
          "name": "Should I keep intermediate pipeline outputs as LAZ or LAS?",
          "acceptedAnswer": { "@type": "Answer", "text": "For scratch intermediates that you re-read many times in a single debugging session, uncompressed LAS avoids paying the decompression tax on each iteration. For intermediates that survive between sessions or move across machines, LAZ is worth the compression cost because you read them far less often than you store them." }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** During tight edit-run development loops where you re-read the same tile dozens of times, keep it as uncompressed `.las` to skip the LASzip decompression tax on every run; switch back to `.laz` for archival, transfer, and anything you touch infrequently — the compression saves 5–8x on disk but costs 2–4x on each read.

## Context and Motivation

This guide is part of [Memory Management](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/), which treats data volume as the dominant cost in Python LiDAR work. Here the question is narrower and it is about time, not RAM: when you iterate on a pipeline against the same file over and over, does compression help or hurt?

Compression is almost always the right default for stored point clouds — a LAZ tile is a fraction of the bytes of its LAS twin, and it moves across a network in a fraction of the time. But iterative development inverts the usual economics. In a debugging loop you might execute a pipeline against one tile forty times in an afternoon, tweaking a `filters.smrf` slope or a range predicate between runs. Every one of those runs pays the full LASzip decompression cost before the first filter even sees a point. That per-run tax is invisible in a benchmark that reads a file once, but it accumulates into minutes of dead waiting across a working session. Understanding where the cost lands — disk once versus CPU every time — is what lets you pick the right format for the phase of work you are in, rather than reflexively compressing everything.

<svg viewBox="0 0 760 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cost comparison of LAZ versus uncompressed LAS across repeated read iterations" style="width:100%;max-width:760px;display:block;margin:1.5rem auto;">
  <title>Where LAZ and uncompressed LAS pay their cost across an iterative development loop</title>
  <desc>Two horizontal tracks compare the same tile stored as LAZ and as uncompressed LAS. The LAZ track shows a small one-time disk-write cost followed by a repeated decompression cost paid on every read iteration. The LAS track shows a larger one-time disk footprint but a near-zero repeated read cost. A summary note states LAZ wins on storage and transfer while LAS wins on repeated reads.</desc>
  <rect x="0" y="0" width="760" height="300" fill="var(--dg-bg)" rx="10"/>
  <defs>
    <marker id="lz-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <!-- LAZ track -->
  <text x="20" y="52" font-size="13" fill="currentColor" font-family="sans-serif" font-weight="600">LAZ (.laz)</text>
  <rect x="20" y="64" width="90" height="46" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="65" y="84" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">small on</text>
  <text x="65" y="98" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">disk</text>
  <!-- repeated decompress boxes -->
  <rect x="150" y="64" width="80" height="46" rx="6" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1"/>
  <text x="190" y="84" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">decompress</text>
  <text x="190" y="98" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">run 1</text>
  <rect x="240" y="64" width="80" height="46" rx="6" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1"/>
  <text x="280" y="84" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">decompress</text>
  <text x="280" y="98" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">run 2</text>
  <rect x="330" y="64" width="80" height="46" rx="6" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1"/>
  <text x="370" y="84" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">decompress</text>
  <text x="370" y="98" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">run 3</text>
  <text x="450" y="92" font-size="18" fill="currentColor" font-family="sans-serif" opacity="0.6">…</text>
  <text x="500" y="80" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75" font-style="italic">CPU cost paid</text>
  <text x="500" y="96" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75" font-style="italic">every iteration</text>
  <line x1="110" y1="87" x2="148" y2="87" stroke="currentColor" stroke-width="1.5" marker-end="url(#lz-arr)"/>
  <!-- LAS track -->
  <text x="20" y="176" font-size="13" fill="currentColor" font-family="sans-serif" font-weight="600">LAS (.las)</text>
  <rect x="20" y="188" width="170" height="46" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="105" y="208" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">large on disk (one time)</text>
  <text x="105" y="222" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.55">5–8x the LAZ bytes</text>
  <rect x="230" y="188" width="60" height="46" rx="6" fill="currentColor" opacity="0.10" stroke="currentColor" stroke-width="1"/>
  <text x="260" y="212" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif">read 1</text>
  <rect x="300" y="188" width="60" height="46" rx="6" fill="currentColor" opacity="0.10" stroke="currentColor" stroke-width="1"/>
  <text x="330" y="212" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif">read 2</text>
  <rect x="370" y="188" width="60" height="46" rx="6" fill="currentColor" opacity="0.10" stroke="currentColor" stroke-width="1"/>
  <text x="400" y="212" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif">read 3</text>
  <text x="450" y="205" font-size="18" fill="currentColor" font-family="sans-serif" opacity="0.6">…</text>
  <text x="500" y="205" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75" font-style="italic">near-zero decode cost</text>
  <line x1="190" y1="211" x2="228" y2="211" stroke="currentColor" stroke-width="1.5" marker-end="url(#lz-arr)"/>
  <!-- summary -->
  <text x="380" y="278" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.85">LAZ wins on storage &amp; transfer · uncompressed LAS wins on repeated reads</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL | 2.5+ with LASzip support compiled in |
| Python `pdal` bindings | 3.x (`pip install pdal`) |
| `laspy` (optional cross-check) | 2.4+ with `laspy[lazrs]` backend |
| Sample tile | 5–50 M points, any real acquisition (USGS 3DEP works well) |
| Disk | Local SSD/NVMe — network storage skews read timings toward I/O |

This comparison assumes you already know how PDAL streams stages; if not, the [PDAL Pipeline Architecture & Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/) overview covers the reader-filter-writer model that every timing below sits inside. The measurements here reflect a single tile read repeatedly on one machine; parallelising the loop is a separate concern covered in [Optimizing PDAL for Multi-Core Processing](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/optimizing-pdal-for-multi-core-processing/).

## Step-by-Step Comparison

### Step 1 — Stage one identical copy in each format

Start from your source tile and write two working copies with the same point content — one compressed, one not. The only difference is the `compression` flag on `writers.las`.

```json
{
  "pipeline": [
    "source_tile.laz",
    {
      "type": "writers.las",
      "filename": "work_copy.las",
      "compression": "none",
      "forward": "all"
    }
  ]
}
```

Swap `"compression": "none"` for `"compression": "laszip"` and the `.las` extension for `.laz` to produce the compressed twin. `forward: "all"` guarantees both copies carry identical headers, VLRs, and extra dimensions, so the benchmark compares like with like. For the mechanics of that conversion in isolation, see [Converting LAS to LAZ with PDAL](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/converting-las-to-laz-with-pdal/).

### Step 2 — Time a repeated read of each file

A read-only pipeline — a bare reader, nothing else — isolates decompression cost from filter cost. Execute it several times per format and record the wall-clock time of each run.

```python
import json
import time
import pdal

def time_reads(path: str, iterations: int = 5) -> list[float]:
    """Return per-iteration wall-clock read times (seconds) for one file."""
    durations = []
    for _ in range(iterations):
        t0 = time.perf_counter()
        p = pdal.Pipeline(json.dumps({"pipeline": [path]}))
        p.execute()
        durations.append(time.perf_counter() - t0)
    return durations
```

### Step 3 — Record file size and CPU seconds

Wall-clock time conflates disk I/O with CPU decode work. Sampling `time.process_time()` alongside it separates the two — LAZ inflates CPU time because LASzip runs on the processor, whereas LAS spends its budget mostly waiting on disk.

```python
import os

def measure(path: str) -> dict:
    size_mb = os.stat(path).st_size / 1024**2
    t_wall = time.perf_counter()
    t_cpu = time.process_time()
    pdal.Pipeline(json.dumps({"pipeline": [path]})).execute()
    return {
        "path": path,
        "size_mb": round(size_mb, 1),
        "wall_s": round(time.perf_counter() - t_wall, 3),
        "cpu_s": round(time.process_time() - t_cpu, 3),
    }
```

### Step 4 — Decide by the phase of work

The numbers point to a rule of thumb rather than a universal winner. If you are re-running a pipeline against the same tile many times in one sitting, the uncompressed copy pays for itself within a handful of iterations. If the file mostly sits in storage or crosses a network, keep it compressed and eat the occasional decode.

<svg viewBox="0 0 720 258" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cumulative processing time over ten development iterations for LAZ and for uncompressed LAS" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Where the compression bill actually lands</title>
  <desc>Cumulative wall-clock over ten iterations of a develop-and-rerun loop. Reading LAZ pays a decompression cost on every single run, so the line climbs steadily. Converting once to uncompressed LAS costs one large step up front and then a much shallower slope, overtaking the compressed workflow at the fourth iteration.</desc>
  <rect x="0" y="0" width="720" height="258" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="40" x2="80" y2="200" stroke="var(--dg-line)" stroke-width="1.5"/>
  <line x1="80" y1="200" x2="690" y2="200" stroke="var(--dg-line)" stroke-width="1.5"/>
  <polyline points="80,200 141,184 202,168 263,152 324,136 385,120 446,104 507,88 568,72 629,56 690,42" fill="none" stroke="var(--dg-e)" stroke-width="2.6"/>
  <polyline points="80,152 141,146 202,140 263,134 324,128 385,122 446,116 507,110 568,104 629,98 690,92" fill="none" stroke="var(--dg-d)" stroke-width="2.6" stroke-dasharray="7 4"/>
  <circle cx="263" cy="152" r="5" fill="none" stroke="var(--dg-a)" stroke-width="2"/>
  <text x="271" y="168" font-size="10.5" fill="var(--dg-a)">break-even at run 4</text>
  <line x1="140" y1="66" x2="170" y2="66" stroke="var(--dg-e)" stroke-width="2.6"/>
  <text x="178" y="70" font-size="11" fill="var(--dg-text)">read LAZ every run — 16 s of decode each time</text>
  <line x1="140" y1="90" x2="170" y2="90" stroke="var(--dg-d)" stroke-width="2.6" stroke-dasharray="7 4"/>
  <text x="178" y="94" font-size="11" fill="var(--dg-text)">convert once to LAS — 48 s up front, 6 s each run</text>
  <text x="72" y="204" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">0</text>
  <text x="72" y="124" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">80 s</text>
  <text x="72" y="44" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">160 s</text>
  <text x="80" y="220" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">0</text>
  <text x="385" y="220" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">5</text>
  <text x="690" y="220" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">10</text>
  <text x="385" y="242" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">iterations of the edit-and-rerun loop</text>
</svg>

## Complete Working Example

Save the following as `laz_las_bench.py`. It stages both formats from a single source, runs a repeated-read benchmark, and prints a comparison table with size, median read time, and CPU cost.

```python
#!/usr/bin/env python3
"""
laz_las_bench.py
Benchmark compressed LAZ against uncompressed LAS for repeated reads.

Usage:
    python laz_las_bench.py source_tile.laz --iterations 7

Requirements:
    pip install pdal
    PDAL 2.5+ with LASzip
"""

import argparse
import json
import os
import statistics
import time

import pdal


def stage_copy(source: str, out_path: str, compression: str) -> None:
    """Write an identical-content working copy in the requested compression mode."""
    pipeline = {
        "pipeline": [
            source,
            {
                "type": "writers.las",
                "filename": out_path,
                "compression": compression,  # "none" or "laszip"
                "forward": "all",
            },
        ]
    }
    pdal.Pipeline(json.dumps(pipeline)).execute()


def bench_reads(path: str, iterations: int) -> dict:
    """Read a file repeatedly; return size and timing statistics."""
    wall, cpu = [], []
    for _ in range(iterations):
        t_wall, t_cpu = time.perf_counter(), time.process_time()
        p = pdal.Pipeline(json.dumps({"pipeline": [path]}))
        count = p.execute()
        wall.append(time.perf_counter() - t_wall)
        cpu.append(time.process_time() - t_cpu)
    return {
        "path": path,
        "points": count,
        "size_mb": round(os.stat(path).st_size / 1024**2, 1),
        "median_wall_s": round(statistics.median(wall), 3),
        "median_cpu_s": round(statistics.median(cpu), 3),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("source")
    ap.add_argument("--iterations", type=int, default=7)
    args = ap.parse_args()

    print("Staging working copies (identical point content)...")
    stage_copy(args.source, "work_copy.las", "none")
    stage_copy(args.source, "work_copy.laz", "laszip")

    print(f"Benchmarking {args.iterations} reads per format...\n")
    las = bench_reads("work_copy.las", args.iterations)
    laz = bench_reads("work_copy.laz", args.iterations)

    hdr = f"{'format':<8}{'size (MB)':>12}{'read wall (s)':>16}{'read cpu (s)':>15}"
    print(hdr)
    print("-" * len(hdr))
    for tag, r in (("LAS", las), ("LAZ", laz)):
        print(f"{tag:<8}{r['size_mb']:>12}{r['median_wall_s']:>16}{r['median_cpu_s']:>15}")

    size_ratio = laz["size_mb"] and round(las["size_mb"] / laz["size_mb"], 1)
    read_ratio = las["median_wall_s"] and round(laz["median_wall_s"] / las["median_wall_s"], 1)
    print(
        f"\nLAZ is {size_ratio}x smaller on disk but {read_ratio}x slower to read.\n"
        f"Break-even: keep LAS if you will re-read more than a few times this session."
    )


if __name__ == "__main__":
    main()
```

Representative output on an 18 M-point tile (point format 6, NAD83 UTM Zone 12N, `EPSG:6341`) reads roughly:

```text
format     size (MB)   read wall (s)   read cpu (s)
------------------------------------------------------
LAS            412.0           0.91           0.34
LAZ             61.5           2.73           2.41
```

LAZ is about 6.7x smaller on disk, but each read costs roughly 3x the wall time and 7x the CPU. Over forty iterations in a debugging session, that difference is minutes of the uncompressed copy sitting idle while the compressed one grinds.

## Key Parameter Table

| Parameter | Stage | Values | Effect |
|---|---|---|---|
| `compression` | `writers.las` | `"none"`, `"laszip"` | `"laszip"` produces `.laz`; controls on-disk size, not in-memory footprint |
| `forward` | `writers.las` | `"all"`, `"header"`, dim list | `"all"` keeps both copies byte-identical in content for a fair test |
| `minor_version` | `writers.las` | `2`–`4` | Point format 6+ requires `4`; keep identical across both copies |
| `iterations` | benchmark | int | More runs smooth out OS page-cache warm-up on the first read |

A subtle confound: the OS page cache makes the *second* read of any file faster than the first, because the bytes are already in RAM. This helps LAS and LAZ equally on wall time, but it never removes LAZ's CPU decode cost — the processor still reconstructs every point from the cached compressed bytes. That is why the CPU column is the honest signal for iterative work.

## Verification

Confirm the two working copies genuinely hold the same points before trusting any timing. A mismatch means `forward` dropped something and the comparison is invalid.

```python
import json
import pdal

def assert_identical(las_path: str, laz_path: str) -> None:
    def load(path):
        p = pdal.Pipeline(json.dumps({"pipeline": [path]}))
        p.execute()
        return p.arrays[0]

    a, b = load(las_path), load(laz_path)
    assert a.shape[0] == b.shape[0], "Point counts differ — forward:all was not honoured"
    for dim in ("X", "Y", "Z", "Intensity", "Classification"):
        assert (a[dim] == b[dim]).all(), f"Dimension {dim} differs between copies"
    print(f"OK: {a.shape[0]:,} points identical across both formats.")
```

Because LASzip is lossless, this assertion passes exactly — every stored integer round-trips. If it ever fails, suspect a differing `forward` setting or a point format downgrade, not compression itself.

<svg viewBox="0 0 720 276" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Four workflows placed by how often a tile is re-read and how scarce disk is" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Which format each workflow wants</title>
  <desc>A quadrant with re-read frequency on one axis and disk headroom on the other. Archival storage and one-pass regional production sit where LAZ wins. Iterative development on a workstation and a hot cache feeding many experiments sit where uncompressed LAS wins, because the decode cost is paid over and over while the disk cost is paid once.</desc>
  <rect x="0" y="0" width="720" height="276" fill="var(--dg-bg)" rx="10"/>
  <line x1="90" y1="50" x2="90" y2="220" stroke="var(--dg-line)" stroke-width="1.5"/>
  <line x1="90" y1="220" x2="670" y2="220" stroke="var(--dg-line)" stroke-width="1.5"/>
  <line x1="380" y1="50" x2="380" y2="220" stroke="var(--dg-line-soft)" stroke-width="1.2" stroke-dasharray="5 4"/>
  <line x1="90" y1="135" x2="670" y2="135" stroke="var(--dg-line-soft)" stroke-width="1.2" stroke-dasharray="5 4"/>
  <rect x="110" y="62" width="240" height="56" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="230" y="86" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">long-term archive</text>
  <text x="230" y="104" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">LAZ — read rarely, stored forever</text>
  <rect x="410" y="62" width="240" height="56" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="530" y="86" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">scratch working set</text>
  <text x="530" y="104" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">LAS — re-read all day, deleted after</text>
  <rect x="110" y="150" width="240" height="56" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="230" y="174" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">one-pass production</text>
  <text x="230" y="192" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">LAZ — each tile read exactly once</text>
  <rect x="410" y="150" width="240" height="56" rx="8" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="530" y="174" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">parameter sweep</text>
  <text x="530" y="192" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">LAS on a subset, LAZ for the rest</text>
  <text x="380" y="242" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">how often the same tile is read again</text>
  <text x="30" y="135" text-anchor="middle" font-size="11.5" fill="var(--dg-text)" transform="rotate(-90 30 135)">disk headroom</text>
  <text x="90" y="36" font-size="10.5" fill="var(--dg-muted)">the decision is not about the format, it is about how many times you will pay the decode</text>
</svg>

## Gotchas and Edge Cases

**1. Timing the first read of a cold file measures your disk, not the format.**
The very first read after writing a file may hit disk while later reads hit the page cache. Discard the first iteration or read each file once as a warm-up before recording, otherwise LAS looks artificially slow on spinning disks and LAZ looks artificially competitive.

**2. LAZ and LAS use identical RAM once loaded.**
It is tempting to reach for LAZ to fit a bigger tile in memory — but compression is a disk property only. `pipeline.execute()` expands both to the same NumPy array. If RAM is the constraint, tiling and dtype downcasting from the [Memory Management](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/) guide are the levers, not the file format.

**3. Multi-threaded LASzip changes the equation on many-core machines.**
The `lazrs_parallel` backend decompresses across threads and narrows LAZ's read penalty considerably. If your development box has 16+ cores mostly idle during a read, benchmark with the parallel backend before assuming uncompressed LAS wins — the CPU cost is still there, but wall time may be close enough that the disk savings dominate.

**4. Leaving uncompressed scratch files behind fills disks fast.**
An uncompressed working copy of a large survey can be many gigabytes. Treat these as disposable scratch: write them to a temp directory, and re-compress or delete them at the end of the session rather than committing them to shared storage where they multiply.

## Frequently Asked Questions

**How much slower is reading LAZ than uncompressed LAS in PDAL?**

On a typical 8-core workstation, decompressing LAZ adds roughly 2–4x to the read time of an equivalent LAS file, because LASzip must reconstruct every point record before PDAL can hand the buffer to the next stage. The exact ratio depends on point format width and disk speed, but the CPU cost is real and recurs on every single run.

**Does LAZ use less RAM than LAS once loaded?**

No. Compression only affects the on-disk representation. Once PDAL materialises the point buffer, LAZ and LAS occupy identical memory because both expand to the same NumPy structured array. The savings are purely storage and transfer bandwidth, not runtime footprint — a distinction the [Memory Management](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/) guide leans on heavily.

**Is LAZ compression lossless?**

Yes. LASzip is bit-exact: coordinates, intensity, classification, GPS time, and extra dimensions round-trip identically. Converting LAS to LAZ and back yields the same integer point records, so there is no accuracy reason to avoid it — only a speed reason during repeated reads.

**Should I keep intermediate pipeline outputs as LAZ or LAS?**

For scratch intermediates that you re-read many times in a single debugging session, uncompressed LAS avoids paying the decompression tax on each iteration. For intermediates that survive between sessions or move across machines, LAZ is worth the compression cost because you read them far less often than you store them. When several tiles are processed at once, [Optimizing PDAL for Multi-Core Processing](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/optimizing-pdal-for-multi-core-processing/) changes the arithmetic by spreading decode across cores.

---

## Related

- [Memory Management](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/) — parent guide on RAM discipline, tiling, and why compression does not change in-memory footprint
- [PDAL Pipeline Architecture & Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/) — the reader-filter-writer streaming model these timings sit inside
- [Optimizing PDAL for Multi-Core Processing](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/optimizing-pdal-for-multi-core-processing/) — parallel decode strategies that narrow LAZ's read penalty
- [Converting LAS to LAZ with PDAL](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/converting-las-to-laz-with-pdal/) — the lossless conversion that stages both working copies
- [LAS/LAZ File Structure](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/) — how the binary layout is shared between compressed and uncompressed files
