---
title: "Copying Dimensions with filters.ferry"
description: "Use PDAL filters.ferry to copy one dimension into another, create empty dimensions for later stages, back up Z or Classification before overwriting them, and produce height-normalized point clouds by ferrying HeightAboveGround into Z."
slug: "copying-dimensions-with-filters-ferry"
type: "howto"
breadcrumb: "filters.ferry"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Copying Dimensions with filters.ferry",
      "description": "Use PDAL filters.ferry to copy one dimension into another, create empty dimensions for later stages, back up Z or Classification before overwriting them, and produce height-normalized point clouds by ferrying HeightAboveGround into Z.",
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
          "name": "Attribute Mapping",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "filters.ferry",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/copying-dimensions-with-filters-ferry/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Copy and create dimensions with PDAL filters.ferry",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Write mappings as source=>destination",
          "text": "Several mappings go in one comma-separated string and are applied left to right, so Z=>Elevation, HeightAboveGround=>Z backs up Z before overwriting it."
        },
        {
          "@type": "HowToStep",
          "name": "Create empty dimensions where stages expect them",
          "text": "filters.overlay writes into an existing dimension. \"=>BuildingId\" creates it first."
        },
        {
          "@type": "HowToStep",
          "name": "Back up before destructive stages",
          "text": "Before filters.smrf, filters.pmf or a filters.assign that rewrites classes, ferry Classification to a backup so you can compare or restore."
        },
        {
          "@type": "HowToStep",
          "name": "Normalize heights for downstream tools",
          "text": "Ferry HeightAboveGround into Z before writers.gdal for a canopy height model, before filters.litree for tree segmentation, or before writing a normalized LAZ for software that expects heights in Z."
        },
        {
          "@type": "HowToStep",
          "name": "Write the extra dimensions you want to keep",
          "text": "A ferried backup only reaches the output file if the writer includes it via extra_dims."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What does filters.ferry do?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It copies the values of one dimension into another, creating the destination if it does not exist, or creates an empty dimension when no source is given. The source dimension is left unchanged."
          }
        },
        {
          "@type": "Question",
          "name": "How do I make a height-normalized point cloud in PDAL?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Compute HeightAboveGround with a HAG filter, then ferry Z into a backup dimension and HeightAboveGround into Z in one ferry stage, in that order. Write the backup with extra_dims if you want to keep original elevations."
          }
        },
        {
          "@type": "Question",
          "name": "Why create an empty dimension with ferry?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Some stages, such as filters.overlay, write into an existing dimension rather than creating one. Ferry with an empty source creates the dimension, initialized to zero, so the next stage has somewhere to write."
          }
        },
        {
          "@type": "Question",
          "name": "Does filters.ferry work in streaming mode?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. It copies values point by point and streams, adding negligible time and only the memory of the new dimensions."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** `{"type": "filters.ferry", "dimensions": "Z=>Elevation, HeightAboveGround=>Z"}` copies `Z` into a new `Elevation` dimension and then `HeightAboveGround` into `Z` — a height-normalized cloud that keeps its original elevations. `"=>NewDim"` with nothing on the left creates an empty dimension that a later stage such as `filters.overlay` can fill. Ferry copies; it never deletes the source.

## Context and Motivation

This guide is part of [Attribute Mapping in PDAL Pipelines](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/). Many PDAL stages read or write a fixed dimension: `writers.gdal` rasterizes `Z` by default, `filters.covariancefeatures` always writes `Planarity`, `filters.smrf` writes `Classification`. `filters.ferry` is the small adapter that makes those fixed names work for you. It lets you point a stage at a different dimension by copying it into the name the stage expects, keep a backup before a stage overwrites something, and create empty dimensions for stages that fill existing ones rather than creating their own.

It is also one of the cheapest stages in PDAL — a per-point copy that streams — so there is no reason to avoid it for clarity.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The three uses of filters.ferry" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Copy, back up, create</title>
  <desc>Three rows. Copy: HeightAboveGround is copied into Z so writers.gdal rasterizes heights. Back up: Classification is copied into OriginalClass before SMRF overwrites Classification. Create: an empty WaterId dimension is created so filters.overlay has a dimension to fill.</desc>
  <defs><marker id="fer-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="46" font-size="11" font-weight="600" fill="var(--dg-text)">copy</text>
  <rect x="100" y="26" width="180" height="32" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line)"/>
  <text x="190" y="47" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">HeightAboveGround</text>
  <rect x="340" y="26" width="120" height="32" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/>
  <text x="400" y="47" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">Z</text>
  <text x="490" y="47" font-size="10.5" fill="var(--dg-muted)">writers.gdal now rasterizes height</text>
  <line x1="280" y1="42" x2="336" y2="42" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#fer-arw)"/>
  <text x="20" y="116" font-size="11" font-weight="600" fill="var(--dg-text)">back up</text>
  <rect x="100" y="96" width="180" height="32" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line)"/>
  <text x="190" y="117" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">Classification</text>
  <rect x="340" y="96" width="120" height="32" rx="6" fill="var(--dg-b-soft)" stroke="var(--dg-b)"/>
  <text x="400" y="117" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">OriginalClass</text>
  <text x="490" y="117" font-size="10.5" fill="var(--dg-muted)">survives SMRF's overwrite</text>
  <line x1="280" y1="112" x2="336" y2="112" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#fer-arw)"/>
  <text x="20" y="186" font-size="11" font-weight="600" fill="var(--dg-text)">create</text>
  <rect x="100" y="166" width="180" height="32" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-dasharray="4 3"/>
  <text x="190" y="187" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">(nothing)</text>
  <rect x="340" y="166" width="120" height="32" rx="6" fill="var(--dg-c-soft)" stroke="var(--dg-c)"/>
  <text x="400" y="187" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">WaterId = 0</text>
  <text x="490" y="187" font-size="10.5" fill="var(--dg-muted)">ready for filters.overlay</text>
  <line x1="280" y1="182" x2="336" y2="182" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#fer-arw)"/>
