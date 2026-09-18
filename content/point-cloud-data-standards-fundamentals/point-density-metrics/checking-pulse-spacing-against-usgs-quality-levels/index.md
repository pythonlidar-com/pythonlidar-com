---
title: "Checking Pulse Spacing Against USGS Quality Levels"
description: "Test a LiDAR collection against USGS Lidar Base Specification density requirements: aggregate nominal pulse spacing and density from first returns, the spatial-distribution cell test at twice the pulse spacing, excluding water, and a pass/fail report in Python."
slug: "checking-pulse-spacing-against-usgs-quality-levels"
type: "howto"
breadcrumb: "Pulse Spacing vs Quality Levels"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Checking Pulse Spacing Against USGS Quality Levels",
      "description": "Test a LiDAR collection against USGS Lidar Base Specification density requirements: aggregate nominal pulse spacing and density from first returns, the spatial-distribution cell test at twice the pulse spacing, excluding water, and a pass/fail report in Python.",
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
          "name": "Pulse Spacing vs Quality Levels",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/checking-pulse-spacing-against-usgs-quality-levels/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Check LiDAR pulse spacing and density against USGS quality levels",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Keep one return per pulse",
          "text": "Filter to first returns (ReturnNumber == 1), which includes single returns. Each pulse contributes exactly one first return."
        },
        {
          "@type": "HowToStep",
          "name": "Exclude water and withheld points",
          "text": "Drop class 9 and any withheld points; the specification assesses density over land."
        },
        {
          "@type": "HowToStep",
          "name": "Compute ANPD and ANPS",
          "text": "ANPD = first returns \u00f7 land area. ANPS \u2248 1/\u221aANPD for a roughly uniform pattern."
        },
        {
          "@type": "HowToStep",
          "name": "Run the spatial-distribution test",
          "text": "Grid first returns at 2 \u00d7 the required ANPS for the target quality level (1.42 m for QL2) and compute the share of land cells containing at least one return; the requirement is commonly 90 %."
        },
        {
          "@type": "HowToStep",
          "name": "Report per tile and overall",
          "text": "Tile-level results show where a collection fails; the aggregate decides compliance."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is aggregate nominal pulse spacing?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A typical distance between pulses across the collection, derived from first returns over land. For a roughly uniform pattern it is approximately one over the square root of the aggregate nominal pulse density."
          }
        },
        {
          "@type": "Question",
          "name": "Why use first returns rather than all points?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Density requirements are defined per emitted pulse. Each pulse has exactly one first return, while vegetation can produce several returns per pulse, so counting all points overstates density."
          }
        },
        {
          "@type": "Question",
          "name": "What is the spatial distribution test?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A grid with cells twice the required pulse spacing is laid over the land area, and the share of cells containing at least one first return is computed. Specifications commonly require at least 90 percent, which catches gaps that an average would hide."
          }
        },
        {
          "@type": "Question",
          "name": "Does water count against density?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. Water often returns few or no pulses, and density requirements are assessed over land. Mask water cells out of the calculation."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** From single and first returns only, compute aggregate nominal pulse density (ANPD, pulses per m² over the land area) and aggregate nominal pulse spacing (ANPS ≈ 1/√ANPD), then grid first returns at a cell size of 2 × the required ANPS and check that at least 90 % of land cells contain a return. For QL2 that means ANPD ≥ 2 pulses/m², ANPS ≤ 0.71 m, and 1.42 m cells; QL1 and QL0 require ANPD ≥ 8 and ANPS ≤ 0.35 m.

## Context and Motivation

This guide is part of [Point Density Metrics](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/). Quality levels in the USGS Lidar Base Specification bundle accuracy and density requirements, and the density part is the easiest to get subtly wrong. It is defined on pulses, not points, so counting every return overstates it in vegetation. It is aggregated over land, so water must be excluded. And an average is not enough: a separate spatial-distribution test checks that the pulses are spread evenly, so a collection cannot pass by concentrating pulses in overlap stripes while leaving gaps between lines.

Doing the test in Python before submission avoids surprises from a reviewer and documents exactly how the numbers were produced.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Density thresholds for USGS quality levels on a log scale" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Quality levels on one axis</title>
  <desc>A horizontal log-scale axis of pulse density from 0.25 to 32 pulses per square metre. Threshold marks show QL3 at 0.5, QL2 at 2, and QL1 and QL0 at 8. A measured project value of 3.4 is plotted between QL2 and QL1, so the project meets QL2 density but not QL1.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <line x1="60" y1="110" x2="700" y2="110" stroke="var(--dg-line)" stroke-width="1.5"/>
  <g stroke="var(--dg-line)" stroke-width="1.4"><line x1="140" y1="98" x2="140" y2="122"/><line x1="300" y1="98" x2="300" y2="122"/><line x1="460" y1="98" x2="460" y2="122"/></g>
  <g font-size="10.5" fill="var(--dg-text)"><text text-anchor="middle" x="140" y="90">QL3 ≥ 0.5</text><text text-anchor="middle" x="300" y="90">QL2 ≥ 2</text><text text-anchor="middle" x="460" y="90">QL1/QL0 ≥ 8</text></g>
  <g font-size="10" fill="var(--dg-muted)"><text text-anchor="middle" x="60" y="140">0.25</text><text text-anchor="middle" x="140" y="140">0.5</text><text text-anchor="middle" x="220" y="140">1</text><text text-anchor="middle" x="300" y="140">2</text><text text-anchor="middle" x="380" y="140">4</text><text text-anchor="middle" x="460" y="140">8</text><text text-anchor="middle" x="540" y="140">16</text><text text-anchor="middle" x="620" y="140">32</text></g>
  <circle cx="361" cy="110" r="7" fill="var(--dg-a)"/>
  <text x="361" y="170" text-anchor="middle" font-size="10.5" fill="var(--dg-a)">measured ANPD 3.4</text>
  <text x="60" y="200" font-size="10.5" fill="var(--dg-muted)">pulses per m², log scale; confirm thresholds against the specification edition in your contract</text>
  <text x="60" y="36" font-size="10.5" fill="var(--dg-muted)">meets QL2 density, not QL1</text>
</svg>

## Prerequisites and Assumptions

- LAS data with `ReturnNumber` and `NumberOfReturns` populated, and water classified or supplied as polygons.
- Tiles covering the whole project, or a representative set, in a metric projected CRS.
- The specification edition your contract cites; values below follow the published USGS quality-level tables.
- PDAL and Python with NumPy and rasterio.

## Step-by-Step Implementation

### Step 1 — Keep one return per pulse

Filter to first returns (`ReturnNumber == 1`), which includes single returns. Each pulse contributes exactly one first return.

### Step 2 — Exclude water and withheld points

Drop class 9 and any withheld points; the specification assesses density over land.

### Step 3 — Compute ANPD and ANPS

ANPD = first returns ÷ land area. ANPS ≈ 1/√ANPD for a roughly uniform pattern.

### Step 4 — Run the spatial-distribution test

Grid first returns at 2 × the required ANPS for the target quality level (1.42 m for QL2) and compute the share of land cells containing at least one return; the requirement is commonly 90 %.

### Step 5 — Report per tile and overall

Tile-level results show where a collection fails; the aggregate decides compliance.

## Complete Working Example

```python
"""ANPD/ANPS and the spatial-distribution cell test for a LiDAR tile."""
from __future__ import annotations

import json

import numpy as np
import pdal

QL = {"QL0": (8.0, 0.35), "QL1": (8.0, 0.35), "QL2": (2.0, 0.71), "QL3": (0.5, 1.41)}


def first_returns_on_land(tile: str) -> np.ndarray:
    p = pdal.Pipeline(json.dumps({"pipeline": [
        tile,
        {"type": "filters.expression",
         "expression": "ReturnNumber == 1 && Classification != 9 && Classification != 7 "
                       "&& Classification != 18 && Withheld == 0"},
    ]}))
    p.execute()
    return p.arrays[0]


def density_report(tile: str, level: str = "QL2", water_area_m2: float = 0.0) -> dict:
    a = first_returns_on_land(tile)
    need_anpd, need_anps = QL[level]
    cell = 2 * need_anps
    x0, y0 = a["X"].min(), a["Y"].min()
    cols = int(np.ceil((a["X"].max() - x0) / cell)) + 1
    rows = int(np.ceil((a["Y"].max() - y0) / cell)) + 1
    occupied = np.zeros((rows, cols), dtype=bool)
    occupied[((a["Y"] - y0) // cell).astype(int), ((a["X"] - x0) // cell).astype(int)] = True

    # Land area: cells inside the tile minus water; approximated here from the grid extent.
    tile_area = (a["X"].max() - x0) * (a["Y"].max() - y0)
    land_area = tile_area - water_area_m2
    anpd = len(a) / land_area
    anps = 1 / np.sqrt(anpd)
    share = occupied.mean()                      # water cells should be masked out, see below
    return {"level": level, "first_returns": len(a),
            "anpd": round(anpd, 2), "anps_m": round(anps, 2),
            "cell_m": cell, "occupied_share": round(float(share), 3),
            "pass_density": anpd >= need_anpd and anps <= need_anps,
            "pass_distribution": share >= 0.90}


if __name__ == "__main__":
    print(density_report("tiles/t_0431.laz", "QL2", water_area_m2=38_500))
```

The occupied share above uses every cell in the tile's bounding box; cells that are water have no returns by nature and would count as failures. In production, rasterize the water polygons to the same grid and exclude those cells from both numerator and denominator.

<svg viewBox="20 0 560 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The spatial distribution test grid with occupied, empty and excluded water cells" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>The cell test at twice the pulse spacing</title>
  <desc>A grid of cells sized at twice the required pulse spacing. Most cells contain at least one first return and are marked occupied. A band of empty cells between two flightlines is marked as failing. A block of cells over a lake is excluded from the test. The share of occupied land cells must reach 90 percent.</desc>
  <rect x="20" y="0" width="560" height="210" fill="var(--dg-bg)" rx="10"/>
  <g stroke="var(--dg-line-soft)" stroke-width="0.8">
    <g fill="var(--dg-d-soft)">
      <rect x="40" y="20" width="30" height="30"/><rect x="70" y="20" width="30" height="30"/><rect x="100" y="20" width="30" height="30"/><rect x="130" y="20" width="30" height="30"/><rect x="160" y="20" width="30" height="30"/><rect x="190" y="20" width="30" height="30"/><rect x="220" y="20" width="30" height="30"/><rect x="250" y="20" width="30" height="30"/>
      <rect x="40" y="50" width="30" height="30"/><rect x="70" y="50" width="30" height="30"/><rect x="100" y="50" width="30" height="30"/><rect x="130" y="50" width="30" height="30"/><rect x="160" y="50" width="30" height="30"/>
      <rect x="40" y="110" width="30" height="30"/><rect x="70" y="110" width="30" height="30"/><rect x="100" y="110" width="30" height="30"/><rect x="130" y="110" width="30" height="30"/><rect x="160" y="110" width="30" height="30"/><rect x="190" y="110" width="30" height="30"/><rect x="220" y="110" width="30" height="30"/><rect x="250" y="110" width="30" height="30"/>
      <rect x="40" y="140" width="30" height="30"/><rect x="70" y="140" width="30" height="30"/><rect x="100" y="140" width="30" height="30"/><rect x="130" y="140" width="30" height="30"/><rect x="160" y="140" width="30" height="30"/>
    </g>
    <g fill="var(--dg-e-soft)"><rect x="40" y="80" width="30" height="30"/><rect x="70" y="80" width="30" height="30"/><rect x="100" y="80" width="30" height="30"/><rect x="130" y="80" width="30" height="30"/><rect x="160" y="80" width="30" height="30"/><rect x="190" y="80" width="30" height="30"/><rect x="220" y="80" width="30" height="30"/><rect x="250" y="80" width="30" height="30"/></g>
    <g fill="var(--dg-b-soft)"><rect x="190" y="50" width="30" height="30"/><rect x="220" y="50" width="30" height="30"/><rect x="250" y="50" width="30" height="30"/><rect x="190" y="140" width="30" height="30"/><rect x="220" y="140" width="30" height="30"/><rect x="250" y="140" width="30" height="30"/></g>
  </g>
  <rect x="330" y="30" width="18" height="18" fill="var(--dg-d-soft)" stroke="var(--dg-line-soft)"/><text x="356" y="44" font-size="10.5" fill="var(--dg-text)">occupied: ≥ 1 first return</text>
  <rect x="330" y="70" width="18" height="18" fill="var(--dg-e-soft)" stroke="var(--dg-line-soft)"/><text x="356" y="84" font-size="10.5" fill="var(--dg-text)">empty land cell: counts against</text>
  <rect x="330" y="110" width="18" height="18" fill="var(--dg-b-soft)" stroke="var(--dg-line-soft)"/><text x="356" y="124" font-size="10.5" fill="var(--dg-text)">water: excluded from the test</text>
  <text x="330" y="166" font-size="10.5" fill="var(--dg-muted)">cell size = 2 × required ANPS (1.42 m for QL2)</text>
  <text x="330" y="186" font-size="10.5" fill="var(--dg-muted)">pass when ≥ 90 % of land cells are occupied</text>
</svg>

## Key Parameter Table

| Quality level | ANPS (m) | ANPD (pulses/m²) | Test cell (2 × ANPS) |
|---|---|---|---|
| QL0 | ≤ 0.35 | ≥ 8 | 0.70 m |
| QL1 | ≤ 0.35 | ≥ 8 | 0.70 m |
| QL2 | ≤ 0.71 | ≥ 2 | 1.42 m |
| QL3 | ≤ 1.41 | ≥ 0.5 | 2.82 m |

## Verification

- **First returns only.** Confirm the filter by counting: the number of first returns should equal the number of pulses, and be well below the total point count in vegetated areas.
- **Water excluded.** Compare the occupied share with and without the water mask on a tile with a lake; the unmasked value should be visibly lower.
- **Spot the failing tiles.** Map the per-tile occupied share. Failures cluster at flightline gaps, steep terrain facing away from the scanner, and project edges.

## Gotchas and Edge Cases

**All returns inflate density.** Counting every return in forest can double or triple apparent density. The specification is about pulses; use first returns.

**Overlap-flagged points.** Some deliveries flag sidelap points as overlap (or older ones class 12). Whether to include them depends on the specification's wording; be explicit in the report.

**Tile edges.** Cells cut by the tile boundary look sparsely occupied. Run the test on a merged mosaic, or ignore a border of one cell.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Point density versus pulse density in open and forested areas" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Points are not pulses</title>
  <desc>Paired bars for open ground and forest. In open ground, point density and pulse density are both about 4 per square metre because each pulse returns once. In forest, point density is about 11 per square metre while pulse density is still about 4, because each pulse returns from several canopy layers.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="140" x2="680" y2="140" stroke="var(--dg-line)" stroke-width="1.3"/>
  <rect x="160" y="100" width="60" height="40" fill="var(--dg-c-soft)" stroke="var(--dg-c)"/>
  <rect x="226" y="100" width="60" height="40" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/>
  <rect x="430" y="30" width="60" height="110" fill="var(--dg-c-soft)" stroke="var(--dg-c)"/>
  <rect x="496" y="100" width="60" height="40" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/>
  <text x="223" y="158" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">open ground</text>
  <text x="493" y="158" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">forest</text>
  <text x="460" y="24" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">11</text>
  <rect x="580" y="40" width="14" height="10" fill="var(--dg-c-soft)" stroke="var(--dg-c)"/><text x="600" y="49" font-size="10" fill="var(--dg-muted)">points</text>
  <rect x="580" y="60" width="14" height="10" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text x="600" y="69" font-size="10" fill="var(--dg-muted)">pulses</text>
</svg>

**ANPS from a formula.** 1/√ANPD assumes a uniform pattern. Linear scanners produce anisotropic spacing — denser along scan lines than between them — which the cell test catches even when the average passes.

## Frequently Asked Questions

**What is aggregate nominal pulse spacing?**

A typical distance between pulses across the collection, derived from first returns over land. For a roughly uniform pattern it is approximately one over the square root of the aggregate nominal pulse density.

**Why use first returns rather than all points?**

Density requirements are defined per emitted pulse. Each pulse has exactly one first return, while vegetation can produce several returns per pulse, so counting all points overstates density.

**What is the spatial distribution test?**

A grid with cells twice the required pulse spacing is laid over the land area, and the share of cells containing at least one first return is computed. Specifications commonly require at least 90 percent, which catches gaps that an average would hide.

**Does water count against density?**

No. Water often returns few or no pulses, and density requirements are assessed over land. Mask water cells out of the calculation.

## Related

- [Point Density Metrics](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/) — definitions
- [Building a Point Density Raster with PDAL](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/building-a-point-density-raster-with-pdal/) — mapping density
- [Reporting NVA and VVA Accuracy](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/reporting-nva-and-vva-accuracy/) — the accuracy side of quality levels
- [Classifying Water from Intensity and Returns](https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/classifying-water-from-intensity-and-returns/) — building the water mask
- [Reading USGS 3DEP LiDAR from Public Cloud Storage](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/reading-usgs-3dep-lidar-from-public-cloud-storage/) — QL2 data to test on
