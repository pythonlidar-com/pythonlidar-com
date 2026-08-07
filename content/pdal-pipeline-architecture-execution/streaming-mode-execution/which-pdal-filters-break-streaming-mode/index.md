---
title: "Which PDAL Filters Break Streaming Mode"
description: "The rule that decides whether a PDAL stage can stream, the four families of blocking filter, and a script that bisects a pipeline to name the stage that made it non-streamable."
slug: "which-pdal-filters-break-streaming-mode"
type: "howto"
breadcrumb: "Which Filters Break Streaming"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Which PDAL Filters Break Streaming Mode",
      "description": "The rule that decides whether a PDAL stage can stream, the four families of blocking filter, and a script that bisects a pipeline to name the stage that made it non-streamable.",
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
          "name": "Which Filters Break Streaming",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/which-pdal-filters-break-streaming-mode/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Identify the stage that blocks streaming in a PDAL pipeline",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Read pipeline.streamable",
          "text": "Construct the pipeline in Python and read the streamable property, which is true only when every stage supports streaming."
        },
        {
          "@type": "HowToStep",
          "name": "Bisect the chain",
          "text": "Test prefixes of the stage list until the property flips from true to false; the last stage added is the blocker."
        },
        {
          "@type": "HowToStep",
          "name": "Classify the blocker",
          "text": "Decide whether it is a neighbourhood filter, an ordering filter, a surface builder or an accumulating writer."
        },
        {
          "@type": "HowToStep",
          "name": "Apply the matching workaround",
          "text": "Replace it, move it to a second pass over less data, or accept standard mode for that stage alone."
        },
        {
          "@type": "HowToStep",
          "name": "Assert the property in a test",
          "text": "Add an assertion on pipeline.streamable next to the pipeline definition so a later edit fails the test, not the job."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What single rule decides whether a filter streams?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Whether the answer for one point depends on any other point. A filter that tests one point's own dimensions streams; a filter that needs a neighbour, a global ordering or a completed raster does not. Every entry in the blocking list follows from that one rule."
          }
        },
        {
          "@type": "Question",
          "name": "Can I make a blocking filter stream by changing its options?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Occasionally. A few stages advertise different capability under different configurations, so it is always worth testing the exact chain you will run. But for the neighbourhood and surface-building filters the answer is structural \u2014 no option makes SMRF able to classify a point without seeing its surroundings."
          }
        },
        {
          "@type": "Question",
          "name": "Does one blocking stage really disable streaming for the whole pipeline?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. Capability is negotiated across the chain before any point moves, so a single blocking stage forces the entire pipeline into standard mode. That is why splitting a workflow into a streaming pass and a small blocking pass is usually more effective than trying to optimise the mixed chain."
          }
        },
        {
          "@type": "Question",
          "name": "Is filters.crop streamable even with a complex polygon?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. Testing whether one coordinate falls inside a fixed geometry is a per-point decision however complicated the geometry is. The polygon is loaded once at pipeline start and reused for every chunk, so complexity costs CPU rather than memory."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** A filter streams when its decision about a point depends on nothing but that point — `filters.range`, `filters.assign`, `filters.ferry`, `filters.crop` and `filters.reprojection` all qualify. Anything that needs neighbours, a global ordering or a completed raster — `filters.smrf`, `filters.outlier`, `filters.hag_nn`, `filters.sort`, `filters.sample`, `writers.gdal` — blocks, and one blocking stage makes the whole pipeline non-streamable.

## Context and Motivation

This guide is part of [Streaming Mode Execution in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/), which describes the chunked pull loop that keeps memory bounded. Here we answer the question that decides whether you can use it at all: given a chain of stages, which ones will refuse?

The rule is not arbitrary and it is not a list to memorise. A streaming stage receives one chunk, must produce its answer for those points, and then loses access to them forever. A filter can only work under that constraint if the decision for each point is a pure function of that point's own dimensions. The moment a filter needs to know something about a *different* point — the elevation of a neighbour, the rank of this point in a global sort, the number of returns within a radius — it must have the whole cloud, and PDAL marks it non-streamable. Once you see the rule that way, you can classify a filter you have never used before by asking a single question.

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The single test that decides whether a PDAL filter can stream" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>One question decides it</title>
  <desc>A decision diagram. Starting from a filter, the question is whether the answer for one point depends on any other point. If no, the filter streams and sees each point once. If yes, it needs the whole cloud in memory and blocks streaming for the entire pipeline, no matter how many streamable stages surround it.</desc>
  <defs><marker id="wfb-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="720" height="250" fill="var(--dg-bg)" rx="10"/>
  <rect x="180" y="40" width="360" height="48" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.5"/>
  <text x="360" y="70" text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--dg-text)">does the answer for this point need another point?</text>
  <path d="M360 88 L360 112 L180 112 L180 138" fill="none" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#wfb-arw)"/>
  <path d="M360 88 L360 112 L540 112 L540 138" fill="none" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#wfb-arw)"/>
  <text x="194" y="132" font-size="10.5" fill="var(--dg-d)">no</text>
  <text x="554" y="132" font-size="10.5" fill="var(--dg-e)">yes</text>
  <rect x="40" y="142" width="280" height="54" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.5"/>
  <text x="180" y="166" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">streams</text>
  <text x="180" y="186" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">one chunk at a time, memory bounded</text>
  <rect x="400" y="142" width="280" height="54" rx="8" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.5"/>
  <text x="540" y="166" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">blocks</text>
  <text x="540" y="186" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">whole cloud resident before it decides</text>
  <text x="40" y="226" font-size="10.5" fill="var(--dg-muted)">and one blocking stage anywhere in the chain makes every other stage block too — capability is a property of the pipeline</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL | 2.3+ — earlier versions stream fewer stages |
