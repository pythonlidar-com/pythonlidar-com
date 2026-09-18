---
title: "Branching a PDAL Pipeline with Tags"
description: "Read a tile once and write several products from it: tag stages, route them with inputs, produce a DTM, a DSM and a classified LAZ in one PDAL pipeline, and understand how branches share and copy point views."
slug: "branching-a-pdal-pipeline-with-tags"
type: "howto"
breadcrumb: "Branching with Tags"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Branching a PDAL Pipeline with Tags",
      "description": "Read a tile once and write several products from it: tag stages, route them with inputs, produce a DTM, a DSM and a classified LAZ in one PDAL pipeline, and understand how branches share and copy point views.",
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
          "name": "PDAL Stage Chaining",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Branching with Tags",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/branching-a-pdal-pipeline-with-tags/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Branch a PDAL pipeline with tags and inputs to write several outputs",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Tag the shared stage",
          "text": "Add \"tag\": \"cleaned\" to the last stage whose output every branch needs \u2014 here, the noise filter after the reader."
        },
        {
          "@type": "HowToStep",
          "name": "Start each branch with inputs",
          "text": "The first stage of each branch sets \"inputs\": [\"cleaned\"]. Every following stage in that branch chains implicitly from the one before it, exactly as in a linear pipeline."
        },
        {
          "@type": "HowToStep",
          "name": "End each branch with a writer",
          "text": "Each branch terminates in its own writer. PDAL executes every branch that ends in a writer."
        },
        {
          "@type": "HowToStep",
          "name": "Tag writers for command-line overrides",
          "text": "Tagging the writers (dtm_out, dsm_out, laz_out) lets you override each filename independently with --stage.<tag>.filename."
        },
        {
          "@type": "HowToStep",
          "name": "Validate the graph",
          "text": "pdal pipeline --validate reports unknown tags and cycles; run it before the first real execution."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How do I write several outputs from one PDAL pipeline?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Tag the stage whose output all outputs share, then start each output's branch with a stage that lists that tag in inputs and end it with its own writer. PDAL runs every branch that ends in a writer."
          }
        },
        {
          "@type": "Question",
          "name": "Do branches share memory or copy the points?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Each consumer of a tag gets its own view of the points, so changes in one branch do not leak into another. Depending on the stages involved, that can mean extra memory for the duration of the run."
          }
        },
        {
          "@type": "Question",
          "name": "Can a branching pipeline run in streaming mode?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. A stage output consumed by more than one downstream stage requires standard mode. Split the work into a streaming pass that writes an intermediate file and a branched pass over that file if memory is tight."
          }
        },
        {
          "@type": "Question",
          "name": "What happens if I reference a tag that does not exist?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Validation fails with an error naming the unknown input. Run pdal pipeline with the validate flag before executing new branched pipelines."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Give a stage a `"tag"`, then start each branch with a stage whose `"inputs"` lists that tag. One reader tagged `cleaned` can feed a ground branch ending in a DTM writer, a first-return branch ending in a DSM writer and a pass-through branch ending in a LAZ writer — all in one pipeline, reading and cleaning the tile once.

## Context and Motivation

This guide is part of [PDAL Stage Chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/). Most pipelines are written as a straight list, and PDAL treats that list as a chain where each stage's input is the stage before it. But a pipeline is really a directed acyclic graph, and the `tag` and `inputs` options let you write that graph explicitly. The practical payoff is avoiding repeated work: a production DTM run usually also needs a DSM, a classified point cloud and maybe an intensity image, and reading, decompressing and noise-filtering the same 2 GB tile four times is wasted time and I/O.

Branching also keeps related outputs consistent. When the DTM and DSM come from one pipeline, they are guaranteed to share the same cleaning, the same CRS handling and the same PDAL version.

<svg viewBox="0 0 740 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A reader and cleaning stage feeding three branches with different writers" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>One read, three products</title>
  <desc>A reader feeds a range filter tagged cleaned. Three branches take cleaned as input. The ground branch keeps class 2 and writes a DTM with writers.gdal. The surface branch keeps first returns and writes a DSM with writers.gdal. The archive branch writes the whole cleaned cloud to LAZ.</desc>
  <defs><marker id="br-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="230" fill="var(--dg-bg)" rx="10"/>
  <rect x="16" y="92" width="110" height="46" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="71" y="119" text-anchor="middle" font-size="11" fill="var(--dg-text)">readers.las</text>
  <rect x="160" y="92" width="130" height="46" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="225" y="112" text-anchor="middle" font-size="11" fill="var(--dg-text)">filters.range</text>
  <text x="225" y="128" text-anchor="middle" font-size="10" fill="var(--dg-muted)">tag: cleaned</text>
  <rect x="350" y="24" width="160" height="40" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="430" y="48" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">range Classification[2:2]</text>
  <rect x="350" y="95" width="160" height="40" rx="7" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="430" y="119" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">range ReturnNumber[1:1]</text>
  <rect x="560" y="24" width="160" height="40" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="640" y="48" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">writers.gdal → DTM</text>
  <rect x="560" y="95" width="160" height="40" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="640" y="119" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">writers.gdal → DSM</text>
  <rect x="560" y="166" width="160" height="40" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="640" y="190" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">writers.las → LAZ</text>
  <line x1="126" y1="115" x2="156" y2="115" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#br-arw)"/>
  <path d="M290 110 L320 110 L320 44 L346 44" fill="none" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#br-arw)"/>
  <line x1="290" y1="115" x2="346" y2="115" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#br-arw)"/>
  <path d="M290 120 L320 120 L320 186 L556 186" fill="none" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#br-arw)"/>
  <line x1="510" y1="44" x2="556" y2="44" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#br-arw)"/>
  <line x1="510" y1="115" x2="556" y2="115" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#br-arw)"/>
</svg>

## Prerequisites and Assumptions

- PDAL 2.x; `tag` and `inputs` have been part of the pipeline format for many releases.
- A tile with ground classified (for the DTM branch) and return numbers populated (for the DSM branch).
- Enough memory for the tile in standard mode. Branching pipelines do not stream, because more than one downstream consumer needs the same points.

## Step-by-Step Implementation

### Step 1 — Tag the shared stage

Add `"tag": "cleaned"` to the last stage whose output every branch needs — here, the noise filter after the reader.

### Step 2 — Start each branch with inputs

The first stage of each branch sets `"inputs": ["cleaned"]`. Every following stage in that branch chains implicitly from the one before it, exactly as in a linear pipeline.

### Step 3 — End each branch with a writer

Each branch terminates in its own writer. PDAL executes every branch that ends in a writer.

### Step 4 — Tag writers for command-line overrides

Tagging the writers (`dtm_out`, `dsm_out`, `laz_out`) lets you override each filename independently with `--stage.<tag>.filename`.

### Step 5 — Validate the graph

`pdal pipeline --validate` reports unknown tags and cycles; run it before the first real execution.

## Complete Working Example

```json
{
  "pipeline": [
    { "type": "readers.las", "filename": "tiles/t_0431.laz", "tag": "raw" },
    { "type": "filters.range", "limits": "Classification![7:7],Classification![18:18]",
      "inputs": ["raw"], "tag": "cleaned" },

    { "type": "filters.range", "limits": "Classification[2:2]",
      "inputs": ["cleaned"], "tag": "ground" },
    { "type": "writers.gdal", "filename": "out/t_0431_dtm.tif", "inputs": ["ground"],
      "resolution": 1.0, "output_type": "idw", "window_size": 6,
      "data_type": "float32", "tag": "dtm_out" },

    { "type": "filters.range", "limits": "ReturnNumber[1:1]",
      "inputs": ["cleaned"], "tag": "first" },
    { "type": "writers.gdal", "filename": "out/t_0431_dsm.tif", "inputs": ["first"],
      "resolution": 1.0, "output_type": "max", "data_type": "float32", "tag": "dsm_out" },

    { "type": "writers.las", "filename": "out/t_0431_clean.laz", "inputs": ["cleaned"],
      "minor_version": 4, "dataformat_id": 6, "forward": "all", "tag": "laz_out" }
  ]
}
```

Running it from Python and checking all three outputs exist:

```python
import json
from pathlib import Path

import pdal

spec = json.loads(Path("branch.json").read_text())
p = pdal.Pipeline(json.dumps(spec))
n = p.execute()
print("points processed:", n)
for f in ("out/t_0431_dtm.tif", "out/t_0431_dsm.tif", "out/t_0431_clean.laz"):
    assert Path(f).exists(), f"missing {f}"
```

Explicit `inputs` on every stage is verbose but unambiguous; you can omit `inputs` on a stage whose input is simply the stage before it, but writing them all out makes the graph readable at a glance.

<svg viewBox="60 0 500 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Wall time for three separate pipelines versus one branched pipeline" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>What branching saves</title>
  <desc>Two stacked bars of wall time for producing a DTM, a DSM and a LAZ from one tile. Three separate pipelines each read and clean the tile, totalling 138 seconds, of which read and clean account for 84. One branched pipeline reads and cleans once, totalling 82 seconds.</desc>
  <rect x="60" y="0" width="500" height="200" fill="var(--dg-bg)" rx="10"/>
  <text x="170" y="62" text-anchor="end" font-size="11" fill="var(--dg-text)">3 separate runs</text>
  <rect x="180" y="44" width="168" height="28" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.1"/>
  <rect x="348" y="44" width="112" height="28" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.1"/>
  <text x="468" y="63" font-size="10.5" fill="var(--dg-muted)">138 s</text>
  <text x="170" y="122" text-anchor="end" font-size="11" fill="var(--dg-text)">1 branched run</text>
  <rect x="180" y="104" width="56" height="28" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.1"/>
  <rect x="236" y="104" width="112" height="28" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.1"/>
  <text x="356" y="123" font-size="10.5" fill="var(--dg-muted)">82 s</text>
  <rect x="180" y="160" width="14" height="12" fill="var(--dg-c-soft)" stroke="var(--dg-c)"/><text x="200" y="170" font-size="10.5" fill="var(--dg-muted)">read + decompress + clean</text>
  <rect x="400" y="160" width="14" height="12" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text x="420" y="170" font-size="10.5" fill="var(--dg-muted)">branch-specific work</text>
  <text x="180" y="30" font-size="10.5" fill="var(--dg-muted)">illustrative 1 km² tile, 40 M points, LAZ input</text>
</svg>

## Key Parameter Table

| Option | On | Meaning |
|---|---|---|
| `tag` | any stage | Names the stage's output so other stages can refer to it |
| `inputs` | any non-reader stage | List of tags this stage consumes; several tags merge their views |
| `--stage.<tag>.<option>` | command line | Override one tagged stage's option |
| `filters.merge` | after several inputs | Explicitly merges views into one before further processing |
| `writers.*` | branch end | Every branch ending in a writer is executed |

## Verification

- **All outputs written.** Each writer's file exists after execution; a branch whose input tag is misspelled fails validation rather than silently being skipped.
- **Consistent extents.** The DTM and DSM rasters should share their origin and size when the same `resolution` and bounds apply; compare with `gdalinfo`.
- **Point counts per branch.** Run with `--verbose 4` to see how many points each stage received.

## Gotchas and Edge Cases

**Branches receive copies.** When two stages consume the same tag, each branch works on its own view. A filter in one branch that modifies a dimension — `filters.assign` changing classes, say — does not affect the other branch. That is usually what you want, but it also means memory holds more than one view at a time for stages that copy.

**Multiple inputs merge.** A stage with `"inputs": ["a", "b"]` receives both views. For writers that means both sets of points are written together — useful for merging, surprising if you meant to pick one.

**No streaming.** A tag consumed by more than one stage forces standard execution. If memory is the constraint, split the work into a streaming cleaning pass that writes an intermediate LAZ, then a branched pass; see [splitting a blocking pipeline into two passes](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/splitting-a-blocking-pipeline-into-two-passes/).

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A stage consuming two tags receives both views" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Two inputs means both sets of points</title>
  <desc>Two branches tagged ground and first feed one writer whose inputs list both tags. The writer receives the union of both point sets, so ground points that are also first returns appear twice in the output. A note recommends one writer per branch unless a merge is intended.</desc>
  <defs><marker id="br2-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <rect x="40" y="24" width="180" height="40" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="130" y="48" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">tag: ground</text>
  <rect x="40" y="96" width="180" height="40" rx="7" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="130" y="120" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">tag: first</text>
  <rect x="320" y="58" width="220" height="46" rx="8" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="430" y="78" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">writers.las</text>
  <text x="430" y="95" text-anchor="middle" font-size="10" fill="var(--dg-muted)">inputs: ["ground", "first"]</text>
  <path d="M220 44 L270 44 L270 72 L316 72" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#br2-arw)"/>
  <path d="M220 116 L270 116 L270 90 L316 90" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#br2-arw)"/>
  <text x="560" y="78" font-size="10.5" fill="var(--dg-e)">union of both views:</text>
  <text x="560" y="95" font-size="10.5" fill="var(--dg-e)">first-return ground twice</text>
  <text x="40" y="158" font-size="10.5" fill="var(--dg-muted)">one writer per branch unless you genuinely mean to merge</text>
</svg>

**Readers do not take inputs.** Tags on readers name them for later stages; `inputs` on a reader is meaningless. Multiple readers feeding one stage is the merge pattern covered in [merging multiple readers in one pipeline](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/merging-multiple-readers-in-one-pipeline/).

## Frequently Asked Questions

**How do I write several outputs from one PDAL pipeline?**

Tag the stage whose output all outputs share, then start each output's branch with a stage that lists that tag in inputs and end it with its own writer. PDAL runs every branch that ends in a writer.

**Do branches share memory or copy the points?**

Each consumer of a tag gets its own view of the points, so changes in one branch do not leak into another. Depending on the stages involved, that can mean extra memory for the duration of the run.

**Can a branching pipeline run in streaming mode?**

No. A stage output consumed by more than one downstream stage requires standard mode. Split the work into a streaming pass that writes an intermediate file and a branched pass over that file if memory is tight.

**What happens if I reference a tag that does not exist?**

Validation fails with an error naming the unknown input. Run pdal pipeline with the validate flag before executing new branched pipelines.

## Related

- [PDAL Stage Chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/) — how stages pass views to one another
- [Merging Multiple Readers in One Pipeline](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/merging-multiple-readers-in-one-pipeline/) — the opposite shape: many inputs, one output
- [Reordering PDAL Stages for Speed](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/reordering-pdal-stages-for-speed/) — where to put shared work
- [Building a DSM from First Returns](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/building-a-dsm-from-first-returns/) — the DSM branch in depth
- [Overriding Stage Options from the Command Line](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-templating-parameterization/overriding-stage-options-from-the-command-line/) — tagged overrides for branch outputs
