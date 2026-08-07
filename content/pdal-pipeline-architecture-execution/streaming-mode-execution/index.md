---
title: "Streaming Mode Execution in PDAL"
description: "How PDAL's streaming execution model moves points through a pipeline in fixed-size chunks, which stages support it, and how to build tile workflows whose memory cost is set by chunk size rather than file size."
slug: "streaming-mode-execution"
type: "topic"
breadcrumb: "Streaming Mode Execution"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Streaming Mode Execution in PDAL",
      "description": "How PDAL's streaming execution model moves points through a pipeline in fixed-size chunks, which stages support it, and how to build tile workflows whose memory cost is set by chunk size rather than file size.",
      "datePublished": "2026-08-07",
      "dateModified": "2026-08-07",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "PDAL Pipeline Architecture and Execution", "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/"},
        {"@type": "ListItem", "position": 3, "name": "Streaming Mode Execution", "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Run a PDAL pipeline in streaming mode",
      "step": [
        {"@type": "HowToStep", "name": "Check every stage streams", "text": "Confirm each stage in the pipeline advertises streamable capability, because a single blocking stage disables streaming for the whole run."},
        {"@type": "HowToStep", "name": "Choose a chunk size", "text": "Set the chunk size to a value between one hundred thousand and one million points so the working set stays small without paying per-chunk overhead."},
        {"@type": "HowToStep", "name": "Execute with executeStreaming", "text": "Call pipeline.execute_streaming(chunk_size) from Python, or run pdal pipeline with the --stream flag on the command line."},
        {"@type": "HowToStep", "name": "Verify resident memory", "text": "Watch the resident set size during the run and confirm it plateaus near the chunk working set rather than tracking the input file size."},
        {"@type": "HowToStep", "name": "Compare outputs", "text": "Run the same pipeline conventionally on a small tile and diff the outputs to confirm streaming has not changed the result."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How do I know whether a PDAL pipeline can stream?",
          "acceptedAnswer": {"@type": "Answer", "text": "Ask the pipeline itself. In Python, pipeline.streamable returns True only when every stage in the chain supports streaming. On the command line, pdal pipeline --stream fails with a clear message naming the blocking stage. Never assume from the stage list alone, because whether a filter streams can depend on the options you gave it."}
        },
        {
          "@type": "Question",
          "name": "Why does streaming mode use more time but less memory?",
          "acceptedAnswer": {"@type": "Answer", "text": "Streaming processes a fixed number of points at a time, so the pipeline pays per-chunk overhead — stage setup, buffer management and, for writers, more frequent flushes — repeatedly instead of once. In exchange the resident set is bounded by the chunk rather than the file, which is what lets a 40 GB tile run on a worker with 4 GB of memory."}
        },
        {
          "@type": "Question",
          "name": "Does streaming change the result of a pipeline?",
          "acceptedAnswer": {"@type": "Answer", "text": "For stages that stream, no — a streamable filter by definition makes decisions using only the point in front of it, so the output is identical. The risk is not wrong numbers but silently different behaviour when a stage you assumed was streaming is not, and PDAL falls back to standard mode or refuses to run."}
        },
        {
          "@type": "Question",
          "name": "What chunk size should I use?",
          "acceptedAnswer": {"@type": "Answer", "text": "Start at the default of 10,000 points and raise it toward 500,000 if profiling shows per-chunk overhead dominating. Beyond roughly half a million points the throughput gain flattens while memory keeps climbing, so there is rarely a reason to go higher on a tile workflow."}
        }
      ]
    }
  ]
}
</script>

Every PDAL pipeline you write has two possible execution strategies, and by default you get the one that reads the entire point cloud into memory before the first filter sees a point. That is the right choice for a stage that has to look at the whole cloud — a ground classifier building a minimum surface cannot decide about one point without seeing its neighbours. It is the wrong choice for a chain of per-point operations on a 40 GB tile, where it turns a small job into an out-of-memory failure. Streaming mode is the alternative: points move through the chain in fixed-size chunks, each chunk is filtered and written before the next is read, and peak memory is set by the chunk size instead of the file size. This topic belongs to [PDAL Pipeline Architecture and Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/), and it is the single largest lever on what hardware a given pipeline needs.