| Python `pdal` bindings | for `pipeline.streamable` |
| A pipeline to classify | the rules below apply to the chain, not to any one stage |
| `pdal --options <stage>` | prints the options a stage accepts, some of which change its capability |

Assume nothing from a stage's family name. `filters.range` streams and `filters.sample` does not, even though both are "filters that remove points".

## Step-by-Step Implementation

### Step 1 — Ask PDAL rather than guessing

```python
import pdal
p = pdal.Pipeline(spec)
print(p.streamable)
```

That single boolean is the ground truth for your exact chain with your exact options.

### Step 2 — Find the culprit by bisection

If the answer is `False`, remove stages from the end until it flips. The last stage you removed is the blocker. On the command line the same information arrives faster:

```bash
pdal pipeline chain.json --stream --verbose 8 2>&1 | grep -i stream
```

### Step 3 — Classify what you found

Blocking stages fall into four families, and the family tells you the workaround.

- **Neighbourhood filters** — `filters.outlier`, `filters.hag_nn`, `filters.neighborclassifier`, `filters.cluster`. Each needs a spatial index over all points.
- **Ordering filters** — `filters.sort`, `filters.mortonorder`. A global sort is definitionally not per-point.
- **Surface builders** — `filters.smrf`, `filters.pmf`, `filters.dem`. Each constructs a raster from every point before classifying any.
- **Accumulating writers** — `writers.gdal` when it must hold the raster, `writers.ogr` when it aggregates.

### Step 4 — Choose a workaround

Three exist, in order of preference: replace the stage with a streamable equivalent, move it to a second pass over much less data, or accept standard mode for that stage and bound the input by tiling.

## Complete Working Example

`classify_chain.py` reports which stages in a pipeline block streaming, by testing prefixes of the chain.

```python
"""Report the first stage in a PDAL pipeline that prevents streaming."""
from __future__ import annotations

import json
from typing import Any

import pdal


def first_blocking_stage(stages: list[dict[str, Any]]) -> int | None:
    """Return the index of the first stage that makes the chain non-streamable."""
    for cut in range(1, len(stages) + 1):
        prefix = stages[:cut]
        # A chain must end in something PDAL can execute; a bare reader is fine.
        pipeline = pdal.Pipeline(json.dumps({"pipeline": prefix}))
        if not pipeline.streamable:
            return cut - 1
    return None


def report(spec: dict[str, Any]) -> None:
    stages = spec["pipeline"]
    idx = first_blocking_stage(stages)
    if idx is None:
        print("streamable: every stage in the chain supports streaming")
        return

    blocker = stages[idx]
    print(f"blocked at stage {idx}: {blocker.get('type', '<inferred>')}")
    print(json.dumps(blocker, indent=2))
    print("\nstreamable prefix:")
    for s in stages[:idx]:
        print("  -", s.get("type", "<inferred>"))


if __name__ == "__main__":
    spec = {
        "pipeline": [
            {"type": "readers.las", "filename": "tile_0431.laz"},
            {"type": "filters.range", "limits": "Z[-30:5000]"},
            {"type": "filters.reprojection", "out_srs": "EPSG:6318"},
            {"type": "filters.outlier", "method": "statistical", "mean_k": 12},
            {"type": "writers.las", "filename": "out.laz"},
        ]
    }
    report(spec)
```

