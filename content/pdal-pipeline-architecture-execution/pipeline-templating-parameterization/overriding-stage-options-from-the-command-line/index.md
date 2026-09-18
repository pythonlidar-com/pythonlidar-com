---
title: "Overriding Stage Options from the Command Line"
description: "Use PDAL's built-in option overrides to reuse one pipeline JSON for every tile: --readers.las.filename style overrides, tagged --stage.<tag>.<option> overrides for pipelines with repeated stage types, and a parallel shell loop."
slug: "overriding-stage-options-from-the-command-line"
type: "howto"
breadcrumb: "Command-Line Stage Overrides"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Overriding Stage Options from the Command Line",
      "description": "Use PDAL's built-in option overrides to reuse one pipeline JSON for every tile: --readers.las.filename style overrides, tagged --stage.<tag>.<option> overrides for pipelines with repeated stage types, and a parallel shell loop.",
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
          "name": "Pipeline Templating",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-templating-parameterization/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Command-Line Stage Overrides",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-templating-parameterization/overriding-stage-options-from-the-command-line/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Override PDAL stage options from the command line",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Write the pipeline with representative values",
          "text": "Use a real tile path so the file validates on its own. Overrides replace the value at run time."
        },
        {
          "@type": "HowToStep",
          "name": "Override by stage type",
          "text": "--<stage type>.<option>=<value> applies to every stage of that type in the pipeline."
        },
        {
          "@type": "HowToStep",
          "name": "Tag stages that repeat",
          "text": "This pipeline has two filters.range stages. To change only the second, tag it and override the tag."
        },
        {
          "@type": "HowToStep",
          "name": "Loop over tiles in parallel",
          "text": "Hand the tile list to GNU parallel, deriving output names from input names."
        },
        {
          "@type": "HowToStep",
          "name": "Record what actually ran",
          "text": "Pass --verbose 4 and keep the log, or add --pipeline-serialization to write the effective pipeline with overrides applied, for provenance."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Can I override options when running PDAL from Python?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Not with the command-line syntax. In Python, load the JSON into a dict and change the option, or build the pipeline with the stage API. Both produce the same result as a command-line override."
          }
        },
        {
          "@type": "Question",
          "name": "What happens if two stages share a type and I override that type?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The override applies to every stage of that type. Tag the stages and use the stage.tag.option form to change only one of them."
          }
        },
        {
          "@type": "Question",
          "name": "How do I see the pipeline that actually ran after overrides?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Pass the pipeline-serialization option with a filename; PDAL writes the effective pipeline, including overridden values, to that file."
          }
        },
        {
          "@type": "Question",
          "name": "Are command-line overrides enough for multi-project batches?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "For paths and one or two values, yes. When the set of stages or many options differ per project, a template or the Python stage API is easier to maintain."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Keep one pipeline JSON with placeholder paths, then run `pdal pipeline dtm.json --readers.las.filename=in.laz --writers.gdal.filename=out.tif` per tile. When a pipeline has two stages of the same type, give each a `"tag"` and override with `--stage.<tag>.<option>=value` so only that stage changes.

## Context and Motivation

This guide is part of [PDAL Pipeline Templating and Parameterization](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-templating-parameterization/). Before reaching for a template engine, check whether PDAL already does what you need. The `pdal pipeline` command accepts option overrides for any stage on its command line, which covers the most common kind of parameter — a different input and output path for every tile — without rendering anything. The pipeline file stays a plain, valid JSON document that you can validate once and reuse thousands of times.

Overrides are also the natural fit for shell-driven batch tools: GNU `parallel`, a Slurm array job, or an AWS Batch array where the tile path arrives as an environment variable.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="One pipeline file combined with per-tile command-line overrides" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>File for the shape, flags for the values</title>
  <desc>A pipeline JSON file with placeholder filenames sits on the left. Three command lines on the right each pass different reader and writer filenames as overrides. Each combination runs as an independent PDAL process producing its own output raster.</desc>
  <defs><marker id="ovr-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="50" width="190" height="100" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="115" y="76" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">dtm.json</text>
  <text x="115" y="100" text-anchor="middle" font-size="10" fill="var(--dg-muted)">readers.las: in.laz</text>
  <text x="115" y="118" text-anchor="middle" font-size="10" fill="var(--dg-muted)">filters.smrf</text>
  <text x="115" y="136" text-anchor="middle" font-size="10" fill="var(--dg-muted)">writers.gdal: out.tif</text>
  <rect x="280" y="20" width="440" height="40" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.1"/>
  <text x="294" y="44" font-size="10" fill="var(--dg-text)">--readers.las.filename=t_0431.laz --writers.gdal.filename=t_0431.tif</text>
  <rect x="280" y="80" width="440" height="40" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.1"/>
  <text x="294" y="104" font-size="10" fill="var(--dg-text)">--readers.las.filename=t_0432.laz --writers.gdal.filename=t_0432.tif</text>
  <rect x="280" y="140" width="440" height="40" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.1"/>
  <text x="294" y="164" font-size="10" fill="var(--dg-text)">--readers.las.filename=t_0433.laz --writers.gdal.filename=t_0433.tif</text>
  <path d="M210 100 L240 100 L240 40 L278 40" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#ovr-arw)"/>
  <line x1="210" y1="100" x2="278" y2="100" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#ovr-arw)"/>
  <path d="M210 100 L240 100 L240 160 L278 160" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#ovr-arw)"/>
</svg>

## Prerequisites and Assumptions

- The PDAL command-line application (2.x). Overrides are a feature of `pdal pipeline`, not of the Python bindings.
- A pipeline JSON that runs correctly for one tile.
- For parallel runs, GNU `parallel` or `xargs -P`.

## Step-by-Step Implementation

### Step 1 — Write the pipeline with representative values

Use a real tile path so the file validates on its own. Overrides replace the value at run time.

```json
{
  "pipeline": [
    { "type": "readers.las", "filename": "tiles/t_0431.laz" },
    { "type": "filters.range", "limits": "Classification![7:7],Classification![18:18]" },
    { "type": "filters.smrf", "slope": 0.15, "window": 18, "threshold": 0.5 },
    { "type": "filters.range", "limits": "Classification[2:2]" },
    { "type": "writers.gdal", "filename": "out/t_0431_dtm.tif", "resolution": 1.0,
      "output_type": "idw", "data_type": "float32" }
  ]
}
```

### Step 2 — Override by stage type

`--<stage type>.<option>=<value>` applies to every stage of that type in the pipeline.

```bash
pdal pipeline dtm.json \
  --readers.las.filename=tiles/t_0432.laz \
  --writers.gdal.filename=out/t_0432_dtm.tif
```

### Step 3 — Tag stages that repeat

This pipeline has two `filters.range` stages. To change only the second, tag it and override the tag.

```json
{ "type": "filters.range", "tag": "keep_ground", "limits": "Classification[2:2]" }
```

```bash
pdal pipeline dtm.json --stage.keep_ground.limits="Classification[2:2],Z[-50:3000]"
```

### Step 4 — Loop over tiles in parallel

Hand the tile list to GNU `parallel`, deriving output names from input names.

### Step 5 — Record what actually ran

Pass `--verbose 4` and keep the log, or add `--pipeline-serialization` to write the effective pipeline with overrides applied, for provenance.

## Complete Working Example

```bash
#!/usr/bin/env bash
# Run one pipeline over every tile, four at a time, with per-tile overrides.
set -euo pipefail

PIPELINE=dtm.json
mkdir -p out logs

pdal pipeline --validate "$PIPELINE"

find tiles -name '*.laz' | sort | parallel -j 4 --halt now,fail=1 --joblog logs/jobs.tsv '
  base=$(basename {} .laz)
  pdal pipeline '"$PIPELINE"' \
    --readers.las.filename={} \
    --writers.gdal.filename=out/${base}_dtm.tif \
    --pipeline-serialization=out/${base}.pipeline.json \
    --verbose 4 > logs/${base}.log 2>&1
'

awk -F'\t' 'NR > 1 && $7 != 0 { bad++ } END { print (bad ? bad : 0), "failed tiles" }' logs/jobs.tsv
```

`--halt now,fail=1` stops the batch on the first failure, which is what you want while developing; switch to `--halt never` in production and read the job log for tiles to retry.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Type-based override hitting both range stages versus a tagged override hitting one" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Type overrides hit every match; tags hit one</title>
  <desc>Two copies of a five-stage pipeline with two filters.range stages. In the upper copy, an override on filters.range.limits highlights both range stages, changing the noise filter by accident. In the lower copy, a tagged override on stage.keep_ground.limits highlights only the second range stage.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="30" font-size="10.5" fill="var(--dg-muted)">--filters.range.limits=…</text>
  <g font-size="10" fill="var(--dg-text)">
    <rect x="20" y="40" width="120" height="34" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="80" y="61">readers.las</text>
    <rect x="160" y="40" width="120" height="34" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)"/><text text-anchor="middle" x="220" y="61">range (noise)</text>
    <rect x="300" y="40" width="120" height="34" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="360" y="61">smrf</text>
    <rect x="440" y="40" width="120" height="34" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)"/><text text-anchor="middle" x="500" y="61">range (ground)</text>
    <rect x="580" y="40" width="140" height="34" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="650" y="61">writers.gdal</text>
  </g>
  <text x="20" y="116" font-size="10.5" fill="var(--dg-muted)">--stage.keep_ground.limits=…</text>
  <g font-size="10" fill="var(--dg-text)">
    <rect x="20" y="126" width="120" height="34" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="80" y="147">readers.las</text>
    <rect x="160" y="126" width="120" height="34" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="220" y="147">range (noise)</text>
    <rect x="300" y="126" width="120" height="34" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="360" y="147">smrf</text>
    <rect x="440" y="126" width="120" height="34" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="500" y="147">range (ground)</text>
    <rect x="580" y="126" width="140" height="34" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="650" y="147">writers.gdal</text>
  </g>
  <text x="20" y="188" font-size="10.5" fill="var(--dg-muted)">red: changed, including a stage you did not mean · green: changed, only the tagged stage</text>
