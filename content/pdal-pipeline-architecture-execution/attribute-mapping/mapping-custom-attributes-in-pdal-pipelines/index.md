---
title: "Mapping Custom Attributes in PDAL Pipelines"
description: "Step-by-step guide to declaring, deriving, and persisting custom LAS dimensions in PDAL pipelines using filters.assign, filters.expression, and writers.las extra_dims."
slug: "mapping-custom-attributes-in-pdal-pipelines"
type: "howto"
breadcrumb: "Mapping Custom Attributes"
datePublished: "2025-08-01"
dateModified: "2026-06-24"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Mapping Custom Attributes in PDAL Pipelines",
      "description": "Step-by-step guide to declaring, deriving, and persisting custom LAS dimensions in PDAL pipelines using filters.assign, filters.expression, and writers.las extra_dims.",
      "datePublished": "2025-08-01",
      "dateModified": "2026-06-24",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "PDAL Pipeline Architecture & Execution", "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/"},
        {"@type": "ListItem", "position": 3, "name": "Attribute Mapping", "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/"},
        {"@type": "ListItem", "position": 4, "name": "Mapping Custom Attributes in PDAL Pipelines", "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/mapping-custom-attributes-in-pdal-pipelines/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Mapping Custom Attributes in PDAL Pipelines",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Declare extra dimensions in the reader", "text": "Add extra_dims to readers.las to allocate buffer space for non-standard fields."},
        {"@type": "HowToStep", "position": 2, "name": "Audit the input schema", "text": "Run pdal info --schema to verify dimension names, types, and value ranges before writing expressions."},
        {"@type": "HowToStep", "position": 3, "name": "Derive values with filters.assign", "text": "Write a C-style arithmetic expression per custom dimension, one filters.assign stage per logical group."},
        {"@type": "HowToStep", "position": 4, "name": "Configure the writer with extra_dims", "text": "Mirror every custom dimension in writers.las extra_dims using the correct target type."},
        {"@type": "HowToStep", "position": 5, "name": "Verify persistence after execution", "text": "Inspect pipeline.arrays[0].dtype.names and run pdal info --schema on the output to confirm all dimensions are present."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why do custom dimensions disappear after writers.las runs?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "writers.las only serializes dimensions listed in its extra_dims parameter. If a custom dimension is computed by filters.assign but not declared in extra_dims, PDAL drops it silently without raising an error."
          }
        },
        {
          "@type": "Question",
          "name": "Can I compute one custom dimension from another in the same pipeline?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. PDAL evaluates filters.assign stages in declaration order. Place the stage that produces the source dimension before any stage that references it in an expression."
          }
        },
        {
          "@type": "Question",
          "name": "What LAS version is required for Extra Bytes?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Extra Bytes are supported in LAS 1.0 and later via the Extra Bytes VLR, but writers.las requires minor_version: 4 for reliable Extra Bytes round-trip with the extra_dims mechanism. Use dataformat_id 6 or higher for LAS 1.4."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Declare each custom dimension in `readers.las` `extra_dims`, compute its value with `filters.assign`, then mirror the same name and type in `writers.las` `extra_dims` — omitting either declaration causes silent data loss.

## Context and Motivation

This guide is part of the [Attribute Mapping](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/) cluster, which sits inside the broader [PDAL Pipeline Architecture & Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/) documentation. The specific problem this page solves is a common source of invisible data loss: PDAL does not auto-persist arbitrary point attributes. You can compute a dimension inside a filter and see it in `pipeline.arrays[0]` only to find it absent in the output file — because the writer was never told the dimension existed.

Production LiDAR workflows routinely need dimensions beyond the LAS standard: normalized intensity scores for vegetation classifiers, per-point survey confidence flags, height-above-ground proxies derived from return ratios, or machine-learning feature vectors computed on the fly. Getting these dimensions from expression to disk reliably requires understanding exactly where PDAL allocates buffer slots and which stages must declare an explicit type contract.

<svg viewBox="0 0 700 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Dimension lifecycle: declaration in reader, computation in filters.assign, persistence in writer" style="width:100%;max-width:700px;display:block;margin:1.5rem auto;">
  <title>Custom Dimension Lifecycle in a PDAL Pipeline</title>
  <desc>Four boxes arranged left to right — readers.las, filters.assign (may repeat), writers.las — with arrows showing how a custom dimension must be declared in the reader, computed by the filter, and re-declared in the writer. A danger marker below shows where silent drops occur.</desc>
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0,8 3,0 6" fill="currentColor" opacity="0.55"/>
    </marker>
  </defs>
  <!-- Reader -->
  <rect x="14" y="50" width="150" height="90" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.45"/>
  <text x="89" y="82" text-anchor="middle" font-family="ui-monospace,monospace" font-size="12" font-weight="600" fill="currentColor">readers.las</text>
  <text x="89" y="100" text-anchor="middle" font-family="inherit" font-size="10" fill="currentColor" opacity="0.7">extra_dims allocates</text>
  <text x="89" y="115" text-anchor="middle" font-family="inherit" font-size="10" fill="currentColor" opacity="0.7">buffer slot</text>
  <text x="89" y="130" text-anchor="middle" font-family="inherit" font-size="10" fill="currentColor" opacity="0.55">① DECLARE</text>
  <!-- Arrow 1 -->
  <line x1="165" y1="95" x2="195" y2="95" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#arr)"/>
  <!-- filters.assign -->
  <rect x="197" y="50" width="160" height="90" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.45"/>
  <text x="277" y="78" text-anchor="middle" font-family="ui-monospace,monospace" font-size="12" font-weight="600" fill="currentColor">filters.assign</text>
  <text x="277" y="96" text-anchor="middle" font-family="inherit" font-size="10" fill="currentColor" opacity="0.7">evaluates expression</text>
  <text x="277" y="111" text-anchor="middle" font-family="inherit" font-size="10" fill="currentColor" opacity="0.7">per point</text>
  <text x="277" y="128" text-anchor="middle" font-family="inherit" font-size="10" fill="currentColor" opacity="0.55">② COMPUTE</text>
  <!-- Arrow 2 -->
  <line x1="358" y1="95" x2="388" y2="95" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#arr)"/>
  <!-- Optional second assign -->
  <rect x="390" y="50" width="150" height="90" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3" stroke-dasharray="5,3"/>
  <text x="465" y="78" text-anchor="middle" font-family="ui-monospace,monospace" font-size="11" fill="currentColor" opacity="0.6">filters.assign</text>
  <text x="465" y="96" text-anchor="middle" font-family="inherit" font-size="10" fill="currentColor" opacity="0.55">chain more dims</text>
  <text x="465" y="111" text-anchor="middle" font-family="inherit" font-size="10" fill="currentColor" opacity="0.45">(optional)</text>
  <text x="465" y="128" text-anchor="middle" font-family="inherit" font-size="10" fill="currentColor" opacity="0.45">② repeat</text>
  <!-- Arrow 3 -->
  <line x1="541" y1="95" x2="571" y2="95" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#arr)"/>
  <!-- Writer -->
  <rect x="573" y="50" width="115" height="90" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.45"/>
  <text x="630" y="80" text-anchor="middle" font-family="ui-monospace,monospace" font-size="12" font-weight="600" fill="currentColor">writers.las</text>
  <text x="630" y="97" text-anchor="middle" font-family="inherit" font-size="10" fill="currentColor" opacity="0.7">extra_dims tells</text>
  <text x="630" y="112" text-anchor="middle" font-family="inherit" font-size="10" fill="currentColor" opacity="0.7">writer to keep</text>
  <text x="630" y="128" text-anchor="middle" font-family="inherit" font-size="10" fill="currentColor" opacity="0.55">③ PERSIST</text>
  <!-- Danger note -->
  <text x="89" y="170" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.5">⚠ missing → silent drop</text>
  <text x="630" y="170" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.5">⚠ missing → silent drop</text>
  <!-- Title -->
  <text x="350" y="225" text-anchor="middle" font-family="inherit" font-size="12" fill="currentColor" font-weight="600" opacity="0.75">Custom Dimension Lifecycle</text>
  <text x="350" y="245" text-anchor="middle" font-family="inherit" font-size="10" fill="currentColor" opacity="0.5">Both reader and writer must declare extra_dims — the filter alone is not enough</text>
</svg>

## Prerequisites and Assumptions

Before implementing custom attribute mapping, verify:

- **PDAL 2.5 or later** — array-style `value` in `filters.assign` (multiple expressions in one stage) requires 2.5+; verify with `pdal --version`
- **Python 3.10+** with the `pdal` package installed (`pip install pdal` or `conda install -c conda-forge python-pdal`)
- **Input file in LAS 1.2–1.4 or LAZ** format; E57 and PLY require an additional reader stage and may not support Extra Bytes on output
- **Standard dimensions present**: `X`, `Y`, `Z`, `Intensity` (uint16), `ReturnNumber`, `NumberOfReturns`, and `Classification` — confirm with `pdal info --schema input.laz` before writing expressions
- **LAS 1.4 output target** when custom dimensions must round-trip to the file; Extra Bytes in LAS 1.4 with point format 6 have the widest reader support across downstream tools
- **Write permission** on the output directory; PDAL will not create directories automatically

## Step-by-Step Implementation

### Step 1 — Audit the input schema

Run a schema inspection before writing any expressions. Dimension names are case-sensitive in PDAL; using `returnNumber` in an expression when the actual name is `ReturnNumber` produces a silent zero rather than an error:

```bash
pdal info --schema input_cloud.laz
```

From Python:

```python
import json
import pdal

pipeline = pdal.Pipeline(json.dumps([{"type": "readers.las", "filename": "input_cloud.laz"}]))
pipeline.execute()
arr = pipeline.arrays[0]
print(dict(zip(arr.dtype.names, [str(arr.dtype[n]) for n in arr.dtype.names])))
```

Record the exact names and types. This drives the expression strings and type choices in steps 2 and 3.

### Step 2 — Choose the right filter for each dimension

Three filters cover the full range of custom attribute derivation. Choose based on the complexity of the rule:

| Filter | Use when | Overhead |
|---|---|---|
| `filters.assign` | Static injection, arithmetic derivation, unit conversion | Minimal — vectorized C |
| `filters.expression` | Conditional assignment with a `where` predicate per point | Low — per-point boolean |
| `filters.python` | Spatial joins, external lookups, non-vectorizable logic | High — Python interpreter per point |

Reserve `filters.python` for operations that cannot be expressed in native PDAL arithmetic. The Python interpreter adds 10–50× overhead over `filters.assign` on large point clouds. For [pipeline filtering logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) that combines dimension assignment with point removal, use `filters.expression` with an explicit `where` clause rather than a separate `filters.range` stage — this avoids two buffer passes.

### Step 3 — Declare the dimension in the reader

Add `extra_dims` to `readers.las` for every non-standard dimension the pipeline will produce. PDAL must allocate a buffer slot before any filter can write to it:

```json
{
  "type": "readers.las",
  "filename": "input_cloud.laz",
  "extra_dims": "norm_intensity=float,survey_confidence=uint8"
}
```

For inbound files that already carry custom Extra Bytes — vendor data from a scanner — this declaration also tells PDAL to preserve those incoming values rather than dropping them at read time.

### Step 4 — Compute values with `filters.assign`

Use a separate stage per logical group of dimensions. PDAL evaluates stages in declaration order, so a dimension computed in stage N is available as a variable in stage N+1:

```json
{
  "type": "filters.assign",
  "value": [
    "norm_intensity = (Intensity - 100.0) / 1500.0",
    "survey_confidence = 128"
  ],
  "where": "Intensity >= 100 && Intensity <= 1600"
}
```

The `where` clause restricts the assignment to matching points. Points outside the predicate retain the default value of 0 for newly allocated dimensions — a common source of unexpected zeros. If you need a different default, add an unconditional `filters.assign` before the conditional one to initialize the dimension across all points first.

### Step 5 — Re-declare every dimension in the writer

`writers.las` requires an explicit `extra_dims` declaration for each custom field. Omitting it produces no error but drops the dimension from the file. The type string in the writer must match — or be safely widened from — the type used in the expression:

```json
{
  "type": "writers.las",
  "filename": "output_mapped.laz",
  "compression": "laszip",
  "minor_version": 4,
  "dataformat_id": 6,
  "extra_dims": "norm_intensity=float,survey_confidence=uint8"
}
```

## Complete Working Example

The following pipeline is self-contained. Save it as `mapping_pipeline.json` and run it against any LAZ file that has standard `Intensity`, `ReturnNumber`, and `NumberOfReturns` dimensions. It maps two custom attributes and writes LAS 1.4 with verified Extra Bytes:

```json
{
  "pipeline": [
    {
      "type": "readers.las",
      "filename": "input_cloud.laz",
      "extra_dims": "norm_intensity=float,survey_confidence=uint8"
    },
    {
      "type": "filters.assign",
      "value": "norm_intensity = 0.0"
    },
    {
      "type": "filters.assign",
      "value": [
        "norm_intensity = (Intensity - 100.0) / 1500.0",
        "survey_confidence = 128"
      ],
      "where": "Intensity >= 100 && Intensity <= 1600"
    },
    {
      "type": "writers.las",
      "filename": "output_mapped.laz",
      "compression": "laszip",
      "minor_version": 4,
      "dataformat_id": 6,
      "extra_dims": "norm_intensity=float,survey_confidence=uint8"
    }
  ]
}
```

Run from the CLI:

```bash
pdal pipeline mapping_pipeline.json
```

**Stage breakdown:**

1. **Reader** — ingests the LAZ and allocates `norm_intensity` (float) and `survey_confidence` (uint8) buffer slots for all points.
2. **First assign** — initializes `norm_intensity` to 0.0 for every point unconditionally, so no point carries an uninitialized slot.
3. **Second assign** — overwrites `norm_intensity` with the normalized value and sets `survey_confidence = 128` only for points in the valid intensity range. Points outside the range keep `norm_intensity = 0.0` from step 2.
4. **Writer** — serializes to LAS 1.4 point format 6 with both custom dimensions registered as Extra Bytes in the file's VLR.

The equivalent Python invocation with validation, compatible with the patterns in the [Attribute Mapping](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/) cluster documentation:

```python
import json
import pdal

pipeline_json = {
    "pipeline": [
        {
            "type": "readers.las",
            "filename": "input_cloud.laz",
            "extra_dims": "norm_intensity=float,survey_confidence=uint8",
        },
        {"type": "filters.assign", "value": "norm_intensity = 0.0"},
        {
            "type": "filters.assign",
            "value": [
                "norm_intensity = (Intensity - 100.0) / 1500.0",
                "survey_confidence = 128",
            ],
            "where": "Intensity >= 100 && Intensity <= 1600",
        },
        {
            "type": "writers.las",
            "filename": "output_mapped.laz",
            "compression": "laszip",
            "minor_version": 4,
            "dataformat_id": 6,
            "extra_dims": "norm_intensity=float,survey_confidence=uint8",
        },
    ]
}

p = pdal.Pipeline(json.dumps(pipeline_json))
count = p.execute()
arr = p.arrays[0]

assert "norm_intensity" in arr.dtype.names, "norm_intensity dimension missing"
assert "survey_confidence" in arr.dtype.names, "survey_confidence dimension missing"
print(f"Processed {count:,} points. norm_intensity range: "
      f"{arr['norm_intensity'].min():.4f}–{arr['norm_intensity'].max():.4f}")
```

## Key Parameter Table

| Parameter | Stage | Type | Default | Tuning guidance |
|---|---|---|---|---|
| `extra_dims` | `readers.las` | string | `""` | Comma-separated `name=type` pairs. Must name every non-standard dimension the pipeline will produce or consume. |
| `extra_dims` | `writers.las` | string | `""` | Must mirror the reader declaration. Use the same type or a wider one; narrowing causes silent truncation. |
| `value` | `filters.assign` | string or array | — | Single string for one expression; array of strings (PDAL 2.5+) for multiple in one buffer pass. |
| `where` | `filters.assign` | string | `""` | Optional predicate; limits assignment to matching points. Non-matching points retain their current value (default 0 for new dims). |
| `minor_version` | `writers.las` | int | `2` | Set to `4` for Extra Bytes with the widest tool support. LAS 1.2–1.3 support Extra Bytes in theory but many readers ignore them. |
| `dataformat_id` | `writers.las` | int | `0` | Format 6 is the recommended baseline for LAS 1.4; it supports GPS time and extended return counts. |
| `compression` | `writers.las` | string | `"none"` | `"laszip"` for archival LAZ; `"none"` for iterative development (5–8× faster read/write cycles). |

## Verification

After execution, confirm persistence at three levels:

**1. Dimension names in the output file:**

```bash
pdal info --schema output_mapped.laz
```

Look for `norm_intensity` and `survey_confidence` in the schema list. If absent, the writer `extra_dims` declaration is missing or misspelled.

**2. In-memory array inspection:**

```python
arr = p.arrays[0]
required = {"norm_intensity", "survey_confidence"}
missing = required - set(arr.dtype.names)
assert not missing, f"Missing from array: {missing}"
```

**3. Value range check:**

```python
assert arr["norm_intensity"].min() >= 0.0, "norm_intensity below 0"
assert arr["norm_intensity"].max() <= 1.0, "norm_intensity above 1 — check Intensity range"
assert set(arr["survey_confidence"].tolist()).issubset({0, 128}), "unexpected confidence values"
```

For [pipeline validation](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/) before running against large production datasets, add a point-count parity check: compare `pdal info --summary input.laz` against `pdal info --summary output_mapped.laz`. `filters.assign` does not drop or duplicate points; any count mismatch indicates an upstream filter is also active in the pipeline.

## Gotchas and Edge Cases

**Silent type truncation without error**

PDAL will truncate a `double` or `float` result to fit a narrower target type declared in `extra_dims`. Assigning `norm_intensity = Intensity / 65535.0` and declaring `norm_intensity=uint8` in the writer converts every fractional value to 0 without raising any warning. Always match the type in `extra_dims` to the precision the expression produces: use `float` for normalized ratios and `double` only when sub-millimetre coordinate precision is required.

**Uninitialized slots when `where` clause is present**

When a conditional `filters.assign` is the first stage to touch a dimension, points that do not satisfy the `where` predicate carry a default of 0. For a binary confidence flag this may be acceptable; for a normalized float that feeds a classifier, a zero is indistinguishable from a valid measurement at the lower bound. Initialize unconditionally first, then apply the conditional override.

**Schema drift during `filters.merge`**

When merging point clouds from different sources — a common pattern before [PDAL stage chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/) into a unified processing graph — `filters.merge` drops dimensions that are not present in all input views. If one tile already has `norm_intensity` mapped and another does not, the merged output loses the dimension. Pre-process all tiles through the same mapping pipeline before merging, or use separate per-tile pipelines and combine outputs at the file level.

**`filters.python` dimension creation requires explicit type registration**

When using `filters.python` to compute a custom dimension, you must call `ins.dimension_types` in the `add_dimension` callback to register the type before the `filter` function runs. Unlike `filters.assign`, Python filters do not infer dimension types from the expression — the type must be declared programmatically. Omitting this step raises `Dimension not found` at the writer stage even when the array appears correct in the Python callback.

## Related

- [Attribute Mapping](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/) — parent cluster covering the full dimension-mapping workflow, schema audit patterns, and production validation strategies
- [PDAL Pipeline Architecture & Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/) — overview of the reader → filter → writer execution model and how dimensions propagate through the DAG
- [PDAL Stage Chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/) — how PDAL passes point buffers between stages and the ordering constraints that govern dimension availability
- [Pipeline Filtering Logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) — conditional expression evaluation and how `where` predicates interact with dimension assignment
- [Pipeline Validation](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/) — pre-execution schema and dimension checks to catch configuration errors before running against full datasets
