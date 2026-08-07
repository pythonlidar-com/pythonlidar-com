---
title: "Running a PDAL Pipeline in Streaming Mode"
description: "Step-by-step recipe for executing a PDAL pipeline with execute_streaming and the --stream flag, choosing a chunk size, and proving that peak memory stayed bounded on a multi-gigabyte tile."
slug: "running-a-pdal-pipeline-in-streaming-mode"
type: "howto"
breadcrumb: "Running a Pipeline in Streaming Mode"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Running a PDAL Pipeline in Streaming Mode",
      "description": "Step-by-step recipe for executing a PDAL pipeline with execute_streaming and the --stream flag, choosing a chunk size, and proving that peak memory stayed bounded on a multi-gigabyte tile.",
      "datePublished": "2026-08-07",
      "dateModified": "2026-08-07",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "PDAL Pipeline Architecture and Execution", "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/"},
        {"@type": "ListItem", "position": 3, "name": "Streaming Mode Execution", "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/"},
        {"@type": "ListItem", "position": 4, "name": "Running a Pipeline in Streaming Mode", "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/running-a-pdal-pipeline-in-streaming-mode/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Execute a PDAL pipeline in streaming mode",
      "step": [
        {"@type": "HowToStep", "name": "Assert the pipeline streams", "text": "Read pipeline.streamable and raise rather than silently falling back to standard execution."},
        {"@type": "HowToStep", "name": "Pick a chunk size", "text": "Start at 100,000 points, which costs roughly 35 MB of working set on a typical point layout."},
        {"@type": "HowToStep", "name": "Call execute_streaming", "text": "Invoke pipeline.execute_streaming(chunk_size=100000) and capture the returned point count."},
        {"@type": "HowToStep", "name": "Measure peak memory", "text": "Read ru_maxrss from resource.getrusage after the run and confirm it is near the chunk working set."},
        {"@type": "HowToStep", "name": "Prove equivalence", "text": "Run the same chain conventionally on a small tile and assert the two point counts match exactly."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does execute_streaming return a number instead of arrays?",
          "acceptedAnswer": {"@type": "Answer", "text": "Because no complete array ever exists. Streaming keeps only one chunk in memory at a time, so there is nothing to hand back except the total number of points the writer accepted. If your code needs pipeline.arrays afterwards, it needs standard execution and the memory that comes with it."}
        },
        {
          "@type": "Question",
          "name": "Does the --stream flag fall back to standard mode?",
          "acceptedAnswer": {"@type": "Answer", "text": "No. pdal pipeline --stream fails with an error naming the blocking stage rather than quietly running the pipeline the expensive way. That refusal is the useful behaviour: a silent fallback is how a job ends up needing thirty gigabytes in production having been tested on a small tile."}
        },
        {
          "@type": "Question",
          "name": "How much memory should a streaming run actually use?",
          "acceptedAnswer": {"@type": "Answer", "text": "Roughly the chunk size multiplied by the bytes per point multiplied by the number of stages holding a buffer, plus a fixed overhead of a few tens of megabytes for PDAL, GDAL and PROJ themselves. At 100,000 points and a 40-byte point layout that is about 35 MB total, and it should not move when the input file gets larger."}
        },
        {
          "@type": "Question",
          "name": "Can I stream directly from S3?",
          "acceptedAnswer": {"@type": "Answer", "text": "Yes, and it is one of the strongest reasons to stream. A LAZ object read through the GDAL virtual filesystem is fetched in ranges, and a streaming pipeline consumes those ranges as they arrive, so neither the object nor the decoded cloud is ever fully resident."}
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Build a chain of per-point stages, guard on `pipeline.streamable`, then call `pipeline.execute_streaming(chunk_size=100_000)` — or `pdal pipeline --stream` on the command line — and confirm with `ru_maxrss` that peak memory sits near the chunk working set instead of tracking the input file size.

## Context and Motivation

This recipe is part of [Streaming Mode Execution in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/), which explains the pull-loop execution model and which stages participate in it. Here the focus is narrower: taking a pipeline you already have and actually running it in streaming mode, with enough instrumentation that you can tell whether it worked.

The motivation is nearly always a memory ceiling. A worker with 4 GB of RAM cannot read a 6 GB tile conventionally, no matter how simple the filtering is, because standard execution materialises the whole cloud before the first filter runs. Retiling the input is one answer and a laborious one. Streaming is the other, and for a chain of range filters and a reprojection it takes about four lines of change. The catch is that nothing about the ordinary API tells you which mode you got, so the recipe below spends as much effort on verification as on execution.

<svg viewBox="0 0 720 246" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The three-line difference between a conventional and a streaming pipeline execution" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>The whole change, side by side</title>
  <desc>Two short call sequences. The conventional one constructs a pipeline and calls execute, then reads pipeline.arrays. The streaming one constructs the same pipeline, asserts pipeline.streamable, calls execute_streaming with a chunk size, and works with the returned count. The pipeline JSON is identical in both.</desc>
  <rect x="0" y="0" width="720" height="246" fill="var(--dg-bg)" rx="10"/>
  <text x="185" y="38" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-c)">conventional</text>
  <text x="535" y="38" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-d)">streaming</text>
  <rect x="20" y="50" width="330" height="34" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.1"/>
  <text x="34" y="72" font-size="11" fill="var(--dg-text)">p = pdal.Pipeline(spec)</text>
  <rect x="20" y="90" width="330" height="34" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.1"/>
  <text x="34" y="112" font-size="11" fill="var(--dg-muted)">— no capability check —</text>
  <rect x="20" y="130" width="330" height="34" rx="5" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="34" y="152" font-size="11" fill="var(--dg-text)">n = p.execute()</text>
  <rect x="20" y="170" width="330" height="34" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.1"/>
  <text x="34" y="192" font-size="11" fill="var(--dg-text)">arr = p.arrays[0]</text>
  <rect x="370" y="50" width="330" height="34" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.1"/>
  <text x="384" y="72" font-size="11" fill="var(--dg-text)">p = pdal.Pipeline(spec)</text>
  <rect x="370" y="90" width="330" height="34" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="384" y="112" font-size="11" fill="var(--dg-text)">assert p.streamable</text>
  <rect x="370" y="130" width="330" height="34" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="384" y="152" font-size="11" fill="var(--dg-text)">n = p.execute_streaming(100_000)</text>
  <rect x="370" y="170" width="330" height="34" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.1"/>
  <text x="384" y="192" font-size="11" fill="var(--dg-muted)">— no arrays; there is no array —</text>
  <text x="20" y="230" font-size="10.5" fill="var(--dg-muted)">the pipeline JSON is byte-for-byte identical on both sides; only the execution call differs</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL | 2.3+ (the Python `execute_streaming` API) |
| Python | 3.9+ with the `pdal` bindings installed |
| Input tile | LAS, LAZ or COPC — all stream; a text reader also streams but slowly |
| Filter chain | per-point stages only; see [which filters break streaming](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/which-pdal-filters-break-streaming-mode/) |
| Platform | `resource.getrusage` for peak RSS is POSIX; on Windows use `psutil.Process().memory_info().peak_wset` |

The example assumes a tile in a projected metric CRS. Nothing about streaming requires that, but the reprojection stage in the chain does need to know what it is transforming from, which the [spatial reprojection](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/) guide covers in detail.

## Step-by-Step Implementation

### Step 1 — Build the chain from per-point stages only

Streaming is a property of the whole chain, so the design work happens before any execution call. Keep classification, sorting and neighbourhood filters out of this pipeline.

```json
{
  "pipeline": [
    {"type": "readers.las", "filename": "tile_0431.laz"},
    {"type": "filters.range", "limits": "Z[-30:5000]"},
    {"type": "filters.range", "limits": "Classification![7:7]"},
    {"type": "filters.reprojection", "out_srs": "EPSG:6318"},
    {"type": "writers.las", "filename": "tile_0431_clean.laz", "compression": "laszip", "forward": "all"}
  ]
}
```

### Step 2 — Ask the pipeline whether it streams

```python
import pdal

pipeline = pdal.Pipeline(spec)
if not pipeline.streamable:
    raise RuntimeError("chain contains a blocking stage — cannot stream")
```

This costs nothing and converts the failure mode from "used 30 GB in production" into a message at startup.

### Step 3 — Choose a chunk size deliberately

The default of 10,000 points is safe but leaves throughput on the table. A hundred thousand is the value worth writing down: about 35 MB of working set on a typical 40-byte point layout, and close to the throughput ceiling.

### Step 4 — Execute and capture the count

```python
count = pipeline.execute_streaming(chunk_size=100_000)
```

The returned integer is the number of points the writer accepted. There is no `pipeline.arrays` afterwards, because no complete array was ever assembled.

### Step 5 — On the command line, use `--stream`

```bash
pdal pipeline clean.json --stream --verbose 4
```

If any stage blocks, this exits non-zero and names it. There is no fallback, which is exactly what you want in a CI check.

## Complete Working Example

Save as `stream_run.py`. It runs the pipeline, records peak memory, and cross-checks the streaming result against a conventional run on a capped subset of the same file.

```python
"""Run a PDAL pipeline in streaming mode and prove the memory claim."""
from __future__ import annotations

import argparse
import json
import logging
import resource
import time
from pathlib import Path

import pdal

LOG = logging.getLogger("stream_run")


def spec(src: Path, dst: Path, out_srs: str, count: int | None = None) -> str:
    reader = {"type": "readers.las", "filename": str(src)}
    if count is not None:
        reader["count"] = count
    return json.dumps({
        "pipeline": [
            reader,
            {"type": "filters.range", "limits": "Z[-30:5000]"},
            {"type": "filters.range", "limits": "Classification![7:7]"},
            {"type": "filters.reprojection", "out_srs": out_srs},
            {
                "type": "writers.las",
                "filename": str(dst),
                "compression": "laszip",
                "minor_version": 4,
                "dataformat_id": 6,
                "forward": "all",
            },
        ]
    })


def peak_rss_mb() -> float:
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0


def stream(src: Path, dst: Path, out_srs: str, chunk: int) -> dict:
    pipeline = pdal.Pipeline(spec(src, dst, out_srs))
    if not pipeline.streamable:
        raise RuntimeError("pipeline is not streamable; inspect the stage list")

    started = time.perf_counter()
    written = pipeline.execute_streaming(chunk_size=chunk)
    elapsed = time.perf_counter() - started

    return {
        "mode": "streaming",
        "chunk_size": chunk,
        "points": written,
        "seconds": round(elapsed, 2),
        "peak_rss_mb": round(peak_rss_mb(), 1),
    }


def equivalence_check(src: Path, out_srs: str, sample: int = 200_000) -> None:
    """Run both modes over the same capped subset and compare counts."""
    plain = pdal.Pipeline(spec(src, Path("/tmp/_plain.laz"), out_srs, count=sample))
    plain_n = plain.execute()

    streamed = pdal.Pipeline(spec(src, Path("/tmp/_stream.laz"), out_srs, count=sample))
    streamed_n = streamed.execute_streaming(chunk_size=25_000)

    if plain_n != streamed_n:
        raise AssertionError(
            f"mode mismatch: standard kept {plain_n}, streaming kept {streamed_n}"
        )
    LOG.info("equivalence check passed on %d sampled points", sample)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src", type=Path)
    ap.add_argument("dst", type=Path)
    ap.add_argument("--out-srs", default="EPSG:6318")
    ap.add_argument("--chunk", type=int, default=100_000)
    ap.add_argument("--check", action="store_true", help="cross-check against standard mode first")
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    if args.check:
        equivalence_check(args.src, args.out_srs)

    result = stream(args.src, args.dst, args.out_srs, args.chunk)
    LOG.info("done: %s", json.dumps(result))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
```

Running it against a 2.1 GB tile on a worker with a 1 GB memory limit succeeds, which is the whole point:

```bash
python stream_run.py tile_0431.laz tile_0431_clean.laz --chunk 100000 --check
```

## Key Parameter Table

| Parameter | Type | Default | Guidance |
|---|---|---|---|
| `chunk_size` | int | 10000 | 100,000 is the general-purpose value; below 10,000 the overhead dominates |
| `count` on the reader | int | all points | Cap the input for a fast smoke test without retiling |
| `--stream` | CLI flag | off | Fails loudly rather than falling back; use it in CI |
| `--verbose` | int 0–8 | 0 | At 4 or above, PDAL logs which stage refused to stream |
| `compression` on the writer | string | none | `laszip` costs CPU per chunk but keeps the output small |

## Verification

Three assertions turn "it ran" into "it streamed and produced the right answer".

**Peak memory is flat across input sizes.** Run the same command against a 200 MB tile and a 2 GB tile. Peak RSS should differ by a few megabytes, not by an order of magnitude.

```bash
/usr/bin/time -v python stream_run.py small.laz small_out.laz 2>&1 | grep "Maximum resident"
/usr/bin/time -v python stream_run.py big.laz big_out.laz 2>&1 | grep "Maximum resident"
```

**Counts match standard mode.** That is what `--check` does above, on a capped subset so the comparison is affordable.

**The output header is complete.** `pdal info tile_0431_clean.laz --metadata` should report the new CRS, a point count equal to the returned integer, and a bounding box consistent with the reprojected extent.

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Resident memory sampled once a second through a streaming run and a conventional run of the same tile" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What the memory trace looks like when it worked</title>
  <desc>Resident memory sampled through two runs of the same 2.1 gigabyte tile. The conventional run climbs steadily for the first third as the reader materialises the cloud, plateaus above three gigabytes, and falls only at the end. The streaming run rises to about thirty-five megabytes in the first second and stays there for the whole run, with a small sawtooth as each chunk is allocated and released.</desc>
  <rect x="0" y="0" width="720" height="250" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="40" x2="80" y2="196" stroke="var(--dg-line)" stroke-width="1.5"/>
  <line x1="80" y1="196" x2="690" y2="196" stroke="var(--dg-line)" stroke-width="1.5"/>
  <polyline points="80,194 150,150 220,104 290,64 420,60 520,62 600,180 660,194" fill="none" stroke="var(--dg-e)" stroke-width="2.5"/>
  <polyline points="80,194 110,186 140,190 170,185 200,190 230,186 260,190 290,185 320,190 350,186 380,190 410,185 440,190 470,186 500,190 530,185 560,190 590,186 620,190 650,187 680,194" fill="none" stroke="var(--dg-d)" stroke-width="2.3"/>
  <text x="300" y="96" font-size="11" fill="var(--dg-e)">standard — 3.2 GB plateau</text>
  <text x="300" y="176" font-size="11" fill="var(--dg-d)">streaming — 35 MB sawtooth</text>
  <text x="72" y="200" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">0</text>
  <text x="72" y="124" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">2 GB</text>
  <text x="72" y="44" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">4 GB</text>
  <text x="385" y="218" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">elapsed seconds</text>
  <text x="26" y="118" text-anchor="middle" font-size="11.5" fill="var(--dg-text)" transform="rotate(-90 26 118)">resident set</text>
  <text x="80" y="238" font-size="10.5" fill="var(--dg-muted)">if your streaming trace has a ramp in it, something in the chain is accumulating — start with the writer</text>
</svg>

## Gotchas and Edge Cases

**Checking `streamable` and then calling `execute()`.** The guard passes, the run is conventional, and nothing warns you. Grep your own code for `execute(` in any function that also mentions streaming.

**A chunk size larger than the file.** Perfectly legal and completely pointless: one chunk means one buffer holding everything, which is standard mode with extra steps. On small tiles the memory graph will look wrong for exactly this reason.

**`writers.gdal` in the chain.** Rasterization accumulates cells over the whole input, so the pipeline will not stream. Split it into a streaming point-domain pass and a second rasterizing pass — the approach described in [splitting a blocking pipeline into two passes](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/splitting-a-blocking-pipeline-into-two-passes/).

**Reading from S3 without tuning GDAL.** Streaming from an object store works well, but the default virtual-filesystem settings issue a directory listing on every open. Set `GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR` before the run — the [S3 and cloud storage I/O](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/) guide covers the rest of the environment.

<svg viewBox="0 0 720 244" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Four ways a streaming run silently reverts to conventional behaviour" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Four ways to think you are streaming when you are not</title>
  <desc>Four failure rows, each pairing a symptom with the cause. Flat throughput with high memory means execute was called instead of execute_streaming. Memory tracking the file means a blocking stage was added after the capability check. A single chunk means the chunk size exceeds the point count. Slow reads with low memory means the object store, not the pipeline, is the bottleneck.</desc>
  <rect x="0" y="0" width="720" height="244" fill="var(--dg-bg)" rx="10"/>
  <text x="180" y="38" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">what you observe</text>
  <text x="520" y="38" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">what it actually is</text>
  <rect x="20" y="48" width="320" height="38" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="180" y="72" text-anchor="middle" font-size="11" fill="var(--dg-text)">memory tracks the file size</text>
  <rect x="380" y="48" width="320" height="38" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="540" y="72" text-anchor="middle" font-size="11" fill="var(--dg-text)">execute() was called, not execute_streaming()</text>
  <rect x="20" y="96" width="320" height="38" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="180" y="120" text-anchor="middle" font-size="11" fill="var(--dg-text)">streamable is False after an edit</text>
  <rect x="380" y="96" width="320" height="38" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="540" y="120" text-anchor="middle" font-size="11" fill="var(--dg-text)">a blocking filter was added to the chain</text>
  <rect x="20" y="144" width="320" height="38" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="180" y="168" text-anchor="middle" font-size="11" fill="var(--dg-text)">one chunk, memory looks wrong</text>
  <rect x="380" y="144" width="320" height="38" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="540" y="168" text-anchor="middle" font-size="11" fill="var(--dg-text)">chunk_size exceeds the tile point count</text>
  <rect x="20" y="192" width="320" height="38" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="180" y="216" text-anchor="middle" font-size="11" fill="var(--dg-text)">low memory but very slow</text>
  <rect x="380" y="192" width="320" height="38" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="540" y="216" text-anchor="middle" font-size="11" fill="var(--dg-text)">object-store latency, not the pipeline</text>
</svg>

## Frequently Asked Questions

**Why does `execute_streaming` return a number instead of arrays?**

Because no complete array ever exists. Streaming keeps one chunk in memory at a time, so there is nothing to hand back except the total the writer accepted. Code that needs `pipeline.arrays` needs standard execution and the memory that comes with it.

**Does the `--stream` flag fall back to standard mode?**

No. It fails and names the blocking stage. That refusal is the useful behaviour — a silent fallback is how a job ends up needing thirty gigabytes in production having passed on a small tile in testing.

**How much memory should a streaming run actually use?**

Roughly `chunk_size × bytes-per-point × live buffers`, plus a few tens of megabytes for PDAL, GDAL and PROJ themselves. At 100,000 points and a 40-byte layout that is about 35 MB — and it should not move when the input grows.

**Can I stream directly from S3?**

Yes, and it is one of the better reasons to stream. A LAZ object read through the GDAL virtual filesystem arrives in ranges, and a streaming pipeline consumes them as they land, so neither the object nor the decoded cloud is ever fully resident.

---

## Related

- [Streaming Mode Execution in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/) — the parent guide to the execution model
- [Which PDAL Filters Break Streaming Mode](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/which-pdal-filters-break-streaming-mode/) — the capability rules behind `streamable`
- [Splitting a Blocking Pipeline into Two Passes](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/splitting-a-blocking-pipeline-into-two-passes/) — what to do when one stage cannot stream
- [Memory Management in PDAL Pipelines](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/) — the buffer model this is an alternative to
- [PDAL Pipeline Architecture and Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/) — the section overview
