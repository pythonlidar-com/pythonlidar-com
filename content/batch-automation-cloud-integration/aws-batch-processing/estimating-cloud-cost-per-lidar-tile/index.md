---
title: "Estimating Cloud Cost per LiDAR Tile"
description: "Estimate what a cloud LiDAR processing run will cost before launching it: measure vCPU-seconds and peak memory on sample tiles, convert to instance-hours, add S3 request, storage and transfer costs, and project to the full project with a per-tile model."
slug: "estimating-cloud-cost-per-lidar-tile"
type: "howto"
breadcrumb: "Cloud Cost per Tile"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Estimating Cloud Cost per LiDAR Tile",
      "description": "Estimate what a cloud LiDAR processing run will cost before launching it: measure vCPU-seconds and peak memory on sample tiles, convert to instance-hours, add S3 request, storage and transfer costs, and project to the full project with a per-tile model.",
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
          "name": "Batch & Cloud Automation",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "AWS Batch Processing",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Cloud Cost per Tile",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/estimating-cloud-cost-per-lidar-tile/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Estimate cloud processing cost per LiDAR tile",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Sample tiles across the density range",
          "text": "Sort tiles by point count and pick evenly spaced tiles, plus the densest few."
        },
        {
          "@type": "HowToStep",
          "name": "Measure each run",
          "text": "Record wall time, CPU seconds, peak RSS, and bytes in and out. /usr/bin/time -v or Python's resource.getrusage gives CPU time and peak memory."
        },
        {
          "@type": "HowToStep",
          "name": "Fit time against points",
          "text": "A linear fit of seconds against millions of points is usually adequate; check the residuals on the densest tiles."
        },
        {
          "@type": "HowToStep",
          "name": "Convert to instance cost",
          "text": "From peak memory and vCPUs per child, work out how many children fit per instance, then cost per tile = instance price per second \u00d7 seconds \u00f7 children per instance."
        },
        {
          "@type": "HowToStep",
          "name": "Add storage and requests, then project",
          "text": "Add S3 request and output storage costs per tile, sum over the tile index using each tile's point count, and add a retry and idle margin."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What drives the cost of processing a LiDAR tile in the cloud?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Compute time, which grows with the number of points in the tile and the filters applied. S3 requests and storage are usually small in comparison, and transfer within one region is free."
          }
        },
        {
          "@type": "Question",
          "name": "How many tiles should I measure to build a cost model?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Twenty to thirty tiles chosen across the full range of point counts, including the densest few, is usually enough to fit runtime against points and check the fit on holdout tiles."
          }
        },
        {
          "@type": "Question",
          "name": "Why do real runs cost more than the estimate?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Retries after spot interruptions, straggling dense tiles that keep instances alive at the end, and extra S3 requests from small read block sizes. A 10 to 20 percent margin covers most of this."
          }
        },
        {
          "@type": "Question",
          "name": "Does tile area predict processing cost?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Poorly. Point density varies greatly between tiles because of land cover and flightline overlap, so model cost on point counts from the tile index rather than on area."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Run the pipeline on a sample of tiles spanning the density range and record wall time, CPU time, peak memory and bytes read and written for each. Fit cost per tile as compute (instance price × instance-seconds ÷ tiles per instance) plus requests plus storage, then multiply by the tile count with a margin for retries. Compute usually dominates, and it scales with points, not with tile area.

## Context and Motivation

This guide is part of [AWS Batch Processing](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/). "How much will it cost to process the county?" is a question to answer before submitting 8,000 array children, not after the bill arrives. The answer is not hard to estimate, but it needs measurement rather than guesses: PDAL runtime varies by an order of magnitude between a sparse rural tile and a dense urban tile covered by several overlapping flightlines, and ground filters such as SMRF scale worse than linearly with point count.

A per-tile model built from twenty or thirty measured tiles predicts the full run well enough to choose between instance types, between spot and on-demand, and between processing everything and processing only what changed.

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Components of cost per tile" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>What a tile costs</title>
  <desc>A stacked breakdown of cost per tile into compute, the largest share, then S3 requests, S3 storage of outputs, and data transfer, which is zero within a region. Compute depends on points per tile and instance price; the others depend on bytes and request counts.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="40" width="460" height="56" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/>
  <rect x="490" y="40" width="90" height="56" rx="6" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/>
  <rect x="590" y="40" width="80" height="56" rx="6" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/>
  <rect x="680" y="40" width="40" height="56" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line)"/>
  <g font-size="10.5" fill="var(--dg-text)">
    <text text-anchor="middle" x="250" y="130">compute: price × instance-seconds</text>
    <text text-anchor="middle" x="535" y="130">requests</text>
    <text text-anchor="middle" x="630" y="130">storage</text>
    <text text-anchor="middle" x="700" y="130">xfer</text>
  </g>
  <g font-size="10" fill="var(--dg-muted)">
    <text text-anchor="middle" x="250" y="150">scales with points per tile</text>
    <text text-anchor="middle" x="535" y="150">GET / PUT</text>
    <text text-anchor="middle" x="630" y="150">GB-month</text>
    <text text-anchor="middle" x="700" y="150">≈0 in-region</text>
  </g>
  <text x="370" y="190" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">widths illustrate a typical DTM run; measure your own</text>
