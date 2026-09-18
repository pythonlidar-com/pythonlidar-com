---
title: "Upgrading LAS 1.2 Files to LAS 1.4"
description: "Convert legacy LAS 1.2 point clouds to LAS 1.4 point format 6, 7 or 8 with PDAL or laspy: mapping classification and flags, converting GPS week time to adjusted standard time, writing a WKT CRS, and verifying nothing was lost."
slug: "upgrading-las-1-2-files-to-las-1-4"
type: "howto"
breadcrumb: "Upgrading LAS 1.2 to 1.4"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Upgrading LAS 1.2 Files to LAS 1.4",
      "description": "Convert legacy LAS 1.2 point clouds to LAS 1.4 point format 6, 7 or 8 with PDAL or laspy: mapping classification and flags, converting GPS week time to adjusted standard time, writing a WKT CRS, and verifying nothing was lost.",
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
          "name": "LAS/LAZ File Structure",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Upgrading LAS 1.2 to 1.4",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/upgrading-las-1-2-files-to-las-1-4/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Upgrade LAS 1.2 files to LAS 1.4 point formats",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Inspect the source",
          "text": "pdal info --metadata gives minor_version, dataformat_id, global_encoding (bit 0 = 1 means adjusted standard time) and the CRS; pdal info --stats --enumerate Classification lists classes."
        },
        {
          "@type": "HowToStep",
          "name": "Resolve overlap class 12",
          "text": "If class 12 marks overlap, you cannot recover the true class from the file. Keep it as 1 (unclassified) with the overlap flag set, or reclassify those points, then set the flag."
        },
        {
          "@type": "HowToStep",
          "name": "Convert GPS time",
          "text": "If bit 0 of global encoding is 0, GPS time is seconds of the week. Convert with the flight's GPS week, as described in converting GPS week time to adjusted standard time."
        },
        {
          "@type": "HowToStep",
          "name": "Write LAS 1.4",
          "text": "writers.las with minor_version: 4, dataformat_id: 6 (or 7 with RGB), a_srs set to the correct compound CRS, and forward to carry other header settings."
        },
        {
          "@type": "HowToStep",
          "name": "Verify",
          "text": "Counts, class histogram (apart from deliberate 12 \u2192 1 changes), coordinate ranges and GPS time ranges must match expectations."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How do I convert LAS 1.2 to LAS 1.4?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Rewrite the file with PDAL's writers.las using minor_version 4 and a LAS 1.4 point format such as 6 or 7, or with laspy's convert function. Handle class 12 overlap, GPS time type and the CRS explicitly while doing so."
          }
        },
        {
          "@type": "Question",
          "name": "Why does LAS 1.4 need adjusted standard GPS time?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Point formats 6 to 10 are defined with adjusted standard GPS time, a continuous timescale, so points from different weeks and flights can be ordered and matched to trajectories. Week time resets every week and is ambiguous without the week number."
          }
        },
        {
          "@type": "Question",
          "name": "What happens to class 12 overlap points?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "In LAS 1.4, overlap is a flag rather than a class. Set the overlap flag on those points and assign them a real class, or class 1 if the true class is unknown."
          }
        },
        {
          "@type": "Question",
          "name": "Do I lose anything by upgrading?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Not if the target format holds every source field: 6 for format 1, 7 for format 3. Choosing a format without colour for a coloured source drops RGB silently, so check before converting."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Rewrite with `writers.las` using `"minor_version": 4` and `"dataformat_id": 6` (or 7 if the source is PDRF 2 or 3 with colour), set `a_srs` so a WKT CRS record is written, and make sure GPS time is adjusted standard time before writing — LAS 1.4 formats 6–10 require it. Then verify point counts, class histograms and coordinates are unchanged.

## Context and Motivation

This guide is part of [LAS/LAZ File Structure](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/). Archives are full of LAS 1.2 data in formats 1 and 3: the standard for airborne deliveries for a decade. Modern specifications and tools expect LAS 1.4 with formats 6–10, for good reasons: the 8-bit classification makes room for classes 19–22 and beyond, the overlap flag replaces the old habit of abusing class 12, WKT replaces GeoTIFF keys for CRS, and extra bytes carry custom attributes cleanly. Upgrading is mostly mechanical, but four details — class mapping, flags, GPS time and CRS — decide whether the result is a correct LAS 1.4 file or just a relabelled 1.2 file.

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The four things that change when upgrading from LAS 1.2 to LAS 1.4" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Four things to get right</title>
  <desc>Four rows mapping LAS 1.2 to LAS 1.4. Point format 1 or 3 becomes 6 or 7. Class 12 used for overlap becomes the original class plus the overlap flag. GPS week time becomes adjusted standard GPS time. GeoTIFF key CRS records become a WKT CRS record.</desc>
  <defs><marker id="up-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <text x="170" y="22" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">LAS 1.2</text>
  <text x="560" y="22" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">LAS 1.4</text>
  <g font-size="10.5" fill="var(--dg-text)">
    <rect x="40" y="32" width="260" height="34" rx="6" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/><text text-anchor="middle" x="170" y="53">point format 1 or 3</text>
    <rect x="430" y="32" width="260" height="34" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="560" y="53">point format 6 or 7</text>
    <rect x="40" y="76" width="260" height="34" rx="6" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/><text text-anchor="middle" x="170" y="97">class 12 = overlap</text>
    <rect x="430" y="76" width="260" height="34" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="560" y="97">real class + overlap flag</text>
    <rect x="40" y="120" width="260" height="34" rx="6" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/><text text-anchor="middle" x="170" y="141">GPS week time</text>
    <rect x="430" y="120" width="260" height="34" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="560" y="141">adjusted standard GPS time</text>
    <rect x="40" y="164" width="260" height="34" rx="6" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/><text text-anchor="middle" x="170" y="185">GeoTIFF keys CRS</text>
    <rect x="430" y="164" width="260" height="34" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="560" y="185">WKT CRS record</text>
  </g>
  <g stroke="var(--dg-line)" stroke-width="1.3"><line x1="300" y1="49" x2="426" y2="49" marker-end="url(#up-arw)"/><line x1="300" y1="93" x2="426" y2="93" marker-end="url(#up-arw)"/><line x1="300" y1="137" x2="426" y2="137" marker-end="url(#up-arw)"/><line x1="300" y1="181" x2="426" y2="181" marker-end="url(#up-arw)"/></g>
</svg>

## Prerequisites and Assumptions

- PDAL 2.x, or laspy 2.x, and pyproj.
- Knowledge of the source's quirks: whether class 12 was used for overlap, whether GPS time is week time or adjusted standard time (global encoding bit 0), and what CRS it is really in.
- For week-time data, the GPS week of the flight, from the flight log or acquisition dates.

## Step-by-Step Implementation

### Step 1 — Inspect the source

`pdal info --metadata` gives `minor_version`, `dataformat_id`, `global_encoding` (bit 0 = 1 means adjusted standard time) and the CRS; `pdal info --stats --enumerate Classification` lists classes.

### Step 2 — Resolve overlap class 12

If class 12 marks overlap, you cannot recover the true class from the file. Keep it as 1 (unclassified) with the overlap flag set, or reclassify those points, then set the flag.

### Step 3 — Convert GPS time

If bit 0 of global encoding is 0, GPS time is seconds of the week. Convert with the flight's GPS week, as described in [converting GPS week time to adjusted standard time](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/metadata-header-sync/converting-gps-week-time-to-adjusted-standard-time/).

### Step 4 — Write LAS 1.4

`writers.las` with `minor_version: 4`, `dataformat_id: 6` (or 7 with RGB), `a_srs` set to the correct compound CRS, and `forward` to carry other header settings.

### Step 5 — Verify

Counts, class histogram (apart from deliberate 12 → 1 changes), coordinate ranges and GPS time ranges must match expectations.

## Complete Working Example

A PDAL pipeline for a source that used class 12 for overlap and already has adjusted standard time:

```json
{
  "pipeline": [
    { "type": "readers.las", "filename": "legacy/t_0431_12.las" },
    { "type": "filters.assign", "value": [
        "Overlap = 1 WHERE Classification == 12",
        "Classification = 1 WHERE Classification == 12"
    ]},
    { "type": "writers.las", "filename": "upgraded/t_0431.laz",
      "minor_version": 4, "dataformat_id": 6,
      "a_srs": "EPSG:26915+5703",
      "global_encoding": 17,
      "forward": "scale_x,scale_y,scale_z,offset_x,offset_y,offset_z,system_id,software_id" }
  ]
}
```

`global_encoding: 17` sets bit 0 (adjusted standard GPS time) and bit 4 (WKT CRS), both expected for PDRF 6–10. The assignment order matters: set the flag while the class is still 12, then change the class.

A laspy version with a GPS-week conversion, for sources in week time:

```python
"""Upgrade LAS 1.2 (PDRF 1/3) to LAS 1.4 (PDRF 6/7) with laspy."""
from __future__ import annotations

import laspy
import numpy as np
from pyproj import CRS

SECONDS_PER_WEEK = 604_800


def upgrade(src: str, dst: str, crs: str, gps_week: int | None = None) -> None:
    las = laspy.read(src)
    target = 7 if las.header.point_format.id in (2, 3, 5) else 6
    new = laspy.convert(las, point_format_id=target, file_version="1.4")

    overlap = np.asarray(las.classification) == 12
    new.overlap = overlap.astype(np.uint8)
    new.classification = np.where(overlap, 1, np.asarray(las.classification)).astype(np.uint8)

    week_time = (int(las.header.global_encoding.gps_time_type) == 0)
    if week_time:
        if gps_week is None:
            raise ValueError("source uses GPS week time; supply the flight's GPS week")
        new.gps_time = gps_week * SECONDS_PER_WEEK + np.asarray(las.gps_time) - 1e9
    new.header.global_encoding.gps_time_type = laspy.header.GpsTimeType.STANDARD
    new.header.add_crs(CRS.from_user_input(crs))
    new.write(dst)


if __name__ == "__main__":
    upgrade("legacy/t_0431_12.las", "upgraded/t_0431.laz", "EPSG:26915+5703", gps_week=1987)
```

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Class histograms before and after upgrading with overlap moved to a flag" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>What the class histogram should show</title>
  <desc>Paired bars for classes 1, 2, 5, 6 and 12, before and after upgrading. Classes 2, 5 and 6 are identical. Class 12 goes from 3.1 million to zero, and class 1 grows by exactly 3.1 million, with the overlap flag now set on those points. Any other change is a conversion error.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <line x1="60" y1="160" x2="700" y2="160" stroke="var(--dg-line)" stroke-width="1.3"/>
  <g fill="var(--dg-surface-2)" stroke="var(--dg-line)" stroke-width="0.8"><rect x="90" y="110" width="30" height="50"/><rect x="210" y="40" width="30" height="120"/><rect x="330" y="70" width="30" height="90"/><rect x="450" y="120" width="30" height="40"/><rect x="570" y="118" width="30" height="42"/></g>
  <g fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="0.8"><rect x="124" y="68" width="30" height="92"/><rect x="244" y="40" width="30" height="120"/><rect x="364" y="70" width="30" height="90"/><rect x="484" y="120" width="30" height="40"/></g>
  <g font-size="10.5" fill="var(--dg-text)"><text text-anchor="middle" x="122" y="178">1</text><text text-anchor="middle" x="242" y="178">2</text><text text-anchor="middle" x="362" y="178">5</text><text text-anchor="middle" x="482" y="178">6</text><text text-anchor="middle" x="590" y="178">12</text></g>
  <text x="620" y="110" font-size="10.5" fill="var(--dg-muted)">→ 0 after</text>
  <text x="130" y="60" font-size="10.5" fill="var(--dg-text)">+3.1 M</text>
  <rect x="60" y="20" width="14" height="10" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/><text x="80" y="29" font-size="10" fill="var(--dg-muted)">1.2</text>
  <rect x="110" y="20" width="14" height="10" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text x="130" y="29" font-size="10" fill="var(--dg-muted)">1.4</text>
  <text x="380" y="194" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">classification</text>
</svg>

## Key Parameter Table

| Setting | Value | Why |
|---|---|---|
| `minor_version` | 4 | LAS 1.4 header |
| `dataformat_id` | 6, 7 or 8 | 6 from PDRF 1, 7 from PDRF 3, 8 if NIR exists |
| `a_srs` | compound EPSG | Writes a WKT CRS record |
| `global_encoding` | 17 | Adjusted standard time + WKT bits |
| `forward` | scales, offsets, IDs | Keeps precision and provenance fields |
| class 12 handling | overlap flag + class 1 | LAS 1.4 reserves 12 and uses the flag |

## Verification

- **Counts identical.** Source and output point counts match exactly.
- **Histogram diff.** Only class 12 → 1 moves; every other class count is unchanged.
- **GPS time plausible.** Adjusted standard time for flights in the 2010s and 2020s falls roughly between 0 and a few hundred million seconds; week time falls between 0 and 604,800. Check which range the output is in.
- **CRS present.** `pdal info --metadata` shows a WKT CRS on the output.

## Gotchas and Edge Cases

**Class 12 was not always overlap.** Some vendors used 12 for other purposes. Confirm with the delivery documentation before converting it to an overlap flag.

**Unknown GPS week.** Week time cannot be converted without the week. If the flight date is unknown, the GPS times can still be kept consistent within the file, but they cannot be aligned with trajectories or other flights. Document the limitation.

**CRS from GeoTIFF keys.** Some 1.2 files carry incomplete GeoTIFF keys — horizontal only, or a user-defined projection. Resolve the true CRS from the delivery metadata, and set it explicitly rather than trusting the automatic translation.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GPS time ranges for week time and adjusted standard time" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Telling the two time types apart</title>
  <desc>Two number lines. GPS week time runs from 0 to 604,800 seconds and resets every week. Adjusted standard GPS time is seconds since the GPS epoch minus one billion; for flights around 2018 it is roughly 200 to 250 million. A value like 385,000 is week time; a value like 218,000,000 is adjusted standard time.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="44" font-size="10.5" fill="var(--dg-text)">week time</text>
  <line x1="150" y1="40" x2="700" y2="40" stroke="var(--dg-line)" stroke-width="1.4"/>
  <circle cx="500" cy="40" r="5" fill="var(--dg-c)"/>
  <text x="150" y="62" font-size="10" fill="var(--dg-muted)">0</text>
  <text x="700" y="62" text-anchor="end" font-size="10" fill="var(--dg-muted)">604,800 s</text>
  <text x="500" y="28" text-anchor="middle" font-size="10.5" fill="var(--dg-c)">385,000</text>
  <text x="20" y="124" font-size="10.5" fill="var(--dg-text)">adjusted standard</text>
  <line x1="150" y1="120" x2="700" y2="120" stroke="var(--dg-line)" stroke-width="1.4"/>
  <circle cx="420" cy="120" r="5" fill="var(--dg-a)"/>
  <text x="150" y="142" font-size="10" fill="var(--dg-muted)">0 (2011)</text>
  <text x="700" y="142" text-anchor="end" font-size="10" fill="var(--dg-muted)">≈ 500 M s</text>
  <text x="420" y="108" text-anchor="middle" font-size="10.5" fill="var(--dg-a)">218,000,000 (2018)</text>
</svg>

**Laspy convert drops fields.** Converting PDRF 3 to PDRF 6 drops RGB. Choose 7 to keep colour; laspy will not warn.

## Frequently Asked Questions

**How do I convert LAS 1.2 to LAS 1.4?**

Rewrite the file with PDAL's writers.las using minor_version 4 and a LAS 1.4 point format such as 6 or 7, or with laspy's convert function. Handle class 12 overlap, GPS time type and the CRS explicitly while doing so.

**Why does LAS 1.4 need adjusted standard GPS time?**

Point formats 6 to 10 are defined with adjusted standard GPS time, a continuous timescale, so points from different weeks and flights can be ordered and matched to trajectories. Week time resets every week and is ambiguous without the week number.

**What happens to class 12 overlap points?**

In LAS 1.4, overlap is a flag rather than a class. Set the overlap flag on those points and assign them a real class, or class 1 if the true class is unknown.

**Do I lose anything by upgrading?**

Not if the target format holds every source field: 6 for format 1, 7 for format 3. Choosing a format without colour for a coloured source drops RGB silently, so check before converting.

## Related

- [LAS/LAZ File Structure](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/) — the file layout
- [Understanding LAS Point Data Record Formats](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/understanding-las-point-data-record-formats/) — what each format holds
- [Converting GPS Week Time to Adjusted Standard Time](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/metadata-header-sync/converting-gps-week-time-to-adjusted-standard-time/) — the time conversion in detail
- [Flagging Overlap and Withheld Points](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/flagging-overlap-and-withheld-points/) — flags in LAS 1.4
- [Converting LAS to LAZ with PDAL](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/converting-las-to-laz-with-pdal/) — compression during the upgrade
