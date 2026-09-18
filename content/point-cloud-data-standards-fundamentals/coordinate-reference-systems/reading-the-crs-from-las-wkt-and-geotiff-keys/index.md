---
title: "Reading the CRS from LAS WKT and GeoTIFF Keys"
description: "Find out what coordinate reference system a LAS or LAZ file actually declares: the OGC WKT VLR (record 2112) in LAS 1.4, GeoTIFF key VLRs (34735–34737) in older files, reading both with laspy and PDAL, and detecting missing, partial or contradictory CRS records."
slug: "reading-the-crs-from-las-wkt-and-geotiff-keys"
type: "howto"
breadcrumb: "Reading the CRS from LAS"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Reading the CRS from LAS WKT and GeoTIFF Keys",
      "description": "Find out what coordinate reference system a LAS or LAZ file actually declares: the OGC WKT VLR (record 2112) in LAS 1.4, GeoTIFF key VLRs (34735\u201334737) in older files, reading both with laspy and PDAL, and detecting missing, partial or contradictory CRS records.",
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
          "name": "Coordinate Reference Systems",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Reading the CRS from LAS",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/reading-the-crs-from-las-wkt-and-geotiff-keys/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Read the coordinate reference system from a LAS file",
      "step": [
        {
          "@type": "HowToStep",
          "name": "List the VLRs",
          "text": "laspy.open(p).header.vlrs lists every record with user ID and record ID. Look for LASF_Projection records: 2112 (WKT), 34735/34736/34737 (GeoTIFF keys)."
        },
        {
          "@type": "HowToStep",
          "name": "Parse the CRS",
          "text": "header.parse_crs() returns a pyproj CRS or None. In PDAL, pdal info --metadata gives metadata.srs.wkt, horizontal, vertical and compoundwkt."
        },
        {
          "@type": "HowToStep",
          "name": "Split horizontal and vertical",
          "text": "A compound CRS has sub_crs_list with a projected and a vertical part. A plain projected CRS has no vertical information."
        },
        {
          "@type": "HowToStep",
          "name": "Check units and magnitudes",
          "text": "Compare the declared axis units with the coordinate magnitudes: UTM eastings in metres range roughly 160,000\u2013840,000; State Plane eastings in feet are often above 1,000,000."
        },
        {
          "@type": "HowToStep",
          "name": "Resolve conflicts",
          "text": "If WKT and GeoTIFF keys both exist and disagree, LAS 1.4 readers follow the WKT when global encoding bit 4 is set. Decide which is right from the delivery documentation, then rewrite the file with a single correct CRS."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How do I find the coordinate system of a LAS file?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Open it with laspy and call header.parse_crs, which returns a pyproj CRS, or run pdal info with the metadata flag and read the srs section. Both read the WKT or GeoTIFF key records."
          }
        },
        {
          "@type": "Question",
          "name": "What is VLR record 2112?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It is the LAS 1.4 variable-length record, under user ID LASF_Projection, that holds the coordinate reference system as an OGC Well-Known Text string. LAS 1.4 point formats 6 to 10 require the CRS in this form."
          }
        },
        {
          "@type": "Question",
          "name": "Why does my file have no vertical datum?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Many files declare only the horizontal CRS, often because the source software wrote an EPSG code for the projection alone. The heights are still in some vertical datum; find it from the delivery documentation and set it explicitly."
          }
        },
        {
          "@type": "Question",
          "name": "What if WKT and GeoTIFF keys disagree?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "LAS 1.4 readers use the WKT when global encoding bit 4 is set. Determine which description is correct from the project documentation, then rewrite the file with a single, correct CRS."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** `laspy.open(path).header.parse_crs()` returns a pyproj CRS from either the WKT record (LAS 1.4, user ID `LASF_Projection`, record ID 2112) or the GeoTIFF key records (34735 key directory, 34736 doubles, 34737 ASCII). `pdal info --metadata` reports the same as `metadata.srs` with `horizontal`, `vertical` and `compoundwkt` fields. Always check that a vertical component exists and that the declared units match the coordinate magnitudes.

## Context and Motivation

This guide is part of [Coordinate Reference Systems](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/). A LAS file does not have to declare its CRS, and when it does, it can do so in two different ways. LAS 1.4 stores an OGC Well-Known Text string in a variable-length record; older files use the GeoTIFF key mechanism borrowed from raster formats, with EPSG codes and parameters spread across three records. Both can be incomplete — a horizontal CRS without the vertical datum is common — and a file can even contain both, disagreeing. Reading the CRS correctly is the first step of every reprojection, merge and accuracy assessment, and it takes only a few lines.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The two ways a LAS file can store its CRS" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>WKT record or GeoTIFF keys</title>
  <desc>A LAS file layout: header, then variable-length records, then points. Among the VLRs, one path shows a single WKT record with record ID 2112 holding a compound CRS string. The other path shows three GeoTIFF key records — 34735 key directory, 34736 double parameters and 34737 ASCII parameters — that together describe the CRS. Global encoding bit 4 tells readers which to use in LAS 1.4.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="30" width="120" height="160" rx="8" fill="var(--dg-surface-2)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="80" y="60" text-anchor="middle" font-size="11" fill="var(--dg-text)">header</text>
  <text x="80" y="80" text-anchor="middle" font-size="10" fill="var(--dg-muted)">global encoding</text>
  <text x="80" y="96" text-anchor="middle" font-size="10" fill="var(--dg-muted)">bit 4: WKT</text>
  <rect x="180" y="30" width="300" height="70" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="330" y="56" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">LAS 1.4: WKT VLR</text>
  <text x="330" y="78" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">LASF_Projection · record 2112</text>
  <rect x="180" y="120" width="300" height="70" rx="8" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="330" y="146" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">legacy: GeoTIFF keys</text>
  <text x="330" y="168" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">34735 · 34736 · 34737</text>
  <rect x="520" y="30" width="200" height="160" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="620" y="60" text-anchor="middle" font-size="11" fill="var(--dg-text)">point records</text>
  <text x="620" y="84" text-anchor="middle" font-size="10" fill="var(--dg-muted)">coordinates whose meaning</text>
  <text x="620" y="100" text-anchor="middle" font-size="10" fill="var(--dg-muted)">depends on the CRS</text>
</svg>

## Prerequisites and Assumptions

- laspy 2.x with pyproj, or PDAL 2.x.
- LAS or LAZ files of any version.
- A rough idea of where the data is on Earth, to sanity-check coordinates against the declared CRS.

## Step-by-Step Implementation

### Step 1 — List the VLRs

`laspy.open(p).header.vlrs` lists every record with user ID and record ID. Look for `LASF_Projection` records: 2112 (WKT), 34735/34736/34737 (GeoTIFF keys).

### Step 2 — Parse the CRS

`header.parse_crs()` returns a pyproj CRS or `None`. In PDAL, `pdal info --metadata` gives `metadata.srs.wkt`, `horizontal`, `vertical` and `compoundwkt`.

### Step 3 — Split horizontal and vertical

A compound CRS has `sub_crs_list` with a projected and a vertical part. A plain projected CRS has no vertical information.

### Step 4 — Check units and magnitudes

Compare the declared axis units with the coordinate magnitudes: UTM eastings in metres range roughly 160,000–840,000; State Plane eastings in feet are often above 1,000,000.

### Step 5 — Resolve conflicts

If WKT and GeoTIFF keys both exist and disagree, LAS 1.4 readers follow the WKT when global encoding bit 4 is set. Decide which is right from the delivery documentation, then rewrite the file with a single correct CRS.

## Complete Working Example

```python
"""Report what CRS each LAS/LAZ file declares, and flag common problems."""
from __future__ import annotations

from pathlib import Path

import laspy
import numpy as np
from pyproj import CRS

WKT_ID, GEOKEY_IDS = 2112, {34735, 34736, 34737}


def crs_report(path: Path) -> dict:
    with laspy.open(path) as f:
        h = f.header
        proj_vlrs = {v.record_id for v in h.vlrs if v.user_id == "LASF_Projection"}
        proj_vlrs |= {v.record_id for v in getattr(h, "evlrs", []) or [] if v.user_id == "LASF_Projection"}
        crs = h.parse_crs()
        wkt_bit = bool(int(h.global_encoding.wkt)) if h.version.minor >= 4 else False
        mins, maxs = h.mins, h.maxs

    rep = {"file": path.name, "las": f"1.{h.version.minor}",
           "has_wkt": WKT_ID in proj_vlrs, "has_geokeys": bool(proj_vlrs & GEOKEY_IDS),
           "wkt_bit": wkt_bit, "crs": None, "horizontal": None, "vertical": None,
           "unit": None, "issues": []}
    if crs is None:
        rep["issues"].append("no CRS declared")
        return rep
    rep["crs"] = crs.name
    subs = crs.sub_crs_list or [crs]
    horiz = next((c for c in subs if c.is_projected or c.is_geographic), None)
    vert = next((c for c in subs if c.is_vertical), None)
    rep["horizontal"] = horiz.to_epsg() if horiz else None
    rep["vertical"] = vert.name if vert else None
    if horiz is not None and horiz.axis_info:
        rep["unit"] = horiz.axis_info[0].unit_name
    if vert is None:
        rep["issues"].append("no vertical CRS")
    if rep["has_wkt"] and rep["has_geokeys"]:
        rep["issues"].append("both WKT and GeoTIFF keys present")
    if h.version.minor >= 4 and rep["has_wkt"] and not wkt_bit:
        rep["issues"].append("WKT present but global encoding bit 4 not set")
    if horiz is not None and horiz.is_projected:
        east = float(np.mean([mins[0], maxs[0]]))
        if rep["unit"] == "metre" and east > 2_000_000:
            rep["issues"].append("eastings look like feet for a metre CRS")
    return rep


if __name__ == "__main__":
    for p in sorted(Path("received").glob("*.la[sz]")):
        r = crs_report(p)
        print(f"{r['file']:<24} LAS {r['las']} EPSG {r['horizontal']} / {r['vertical']} "
              f"({r['unit']})  {'; '.join(r['issues']) or 'ok'}")
```

From the command line, the PDAL equivalent for one file:

```bash
pdal info --metadata received/t_0431.laz | jq '.metadata.srs | {horizontal, vertical, units}'
```

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A compound CRS split into horizontal and vertical parts" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Two halves of a compound CRS</title>
  <desc>A compound CRS box labelled NAD83(2011) / UTM zone 15N plus NAVD88 height splits into two boxes. The horizontal part is EPSG 6344 with axes in metres. The vertical part is EPSG 5703, NAVD88 height in metres, realized through a geoid model. A file with only the horizontal part leaves heights undefined.</desc>
  <defs><marker id="crs-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <rect x="170" y="20" width="400" height="44" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="370" y="47" text-anchor="middle" font-size="11" fill="var(--dg-text)">EPSG:6344+5703 — NAD83(2011) / UTM 15N + NAVD88 height</text>
  <rect x="60" y="110" width="280" height="66" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="200" y="136" text-anchor="middle" font-size="11" fill="var(--dg-text)">horizontal: EPSG:6344</text>
  <text x="200" y="158" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">easting, northing in metres</text>
  <rect x="400" y="110" width="280" height="66" rx="8" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="540" y="136" text-anchor="middle" font-size="11" fill="var(--dg-text)">vertical: EPSG:5703</text>
  <text x="540" y="158" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">NAVD88 height in metres</text>
  <line x1="300" y1="64" x2="220" y2="106" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#crs-arw)"/>
  <line x1="440" y1="64" x2="520" y2="106" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#crs-arw)"/>
</svg>

## Key Parameter Table

| Record | User ID | Record ID | Content | Era |
|---|---|---|---|---|
| OGC WKT | `LASF_Projection` | 2112 | Full CRS as WKT string | LAS 1.4 (required for PDRF 6–10) |
| GeoKeyDirectory | `LASF_Projection` | 34735 | Key IDs and values, EPSG codes | LAS 1.0–1.3, optional in 1.4 legacy formats |
| GeoDoubleParams | `LASF_Projection` | 34736 | Double-valued parameters | with 34735 |
| GeoAsciiParams | `LASF_Projection` | 34737 | Text parameters, names | with 34735 |
| global encoding bit 4 | header | — | 1 = CRS is WKT | LAS 1.4 |

## Verification

- **Magnitudes match units.** Coordinates in the header bounds should be plausible for the declared CRS and unit.
- **Location check.** Transform the header's centre point to longitude and latitude with pyproj; it should land where the project is.
- **Consistency across tiles.** Every tile in a delivery should declare the same CRS; group the report by `crs` and investigate minorities.

```python
from pyproj import Transformer
with laspy.open("received/t_0431.laz") as f:
    h = f.header
    t = Transformer.from_crs(h.parse_crs(), "EPSG:4326", always_xy=True)
    print(t.transform((h.mins[0] + h.maxs[0]) / 2, (h.mins[1] + h.maxs[1]) / 2))
```

## Gotchas and Edge Cases

**Horizontal only.** The single most common gap. Heights exist but their datum is undocumented; see [setting a vertical CRS on a point cloud](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/setting-a-vertical-crs-on-a-point-cloud/).

**User-defined GeoTIFF projections.** Older files sometimes encode a projection by parameters rather than an EPSG code. pyproj parses them into a custom CRS without an EPSG number; compare parameters carefully with the expected zone.

**CRS in extended VLRs.** LAS 1.4 permits the WKT in an extended VLR at the end of the file. Readers that only scan the standard VLR block miss it; laspy and PDAL handle both.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Frequency of CRS problems found in a batch of received files" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>What a CRS audit usually finds</title>
  <desc>Horizontal bars counting issues in an illustrative batch of 400 received tiles: 212 with no vertical CRS, 31 with both WKT and GeoTIFF keys, 12 with the WKT bit unset, 6 with no CRS at all, and 3 whose coordinate magnitudes contradict the declared units.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <g font-size="10.5" fill="var(--dg-text)"><text text-anchor="end" x="250" y="34">no vertical CRS</text><text text-anchor="end" x="250" y="62">WKT and GeoTIFF keys</text><text text-anchor="end" x="250" y="90">WKT bit not set</text><text text-anchor="end" x="250" y="118">no CRS at all</text><text text-anchor="end" x="250" y="146">units contradict values</text></g>
  <g fill="var(--dg-c)"><rect x="260" y="22" width="424" height="16"/><rect x="260" y="50" width="62" height="16"/><rect x="260" y="78" width="24" height="16"/><rect x="260" y="106" width="12" height="16"/><rect x="260" y="134" width="6" height="16"/></g>
  <g font-size="10" fill="var(--dg-muted)"><text x="690" y="34">212</text><text x="330" y="62">31</text><text x="292" y="90">12</text><text x="280" y="118">6</text><text x="274" y="146">3</text></g>
</svg>

**Trusting the CRS over the data.** A header can simply be wrong. When magnitudes contradict the declared CRS, believe the numbers and fix the header — [fixing CRS mismatches in point clouds](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/fixing-crs-mismatches-in-point-clouds/) covers the repair.

## Frequently Asked Questions

**How do I find the coordinate system of a LAS file?**

Open it with laspy and call header.parse_crs, which returns a pyproj CRS, or run pdal info with the metadata flag and read the srs section. Both read the WKT or GeoTIFF key records.

**What is VLR record 2112?**

It is the LAS 1.4 variable-length record, under user ID LASF_Projection, that holds the coordinate reference system as an OGC Well-Known Text string. LAS 1.4 point formats 6 to 10 require the CRS in this form.

**Why does my file have no vertical datum?**

Many files declare only the horizontal CRS, often because the source software wrote an EPSG code for the projection alone. The heights are still in some vertical datum; find it from the delivery documentation and set it explicitly.

**What if WKT and GeoTIFF keys disagree?**

LAS 1.4 readers use the WKT when global encoding bit 4 is set. Determine which description is correct from the project documentation, then rewrite the file with a single, correct CRS.

## Related

- [Coordinate Reference Systems](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/) — CRS handling overview
- [Choosing a Projected CRS for a LiDAR Project](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/choosing-a-projected-crs-for-a-lidar-project/) — picking a target
- [Setting a Vertical CRS on a Point Cloud](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/setting-a-vertical-crs-on-a-point-cloud/) — filling the vertical gap
- [Reading and Writing LAS VLRs with PDAL](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/reading-and-writing-las-vlrs-with-pdal/) — the VLR mechanism
- [Reprojecting State Plane Feet to Metres](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/reprojecting-state-plane-feet-to-metres/) — when units are feet
