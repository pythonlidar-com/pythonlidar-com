---
title: "Measuring Peak Memory of a PDAL Pipeline"
description: "Measure the real peak resident memory of PDAL runs: /usr/bin/time -v for the CLI, getrusage for subprocesses, a psutil sampler for in-process Python runs, and a per-stage memory profile to find the stage that sets the peak."
slug: "measuring-peak-memory-of-a-pdal-pipeline"
type: "howto"
breadcrumb: "Measuring Peak Memory"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Measuring Peak Memory of a PDAL Pipeline",
      "description": "Measure the real peak resident memory of PDAL runs: /usr/bin/time -v for the CLI, getrusage for subprocesses, a psutil sampler for in-process Python runs, and a per-stage memory profile to find the stage that sets the peak.",
      "datePublished": "2026-09-18",
      "dateModified": "2026-09-18",
      "author": {
        "@type": "Organization",
        "name": "pythonlidar.com"
      }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Home",
          "item": "https://www.pythonlidar.com/"
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": "PDAL Pipeline Architecture and Execution",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Memory Management",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Measuring Peak Memory",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/measuring-peak-memory-of-a-pdal-pipeline/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Measure the peak memory of a PDAL pipeline",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Measure a CLI run",
          "text": "GNU time reports the maximum RSS of the process and its children:"
        },
        {
          "@type": "HowToStep",
          "name": "Measure a subprocess from Python",
          "text": "Run PDAL as a child process and read the children's maximum RSS after it exits. This is exact and costs nothing during the run."
        },
        {
          "@type": "HowToStep",
          "name": "Measure an in-process run",
          "text": "When the pipeline runs inside your Python process, sample psutil.Process().memory_info().rss every 50\u2013100 ms in a thread and keep the maximum. Subtract the baseline taken before execution."
        },
        {
          "@type": "HowToStep",
          "name": "Attribute the peak to a stage",
          "text": "Run cumulative prefixes of the pipeline \u2014 reader only, reader plus first filter, and so on \u2014 and measure each. The stage whose addition causes the largest jump is the one to optimize."
        },
        {
          "@type": "HowToStep",
          "name": "Record alongside the tile's point count",
          "text": "Store peak memory with the point count, so you can fit bytes per point and predict memory for any tile."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does tracemalloc show almost no memory for a PDAL run?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because PDAL allocates its point tables and indexes in C++, outside Python's allocator. tracemalloc only tracks Python allocations. Measure the process's resident set size instead."
          }
        },
        {
          "@type": "Question",
          "name": "What is the simplest way to get the peak memory of a PDAL command?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run it under GNU time with the verbose flag and read the maximum resident set size line. It needs no code and has no overhead."
          }
        },
        {
          "@type": "Question",
          "name": "How do I find which stage uses the most memory?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Measure peaks for cumulative prefixes of the pipeline: reader alone, reader plus the first filter, and so on. The largest increase between consecutive prefixes identifies the stage."
          }
        },
        {
          "@type": "Question",
          "name": "Why was my container killed when the process used less than the limit?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Container memory accounting includes page cache from file reads. Large inputs fill the cache, pushing the cgroup total past the limit. Check the cgroup's peak value and give the container headroom above the process peak."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** For a command-line run, `/usr/bin/time -v pdal pipeline p.json` reports "Maximum resident set size". For a pipeline run in a subprocess from Python, read `resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss` afterwards. For in-process `pdal.Pipeline.execute()`, sample RSS with psutil in a background thread. `tracemalloc` will not help — PDAL's allocations happen in C++.

## Context and Motivation

This guide is part of [Memory Management in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/). An estimate tells you what memory should be; a measurement tells you what it is. You need the measurement to size batch workers, to confirm that a change such as streaming or dropping a dimension actually helped, and to find which stage sets the peak. Python's own memory tools are the wrong instrument here: PDAL allocates its point tables and spatial indexes in native code, invisible to `tracemalloc` and to Python object counting. What matters is the operating system's view — the process's resident set size, and specifically its maximum over the run.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Resident memory over time for a PDAL pipeline with the peak during SMRF" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Memory over a run</title>
  <desc>A line of resident memory against time for one pipeline. Memory ramps up during reading to about 2.4 gigabytes, rises during SMRF to a peak of about 4.9 gigabytes while its index exists, drops back after SMRF, and rises briefly during writers.gdal. The peak is marked; this single number is what a worker must accommodate.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <line x1="60" y1="180" x2="700" y2="180" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="60" y1="180" x2="60" y2="24" stroke="var(--dg-line)" stroke-width="1.3"/>
  <polyline points="60,178 90,160 150,110 200,104 230,104 260,60 300,44 340,44 370,100 420,104 470,96 500,90 540,104 600,170 700,176" fill="none" stroke="var(--dg-a)" stroke-width="2"/>
  <circle cx="320" cy="44" r="5" fill="var(--dg-e)"/>
  <text x="330" y="36" font-size="10.5" fill="var(--dg-e)">peak 4.9 GB during SMRF</text>
  <g font-size="10" fill="var(--dg-muted)"><text text-anchor="middle" x="130" y="198">read</text><text text-anchor="middle" x="300" y="198">smrf</text><text text-anchor="middle" x="440" y="198">range, hag</text><text text-anchor="middle" x="520" y="198">gdal</text><text text-anchor="middle" x="640" y="198">exit</text></g>
  <text x="52" y="108" text-anchor="end" font-size="10" fill="var(--dg-muted)">2.4</text>
  <text x="52" y="48" text-anchor="end" font-size="10" fill="var(--dg-muted)">4.9</text>
  <text x="380" y="214" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">time (illustrative)</text>
</svg>

## Prerequisites and Assumptions

- Linux, where `/usr/bin/time -v` and `ru_maxrss` in kilobytes behave as described. On macOS `ru_maxrss` is in bytes and `time -l` replaces `time -v`.
- Python 3.10+ with `psutil` for sampling.
- A representative tile — preferably the largest in the batch, since that is what the worker must fit.

## Step-by-Step Implementation

### Step 1 — Measure a CLI run

GNU time reports the maximum RSS of the process and its children:

```bash
/usr/bin/time -v pdal pipeline dtm.json 2> time.log
grep "Maximum resident set size" time.log
```

### Step 2 — Measure a subprocess from Python

Run PDAL as a child process and read the children's maximum RSS after it exits. This is exact and costs nothing during the run.

### Step 3 — Measure an in-process run

When the pipeline runs inside your Python process, sample `psutil.Process().memory_info().rss` every 50–100 ms in a thread and keep the maximum. Subtract the baseline taken before execution.

### Step 4 — Attribute the peak to a stage

Run cumulative prefixes of the pipeline — reader only, reader plus first filter, and so on — and measure each. The stage whose addition causes the largest jump is the one to optimize.

### Step 5 — Record alongside the tile's point count

Store peak memory with the point count, so you can fit bytes per point and predict memory for any tile.

## Complete Working Example

```python
"""Peak memory of a PDAL pipeline: subprocess, in-process sampling, per-stage prefixes."""
from __future__ import annotations

import json
import resource
import subprocess
import tempfile
import threading
import time
from pathlib import Path

import pdal
import psutil


def peak_subprocess(spec: dict) -> float:
    """Peak RSS in GB of `pdal pipeline` run as a child process (Linux: ru_maxrss in KB)."""
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(spec, f)
    before = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
    subprocess.run(["pdal", "pipeline", f.name], check=True)
    after = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
    Path(f.name).unlink()
    return max(after, before) / 1e6


def peak_in_process(spec: dict, interval: float = 0.05) -> float:
    proc = psutil.Process()
    base = proc.memory_info().rss
    peak = base
    done = threading.Event()

    def sample() -> None:
        nonlocal peak
        while not done.is_set():
            peak = max(peak, proc.memory_info().rss)
            time.sleep(interval)

    t = threading.Thread(target=sample, daemon=True)
    t.start()
    try:
        pdal.Pipeline(json.dumps(spec)).execute()
    finally:
        done.set()
        t.join()
    return (peak - base) / 1e9


def per_stage(spec: dict) -> list[tuple[str, float]]:
    stages = spec["pipeline"]
    results = []
    for i in range(1, len(stages) + 1):
        prefix = [s for s in stages[:i] if not str(s.get("type", "")).startswith("writers.")]
        if not prefix:
            continue
        gb = peak_subprocess({"pipeline": prefix})
        results.append((stages[i - 1].get("type", "reader"), gb))
    return results


if __name__ == "__main__":
    spec = json.loads(Path("dtm.json").read_text())
    print(f"subprocess peak: {peak_subprocess(spec):.2f} GB")
    for stage, gb in per_stage(spec):
        print(f"  up to {stage:<24} {gb:6.2f} GB")
```

Note that `RUSAGE_CHILDREN` reports the maximum over *all* children so far, which is why `per_stage` works best when each prefix runs in a fresh Python process or when prefixes are run in increasing order of expected memory. For clean per-stage numbers, wrap each call in its own short-lived Python process.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Per-stage prefix measurements showing which stage adds the most memory" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Which stage sets the peak</title>
  <desc>Stepped bars of peak memory for cumulative pipeline prefixes. Reader alone: 2.4 gigabytes. Adding the noise range filter: 2.4. Adding SMRF: 4.9, the largest jump. Adding the ground range filter: 4.9. Adding HAG: 5.1. SMRF is highlighted as the stage to optimize.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <line x1="60" y1="160" x2="700" y2="160" stroke="var(--dg-line)" stroke-width="1.3"/>
  <rect x="90" y="100" width="90" height="60" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/>
  <rect x="200" y="100" width="90" height="60" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/>
  <rect x="310" y="38" width="90" height="122" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.4"/>
  <rect x="420" y="38" width="90" height="122" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/>
  <rect x="530" y="32" width="90" height="128" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/>
  <g font-size="10.5" fill="var(--dg-text)"><text text-anchor="middle" x="135" y="94">2.4</text><text text-anchor="middle" x="245" y="94">2.4</text><text text-anchor="middle" x="355" y="32">4.9</text><text text-anchor="middle" x="465" y="32">4.9</text><text text-anchor="middle" x="575" y="26">5.1</text></g>
  <g font-size="10" fill="var(--dg-muted)"><text text-anchor="middle" x="135" y="178">reader</text><text text-anchor="middle" x="245" y="178">+ range</text><text text-anchor="middle" x="355" y="178">+ smrf</text><text text-anchor="middle" x="465" y="178">+ range</text><text text-anchor="middle" x="575" y="178">+ hag_nn</text></g>
  <text x="380" y="196" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">peak GB per cumulative prefix; the biggest step is the stage to work on</text>
</svg>

## Key Parameter Table

| Method | Measures | Overhead | Use when |
|---|---|---|---|
| `/usr/bin/time -v` | max RSS of the command | none | Shell and CLI runs |
| `RUSAGE_CHILDREN` | max RSS of any finished child | none | Python launching `pdal pipeline` |
| psutil sampler | RSS sampled at an interval | small | In-process `pdal.Pipeline` |
| cgroup `memory.peak` | peak of a container | none | Docker, Kubernetes, Batch |
| `tracemalloc` | Python allocations only | moderate | Not useful for PDAL's native memory |

## Verification

- **Two methods agree.** For one tile, the subprocess and in-process measurements should be within a few percent once the in-process baseline is subtracted.
- **Linear in points.** Measure three tiles of different sizes; peak memory against point count should be close to a straight line. A curve upward points to a stage with super-linear memory, usually a raster writer at fine resolution.
- **Matches the estimate.** Compare with the prediction from [estimating PDAL memory from point layout](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/estimating-pdal-memory-from-point-layout/).

## Gotchas and Edge Cases

**Sampling misses short spikes.** A 100 ms interval can miss a spike that lasts 50 ms. Use the subprocess method when you need the true maximum; use sampling for a memory-over-time picture.

**Freed memory is not always returned.** The allocator may keep freed pages mapped, so RSS after a stage can stay high even though PDAL released the memory. The peak is still correct; the "after" value is not a measure of what is in use.

**Containers report differently.** In Docker, the container's cgroup counts page cache as well. A container can be killed for exceeding its limit even when the process RSS looks fine, because reading a large LAZ fills the cache. Check `memory.peak` (cgroup v2) inside the container.

<svg viewBox="40 20 660 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Process RSS versus container cgroup memory including page cache" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>What the container counts</title>
  <desc>Two stacked bars. The process view shows resident memory of 5.1 gigabytes. The container view shows the same 5.1 gigabytes plus 2.2 gigabytes of page cache from reading the input, totalling 7.3 gigabytes, which is what the container memory limit is compared against.</desc>
  <rect x="40" y="20" width="660" height="150" fill="var(--dg-bg)" rx="10"/>
  <text x="170" y="56" text-anchor="end" font-size="11" fill="var(--dg-text)">process RSS</text>
  <rect x="180" y="40" width="306" height="26" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="494" y="58" font-size="10.5" fill="var(--dg-muted)">5.1 GB</text>
  <text x="170" y="116" text-anchor="end" font-size="11" fill="var(--dg-text)">container cgroup</text>
  <rect x="180" y="100" width="306" height="26" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <rect x="486" y="100" width="132" height="26" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="552" y="118" text-anchor="middle" font-size="10" fill="var(--dg-text)">page cache</text>
  <text x="626" y="118" font-size="10.5" fill="var(--dg-muted)">7.3 GB</text>
  <text x="180" y="156" font-size="10.5" fill="var(--dg-muted)">the limit applies to the lower bar</text>
</svg>

**Threads and OMP.** Stages that use OpenMP allocate per-thread buffers. Peak memory can rise with `OMP_NUM_THREADS`, so measure with the thread setting you will run in production.

## Frequently Asked Questions

**Why does tracemalloc show almost no memory for a PDAL run?**

Because PDAL allocates its point tables and indexes in C++, outside Python's allocator. tracemalloc only tracks Python allocations. Measure the process's resident set size instead.

**What is the simplest way to get the peak memory of a PDAL command?**

Run it under GNU time with the verbose flag and read the maximum resident set size line. It needs no code and has no overhead.

**How do I find which stage uses the most memory?**

Measure peaks for cumulative prefixes of the pipeline: reader alone, reader plus the first filter, and so on. The largest increase between consecutive prefixes identifies the stage.

**Why was my container killed when the process used less than the limit?**

Container memory accounting includes page cache from file reads. Large inputs fill the cache, pushing the cgroup total past the limit. Check the cgroup's peak value and give the container headroom above the process peak.

## Related

- [Memory Management in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/) — how PDAL allocates
- [Estimating PDAL Memory from Point Layout](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/estimating-pdal-memory-from-point-layout/) — the prediction to check
- [Diagnosing PDAL Out-of-Memory Failures](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/diagnosing-pdal-out-of-memory-failures/) — when measurement comes too late
- [Running a PDAL Pipeline in Streaming Mode](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/running-a-pdal-pipeline-in-streaming-mode/) — the biggest lever on peak memory
- [Building a Slim PDAL Docker Image](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/building-a-slim-pdal-docker-image/) — containers where the cgroup limit applies
