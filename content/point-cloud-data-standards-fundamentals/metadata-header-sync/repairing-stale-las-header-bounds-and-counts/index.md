---
title: "Repairing Stale LAS Header Bounds and Counts"
description: "Detect and fix LAS headers whose point counts, returns-by-number counts and min/max bounds no longer match the points: comparing header to data with laspy, rewriting with update_header or PDAL, and why tile indexes and viewers break on stale headers."
slug: "repairing-stale-las-header-bounds-and-counts"
type: "howto"
breadcrumb: "Repairing Stale Headers"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Repairing Stale LAS Header Bounds and Counts",
      "description": "Detect and fix LAS headers whose point counts, returns-by-number counts and min/max bounds no longer match the points: comparing header to data with laspy, rewriting with update_header or PDAL, and why tile indexes and viewers break on stale headers.",
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
          "name": "Metadata & Header Sync",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/metadata-header-sync/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Repairing Stale Headers",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/metadata-header-sync/repairing-stale-las-header-bounds-and-counts/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Detect and repair stale LAS header bounds and counts",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Read the header values",
          "text": "laspy.open(path).header gives point_count, number_of_points_by_return, mins and maxs without reading points."
        },
        {
          "@type": "HowToStep",
          "name": "Compute the true values",
          "text": "Read the points and compute the count, a histogram of return_number, and the minima and maxima of scaled X, Y, Z."
        },
        {
          "@type": "HowToStep",
          "name": "Compare with tolerances",
          "text": "Counts must match exactly. Bounds should match to within one scale unit \u2014 the header stores doubles, the points are quantized."
        },
        {
          "@type": "HowToStep",
          "name": "Repair",
          "text": "las.update_header() recomputes every summary field on the in-memory object; las.write(new_path) writes a consistent file. PDAL's pdal translate achieves the same."
        },
        {
          "@type": "HowToStep",
          "name": "Re-index",
          "text": "Rebuild any tile index or footprint layer that was made from the stale headers."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How do I fix the bounds in a LAS header?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Read the file with laspy, call update_header to recompute counts and bounds from the points, and write a new file. Alternatively pass the file through PDAL with pdal translate, which writes a header computed from the data."
          }
        },
        {
          "@type": "Question",
          "name": "Why does my tile index show the wrong footprint?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Tile indexes and footprint tools often use header bounds rather than reading points. If a file was cropped or edited without updating its header, the index shows the old extent. Repair the headers and rebuild the index."
          }
        },
        {
          "@type": "Question",
          "name": "Does PDAL always write correct header counts?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. writers.las computes counts and bounds from the points it writes, even when forwarding other header fields from the source."
          }
        },
        {
          "@type": "Question",
          "name": "How much tolerance should I allow on bounds?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "One scale unit per axis. The header stores bounds as doubles while points are stored as quantized integers, so a tiny difference is normal; anything larger means the header is stale."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Read the file with laspy, compare `header.point_count`, `header.number_of_points_by_return`, `header.mins` and `header.maxs` against values computed from the points, and if any differ, call `las.update_header()` and write a new file — or simply pass the file through PDAL (`pdal translate in.laz out.laz`), which always writes a header computed from the data.

## Context and Motivation

This guide is part of [Metadata and Header Sync](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/metadata-header-sync/). A LAS header summarizes its points: how many there are, how many are first, second and later returns, and the bounding box. Many tools trust those numbers instead of reading the data. A tile index built with `pdal tindex` or a GIS footprint layer uses the bounds; viewers use the count to allocate memory and the bounds to frame the view; QA scripts compare counts against expectations. When a file has been edited in place by a tool that did not update the header — a custom script that dropped points, a crop that left the old bounds, a merge that summed counts wrongly — every one of those consumers is quietly wrong.

Detecting a stale header costs one read; repairing it costs one write. It is worth doing on every file received from outside a trusted pipeline.

<svg viewBox="30 0 580 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A stale header bounding box larger than the actual data extent" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>A header that describes a different file</title>
  <desc>A plan view of a tile. The header bounds, drawn as a dashed rectangle, still describe the original 1 kilometre tile. The actual points, drawn as a shaded polygon, cover only a cropped corner. A tile index built from the header would claim the whole square, and a spatial query in the empty part would open this file for nothing.</desc>
  <rect x="30" y="0" width="580" height="210" fill="var(--dg-bg)" rx="10"/>
  <path d="M60 20 h300 v170 h-300 Z" fill="none" stroke="var(--dg-e)" stroke-width="1.6" stroke-dasharray="6 4"/>
  <path d="M60 90 L200 90 L240 150 L240 190 L60 190 Z" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.5"/>
  <text x="70" y="40" font-size="10.5" fill="var(--dg-e)">header bounds (original tile)</text>
  <text x="140" y="146" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">actual points</text>
  <text x="400" y="60" font-size="11" fill="var(--dg-text)">header count: 41,812,330</text>
  <text x="400" y="84" font-size="11" fill="var(--dg-text)">actual count: 9,204,117</text>
  <text x="400" y="124" font-size="10.5" fill="var(--dg-muted)">tile indexes, viewers and QA scripts</text>
  <text x="400" y="142" font-size="10.5" fill="var(--dg-muted)">that trust the header are all wrong</text>
</svg>

## Prerequisites and Assumptions

- laspy 2.x (with a LAZ backend) or PDAL.
- Files small enough to read, or a willingness to use chunked reading for very large files.
- Write access to a new location; repair by writing a new file, never by patching bytes in place.

## Step-by-Step Implementation

### Step 1 — Read the header values

`laspy.open(path).header` gives `point_count`, `number_of_points_by_return`, `mins` and `maxs` without reading points.

### Step 2 — Compute the true values

Read the points and compute the count, a histogram of `return_number`, and the minima and maxima of scaled X, Y, Z.

### Step 3 — Compare with tolerances

Counts must match exactly. Bounds should match to within one scale unit — the header stores doubles, the points are quantized.

### Step 4 — Repair

`las.update_header()` recomputes every summary field on the in-memory object; `las.write(new_path)` writes a consistent file. PDAL's `pdal translate` achieves the same.

### Step 5 — Re-index

Rebuild any tile index or footprint layer that was made from the stale headers.

## Complete Working Example

```python
"""Detect and repair stale LAS/LAZ headers for a folder of tiles."""
from __future__ import annotations

from pathlib import Path

import laspy
import numpy as np


def header_problems(path: Path) -> list[str]:
    las = laspy.read(path)
    h = las.header
    probs = []
    n = len(las.points)
    if h.point_count != n:
        probs.append(f"point_count {h.point_count} != {n}")
    by_return = np.bincount(las.return_number, minlength=16)[1:len(h.number_of_points_by_return) + 1]
    if not np.array_equal(np.asarray(h.number_of_points_by_return), by_return):
        probs.append("number_of_points_by_return does not match data")
    actual_min = np.array([las.x.min(), las.y.min(), las.z.min()])
    actual_max = np.array([las.x.max(), las.y.max(), las.z.max()])
    tol = np.asarray(h.scales)
    if np.any(np.abs(np.asarray(h.mins) - actual_min) > tol) or \
       np.any(np.abs(np.asarray(h.maxs) - actual_max) > tol):
        probs.append(f"bounds differ: header {np.round(h.mins, 2)}–{np.round(h.maxs, 2)}, "
                     f"data {np.round(actual_min, 2)}–{np.round(actual_max, 2)}")
    return probs


def repair(path: Path, out_dir: Path) -> Path:
    las = laspy.read(path)
    las.update_header()
    out = out_dir / path.name
    las.write(out)
    return out


if __name__ == "__main__":
    out_dir = Path("repaired")
    out_dir.mkdir(exist_ok=True)
    for tile in sorted(Path("received").glob("*.la[sz]")):
        problems = header_problems(tile)
        if problems:
            fixed = repair(tile, out_dir)
            print(f"REPAIRED {tile.name}: " + "; ".join(problems))
            assert not header_problems(fixed), f"{fixed} still inconsistent"
        else:
            print(f"ok       {tile.name}")
```

The PDAL route, useful in shell scripts and for files too large to read whole with laspy:

```bash
pdal translate received/t_0431.laz repaired/t_0431.laz --writers.las.forward=all
```

`forward=all` keeps the original scales, offsets, IDs and VLRs; PDAL still computes counts and bounds from the points it writes.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Header fields and how each is checked against the data" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Four header fields, four checks</title>
  <desc>A table of four header fields. Point count is checked by exact equality with the number of points. Points by return is checked by exact equality with a histogram of return numbers. Minimum and maximum bounds are checked against the data extremes within one scale unit, because the header stores doubles while points are quantized integers.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <g font-size="10.5" fill="var(--dg-text)">
    <rect x="20" y="20" width="700" height="36" fill="var(--dg-surface-2)"/><text x="40" y="43">point_count</text><text x="300" y="43">== len(points)</text><text x="540" y="43">exact</text>
    <rect x="20" y="60" width="700" height="36" fill="var(--dg-surface)"/><text x="40" y="83">number_of_points_by_return</text><text x="300" y="83">== bincount(return_number)</text><text x="540" y="83">exact</text>
    <rect x="20" y="100" width="700" height="36" fill="var(--dg-surface-2)"/><text x="40" y="123">mins (x, y, z)</text><text x="300" y="123">≈ min of scaled coordinates</text><text x="540" y="123">± one scale unit</text>
    <rect x="20" y="140" width="700" height="36" fill="var(--dg-surface)"/><text x="40" y="163">maxs (x, y, z)</text><text x="300" y="163">≈ max of scaled coordinates</text><text x="540" y="163">± one scale unit</text>
  </g>
  <text x="20" y="194" font-size="10.5" fill="var(--dg-muted)">LAS 1.4 also has 64-bit legacy and extended count fields; laspy and PDAL keep both in step</text>
</svg>

## Making the Check Part of Ingest

The cheapest place to catch a stale header is the moment data arrives, before anything downstream has trusted it. A small ingest step that runs `header_problems` on every received file, repairs what it can and logs the rest turns a class of subtle downstream bugs into a line in an ingest report.

Three habits make that step reliable. First, keep received files untouched in a raw area and write repaired copies elsewhere, so the original evidence is always available if a vendor disputes a finding. Second, record what was repaired — file, field, old value, new value — in a machine-readable log; a vendor whose headers are routinely stale is worth a conversation. Third, run the check again on your own outputs at the end of processing. Stale headers are not only a vendor problem: any in-house script that writes LAS with a hand-built header can produce them, and an ingest-style check on outputs catches your own mistakes before a client does.

For large deliveries, the check parallelizes trivially across files. Combined with the output checks in [checking pipeline output with pdal info --stats](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/checking-pipeline-output-with-pdal-info-stats/), it gives a complete picture of file health in a few minutes per thousand tiles.

## Key Parameter Table

| Field | Where | Check | Repair |
|---|---|---|---|
| `point_count` | header | exact | `update_header()` / PDAL write |
| `number_of_points_by_return` | header | exact | same |
| `mins`, `maxs` | header | ± scale | same |
| `scales`, `offsets` | header | not a summary | keep (use `forward`) |
| legacy count fields (1.4) | header | consistent with extended | written by laspy and PDAL |
| VLR CRS | VLRs | not a summary | keep, or fix separately |

## Verification

- **Re-check after repair**, as the example does with an assertion.
- **Rebuild the tile index** and compare footprints before and after; repaired tiles typically shrink.
- **Spot-check in a viewer**: the view should frame the data tightly after repair.

## Gotchas and Edge Cases

**Bounds from unscaled values.** Computing bounds from raw integers (`las.X`) instead of scaled coordinates (`las.x`) gives nonsense comparisons. Use the lower-case fields.

**Returns beyond five.** LAS 1.4 formats support up to 15 returns per pulse; the extended by-return array has 15 entries. Compare the full array for PDRF 6–10.

**Very large files.** laspy's full read may not fit. Compute counts and bounds with `chunk_iterator`, and repair with PDAL, which streams.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Where stale headers usually come from" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>How headers go stale</title>
  <desc>Three sources of stale headers feeding one inconsistent file: a custom script that removed points by rewriting records without updating the header, a crop done by a tool that copied the original header, and a naive concatenation of files that summed counts but kept the first file's bounds.</desc>
  <defs><marker id="st-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <g font-size="10.5" fill="var(--dg-text)">
    <rect x="20" y="20" width="220" height="36" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="130" y="43">script dropped points</text>
    <rect x="20" y="66" width="220" height="36" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="130" y="89">crop copied old header</text>
    <rect x="20" y="112" width="220" height="36" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="130" y="135">naive concatenation</text>
    <rect x="460" y="62" width="260" height="44" rx="8" fill="var(--dg-e-soft)" stroke="var(--dg-e)"/><text text-anchor="middle" x="590" y="89">stale header</text>
  </g>
  <line x1="240" y1="38" x2="456" y2="78" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#st-arw)"/>
  <line x1="240" y1="84" x2="456" y2="84" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#st-arw)"/>
  <line x1="240" y1="130" x2="456" y2="90" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#st-arw)"/>
</svg>

**Do not patch bytes.** Editing header fields in place with a binary patch is possible but fragile, especially for LAZ where the header precedes compressed chunks. Writing a new file is safer and cheap.

## Frequently Asked Questions

**How do I fix the bounds in a LAS header?**

Read the file with laspy, call update_header to recompute counts and bounds from the points, and write a new file. Alternatively pass the file through PDAL with pdal translate, which writes a header computed from the data.

**Why does my tile index show the wrong footprint?**

Tile indexes and footprint tools often use header bounds rather than reading points. If a file was cropped or edited without updating its header, the index shows the old extent. Repair the headers and rebuild the index.

**Does PDAL always write correct header counts?**

Yes. writers.las computes counts and bounds from the points it writes, even when forwarding other header fields from the source.

**How much tolerance should I allow on bounds?**

One scale unit per axis. The header stores bounds as doubles while points are stored as quantized integers, so a tiny difference is normal; anything larger means the header is stale.

## Related

- [Metadata and Header Sync](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/metadata-header-sync/) — keeping metadata consistent
- [Converting GPS Week Time to Adjusted Standard Time](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/metadata-header-sync/converting-gps-week-time-to-adjusted-standard-time/) — another header-level fix
- [Building a Tile Index with pdal tindex](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/building-a-tile-index-with-pdal-tindex/) — what stale headers break
- [Checking Pipeline Output with pdal info --stats](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/checking-pipeline-output-with-pdal-info-stats/) — catching mismatches automatically
- [How to Parse LAS Headers with Python](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/how-to-parse-las-headers-with-python/) — header fields in detail
