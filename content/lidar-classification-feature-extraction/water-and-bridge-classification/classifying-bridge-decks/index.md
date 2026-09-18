---
title: "Classifying Bridge Decks"
description: "Find bridge decks that ground filters mistook for terrain and reclassify them to ASPRS class 17: road-crossing polygons, a below-deck terrain surface from the banks, deck height tests, and verifying the DTM opens beneath every crossing."
slug: "classifying-bridge-decks"
type: "howto"
breadcrumb: "Classifying Bridge Decks"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Classifying Bridge Decks",
      "description": "Find bridge decks that ground filters mistook for terrain and reclassify them to ASPRS class 17: road-crossing polygons, a below-deck terrain surface from the banks, deck height tests, and verifying the DTM opens beneath every crossing.",
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
          "name": "Classification & Feature Extraction",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Water and Bridge Classification",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Classifying Bridge Decks",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/classifying-bridge-decks/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Classify bridge deck points to ASPRS class 17",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Build crossing polygons",
          "text": "Intersect roads with water polygons, and roads with other roads (for overpasses). Buffer each intersection segment along the road by 15 m beyond the obstacle on both sides and across the road by half its width plus 2 m."
        },
        {
          "@type": "HowToStep",
          "name": "Burn crossing IDs into points",
          "text": "filters.overlay writes a CrossingId onto every point inside a crossing polygon."
        },
        {
          "@type": "HowToStep",
          "name": "Estimate terrain beneath each crossing",
          "text": "Take ground points in a ring around the crossing but outside the road buffer \u2014 the banks \u2014 and interpolate a surface beneath the deck with a linear interpolator."
        },
        {
          "@type": "HowToStep",
          "name": "Test deck height",
          "text": "For class 2 points inside each crossing, compute height above the bank surface. Points more than 1.5 m above it are deck."
        },
        {
          "@type": "HowToStep",
          "name": "Reclassify and rebuild the DTM",
          "text": "Write class 17 for deck points, then rebuild the DTM from class 2 only; the channel beneath each bridge is now filled from the banks."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why do ground filters classify bridges as ground?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Ground filters look for the lowest continuous surface, and a deck is continuous with the road on both approaches. Unless the span is long compared with the filter's window, the filter cannot tell the deck from terrain."
          }
        },
        {
          "@type": "Question",
          "name": "What ASPRS class is used for bridge decks?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Class 17, bridge deck, defined in LAS 1.4. Points on the deck surface, including vehicles if not otherwise classified, typically go into this class so they can be excluded from the bare-earth DTM."
          }
        },
        {
          "@type": "Question",
          "name": "Do I need road data to find bridges?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It is not strictly required, but it makes detection far more reliable. Without it, bridges must be inferred from elevated flat surfaces spanning low ground, which also matches embankments, dams and some buildings."
          }
        },
        {
          "@type": "Question",
          "name": "What about overpasses that do not cross water?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Intersect roads with other roads and railways as well as water. The terrain beneath is the lower road, so use its points as the reference surface."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Intersect road lines with water and road lines with each other to get crossing polygons, buffer them by the road width, estimate the terrain beneath each crossing from ground points on the banks outside the deck, and reclassify class 2 points inside the crossing that sit more than about 1.5 m above that terrain to class 17 with `filters.assign`.

## Context and Motivation

This guide is part of [Water and Bridge Classification in LiDAR](https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/). Ground filters such as [SMRF](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) look for the lowest continuous surface, and a bridge deck is continuous with the road that leads onto it. Short bridges are often classified as ground in their entirety. The resulting DTM carries a raised causeway across every river and every underpass, which blocks drainage in hydrologic models and misrepresents the terrain for flood mapping.

The parent topic's heuristic — ground points well above their nearest ground neighbours — catches long, high bridges. It misses short culvert-style crossings, and it can flag steep road embankments. Using road and water geometry to say where bridges can be, and the banks to say what the terrain under them looks like, makes deck detection reliable.

<svg viewBox="0 40 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Profile of a bridge showing deck points, bank ground and the interpolated terrain beneath" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Deck versus the terrain beneath it</title>
  <desc>A profile along a road crossing a stream. Road points on the approaches are ground. Deck points across the span sit several metres above a dashed line interpolated between the two banks, which represents the terrain beneath the bridge. Points above that line by more than 1.5 metres inside the crossing polygon are reclassified as bridge deck.</desc>
  <rect x="0" y="40" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <path d="M20 80 L220 80 L260 150 L480 150 L520 80 L720 80" fill="none" stroke="var(--dg-line)" stroke-width="1.4"/>
  <line x1="250" y1="140" x2="490" y2="140" stroke="var(--dg-b)" stroke-width="1.3" stroke-dasharray="6 4"/>
  <g fill="var(--dg-d)"><circle cx="60" cy="78" r="3"/><circle cx="110" cy="78" r="3"/><circle cx="160" cy="78" r="3"/><circle cx="200" cy="78" r="3"/><circle cx="540" cy="78" r="3"/><circle cx="590" cy="78" r="3"/><circle cx="640" cy="78" r="3"/><circle cx="690" cy="78" r="3"/></g>
  <g fill="var(--dg-c)"><circle cx="240" cy="74" r="3"/><circle cx="280" cy="74" r="3"/><circle cx="320" cy="74" r="3"/><circle cx="360" cy="74" r="3"/><circle cx="400" cy="74" r="3"/><circle cx="440" cy="74" r="3"/><circle cx="480" cy="74" r="3"/></g>
  <line x1="360" y1="78" x2="360" y2="138" stroke="var(--dg-e)" stroke-width="1.4"/>
  <text x="368" y="112" font-size="10.5" fill="var(--dg-e)">5.8 m above terrain → class 17</text>
  <text x="120" y="66" text-anchor="middle" font-size="10.5" fill="var(--dg-d)">road, class 2</text>
  <text x="370" y="176" text-anchor="middle" font-size="10.5" fill="var(--dg-b)">terrain beneath, interpolated from the banks</text>
  <text x="20" y="200" font-size="10.5" fill="var(--dg-muted)">approach points stay ground; only deck points inside the crossing polygon move</text>
</svg>

## Prerequisites and Assumptions

- A tile with ground classified; water polygons if available.
- Road centrelines (OpenStreetMap, a national road network, or client GIS) in the tile's CRS, ideally with a width or number-of-lanes attribute.
- PDAL 2.4+ with `filters.overlay` and `filters.assign`; Python with GeoPandas, Shapely, NumPy and SciPy.

## Step-by-Step Implementation

### Step 1 — Build crossing polygons

Intersect roads with water polygons, and roads with other roads (for overpasses). Buffer each intersection segment along the road by 15 m beyond the obstacle on both sides and across the road by half its width plus 2 m.

### Step 2 — Burn crossing IDs into points

`filters.overlay` writes a `CrossingId` onto every point inside a crossing polygon.

### Step 3 — Estimate terrain beneath each crossing

Take ground points in a ring around the crossing but outside the road buffer — the banks — and interpolate a surface beneath the deck with a linear interpolator.

### Step 4 — Test deck height

For class 2 points inside each crossing, compute height above the bank surface. Points more than 1.5 m above it are deck.

### Step 5 — Reclassify and rebuild the DTM

Write class 17 for deck points, then rebuild the DTM from class 2 only; the channel beneath each bridge is now filled from the banks.

## Complete Working Example

```python
"""Bridge deck detection from road crossings and bank terrain."""
from __future__ import annotations

import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pdal
from scipy.interpolate import LinearNDInterpolator


def crossings(roads: gpd.GeoDataFrame, water: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    parts = []
    for road in roads.itertuples():
        width = getattr(road, "width_m", 8.0) or 8.0
        for wpoly in water.geometry[water.intersects(road.geometry)]:
            seg = road.geometry.intersection(wpoly.buffer(15.0))
            parts.append(seg.buffer(width / 2 + 2.0, cap_style="flat"))
    gdf = gpd.GeoDataFrame({"geometry": parts}, crs=roads.crs)
    gdf = gdf.dissolve().explode(index_parts=False).reset_index(drop=True)
    gdf["CrossingId"] = np.arange(1, len(gdf) + 1)
    return gdf


def classify_decks(src: Path, dst: Path, xing: gpd.GeoDataFrame, min_clear: float = 1.5) -> int:
    gpkg = dst.with_suffix(".crossings.gpkg")
    xing.to_file(gpkg, layer="crossings", driver="GPKG")
    p = pdal.Pipeline(json.dumps({"pipeline": [
        str(src),
        {"type": "filters.ferry", "dimensions": "=>CrossingId"},
        {"type": "filters.overlay", "dimension": "CrossingId", "datasource": str(gpkg),
         "layer": "crossings", "column": "CrossingId"},
    ]}))
    p.execute()
    a = p.arrays[0]
    ground = a["Classification"] == 2
    deck_total = 0
    for row in xing.itertuples():
        inside = a["CrossingId"] == row.CrossingId
        bank_zone = row.geometry.buffer(20.0).difference(row.geometry)
        minx, miny, maxx, maxy = bank_zone.bounds
        near = ground & ~inside & (a["X"] > minx) & (a["X"] < maxx) & (a["Y"] > miny) & (a["Y"] < maxy)
        if near.sum() < 20:
            continue
        banks = LinearNDInterpolator(np.column_stack([a["X"][near], a["Y"][near]]), a["Z"][near])
        cand = inside & ground
        terrain = banks(a["X"][cand], a["Y"][cand])
        deck = np.zeros(len(a), dtype=bool)
        deck[np.nonzero(cand)[0]] = np.nan_to_num(a["Z"][cand] - terrain, nan=0.0) > min_clear
        a["Classification"][deck] = 17
        deck_total += int(deck.sum())
    pdal.Writer.las(filename=str(dst), minor_version=4, dataformat_id=6,
                    forward="all").pipeline(a).execute()
    return deck_total


if __name__ == "__main__":
    roads = gpd.read_file("roads.gpkg").to_crs("EPSG:6341")
    water = gpd.read_file("water.gpkg").to_crs("EPSG:6341")
    xing = crossings(roads, water)
    n = classify_decks(Path("valley_0310_water.laz"), Path("valley_0310_bridges.laz"), xing)
    print(f"{len(xing)} crossings, {n} deck points reclassified to 17")
```

Using the bank ring rather than all ground points is the key design choice: ground points inside the crossing include the deck itself, which would make the terrain estimate follow the deck and find nothing.

## Key Parameter Table

| Parameter | Type | Default | Guidance |
|---|---|---|---|
| approach extension | float, m | 15 | Beyond the water edge along the road; long enough to include abutments |
| lateral buffer | float, m | width/2 + 2 | Covers parapets and sidewalks |
| bank ring | float, m | 20 | Width of the ring sampled for terrain beneath |
| `min_clear` | float, m | 1.5 | Deck height above terrain; lower for culverts, higher to avoid embankments |
| minimum bank points | int | 20 | Skip crossings where the interpolator would be unreliable |

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Plan view of a road crossing a river with the crossing polygon and bank ring" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Where the geometry says a bridge can be</title>
  <desc>Plan view. A river runs diagonally. A road crosses it horizontally. The crossing polygon is a rectangle along the road extending 15 metres beyond each bank. Around it, a ring 20 metres wide excluding the road samples bank ground points used to interpolate the terrain beneath the deck.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <path d="M300 10 L420 10 L480 200 L360 200 Z" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.2"/>
  <rect x="200" y="60" width="380" height="90" rx="6" fill="none" stroke="var(--dg-d)" stroke-width="1.4" stroke-dasharray="6 4"/>
  <line x1="20" y1="105" x2="720" y2="105" stroke="var(--dg-line)" stroke-width="10"/>
  <rect x="250" y="88" width="280" height="34" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.4"/>
  <text x="390" y="110" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">crossing polygon</text>
  <text x="212" y="54" font-size="10.5" fill="var(--dg-d)">bank ring sampled for terrain</text>
  <text x="520" y="190" font-size="10.5" fill="var(--dg-b)">river</text>
  <text x="40" y="94" font-size="10.5" fill="var(--dg-muted)">road</text>
</svg>

## Verification

- **Every crossing opened.** Profile the rebuilt DTM along the water centreline through each crossing; it should descend smoothly with no bump under the bridge.
- **Deck counts plausible.** A two-lane bridge 30 m long at 15 pts/m² holds roughly 5,000 deck points. Crossings with a handful of deck points are probably culverts or false positives.
- **Approaches untouched.** Class 17 points should not extend more than a few metres beyond the water edge along the road.

```python
check = pdal.Pipeline(json.dumps({"pipeline": [
    "valley_0310_bridges.laz", {"type": "filters.range", "limits": "Classification[17:17]"}]}))
print("deck points:", check.execute())
```

## Gotchas and Edge Cases

**Culverts.** A road over a culvert has no gap beneath it; the ground really is continuous. Deck height tests correctly leave culverts as ground, but some specifications want a breakline or a channel cut through them in the DTM. That is a hydro-enforcement step, separate from classification.

**Overpasses above roads.** The terrain beneath an overpass is the lower road, which has its own ground points inside the crossing polygon. Use the lower road's points as the reference surface, or restrict the deck test to points above the lower road by more than a vehicle height.

**Missing or misaligned road data.** Community road data can be offset by several metres. Buffer generously and rely on the height test to reject points that are not deck.

<svg viewBox="0 30 740 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A culvert crossing where the road is continuous with the ground below" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Culverts are not bridges</title>
  <desc>A profile of a road embankment with a small pipe culvert beneath it. The road surface is continuous with the embankment and less than 1.5 metres above the interpolated bank terrain, so the height test leaves it as ground. A note says hydro-enforcement, not reclassification, is the fix for drainage through culverts.</desc>
  <rect x="0" y="30" width="740" height="150" fill="var(--dg-bg)" rx="10"/>
  <path d="M20 120 L240 120 L300 60 L440 60 L500 120 L720 120" fill="var(--dg-surface-2)" stroke="var(--dg-line)" stroke-width="1.4"/>
  <circle cx="370" cy="108" r="12" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.4"/>
  <text x="370" y="50" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">road on embankment: stays class 2</text>
  <text x="392" y="140" font-size="10.5" fill="var(--dg-b)">culvert pipe</text>
  <text x="20" y="166" font-size="10.5" fill="var(--dg-muted)">drainage through the culvert needs a channel burned into the DTM, not a class change</text>
</svg>

**Wide multi-span bridges.** Piers inside the river are real ground-level structures. Leave points on piers unclassified or classify them to class 19 or 17 according to your specification, but never to ground.

## Frequently Asked Questions

**Why do ground filters classify bridges as ground?**

Ground filters look for the lowest continuous surface, and a deck is continuous with the road on both approaches. Unless the span is long compared with the filter's window, the filter cannot tell the deck from terrain.

**What ASPRS class is used for bridge decks?**

Class 17, bridge deck, defined in LAS 1.4. Points on the deck surface, including vehicles if not otherwise classified, typically go into this class so they can be excluded from the bare-earth DTM.

**Do I need road data to find bridges?**

It is not strictly required, but it makes detection far more reliable. Without it, bridges must be inferred from elevated flat surfaces spanning low ground, which also matches embankments, dams and some buildings.

**What about overpasses that do not cross water?**

Intersect roads with other roads and railways as well as water. The terrain beneath is the lower road, so use its points as the reference surface.

## Related

- [Water and Bridge Classification](https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/) — the full hydrologic workflow
- [Hydro-Flattening Water Bodies in a DTM](https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/hydro-flattening-water-bodies-in-a-dtm/) — flattening the river once decks are removed
- [Classifying Water from Intensity and Returns](https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/classifying-water-from-intensity-and-returns/) — the water polygons used here
- [Assigning Classification with Conditional filters.assign](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/assigning-classification-with-conditional-filters-assign/) — WHERE-clause reclassification
- [SMRF vs PMF for Dense Urban LiDAR](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/smrf-vs-pmf-for-dense-urban-lidar/) — why ground filters struggle with bridges
