---
title: "Flagging Overlap and Withheld Points"
description: "Use LAS 1.4 classification flags correctly: mark sidelap points with the overlap flag instead of class 12, withhold points without deleting them, set flags with PDAL filters.assign or laspy, and make downstream stages respect them."
slug: "flagging-overlap-and-withheld-points"
type: "howto"
breadcrumb: "Overlap and Withheld Flags"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Flagging Overlap and Withheld Points",
      "description": "Use LAS 1.4 classification flags correctly: mark sidelap points with the overlap flag instead of class 12, withhold points without deleting them, set flags with PDAL filters.assign or laspy, and make downstream stages respect them.",
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
          "name": "ASPRS Classification Codes",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Overlap and Withheld Flags",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/flagging-overlap-and-withheld-points/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Set overlap and withheld flags on LiDAR points",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Decide the overlap rule",
          "text": "A simple, common rule: within a tile, for each ground location covered by several flightlines, keep the line whose nadir is closest and flag the others' points as overlap. A simpler proxy is scan angle: flag points with |scan angle| above a threshold where sidelap exists."
        },
        {
          "@type": "HowToStep",
          "name": "Set the overlap flag",
          "text": "With PDAL: filters.assign with \"Overlap = 1 WHERE PointSourceId == 1103 && ScanAngleRank > 18\". With laspy, assign a boolean mask to las.overlap."
        },
        {
          "@type": "HowToStep",
          "name": "Withhold erroneous points",
          "text": "Set Withheld = 1 on points that must stay in the file but must not be used \u2014 for example, a short block of a flightline with a known timing error."
        },
        {
          "@type": "HowToStep",
          "name": "Respect flags downstream",
          "text": "Add Withheld == 0 (and Overlap == 0 where appropriate) to the first filter of every pipeline that computes products."
        },
        {
          "@type": "HowToStep",
          "name": "Document",
          "text": "Record in the delivery metadata what the overlap rule was and why points were withheld."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the overlap flag in LAS 1.4?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A bit in the classification flags byte of point formats 6 to 10 that marks points in sidelap areas which are not from the preferred swath. It replaces the older practice of assigning class 12 to overlap points, so the real class is preserved."
          }
        },
        {
          "@type": "Question",
          "name": "What does withheld mean?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A withheld point should be excluded from processing and products, but remains in the file. It is used for erroneous points that are retained for completeness or contractual reasons."
          }
        },
        {
          "@type": "Question",
          "name": "How do I exclude withheld points in PDAL?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Add an expression filter with Withheld equal to 0 at the start of the pipeline, or include the condition in the where clause of the stages that should ignore them."
          }
        },
        {
          "@type": "Question",
          "name": "Can a point be both ground and overlap?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. In LAS 1.4, classification and flags are independent. A point can be ground, building or any other class and also carry the overlap or withheld flag."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** In LAS 1.4 formats 6–10, overlap and withheld are flag bits, independent of classification. Set them with PDAL (`filters.assign` with `"Overlap = 1 WHERE ..."` or `"Withheld = 1 WHERE ..."`) or laspy (`las.overlap = mask`, `las.withheld = mask`), keep the point's real class, and exclude flagged points from density, DTM and statistics with an explicit filter such as `Withheld == 0`.

## Context and Motivation

This guide is part of [ASPRS Classification Codes](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/). Some points should stay in a delivered file but not be used for most purposes. Sidelap returns — from the edge of one swath where the neighbouring swath also covers the ground — double density and often have worse geometry; many workflows prefer one swath's points in each overlap. Erroneous points that a vendor cannot delete for contractual reasons, such as spikes or points from a mis-calibrated line, need to be kept but ignored. LAS 1.2 handled the first by misusing class 12 and the second with a withheld bit that shared a byte with the class. LAS 1.4 separates both cleanly into flags, so a point can be "ground, but overlap" or "building, but withheld".

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Two overlapping swaths with sidelap points flagged as overlap while keeping their classes" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Class and flag are independent</title>
  <desc>A cross-section through two overlapping swaths over terrain with a building. In the overlap zone, points from the edge of swath B are drawn with an outline to show the overlap flag. Their classes remain ground and building. A panel on the right shows three example points: ground with no flags, ground with overlap, and building with withheld.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <line x1="20" y1="170" x2="440" y2="170" stroke="var(--dg-line)" stroke-width="1.3"/>
  <path d="M40 30 L200 30" stroke="var(--dg-a)" stroke-width="6"/>
  <path d="M170 44 L420 44" stroke="var(--dg-c)" stroke-width="6"/>
  <text x="80" y="24" font-size="10.5" fill="var(--dg-text)">swath A</text>
  <text x="330" y="62" font-size="10.5" fill="var(--dg-text)">swath B</text>
  <path d="M250 170 L250 120 L330 120 L330 170" fill="none" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <g fill="var(--dg-d)"><circle cx="60" cy="166" r="3.5"/><circle cx="100" cy="166" r="3.5"/><circle cx="140" cy="166" r="3.5"/><circle cx="220" cy="166" r="3.5"/><circle cx="360" cy="166" r="3.5"/><circle cx="400" cy="166" r="3.5"/></g>
  <g fill="var(--dg-d)" stroke="var(--dg-c)" stroke-width="2"><circle cx="180" cy="166" r="4.5"/><circle cx="200" cy="166" r="4.5"/></g>
  <g fill="var(--dg-a)"><circle cx="270" cy="118" r="3.5"/><circle cx="290" cy="118" r="3.5"/><circle cx="310" cy="118" r="3.5"/></g>
  <text x="190" y="194" text-anchor="middle" font-size="10" fill="var(--dg-muted)">overlap zone</text>
  <rect x="470" y="30" width="250" height="150" rx="9" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <g font-size="10.5" fill="var(--dg-text)">
    <text x="486" y="56">class 2 · flags —</text>
    <text x="486" y="92">class 2 · overlap</text>
    <text x="486" y="128">class 6 · withheld</text>
  </g>
  <text x="486" y="160" font-size="10" fill="var(--dg-muted)">class says what; flags say how to use it</text>
</svg>

## Prerequisites and Assumptions

- Data in LAS 1.4 point formats 6–10; in formats 0–5 there is no overlap flag (withheld exists but shares a byte with the 5-bit class).
- PDAL 2.x or laspy 2.x.
- A rule for which points are overlap: typically points from a swath outside its "primary" area, or points beyond a scan angle when a neighbouring swath covers the ground.
- For withheld: a documented reason for each withheld set.

## Step-by-Step Implementation

### Step 1 — Decide the overlap rule

A simple, common rule: within a tile, for each ground location covered by several flightlines, keep the line whose nadir is closest and flag the others' points as overlap. A simpler proxy is scan angle: flag points with |scan angle| above a threshold where sidelap exists.

### Step 2 — Set the overlap flag

With PDAL: `filters.assign` with `"Overlap = 1 WHERE PointSourceId == 1103 && ScanAngleRank > 18"`. With laspy, assign a boolean mask to `las.overlap`.

### Step 3 — Withhold erroneous points

Set `Withheld = 1` on points that must stay in the file but must not be used — for example, a short block of a flightline with a known timing error.

### Step 4 — Respect flags downstream

Add `Withheld == 0` (and `Overlap == 0` where appropriate) to the first filter of every pipeline that computes products.

### Step 5 — Document

Record in the delivery metadata what the overlap rule was and why points were withheld.

## Complete Working Example

```json
{
  "pipeline": [
    "tiles/t_0431.laz",
    { "type": "filters.assign", "value": [
        "Overlap = 1 WHERE PointSourceId == 1103 && ScanAngleRank > 18",
        "Overlap = 1 WHERE PointSourceId == 1102 && ScanAngleRank < -18",
        "Withheld = 1 WHERE PointSourceId == 1104 && GpsTime > 218412500 && GpsTime < 218412560"
    ]},
    { "type": "writers.las", "filename": "flagged/t_0431.laz",
      "minor_version": 4, "dataformat_id": 6, "forward": "all" }
  ]
}
```

A DTM pipeline that respects both flags:

```json
{
  "pipeline": [
    "flagged/t_0431.laz",
    { "type": "filters.expression",
      "expression": "Withheld == 0 && Overlap == 0 && Classification == 2" },
    { "type": "writers.gdal", "filename": "dtm/t_0431.tif", "resolution": 1.0,
      "output_type": "idw", "window_size": 6, "data_type": "float32" }
  ]
}
```

The same flagging in laspy, with a check of the counts:

```python
import laspy
import numpy as np

las = laspy.read("tiles/t_0431.laz")
psid = np.asarray(las.point_source_id)
angle = np.asarray(las.scan_angle) * 0.006          # PDRF 6+: raw units of 0.006 degrees
las.overlap = (((psid == 1103) & (angle > 18)) | ((psid == 1102) & (angle < -18))).astype(np.uint8)
t = np.asarray(las.gps_time)
las.withheld = ((psid == 1104) & (t > 218_412_500) & (t < 218_412_560)).astype(np.uint8)
las.write("flagged/t_0431.laz")
print(f"overlap {np.mean(las.overlap):.1%}, withheld {int(np.sum(las.withheld)):,} points")
```

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Pulse density across a tile before and after excluding overlap points" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>What excluding overlap does to density</title>
  <desc>A profile of pulse density across a tile perpendicular to the flight direction. With all points, density doubles in two sidelap stripes. With overlap-flagged points excluded, density is nearly flat across the tile, representing one swath's coverage everywhere.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <line x1="60" y1="170" x2="700" y2="170" stroke="var(--dg-line)" stroke-width="1.3"/>
  <polyline points="60,110 200,110 220,50 300,50 320,110 440,110 460,50 540,50 560,110 700,110" fill="none" stroke="var(--dg-c)" stroke-width="2"/>
  <line x1="60" y1="114" x2="700" y2="114" stroke="var(--dg-d)" stroke-width="2" stroke-dasharray="7 4"/>
  <text x="260" y="40" text-anchor="middle" font-size="10.5" fill="var(--dg-c)">sidelap: double density</text>
  <text x="380" y="140" text-anchor="middle" font-size="10.5" fill="var(--dg-d)">overlap excluded: uniform</text>
  <text x="380" y="192" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">position across the tile</text>
</svg>

## Key Parameter Table

| Flag | PDAL dimension | laspy field | Meaning | Typical use |
|---|---|---|---|---|
| overlap | `Overlap` | `overlap` | Point lies in sidelap and is not the preferred swath | Density, DTM, uniform products |
| withheld | `Withheld` | `withheld` | Point should not be used | Errors kept for completeness |
| synthetic | `Synthetic` | `synthetic` | Point was created, not measured | Breakline or fill points |
| key-point | `KeyPoint` | `key_point` | Point is a model key point | Thinned surfaces |

## Verification

- **Class histogram unchanged.** Flagging must not alter classification counts.
- **Flag shares plausible.** Overlap shares typically run 10–40 percent of points depending on sidelap; withheld points should be a small, explained set.
- **Downstream respects flags.** Build the DTM with and without the flag filter; differences should appear only where withheld points lay.

## Gotchas and Edge Cases

**Scan angle units.** In PDRF 6+, the raw scan angle is a 16-bit integer in 0.006° steps; PDAL exposes it in degrees as `ScanAngleRank`, laspy's `scan_angle` field holds raw units. Convert before thresholding in laspy, as the example does.

**Old class 12.** Data upgraded from LAS 1.2 may still use class 12 for overlap. Convert it to the flag, as in [upgrading LAS 1.2 files to LAS 1.4](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/upgrading-las-1-2-files-to-las-1-4/).

**Tools that ignore flags.** Not every tool honours withheld and overlap. Filter explicitly in your own pipelines rather than assuming a consumer does.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="An explicit flag filter at the start of every product pipeline" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Filter flags explicitly, every time</title>
  <desc>Three product pipelines — DTM, density raster and classification statistics — each begin with the same expression filter excluding withheld and, where appropriate, overlap points, before any other stage. Relying on downstream tools to honour flags is not safe because some ignore them.</desc>
  <defs><marker id="fl-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="60" width="140" height="44" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="90" y="86" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">flagged tile</text>
  <rect x="220" y="60" width="200" height="44" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="320" y="86" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">Withheld == 0 (&amp;&amp; Overlap == 0)</text>
  <g font-size="10.5" fill="var(--dg-text)">
    <rect x="500" y="16" width="220" height="36" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="610" y="39">DTM</text>
    <rect x="500" y="64" width="220" height="36" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="610" y="87">density raster</text>
    <rect x="500" y="112" width="220" height="36" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="610" y="135">class statistics</text>
  </g>
  <line x1="160" y1="82" x2="216" y2="82" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#fl-arw)"/>
  <line x1="420" y1="76" x2="496" y2="36" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#fl-arw)"/>
  <line x1="420" y1="82" x2="496" y2="82" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#fl-arw)"/>
  <line x1="420" y1="88" x2="496" y2="128" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#fl-arw)"/>
</svg>

**Overlap and accuracy.** Overlap points are exactly what swath-to-swath relative accuracy compares. Keep them in the file even when products exclude them; see [measuring swath-to-swath relative accuracy](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/measuring-swath-to-swath-relative-accuracy/).

## Frequently Asked Questions

**What is the overlap flag in LAS 1.4?**

A bit in the classification flags byte of point formats 6 to 10 that marks points in sidelap areas which are not from the preferred swath. It replaces the older practice of assigning class 12 to overlap points, so the real class is preserved.

**What does withheld mean?**

A withheld point should be excluded from processing and products, but remains in the file. It is used for erroneous points that are retained for completeness or contractual reasons.

**How do I exclude withheld points in PDAL?**

Add an expression filter with Withheld equal to 0 at the start of the pipeline, or include the condition in the where clause of the stages that should ignore them.

**Can a point be both ground and overlap?**

Yes. In LAS 1.4, classification and flags are independent. A point can be ground, building or any other class and also carry the overlap or withheld flag.

## Related

- [ASPRS Classification Codes](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/) — classes and their meaning
- [Counting Points per Class with PDAL](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/counting-points-per-class-with-pdal/) — histograms including flags
- [Understanding LAS Point Data Record Formats](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/understanding-las-point-data-record-formats/) — where flags live
- [Checking Pulse Spacing Against USGS Quality Levels](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/checking-pulse-spacing-against-usgs-quality-levels/) — density with and without overlap
- [Assigning Classification with Conditional filters.assign](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/assigning-classification-with-conditional-filters-assign/) — the assignment syntax