<svg viewBox="0 0 720 268" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Points moving through a pipeline as chunks in streaming mode against a single whole-file buffer in standard mode" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>One buffer for the file, or one buffer for a chunk</title>
  <desc>Standard mode allocates one point view for the whole file: the reader fills it, each filter allocates its own copy, and the writer drains it at the end. Streaming mode moves a fixed number of points at a time through the same chain, so at any instant only one chunk exists in memory and the writer is already flushing chunk one while the reader is filling chunk three.</desc>
  <defs><marker id="strm-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="720" height="268" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="38" font-size="12" font-weight="600" fill="var(--dg-e)">standard mode</text>
  <rect x="150" y="22" width="530" height="34" rx="5" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="415" y="44" text-anchor="middle" font-size="11" fill="var(--dg-text)">one point view holding all 18.4 M points, alive for the whole run</text>
  <text x="20" y="90" font-size="12" font-weight="600" fill="var(--dg-d)">streaming mode</text>
  <rect x="150" y="74" width="86" height="34" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="193" y="96" text-anchor="middle" font-size="10" fill="var(--dg-text)">chunk 1</text>
  <rect x="242" y="74" width="86" height="34" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="285" y="96" text-anchor="middle" font-size="10" fill="var(--dg-text)">chunk 2</text>
  <rect x="334" y="74" width="86" height="34" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="377" y="96" text-anchor="middle" font-size="10" fill="var(--dg-text)">chunk 3</text>
  <rect x="426" y="74" width="86" height="34" rx="5" fill="var(--dg-surface-2)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="469" y="96" text-anchor="middle" font-size="10" fill="var(--dg-muted)">chunk 4</text>
  <rect x="518" y="74" width="162" height="34" rx="5" fill="var(--dg-surface-2)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="599" y="96" text-anchor="middle" font-size="10" fill="var(--dg-muted)">… not read yet</text>
  <text x="20" y="146" font-size="11" fill="var(--dg-text)">what exists at one instant</text>
  <rect x="150" y="130" width="150" height="42" rx="7" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="225" y="156" text-anchor="middle" font-size="11" fill="var(--dg-text)">reader fills chunk 3</text>
  <rect x="326" y="130" width="150" height="42" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="401" y="156" text-anchor="middle" font-size="11" fill="var(--dg-text)">filters run chunk 2</text>
  <rect x="502" y="130" width="150" height="42" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="577" y="156" text-anchor="middle" font-size="11" fill="var(--dg-text)">writer flushes chunk 1</text>
  <line x1="300" y1="151" x2="320" y2="151" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#strm-arw)"/>
  <line x1="476" y1="151" x2="496" y2="151" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#strm-arw)"/>
  <rect x="20" y="196" width="660" height="34" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="36" y="218" font-size="11" fill="var(--dg-text)">peak memory: standard = points × bytes-per-point × live views · streaming = chunk_size × bytes-per-point × live views</text>
  <text x="20" y="254" font-size="10.5" fill="var(--dg-muted)">the second expression does not contain the file size, which is the entire point</text>
</svg>

## Prerequisites

| Requirement | Detail |
|---|---|
| PDAL | 2.3+ for `execute_streaming` in the Python bindings; 2.0+ for `--stream` on the CLI |
| Python `pdal` bindings | `pip install pdal` or `conda install -c conda-forge python-pdal` |
| A pipeline of streamable stages | every stage in the chain must support streaming — one that does not disables it for all of them |
| A way to watch memory | `/usr/bin/time -v`, `psutil`, or a container memory limit you are willing to hit |
| Input | any format whose reader streams: LAS, LAZ, COPC, EPT, text |

Streaming is not a flag you can bolt onto an arbitrary pipeline. It is a property the whole chain either has or does not, and the work of adopting it is almost entirely the work of arranging your stages so that it does.

## Core Workflow Architecture

Streaming execution runs as a pull loop rather than a sequence of phases. The writer asks for points, the request travels back up the chain to the reader, and each stage transforms whatever arrives before passing it on.

