---
title: "Setting a Vertical CRS on a Point Cloud"
description: "Why a projected EPSG code leaves the meaning of Z undeclared, how to stamp a compound CRS with a_srs, and how to verify that the vertical component actually reached the file."
slug: "setting-a-vertical-crs-on-a-point-cloud"
type: "howto"
breadcrumb: "Setting a Vertical CRS"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Setting a Vertical CRS on a Point Cloud",
      "description": "Why a projected EPSG code leaves the meaning of Z undeclared, how to stamp a compound CRS with a_srs, and how to verify that the vertical component actually reached the file.",
      "datePublished": "2026-08-07",
      "dateModified": "2026-08-07",
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
          "name": "Point Cloud Data Standards and Fundamentals",
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
          "name": "Setting a Vertical CRS",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/setting-a-vertical-crs-on-a-point-cloud/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Record a compound horizontal and vertical CRS on a LiDAR tile",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Confirm the compound code resolves",
          "text": "Run projinfo on the paired code and check that both the horizontal and vertical components are named."
        },
        {
          "@type": "HowToStep",
          "name": "Write it with a_srs",
          "text": "Set a_srs on writers.las to the compound code so the file records what its Z values mean."
        },
        {
          "@type": "HowToStep",
          "name": "Use WKT where no EPSG pairing exists",
          "text": "Supply a compound WKT string for national or site datums that have no combined code."
        },
        {
          "@type": "HowToStep",
          "name": "Write LAS 1.4 with a WKT record",
          "text": "GeoTIFF keys cannot express a compound CRS, so a 1.2 file will lose the vertical component."
        },
        {
          "@type": "HowToStep",
          "name": "Verify both components came back",
          "text": "Read the metadata and assert the vertical datum name appears in the written CRS."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does a projected EPSG code not describe my heights?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because it describes only the horizontal system. A file tagged EPSG:6339 carries Z values that could be ellipsoidal heights, orthometric heights above NAVD88, or a local site datum, and nothing in the file distinguishes them. A compound code such as EPSG:6339+5703 states which."
          }
        },
        {
          "@type": "Question",
          "name": "Does a_srs change my coordinates?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. It relabels the file, recording a different declaration for the same numbers. That is the right tool when the coordinates are correct and the declaration was missing or wrong. When the heights themselves must move, you need a reprojection with compound CRSs on both sides."
          }
        },
        {
          "@type": "Question",
          "name": "Why did the vertical part disappear from my output?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Almost certainly because the file was written as LAS 1.2, or with GeoTIFF keys rather than an OGC WKT record. Neither can express a compound coordinate system properly, so the vertical component is dropped without an error."
          }
        },
        {
          "@type": "Question",
          "name": "What if I do not know the vertical datum?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Find out before declaring anything. Guessing between ellipsoidal and orthometric heights is a thirty-metre error, and a confidently wrong declaration is worse than an absent one because it stops anyone downstream from asking."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Write a compound CRS with `a_srs` on the writer — `"EPSG:6339+5703"` — so the file records what its Z values mean. A horizontal-only code leaves the vertical datum undeclared, and every downstream tool is then free to assume something different.

## Context and Motivation

This guide belongs to [Coordinate Reference Systems](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/), which covers where a CRS lives in a LAS file and how PDAL resolves it. This page is about the half of the CRS that most deliveries omit entirely.

A projected EPSG code describes a horizontal system and says nothing about height. Points in a file tagged `EPSG:6339` carry a Z value that might be an ellipsoidal height, an orthometric height above NAVD88, or a local site datum — and nothing in the file distinguishes them. The consequence is not theoretical: two tiles from the same campaign, one delivered in ellipsoidal heights and one in orthometric, differ by around thirty metres and merge into a terrain model with a cliff down the middle. Declaring the vertical datum costs one option and removes the entire class of failure.

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="What a horizontal-only code declares against what a compound code declares" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Half a coordinate system is not a coordinate system</title>
  <desc>Two file headers compared. One records EPSG:6339, which pins the horizontal datum and projection and leaves the meaning of Z entirely undeclared. The other records EPSG:6339 plus 5703, which additionally states that heights are orthometric above NAVD88. Only the second can be merged with another dataset safely.</desc>
  <rect x="0" y="0" width="720" height="250" fill="var(--dg-bg)" rx="10"/>
  <text x="185" y="38" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-e)">a_srs "EPSG:6339"</text>
  <text x="535" y="38" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-d)">a_srs "EPSG:6339+5703"</text>
  <rect x="20" y="50" width="330" height="34" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="185" y="72" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">horizontal datum: NAD83(2011) ✓</text>
  <rect x="20" y="90" width="330" height="34" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="185" y="112" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">projection: UTM zone 11N ✓</text>
  <rect x="20" y="130" width="330" height="34" rx="5" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="185" y="152" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">vertical datum: undeclared ✗</text>
  <rect x="20" y="170" width="330" height="34" rx="5" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="185" y="192" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">what Z means: whatever you assume ✗</text>
  <rect x="370" y="50" width="330" height="34" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="535" y="72" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">horizontal datum: NAD83(2011) ✓</text>
  <rect x="370" y="90" width="330" height="34" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="535" y="112" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">projection: UTM zone 11N ✓</text>
  <rect x="370" y="130" width="330" height="34" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="535" y="152" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">vertical datum: NAVD88 ✓</text>
  <rect x="370" y="170" width="330" height="34" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="535" y="192" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">what Z means: orthometric height ✓</text>
  <text x="20" y="234" font-size="10.5" fill="var(--dg-muted)">the two files can hold identical bytes for every point and still describe different places</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL | 2.4+ built against PROJ 8 or later |