</svg>

## Prerequisites and Assumptions

- PDAL 2.x.
- Source dimensions must exist at the point the ferry stage runs; a new dimension created with `=>Name` is a double initialized to zero.
- For height normalization, `HeightAboveGround` from `filters.hag_nn`, `filters.hag_delaunay` or `filters.hag_dem` upstream.

## Step-by-Step Implementation

### Step 1 — Write mappings as source=>destination

Several mappings go in one comma-separated string and are applied left to right, so `Z=>Elevation, HeightAboveGround=>Z` backs up Z before overwriting it.

### Step 2 — Create empty dimensions where stages expect them

`filters.overlay` writes into an existing dimension. `"=>BuildingId"` creates it first.

### Step 3 — Back up before destructive stages

Before `filters.smrf`, `filters.pmf` or a `filters.assign` that rewrites classes, ferry `Classification` to a backup so you can compare or restore.

### Step 4 — Normalize heights for downstream tools

Ferry `HeightAboveGround` into `Z` before `writers.gdal` for a canopy height model, before `filters.litree` for tree segmentation, or before writing a normalized LAZ for software that expects heights in Z.

### Step 5 — Write the extra dimensions you want to keep

A ferried backup only reaches the output file if the writer includes it via `extra_dims`.

## Complete Working Example

A height-normalized LAZ that keeps original elevations and original classes, plus a CHM raster, in one pipeline:

```json
{
  "pipeline": [
    "tiles/t_0431.laz",
    { "type": "filters.range", "limits": "Classification![7:7],Classification![18:18]" },
    { "type": "filters.ferry", "dimensions": "Classification=>VendorClass" },
    { "type": "filters.smrf", "slope": 0.15, "window": 18, "threshold": 0.5 },
    { "type": "filters.hag_nn", "count": 2 },
    { "type": "filters.ferry", "dimensions": "Z=>Elevation, HeightAboveGround=>Z", "tag": "normalized" },
    { "type": "writers.las", "inputs": ["normalized"], "filename": "out/t_0431_normalized.laz",
      "minor_version": 4, "dataformat_id": 6,
      "extra_dims": "Elevation=double,VendorClass=uint8" },
    { "type": "filters.range", "inputs": ["normalized"], "limits": "Z[0:70]" },
    { "type": "writers.gdal", "filename": "out/t_0431_chm.tif", "resolution": 0.5,
      "radius": 0.75, "output_type": "max", "data_type": "float32" }
  ]
}
```