1. **Capability negotiation.** Before any point moves, PDAL walks the chain and asks each stage whether it can operate in streaming mode. The answer is a property of the stage type and sometimes of its options. If any stage says no, the pipeline as a whole is not streamable.
2. **Buffer allocation.** A single `PointView` sized to `chunk_size` is allocated. Unlike standard mode, this buffer is reused for every chunk rather than reallocated, so allocation cost is paid once.
3. **Fill.** The reader decodes points into the buffer until it holds `chunk_size` points or the source is exhausted.
4. **Traverse.** Each filter in order receives the buffer, mutates it in place or marks points for removal, and hands it on. A filter that drops points shrinks the buffer's occupied count rather than allocating a new one.
5. **Drain.** The writer consumes the surviving points and appends them to the output. For LAS this is a straight append; for `writers.gdal` the raster accumulator absorbs them and the raster itself is written at the end.
6. **Repeat or finish.** Control returns to step three until the reader reports exhaustion, at which point every stage is given a chance to flush anything it was holding.

The consequence worth internalising is in step four: a streaming filter sees each point exactly once and cannot look at points it has already released or has not yet received. That is precisely why some filters cannot stream, and understanding which is the subject of [which PDAL filters break streaming mode](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/which-pdal-filters-break-streaming-mode/).

## Full Implementation

The module below runs a streaming pipeline over a tile, reports whether streaming was actually used, and measures peak resident memory so the claim is verifiable rather than assumed.

```python
"""Stream a LAZ tile through a filter chain with bounded memory."""
from __future__ import annotations

import json
import logging
import resource
from pathlib import Path

import pdal

LOG = logging.getLogger("stream_tile")


def build_pipeline(src: Path, dst: Path, epsg: str = "EPSG:6318") -> str:
    """A chain of strictly per-point stages, so the whole thing streams."""
    stages = [
        {"type": "readers.las", "filename": str(src)},
        # Elevation sanity limits: a pure per-point predicate.
        {"type": "filters.range", "limits": "Z[-30:5000]"},
        # Drop points already flagged as noise upstream.
        {"type": "filters.range", "limits": "Classification![7:7]"},
        # Coordinate transform: each point is transformed independently.
        {"type": "filters.reprojection", "out_srs": epsg},
        {
            "type": "writers.las",
            "filename": str(dst),
            "compression": "laszip",
            "minor_version": 4,
            "dataformat_id": 6,
            "forward": "all",
        },
    ]
    return json.dumps({"pipeline": stages})


def run(src: Path, dst: Path, chunk_size: int = 250_000) -> dict:
    pipeline = pdal.Pipeline(build_pipeline(src, dst))

    if not pipeline.streamable:
        raise RuntimeError(
            "pipeline is not streamable — a stage in the chain requires the whole cloud"
        )

    LOG.info("streaming %s with chunk_size=%d", src.name, chunk_size)
    count = pipeline.execute_streaming(chunk_size=chunk_size)

    peak_kb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    stats = {
        "points_written": count,
        "peak_rss_mb": round(peak_kb / 1024, 1),
        "chunk_size": chunk_size,
        "output": str(dst),
    }
    LOG.info("wrote %d points, peak RSS %.1f MB", count, stats["peak_rss_mb"])
    return stats


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    result = run(Path("tile_0431.laz"), Path("tile_0431_clean.laz"))
    print(json.dumps(result, indent=2))
```

## Code Breakdown

**`pipeline.streamable` is checked before executing, not after.** The property is cheap — it only asks each stage about its capability — and turning a silent fallback into an explicit exception is the difference between a job that quietly uses 30 GB and one that tells you why it cannot.

**Every stage in the chain is per-point on purpose.** `filters.range` tests one point's dimensions. `filters.reprojection` transforms one coordinate. Neither needs a neighbour. Had the chain included `filters.smrf`, `pipeline.streamable` would be `False` and the guard would fire.

