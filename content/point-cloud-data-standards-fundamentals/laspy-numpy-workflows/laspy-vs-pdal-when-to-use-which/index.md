---
title: "laspy vs PDAL: When to Use Which"
description: "A practical comparison of laspy and PDAL for Python LiDAR work: installation, memory model, speed, supported operations, cloud I/O and reproducibility — with a decision table and a pattern for using both in one workflow."
slug: "laspy-vs-pdal-when-to-use-which"
type: "howto"
breadcrumb: "laspy vs PDAL"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "laspy vs PDAL: When to Use Which",
      "description": "A practical comparison of laspy and PDAL for Python LiDAR work: installation, memory model, speed, supported operations, cloud I/O and reproducibility \u2014 with a decision table and a pattern for using both in one workflow.",
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
          "name": "Point Cloud Data Standards & Fundamentals",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "laspy and NumPy Workflows",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "laspy vs PDAL",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/laspy-vs-pdal-when-to-use-which/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Choose between laspy and PDAL for a LiDAR task",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Classify the task",
          "text": "Is it file-level (headers, fields, format conversion), point-wise (arithmetic on attributes), or spatial (neighbours, surfaces, rasters)?"
        },
        {
          "@type": "HowToStep",
          "name": "Check the environment constraints",
          "text": "Can you install PDAL with its GDAL and PROJ dependencies here? In a Lambda function or a minimal container, laspy may be the only realistic option."
        },
        {
          "@type": "HowToStep",
          "name": "Consider data size and memory",
          "text": "laspy reads whole files or chunks you manage yourself; PDAL can stream through a multi-stage pipeline with bounded memory."
        },
        {
          "@type": "HowToStep",
          "name": "Consider reproducibility and review",
          "text": "PDAL pipelines are JSON documents a reviewer can read and CI can validate; laspy logic lives in Python code."
        },
        {
          "@type": "HowToStep",
          "name": "Combine at the array boundary",
          "text": "Where a task needs both, pass NumPy arrays between them rather than writing intermediate files."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Is laspy or PDAL better for Python LiDAR processing?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Neither is better in general. laspy excels at reading, editing and writing LAS and LAZ data as NumPy arrays with a light install. PDAL excels at spatial processing, reprojection, rasterization and multi-format, multi-stage pipelines. Most production workflows use both."
          }
        },
        {
          "@type": "Question",
          "name": "Can PDAL and laspy read the same files?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. Both read LAS and LAZ, and both can query COPC. PDAL also reads many other point cloud formats."
          }
        },
        {
          "@type": "Question",
          "name": "Which is faster?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "For reading and writing LAS or LAZ, they are broadly comparable, with laspy's parallel LAZ backend competitive. For spatial algorithms, PDAL is far faster because laspy has none and NumPy reimplementations are usually slower."
          }
        },
        {
          "@type": "Question",
          "name": "How do I pass data from PDAL to laspy?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Execute the PDAL pipeline and take pipeline.arrays, then assign the fields to a laspy LasData object, mapping PDAL's CamelCase names to laspy's snake_case names and setting the CRS explicitly."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Use laspy when the job is reading, editing or writing LAS/LAZ fields in NumPy — headers, attributes, arrays from other tools — and you want a light pip install. Use PDAL when the job involves spatial algorithms (ground filtering, outliers, height above ground, rasterization), reprojection, many formats, streaming through multi-stage pipelines, or reproducible JSON pipelines in batch. For most production work, use both: PDAL for the heavy stages, laspy or NumPy for the custom steps in between.

## Context and Motivation

This guide is part of [laspy and NumPy Workflows for LAS Data](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/). Teams starting with Python LiDAR processing often ask which library to standardize on, and the question is framed as a choice when it is really a division of labour. The two tools have different centres of gravity. laspy is a file-format library: it knows everything about LAS and LAZ and nothing about algorithms. PDAL is a processing framework: it knows dozens of formats and a large catalogue of filters, and exposes them through pipelines. Picking the right one per task — and knowing how to pass data between them — saves both effort and memory.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Capabilities of laspy and PDAL laid out on two axes" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>File format library versus processing framework</title>
  <desc>A two-axis chart. The horizontal axis runs from file-level operations to spatial algorithms; the vertical axis from lightweight install to full geospatial stack. laspy sits at file-level operations with a lightweight install. PDAL sits at spatial algorithms with a full geospatial stack including GDAL and PROJ. NumPy sits between them as the common data representation.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="190" x2="700" y2="190" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="80" y1="190" x2="80" y2="20" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="390" y="212" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">file-level operations → spatial algorithms</text>
  <text x="40" y="105" font-size="10.5" fill="var(--dg-muted)" transform="rotate(-90 40 105)" text-anchor="middle">install footprint</text>
  <rect x="110" y="120" width="170" height="54" rx="10" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.4"/>
  <text x="195" y="143" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">laspy</text>
  <text x="195" y="162" text-anchor="middle" font-size="10" fill="var(--dg-muted)">pip, pure Python + lazrs</text>
  <rect x="500" y="32" width="180" height="54" rx="10" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.4"/>
  <text x="590" y="55" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">PDAL</text>
  <text x="590" y="74" text-anchor="middle" font-size="10" fill="var(--dg-muted)">C++, GDAL, PROJ, conda</text>
  <rect x="320" y="84" width="140" height="44" rx="10" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="390" y="111" text-anchor="middle" font-size="11" fill="var(--dg-text)">NumPy arrays</text>
</svg>

## Prerequisites and Assumptions

- A task defined well enough to know whether it needs spatial neighbourhoods, reprojection or rasters.
- An environment policy: pip-only environments favour laspy; conda or containers make PDAL easy.
- Awareness that both read LAZ; PDAL additionally reads COPC, EPT, E57, PLY, text and many more formats.

## Step-by-Step Implementation

### Step 1 — Classify the task

Is it file-level (headers, fields, format conversion), point-wise (arithmetic on attributes), or spatial (neighbours, surfaces, rasters)?

### Step 2 — Check the environment constraints

Can you install PDAL with its GDAL and PROJ dependencies here? In a Lambda function or a minimal container, laspy may be the only realistic option.

### Step 3 — Consider data size and memory

laspy reads whole files or chunks you manage yourself; PDAL can stream through a multi-stage pipeline with bounded memory.

### Step 4 — Consider reproducibility and review

PDAL pipelines are JSON documents a reviewer can read and CI can validate; laspy logic lives in Python code.

### Step 5 — Combine at the array boundary

Where a task needs both, pass NumPy arrays between them rather than writing intermediate files.

## Complete Working Example

A workflow that uses each tool for what it does best: PDAL computes ground and height above ground, NumPy applies a custom per-point rule, and laspy writes the result with a new extra dimension.

```python
"""PDAL for spatial stages, NumPy for a custom rule, laspy for the final file."""
from __future__ import annotations

import json

import laspy
import numpy as np
import pdal
from pyproj import CRS

SRC = "tiles/t_0431.laz"

# 1. PDAL: noise removal, ground classification, height above ground (spatial work).
p = pdal.Pipeline(json.dumps({"pipeline": [
    SRC,
    {"type": "filters.range", "limits": "Classification![7:7],Classification![18:18]"},
    {"type": "filters.smrf", "slope": 0.15, "window": 18, "threshold": 0.5},
    {"type": "filters.hag_nn", "count": 2},
]}))
p.execute()
a = p.arrays[0]
crs_wkt = p.metadata["metadata"]["readers.las"]["srs"]["compoundwkt"]

# 2. NumPy: a project-specific rule PDAL has no stage for.
risk = np.clip((a["HeightAboveGround"] - 10.0) / 20.0, 0.0, 1.0).astype(np.float32)
risk[a["Classification"] == 6] = 0.0            # buildings are not fall-risk trees

# 3. laspy: write a LAS 1.4 file with the new dimension.
header = laspy.LasHeader(point_format=6, version="1.4")
header.scales = np.array([0.01, 0.01, 0.01])
header.offsets = np.floor([a["X"].min(), a["Y"].min(), a["Z"].min()])
header.add_extra_dim(laspy.ExtraBytesParams(name="fall_risk", type=np.float32))
header.add_crs(CRS.from_wkt(crs_wkt))
las = laspy.LasData(header)
las.x, las.y, las.z = a["X"], a["Y"], a["Z"]
las.intensity = a["Intensity"]
las.classification = a["Classification"]
las.return_number, las.number_of_returns = a["ReturnNumber"], a["NumberOfReturns"]
las.gps_time = a["GpsTime"]
las.fall_risk = risk
las.write("out/t_0431_fall_risk.laz")
print(f"{len(las.points):,} points written; {np.mean(risk > 0.5):.1%} high risk")
```

The last step could equally be a PDAL `writers.las` fed with the modified array; laspy is used here to show the hand-off in both directions. The metadata key path for the CRS can differ slightly between PDAL versions, so read it defensively in production code.

<svg viewBox="0 30 740 175" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A combined workflow passing arrays between PDAL, NumPy and laspy" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Each tool where it is strongest</title>
  <desc>A three-stage flow. PDAL reads the tile and runs noise removal, SMRF and HAG. The resulting array passes to NumPy, where a custom fall-risk rule is computed. The array with the new field passes to laspy, which writes a LAS 1.4 file with an extra dimension and the CRS.</desc>
  <defs><marker id="lvp-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="30" width="740" height="175" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="50" width="210" height="100" rx="10" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.4"/>
  <text x="125" y="76" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">PDAL</text>
  <text x="125" y="100" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">read, noise, SMRF</text>
  <text x="125" y="120" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">height above ground</text>
  <rect x="270" y="50" width="200" height="100" rx="10" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.4"/>
  <text x="370" y="76" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">NumPy</text>
  <text x="370" y="100" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">custom rule</text>
  <text x="370" y="120" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">fall_risk array</text>
  <rect x="510" y="50" width="210" height="100" rx="10" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.4"/>
  <text x="615" y="76" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">laspy</text>
  <text x="615" y="100" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">LAS 1.4, extra dim</text>
  <text x="615" y="120" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">CRS from PDAL metadata</text>
  <line x1="230" y1="100" x2="266" y2="100" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#lvp-arw)"/>
  <line x1="470" y1="100" x2="506" y2="100" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#lvp-arw)"/>
  <text x="370" y="182" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">no intermediate files; arrays cross the boundaries</text>
</svg>

## Key Parameter Table

| Task | laspy | PDAL | Prefer |
|---|---|---|---|
| Read header, VLRs | direct | `pdal info --metadata` | laspy |
| Change a field for all points | NumPy assignment | `filters.assign` | either |
| Ground classification | — | `filters.smrf`, `filters.pmf`, `filters.csf` | PDAL |
| Height above ground | — | `filters.hag_nn` | PDAL |
| Reprojection | via pyproj on arrays | `filters.reprojection` | PDAL |
| Rasterize to GeoTIFF | — | `writers.gdal` | PDAL |
| COPC spatial query | `CopcReader.query` | `readers.copc` | either |
| Minimal serverless install | pip only | heavy | laspy |
| Reviewable, versioned pipelines | code | JSON | PDAL |
| Large files, many stages | manual chunking | streaming engine | PDAL |

## Verification

When a workflow switches tools mid-stream, verify at each boundary:

- **Counts.** The array length leaving PDAL equals the number of points laspy writes.
- **Coordinates.** Round-trip error at most half the output scale.
- **CRS.** The output file's CRS matches the input's; laspy does not carry it automatically from PDAL arrays.

## Gotchas and Edge Cases

**Field naming differs.** PDAL uses `Classification`, `ReturnNumber`, `GpsTime`; laspy uses `classification`, `return_number`, `gps_time`. Map names explicitly at the boundary.

**CRS does not travel with arrays.** A NumPy array has no spatial reference. Carry it separately, as the example does from PDAL's metadata, and set it on the laspy header or PDAL writer.

**Dependency conflicts.** A pip-installed pyproj next to a conda-installed PDAL can load two different PROJ libraries. Install both from one channel in a single environment.

<svg viewBox="100 0 500 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Field name mapping between PDAL and laspy" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Same fields, two naming schemes</title>
  <desc>A two-column mapping. PDAL names on the left in CamelCase — Classification, ReturnNumber, NumberOfReturns, GpsTime, PointSourceId — map to laspy names on the right in snake_case — classification, return_number, number_of_returns, gps_time, point_source_id.</desc>
  <rect x="100" y="0" width="500" height="170" fill="var(--dg-bg)" rx="10"/>
  <g font-size="10.5" fill="var(--dg-text)">
    <text x="120" y="30">PDAL</text><text x="480" y="30">laspy</text>
    <text x="120" y="56">Classification</text><text x="480" y="56">classification</text>
    <text x="120" y="80">ReturnNumber</text><text x="480" y="80">return_number</text>
    <text x="120" y="104">NumberOfReturns</text><text x="480" y="104">number_of_returns</text>
    <text x="120" y="128">GpsTime</text><text x="480" y="128">gps_time</text>
    <text x="120" y="152">PointSourceId</text><text x="480" y="152">point_source_id</text>
  </g>
  <g stroke="var(--dg-line-soft)" stroke-width="1"><line x1="260" y1="52" x2="470" y2="52"/><line x1="260" y1="76" x2="470" y2="76"/><line x1="260" y1="100" x2="470" y2="100"/><line x1="260" y1="124" x2="470" y2="124"/><line x1="260" y1="148" x2="470" y2="148"/></g>
</svg>

**Reimplementing PDAL in NumPy.** Writing your own ground filter or rasterizer in NumPy is tempting and nearly always slower and less robust than the equivalent PDAL stage. Reserve custom code for rules PDAL does not have.

## Frequently Asked Questions

**Is laspy or PDAL better for Python LiDAR processing?**

Neither is better in general. laspy excels at reading, editing and writing LAS and LAZ data as NumPy arrays with a light install. PDAL excels at spatial processing, reprojection, rasterization and multi-format, multi-stage pipelines. Most production workflows use both.

**Can PDAL and laspy read the same files?**

Yes. Both read LAS and LAZ, and both can query COPC. PDAL also reads many other point cloud formats.

**Which is faster?**

For reading and writing LAS or LAZ, they are broadly comparable, with laspy's parallel LAZ backend competitive. For spatial algorithms, PDAL is far faster because laspy has none and NumPy reimplementations are usually slower.

**How do I pass data from PDAL to laspy?**

Execute the PDAL pipeline and take pipeline.arrays, then assign the fields to a laspy LasData object, mapping PDAL's CamelCase names to laspy's snake_case names and setting the CRS explicitly.

## Related

- [laspy and NumPy Workflows for LAS Data](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/) — laspy in depth
- [PDAL Pipeline Architecture and Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/) — PDAL in depth
- [Passing NumPy Arrays into a PDAL Pipeline](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/passing-numpy-arrays-into-a-pdal-pipeline/) — laspy or NumPy data into PDAL
- [Writing a LAS File from NumPy Arrays](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/writing-a-las-file-from-numpy-arrays/) — the laspy writing step
- [Reading COPC in Python with laspy](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/reading-copc-in-python-with-laspy/) — the cloud-native overlap
