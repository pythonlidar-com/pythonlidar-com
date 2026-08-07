---
title: "Adding a New Dimension from a Python Filter"
description: "The three declarations a computed PDAL dimension needs, why omitting the writer one produces a valid file with your work missing, and how much each type choice costs per tile."
slug: "adding-a-new-dimension-from-a-python-filter"
type: "howto"
breadcrumb: "Adding a New Dimension"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Adding a New Dimension from a Python Filter",
      "description": "The three declarations a computed PDAL dimension needs, why omitting the writer one produces a valid file with your work missing, and how much each type choice costs per tile.",
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
          "name": "PDAL Pipeline Architecture and Execution",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Programmable Python Filters",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Adding a New Dimension",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/adding-a-new-dimension-from-a-python-filter/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Add a computed dimension to a point cloud with filters.python",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Choose the narrowest sufficient type",
          "text": "A 0 to 100 score is a uint8; the same value as a double costs eight times the file growth."
        },
        {
          "@type": "HowToStep",
          "name": "Declare it on the filter",
          "text": "Set add_dimension to Name=type on filters.python so PDAL allocates the column before the function runs."
        },
        {
          "@type": "HowToStep",
          "name": "Produce exactly that dtype",
          "text": "Assign into outs with an explicit NumPy cast to the declared type."
        },
        {
          "@type": "HowToStep",
          "name": "Declare it on the writer",
          "text": "Set extra_dims to the same Name=type on a LAS 1.4 writer using point format 6 or above."
        },
        {
          "@type": "HowToStep",
          "name": "Read it back",
          "text": "List the extra dimensions with laspy and confirm both the name and the dtype survived the round trip."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does my new dimension not appear in the output file?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Almost always because extra_dims was not set on the writer. add_dimension makes the dimension exist inside the pipeline; extra_dims makes the writer store it. Without the second, the pipeline succeeds, the file is valid, and the dimension is simply absent."
          }
        },
        {
          "@type": "Question",
          "name": "Which type should I choose?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The narrowest one that holds your values. A flag or a 0 to 100 score fits in a uint8 at one byte per point; the same value stored as a double costs eight, which on an 18 million point tile is 147 megabytes instead of 18 \u2014 in every copy of the file, forever."
          }
        },
        {
          "@type": "Question",
          "name": "Can I add a dimension to a LAS 1.2 file?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Not in a way any other tool will read. LAS 1.2 and point formats 0 to 5 have no standard extra-bytes mechanism, so the writer discards the dimension without an error. Write LAS 1.4 with point format 6 or above."
          }
        },
        {
          "@type": "Question",
          "name": "What happens if the declared type and the NumPy dtype disagree?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "PDAL reconciles them, and the reconciliation is not always the one you wanted \u2014 values may be truncated or the dimension widened. Cast explicitly in the function so the two declarations state the same thing."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Three declarations must agree or the dimension vanishes: `add_dimension: "Name=type"` on `filters.python`, an `outs["Name"]` array of that exact dtype in the function, and `extra_dims: "Name=type"` on a LAS 1.4 writer with point format 6 or above.

## Context and Motivation

This guide is part of [Programmable Python Filters in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/). Modifying an existing dimension is straightforward; creating one is where the three-way agreement between the pipeline, the function and the writer starts to matter, and where a mismatch produces a file that looks fine and has quietly lost your work.

The reason it takes three declarations is that a PDAL dimension is three different things at three moments. Inside the pipeline it is a column in the point layout, allocated before any stage runs. Inside your function it is a NumPy array with a dtype. Inside the LAS file it is an entry in the extra-bytes descriptor record with a documented type and name. Nothing propagates automatically between those three, and each one fails differently: a missing `add_dimension` throws, a dtype mismatch truncates, and a missing `extra_dims` writes a perfectly valid file with no trace of the dimension at all.

<svg viewBox="-2 34 724 231" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The three declarations a new dimension needs and the failure that follows from omitting each" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Three declarations, three different failures</title>
  <desc>A new dimension has to be declared in three places. Omitting add_dimension raises an invalid dimension error at pipeline start. Getting the NumPy dtype wrong truncates or widens the values silently. Omitting extra_dims on the writer produces a valid file in which the dimension simply does not appear, with no warning of any kind.</desc>
  <defs><marker id="dim-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="-2" y="34" width="724" height="231" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="56" width="200" height="60" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.4"/>
  <text x="120" y="82" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">add_dimension</text>
  <text x="120" y="102" text-anchor="middle" font-size="10" fill="var(--dg-muted)">on filters.python</text>
  <rect x="260" y="56" width="200" height="60" rx="8" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.4"/>
  <text x="360" y="82" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">outs dtype</text>
  <text x="360" y="102" text-anchor="middle" font-size="10" fill="var(--dg-muted)">in the function</text>
  <rect x="500" y="56" width="200" height="60" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.4"/>
  <text x="600" y="82" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">extra_dims</text>
  <text x="600" y="102" text-anchor="middle" font-size="10" fill="var(--dg-muted)">on the writer</text>
  <line x1="120" y1="116" x2="120" y2="146" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#dim-arw)"/>
  <line x1="360" y1="116" x2="360" y2="146" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#dim-arw)"/>
  <line x1="600" y1="116" x2="600" y2="146" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#dim-arw)"/>
  <rect x="20" y="150" width="200" height="60" rx="8" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="120" y="176" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">omitted → error</text>
  <text x="120" y="196" text-anchor="middle" font-size="10" fill="var(--dg-muted)">"Invalid dimension" at start</text>
  <rect x="260" y="150" width="200" height="60" rx="8" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="360" y="176" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">wrong → truncated</text>
  <text x="360" y="196" text-anchor="middle" font-size="10" fill="var(--dg-muted)">values change, no message</text>
  <rect x="500" y="150" width="200" height="60" rx="8" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="600" y="176" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">omitted → gone</text>
  <text x="600" y="196" text-anchor="middle" font-size="10" fill="var(--dg-muted)">valid file, no dimension</text>
  <text x="20" y="240" font-size="10.5" fill="var(--dg-muted)">the third failure is the dangerous one: the pipeline exits zero, the file opens, and the work is not in it</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL | 2.4+ with Python support |
| Output format | LAS 1.4, point format 6 or above — earlier formats have no standard extra-bytes mechanism |
| A type decision | make it before writing code; changing it later means rewriting every consumer |
| `laspy` | for reading the extra-bytes descriptor back |

## Step-by-Step Implementation

### Step 1 — Choose the narrowest type that holds the values

A confidence score in 0–100 is `uint8`, one byte per point. The same score as `double` is eight, and on an 18 million point tile that difference is 126 MB in every copy of the file forever. Types available include `uint8`, `int8`, `uint16`, `int16`, `uint32`, `int32`, `float`, `double`.

### Step 2 — Declare it on the filter

```json
{"type": "filters.python", "script": "score.py", "function": "confidence",
 "module": "score", "add_dimension": "Confidence=uint8"}
```

Several dimensions are declared as a list: `"add_dimension": ["Confidence=uint8", "Roughness=float"]`.

### Step 3 — Produce exactly that dtype

```python
outs["Confidence"] = score.astype(np.uint8)
```

### Step 4 — Declare it on the writer

```json
{"type": "writers.las", "filename": "out.laz", "minor_version": 4,
 "dataformat_id": 6, "extra_dims": "Confidence=uint8", "forward": "all"}
```

`"extra_dims": "all"` also works and is blunter: it writes every non-standard dimension in the layout, including any a previous stage added that you did not want persisted.

### Step 5 — Read it back before believing it

```python
import laspy
with laspy.open("out.laz") as fh:
    print([d.name for d in fh.header.point_format.extra_dimensions])
```

## Complete Working Example

```python
"""Add a per-point confidence dimension derived from local return geometry."""
import numpy as np

# Weights are configuration, not logic — pdalargs can override them per run.
DEFAULTS = {"w_single": 40, "w_last": 30, "w_intensity": 30}


def confidence(ins, outs):
    args = {**DEFAULTS, **globals().get("pdalargs", {})}

    ret = ins["ReturnNumber"].astype(np.int16)
    n_ret = ins["NumberOfReturns"].astype(np.int16)
    intensity = ins["Intensity"].astype(np.float64)

    single = (n_ret == 1)
    last = (ret == n_ret) & ~single

    # Intensity contributes on a normalised 0-1 scale, robust to outliers.
    lo, hi = np.percentile(intensity, [5, 95])
    span = max(hi - lo, 1.0)
    inten_score = np.clip((intensity - lo) / span, 0.0, 1.0)

    score = (single * float(args["w_single"])
             + last * float(args["w_last"])
             + inten_score * float(args["w_intensity"]))

    outs["Confidence"] = np.clip(score, 0, 255).astype(np.uint8)
    return True


def test_single_return_scores_highest():
    n = 3
    ins = {
        "ReturnNumber": np.array([1, 1, 2], dtype=np.uint8),
        "NumberOfReturns": np.array([1, 3, 3], dtype=np.uint8),
        "Intensity": np.array([5000, 5000, 5000], dtype=np.uint16),
    }
    outs = {}
    confidence(ins, outs)
    assert outs["Confidence"].dtype == np.uint8
    assert len(outs["Confidence"]) == n
    assert outs["Confidence"][0] > outs["Confidence"][2]
```

The pipeline that uses it:

```json
{
  "pipeline": [
    {"type": "readers.las", "filename": "tile_0431.laz"},
    {"type": "filters.python", "script": "score.py", "function": "confidence",
     "module": "score", "add_dimension": "Confidence=uint8",
     "pdalargs": {"w_intensity": 20}},
    {"type": "writers.las", "filename": "tile_0431_scored.laz",
     "compression": "laszip", "minor_version": 4, "dataformat_id": 6,
     "extra_dims": "Confidence=uint8", "forward": "all"}
  ]
}
```

## Key Parameter Table

| Type | Bytes | Range | Use for |
|---|---|---|---|
| `uint8` | 1 | 0–255 | flags, scores, small class codes |
| `int8` | 1 | −128–127 | signed offsets, deltas |
| `uint16` | 2 | 0–65,535 | counts, scaled ratios |
| `int16` | 2 | ±32,767 | scan angles, signed residuals |
| `float` | 4 | ~7 digits | heights above ground, distances |
| `double` | 8 | ~16 digits | rarely justified for a derived dimension |

<svg viewBox="-2 30 724 215" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="How a dimension name resolves at each of the four points it appears" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>One name, four namespaces</title>
  <desc>The dimension name Confidence appears in four places: the add_dimension declaration, the key written into outs, the writer extra_dims option, and the extra-bytes descriptor stored in the file. All four must agree exactly, including case, and none of them checks the others.</desc>
  <rect x="-2" y="30" width="724" height="215" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="52" width="156" height="56" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="98" y="76" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">add_dimension</text>
  <text x="98" y="94" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">Confidence</text>
  <rect x="196" y="52" width="156" height="56" rx="7" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="274" y="76" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">outs key</text>
  <text x="274" y="94" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">Confidence</text>
  <rect x="372" y="52" width="156" height="56" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="450" y="76" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">extra_dims</text>
  <text x="450" y="94" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">Confidence</text>
  <rect x="548" y="52" width="152" height="56" rx="7" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="624" y="76" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">extra-bytes VLR</text>
  <text x="624" y="94" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">Confidence</text>
  <text x="20" y="140" font-size="11" fill="var(--dg-e)">confidence · CONFIDENCE · Confidence_ — three different dimensions as far as PDAL is concerned</text>
  <rect x="20" y="156" width="680" height="36" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="360" y="179" text-anchor="middle" font-size="11" fill="var(--dg-text)">define the name once as a Python constant and interpolate it into the JSON when you generate the pipeline</text>
  <text x="20" y="220" font-size="10.5" fill="var(--dg-muted)">this is the single most common cause of an empty dimension, and no layer of the stack warns about it</text>
</svg>

## Verification

**The descriptor exists.** `laspy`'s `point_format.extra_dimensions` is the authoritative list; if your name is absent, `extra_dims` was wrong.

**The type is what you asked for.** Read `arr["Confidence"].dtype` after a round trip. A `uint8` that returns as `float64` means the two declarations disagreed and PDAL widened it.

**The values are not all zero.** A dimension that exists and is uniformly zero means the function never ran, ran on an empty buffer, or wrote under a different key.

<svg viewBox="0 0 720 246" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="File size added by one extra dimension for six type choices" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What one extra dimension costs per tile</title>
  <desc>Added file size for one extra dimension on an 18.4 million point tile, by type. A single byte per point adds 18 megabytes. Two bytes adds 37. A four-byte float adds 74 and a double adds 147. The choice is made once and paid for in every copy of the file thereafter.</desc>
  <rect x="0" y="0" width="720" height="246" fill="var(--dg-bg)" rx="10"/>
  <text x="200" y="38" font-size="10.5" fill="var(--dg-muted)">added size on an 18.4 M point tile, uncompressed</text>
  <text x="190" y="70" text-anchor="end" font-size="11" fill="var(--dg-text)">uint8 / int8</text>
  <rect x="200" y="52" width="60" height="26" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="270" y="70" font-size="10.5" fill="var(--dg-muted)">18 MB</text>
  <text x="190" y="110" text-anchor="end" font-size="11" fill="var(--dg-text)">uint16 / int16</text>
  <rect x="200" y="92" width="120" height="26" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="330" y="110" font-size="10.5" fill="var(--dg-muted)">37 MB</text>
  <text x="190" y="150" text-anchor="end" font-size="11" fill="var(--dg-text)">float</text>
  <rect x="200" y="132" width="240" height="26" rx="4" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="450" y="150" font-size="10.5" fill="var(--dg-muted)">74 MB</text>
  <text x="190" y="190" text-anchor="end" font-size="11" fill="var(--dg-text)">double</text>
  <rect x="200" y="172" width="480" height="26" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="440" y="190" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">147 MB</text>
  <text x="200" y="228" font-size="10.5" fill="var(--dg-muted)">a 0–100 score stored as a double is eight times the file growth of the same score stored as a byte</text>
</svg>

## Gotchas and Edge Cases

**LAS 1.2 cannot carry it.** Writing a file with `minor_version: 2` discards extra dimensions without an error. Point format matters too: formats 0 to 5 have no standard extra-bytes mechanism, so use format 6 or above — the version differences are laid out in [LAS/LAZ file structure](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/).

**`extra_dims: "all"` writes more than you meant.** Intermediate dimensions added by other stages come along, inflating the file with values nobody downstream reads.

**A name collision with a standard dimension is silently accepted.** Adding a dimension called `Intensity` shadows the real one. Prefix your own names if there is any doubt.

**Compression does not save you.** LAZ compresses extra dimensions poorly compared with coordinates, because they lack the spatial correlation the encoder exploits — one of the effects visible in [converting LAS to LAZ](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/converting-las-to-laz-with-pdal/).

## Frequently Asked Questions

**Why does my new dimension not appear in the output file?**

Almost always because extra_dims was not set on the writer. add_dimension makes the dimension exist inside the pipeline; extra_dims makes the writer store it. Without the second, the pipeline succeeds, the file is valid, and the dimension is simply absent.

**Which type should I choose?**

The narrowest one that holds your values. A flag or a 0 to 100 score fits in a uint8 at one byte per point; the same value stored as a double costs eight, which on an 18 million point tile is 147 megabytes instead of 18 — in every copy of the file, forever.

**Can I add a dimension to a LAS 1.2 file?**

Not in a way any other tool will read. LAS 1.2 and point formats 0 to 5 have no standard extra-bytes mechanism, so the writer discards the dimension without an error. Write LAS 1.4 with point format 6 or above.

**What happens if the declared type and the NumPy dtype disagree?**

PDAL reconciles them, and the reconciliation is not always the one you wanted — values may be truncated or the dimension widened. Cast explicitly in the function so the two declarations state the same thing.

---

## Related

- [Programmable Python Filters in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/) — the parent guide to the stage and its cost model
- [Writing a filters.python Stage with NumPy](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/writing-a-filters-python-stage-with-numpy/) — the signature and casting rules for the function itself
- [Debugging and Profiling filters.python](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/debugging-and-profiling-filters-python/) — what to do when the dimension is present and empty
- [Mapping Custom Attributes in PDAL Pipelines](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/mapping-custom-attributes-in-pdal-pipelines/) — moving dimensions between names with ferry and assign
- [LAS/LAZ File Structure](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/) — where the extra-bytes descriptor lives in the file