**`chunk_size` is passed explicitly rather than defaulted.** The default of 10,000 points is conservative; a quarter of a million costs about 10 MB of working set on a typical point layout and removes most of the per-chunk overhead. The trade-off is quantified under [Performance Tuning](#performance-tuning) below.

**`execute_streaming` returns the point count, not a `PointView`.** This is not an oversight: there is no complete array to return, because no complete array ever existed. Pipelines that need `pipeline.arrays` afterwards are, by construction, not streaming pipelines.

**`forward: "all"` keeps the header records.** Streaming does not change what a writer preserves, but it is easy to lose sight of the ordinary options while focusing on execution mode. The [attribute mapping](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/) guide covers what `forward` carries.

## Parameter Reference Table

| Parameter | Where | Type | Default | Effect |
|---|---|---|---|---|
| `chunk_size` | `execute_streaming(chunk_size=…)` | int | 10000 | Points held in the working buffer; sets peak memory and per-chunk overhead |
| `--stream` | `pdal pipeline` CLI | flag | off | Requests streaming; the command fails rather than falling back if the chain cannot |
| `pipeline.streamable` | Python property | bool | — | True only when every stage in the chain supports streaming |
| `pipeline.loglevel` | Python property | int 0–8 | 0 | At 8, PDAL logs the capability decision for each stage |
| `count` | `readers.*` option | int | all | Caps points read; useful for a streaming smoke test on a huge tile |

<svg viewBox="0 0 720 262" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Which common PDAL stages support streaming and which require the whole point cloud" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Which stages can stream, and why the others cannot</title>
  <desc>Two columns of stages. The streamable side holds range, reprojection, assign, ferry, crop, the LAS reader and the LAS writer — each decides about a point using only that point. The blocking side holds SMRF, PMF, statistical outlier removal, sorting, sampling and height above ground, each of which needs neighbours or a global ordering before it can decide anything.</desc>
  <rect x="0" y="0" width="720" height="262" fill="var(--dg-bg)" rx="10"/>
  <text x="185" y="40" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-d)">streams — decides per point</text>
  <text x="535" y="40" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-e)">blocks — needs the whole cloud</text>
  <rect x="20" y="52" width="330" height="30" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="185" y="72" text-anchor="middle" font-size="11" fill="var(--dg-text)">readers.las · readers.copc · readers.ept</text>
  <rect x="20" y="88" width="330" height="30" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="185" y="108" text-anchor="middle" font-size="11" fill="var(--dg-text)">filters.range · filters.expression</text>
  <rect x="20" y="124" width="330" height="30" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="185" y="144" text-anchor="middle" font-size="11" fill="var(--dg-text)">filters.reprojection · filters.assign</text>
  <rect x="20" y="160" width="330" height="30" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="185" y="180" text-anchor="middle" font-size="11" fill="var(--dg-text)">filters.ferry · filters.crop</text>
  <rect x="20" y="196" width="330" height="30" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="185" y="216" text-anchor="middle" font-size="11" fill="var(--dg-text)">writers.las · writers.copc · writers.text</text>
  <rect x="370" y="52" width="330" height="30" rx="5" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="535" y="72" text-anchor="middle" font-size="11" fill="var(--dg-text)">filters.smrf · filters.pmf</text>
  <rect x="370" y="88" width="330" height="30" rx="5" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="535" y="108" text-anchor="middle" font-size="11" fill="var(--dg-text)">filters.outlier · filters.hag_nn</text>
  <rect x="370" y="124" width="330" height="30" rx="5" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="535" y="144" text-anchor="middle" font-size="11" fill="var(--dg-text)">filters.sort · filters.sample</text>
  <rect x="370" y="160" width="330" height="30" rx="5" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="535" y="180" text-anchor="middle" font-size="11" fill="var(--dg-text)">filters.cluster · filters.neighborclassifier</text>
  <rect x="370" y="196" width="330" height="30" rx="5" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="535" y="216" text-anchor="middle" font-size="11" fill="var(--dg-text)">writers.gdal in some configurations</text>
  <text x="20" y="248" font-size="10.5" fill="var(--dg-muted)">the test is not the family a stage belongs to — it is whether the decision about one point depends on another point</text>
</svg>

## Validation and Integrity Checks

A streaming run is only useful if it produced the same answer more cheaply. Three checks establish that.