</svg>

## Prerequisites and Assumptions

- A working per-tile pipeline and container, as in [array jobs for LiDAR tiles in AWS Batch](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/array-jobs-for-lidar-tiles-in-aws-batch/).
- A tile index with point counts per tile (from `pdal info --summary` or the tile index), so the sample can be stratified.
- Current prices for your region from the AWS pricing pages. Prices below are placeholders for the arithmetic, not quotes.

## Step-by-Step Implementation

### Step 1 — Sample tiles across the density range

Sort tiles by point count and pick evenly spaced tiles, plus the densest few.

### Step 2 — Measure each run

Record wall time, CPU seconds, peak RSS, and bytes in and out. `/usr/bin/time -v` or Python's `resource.getrusage` gives CPU time and peak memory.

### Step 3 — Fit time against points

A linear fit of seconds against millions of points is usually adequate; check the residuals on the densest tiles.

### Step 4 — Convert to instance cost

From peak memory and vCPUs per child, work out how many children fit per instance, then cost per tile = instance price per second × seconds ÷ children per instance.

### Step 5 — Add storage and requests, then project

Add S3 request and output storage costs per tile, sum over the tile index using each tile's point count, and add a retry and idle margin.

## Complete Working Example

```python
"""Measure sample tiles, fit a time model, and project the cost of a full run."""
import json
import resource
import subprocess
import time

import numpy as np

SAMPLE = ["tiles/571_4190.laz", "tiles/580_4201.laz", "tiles/598_4222.laz"]  # stratified
PIPE = "dtm.json"   # the production pipeline, reading from FILENAME


def measure(tile):
    t0 = time.time()
    r0 = resource.getrusage(resource.RUSAGE_CHILDREN)
    subprocess.run(["pdal", "pipeline", PIPE, f"--readers.las.filename=/vsis3/lidar-in/{tile}",
                    "--writers.gdal.filename=/tmp/out.tif"], check=True)
    r1 = resource.getrusage(resource.RUSAGE_CHILDREN)
    info = json.loads(subprocess.run(["pdal", "info", "--summary", f"/vsis3/lidar-in/{tile}"],
                                     capture_output=True, text=True, check=True).stdout)
    return {"tile": tile, "mpts": info["summary"]["num_points"] / 1e6,
            "wall_s": time.time() - t0,
            "cpu_s": (r1.ru_utime + r1.ru_stime) - (r0.ru_utime + r0.ru_stime),
            "peak_gb": r1.ru_maxrss / 1024**2}          # ru_maxrss is KiB on Linux


rows = [measure(t) for t in SAMPLE]
mpts = np.array([r["mpts"] for r in rows])
wall = np.array([r["wall_s"] for r in rows])
slope, intercept = np.polyfit(mpts, wall, 1)
peak = max(r["peak_gb"] for r in rows)
print(f"seconds ≈ {slope:.1f} × Mpts + {intercept:.1f};  peak {peak:.1f} GB")

# ---- projection (placeholder prices: replace with your region's current rates) ----
INSTANCE_PER_HOUR = 0.34      # e.g. an 8 vCPU / 32 GB instance, spot or on-demand
VCPU, MEM_GB = 8, 32
children_per_instance = min(VCPU // 1, int(MEM_GB // (peak * 1.25)))
PUT_PER_1000, GET_PER_1000 = 0.005, 0.0004
STORAGE_GB_MONTH = 0.023

index = json.load(open("tile_index_counts.json"))       # {"tile": point_count, ...}
total_s = sum(slope * (n / 1e6) + intercept for n in index.values())
compute = total_s / 3600 / children_per_instance * INSTANCE_PER_HOUR
requests = len(index) * (20 / 1000 * GET_PER_1000 + 2 / 1000 * PUT_PER_1000)
storage = len(index) * 0.05 * STORAGE_GB_MONTH           # ~50 MB output per tile
total = (compute + requests + storage) * 1.15             # retries, idle, stragglers
print(f"{len(index)} tiles: compute ${compute:,.0f}, requests ${requests:,.2f}, "
      f"storage ${storage:,.2f}/month -> estimate ${total:,.0f}")
```

