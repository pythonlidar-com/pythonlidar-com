---
title: "Reading LAS into NumPy with laspy"
description: "Load LAS and LAZ files into NumPy arrays with laspy: scaled versus raw coordinates, standard and extra dimensions, boolean masks for subsetting, building an (N, 3) coordinate array, and converting to a pandas DataFrame."
slug: "reading-las-into-numpy-with-laspy"
type: "howto"
breadcrumb: "Reading LAS into NumPy"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Reading LAS into NumPy with laspy",
      "description": "Load LAS and LAZ files into NumPy arrays with laspy: scaled versus raw coordinates, standard and extra dimensions, boolean masks for subsetting, building an (N, 3) coordinate array, and converting to a pandas DataFrame.",
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
          "name": "Reading LAS into NumPy",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/reading-las-into-numpy-with-laspy/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Read a LAS or LAZ file into NumPy arrays with laspy",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Inspect the header first",
          "text": "laspy.open(path) reads only the header; check point_count and point_format before a full read."
        },
        {
          "@type": "HowToStep",
          "name": "Read the file",
          "text": "laspy.read(path) returns a LasData with header, VLRs and points."
        },
        {
          "@type": "HowToStep",
          "name": "Access fields as arrays",
          "text": "Standard fields use snake_case names (classification, return_number, number_of_returns, gps_time, point_source_id); extra dimensions use the names in their VLR."
        },
        {
          "@type": "HowToStep",
          "name": "Subset with masks",
          "text": "A boolean array indexes las.points to produce a new record with only the selected points, keeping every field aligned."
        },
        {
          "@type": "HowToStep",
          "name": "Build analysis arrays",
          "text": "Stack coordinates into an (N, 3) float array for SciPy and scikit-learn, or build a DataFrame for pandas."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How do I get an N by 3 array of coordinates from a LAS file?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Read it with laspy and stack the scaled coordinates: np.vstack of las.x, las.y and las.z, transposed. The result is a float64 array with one row per point."
          }
        },
        {
          "@type": "Question",
          "name": "What is the difference between las.x and las.X?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "las.X holds the raw 32-bit integers stored in the file; las.x applies the header's scale and offset to give real-world coordinates as floats. Use the lower-case form for any calculation."
          }
        },
        {
          "@type": "Question",
          "name": "How do I read only ground points?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "laspy reads the whole file, then you select with a mask such as las.points where classification equals 2. To avoid reading non-ground points at all, filter with PDAL or read in chunks and keep only matching points."
          }
        },
        {
          "@type": "Question",
          "name": "Can laspy read files larger than memory?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Not with laspy.read. Use laspy.open and chunk_iterator to process the file a fixed number of points at a time."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** `las = laspy.read("tile.laz")` loads every point; `las.x`, `las.y`, `las.z` are scaled float64 arrays, `las.classification`, `las.intensity`, `las.return_number` are integer arrays, and `np.vstack((las.x, las.y, las.z)).T` gives an (N, 3) array ready for SciPy or scikit-learn. Subset with boolean masks — `las.points[las.classification == 2]` — and use `laspy.open` first when you only need the header.

## Context and Motivation

This guide is part of [laspy and NumPy Workflows for LAS Data](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/). Most Python analysis of LiDAR starts by getting points into NumPy: a k-d tree for nearest neighbours, a histogram of heights, a scikit-learn model, a quick scatter plot in a notebook. laspy does that in one call and exposes each LAS field as a NumPy array with the right type. The two things people trip over are the difference between scaled and raw coordinates, and memory — a full read holds every point, and derived arrays multiply that.

<svg viewBox="0 10 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Raw integer coordinates turned into scaled coordinates with scale and offset" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>From stored integers to coordinates</title>
  <desc>A stored X integer of 43152231 is multiplied by the header scale 0.01 and added to the offset 0, giving the coordinate 431522.31 metres. laspy exposes the stored integer as las.X and the computed coordinate as las.x. Calculations should use the lower-case scaled values.</desc>
  <rect x="0" y="10" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="60" width="170" height="60" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="105" y="84" text-anchor="middle" font-size="11" fill="var(--dg-text)">las.X (int32)</text>
  <text x="105" y="104" text-anchor="middle" font-size="11" fill="var(--dg-text)">43152231</text>
  <text x="225" y="96" text-anchor="middle" font-size="14" fill="var(--dg-muted)">×</text>
  <rect x="250" y="60" width="130" height="60" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="315" y="84" text-anchor="middle" font-size="11" fill="var(--dg-text)">scale</text>
  <text x="315" y="104" text-anchor="middle" font-size="11" fill="var(--dg-text)">0.01</text>
  <text x="410" y="96" text-anchor="middle" font-size="14" fill="var(--dg-muted)">+</text>
  <rect x="435" y="60" width="110" height="60" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="490" y="84" text-anchor="middle" font-size="11" fill="var(--dg-text)">offset</text>
  <text x="490" y="104" text-anchor="middle" font-size="11" fill="var(--dg-text)">0</text>
  <text x="572" y="96" text-anchor="middle" font-size="14" fill="var(--dg-muted)">=</text>
  <rect x="600" y="60" width="120" height="60" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="660" y="84" text-anchor="middle" font-size="11" fill="var(--dg-text)">las.x (float64)</text>
  <text x="660" y="104" text-anchor="middle" font-size="11" fill="var(--dg-text)">431522.31</text>
  <text x="20" y="40" font-size="10.5" fill="var(--dg-muted)">values from the file header; each axis has its own scale and offset</text>
  <text x="20" y="160" font-size="10.5" fill="var(--dg-muted)">upper case: exactly what is stored · lower case: what you calculate with</text>
</svg>

## Prerequisites and Assumptions

- laspy 2.x with a LAZ backend: `pip install "laspy[lazrs]"`.
- NumPy; pandas optional.
- A file that fits in memory. For larger files, see [chunked reading of large LAS files with laspy](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/chunked-reading-of-large-las-files-with-laspy/).

## Step-by-Step Implementation

### Step 1 — Inspect the header first

`laspy.open(path)` reads only the header; check `point_count` and `point_format` before a full read.

### Step 2 — Read the file

`laspy.read(path)` returns a `LasData` with header, VLRs and points.

### Step 3 — Access fields as arrays

Standard fields use snake_case names (`classification`, `return_number`, `number_of_returns`, `gps_time`, `point_source_id`); extra dimensions use the names in their VLR.

### Step 4 — Subset with masks

A boolean array indexes `las.points` to produce a new record with only the selected points, keeping every field aligned.

### Step 5 — Build analysis arrays

Stack coordinates into an (N, 3) float array for SciPy and scikit-learn, or build a DataFrame for pandas.

## Complete Working Example

```python
"""Read a LAZ tile into NumPy, subset it, and build analysis-ready arrays."""
from __future__ import annotations

import laspy
import numpy as np
import pandas as pd
from scipy.spatial import cKDTree

PATH = "tiles/t_0431.laz"

with laspy.open(PATH) as f:
    print(f"LAS {f.header.version}, PDRF {f.header.point_format.id}, "
          f"{f.header.point_count:,} points")
    print("dimensions:", list(f.header.point_format.dimension_names))

las = laspy.read(PATH)

# Scaled coordinates as float64 arrays.
xyz = np.vstack((las.x, las.y, las.z)).T
print("xyz shape:", xyz.shape, "dtype:", xyz.dtype)

# Ground points only, every field kept aligned.
ground = las.points[las.classification == 2]
print(f"ground: {len(ground):,} points, mean Z {np.mean(ground.z):.2f} m")

# Last returns above 2 m relative to the lowest ground, as a DataFrame.
last = (las.return_number == las.number_of_returns)
df = pd.DataFrame({
    "x": las.x[last], "y": las.y[last], "z": las.z[last],
    "intensity": las.intensity[last], "cls": las.classification[last],
})
print(df.describe().loc[["mean", "min", "max"]].round(2))

# Nearest-neighbour spacing on ground, from a k-d tree.
g_xy = np.vstack((ground.x, ground.y)).T
d, _ = cKDTree(g_xy).query(g_xy, k=2)
print(f"median ground spacing: {np.median(d[:, 1]):.2f} m")

# Extra dimensions, if present, by name.
for name in las.point_format.extra_dimension_names:
    print(name, las[name].dtype, float(np.nanmean(las[name])))
```

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A boolean mask selecting ground points while keeping all fields aligned" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Masks keep every field in step</title>
  <desc>A table of six points with columns for x, z and classification. A boolean mask column marks rows where classification equals 2. The masked record on the right contains only those rows, with x, z and classification still aligned row by row.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <g font-size="10.5" fill="var(--dg-text)">
    <text x="40" y="36">x</text><text x="140" y="36">z</text><text x="220" y="36">cls</text><text x="290" y="36">mask</text>
    <text x="40" y="62">431520.1</text><text x="140" y="62">212.4</text><text x="220" y="62">2</text><text x="290" y="62">True</text>
    <text x="40" y="86">431520.4</text><text x="140" y="86">219.8</text><text x="220" y="86">5</text><text x="290" y="86">False</text>
    <text x="40" y="110">431520.9</text><text x="140" y="110">212.5</text><text x="220" y="110">2</text><text x="290" y="110">True</text>
    <text x="40" y="134">431521.2</text><text x="140" y="134">221.3</text><text x="220" y="134">6</text><text x="290" y="134">False</text>
    <text x="40" y="158">431521.6</text><text x="140" y="158">212.6</text><text x="220" y="158">2</text><text x="290" y="158">True</text>
    <text x="460" y="36">x</text><text x="560" y="36">z</text><text x="640" y="36">cls</text>
    <text x="460" y="62">431520.1</text><text x="560" y="62">212.4</text><text x="640" y="62">2</text>
    <text x="460" y="86">431520.9</text><text x="560" y="86">212.5</text><text x="640" y="86">2</text>
    <text x="460" y="110">431521.6</text><text x="560" y="110">212.6</text><text x="640" y="110">2</text>
  </g>
  <text x="390" y="92" text-anchor="middle" font-size="16" fill="var(--dg-muted)">→</text>
  <text x="560" y="150" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">las.points[las.classification == 2]</text>
  <text x="40" y="186" font-size="10.5" fill="var(--dg-muted)">no loops; the mask applies to every field at once</text>
</svg>

## Reading Only Part of a File

`laspy.read` has no spatial or attribute filter: it decompresses and loads every point, then you mask. That is fine for tiles of tens of millions of points on a workstation, and wasteful when you need a small area or a single class from a large file. There are three better routes, depending on the source.

For **COPC files**, use `laspy.CopcReader` and its `query` method with a bounding box and optional resolution; only the octree nodes that intersect the box are read, locally or over HTTP. For **ordinary LAS or LAZ files**, iterate with `laspy.open(path).chunk_iterator(n)` and keep only the points you need from each chunk, which bounds memory by the chunk size even though every point is still decompressed once. And when the subset is defined spatially by a polygon, or you need it repeatedly, let **PDAL** do the selection with `filters.crop` or `filters.range` and hand the result to Python as an array — PDAL streams, so the whole file never sits in memory.

Choosing well matters most in notebooks, where a casual `laspy.read` of a 3 GB tile is the most common way to exhaust a laptop's memory and restart the kernel.

## Key Parameter Table

| Access | Type | Notes |
|---|---|---|
| `las.x`, `las.y`, `las.z` | float64 | Scaled coordinates for calculation |
| `las.X`, `las.Y`, `las.Z` | int32 | Raw stored integers |
| `las.classification` | uint8 | 5-bit in PDRF 0–5, 8-bit in 6–10 |
| `las.return_number`, `las.number_of_returns` | uint8 | Pulse structure |
| `las.intensity` | uint16 | Uncalibrated |
| `las.gps_time` | float64 | Present in PDRF 1, 3–10 |
| `las.red`, `las.green`, `las.blue` | uint16 | PDRF 2, 3, 5, 7, 8, 10 |
| `las["name"]` | per VLR | Extra dimensions by name |

## Verification

- **Count.** `len(las.points)` equals `las.header.point_count`.
- **Bounds.** `las.x.min()` and `las.x.max()` match `las.header.mins[0]` and `maxs[0]` to within one scale unit; a mismatch means the header is stale.
- **Types.** `las.classification.max()` above 31 in a PDRF 0–5 file is impossible; if you see it, you are reading a different file than you think.

```python
assert len(las.points) == las.header.point_count
assert abs(las.x.min() - las.header.mins[0]) <= las.header.scales[0]
```

## Gotchas and Edge Cases

**Arithmetic on raw integers.** `las.Z - 100` subtracts 100 scale units — one metre at a 0.01 scale — not 100 metres. Always use lower-case fields for calculations.

**Float32 precision.** Casting UTM coordinates to float32 loses centimetres: at 4,471,000 m, float32 resolves only about 0.25 m. Keep coordinates float64, or subtract a local origin before casting.

**Memory multiplies.** `np.vstack((las.x, las.y, las.z))` creates a new 24-byte-per-point array on top of the file's records; building a DataFrame adds more. On large tiles, select fields and subsets before building derived arrays.

<svg viewBox="0 0 740 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Float32 versus float64 resolution at typical projected coordinate magnitudes" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Why coordinates stay float64</title>
  <desc>Bars comparing the smallest representable step at a UTM northing of 4,471,000 metres. Float64 resolves steps far below a nanometre. Float32 resolves steps of about 0.25 metres, coarser than LiDAR's own precision. Subtracting a local origin first brings float32 resolution back to under a millimetre.</desc>
  <rect x="0" y="0" width="740" height="180" fill="var(--dg-bg)" rx="10"/>
  <text x="250" y="50" text-anchor="end" font-size="11" fill="var(--dg-text)">float64 at 4,471,000 m</text>
  <rect x="260" y="36" width="4" height="22" fill="var(--dg-d)"/>
  <text x="272" y="52" font-size="10.5" fill="var(--dg-muted)">≈ 1 nm steps</text>
  <text x="250" y="100" text-anchor="end" font-size="11" fill="var(--dg-text)">float32 at 4,471,000 m</text>
  <rect x="260" y="86" width="440" height="22" fill="var(--dg-e)"/>
  <text x="692" y="130" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">≈ 0.25 m steps</text>
  <text x="250" y="160" text-anchor="end" font-size="11" fill="var(--dg-text)">float32 after origin shift</text>
  <rect x="260" y="146" width="6" height="22" fill="var(--dg-d)"/>
  <text x="274" y="162" font-size="10.5" fill="var(--dg-muted)">&lt; 1 mm steps</text>
</svg>

**Legacy classification bits.** In PDRF 0–5, `classification` is the 5-bit class; synthetic, key-point and withheld are separate flag fields (`synthetic`, `key_point`, `withheld`). In PDRF 6–10 the class is a full byte and overlap has its own flag.

## Frequently Asked Questions

**How do I get an N by 3 array of coordinates from a LAS file?**

Read it with laspy and stack the scaled coordinates: np.vstack of las.x, las.y and las.z, transposed. The result is a float64 array with one row per point.

**What is the difference between las.x and las.X?**

las.X holds the raw 32-bit integers stored in the file; las.x applies the header's scale and offset to give real-world coordinates as floats. Use the lower-case form for any calculation.

**How do I read only ground points?**

laspy reads the whole file, then you select with a mask such as las.points where classification equals 2. To avoid reading non-ground points at all, filter with PDAL or read in chunks and keep only matching points.

**Can laspy read files larger than memory?**

Not with laspy.read. Use laspy.open and chunk_iterator to process the file a fixed number of points at a time.

## Related

- [laspy and NumPy Workflows for LAS Data](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/) — the wider picture
- [Chunked Reading of Large LAS Files with laspy](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/chunked-reading-of-large-las-files-with-laspy/) — when files do not fit
- [Writing a LAS File from NumPy Arrays](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/writing-a-las-file-from-numpy-arrays/) — the reverse direction
- [Understanding LAS Point Data Record Formats](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/understanding-las-point-data-record-formats/) — which fields each format holds
- [How to Parse LAS Headers with Python](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/how-to-parse-las-headers-with-python/) — the header in detail
