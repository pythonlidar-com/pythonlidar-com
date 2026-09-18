---
title: "Checking Pipeline Output with pdal info --stats"
description: "Turn pdal info into an automated output check: read header summaries cheaply, compute per-dimension statistics with --stats, enumerate classes, compare against expected ranges, and fail a batch job before a bad tile is delivered."
slug: "checking-pipeline-output-with-pdal-info-stats"
type: "howto"
breadcrumb: "Output Checks with pdal info"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Checking Pipeline Output with pdal info --stats",
      "description": "Turn pdal info into an automated output check: read header summaries cheaply, compute per-dimension statistics with --stats, enumerate classes, compare against expected ranges, and fail a batch job before a bad tile is delivered.",
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
          "name": "Pipeline Validation",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Output Checks with pdal info",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/checking-pipeline-output-with-pdal-info-stats/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Check PDAL pipeline output with pdal info statistics",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Check the header with --summary",
          "text": "pdal info --summary tile.laz returns summary.num_points, summary.bounds and summary.srs without reading points. It catches empty files, wrong CRS and absurd extents immediately."
        },
        {
          "@type": "HowToStep",
          "name": "Compute statistics with --stats",
          "text": "pdal info --stats tile.laz reads every point and returns stats.statistic: one entry per dimension with minimum, maximum, average, stddev and count. Add --dimensions \"X,Y,Z,Intensity,Classification\" to limit the work to what you check."
        },
        {
          "@type": "HowToStep",
          "name": "Enumerate classes",
          "text": "--enumerate Classification asks the stats filter to report the distinct values of a dimension, which is the simplest way to check that no unexpected class appears."
        },
        {
          "@type": "HowToStep",
          "name": "Compare against rules",
          "text": "Keep rules in a small dictionary or YAML file: allowed classes, Z range, minimum points per square metre, required CRS substring."
        },
        {
          "@type": "HowToStep",
          "name": "Exit non-zero on failure",
          "text": "Batch systems understand exit codes. A non-zero exit marks the task failed, triggers retries or alerts, and keeps the bad tile out of downstream steps."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the difference between pdal info --summary and --stats?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The summary reads only the header and returns counts, bounds, the CRS and dimension names instantly. Stats reads every point and computes minimum, maximum, mean and standard deviation per dimension, costing one full pass over the file."
          }
        },
        {
          "@type": "Question",
          "name": "How do I list the classes present in a LAS file with PDAL?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run pdal info with the stats flag and enumerate Classification. The output lists the distinct classification values found, which you can compare against the classes your specification allows."
          }
        },
        {
          "@type": "Question",
          "name": "How do I make a batch job fail on a bad tile?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run the check script after the pipeline and exit with a non-zero status when any rule fails. Batch schedulers treat non-zero exits as task failures and can retry, alert or quarantine accordingly."
          }
        },
        {
          "@type": "Question",
          "name": "Can I compute these statistics without reading the file twice?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. Add filters.stats to the production pipeline before the writer and read its results from the pipeline metadata. The check then costs nothing beyond the original run."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** After each tile, run `pdal info --summary` (header only, instant) to check point count, bounds and CRS, and `pdal info --stats` (reads every point) to check per-dimension minimum, maximum and mean against expected ranges. Parse the JSON in Python, compare against a small rule table, and exit non-zero on any violation so the batch system marks the tile as failed.

## Context and Motivation

This guide is part of [Pipeline Validation](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/). Validation and unit tests check the pipeline; they cannot check the data that flows through it. A pipeline that is correct can still produce a bad tile — a source file with a wrong CRS, a flightline with a Z offset, a sensor that recorded zero intensity, a reprojection that silently used a ballpark transformation. The cheapest place to catch those is right after each tile is written, before it is merged, published or handed to a client.

`pdal info` is already installed wherever PDAL is, needs no code to run, and returns JSON. Wrapping it in a short Python check gives every batch job an output gate for the cost of one extra read.

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="An output check between the pipeline and delivery" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>A gate after every tile</title>
  <desc>A flow from the pipeline to a written tile, then to an output check running pdal info summary and stats. Tiles that pass continue to merging and delivery. Tiles that fail go to a quarantine folder with a report explaining which rule they broke, and the job exits non-zero.</desc>
  <defs><marker id="chk-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="80" width="120" height="44" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="80" y="106" text-anchor="middle" font-size="11" fill="var(--dg-text)">pipeline</text>
  <rect x="180" y="80" width="120" height="44" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="240" y="106" text-anchor="middle" font-size="11" fill="var(--dg-text)">tile.laz</text>
  <rect x="340" y="72" width="160" height="60" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.4"/>
  <text x="420" y="98" text-anchor="middle" font-size="11" fill="var(--dg-text)">output check</text>
  <text x="420" y="116" text-anchor="middle" font-size="10" fill="var(--dg-muted)">summary + stats</text>
  <rect x="560" y="30" width="160" height="44" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="640" y="56" text-anchor="middle" font-size="11" fill="var(--dg-text)">merge, deliver</text>
  <rect x="560" y="130" width="160" height="44" rx="8" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="640" y="156" text-anchor="middle" font-size="11" fill="var(--dg-text)">quarantine + report</text>
  <line x1="140" y1="102" x2="176" y2="102" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#chk-arw)"/>
  <line x1="300" y1="102" x2="336" y2="102" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#chk-arw)"/>
  <path d="M500 92 L530 92 L530 52 L556 52" fill="none" stroke="var(--dg-d)" stroke-width="1.4" marker-end="url(#chk-arw)"/>
  <path d="M500 112 L530 112 L530 152 L556 152" fill="none" stroke="var(--dg-e)" stroke-width="1.4" marker-end="url(#chk-arw)"/>
  <text x="536" y="44" font-size="10" fill="var(--dg-d)">pass</text>
  <text x="536" y="176" font-size="10" fill="var(--dg-e)">fail</text>
</svg>

## Prerequisites and Assumptions

- The PDAL command-line tool on the worker that writes the tiles.
- Python 3.10+ (standard library only for the check itself).
- Expected ranges for the project: rough elevation limits, expected classes, minimum density, the CRS every tile must carry.

## Step-by-Step Implementation

### Step 1 — Check the header with --summary

`pdal info --summary tile.laz` returns `summary.num_points`, `summary.bounds` and `summary.srs` without reading points. It catches empty files, wrong CRS and absurd extents immediately.

### Step 2 — Compute statistics with --stats

`pdal info --stats tile.laz` reads every point and returns `stats.statistic`: one entry per dimension with `minimum`, `maximum`, `average`, `stddev` and `count`. Add `--dimensions "X,Y,Z,Intensity,Classification"` to limit the work to what you check.

### Step 3 — Enumerate classes

`--enumerate Classification` asks the stats filter to report the distinct values of a dimension, which is the simplest way to check that no unexpected class appears.

### Step 4 — Compare against rules

Keep rules in a small dictionary or YAML file: allowed classes, Z range, minimum points per square metre, required CRS substring.

### Step 5 — Exit non-zero on failure

Batch systems understand exit codes. A non-zero exit marks the task failed, triggers retries or alerts, and keeps the bad tile out of downstream steps.

## Complete Working Example

```python
"""Post-write output check for a LAS/LAZ tile using pdal info."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

RULES = {
    "crs_contains": "UTM zone 18N",
    "z_range": (-20.0, 900.0),
    "allowed_classes": {1, 2, 3, 4, 5, 6, 9, 17},
    "min_density": 8.0,               # points per square metre
}


def pdal_info(path: Path, *args: str) -> dict:
    out = subprocess.run(["pdal", "info", str(path), *args],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def check(path: Path) -> list[str]:
    problems: list[str] = []
    summ = pdal_info(path, "--summary")["summary"]
    n = int(summ["num_points"])
    b = summ["bounds"]
    area = (b["maxx"] - b["minx"]) * (b["maxy"] - b["miny"])
    wkt = json.dumps(summ.get("srs", {}))
    if n == 0:
        return ["file contains no points"]
    if RULES["crs_contains"] not in wkt:
        problems.append("CRS does not match project CRS")
    if area > 0 and n / area < RULES["min_density"]:
        problems.append(f"density {n / area:.1f} pts/m² below {RULES['min_density']}")

    stats = pdal_info(path, "--stats", "--dimensions", "Z,Intensity,Classification",
                      "--enumerate", "Classification")["stats"]["statistic"]
    by_name = {s["name"]: s for s in stats}
    z = by_name["Z"]
    lo, hi = RULES["z_range"]
    if z["minimum"] < lo or z["maximum"] > hi:
        problems.append(f"Z range {z['minimum']:.1f}..{z['maximum']:.1f} outside {lo}..{hi}")
    if by_name["Intensity"]["maximum"] == 0:
        problems.append("Intensity is zero for every point")
    classes = {int(float(v)) for v in by_name["Classification"].get("values", [])}
    unexpected = classes - RULES["allowed_classes"]
    if unexpected:
        problems.append(f"unexpected classes {sorted(unexpected)}")
    return problems


if __name__ == "__main__":
    tile = Path(sys.argv[1])
    issues = check(tile)
    report = {"tile": tile.name, "ok": not issues, "issues": issues}
    print(json.dumps(report))
    sys.exit(1 if issues else 0)
```

Run after the pipeline in the same batch task:

```bash
pdal pipeline dtm_and_laz.json --writers.las.filename=out/t_0431.laz \
  && python check_tile.py out/t_0431.laz \
  || mv out/t_0431.laz quarantine/
```

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cost of summary versus stats on a large tile" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Header checks are free; statistics cost one read</title>
  <desc>Bars of run time for a 40 million point LAZ tile. pdal info with summary takes 0.05 seconds because it reads only the header. pdal info with stats on three dimensions takes about 14 seconds. With all dimensions it takes about 22 seconds. A note recommends always running the summary and running stats on the dimensions that matter.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <text x="220" y="50" text-anchor="end" font-size="11" fill="var(--dg-text)">--summary</text>
  <rect x="230" y="36" width="4" height="22" fill="var(--dg-d)"/>
  <text x="242" y="52" font-size="10.5" fill="var(--dg-muted)">0.05 s</text>
  <text x="220" y="100" text-anchor="end" font-size="11" fill="var(--dg-text)">--stats, 3 dimensions</text>
  <rect x="230" y="86" width="280" height="22" fill="var(--dg-b)"/>
  <text x="518" y="102" font-size="10.5" fill="var(--dg-muted)">14 s</text>
  <text x="220" y="150" text-anchor="end" font-size="11" fill="var(--dg-text)">--stats, all dimensions</text>
  <rect x="230" y="136" width="440" height="22" fill="var(--dg-c)"/>
  <text x="662" y="130" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">22 s</text>
  <text x="230" y="186" font-size="10.5" fill="var(--dg-muted)">illustrative 40 M point LAZ tile</text>
</svg>

## Key Parameter Table

| Option | Reads | Returns | Use for |
|---|---|---|---|
| `--summary` | header | count, bounds, SRS, dimensions | Empty files, CRS, extent, density |
| `--stats` | all points | min, max, mean, stddev per dimension | Value ranges |
| `--dimensions A,B` | all points, listed dims | stats only for those | Faster stats |
| `--enumerate Dim` | all points | distinct values of Dim | Unexpected classes |
| `--metadata` | header | full LAS header metadata | Version, PDRF, VLRs, GPS time type |
| `--schema` | header | dimension names and types | Extra bytes present |

## Verification

- **Break a tile on purpose.** Reproject a copy to the wrong CRS, shift Z by 1,000 m, or write class 64 into a few points; each must fail the check with a clear message.
- **Exit codes.** Confirm your batch system treats the non-zero exit as failure, not as a warning to be logged and ignored.
- **Report archive.** Keep the JSON reports; a sudden change in, say, mean intensity across a batch is often the first sign of a sensor issue.

## Gotchas and Edge Cases

**Enumerate output format.** The exact JSON layout of enumerated values has varied between PDAL versions. Parse defensively — accept numbers or strings — and test the parser against your pinned version.

**Stats read the whole file.** On very large tiles, `--stats` costs a full read. Limit `--dimensions`, or compute statistics inside the production pipeline with `filters.stats` and read them from `pipeline.metadata` instead of re-reading the file.

**Bounds from the header can be stale.** A writer that did not update the header — or a tool other than PDAL — can leave wrong bounds. Compare `--summary` bounds with the `--stats` minima and maxima of X and Y; see [repairing stale LAS header bounds and counts](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/metadata-header-sync/repairing-stale-las-header-bounds-and-counts/).

<svg viewBox="130 0 590 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Header bounds disagreeing with computed statistics" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>When the header and the points disagree</title>
  <desc>Two overlapping rectangles in plan view. The header bounds rectangle is larger, left over from before a crop. The computed extent of the actual points, from statistics, is a smaller rectangle inside it. A note says a mismatch beyond one scale unit means the header was not updated.</desc>
  <rect x="130" y="0" width="590" height="170" fill="var(--dg-bg)" rx="10"/>
  <rect x="160" y="20" width="420" height="130" fill="none" stroke="var(--dg-e)" stroke-width="1.6" stroke-dasharray="6 4"/>
  <rect x="240" y="50" width="240" height="80" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.5"/>
  <text x="170" y="38" font-size="10.5" fill="var(--dg-e)">header bounds (stale)</text>
  <text x="360" y="94" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">actual extent from --stats</text>
  <text x="600" y="90" font-size="10.5" fill="var(--dg-muted)">flag if they differ</text>
  <text x="600" y="106" font-size="10.5" fill="var(--dg-muted)">by more than scale</text>
</svg>

**Rules that are too tight.** A Z range copied from one tile fails on the next hill. Set limits from project-wide knowledge — lowest water surface, highest summit plus structures — not from a sample.

## Frequently Asked Questions

**What is the difference between pdal info --summary and --stats?**

The summary reads only the header and returns counts, bounds, the CRS and dimension names instantly. Stats reads every point and computes minimum, maximum, mean and standard deviation per dimension, costing one full pass over the file.

**How do I list the classes present in a LAS file with PDAL?**

Run pdal info with the stats flag and enumerate Classification. The output lists the distinct classification values found, which you can compare against the classes your specification allows.

**How do I make a batch job fail on a bad tile?**

Run the check script after the pipeline and exit with a non-zero status when any rule fails. Batch schedulers treat non-zero exits as task failures and can retry, alert or quarantine accordingly.

**Can I compute these statistics without reading the file twice?**

Yes. Add filters.stats to the production pipeline before the writer and read its results from the pipeline metadata. The check then costs nothing beyond the original run.

## Related

- [Pipeline Validation](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/) — structural and behavioural checks
- [Testing PDAL Pipelines with pytest](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/testing-pdal-pipelines-with-pytest/) — checking the pipeline rather than the data
- [Counting Points per Class with PDAL](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/counting-points-per-class-with-pdal/) — class histograms in depth
- [Repairing Stale LAS Header Bounds and Counts](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/metadata-header-sync/repairing-stale-las-header-bounds-and-counts/) — fixing what the check finds
- [Retrying Failed Tiles in Airflow](https://www.pythonlidar.com/batch-automation-cloud-integration/airflow-dag-orchestration/retrying-failed-tiles-in-airflow/) — acting on the exit code