A Python check that the ferry did what it claims:

```python
import json

import numpy as np
import pdal

p = pdal.Pipeline(json.dumps({"pipeline": ["out/t_0431_normalized.laz"]}))
p.execute()
a = p.arrays[0]
ground = a["Classification"] == 2
print("ground Z (should be ~0):", np.round(np.percentile(a["Z"][ground], [5, 50, 95]), 3))
print("elevation range kept:", a["Elevation"].min().round(2), "to", a["Elevation"].max().round(2))
changed = (a["VendorClass"] != a["Classification"]).mean()
print(f"classes changed by SMRF: {changed:.1%}")
```

Ground points should have `Z` near zero after normalization; original elevations survive in `Elevation`; and the vendor's classes are preserved alongside SMRF's for comparison.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A hillside profile before and after ferrying height above ground into Z" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Terrain removed, objects kept</title>
  <desc>Left: a hillside profile in raw elevation with trees on the slope; tree tops rise with the terrain. Right: the same points after ferrying HeightAboveGround into Z; the ground is flat at zero and trees of equal height have equal tops.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <text x="185" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">Z = elevation</text>
  <text x="555" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">Z = height above ground</text>
  <line x1="30" y1="170" x2="340" y2="70" stroke="var(--dg-line)" stroke-width="1.6"/>
  <g stroke="var(--dg-d)" stroke-width="2"><line x1="90" y1="151" x2="90" y2="111"/><line x1="190" y1="118" x2="190" y2="78"/><line x1="290" y1="86" x2="290" y2="46"/></g>
  <g fill="var(--dg-d)"><circle cx="90" cy="108" r="8"/><circle cx="190" cy="75" r="8"/><circle cx="290" cy="43" r="8"/></g>
  <line x1="400" y1="170" x2="710" y2="170" stroke="var(--dg-line)" stroke-width="1.6"/>
  <g stroke="var(--dg-d)" stroke-width="2"><line x1="460" y1="170" x2="460" y2="130"/><line x1="560" y1="170" x2="560" y2="130"/><line x1="660" y1="170" x2="660" y2="130"/></g>
  <g fill="var(--dg-d)"><circle cx="460" cy="127" r="8"/><circle cx="560" cy="127" r="8"/><circle cx="660" cy="127" r="8"/></g>
  <text x="555" y="192" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">ground at 0; equal trees, equal tops</text>
</svg>

## Ferry Versus Doing It in NumPy

Everything ferry does could be done in Python after `pipeline.arrays`: copy a column, add a field with `numpy.lib.recfunctions.append_fields`, write the array back with a writer. For interactive work that is fine. In production pipelines, ferry is better for three reasons.

First, it keeps the operation inside PDAL's execution, which means it streams, needs no Python copy of the point table, and works in the command-line tool as well as the bindings. A normalized-height LAZ for a 90-million-point tile is a single `pdal pipeline` call instead of a script that has to hold the tile in memory.

Second, it puts the intent in the pipeline JSON. A reviewer reading `"Z=>Elevation, HeightAboveGround=>Z"` knows exactly what the output's Z means without opening any Python.

Third, it composes with tags and branches. The example writes a normalized LAZ and a CHM from one ferry stage; doing the same in Python would mean either two reads or a second pipeline fed from arrays. Reach for NumPy when the transformation is genuinely computational — a scaled intensity, a derived index — and for ferry whenever the job is simply moving values between names.

## Key Parameter Table

| Mapping | Effect | Typical use |
|---|---|---|
| `A=>B` | Copy A into B, creating B if needed | Rename for a stage that expects B |
| `=>B` | Create B as zeros | Target for `filters.overlay` |
| `A=>B, C=>A` | Back up A, then overwrite it with C | Height normalization |
| `Classification=>X` | Snapshot classes | Before SMRF, PMF, assign |
| writer `extra_dims` | `B=type` | Persist ferried dimensions |

