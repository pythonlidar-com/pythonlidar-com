---
title: "Splitting a Blocking Pipeline into Two Passes"
description: "How to cut a PDAL pipeline at its blocking stage so the per-point work streams, the expensive stage sees a much smaller cloud, and peak memory falls by two thirds without changing the result."
slug: "splitting-a-blocking-pipeline-into-two-passes"
type: "howto"
breadcrumb: "Splitting a Blocking Pipeline"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Splitting a Blocking Pipeline into Two Passes",
      "description": "How to cut a PDAL pipeline at its blocking stage so the per-point work streams, the expensive stage sees a much smaller cloud, and peak memory falls by two thirds without changing the result.",
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
          "name": "Streaming Mode Execution",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Splitting a Blocking Pipeline",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/splitting-a-blocking-pipeline-into-two-passes/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Split a non-streamable PDAL pipeline into streaming and blocking passes",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Find the cut point",
          "text": "Bisect the chain until pipeline.streamable flips, which identifies the blocking stage."
        },
        {
          "@type": "HowToStep",
          "name": "Reduce as much as is safe in pass one",
          "text": "Put elevation limits, noise rejection and a buffered crop into a streaming pass that writes an intermediate LAZ."
        },
        {
          "@type": "HowToStep",
          "name": "Run the blocking stage alone",
          "text": "Execute the blocking stage conventionally against the reduced intermediate rather than the original tile."
        },
        {
          "@type": "HowToStep",
          "name": "Stream the tail",
          "text": "Selection and writing are per-point operations, so the final pass streams like the first."
        },
        {
          "@type": "HowToStep",
          "name": "Clean up intermediates on success",
          "text": "Write scratch files under a run-specific prefix and delete them only when every pass has completed."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Does splitting a pipeline change the result?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It should not, and verifying that is part of the job. Run both forms on a tile small enough to afford it and compare the surviving point counts. A difference means a reducing stage moved ahead of a stage whose decision depended on the points it removed \u2014 most often a crop without enough buffer."
          }
        },
        {
          "@type": "Question",
          "name": "How much does the intermediate file cost?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "One extra write and one extra read, typically a few seconds per tile against gigabytes of memory headroom. The trade is only bad when the streaming pass removes very little; below roughly a thirty percent reduction the split stops paying for itself."
          }
        },
        {
          "@type": "Question",
          "name": "Can I keep the intermediate in memory instead of on disk?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "You can pass arrays between pipelines in Python, but doing so re-creates exactly the whole-cloud residency that the split was meant to avoid. Local disk is the right place for the intermediate; tmpfs is not, because it is memory wearing a filesystem interface."
          }
        },
        {
          "@type": "Question",
          "name": "Which stages are safe to move ahead of the blocking one?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Ask whether the blocking stage would have decided differently had it seen the removed points. Dropping noise and applying generous elevation limits are safe. Cropping is safe with a buffer at least as wide as the classifier window. Thinning the cloud is not safe, because it changes which points are local minima."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Cut the chain at the blocking stage: run everything above it as a streaming pass that writes an intermediate LAZ, run the blocking stage alone over that much smaller file, then stream the tail. Two passes over reduced data almost always beat one pass that has to materialise the original cloud.

## Context and Motivation

This guide is part of [Streaming Mode Execution in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/). The parent explains why a single blocking stage makes an entire pipeline non-streamable; this page is what to do about it when the blocking stage is one you actually need.

The situation is common enough to be the normal case. A production chain reads a tile, applies elevation limits, reprojects, classifies ground with `filters.smrf`, keeps the ground returns and writes a DTM. Four of those six stages stream. The classifier does not, and neither does the raster writer, so the whole pipeline runs conventionally and the reader materialises 18 million points before anything else happens. Splitting the chain does not make SMRF stream — nothing does — but it changes what SMRF has to hold. If the streaming pass has already discarded noise and cropped to the area of interest, the blocking stage starts from a third of the points, and a job that needed 12 GB now needs 4.

<svg viewBox="0 0 720 274" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="One mixed pipeline against the same work split into a streaming pass, a blocking pass and a streaming tail" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Cutting the chain at the blocking stage</title>
  <desc>Above, a single pipeline of six stages where one blocking classifier forces the whole chain into standard mode and 12 gigabytes of peak memory. Below, the same six stages split into three runs: a streaming pass that filters and reprojects into an intermediate file, a short conventional pass that classifies it, and a streaming tail that selects and writes. Peak memory drops to 3.9 gigabytes because the blocking stage now starts from a third of the points.</desc>
  <defs><marker id="spl-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="720" height="274" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="36" font-size="11.5" font-weight="600" fill="var(--dg-e)">one pipeline — 12.1 GB peak</text>
  <rect x="20" y="46" width="130" height="38" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="85" y="70" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">read 18.4 M</text>
  <rect x="164" y="46" width="130" height="38" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="229" y="70" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">range + crop</text>
  <rect x="308" y="46" width="130" height="38" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="373" y="70" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">reproject</text>
  <rect x="452" y="46" width="130" height="38" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.6"/>
  <text x="517" y="70" text-anchor="middle" font-size="10.5" font-weight="600" fill="var(--dg-text)">smrf — blocks</text>
  <rect x="596" y="46" width="104" height="38" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="648" y="70" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">write DTM</text>
  <text x="20" y="122" font-size="11.5" font-weight="600" fill="var(--dg-d)">three runs — 3.9 GB peak</text>
  <rect x="20" y="132" width="220" height="44" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="130" y="152" text-anchor="middle" font-size="11" fill="var(--dg-text)">pass 1 — streaming</text>
  <text x="130" y="168" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">range, crop, reproject · 40 MB</text>
  <rect x="256" y="132" width="200" height="44" rx="6" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="356" y="152" text-anchor="middle" font-size="11" fill="var(--dg-text)">pass 2 — conventional</text>
  <text x="356" y="168" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">smrf on 6.1 M points · 3.9 GB</text>
  <rect x="472" y="132" width="228" height="44" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="586" y="152" text-anchor="middle" font-size="11" fill="var(--dg-text)">pass 3 — streaming</text>
  <text x="586" y="168" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">select ground, write · 40 MB</text>
  <line x1="240" y1="154" x2="250" y2="154" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#spl-arw)"/>
  <line x1="456" y1="154" x2="466" y2="154" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#spl-arw)"/>
  <rect x="20" y="196" width="680" height="34" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="36" y="218" font-size="11" fill="var(--dg-text)">the blocking stage did not change — what changed is that it now starts from 6.1 M points instead of 18.4 M</text>
  <text x="20" y="256" font-size="10.5" fill="var(--dg-muted)">the intermediate file is the cost: one extra write and one extra read, usually a few seconds against gigabytes of headroom</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL | 2.3+ with the Python bindings |
| Scratch space | room for one intermediate LAZ, typically 20–40% of the input |
| A known blocker | identified as in [which filters break streaming](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/which-pdal-filters-break-streaming-mode/) |
| Ordering freedom | the reducing stages must be safe to run before the blocking one |

That last row is the real constraint. Moving `filters.crop` ahead of `filters.smrf` is safe if the crop boundary is generous enough that the classifier still sees the terrain context it needs. Moving it ahead with a tight boundary starves SMRF of the surroundings at the tile edge and produces a different, worse answer. Buffer the crop — the same reasoning as tile buffering in [DTM raster generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/).

## Step-by-Step Implementation

### Step 1 — Identify the cut point

Bisect the chain until `pipeline.streamable` flips. Everything before the blocker is pass one; the blocker is pass two; everything after is pass three.

### Step 2 — Make pass one reduce as much as it safely can

This is where the benefit comes from. Elevation limits, noise-class rejection and a buffered crop all stream, and each one shrinks what pass two must hold.

```json
{"pipeline": [
  {"type": "readers.las", "filename": "tile_0431.laz"},
  {"type": "filters.range", "limits": "Z[-30:5000]"},
  {"type": "filters.range", "limits": "Classification![7:7]"},
  {"type": "filters.crop", "polygon": "POLYGON((...))"},
  {"type": "filters.reprojection", "out_srs": "EPSG:6318"},
  {"type": "writers.las", "filename": "/scratch/pass1.laz", "compression": "laszip", "forward": "all"}
]}
```

### Step 3 — Run the blocking stage alone

```json
{"pipeline": [
  {"type": "readers.las", "filename": "/scratch/pass1.laz"},
  {"type": "filters.smrf", "window": 18, "slope": 0.15, "threshold": 0.5, "cell": 1.0},
  {"type": "writers.las", "filename": "/scratch/pass2.laz", "compression": "laszip", "forward": "all"}
]}
```

### Step 4 — Stream the tail

Selecting ground and writing the output are both per-point operations, so pass three streams like pass one.

### Step 5 — Delete the intermediates deliberately

Scratch files that survive a crash will be picked up by the next run and silently reused. Write them under a run-specific prefix and remove them on success.

## Complete Working Example

```python
"""Split a pipeline at its blocking stage and run the three passes in order."""
from __future__ import annotations

import json
import logging
import shutil
import tempfile
from pathlib import Path

import pdal

LOG = logging.getLogger("split_passes")


def run_streaming(stages: list[dict], chunk: int = 100_000) -> int:
    pipeline = pdal.Pipeline(json.dumps({"pipeline": stages}))
    if not pipeline.streamable:
        raise RuntimeError("pass was expected to stream but does not")
    return pipeline.execute_streaming(chunk_size=chunk)


def run_standard(stages: list[dict]) -> int:
    return pdal.Pipeline(json.dumps({"pipeline": stages})).execute()


def process(src: Path, dst: Path, polygon: str, out_srs: str = "EPSG:6318") -> dict:
    scratch = Path(tempfile.mkdtemp(prefix="pdal_split_"))
    p1 = scratch / "pass1.laz"
    p2 = scratch / "pass2.laz"
    try:
        n1 = run_streaming([
            {"type": "readers.las", "filename": str(src)},
            {"type": "filters.range", "limits": "Z[-30:5000]"},
            {"type": "filters.range", "limits": "Classification![7:7]"},
            {"type": "filters.crop", "polygon": polygon},
            {"type": "filters.reprojection", "out_srs": out_srs},
            {"type": "writers.las", "filename": str(p1),
             "compression": "laszip", "forward": "all"},
        ])
        LOG.info("pass 1 (streaming) kept %d points", n1)

        n2 = run_standard([
            {"type": "readers.las", "filename": str(p1)},
            {"type": "filters.smrf", "window": 18, "slope": 0.15,
             "threshold": 0.5, "cell": 1.0},
            {"type": "writers.las", "filename": str(p2),
             "compression": "laszip", "forward": "all"},
        ])
        LOG.info("pass 2 (standard, blocking) classified %d points", n2)

        n3 = run_streaming([
            {"type": "readers.las", "filename": str(p2)},
            {"type": "filters.range", "limits": "Classification[2:2]"},
            {"type": "writers.las", "filename": str(dst),
             "compression": "laszip", "forward": "all"},
        ])
        LOG.info("pass 3 (streaming) wrote %d ground points", n3)
        return {"pass1": n1, "pass2": n2, "ground": n3}
    finally:
        shutil.rmtree(scratch, ignore_errors=True)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    poly = "POLYGON((512000 4783000, 513000 4783000, 513000 4784000, 512000 4784000, 512000 4783000))"
    print(json.dumps(process(Path("tile_0431.laz"), Path("ground.laz"), poly), indent=2))
```

<svg viewBox="0 0 720 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Disk occupied by intermediates across the three passes of a split pipeline" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What the split costs on disk</title>
  <desc>Disk usage over the run. The source tile occupies 1.4 gigabytes throughout. Pass one adds a 480 megabyte intermediate. Pass two adds a second intermediate of similar size while the first is still present, which is the peak. Pass three writes the final output and both intermediates are deleted, leaving only the source and the result.</desc>
  <rect x="0" y="0" width="720" height="240" fill="var(--dg-bg)" rx="10"/>
  <line x1="70" y1="196" x2="690" y2="196" stroke="var(--dg-line)" stroke-width="1.5"/>
  <rect x="90" y="120" width="120" height="76" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.2"/>
  <text x="150" y="212" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">start</text>
  <text x="150" y="112" text-anchor="middle" font-size="10" fill="var(--dg-muted)">1.4 GB</text>
  <rect x="230" y="120" width="120" height="76" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.2"/>
  <rect x="230" y="94" width="120" height="26" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="290" y="212" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">after pass 1</text>
  <text x="290" y="86" text-anchor="middle" font-size="10" fill="var(--dg-muted)">1.9 GB</text>
  <rect x="370" y="120" width="120" height="76" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.2"/>
  <rect x="370" y="94" width="120" height="26" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <rect x="370" y="68" width="120" height="26" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="430" y="212" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">after pass 2 — peak</text>
  <text x="430" y="60" text-anchor="middle" font-size="10" fill="var(--dg-e)">2.4 GB</text>
  <rect x="510" y="120" width="120" height="76" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.2"/>
  <rect x="510" y="102" width="120" height="18" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="570" y="212" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">after cleanup</text>
  <text x="570" y="94" text-anchor="middle" font-size="10" fill="var(--dg-muted)">1.7 GB</text>
  <text x="70" y="36" font-size="10.5" fill="var(--dg-muted)">scratch space needed is the peak, not the final state — size the volume for the middle bar</text>
  <text x="70" y="232" font-size="10.5" fill="var(--dg-muted)">deleting pass 1 before pass 3 runs saves 480 MB and costs nothing, because pass 3 only reads pass 2</text>
</svg>

## Key Parameter Table

| Choice | Options | Guidance |
|---|---|---|
| Intermediate format | LAZ, LAS | LAZ unless the intermediate is read many times; see [LAZ vs uncompressed LAS](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/laz-vs-uncompressed-las-for-iterative-processing/) |
| Scratch location | tmpfs, local SSD, network | Local disk; tmpfs re-introduces the memory problem you are solving |
| Crop buffer | 0–50 m | At least the classifier's `window`, so edge points keep their context |
| `forward` on intermediates | `all` | Header records must survive both hand-offs or the final file loses them |
| Cleanup | on success only | Keep the scratch files when a pass fails — they are the debugging material |

## Verification

**The three passes agree with one.** On a tile small enough to run both ways, the single-pipeline output and the three-pass output should contain the same number of ground points. A difference means a reducing stage moved ahead of a stage that depended on what it removed.

**Peak memory dropped where you expected.** Measure each pass separately. Passes one and three should be flat and small; pass two should be noticeably below the original peak. If pass two is unchanged, the streaming pass is not actually reducing anything.

**The intermediate is not silently stale.** Assert the intermediate's modification time is newer than the source before pass two reads it, or generate it under a unique prefix per run.

## Gotchas and Edge Cases

<svg viewBox="0 0 720 258" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Which reducing stages are safe to move ahead of a ground classifier and which change the result" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Not every reduction is safe to move earlier</title>
  <desc>Four reducing stages assessed for whether they can move ahead of a ground classifier. Dropping noise-classified points and applying generous elevation limits are safe. Cropping is safe only with a buffer at least as wide as the classifier window. Poisson sampling is not safe at all, because thinning the cloud changes which points the classifier sees as the local minimum.</desc>
  <rect x="0" y="0" width="720" height="258" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="36" font-size="10.5" fill="var(--dg-muted)">can this stage move ahead of filters.smrf?</text>
  <rect x="20" y="48" width="330" height="44" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="185" y="68" text-anchor="middle" font-size="11" fill="var(--dg-text)">drop Classification 7</text>
  <text x="185" y="84" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">safe — noise was never ground</text>
  <rect x="370" y="48" width="330" height="44" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="535" y="68" text-anchor="middle" font-size="11" fill="var(--dg-text)">Z limits, generous</text>
  <text x="535" y="84" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">safe — nothing near terrain is removed</text>
  <rect x="20" y="104" width="330" height="44" rx="6" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="185" y="124" text-anchor="middle" font-size="11" fill="var(--dg-text)">crop to the area of interest</text>
  <text x="185" y="140" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">only with a buffer ≥ window</text>
  <rect x="370" y="104" width="330" height="44" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="535" y="124" text-anchor="middle" font-size="11" fill="var(--dg-text)">poisson sampling</text>
  <text x="535" y="140" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">unsafe — changes the local minima</text>
  <rect x="20" y="164" width="680" height="38" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="360" y="188" text-anchor="middle" font-size="11" fill="var(--dg-text)">the test: would the blocking stage have made a different decision if it had seen the removed points?</text>
  <text x="20" y="228" font-size="10.5" fill="var(--dg-muted)">when the answer is uncertain, run both orders on one tile and difference the ground rasters — the disagreement is</text>
  <text x="20" y="246" font-size="10.5" fill="var(--dg-muted)">always concentrated at the boundary, which tells you immediately whether the buffer is wide enough.</text>
</svg>

**The intermediate write can dominate.** If pass one removes almost nothing, you have added a full write and read for no benefit. Measure the reduction before committing to the split; below about 30% it is rarely worth it.

**Two processes, two memory peaks.** Splitting only helps if the passes run sequentially. Launching them concurrently on the same worker re-creates the ceiling you were avoiding.

**Metadata has to be carried across each hand-off.** Every intermediate write is an opportunity to lose VLRs and extra dimensions. `forward: "all"` on every writer in the chain, and a check on the final header as described in [metadata and header sync](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/metadata-header-sync/).

## Frequently Asked Questions

**Does splitting a pipeline change the result?**

It should not, and verifying that is part of the job. Run both forms on a tile small enough to afford it and compare the surviving point counts. A difference means a reducing stage moved ahead of a stage whose decision depended on the points it removed — most often a crop without enough buffer.

**How much does the intermediate file cost?**

One extra write and one extra read, typically a few seconds per tile against gigabytes of memory headroom. The trade is only bad when the streaming pass removes very little; below roughly a thirty percent reduction the split stops paying for itself.

**Can I keep the intermediate in memory instead of on disk?**

You can pass arrays between pipelines in Python, but doing so re-creates exactly the whole-cloud residency that the split was meant to avoid. Local disk is the right place for the intermediate; tmpfs is not, because it is memory wearing a filesystem interface.

**Which stages are safe to move ahead of the blocking one?**

Ask whether the blocking stage would have decided differently had it seen the removed points. Dropping noise and applying generous elevation limits are safe. Cropping is safe with a buffer at least as wide as the classifier window. Thinning the cloud is not safe, because it changes which points are local minima.

---

## Related

- [Streaming Mode Execution in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/) — the parent guide to the chunked execution model
- [Which PDAL Filters Break Streaming Mode](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/which-pdal-filters-break-streaming-mode/) — how to identify the stage you need to cut at
- [Running a PDAL Pipeline in Streaming Mode](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/running-a-pdal-pipeline-in-streaming-mode/) — executing and verifying the streaming passes
- [Memory Management in PDAL Pipelines](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/) — the buffer model that sets each pass’s peak
- [PDAL Stage Chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/) — ordering rules that decide what can move earlier
