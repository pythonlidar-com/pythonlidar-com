---
title: "Building a Point Density Raster with PDAL"
description: "Map LiDAR point and pulse density as a GeoTIFF with writers.gdal output_type count: choosing cell size, first returns for pulse density, ground returns for bare-earth density, converting counts to points per square metre, and finding density voids."
slug: "building-a-point-density-raster-with-pdal"
type: "howto"
breadcrumb: "Point Density Raster"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Building a Point Density Raster with PDAL",
      "description": "Map LiDAR point and pulse density as a GeoTIFF with writers.gdal output_type count: choosing cell size, first returns for pulse density, ground returns for bare-earth density, converting counts to points per square metre, and finding density voids.",
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
          "name": "Point Density Metrics",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Point Density Raster",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/building-a-point-density-raster-with-pdal/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Build a point density raster with PDAL writers.gdal",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Decide what to count",
          "text": "All returns measure point density; first returns (ReturnNumber == 1) measure pulse density, which specifications usually mean; ground returns (class 2) measure bare-earth density, the one that limits DTM quality."
        },
        {
          "@type": "HowToStep",
          "name": "Choose a cell size",
          "text": "Big enough that every cell has many points (5\u201310 m for 2\u201320 pts/m\u00b2), small enough to reveal gaps you care about. A specification about voids larger than a given size implies a cell no larger than that size."
        },
        {
          "@type": "HowToStep",
          "name": "Count per cell",
          "text": "writers.gdal with output_type: \"count\" counts points within radius of each cell centre. Set the radius to half the cell diagonal (0.707 \u00d7 resolution) so that circles cover the cell without big overlaps."
        },
        {
          "@type": "HowToStep",
          "name": "Convert to density",
          "text": "Divide counts by the cell area. Because circular windows overlap slightly, the result is a close estimate, not an exact partition; for exact per-cell counts, bin in NumPy."
        },
        {
          "@type": "HowToStep",
          "name": "Summarize and find voids",
          "text": "Median density, the share of cells below a threshold, and connected regions of low density give the numbers a report needs."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How do I make a point density map with PDAL?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Use writers.gdal with output_type set to count, a resolution such as 5 or 10 metres and a radius of about 0.7 times the resolution. Divide the resulting counts by the cell area to get points per square metre."
          }
        },
        {
          "@type": "Question",
          "name": "What is the difference between point density and pulse density?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Point density counts every return; pulse density counts emitted pulses, estimated from first returns. Vegetation produces several returns per pulse, so point density can be much higher than pulse density in forests."
          }
        },
        {
          "@type": "Question",
          "name": "What cell size should a density raster use?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Large enough that typical cells hold dozens of points, commonly 5 to 10 metres for airborne data. If a specification limits void size, use a cell no larger than that size so voids are visible."
          }
        },
        {
          "@type": "Question",
          "name": "How do I measure ground point density?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Filter to classification 2 before writers.gdal. Ground density under canopy is often a small fraction of overall density and is the figure that limits DTM quality there."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Run `writers.gdal` with `"output_type": "count"`, a `resolution` of 5–10 m and `"radius"` equal to half the cell diagonal, then divide the raster by the cell area to get points per square metre. Filter to `ReturnNumber == 1` first for pulse density, or to class 2 for ground density. Cells far below the median are density voids worth reporting.

## Context and Motivation

This guide is part of [Point Density Metrics](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/). A single number — "the project averages 12 pts/m²" — hides everything that matters about density: the gaps between flightlines, the stripes where overlap doubles it, the lakes where it drops to nothing, the forests where ground density collapses under canopy. A density raster shows all of that at a glance, and it is the evidence that specifications ask for when they require density "uniform" or "without voids larger than" some size. PDAL produces one in a single stage, because `writers.gdal` can write a per-cell count instead of an interpolated elevation.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A density raster showing flightline overlap stripes and a void over water" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>What a density raster reveals</title>
  <desc>A grid of cells shaded by point density. Three flightlines run horizontally; where adjacent lines overlap, two darker stripes show roughly double density. A lake in one corner appears as a block of near-empty cells. A legend relates shading to points per square metre, from under 2 to over 20.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <rect x="40" y="24" width="440" height="56" fill="var(--dg-b-soft)"/>
  <rect x="40" y="80" width="440" height="22" fill="var(--dg-b)"/>
  <rect x="40" y="102" width="440" height="34" fill="var(--dg-b-soft)"/>
  <rect x="40" y="136" width="440" height="22" fill="var(--dg-b)"/>
  <rect x="40" y="158" width="440" height="42" fill="var(--dg-b-soft)"/>
  <path d="M340 110 h110 v70 h-110 Z" fill="var(--dg-surface)"/>
  <text x="395" y="150" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">lake void</text>
  <text x="500" y="95" font-size="10.5" fill="var(--dg-text)">overlap stripe</text>
  <text x="500" y="151" font-size="10.5" fill="var(--dg-text)">overlap stripe</text>
  <rect x="610" y="40" width="20" height="20" fill="var(--dg-b)"/><text x="638" y="55" font-size="10" fill="var(--dg-muted)">&gt; 20 pts/m²</text>
  <rect x="610" y="70" width="20" height="20" fill="var(--dg-b-soft)"/><text x="638" y="85" font-size="10" fill="var(--dg-muted)">8–12</text>
  <rect x="610" y="100" width="20" height="20" fill="var(--dg-surface)" stroke="var(--dg-line-soft)"/><text x="638" y="115" font-size="10" fill="var(--dg-muted)">&lt; 2</text>
  <text x="40" y="214" font-size="10.5" fill="var(--dg-muted)">illustrative 1 km² tile at 10 m cells, first returns</text>
</svg>

## Prerequisites and Assumptions

- PDAL 2.x with `writers.gdal`.
- A projected CRS in metres, so cell area is meaningful.
- Clarity about what is being counted: all points, pulses (first returns), or ground returns.

## Step-by-Step Implementation

### Step 1 — Decide what to count

All returns measure point density; first returns (`ReturnNumber == 1`) measure pulse density, which specifications usually mean; ground returns (class 2) measure bare-earth density, the one that limits DTM quality.

### Step 2 — Choose a cell size

Big enough that every cell has many points (5–10 m for 2–20 pts/m²), small enough to reveal gaps you care about. A specification about voids larger than a given size implies a cell no larger than that size.

### Step 3 — Count per cell

`writers.gdal` with `output_type: "count"` counts points within `radius` of each cell centre. Set the radius to half the cell diagonal (0.707 × resolution) so that circles cover the cell without big overlaps.

### Step 4 — Convert to density

Divide counts by the cell area. Because circular windows overlap slightly, the result is a close estimate, not an exact partition; for exact per-cell counts, bin in NumPy.

### Step 5 — Summarize and find voids

Median density, the share of cells below a threshold, and connected regions of low density give the numbers a report needs.

## Complete Working Example

```json
{
  "pipeline": [
    "tiles/t_0431.laz",
    { "type": "filters.range", "limits": "Classification![7:7],Classification![18:18]" },
    { "type": "filters.expression", "expression": "ReturnNumber == 1" },
    { "type": "writers.gdal", "filename": "density/t_0431_pulse_count.tif",
      "resolution": 5.0, "radius": 3.54, "output_type": "count",
      "data_type": "uint32", "nodata": 0, "gdalopts": "COMPRESS=DEFLATE,TILED=YES" }
  ]
}
```

Then in Python, density and void statistics:

```python
"""Pulse density statistics and low-density regions from a count raster."""
import numpy as np
import rasterio
from scipy import ndimage as ndi

with rasterio.open("density/t_0431_pulse_count.tif") as ds:
    counts = ds.read(1).astype(float)
    cell_area = abs(ds.res[0] * ds.res[1])

density = counts / cell_area
valid = density[density > 0]
median = float(np.median(valid))
low = density < 0.5 * median
labels, n = ndi.label(low)
sizes = ndi.sum(low, labels, range(1, n + 1)) * cell_area
print(f"median pulse density {median:.1f} /m²; {low.mean():.1%} of cells below half the median")
print(f"{int((sizes > 400).sum())} low-density regions larger than 400 m²")
```

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Circular count windows covering square cells" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Why radius is half the cell diagonal</title>
  <desc>Three adjacent square cells with a circle drawn around each centre. With a radius of half the cell width, the circles leave the cell corners uncovered and miss points there. With a radius of half the diagonal, each circle touches its cell's corners, covering the cell completely with modest overlap into neighbours.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <text x="185" y="24" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">radius = half width</text>
  <text x="555" y="24" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">radius = half diagonal</text>
  <g fill="none" stroke="var(--dg-line)" stroke-width="1.2"><path d="M60 50 h80 v80 h-80 Z"/><path d="M140 50 h80 v80 h-80 Z"/><path d="M220 50 h80 v80 h-80 Z"/><path d="M430 50 h80 v80 h-80 Z"/><path d="M510 50 h80 v80 h-80 Z"/><path d="M590 50 h80 v80 h-80 Z"/></g>
  <g fill="none" stroke="var(--dg-e)" stroke-width="1.4"><circle cx="100" cy="90" r="40"/><circle cx="180" cy="90" r="40"/><circle cx="260" cy="90" r="40"/></g>
  <g fill="none" stroke="var(--dg-d)" stroke-width="1.4"><circle cx="470" cy="90" r="56.6"/><circle cx="550" cy="90" r="56.6"/><circle cx="630" cy="90" r="56.6"/></g>
  <text x="185" y="172" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">corners uncovered: points missed</text>
  <text x="555" y="172" text-anchor="middle" font-size="10.5" fill="var(--dg-d)">cells fully covered</text>
</svg>

## Key Parameter Table

| Option | Type | Typical value | Notes |
|---|---|---|---|
| `output_type` | string | `count` | Points within `radius` of each cell centre |
| `resolution` | float, m | 5–10 | Cell size; void specification sets an upper bound |
| `radius` | float, m | 0.707 × resolution | Covers each cell's corners |
| `data_type` | string | `uint32` | Counts are integers |
| `nodata` | int | 0 | Empty cells are genuine zeros for density |
| pre-filter | expression | `ReturnNumber == 1` or class 2 | Pulse or ground density |

## Verification

- **Totals.** The sum of counts is close to — slightly above, because windows overlap — the number of points passed to the writer.
- **Median against the specification.** Compare the median pulse density with the nominal pulse density of the collection.
- **Void inspection.** Overlay low-density regions on imagery: water and dark roofs are expected voids; a gap between flightlines over land is a coverage problem.

## Gotchas and Edge Cases

**Counts versus density.** Forgetting to divide by cell area makes a 5 m raster look 25 times denser than a 1 m raster of the same data. Always convert before comparing with specifications.

**Edge cells.** Cells at tile edges are only partly covered by data, so they read low. Exclude a one-cell border when summarizing, or compute density on a merged mosaic.

**Overlap inflation.** Pulse density doubles in sidelap. A project that meets its density target only in overlap stripes does not meet it; evaluate the distribution, not just the mean, as in [checking pulse spacing against USGS quality levels](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/checking-pulse-spacing-against-usgs-quality-levels/).

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Histogram of cell densities showing a bimodal pattern from overlap" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Two peaks mean overlap</title>
  <desc>A histogram of per-cell pulse density with two peaks: a large one near 9 pulses per square metre for single-coverage areas and a smaller one near 18 for sidelap. The mean falls between them at about 11. A target of 10 is met by the mean but not by most single-coverage cells.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <line x1="60" y1="140" x2="700" y2="140" stroke="var(--dg-line)" stroke-width="1.3"/>
  <path d="M100 140 C160 138 200 40 250 36 C300 40 330 136 360 138 C400 136 430 90 470 88 C510 90 530 136 580 140 Z" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.4"/>
  <line x1="300" y1="24" x2="300" y2="140" stroke="var(--dg-line)" stroke-width="1.3" stroke-dasharray="5 4"/>
  <line x1="280" y1="24" x2="280" y2="140" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="306" y="30" font-size="10.5" fill="var(--dg-text)">mean 11</text>
  <text x="274" y="58" text-anchor="end" font-size="10.5" fill="var(--dg-e)">target 10</text>
  <text x="250" y="160" text-anchor="middle" font-size="10" fill="var(--dg-muted)">single coverage ≈ 9</text>
  <text x="470" y="160" text-anchor="middle" font-size="10" fill="var(--dg-muted)">sidelap ≈ 18</text>
</svg>

**Withheld and overlap-flagged points.** Some specifications exclude withheld points and overlap-flagged points from density. Filter them out first if yours does.

## Frequently Asked Questions

**How do I make a point density map with PDAL?**

Use writers.gdal with output_type set to count, a resolution such as 5 or 10 metres and a radius of about 0.7 times the resolution. Divide the resulting counts by the cell area to get points per square metre.

**What is the difference between point density and pulse density?**

Point density counts every return; pulse density counts emitted pulses, estimated from first returns. Vegetation produces several returns per pulse, so point density can be much higher than pulse density in forests.

**What cell size should a density raster use?**

Large enough that typical cells hold dozens of points, commonly 5 to 10 metres for airborne data. If a specification limits void size, use a cell no larger than that size so voids are visible.

**How do I measure ground point density?**

Filter to classification 2 before writers.gdal. Ground density under canopy is often a small fraction of overall density and is the figure that limits DTM quality there.

## Related

- [Point Density Metrics](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/) — definitions and methods
- [Checking Pulse Spacing Against USGS Quality Levels](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/checking-pulse-spacing-against-usgs-quality-levels/) — compliance testing
- [Measuring Ground Point Density Under Canopy](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/measuring-ground-point-density-under-canopy/) — the bare-earth case
- [Calculating Point Density for Drone Surveys](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/calculating-point-density-for-drone-surveys/) — high-density UAV data
- [Classifying Water from Intensity and Returns](https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/classifying-water-from-intensity-and-returns/) — using density voids as evidence