</svg>

## Overrides in Batch Schedulers

The same pattern carries directly into schedulers that hand each task an index rather than a filename. An AWS Batch array job exposes `AWS_BATCH_JOB_ARRAY_INDEX`; a Slurm array exposes `SLURM_ARRAY_TASK_ID`. A two-line wrapper maps the index to a tile from a manifest and calls `pdal pipeline` with overrides, so the container image carries one pipeline file and never needs rebuilding for a new tile list.

```bash
#!/usr/bin/env bash
set -euo pipefail
idx="${AWS_BATCH_JOB_ARRAY_INDEX:-${SLURM_ARRAY_TASK_ID:-0}}"
tile=$(sed -n "$((idx + 1))p" manifest.txt)
base=$(basename "$tile" .laz)
exec pdal pipeline /opt/pipelines/dtm.json \
  --readers.las.filename="/vsis3/lidar-in/$tile" \
  --writers.gdal.filename="/vsis3/lidar-out/dtm/${base}.tif"
```

Because the manifest is the only thing that changes between runs, retrying a failed index reproduces exactly the same command. The full pattern, including how the manifest is uploaded and how failures are collected, is in [array jobs for LiDAR tiles in AWS Batch](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/array-jobs-for-lidar-tiles-in-aws-batch/).

## Key Parameter Table

