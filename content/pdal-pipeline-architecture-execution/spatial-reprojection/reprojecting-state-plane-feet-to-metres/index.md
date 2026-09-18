---
title: "Reprojecting State Plane Feet to Metres"
description: "Convert LiDAR from a US State Plane CRS in US survey feet to a metric UTM CRS with PDAL, including the vertical units that filters.reprojection silently leaves in feet unless you give it a compound CRS."
slug: "reprojecting-state-plane-feet-to-metres"
type: "howto"
breadcrumb: "State Plane Feet to Metres"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Reprojecting State Plane Feet to Metres",
      "description": "Convert LiDAR from a US State Plane CRS in US survey feet to a metric UTM CRS with PDAL, including the vertical units that filters.reprojection silently leaves in feet unless you give it a compound CRS.",
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
          "name": "Spatial Reprojection",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "State Plane Feet to Metres",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/reprojecting-state-plane-feet-to-metres/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Reproject State Plane feet LiDAR to metres with PDAL",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Read what the file claims",
          "text": "pdal info --metadata tile.laz shows the WKT in metadata.srs. Look for LENGTHUNIT[\"US survey foot\"...] on the horizontal axes and whether a VERTCRS is present at all."
        },
        {
          "@type": "HowToStep",
          "name": "Build the compound source CRS",
          "text": "If the file carries a horizontal CRS only, write the compound form yourself: horizontal EPSG code, +, vertical EPSG code. EPSG:6360 is NAVD88 height in US survey feet; EPSG:8228 is NAVD88 height in international feet."
        },
        {
          "@type": "HowToStep",
          "name": "Build the compound target CRS",
          "text": "EPSG:6347+5703 \u2014 the UTM zone plus NAVD88 height in metres. Keeping NAVD88 changes only units; switching to ellipsoidal heights is a separate decision covered in handling vertical datum transforms."
        },
        {
          "@type": "HowToStep",
          "name": "Reproject and reset scales",
          "text": "Feet coordinates are usually stored with a scale of 0.01 ft. After conversion, write with a metric scale of 0.001 m or 0.01 m and offset: \"auto\" so precision is preserved and integers do not overflow."
        },
        {
          "@type": "HowToStep",
          "name": "Verify with a known point",
          "text": "Pick a survey control point or a point you can compute independently with projinfo/cs2cs, and compare."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why did my Z values stay in feet after reprojection?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because the input and output CRSs were horizontal only. filters.reprojection converts only the axes the CRS defines; supply compound CRSs with a vertical component on both sides and Z is converted too."
          }
        },
        {
          "@type": "Question",
          "name": "What is the difference between the US survey foot and the international foot?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The US survey foot is 1200/3937 metres, about 0.3048006; the international foot is exactly 0.3048 metres. The two-parts-per-million difference becomes tens of centimetres at typical State Plane coordinate values. The US survey foot was officially retired at the end of 2022, but existing data still uses it."
          }
        },
        {
          "@type": "Question",
          "name": "Which EPSG code is NAVD88 height in metres?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "EPSG:5703. NAVD88 height in US survey feet is EPSG:6360, and in international feet EPSG:8228."
          }
        },
        {
          "@type": "Question",
          "name": "Do I need to change the LAS scale after converting to metres?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Usually yes. A scale of 0.01 chosen for feet becomes 0.01 metres after conversion, which is about three times coarser than the original storage precision, and the old offsets no longer suit the new coordinate range. Setting a metric scale such as 0.001 and automatic offsets avoids both issues."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Give `filters.reprojection` compound CRSs on both sides — for example `in_srs: "EPSG:2263+6360"` (NAD83 / New York Long Island ftUS + NAVD88 height ftUS) and `out_srs: "EPSG:6347+5703"` (NAD83(2011) / UTM 18N + NAVD88 height in metres). With a horizontal-only CRS, X and Y are converted but Z stays in feet, which produces a cloud whose heights are 3.28 times too large.

## Context and Motivation

This guide is part of [Spatial Reprojection](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/). A large share of US county and state LiDAR is delivered in State Plane coordinates with US survey feet, because that is what local surveyors and engineering departments use. Anything downstream in metres — national mosaics, most scientific software, many cloud services — needs it converted, and the conversion has one well-known trap. `filters.reprojection` converts the axes the CRS describes. A horizontal-only State Plane CRS describes X and Y, so Z passes through untouched in feet, and nothing warns you.

A second, quieter issue is the foot itself. The US survey foot (1200/3937 m, about 0.3048006 m) and the international foot (exactly 0.3048 m) differ by two parts per million — about 3 cm across a State Plane zone's typical easting. PROJ handles this correctly when the CRS is right; it goes wrong when someone "fixes" units with a hand-written scale factor.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Horizontal-only versus compound CRS reprojection and the resulting Z values" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Where the feet survive</title>
  <desc>Two rows. With a horizontal-only input and output CRS, a point at X 1,000,000 ftUS, Y 200,000 ftUS, Z 328 ft comes out with X and Y in metres but Z still 328, now wrongly read as metres. With compound CRSs on both sides, the same point comes out with Z 99.97 metres.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="24" width="700" height="80" rx="8" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="36" y="48" font-size="11" font-weight="600" fill="var(--dg-text)">EPSG:2263 → EPSG:6347 (horizontal only)</text>
  <text x="36" y="70" font-size="10.5" fill="var(--dg-text)">Z 328.0 ft in → Z 328.0 out, now labelled metres</text>
  <text x="36" y="90" font-size="10.5" fill="var(--dg-e)">heights 3.28× too large; DTMs, contours and HAG all wrong</text>
  <rect x="20" y="118" width="700" height="80" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="36" y="142" font-size="11" font-weight="600" fill="var(--dg-text)">EPSG:2263+6360 → EPSG:6347+5703 (compound)</text>
  <text x="36" y="164" font-size="10.5" fill="var(--dg-text)">Z 328.0 ftUS in → Z 99.97 m out</text>
  <text x="36" y="184" font-size="10.5" fill="var(--dg-text)">vertical units converted because the CRS says what they are</text>
</svg>

## Prerequisites and Assumptions

- PDAL 2.3+ built against PROJ 7 or newer (`pdal --version`, `projinfo --version`).
- The source CRS identified precisely: State Plane zone, datum realization (NAD83, NAD83(HARN), NAD83(2011)) and units. Check the LAS header with `pdal info --metadata` before anything else.
- The vertical datum and its units — usually NAVD88 in US survey feet for US deliveries.
- A target: here NAD83(2011) / UTM zone 18N (EPSG:6347) with NAVD88 heights in metres (EPSG:5703).

## Step-by-Step Implementation

### Step 1 — Read what the file claims

`pdal info --metadata tile.laz` shows the WKT in `metadata.srs`. Look for `LENGTHUNIT["US survey foot"...]` on the horizontal axes and whether a `VERTCRS` is present at all.

### Step 2 — Build the compound source CRS

If the file carries a horizontal CRS only, write the compound form yourself: horizontal EPSG code, `+`, vertical EPSG code. EPSG:6360 is NAVD88 height in US survey feet; EPSG:8228 is NAVD88 height in international feet.

### Step 3 — Build the compound target CRS

`EPSG:6347+5703` — the UTM zone plus NAVD88 height in metres. Keeping NAVD88 changes only units; switching to ellipsoidal heights is a separate decision covered in [handling vertical datum transforms](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/handling-vertical-datum-transforms-in-pdal/).

### Step 4 — Reproject and reset scales

Feet coordinates are usually stored with a scale of 0.01 ft. After conversion, write with a metric scale of 0.001 m or 0.01 m and `offset: "auto"` so precision is preserved and integers do not overflow.

### Step 5 — Verify with a known point

Pick a survey control point or a point you can compute independently with `projinfo`/`cs2cs`, and compare.

## Complete Working Example

```json
{
  "pipeline": [
    {
      "type": "readers.las",
      "filename": "nyc_ftUS/tile_985000_195000.laz",
      "override_srs": "EPSG:2263+6360"
    },
    {
      "type": "filters.reprojection",
      "in_srs": "EPSG:2263+6360",
      "out_srs": "EPSG:6347+5703"
    },
    {
      "type": "writers.las",
      "filename": "nyc_m/tile_985000_195000.laz",
      "minor_version": 4,
      "dataformat_id": 6,
      "scale_x": 0.001, "scale_y": 0.001, "scale_z": 0.001,
      "offset_x": "auto", "offset_y": "auto", "offset_z": "auto",
      "a_srs": "EPSG:6347+5703",
      "forward": "all"
    }
  ]
}
```

And a Python check of one point against PROJ directly:

```python
"""Confirm a converted point against pyproj for the same compound CRSs."""
import json

import numpy as np
import pdal
from pyproj import Transformer

p = pdal.Pipeline(json.dumps({"pipeline": ["nyc_ftUS/tile_985000_195000.laz",
                                           {"type": "filters.head", "count": 1}]}))
p.execute()
src = p.arrays[0][0]

q = pdal.Pipeline(json.dumps({"pipeline": ["nyc_m/tile_985000_195000.laz",
                                           {"type": "filters.head", "count": 1}]}))
q.execute()
dst = q.arrays[0][0]

t = Transformer.from_crs("EPSG:2263+6360", "EPSG:6347+5703", always_xy=True)
x, y, z = t.transform(src["X"], src["Y"], src["Z"])
print(f"PDAL  {dst['X']:.3f} {dst['Y']:.3f} {dst['Z']:.3f}")
print(f"pyproj {x:.3f} {y:.3f} {z:.3f}")
assert np.allclose([dst["X"], dst["Y"], dst["Z"]], [x, y, z], atol=0.002)
assert abs(dst["Z"] - src["Z"] * 1200 / 3937) < 0.01, "Z was not converted from feet"
```

The last assertion is the one that catches the horizontal-only mistake: it checks that the output Z equals the input Z times the survey-foot factor, since the vertical datum did not change.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Survey foot and international foot diverging with distance from the origin" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Two feet, two parts per million</title>
  <desc>A line chart of the coordinate difference between interpreting values as US survey feet or international feet, against the coordinate value. At 100,000 feet the difference is 0.06 metres; at 1,000,000 feet it is 0.61 metres; at 2,000,000 feet it is 1.22 metres. A note says State Plane eastings are often over a million feet, so the wrong foot shifts data by more than half a metre.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="170" x2="680" y2="170" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="80" y1="170" x2="80" y2="24" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="80" y1="170" x2="680" y2="30" stroke="var(--dg-c)" stroke-width="2"/>
  <circle cx="110" cy="163" r="4" fill="var(--dg-c)"/><circle cx="380" cy="100" r="4" fill="var(--dg-c)"/><circle cx="680" cy="30" r="4" fill="var(--dg-c)"/>
  <text x="120" y="156" font-size="10.5" fill="var(--dg-text)">100k ft: 0.06 m</text>
  <text x="390" y="94" font-size="10.5" fill="var(--dg-text)">1M ft: 0.61 m</text>
  <text x="672" y="52" text-anchor="end" font-size="10.5" fill="var(--dg-text)">2M ft: 1.22 m</text>
  <text x="380" y="190" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">coordinate value in feet</text>
  <text x="44" y="98" font-size="10.5" fill="var(--dg-muted)" transform="rotate(-90 44 98)" text-anchor="middle">shift</text>
</svg>

## Key Parameter Table

| Setting | Value | Why |
|---|---|---|
| `in_srs` | `EPSG:2263+6360` | Horizontal ftUS plus NAVD88 height ftUS; replace with your zone |
| `out_srs` | `EPSG:6347+5703` | UTM 18N metres plus NAVD88 height metres |
| `override_srs` on reader | same as `in_srs` | Only when the file's own CRS is missing or wrong |
| `scale_*` | 0.001 | Millimetre storage precision in metres |
| `offset_*` | `auto` | Keeps scaled integers within range after the unit change |
| `a_srs` on writer | same as `out_srs` | Writes the compound CRS into the LAS WKT VLR |

## Verification

- **Z ratio.** For a sample of points, output Z divided by input Z should be 0.3048006 (1200/3937) when the vertical datum is unchanged.
- **Header CRS.** `pdal info --metadata out.laz` must show both a projected CRS in metres and a vertical CRS in metres.
- **Extent sanity.** UTM northings in New York are around 4.5 million metres; eastings in zone 18 between roughly 160,000 and 840,000. Values in the millions for eastings mean the conversion did not happen.

## Gotchas and Edge Cases

**Header says feet, data is metres (or the reverse).** Some deliveries carry a feet CRS in the header while coordinates are metric. Check coordinate magnitudes against the zone before trusting the header, and use `override_srs` when they disagree.

**International feet in a few states.** A handful of state specifications use international feet. The EPSG code for the zone differs (for example EPSG:2229 versus its international-foot counterpart), so read the WKT units rather than assuming.

**NAD83 realizations.** Converting NAD83(HARN) State Plane to NAD83(2011) UTM involves a small datum shift as well as a projection change. PROJ applies it when grids are available; see [inspecting PROJ transformations before reprojecting](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/inspecting-proj-transformations-before-reprojecting/).

<svg viewBox="0 0 740 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Checklist of what to read from the source WKT before reprojecting" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Read four things from the WKT first</title>
  <desc>Four boxes in a row, each naming one fact to confirm in the source WKT: the projection zone, the horizontal unit (US survey foot or international foot), the datum realization, and whether a vertical CRS with its unit is present. An arrow leads from the four boxes to a compound in_srs.</desc>
  <defs><marker id="spf-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="190" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="24" width="160" height="60" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="100" y="50" text-anchor="middle" font-size="11" fill="var(--dg-text)">zone</text>
  <text x="100" y="68" text-anchor="middle" font-size="10" fill="var(--dg-muted)">NY Long Island</text>
  <rect x="200" y="24" width="160" height="60" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="280" y="50" text-anchor="middle" font-size="11" fill="var(--dg-text)">horizontal unit</text>
  <text x="280" y="68" text-anchor="middle" font-size="10" fill="var(--dg-muted)">US survey foot</text>
  <rect x="380" y="24" width="160" height="60" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="460" y="50" text-anchor="middle" font-size="11" fill="var(--dg-text)">datum</text>
  <text x="460" y="68" text-anchor="middle" font-size="10" fill="var(--dg-muted)">NAD83 realization</text>
  <rect x="560" y="24" width="160" height="60" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="640" y="50" text-anchor="middle" font-size="11" fill="var(--dg-text)">vertical CRS</text>
  <text x="640" y="68" text-anchor="middle" font-size="10" fill="var(--dg-muted)">present? unit?</text>
  <rect x="220" y="124" width="300" height="46" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.4"/>
  <text x="370" y="152" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">in_srs: "EPSG:2263+6360"</text>
  <line x1="370" y1="88" x2="370" y2="120" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#spf-arw)"/>
</svg>

**Hand-written scale factors.** Replacing reprojection with `filters.assign` multiplying by 0.3048 uses the international foot, introducing the error in the chart above, and leaves the CRS metadata wrong. Let PROJ do the conversion.

## Frequently Asked Questions

**Why did my Z values stay in feet after reprojection?**

Because the input and output CRSs were horizontal only. filters.reprojection converts only the axes the CRS defines; supply compound CRSs with a vertical component on both sides and Z is converted too.

**What is the difference between the US survey foot and the international foot?**

The US survey foot is 1200/3937 metres, about 0.3048006; the international foot is exactly 0.3048 metres. The two-parts-per-million difference becomes tens of centimetres at typical State Plane coordinate values. The US survey foot was officially retired at the end of 2022, but existing data still uses it.

**Which EPSG code is NAVD88 height in metres?**

EPSG:5703. NAVD88 height in US survey feet is EPSG:6360, and in international feet EPSG:8228.

**Do I need to change the LAS scale after converting to metres?**

Usually yes. A scale of 0.01 chosen for feet becomes 0.01 metres after conversion, which is about three times coarser than the original storage precision, and the old offsets no longer suit the new coordinate range. Setting a metric scale such as 0.001 and automatic offsets avoids both issues.

## Related

- [Spatial Reprojection](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/) — the reprojection stage in general
- [Handling Vertical Datum Transforms in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/handling-vertical-datum-transforms-in-pdal/) — changing the vertical datum, not just its units
- [Inspecting PROJ Transformations Before Reprojecting](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/inspecting-proj-transformations-before-reprojecting/) — seeing which operation PROJ will use
- [Setting a Vertical CRS on a Point Cloud](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/setting-a-vertical-crs-on-a-point-cloud/) — when the file has none
- [Fixing CRS Mismatches in Point Clouds](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/fixing-crs-mismatches-in-point-clouds/) — headers that disagree with the data