Output names the offender and, just as usefully, the prefix that would still stream:

```text
blocked at stage 3: filters.outlier
streamable prefix:
  - readers.las
  - filters.range
  - filters.reprojection
```

<svg viewBox="0 0 720 288" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A verbose PDAL log showing the streaming capability reported by each stage" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What --verbose 8 actually tells you</title>
  <desc>Six log lines from a verbose PDAL run. Each stage reports its streaming capability in order, and one line stands out: the statistical outlier filter reports that it is not streamable. The final line is the pipeline-level verdict, which follows from that single stage regardless of what the other four said.</desc>
  <rect x="0" y="0" width="720" height="288" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="48" width="320" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="34" y="67" font-size="11" fill="var(--dg-text)">readers.las</text>
  <rect x="360" y="48" width="320" height="28" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="520" y="67" text-anchor="middle" font-size="11" fill="var(--dg-text)">streamable</text>
  <rect x="20" y="82" width="320" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="34" y="101" font-size="11" fill="var(--dg-text)">filters.range</text>
  <rect x="360" y="82" width="320" height="28" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="520" y="101" text-anchor="middle" font-size="11" fill="var(--dg-text)">streamable</text>
  <rect x="20" y="116" width="320" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="34" y="135" font-size="11" fill="var(--dg-text)">filters.reprojection</text>
  <rect x="360" y="116" width="320" height="28" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="520" y="135" text-anchor="middle" font-size="11" fill="var(--dg-text)">streamable</text>
  <rect x="20" y="150" width="320" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="34" y="169" font-size="11" fill="var(--dg-text)">filters.outlier</text>
  <rect x="360" y="150" width="320" height="28" rx="5" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.1"/>
  <text x="520" y="169" text-anchor="middle" font-size="11" fill="var(--dg-text)">NOT streamable</text>
  <rect x="20" y="184" width="320" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="34" y="203" font-size="11" fill="var(--dg-text)">writers.las</text>
  <rect x="360" y="184" width="320" height="28" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="520" y="203" text-anchor="middle" font-size="11" fill="var(--dg-text)">streamable</text>
  <rect x="20" y="218" width="320" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="34" y="237" font-size="11" fill="var(--dg-text)">pipeline</text>
  <rect x="360" y="218" width="320" height="28" rx="5" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.1"/>
  <text x="520" y="237" text-anchor="middle" font-size="11" fill="var(--dg-text)">not streamable</text>
  <text x="20" y="36" font-size="10.5" fill="var(--dg-muted)">pdal pipeline chain.json --stream --verbose 8, one line per stage</text>
  <text x="20" y="278" font-size="10.5" fill="var(--dg-muted)">the fourth row is the answer; the sixth is only its consequence</text>
</svg>

## Key Parameter Table

| Stage | Streams | Why |
|---|---|---|
| `filters.range` | yes | Tests one point's dimensions against fixed limits |
| `filters.expression` | yes | Same, with a richer predicate syntax |
| `filters.assign` | yes | Writes a value into one point |
| `filters.ferry` | yes | Copies a dimension within one point |
| `filters.crop` | yes | Tests one coordinate against a fixed geometry |
| `filters.reprojection` | yes | Transforms one coordinate independently |
| `filters.outlier` | no | Needs the k nearest neighbours of each point |
| `filters.smrf` / `filters.pmf` | no | Builds a minimum surface from every point first |
| `filters.hag_nn` | no | Searches for nearby ground points |
| `filters.sort` | no | A global ordering is not a per-point decision |
| `filters.sample` | no | Poisson sampling depends on points already kept |
| `writers.gdal` | no | Accumulates raster cells across the whole input |

## Verification

Assert the property in the code that builds the pipeline, not in a comment:

```python
pipeline = pdal.Pipeline(spec)
assert pipeline.streamable, "a stage was added that blocks streaming"
```

Put that assertion in a unit test alongside the pipeline definition and a future edit that adds `filters.sample` fails the test rather than the production job. The same idea, applied to the whole pipeline rather than one property, is the subject of [validating PDAL pipelines in CI](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/validating-pdal-pipelines-in-ci/).

## Gotchas and Edge Cases

**Options can change capability.** `writers.gdal` and a handful of others advertise different capability depending on how they are configured. Always test the chain you will actually run rather than a simplified version.

**A reader can block too.** Most stream, but a reader that has to sort or index its source before yielding points does not. If bisection points at stage zero, the reader is the problem, and converting the source to LAZ or COPC usually solves it.