| Form | Example | Applies to |
|---|---|---|
| `--<type>.<option>=v` | `--readers.las.filename=a.laz` | Every stage of that type |
| `--stage.<tag>.<option>=v` | `--stage.keep_ground.limits=...` | The one stage with that tag |
| `--pipeline-serialization=f` | `--pipeline-serialization=run.json` | Writes the effective pipeline after overrides |
| `--validate` | `pdal pipeline --validate p.json` | Checks stages and options without running |
| `--stream` | `pdal pipeline p.json --stream` | Requests streaming execution |
| `--verbose N` | `--verbose 4` | Log detail; 4 shows stage progress, 8 shows everything |

## Verification

- **Check the serialized pipeline.** Open one `out/*.pipeline.json` and confirm the filenames and any overridden options are what you expected.
- **Count outputs.** The number of rasters should equal the number of tiles minus failures in the job log.
- **Spot-check a raster.** `gdalinfo -stats out/t_0432_dtm.tif` should show a plausible elevation range, not the range of the tile named in the JSON file.

```bash
jq -r '.pipeline[] | select(.type=="readers.las") | .filename' out/t_0432.pipeline.json
ls out/*_dtm.tif | wc -l
```

## Gotchas and Edge Cases

**Overrides do not exist in the Python bindings.** `pdal.Pipeline` takes JSON only. In Python, modify the parsed JSON dict or use the stage API — see [building pipelines with the Python stage API](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-templating-parameterization/building-pipelines-with-the-python-stage-api/).