**Point counts agree.** Run the pipeline conventionally on a small tile and streaming on the same tile. The returned counts must match exactly; a mismatch means a stage behaved differently, not that streaming rounded something.

```python
plain = pdal.Pipeline(build_pipeline(src, Path("a.laz")))
plain.execute()
streamed = pdal.Pipeline(build_pipeline(src, Path("b.laz")))
n = streamed.execute_streaming(chunk_size=100_000)
assert len(plain.arrays[0]) == n, "streaming changed the surviving point count"
```

**Memory actually stayed bounded.** Peak RSS should be roughly constant as the input grows. Run the same pipeline against a 200 MB tile and a 2 GB tile; if peak memory scales with the file, something in the chain is accumulating despite reporting itself streamable.

**The header survived.** Streaming writers still recompute counts and bounding boxes, but it is worth confirming — `pdal info --metadata` on the output, compared against the input, is the check described in [metadata and header sync](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/metadata-header-sync/).

## Performance Tuning

Streaming trades a small amount of throughput for a large amount of memory headroom, and `chunk_size` is the dial that sets the exchange rate.

| chunk_size | Peak RSS | Throughput | When it fits |
|---|---|---|---|
| 10,000 | ~12 MB | 1.8 M pts/s | Memory-constrained containers, many concurrent workers |
| 100,000 | ~35 MB | 3.4 M pts/s | The general-purpose default worth setting explicitly |
| 500,000 | ~150 MB | 3.9 M pts/s | Single-tenant workers with memory to spare |
| 2,000,000 | ~560 MB | 4.0 M pts/s | Rarely worth it — all memory, no speed |

<svg viewBox="0 0 720 262" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Peak memory for a standard run and three streaming chunk sizes across growing tile sizes" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Memory against input size, standard and streaming</title>
  <desc>Peak resident memory plotted against input tile size. The standard-mode line rises steeply and in proportion to the file, passing four gigabytes at a two gigabyte tile. The three streaming lines are flat: whatever the input size, memory stays near twelve, thirty-five or a hundred and fifty megabytes according to the chunk size chosen.</desc>
  <rect x="0" y="0" width="720" height="262" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="40" x2="80" y2="200" stroke="var(--dg-line)" stroke-width="1.5"/>
  <line x1="80" y1="200" x2="690" y2="200" stroke="var(--dg-line)" stroke-width="1.5"/>
  <polyline points="80,192 232,150 385,108 538,66 690,44" fill="none" stroke="var(--dg-e)" stroke-width="2.6"/>
  <line x1="80" y1="176" x2="690" y2="176" stroke="var(--dg-c)" stroke-width="2.2"/>
  <line x1="80" y1="186" x2="690" y2="186" stroke="var(--dg-a)" stroke-width="2.2"/>
  <line x1="80" y1="194" x2="690" y2="194" stroke="var(--dg-d)" stroke-width="2.2"/>
  <text x="230" y="70" font-size="11" fill="var(--dg-e)">standard mode — memory follows the file</text>
  <text x="330" y="170" font-size="10.5" fill="var(--dg-c)">chunk 500 k</text>
  <text x="470" y="170" font-size="10.5" fill="var(--dg-a)">chunk 100 k</text>
  <text x="590" y="170" font-size="10.5" fill="var(--dg-d)">chunk 10 k</text>
  <text x="72" y="204" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">0</text>
  <text x="72" y="124" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">2 GB</text>
  <text x="72" y="44" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">4 GB</text>
  <text x="80" y="220" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">200 MB</text>
  <text x="385" y="220" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">1 GB</text>
  <text x="690" y="220" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">2 GB</text>
  <text x="385" y="242" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">input tile size</text>
  <text x="26" y="120" text-anchor="middle" font-size="11.5" fill="var(--dg-text)" transform="rotate(-90 26 120)">peak RSS</text>
</svg>

Two further levers matter in production. First, streaming and file-level parallelism compose well: because each worker's memory is bounded, you can run many more concurrent tile processes than standard mode allows on the same box — see [parallel execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/) for how to size that pool. Second, streaming makes cloud reads far more attractive, since a ranged read feeding a bounded buffer never needs the whole object locally; that pattern is covered in [streaming LAZ from S3 with PDAL](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/streaming-laz-from-s3-with-pdal/).