<svg viewBox="0 0 720 254" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Four families of blocking stage and the workaround each one allows" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Four families of blocker, four workarounds</title>
  <desc>Blocking stages grouped into four families with the workaround for each. Neighbourhood filters can often move to a second pass over a decimated cloud. Ordering filters can be dropped when downstream stages do not depend on order. Surface builders belong in their own pass over a cropped tile. Accumulating writers should be separated from the point-domain filtering entirely.</desc>
  <rect x="0" y="0" width="720" height="254" fill="var(--dg-bg)" rx="10"/>
  <text x="170" y="38" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">family</text>
  <text x="500" y="38" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">the workaround it allows</text>
  <rect x="20" y="48" width="300" height="42" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="170" y="68" text-anchor="middle" font-size="11" fill="var(--dg-text)">neighbourhood — outlier, hag_nn</text>
  <text x="170" y="84" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">needs a spatial index over all points</text>
  <rect x="360" y="48" width="340" height="42" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="530" y="74" text-anchor="middle" font-size="11" fill="var(--dg-text)">second pass over a cropped or decimated cloud</text>
  <rect x="20" y="100" width="300" height="42" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="170" y="120" text-anchor="middle" font-size="11" fill="var(--dg-text)">ordering — sort, mortonorder</text>
  <text x="170" y="136" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">a global rank is not per-point</text>
  <rect x="360" y="100" width="340" height="42" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="530" y="126" text-anchor="middle" font-size="11" fill="var(--dg-text)">drop it unless a later stage truly needs the order</text>
  <rect x="20" y="152" width="300" height="42" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="170" y="172" text-anchor="middle" font-size="11" fill="var(--dg-text)">surface builders — smrf, pmf</text>
  <text x="170" y="188" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">rasterizes everything before deciding</text>
  <rect x="360" y="152" width="340" height="42" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="530" y="178" text-anchor="middle" font-size="11" fill="var(--dg-text)">its own pass, on a tile small enough to fit</text>
  <rect x="20" y="204" width="300" height="42" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="170" y="224" text-anchor="middle" font-size="11" fill="var(--dg-text)">accumulating writers — gdal</text>
  <text x="170" y="240" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">holds the raster until the end</text>
  <rect x="360" y="204" width="340" height="42" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="530" y="230" text-anchor="middle" font-size="11" fill="var(--dg-text)">split point filtering from rasterization</text>
</svg>

**Streamable does not mean cheap.** `filters.reprojection` streams happily and is still one of the more expensive per-point operations in PDAL. Capability and cost are separate axes, and the [filtering logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) guide covers the second one.

**A stage that streams today may not tomorrow.** Capability has broadened across PDAL releases and occasionally narrowed. Pin the version — the [version drift](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/validating-pdal-pipelines-in-ci/) problem applies here as much as anywhere.

## Frequently Asked Questions

**What single rule decides whether a filter streams?**

Whether the answer for one point depends on any other point. A filter that tests one point's own dimensions streams; a filter that needs a neighbour, a global ordering or a completed raster does not. Every entry in the blocking list follows from that one rule.

**Can I make a blocking filter stream by changing its options?**

Occasionally. A few stages advertise different capability under different configurations, so it is always worth testing the exact chain you will run. But for the neighbourhood and surface-building filters the answer is structural — no option makes SMRF able to classify a point without seeing its surroundings.

**Does one blocking stage really disable streaming for the whole pipeline?**

Yes. Capability is negotiated across the chain before any point moves, so a single blocking stage forces the entire pipeline into standard mode. That is why splitting a workflow into a streaming pass and a small blocking pass is usually more effective than trying to optimise the mixed chain.

**Is filters.crop streamable even with a complex polygon?**

Yes. Testing whether one coordinate falls inside a fixed geometry is a per-point decision however complicated the geometry is. The polygon is loaded once at pipeline start and reused for every chunk, so complexity costs CPU rather than memory.

---

## Related

- [Streaming Mode Execution in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/) — the parent guide to the execution model and its memory behaviour
- [Running a PDAL Pipeline in Streaming Mode](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/running-a-pdal-pipeline-in-streaming-mode/) — the execution recipe once you know the chain qualifies
- [Splitting a Blocking Pipeline into Two Passes](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/splitting-a-blocking-pipeline-into-two-passes/) — the standard workaround when one stage cannot stream
- [Pipeline Filtering Logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) — what each filter costs, which is a separate question from whether it streams
- [PDAL Stage Chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/) — how stages hand buffers to one another in either mode
