---
title: "Diagnosing PDAL Out-of-Memory Failures"
description: "Estimate PDAL peak memory from points, point width and live buffers, tell a bad_alloc apart from an OOM kill, and work through the four levers in the order that actually helps."
slug: "diagnosing-pdal-out-of-memory-failures"
type: "howto"
breadcrumb: "Diagnosing Out-of-Memory Failures"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Diagnosing PDAL Out-of-Memory Failures",
      "description": "Estimate PDAL peak memory from points, point width and live buffers, tell a bad_alloc apart from an OOM kill, and work through the four levers in the order that actually helps.",
      "datePublished": "2026-08-07",
      "dateModified": "2026-08-07",
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
          "name": "Diagnosing Out-of-Memory Failures",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/diagnosing-pdal-out-of-memory-failures/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Diagnose and fix a PDAL out-of-memory failure",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Estimate before profiling",
          "text": "Multiply the point count by the bytes per point from the schema and by the number of live buffers to get the requirement."
        },
        {
          "@type": "HowToStep",
          "name": "Identify what killed the process",
          "text": "A bad_alloc in the log is an allocation failure; a silent exit 137 is the kernel or container limit, and the two have different fixes."
        },
        {
          "@type": "HowToStep",
          "name": "Drop unused dimensions",
          "text": "Remove dimensions the pipeline never reads, which often halves the per-point width for free."
        },
        {
          "@type": "HowToStep",
          "name": "Stream the chain if it can stream",
          "text": "Switching to streaming execution removes the point count from the memory expression entirely."
        },
        {
          "@type": "HowToStep",
          "name": "Tile the input last",
          "text": "Retile only when a genuinely blocking stage must see more points than the machine can hold."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How do I estimate PDAL memory before running anything?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Multiply three numbers: the point count from pdal info --summary, the sum of the dimension widths from pdal info --schema, and the number of buffers alive at once, which is two for a linear chain during each hand-off. Add a few hundred megabytes for PDAL, GDAL and PROJ themselves and the estimate is usually within twenty percent."
          }
        },
        {
          "@type": "Question",
          "name": "What is the difference between bad_alloc and exit code 137?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A bad_alloc means PDAL asked the allocator for memory and was refused, and it appears in the log. Exit 137 means something outside the process \u2014 the kernel OOM killer or a container memory limit \u2014 terminated it, and there is no application-level message at all. The first is fixed by asking for less; the second may also be fixed by raising the limit."
          }
        },
        {
          "@type": "Question",
          "name": "Why does memory climb across tiles in a loop?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because your loop is holding references. pipeline.arrays keeps the point data alive as long as the pipeline object exists, so a list of results accumulates every tile. Delete the pipeline and its arrays each iteration, or process each tile in its own worker process."
          }
        },
        {
          "@type": "Question",
          "name": "Does lowering chunk_size always reduce memory?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "In streaming mode, yes, and roughly linearly. In standard mode chunk_size has no effect at all, because the reader materialises the whole cloud regardless \u2014 which is why checking pipeline.streamable comes before tuning the chunk."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Estimate the requirement before you run — points × bytes-per-point × live buffers — then attack it in this order: drop unused dimensions, stream the chain, lower `chunk_size`, tile the input. A `std::bad_alloc` almost never means the machine is too small; it means the pipeline asked for the whole file when it did not have to.

## Context and Motivation

This guide belongs to [Memory Management in PDAL Pipelines](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/), which explains the buffer model. Here we work backwards from the failure: a job that ran fine on last week's tiles has just died with `std::bad_alloc`, or the container was killed by the out-of-memory reaper with no message at all, and you need to know why before you can decide what to change.

The first thing worth internalising is that PDAL's memory use is predictable to within about twenty percent. It is not a mystery to be profiled; it is an arithmetic expression with three terms. Points is what the reader delivers. Bytes-per-point is the sum of the dimension widths in the point layout. Live buffers is how many stages are holding a view at the same moment, which for a linear chain peaks at two during each hand-off. Multiply those and you have the requirement. When the answer is larger than the machine, no amount of tuning fixes it — the input has to shrink or the execution mode has to change.

<svg viewBox="0 0 720 258" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The three terms that set PDAL peak memory and the lever each one offers" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Three terms, three levers</title>
  <desc>Peak memory is the product of three terms. The point count is reduced by cropping, tiling or streaming. The bytes per point are reduced by dropping dimensions the pipeline never reads. The live buffer count is reduced by shortening the chain or splitting it into passes. Each term has a different lever and they multiply, so halving two of them quarters the requirement.</desc>
  <rect x="0" y="0" width="720" height="258" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="46" width="200" height="60" rx="8" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.4"/>
  <text x="120" y="72" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">points</text>
  <text x="120" y="92" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">18,400,000</text>
  <text x="240" y="82" text-anchor="middle" font-size="18" font-weight="700" fill="var(--dg-muted)">×</text>
  <rect x="260" y="46" width="200" height="60" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.4"/>
  <text x="360" y="72" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">bytes per point</text>
  <text x="360" y="92" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">40 B for a typical layout</text>
  <text x="480" y="82" text-anchor="middle" font-size="18" font-weight="700" fill="var(--dg-muted)">×</text>
  <rect x="500" y="46" width="200" height="60" rx="8" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.4"/>
  <text x="600" y="72" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">live buffers</text>
  <text x="600" y="92" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">2 during each hand-off</text>
  <rect x="20" y="122" width="200" height="46" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="120" y="142" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">crop · tile · stream</text>
  <text x="120" y="158" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">the biggest lever</text>
  <rect x="260" y="122" width="200" height="46" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="360" y="142" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">drop unused dimensions</text>
  <text x="360" y="158" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">often a third, for free</text>
  <rect x="500" y="122" width="200" height="46" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="600" y="142" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">split the chain</text>
  <text x="600" y="158" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">smallest effect, most work</text>
  <rect x="20" y="188" width="680" height="36" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="360" y="211" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">18.4 M × 40 B × 2  =  1.47 GB before PDAL, GDAL and PROJ have allocated anything of their own</text>
  <text x="20" y="246" font-size="10.5" fill="var(--dg-muted)">a ground classifier adds its own raster on top of this, which is why SMRF jobs fail first</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL | any recent version; the arithmetic does not change |
| `pdal info --schema` | to read the point layout and its dimension widths |
| `/usr/bin/time -v` or cgroup stats | to see the real peak rather than the reported one |
| A reproducible failure | one tile that fails the same way every time |

## Step-by-Step Implementation

### Step 1 — Compute the requirement before profiling

```bash
pdal info tile_0431.laz --schema | python -c "
import json,sys
s=json.load(sys.stdin)['schema']['dimensions']
print(sum(d['size'] for d in s), 'bytes/point', len(s), 'dimensions')"
```

Multiply by the point count from `pdal info --summary` and by two. If that number is close to the machine's memory, you have your answer without running anything.

### Step 2 — Confirm what actually killed the process

`std::bad_alloc` is a PDAL-level allocation failure and will appear in the log. A container killed by the kernel leaves no message at all — check `dmesg` or the orchestrator's termination reason. The two look identical from the application's point of view and have different fixes.

### Step 3 — Drop dimensions the pipeline never reads

The cheapest win. A tile carrying RGB, GPS time and four vendor extras costs twice what the pipeline needs if it only ever touches X, Y, Z and Classification.

```json
{"type": "writers.las", "filename": "out.laz", "extra_dims": "none"}
```

Better still, avoid materialising them at all by selecting dimensions at the reader when the format allows it.

### Step 4 — Make the chain stream

If every stage is per-point, [streaming mode](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/) removes the point count from the expression entirely. This is the change that turns an impossible job into a routine one.

### Step 5 — Tile only when the first four fail

Retiling is real work and adds edge-effect problems. It is the correct answer when a genuinely blocking stage must see a cloud larger than the machine, and the wrong answer when a dimension you never use was doubling the footprint.

## Complete Working Example

```python
"""Estimate PDAL memory for a tile and pipeline, and say what to change."""
from __future__ import annotations

import json
from pathlib import Path

import pdal

BYTES_PER_GB = 1024 ** 3


def layout(path: Path) -> tuple[int, int]:
    """Return (point_count, bytes_per_point) from the file's own schema."""
    p = pdal.Pipeline(json.dumps({"pipeline": [
        {"type": "readers.las", "filename": str(path), "count": 1}
    ]}))
    p.execute()
    meta = p.quickinfo["readers.las"]
    dims = json.loads(p.schema)["schema"]["dimensions"]
    return int(meta["num_points"]), sum(int(d["size"]) for d in dims)


def estimate(path: Path, live_buffers: int = 2, headroom_gb: float = 0.4) -> dict:
    points, per_point = layout(path)
    core = points * per_point * live_buffers / BYTES_PER_GB
    return {
        "points": points,
        "bytes_per_point": per_point,
        "live_buffers": live_buffers,
        "estimated_gb": round(core + headroom_gb, 2),
    }


def advise(est: dict, available_gb: float) -> list[str]:
    out = []
    if est["estimated_gb"] <= available_gb:
        return ["fits — no change needed"]
    if est["bytes_per_point"] > 32:
        out.append("drop unused dimensions: the layout is wider than X/Y/Z/Intensity/Classification")
    out.append("stream the chain if every stage is per-point")
    out.append(f"or tile the input to about {available_gb / est['estimated_gb']:.0%} of its current extent")
    return out


if __name__ == "__main__":
    est = estimate(Path("tile_0431.laz"))
    print(json.dumps(est, indent=2))
    for line in advise(est, available_gb=4.0):
        print(" -", line)
```

<svg viewBox="0 0 720 258" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Estimated against measured peak memory for five tiles of increasing size" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>The estimate is good enough to plan with</title>
  <desc>Five tiles plotted with the arithmetic estimate on one axis and the measured peak resident set on the other. Every point sits slightly above the one-to-one line, by between eight and ten percent, which is the fixed overhead of PDAL, GDAL and PROJ. The relationship is close enough that the estimate can be used to size a worker without running the job.</desc>
  <rect x="0" y="0" width="720" height="258" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="40" x2="80" y2="200" stroke="var(--dg-line)" stroke-width="1.5"/>
  <line x1="80" y1="200" x2="660" y2="200" stroke="var(--dg-line)" stroke-width="1.5"/>
  <line x1="80" y1="200" x2="640" y2="48" stroke="var(--dg-line-soft)" stroke-width="1.4" stroke-dasharray="6 4"/>
  <text x="470" y="96" font-size="10.5" fill="var(--dg-muted)">one-to-one</text>
  <circle cx="164.0" cy="177.9" r="5" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="2"/>
  <circle cx="248.0" cy="156.9" r="5" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="2"/>
  <circle cx="332.0" cy="134.1" r="5" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="2"/>
  <circle cx="437.0" cy="108.8" r="5" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="2"/>
  <circle cx="598.0" cy="63.2" r="5" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="2"/>
  <text x="72" y="204" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">0</text>
  <text x="72" y="124" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">4.5 GB</text>
  <text x="72" y="52" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">9 GB</text>
  <text x="80" y="220" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">0</text>
  <text x="360" y="220" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">4 GB</text>
  <text x="640" y="220" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">8 GB</text>
  <text x="370" y="242" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">estimated from points × width × buffers</text>
  <text x="26" y="120" text-anchor="middle" font-size="11.5" fill="var(--dg-text)" transform="rotate(-90 26 120)">measured peak</text>
</svg>

## Key Parameter Table

| Lever | Where | Typical saving |
|---|---|---|
| `extra_dims: "none"` | `writers.las` | 10–50% of the point width |
| streaming execution | `execute_streaming` | removes the point count from the expression |
| `chunk_size` | `execute_streaming` | linear — halve it, halve the buffer |
| `filters.crop` early | pipeline order | proportional to what it removes |
| split the chain | pipeline design | one buffer instead of two at the peak |
| smaller tiles | upstream | proportional, at the cost of edge effects |

## Verification

**The estimate matched the measurement.** Run `/usr/bin/time -v` and compare `Maximum resident set size` against the estimate. Agreement within about twenty percent means the model holds and you can trust it for other tiles.

**The fix moved the right term.** If you dropped dimensions, the per-point width should fall in `pdal info --schema`. If you streamed, peak memory should stop tracking the file size at all.

**Nothing else changed.** Compare output point counts before and after. Memory work should never alter the result.

## Gotchas and Edge Cases

<svg viewBox="0 0 720 246" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Four out-of-memory symptoms and what each one points at" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Four symptoms, four different causes</title>
  <desc>Four out-of-memory presentations. A bad_alloc exception in the log is PDAL failing to allocate. A silent kill with exit code 137 is the kernel or the container runtime. Memory that climbs across tiles in one process is a leak in the loop, not in PDAL. A failure only on some tiles points at those tiles being denser, not at the pipeline.</desc>
  <rect x="0" y="0" width="720" height="246" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="42" width="300" height="40" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="170" y="66" text-anchor="middle" font-size="11" fill="var(--dg-text)">std::bad_alloc in the log</text>
  <rect x="380" y="42" width="320" height="40" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="540" y="66" text-anchor="middle" font-size="11" fill="var(--dg-text)">PDAL asked for more than malloc could give</text>
  <rect x="20" y="92" width="300" height="40" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="170" y="116" text-anchor="middle" font-size="11" fill="var(--dg-text)">exit 137, no message</text>
  <rect x="380" y="92" width="320" height="40" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="540" y="116" text-anchor="middle" font-size="11" fill="var(--dg-text)">the kernel or container limit killed it</text>
  <rect x="20" y="142" width="300" height="40" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="170" y="166" text-anchor="middle" font-size="11" fill="var(--dg-text)">memory climbs tile after tile</text>
  <rect x="380" y="142" width="320" height="40" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="540" y="166" text-anchor="middle" font-size="11" fill="var(--dg-text)">your loop holds references, not PDAL</text>
  <rect x="20" y="192" width="300" height="40" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="170" y="216" text-anchor="middle" font-size="11" fill="var(--dg-text)">only some tiles fail</text>
  <rect x="380" y="192" width="320" height="40" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="540" y="216" text-anchor="middle" font-size="11" fill="var(--dg-text)">those tiles are denser — size for the worst one</text>
</svg>

**Peak memory is set by the worst tile, not the average.** A campaign whose tiles average 12 million points may contain one urban tile with 40. Size the worker for that tile or the job fails at three in the morning on the one file nobody looked at.

**Python holds arrays longer than you think.** `pipeline.arrays` keeps a reference for as long as the pipeline object lives. In a loop over tiles, delete both, or run each tile in its own process — the pattern described in [parallel execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/).

**Concurrency multiplies the requirement.** Four workers at 1.5 GB is 6 GB, and the container limit applies to the whole cgroup. Memory tuning and pool sizing are the same decision.

## Frequently Asked Questions

**How do I estimate PDAL memory before running anything?**

Multiply three numbers: the point count from pdal info --summary, the sum of the dimension widths from pdal info --schema, and the number of buffers alive at once, which is two for a linear chain during each hand-off. Add a few hundred megabytes for PDAL, GDAL and PROJ themselves and the estimate is usually within twenty percent.

**What is the difference between bad_alloc and exit code 137?**

A bad_alloc means PDAL asked the allocator for memory and was refused, and it appears in the log. Exit 137 means something outside the process — the kernel OOM killer or a container memory limit — terminated it, and there is no application-level message at all. The first is fixed by asking for less; the second may also be fixed by raising the limit.

**Why does memory climb across tiles in a loop?**

Because your loop is holding references. pipeline.arrays keeps the point data alive as long as the pipeline object exists, so a list of results accumulates every tile. Delete the pipeline and its arrays each iteration, or process each tile in its own worker process.

**Does lowering chunk_size always reduce memory?**

In streaming mode, yes, and roughly linearly. In standard mode chunk_size has no effect at all, because the reader materialises the whole cloud regardless — which is why checking pipeline.streamable comes before tuning the chunk.

---

## Related

- [Memory Management in PDAL Pipelines](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/) — the parent guide to buffers and the point layout
- [LAZ vs Uncompressed LAS for Iterative Processing](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/laz-vs-uncompressed-las-for-iterative-processing/) — the other half of the resource question — disk against CPU
- [Streaming Mode Execution in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/) — the change that removes the point count from the estimate
- [Parallel Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/) — why concurrency multiplies whatever a single worker needs
- [Attribute Mapping](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/) — which dimensions the point layout is carrying and why