| A known vertical datum | from the survey report — the file will not tell you |
| Output format | LAS 1.4 with an OGC WKT record; GeoTIFF keys cannot express a compound CRS well |
| `projinfo` | to confirm the compound code resolves before writing thousands of files |

## Step-by-Step Implementation

### Step 1 — Confirm the compound code exists

```bash
projinfo "EPSG:6339+5703"
```

The output names both components. An error here means the pairing is not defined and you need a WKT string instead.

### Step 2 — Write it with `a_srs`

```json
{"type": "writers.las", "filename": "tile.laz", "compression": "laszip",
 "minor_version": 4, "dataformat_id": 6,
 "a_srs": "EPSG:6339+5703", "forward": "all"}
```

`a_srs` relabels; it does not transform. Use it when the coordinates are already correct and only the declaration is missing. When the heights must actually move, that is [a vertical datum transform](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/handling-vertical-datum-transforms-in-pdal/) instead.

### Step 3 — Prefer WKT when the EPSG pairing does not exist

```json
{"a_srs": "COMPD_CS[\"NAD83(2011) / UTM 11N + NAVD88\", ...]"}
```

Verbose, but it is the only way to express many national and site datums.

### Step 4 — Read it back and confirm both components

```bash
pdal info tile.laz --metadata | grep -i -A6 "compound\|vertical"
```

## Complete Working Example

```python
"""Stamp a compound CRS onto a directory of tiles and verify both components."""
from __future__ import annotations

import json
import logging
from pathlib import Path

import pdal

LOG = logging.getLogger("vcrs")


def stamp(src: Path, dst: Path, compound: str) -> int:
    spec = json.dumps({"pipeline": [
        {"type": "readers.las", "filename": str(src)},
        {"type": "writers.las", "filename": str(dst), "compression": "laszip",
         "minor_version": 4, "dataformat_id": 6,
         "a_srs": compound, "forward": "all"},
    ]})
    return pdal.Pipeline(spec).execute()


def declared_srs(path: Path) -> str:
    p = pdal.Pipeline(json.dumps({"pipeline": [
        {"type": "readers.las", "filename": str(path), "count": 1}]}))
    p.execute()
    srs = p.quickinfo["readers.las"].get("srs", {})
    return srs.get("wkt", "") or srs.get("horizontal", "")


def run(in_dir: Path, out_dir: Path, compound: str, vertical_name: str) -> list[dict]:
    out_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for src in sorted(in_dir.glob("*.laz")):
        dst = out_dir / src.name
        n = stamp(src, dst, compound)
        wkt = declared_srs(dst)
        if vertical_name.lower() not in wkt.lower():
            raise AssertionError(
                f"{dst.name}: vertical datum {vertical_name!r} is absent from the written CRS"
            )
        LOG.info("%s — %d points, compound CRS recorded", dst.name, n)
        results.append({"tile": dst.name, "points": n})
    return results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(json.dumps(run(Path("tiles"), Path("tiles_vcrs"),
                         compound="EPSG:6339+5703",
                         vertical_name="NAVD88"), indent=2))
```