`ru_maxrss` from `RUSAGE_CHILDREN` reports the largest child so far, which is what matters for sizing when you measure one tile per call. On macOS it is in bytes rather than KiB.

<svg viewBox="0 0 740 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Runtime against point count for sample tiles" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Fitting seconds against points</title>
  <desc>A scatter plot of wall-clock seconds against millions of points for about a dozen sample tiles, with a fitted straight line. Points lie close to the line at low and medium density and slightly above it for the densest tiles, showing mild super-linear growth from the ground filter.</desc>
  <rect x="0" y="0" width="740" height="240" fill="var(--dg-bg)" rx="10"/>
  <line x1="70" y1="200" x2="700" y2="200" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="70" y1="200" x2="70" y2="24" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="385" y="228" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">million points per tile</text>
  <text x="30" y="112" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">sec</text>
  <line x1="80" y1="186" x2="690" y2="46" stroke="var(--dg-a)" stroke-width="1.6" stroke-dasharray="6 4"/>
  <g fill="var(--dg-d)">
    <circle cx="110" cy="178" r="5"/><circle cx="150" cy="170" r="5"/><circle cx="190" cy="163" r="5"/>
    <circle cx="240" cy="148" r="5"/><circle cx="290" cy="140" r="5"/><circle cx="340" cy="126" r="5"/>
    <circle cx="400" cy="113" r="5"/><circle cx="460" cy="100" r="5"/><circle cx="520" cy="82" r="5"/>
    <circle cx="580" cy="66" r="5"/><circle cx="640" cy="44" r="5"/><circle cx="680" cy="30" r="5"/>
  </g>
  <text x="520" y="160" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">dense tiles run slightly above the line</text>
</svg>

## Where Estimates Go Wrong

Three things commonly push real costs above the model. First, **stragglers**: compute environments scale in instances, and the last hour of a run is often a few long tiles keeping otherwise idle instances alive; sorting the manifest so dense tiles start first, and allowing instances to scale down, trims this. Second, **retries**: spot reclamation repeats work, and a 5–10% margin is realistic on busy instance families. Third, **hidden I/O**: reading LAZ over `/vsis3/` with a small block size multiplies GET requests, and writing temporary files to EBS adds volume costs. Configure GDAL's S3 options as in [configuring GDAL /vsis3/ for fast point cloud reads](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/configuring-gdal-vsis3-for-fast-point-cloud-reads/).

