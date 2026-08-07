---
title: "Reordering PDAL Stages for Speed"
description: "How to rank PDAL stages by cost and selectivity, which reorderings are safe, and a script that times every legal permutation of a chain and asserts they all produce the same result."
slug: "reordering-pdal-stages-for-speed"
type: "howto"
breadcrumb: "Reordering Stages for Speed"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Reordering PDAL Stages for Speed",
      "description": "How to rank PDAL stages by cost and selectivity, which reorderings are safe, and a script that times every legal permutation of a chain and asserts they all produce the same result.",
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
          "name": "PDAL Stage Chaining",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Reordering Stages for Speed",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/reordering-pdal-stages-for-speed/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Reorder a PDAL pipeline for speed without changing its result",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Measure cost and selectivity per stage",
          "text": "Record seconds spent and points removed for each stage using verbose logging and a temporary stats filter."
        },
        {
          "@type": "HowToStep",
          "name": "Rank by removed points per second",
          "text": "Sort the movable stages so the cheapest and most selective run first."
        },
        {
          "@type": "HowToStep",
          "name": "Apply the dependency constraints",
          "text": "Keep dimension readers after their creators, keep unit-bearing parameters on the correct side of the reprojection, and preserve spatial context for stages that need it."
        },
        {
          "@type": "HowToStep",
          "name": "Time every legal permutation",
          "text": "Run the candidate orders and compare medians rather than single runs."
        },
        {
          "@type": "HowToStep",
          "name": "Assert the outputs agree",
          "text": "Fail the comparison if two orderings produce different point counts, because one of them is wrong."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How much can reordering actually save?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "On a chain containing one selective stage and one expensive stage, two to five times is typical. The saving is simply the expensive stage running on the reduced cloud instead of the full one, so it scales with how selective the reducing stage is on your data."
          }
        },
        {
          "@type": "Question",
          "name": "Which stage should almost always run first?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "An elevation range filter. It is nearly free, it needs nothing from any other stage, and on real acquisitions it removes the blunders that would otherwise distort every later statistic. A crop usually comes next, buffered if a classifier follows."
          }
        },
        {
          "@type": "Question",
          "name": "Can reordering change the output?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes, and that is why the timing script asserts the point counts agree. The usual culprits are moving a thinning filter ahead of a classifier, or cropping without a buffer ahead of a stage that needs neighbours at the tile edge."
          }
        },
        {
          "@type": "Question",
          "name": "Does the best order depend on the data?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Strongly. A crop that removes ninety-five percent of an urban tile may remove five percent of a rural one, which changes the ranking entirely. When a single order has to serve a whole campaign, tune it against the least favourable tile."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Move every stage that removes points as early as correctness allows, and every stage that adds a dimension as late as possible — then measure, because the ordering that is fastest on a dense urban tile is often not the one that is fastest on sparse rural coverage.

## Context and Motivation

This guide is part of [PDAL Stage Chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/), which covers how stages hand buffers to one another. Here the question is narrower and entirely practical: given a set of stages that must all run, in which order should they run?

The naive answer — the order in which you thought of them — is usually two to five times slower than the best one, and the reason is arithmetic rather than anything subtle. Every stage costs roughly its per-point cost multiplied by the number of points reaching it. A stage that removes eighty percent of the cloud therefore makes every subsequent stage five times cheaper, and it does so whether it runs first or last. Put it first and the saving applies to everything; put it last and it applies to nothing. The complication is that not every reordering preserves the result, and the stages that reduce the most are often the ones with dependencies.

<svg viewBox="0 0 720 258" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Points reaching each stage under two orderings of the same five stages" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>The same five stages, two orders, two bills</title>
  <desc>Two bar rows showing how many points reach each stage. In the naive order the expensive outlier filter runs on all 18.4 million points. In the tuned order a crop and elevation limits run first, so the outlier filter sees 5.2 million, and total runtime falls from 118 seconds to 34.</desc>
  <rect x="0" y="0" width="720" height="258" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="36" font-size="11.5" font-weight="600" fill="var(--dg-e)">as written — 118 s</text>
  <rect x="180" y="48" width="480" height="26" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="170" y="66" text-anchor="end" font-size="10.5" fill="var(--dg-text)">outlier</text>
  <text x="668" y="66" font-size="10" fill="var(--dg-muted)">18.4 M</text>
  <rect x="180" y="80" width="470" height="26" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="170" y="98" text-anchor="end" font-size="10.5" fill="var(--dg-text)">reproject</text>
  <text x="658" y="98" font-size="10" fill="var(--dg-muted)">18.0 M</text>
  <rect x="180" y="112" width="140" height="26" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="170" y="130" text-anchor="end" font-size="10.5" fill="var(--dg-text)">crop</text>
  <text x="328" y="130" font-size="10" fill="var(--dg-muted)">5.2 M</text>
  <text x="20" y="172" font-size="11.5" font-weight="600" fill="var(--dg-d)">reordered — 34 s</text>
  <rect x="180" y="184" width="140" height="26" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="170" y="202" text-anchor="end" font-size="10.5" fill="var(--dg-text)">crop</text>
  <text x="328" y="202" font-size="10" fill="var(--dg-muted)">5.2 M</text>
  <rect x="180" y="216" width="136" height="26" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="170" y="234" text-anchor="end" font-size="10.5" fill="var(--dg-text)">outlier + reproject</text>
  <text x="324" y="234" font-size="10" fill="var(--dg-muted)">5.1 M</text>
  <text x="380" y="234" font-size="10.5" fill="var(--dg-muted)">bar length is the points reaching that stage</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL | 2.4+ |
| A chain that already produces the right answer | reordering is an optimisation, not a fix |
| A representative tile | dense and sparse tiles reward different orders |
| `time` or `pipeline.metadata` | to measure rather than guess |

## Step-by-Step Implementation

### Step 1 — Write down each stage's selectivity and cost

Run the chain once with logging and record two numbers per stage: seconds spent, and points removed. `pdal pipeline --verbose 4` reports timings; point counts come from a `filters.stats` inserted temporarily, or from the difference in output counts when you truncate the chain.

### Step 2 — Sort by cheap-and-selective first

Rank the stages by removed-points per second and put the highest first. Elevation limits and crops almost always win this ranking; classification and neighbourhood filters almost always lose it.

### Step 3 — Apply the dependency constraints

Three hard rules survive any reordering:

- A stage that reads a dimension must run after the stage that creates it. `filters.range` on `HeightAboveGround` cannot precede `filters.hag_nn`.
- A stage whose parameters are in CRS units must run after the reprojection that establishes those units — or before it, consistently, but never with the units of the other side.
- A stage that needs spatial context must not run after something that removed that context. A crop without buffer ahead of a ground classifier is the classic mistake.

### Step 4 — Re-measure, and keep the measurement

Ordering choices decay: a new stage gets added, the input density changes, and the order that was optimal is not. Record the timing in the repository next to the pipeline so the next person can see why the order is what it is.

## Complete Working Example

```python
"""Time a PDAL pipeline under several stage orderings and report the best."""
from __future__ import annotations

import itertools
import json
import time
from typing import Any

import pdal

READER = {"type": "readers.las", "filename": "tile_0431.laz"}
WRITER = {"type": "writers.las", "filename": "/tmp/out.laz", "compression": "laszip"}

MOVABLE: list[dict[str, Any]] = [
    {"type": "filters.range", "limits": "Z[-30:5000]"},
    {"type": "filters.crop", "polygon": "POLYGON((512000 4783000, 513000 4783000, "
                                        "513000 4784000, 512000 4784000, 512000 4783000))"},
    {"type": "filters.outlier", "method": "statistical", "mean_k": 12, "multiplier": 2.5},
]

# Reprojection must stay after the crop, whose polygon is in source CRS units.
FIXED_LAST = {"type": "filters.reprojection", "out_srs": "EPSG:6318"}


def timed(stages: list[dict[str, Any]]) -> tuple[float, int]:
    spec = json.dumps({"pipeline": [READER, *stages, FIXED_LAST, WRITER]})
    started = time.perf_counter()
    n = pdal.Pipeline(spec).execute()
    return time.perf_counter() - started, n


def main() -> None:
    results = []
    for order in itertools.permutations(MOVABLE):
        seconds, kept = timed(list(order))
        names = " → ".join(s["type"].split(".", 1)[1] for s in order)
        results.append((seconds, kept, names))
        print(f"{seconds:7.2f}s  {kept:>10,}  {names}")

    results.sort()
    best, kept, names = results[0]
    worst = results[-1][0]
    print(f"\nbest: {names} at {best:.2f}s — {worst / best:.1f}x faster than the worst order")
    counts = {r[1] for r in results}
    assert len(counts) == 1, f"orderings disagree on the result: {counts}"


if __name__ == "__main__":
    main()
```

The assertion at the end matters as much as the timing: if two orderings produce different point counts, one of them is wrong and the fast one is not automatically the right one.

<svg viewBox="38 7 558 261" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Stage cost recomputed as points reaching the stage multiplied by cost per million points" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>The arithmetic behind the reordering</title>
  <desc>Four rows showing the same two stages costed twice: once running on all 18.4 million points and once running after a crop that leaves 5.2 million. The outlier filter falls from 96 seconds to 27, the reprojection from 41 to 12. Neither stage got faster — each simply received a third of the work.</desc>
  <rect x="38" y="7" width="558" height="261" fill="var(--dg-bg)" rx="10"/>
  <text x="196" y="76" text-anchor="end" font-size="11" fill="var(--dg-text)">outlier, first</text>
  <rect x="206" y="54" width="253" height="32" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="467" y="76" font-size="10.5" fill="var(--dg-muted)">96 s  ·  18.4 M points in</text>
  <text x="196" y="120" text-anchor="end" font-size="11" fill="var(--dg-text)">outlier, after crop</text>
  <rect x="206" y="98" width="71" height="32" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="285" y="120" font-size="10.5" fill="var(--dg-muted)">27 s  ·  5.2 M points in</text>
  <text x="196" y="164" text-anchor="end" font-size="11" fill="var(--dg-text)">reproject, first</text>
  <rect x="206" y="142" width="108" height="32" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="322" y="164" font-size="10.5" fill="var(--dg-muted)">41 s  ·  18.4 M points in</text>
  <text x="196" y="208" text-anchor="end" font-size="11" fill="var(--dg-text)">reproject, after crop</text>
  <rect x="206" y="186" width="31" height="32" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="245" y="208" font-size="10.5" fill="var(--dg-muted)">12 s  ·  5.2 M points in</text>
  <text x="206" y="40" font-size="10.5" fill="var(--dg-muted)">seconds on one tile, before and after a crop that removes 72% of the cloud</text>
  <text x="60" y="242" font-size="10.5" fill="var(--dg-muted)">cost is per-point cost times points arriving — the second term is the one you control</text>
</svg>

## Key Parameter Table

| Stage | Typical cost | Typical removal | Where it belongs |
|---|---|---|---|
| `filters.range` on Z | very low | 1–5% | first, always |
| `filters.range` on Classification | very low | 0–40% | first, if the input is already classified |
| `filters.crop` | low | 20–95% | first, buffered if a classifier follows |
| `filters.reprojection` | medium | 0% | after everything that reduces, before anything in target units |
| `filters.outlier` | high | 0.5–2% | late — it is expensive and barely selective |
| `filters.smrf` | very high | 0% | last among filters; it labels rather than removes |

## Verification

**Every ordering yields the same output.** That is the assertion in the example. Run it on at least one tile with unusual content — a tile that is mostly water, or one that straddles a crop boundary.

**The speedup is real, not noise.** Time each ordering three times and compare medians. A twenty percent difference on a single run is usually the page cache, not the pipeline.

**Metadata still matches.** Reordering can change which stage last touched the header. Compare `pdal info --metadata` output between orderings; the CRS and bounding box should be identical.

## Gotchas and Edge Cases

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Three ordering constraints that no speed argument can override" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Three constraints that outrank speed</title>
  <desc>Three rules that survive any reordering. A stage that reads a dimension must follow the stage that creates it. A stage whose parameters are in CRS units must be on the correct side of the reprojection. A stage that needs spatial context must not follow a stage that removed that context.</desc>
  <rect x="0" y="0" width="720" height="250" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="44" width="680" height="56" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="36" y="68" font-size="11.5" font-weight="600" fill="var(--dg-text)">a reader of a dimension follows its creator</text>
  <text x="36" y="88" font-size="10.5" fill="var(--dg-muted)">filters.range on HeightAboveGround cannot precede filters.hag_nn — the dimension does not exist yet</text>
  <rect x="20" y="110" width="680" height="56" rx="8" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="36" y="134" font-size="11.5" font-weight="600" fill="var(--dg-text)">units must match the side of the reprojection</text>
  <text x="36" y="154" font-size="10.5" fill="var(--dg-muted)">a crop polygon in UTM metres is meaningless after a transform to degrees, and silently keeps nothing</text>
  <rect x="20" y="176" width="680" height="56" rx="8" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="36" y="200" font-size="11.5" font-weight="600" fill="var(--dg-text)">context must survive until the stage that needs it</text>
  <text x="36" y="220" font-size="10.5" fill="var(--dg-muted)">an unbuffered crop ahead of a ground classifier removes the neighbours it needed at the tile edge</text>
</svg>

**A faster order that changes the answer is not faster.** The most common instance is moving `filters.sample` earlier: thinning the cloud before classification changes which points are local minima, and the ground surface moves. The point counts will differ and the assertion will catch it — if you wrote the assertion.

**Selectivity is data-dependent.** A crop that removes 95% of an urban tile may remove 5% of the rural tile next to it. If one order must serve a whole campaign, tune it on the least favourable tile rather than the most.

**Reordering interacts with streaming.** Some orders are streamable and others are not, and a chain that streams is often worth more than a chain that is nominally faster — see [streaming mode execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/).

## Frequently Asked Questions

**How much can reordering actually save?**

On a chain containing one selective stage and one expensive stage, two to five times is typical. The saving is simply the expensive stage running on the reduced cloud instead of the full one, so it scales with how selective the reducing stage is on your data.

**Which stage should almost always run first?**

An elevation range filter. It is nearly free, it needs nothing from any other stage, and on real acquisitions it removes the blunders that would otherwise distort every later statistic. A crop usually comes next, buffered if a classifier follows.

**Can reordering change the output?**

Yes, and that is why the timing script asserts the point counts agree. The usual culprits are moving a thinning filter ahead of a classifier, or cropping without a buffer ahead of a stage that needs neighbours at the tile edge.

**Does the best order depend on the data?**

Strongly. A crop that removes ninety-five percent of an urban tile may remove five percent of a rural one, which changes the ranking entirely. When a single order has to serve a whole campaign, tune it against the least favourable tile.

---

## Related

- [PDAL Stage Chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/) — the parent guide to how stages pass buffers
- [Chaining PDAL Stages for Data Cleaning](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/chaining-pdal-stages-for-data-cleaning/) — the cleaning chain this ordering advice is usually applied to
- [Pipeline Filtering Logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) — what each filter costs and how selective it is
- [Streaming Mode Execution in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/) — why a streamable order can beat a nominally faster one
- [PDAL Pipeline Architecture and Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/) — the section overview