## Key Parameter Table

| Option | Stage | Effect |
|---|---|---|
| `a_srs` | `writers.las` | Records this CRS in the output; relabels, never transforms |
| `spatialreference` | `readers.las` | Overrides what the input claims, for a mislabelled source |
| `in_srs` / `out_srs` | `filters.reprojection` | Actually moves coordinates; needs compound codes on both sides |
| `minor_version` | `writers.las` | 4, so the WKT record can carry a compound definition |
| `forward` | `writers.las` | Keep the other records while replacing the CRS |

<svg viewBox="0 0 720 252" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The structure of a compound coordinate reference system definition" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What a compound CRS is made of</title>
  <desc>A compound definition nests two complete systems. The horizontal part carries a geodetic datum, an ellipsoid, a projection and its units. The vertical part carries a vertical datum, usually realised by a geoid model, and its own units. Either half can be present without the other, which is exactly how a file ends up with heights that mean nothing in particular.</desc>
  <rect x="0" y="0" width="720" height="252" fill="var(--dg-bg)" rx="10"/>
  <rect x="180" y="42" width="360" height="40" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.4"/>
  <text x="360" y="67" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">COMPD_CS — EPSG:6339+5703</text>
  <line x1="360" y1="82" x2="360" y2="100" stroke="var(--dg-line)" stroke-width="1.4"/>
  <line x1="180" y1="100" x2="540" y2="100" stroke="var(--dg-line)" stroke-width="1.4"/>
  <line x1="180" y1="100" x2="180" y2="118" stroke="var(--dg-line)" stroke-width="1.4"/>
  <line x1="540" y1="100" x2="540" y2="118" stroke="var(--dg-line)" stroke-width="1.4"/>
  <rect x="40" y="118" width="280" height="46" rx="7" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="180" y="140" text-anchor="middle" font-size="11" fill="var(--dg-text)">horizontal — EPSG:6339</text>
  <text x="180" y="157" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">NAD83(2011) · GRS80 · UTM 11N · metres</text>
  <rect x="400" y="118" width="280" height="46" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="540" y="140" text-anchor="middle" font-size="11" fill="var(--dg-text)">vertical — EPSG:5703</text>
  <text x="540" y="157" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">NAVD88 · GEOID18 · metres</text>
  <text x="40" y="196" font-size="10.5" fill="var(--dg-muted)">a file carrying only the left box is the normal case, and it is why a delivery’s heights can be</text>
  <text x="40" y="214" font-size="10.5" fill="var(--dg-muted)">ellipsoidal or orthometric with nothing in the file able to say which.</text>
  <text x="40" y="240" font-size="10.5" fill="var(--dg-muted)">Check that both halves survived the write, not just that the write succeeded.</text>
</svg>

## Verification

**The vertical component is in the written WKT.** Asserted in the example by name, which is cruder than parsing and considerably harder to fool.

**Coordinates did not move.** `a_srs` must not change a single value. Compare min and max Z before and after; any difference means a transform crept in.

**Downstream tools agree.** Open the file in GDAL or a desktop GIS and confirm it reports a compound system. A tool that shows only the horizontal part is telling you the record was written as GeoTIFF keys rather than WKT.