Things that make costs lower than feared are also worth checking: in-region transfer between S3 and EC2 is free, so moving terabytes of LAZ to compute in the same region does not add transfer charges; and when only a few tiles changed, processing only those — possible when outputs are idempotent and keyed by tile — reduces the run to a fraction of the full cost.

## Key Parameter Table

| Input | Source | Notes |
|---|---|---|
| Seconds per Mpts | Sample fit | Pipeline- and instance-specific |
| Peak memory per tile | `ru_maxrss` | Sets children per instance |
| Instance price | AWS pricing | Spot often well below on-demand |
| Children per instance | min(vCPU, memory ÷ peak) | With ~25% memory headroom |
| Requests per tile | S3 access logs or estimate | Depends on block size |
| Output GB per tile | Measured | Storage per month |
| Margin | 10–20% | Retries, stragglers, idle |

## Verification

- **Holdout tiles.** Predict the runtime of five tiles not in the fit and compare with measured runtimes; a consistent bias means the model needs another term.
- **Small real run.** Run 1% of the project and compare actual cost from Cost Explorer or tagged billing with the projection for that subset.
- **Tag resources.** Tag the compute environment and bucket by project so actual spend can be read back per run.

## Gotchas and Edge Cases

**Area is not a proxy.** Two 1 km tiles can differ tenfold in points. Always model on point counts.

**Instance choice changes the slope.** A newer CPU generation can cut seconds per million points noticeably; re-measure rather than scaling old results.

**Fargate prices differently.** Fargate charges per vCPU and GB of memory per second requested, so the memory headroom you declare is billed whether used or not.

<svg viewBox="0 0 740 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Straggler tail at the end of a run" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>The straggler tail</title>
  <desc>A curve of running instances over time rises quickly, stays flat through most of the run, then drops to a long thin tail where a few dense tiles keep several instances busy. Starting dense tiles first shortens this tail.</desc>
  <rect x="0" y="0" width="740" height="180" fill="var(--dg-bg)" rx="10"/>
  <line x1="60" y1="140" x2="700" y2="140" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="60" y1="140" x2="60" y2="24" stroke="var(--dg-line)" stroke-width="1.3"/>
  <path d="M60 140 L100 40 L480 40 L520 110 L690 110 L690 140 Z" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.4"/>
  <text x="290" y="96" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">full fleet</text>
  <text x="605" y="96" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">tail: few dense tiles</text>
  <text x="380" y="164" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">time → (sort dense tiles first to shrink the tail)</text>
</svg>

## Frequently Asked Questions

**What drives the cost of processing a LiDAR tile in the cloud?**

Compute time, which grows with the number of points in the tile and the filters applied. S3 requests and storage are usually small in comparison, and transfer within one region is free.

**How many tiles should I measure to build a cost model?**

Twenty to thirty tiles chosen across the full range of point counts, including the densest few, is usually enough to fit runtime against points and check the fit on holdout tiles.

**Why do real runs cost more than the estimate?**

Retries after spot interruptions, straggling dense tiles that keep instances alive at the end, and extra S3 requests from small read block sizes. A 10 to 20 percent margin covers most of this.

**Does tile area predict processing cost?**

Poorly. Point density varies greatly between tiles because of land cover and flightline overlap, so model cost on point counts from the tile index rather than on area.

## Related

- [AWS Batch Processing](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/) — running PDAL in AWS Batch
- [Array Jobs for LiDAR Tiles in AWS Batch](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/array-jobs-for-lidar-tiles-in-aws-batch/) — the run being priced
- [Handling Spot Interruptions in PDAL Batch Jobs](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/handling-spot-interruptions-in-pdal-batch-jobs/) — retries and spot
- [Measuring Peak Memory of a PDAL Pipeline](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/measuring-peak-memory-of-a-pdal-pipeline/) — sizing inputs
- [Load Balancing Uneven LiDAR Tiles](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/load-balancing-uneven-lidar-tiles/) — reducing stragglers
