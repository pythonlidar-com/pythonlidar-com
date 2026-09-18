---
title: "Counting Points per Class with PDAL"
description: "Produce classification histograms for LAS/LAZ tiles and whole projects: pdal info with --enumerate, NumPy bincount on pipeline arrays, streaming counts for huge files, per-class shares with ASPRS names, and a project-wide table for QA reports."
slug: "counting-points-per-class-with-pdal"
type: "howto"
breadcrumb: "Counting Points per Class"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Counting Points per Class with PDAL",
      "description": "Produce classification histograms for LAS/LAZ tiles and whole projects: pdal info with --enumerate, NumPy bincount on pipeline arrays, streaming counts for huge files, per-class shares with ASPRS names, and a project-wide table for QA reports.",
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
          "name": "Counting Points per Class",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/counting-points-per-class-with-pdal/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Count LiDAR points per ASPRS class with PDAL",
      "step": [
        {
          "@type": "HowToStep",
          "name": "List classes present",
          "text": "pdal info --stats --enumerate Classification computes statistics and reports the distinct classification values. It reads every point but needs no code."
        },
        {
          "@type": "HowToStep",
          "name": "Count with bincount",
          "text": "A reader-only pipeline returns an array; np.bincount(a[\"Classification\"], minlength=256) counts every class in one vectorized call."
        },
        {
          "@type": "HowToStep",
          "name": "Stream for large files",
          "text": "pipeline.iterator(chunk_size=2_000_000) yields chunks; summing bincount across them gives exact counts in bounded memory."
        },
        {
          "@type": "HowToStep",
          "name": "Add names and shares",
          "text": "Join counts to a dictionary of ASPRS class names and divide by the total."
        },
        {
          "@type": "HowToStep",
          "name": "Aggregate a project",
          "text": "Run over every tile, keep per-tile rows for QA and sum for the project total."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How do I count points by classification in a LAS file?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Read the file with a PDAL pipeline and apply NumPy's bincount to the Classification array, with minlength 256 so every code has a slot. For large files, sum bincount over chunks from the pipeline iterator."
          }
        },
        {
          "@type": "Question",
          "name": "How do I list the classes present with the PDAL command line?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run pdal info with the stats flag and enumerate Classification. The output includes the distinct classification values found in the file."
          }
        },
        {
          "@type": "Question",
          "name": "What share of points should be ground?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It depends on land cover. Open agricultural land can exceed 60 percent ground; dense forest or urban centres can be below 20 percent. Compare each tile with its neighbours rather than with a fixed value."
          }
        },
        {
          "@type": "Question",
          "name": "Why does my file contain class 0?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Class 0 means the points were never classified, typically because a processing step was skipped or a tool wrote default values. Most delivery specifications do not allow it."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** For a quick look, `pdal info --stats --enumerate Classification tile.laz` lists the classes present. For counts, run a reader-only pipeline and `np.bincount(arr["Classification"], minlength=256)`; for files that do not fit in memory, sum `bincount` over `pipeline.iterator(chunk_size=...)`. Join the counts to ASPRS class names and compute shares for a QA table.

## Context and Motivation

This guide is part of [ASPRS Classification Codes](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/). A per-class point count is the most basic classification QA there is, and it answers more questions than it looks like it should. Is anything left unclassified? Did the vendor use classes the specification does not allow? Did ground classification fail on this tile — ground share of 8 percent where neighbours show 45? Did a reclassification step move the points it was meant to, and only those? Every one of those is a glance at a histogram, provided the histogram is easy to produce for one tile or a thousand.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Class histogram for one tile with shares and ASPRS names" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>A tile's classification at a glance</title>
  <desc>Horizontal bars of point share by class for one suburban tile: ground 38 percent, high vegetation 27 percent, building 14 percent, medium vegetation 9 percent, low vegetation 7 percent, unclassified 3 percent, water 1.5 percent, and noise under 0.5 percent. Class codes and names label each bar.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <g font-size="10.5" fill="var(--dg-text)">
    <text text-anchor="end" x="200" y="30">2 ground</text><text text-anchor="end" x="200" y="54">5 high vegetation</text><text text-anchor="end" x="200" y="78">6 building</text><text text-anchor="end" x="200" y="102">4 medium vegetation</text><text text-anchor="end" x="200" y="126">3 low vegetation</text><text text-anchor="end" x="200" y="150">1 unclassified</text><text text-anchor="end" x="200" y="174">9 water</text><text text-anchor="end" x="200" y="198">7 + 18 noise</text>
  </g>
  <g fill="var(--dg-b)"><rect x="210" y="19" width="418" height="14"/><rect x="210" y="43" width="297" height="14"/><rect x="210" y="67" width="154" height="14"/><rect x="210" y="91" width="99" height="14"/><rect x="210" y="115" width="77" height="14"/><rect x="210" y="139" width="33" height="14"/><rect x="210" y="163" width="17" height="14"/><rect x="210" y="187" width="5" height="14"/></g>
  <g font-size="10" fill="var(--dg-muted)"><text x="636" y="30">38 %</text><text x="515" y="54">27 %</text><text x="372" y="78">14 %</text><text x="317" y="102">9 %</text><text x="295" y="126">7 %</text><text x="251" y="150">3 %</text><text x="235" y="174">1.5 %</text><text x="223" y="198">0.4 %</text></g>
</svg>

## Prerequisites and Assumptions

- PDAL 2.x with Python bindings; NumPy and pandas.
- LAS files with classification populated.
- A list of classes your specification allows, to flag unexpected ones.

## Step-by-Step Implementation

### Step 1 — List classes present

`pdal info --stats --enumerate Classification` computes statistics and reports the distinct classification values. It reads every point but needs no code.

### Step 2 — Count with bincount

A reader-only pipeline returns an array; `np.bincount(a["Classification"], minlength=256)` counts every class in one vectorized call.

### Step 3 — Stream for large files

`pipeline.iterator(chunk_size=2_000_000)` yields chunks; summing `bincount` across them gives exact counts in bounded memory.

### Step 4 — Add names and shares

Join counts to a dictionary of ASPRS class names and divide by the total.

### Step 5 — Aggregate a project

Run over every tile, keep per-tile rows for QA and sum for the project total.

## Complete Working Example

```python
"""Per-class counts for tiles and a project, with ASPRS names and anomaly flags."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import pdal

ASPRS = {0: "never classified", 1: "unclassified", 2: "ground", 3: "low vegetation",
         4: "medium vegetation", 5: "high vegetation", 6: "building", 7: "low noise",
         8: "model key point (legacy)", 9: "water", 10: "rail", 11: "road surface",
         12: "overlap (legacy)", 13: "wire guard", 14: "wire conductor",
         15: "transmission tower", 16: "wire connector", 17: "bridge deck",
         18: "high noise", 19: "overhead structure", 20: "ignored ground",
         21: "snow", 22: "temporal exclusion"}
ALLOWED = {1, 2, 3, 4, 5, 6, 7, 9, 17, 18}


def class_counts(path: Path, chunk: int = 2_000_000) -> np.ndarray:
    p = pdal.Pipeline(json.dumps({"pipeline": [str(path)]}))
    counts = np.zeros(256, dtype=np.int64)
    for arr in p.iterator(chunk_size=chunk):
        counts += np.bincount(arr["Classification"], minlength=256)
    return counts


def project_table(tiles: list[Path]) -> pd.DataFrame:
    rows = []
    for t in tiles:
        c = class_counts(t)
        total = c.sum()
        for cls in np.nonzero(c)[0]:
            rows.append({"tile": t.stem, "class": int(cls), "name": ASPRS.get(int(cls), "user-defined"),
                         "points": int(c[cls]), "share": c[cls] / total,
                         "allowed": int(cls) in ALLOWED})
    return pd.DataFrame(rows)


if __name__ == "__main__":
    df = project_table(sorted(Path("tiles").glob("*.laz")))
    project = (df.groupby(["class", "name"]).points.sum().reset_index()
                 .assign(share=lambda d: (d.points / d.points.sum()).round(4)))
    print(project.to_string(index=False))

    bad = df[~df.allowed].groupby("tile").points.sum()
    if len(bad):
        print("tiles with disallowed classes:\n", bad)
    ground = df[df["class"] == 2].set_index("tile").share
    median = ground.median()
    suspicious = ground[ground < 0.5 * median]
    print(f"median ground share {median:.1%}; suspicious tiles: {list(suspicious.index)}")
```

The streaming iterator requires a streamable pipeline — a bare reader always is — so the same function handles 10-million and 500-million-point files.

<svg viewBox="0 56 740 144" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Ground share per tile with an outlier tile highlighted" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Spotting a failed tile from its histogram</title>
  <desc>A bar chart of ground share for twelve tiles. Most are between 35 and 48 percent. One tile has only 9 percent ground, less than half the median, and is highlighted as suspicious: its ground classification likely failed, or it covers mostly water.</desc>
  <rect x="0" y="56" width="740" height="144" fill="var(--dg-bg)" rx="10"/>
  <line x1="40" y1="170" x2="700" y2="170" stroke="var(--dg-line)" stroke-width="1.3"/>
  <g fill="var(--dg-b)"><rect x="60" y="80" width="36" height="90"/><rect x="112" y="72" width="36" height="98"/><rect x="164" y="86" width="36" height="84"/><rect x="216" y="66" width="36" height="104"/><rect x="268" y="76" width="36" height="94"/><rect x="372" y="84" width="36" height="86"/><rect x="424" y="70" width="36" height="100"/><rect x="476" y="78" width="36" height="92"/><rect x="528" y="90" width="36" height="80"/><rect x="580" y="74" width="36" height="96"/><rect x="632" y="82" width="36" height="88"/></g>
  <rect x="320" y="150" width="36" height="20" fill="var(--dg-e)"/>
  <line x1="40" y1="126" x2="700" y2="126" stroke="var(--dg-line-soft)" stroke-width="1.2" stroke-dasharray="5 4"/>
  <text x="338" y="140" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">9 %</text>
  <text x="370" y="190" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">ground share per tile · dashed line: half the median</text>
</svg>

## Turning Counts into a QA Report

A project-wide table of counts is useful; a short report built from it is what reviewers read. Four derived views cover most needs.

**Project totals by class**, with names and shares, as the example prints. This is the headline table for a delivery report and the first thing a client's QA team compares with their expectations.

**Tiles with disallowed classes.** Any class outside the specification — class 0, legacy class 12, an undocumented vendor code — listed per tile with counts. These are usually quick to fix with [conditional filters.assign](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/assigning-classification-with-conditional-filters-assign/) or [a vendor-code remapping](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/remapping-vendor-classification-codes-to-asprs/), but only if someone sees them.

**Outlier tiles per class.** For ground, vegetation and buildings, tiles whose share is far from the median of their neighbours. A tile with 9 percent ground among neighbours at 40 percent almost always has a failed ground run, a large water body or a data gap, and each of those needs a different response.

**Change between versions.** When a project is reprocessed, a table of per-class differences between the old and new delivery shows at a glance what the reprocessing actually changed — and whether it changed anything it was not supposed to.

Keep the raw per-tile counts as a CSV beside the report so any figure can be recomputed.

## Key Parameter Table

| Method | Reads | Memory | Output |
|---|---|---|---|
| `pdal info --stats --enumerate Classification` | all points | low | distinct values in JSON |
| `np.bincount` on `pipeline.arrays` | all points | whole tile | exact counts |
| `bincount` over `iterator(chunk_size)` | all points | one chunk | exact counts |
| `filters.stats` with `count` | all points | low | per-value counts in metadata |
| laspy `chunk_iterator` | all points | one chunk | exact counts without PDAL |

## Verification

- **Totals match the header.** The sum of all class counts equals the header point count.
- **Before/after diffs.** After any reclassification step, only the classes you meant to change should differ.
- **Cross-tool agreement.** On one tile, compare with laspy: `np.bincount(laspy.read(p).classification)` must be identical.

## Gotchas and Edge Cases

**Legacy formats and 5-bit classes.** In PDRF 0–5, PDAL exposes the 5-bit class; the withheld, synthetic and key-point bits are separate dimensions. Counts above class 31 are impossible there.

**Class 0 versus class 1.** Class 0 (never classified) means no classification was ever attempted; class 1 (unclassified) means a classifier looked and assigned nothing. Many specifications forbid class 0 in deliveries.

**Shares mislead across landscapes.** A tile over a lake has little ground; a tile over a city has little high vegetation. Compare shares against neighbouring tiles, not against a fixed number.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Class 0 versus class 1 in a delivery" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Never classified is not unclassified</title>
  <desc>Two boxes. Class 0, never classified, means no classification process ran on the point, and most specifications reject it in deliveries. Class 1, unclassified, means a classifier examined the point and did not assign any specific class, which is acceptable in small amounts.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="24" width="340" height="120" rx="10" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="190" y="52" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">class 0 — never classified</text>
  <text x="190" y="80" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">no classifier ran on the point</text>
  <text x="190" y="104" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">usually rejected in deliveries</text>
  <rect x="380" y="24" width="340" height="120" rx="10" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="550" y="52" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">class 1 — unclassified</text>
  <text x="550" y="80" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">classifier ran, assigned nothing</text>
  <text x="550" y="104" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">acceptable in small shares</text>
</svg>

**Withheld points.** Decide whether withheld points belong in the counts. For QA of the delivery, count everything; for product statistics, exclude them.

## Frequently Asked Questions

**How do I count points by classification in a LAS file?**

Read the file with a PDAL pipeline and apply NumPy's bincount to the Classification array, with minlength 256 so every code has a slot. For large files, sum bincount over chunks from the pipeline iterator.

**How do I list the classes present with the PDAL command line?**

Run pdal info with the stats flag and enumerate Classification. The output includes the distinct classification values found in the file.

**What share of points should be ground?**

It depends on land cover. Open agricultural land can exceed 60 percent ground; dense forest or urban centres can be below 20 percent. Compare each tile with its neighbours rather than with a fixed value.

**Why does my file contain class 0?**

Class 0 means the points were never classified, typically because a processing step was skipped or a tool wrote default values. Most delivery specifications do not allow it.

## Related

- [ASPRS Classification Codes](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/) — what each code means
- [Understanding ASPRS Classification Codes](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/understanding-asprs-classification-codes/) — the full code table
- [Flagging Overlap and Withheld Points](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/flagging-overlap-and-withheld-points/) — flags alongside classes
- [Checking Pipeline Output with pdal info --stats](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/checking-pipeline-output-with-pdal-info-stats/) — automated output checks
- [Evaluating Point Classification with a Confusion Matrix](https://www.pythonlidar.com/lidar-classification-feature-extraction/machine-learning-point-classification/evaluating-point-classification-with-a-confusion-matrix/) — beyond counts to correctness