<svg viewBox="0 0 720 244" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Three ways a vertical datum goes missing between acquisition and delivery" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Where the vertical datum usually gets lost</title>
  <desc>Three stages at which the vertical declaration disappears. The acquisition records it in a report rather than in the file. A processing step rewrites the header with a horizontal-only code. A conversion to a format or version that cannot express a compound CRS silently drops the vertical part. Each is recoverable only from documentation.</desc>
  <rect x="0" y="0" width="720" height="244" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="46" width="200" height="60" rx="8" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="120" y="72" text-anchor="middle" font-size="11" fill="var(--dg-text)">acquisition</text>
  <text x="120" y="92" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">recorded in the report,</text>
  <rect x="260" y="46" width="200" height="60" rx="8" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="360" y="72" text-anchor="middle" font-size="11" fill="var(--dg-text)">processing</text>
  <text x="360" y="92" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">header rewritten, horizontal only</text>
  <rect x="500" y="46" width="200" height="60" rx="8" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="600" y="72" text-anchor="middle" font-size="11" fill="var(--dg-text)">conversion</text>
  <text x="600" y="92" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">target cannot express compound</text>
  <rect x="20" y="126" width="680" height="40" rx="7" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="360" y="151" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">delivered file: horizontal CRS present, vertical datum recoverable only from a PDF</text>
  <text x="20" y="196" font-size="10.5" fill="var(--dg-muted)">stamp the compound CRS at ingest, before the file enters your archive, and every later stage forwards it</text>
  <text x="20" y="216" font-size="10.5" fill="var(--dg-muted)">rather than inventing it. The cost is one option on one writer, once per delivery.</text>
</svg>

## Gotchas and Edge Cases

**GeoTIFF keys cannot really express a compound CRS.** Write LAS 1.4 with a WKT record. A 1.2 file with GeoTIFF keys will lose the vertical component whatever you pass to `a_srs`.

**`a_srs` on a file whose heights are actually ellipsoidal makes matters worse.** You have now confidently mislabelled the data. Confirm what Z means before declaring it.

**Vertical units are separate from horizontal units.** US state plane in survey feet with NAVD88 heights in metres is common and legal. Check both axes of the compound definition.

**Merging still needs matching datums.** Declaring two tiles honestly as NAVD88 and ellipsoidal does not let them merge; it lets you notice that they cannot, which is the entire benefit.

## Frequently Asked Questions

**Why does a projected EPSG code not describe my heights?**

Because it describes only the horizontal system. A file tagged EPSG:6339 carries Z values that could be ellipsoidal heights, orthometric heights above NAVD88, or a local site datum, and nothing in the file distinguishes them. A compound code such as EPSG:6339+5703 states which.

**Does a_srs change my coordinates?**

No. It relabels the file, recording a different declaration for the same numbers. That is the right tool when the coordinates are correct and the declaration was missing or wrong. When the heights themselves must move, you need a reprojection with compound CRSs on both sides.

**Why did the vertical part disappear from my output?**

Almost certainly because the file was written as LAS 1.2, or with GeoTIFF keys rather than an OGC WKT record. Neither can express a compound coordinate system properly, so the vertical component is dropped without an error.

**What if I do not know the vertical datum?**

Find out before declaring anything. Guessing between ellipsoidal and orthometric heights is a thirty-metre error, and a confidently wrong declaration is worse than an absent one because it stops anyone downstream from asking.

---

## Related

- [Coordinate Reference Systems](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/) — the parent guide to where a CRS lives in a LAS file
- [Fixing CRS Mismatches in Point Clouds](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/fixing-crs-mismatches-in-point-clouds/) — diagnosing an offset before deciding it is vertical
- [Handling Vertical Datum Transforms in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/handling-vertical-datum-transforms-in-pdal/) — when the heights have to move rather than be relabelled
- [Metadata and Header Sync](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/metadata-header-sync/) — keeping the header honest through a pipeline
- [Point Cloud Data Standards and Fundamentals](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/) — the section overview