## Common Errors and Troubleshooting

**`pdal pipeline --stream` exits with "Pipeline is not streamable".** One stage in the chain blocks. Run with `--verbose 8` and PDAL names it. The fix is either to remove the stage, move it into a second pipeline that runs on a much smaller input, or accept standard mode for that step.

**Peak memory did not drop.** Confirm `execute_streaming` was actually called, not `execute`. It is easy to build the pipeline correctly, check `streamable`, and then execute the conventional way — the guard passes and nothing changes.

**Output point count is zero.** A `filters.crop` or `filters.range` predicate that matches nothing behaves identically in both modes, but the failure is more visible when streaming because there is no intermediate array to inspect. Test the predicate on a small tile with `execute()` and check `pipeline.arrays[0].shape`.

**Throughput collapsed compared with standard mode.** The chunk size is too small for the work being done, so per-chunk overhead dominates. Raise it tenfold and re-measure before changing anything else.

**`writers.gdal` refuses to stream.** Rasterization accumulates cells across the whole input by nature. Split the job: stream the point-domain filtering to an intermediate LAZ, then rasterize that in a second, conventional pipeline.

**Streaming from a network source stalls.** A bounded buffer only helps if the source can feed it. Reading a LAZ object over a virtual filesystem with the default settings issues a directory listing on every open and fetches small ranges, so the pipeline spends its time waiting rather than filtering. The symptom is a flat, low memory trace with dismal throughput — the opposite of the standard-mode failure, and easy to misread as a streaming problem when it is a network one.

**A second pipeline in the same process inherits the memory.** Python does not necessarily return freed pages to the operating system, so `ru_maxrss` after a streaming run that followed a conventional run still shows the earlier peak. When benchmarking, run each mode in its own process, or the numbers will suggest streaming did nothing.

A last point about where streaming pays off most. The obvious case is the tile too large for the worker, but the more common one in production is concurrency: because each streaming worker has a small, predictable footprint, a sixteen-core machine can run sixteen tile jobs at once instead of the three that standard mode's memory appetite allowed. The throughput gain there comes not from any one pipeline running faster — it does not — but from the machine running many more of them at the same time. That is usually the argument that decides whether it is worth restructuring a chain to keep it streamable.

## Frequently Asked Questions

**How do I know whether a PDAL pipeline can stream?**

Ask the pipeline itself. In Python, `pipeline.streamable` returns `True` only when every stage in the chain supports streaming. On the command line, `pdal pipeline --stream` fails with a message naming the blocking stage. Never infer it from the stage list alone, because whether a filter streams can depend on the options you gave it.

**Why does streaming mode use more time but less memory?**

Streaming processes a fixed number of points at a time, so the pipeline pays per-chunk overhead repeatedly instead of once. In exchange the resident set is bounded by the chunk rather than the file, which is what lets a 40 GB tile run on a worker with 4 GB of memory.

**Does streaming change the result of a pipeline?**

For stages that stream, no. A streamable filter by definition decides using only the point in front of it, so the output is identical. The risk is not wrong numbers but a stage you assumed was streaming turning out not to be.

**What chunk size should I use?**

Start at 100,000 and raise it toward 500,000 only if profiling shows per-chunk overhead dominating. Past half a million points the throughput gain flattens while memory keeps climbing.

---

## Related

- [PDAL Pipeline Architecture and Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/) — the section this execution mode belongs to
- [Running a PDAL Pipeline in Streaming Mode](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/running-a-pdal-pipeline-in-streaming-mode/) — the hands-on walkthrough with a real tile
- [Which PDAL Filters Break Streaming Mode](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/which-pdal-filters-break-streaming-mode/) — the capability rules and how to work around them
- [Splitting a Blocking Pipeline into Two Passes](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/splitting-a-blocking-pipeline-into-two-passes/) — keeping most of a workflow streamable when one stage cannot be
- [Memory Management in PDAL Pipelines](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/) — the buffer model streaming is an alternative to
- [PDAL Stage Chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/) — how stages hand points to one another in either mode