**Shell quoting of expressions.** Range limits and expressions contain brackets, commas and sometimes `&&`. Quote the whole `--option=value` argument, and inside `parallel` commands, double-check the layers of quoting with `--dry-run` first.

**An override for a missing option adds it.** Overriding an option the stage does not set in the JSON adds it — useful, but a misspelled option name is then rejected at run time rather than ignored. That is a feature: typos fail loudly.

<svg viewBox="130 0 570 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Where command-line overrides sit in the order of option resolution" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Which value wins</title>
  <desc>Three stacked layers for one stage option. The bottom layer is the stage's built-in default. Above it, the value written in the pipeline JSON overrides the default. On top, a command-line override replaces both. An arrow shows the effective value is read from the highest layer present.</desc>
  <rect x="130" y="0" width="570" height="170" fill="var(--dg-bg)" rx="10"/>
  <rect x="160" y="16" width="420" height="38" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="370" y="40" text-anchor="middle" font-size="11" fill="var(--dg-text)">command line: --writers.gdal.resolution=0.5</text>
  <rect x="160" y="64" width="420" height="38" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="370" y="88" text-anchor="middle" font-size="11" fill="var(--dg-text)">pipeline JSON: "resolution": 1.0</text>
  <rect x="160" y="112" width="420" height="38" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="370" y="136" text-anchor="middle" font-size="11" fill="var(--dg-text)">stage default</text>
  <text x="600" y="40" font-size="10.5" fill="var(--dg-d)">effective: 0.5</text>
</svg>

**Readers inferred from filenames.** A pipeline whose first element is a bare filename string has an inferred reader type. Override it with the concrete type — `--readers.las.filename` — which only works if the inferred type is `readers.las`. Explicit stage objects avoid the ambiguity.

## Frequently Asked Questions

**Can I override options when running PDAL from Python?**

Not with the command-line syntax. In Python, load the JSON into a dict and change the option, or build the pipeline with the stage API. Both produce the same result as a command-line override.

**What happens if two stages share a type and I override that type?**

The override applies to every stage of that type. Tag the stages and use the stage.tag.option form to change only one of them.

**How do I see the pipeline that actually ran after overrides?**

Pass the pipeline-serialization option with a filename; PDAL writes the effective pipeline, including overridden values, to that file.

**Are command-line overrides enough for multi-project batches?**

For paths and one or two values, yes. When the set of stages or many options differ per project, a template or the Python stage API is easier to maintain.

## Related

- [PDAL Pipeline Templating and Parameterization](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-templating-parameterization/) — comparing mechanisms
- [Parameterizing Pipelines with Jinja Templates](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-templating-parameterization/parameterizing-pipelines-with-jinja-templates/) — when overrides are not enough
- [Building Pipelines with the Python Stage API](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-templating-parameterization/building-pipelines-with-the-python-stage-api/) — the Python equivalent
- [Array Jobs for LiDAR Tiles in AWS Batch](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/array-jobs-for-lidar-tiles-in-aws-batch/) — overrides driven by an array index
- [Validating PDAL Pipelines in CI](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/validating-pdal-pipelines-in-ci/) — validating the base JSON once