## Verification

- **Schema contains the new names.** `pdal info --schema` on the output lists every ferried dimension you asked the writer to keep.
- **Values copied exactly.** Before any later stage touches them, the source and destination must be equal point for point.
- **Normalized ground at zero.** For height normalization, the median `Z` of ground points should be within a few centimetres of zero.

## Gotchas and Edge Cases

**Order within the string matters.** `HeightAboveGround=>Z, Z=>Elevation` overwrites Z first and then copies the new Z into Elevation — losing the original elevations. Back up first.

**Types of new dimensions.** A dimension created by ferry is a double. When writing, declare a smaller type in `extra_dims` if precision allows; eight bytes per point per dimension adds up.

**Ferry is not rename.** The source dimension remains. If a later stage should not see it, that is fine — unused dimensions cost only memory — but do not expect ferry to remove it.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Two orderings of the same ferry mappings with different results" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Back up first, then overwrite</title>
  <desc>Two sequences applied to a point with elevation 212.4 and height above ground 18.3. Backing up first stores 212.4 in Elevation and then sets Z to 18.3. Overwriting first sets Z to 18.3 and then copies 18.3 into Elevation, losing the original elevation.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="20" width="340" height="130" rx="9" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="36" y="44" font-size="11" font-weight="600" fill="var(--dg-text)">Z=&gt;Elevation, HeightAboveGround=&gt;Z</text>
  <text x="36" y="74" font-size="10.5" fill="var(--dg-text)">Elevation = 212.4</text>
  <text x="36" y="96" font-size="10.5" fill="var(--dg-text)">Z = 18.3</text>
  <text x="36" y="128" font-size="10.5" fill="var(--dg-text)">original elevation kept</text>
  <rect x="380" y="20" width="340" height="130" rx="9" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="396" y="44" font-size="11" font-weight="600" fill="var(--dg-text)">HeightAboveGround=&gt;Z, Z=&gt;Elevation</text>
  <text x="396" y="74" font-size="10.5" fill="var(--dg-text)">Z = 18.3</text>
  <text x="396" y="96" font-size="10.5" fill="var(--dg-text)">Elevation = 18.3</text>
  <text x="396" y="128" font-size="10.5" fill="var(--dg-e)">original elevation lost</text>
</svg>

**Reprojection after normalization.** Once Z holds heights, a vertical datum transformation would corrupt them. Reproject before normalizing, never after.

## Frequently Asked Questions

**What does filters.ferry do?**

It copies the values of one dimension into another, creating the destination if it does not exist, or creates an empty dimension when no source is given. The source dimension is left unchanged.

**How do I make a height-normalized point cloud in PDAL?**

Compute HeightAboveGround with a HAG filter, then ferry Z into a backup dimension and HeightAboveGround into Z in one ferry stage, in that order. Write the backup with extra_dims if you want to keep original elevations.

**Why create an empty dimension with ferry?**

Some stages, such as filters.overlay, write into an existing dimension rather than creating one. Ferry with an empty source creates the dimension, initialized to zero, so the next stage has somewhere to write.

**Does filters.ferry work in streaming mode?**

Yes. It copies values point by point and streams, adding negligible time and only the memory of the new dimensions.

## Related

- [Attribute Mapping in PDAL Pipelines](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/) — dimensions and their types
- [Assigning Classification with Conditional filters.assign](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/assigning-classification-with-conditional-filters-assign/) — changing values rather than copying them
- [Mapping Custom Attributes in PDAL Pipelines](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/mapping-custom-attributes-in-pdal-pipelines/) — extra bytes and custom dimensions
- [Rasterizing a Canopy Height Model from HAG](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/rasterizing-a-canopy-height-model-from-hag/) — the CHM branch in depth
- [Computing Geometric Features for Classification](https://www.pythonlidar.com/lidar-classification-feature-extraction/machine-learning-point-classification/computing-geometric-features-for-classification/) — ferry to keep two feature scales
