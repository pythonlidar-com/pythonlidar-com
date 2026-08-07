---
title: "Writing a filters.python Stage with NumPy"
description: "From empty file to running stage: the (ins, outs) signature, casting rules that avoid unsigned wraparound, vectorised assignment, and unit tests that run without PDAL or any LiDAR data."
slug: "writing-a-filters-python-stage-with-numpy"
type: "howto"
breadcrumb: "Writing a filters.python Stage"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Writing a filters.python Stage with NumPy",
      "description": "From empty file to running stage: the (ins, outs) signature, casting rules that avoid unsigned wraparound, vectorised assignment, and unit tests that run without PDAL or any LiDAR data.",
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
          "name": "Writing a filters.python Stage",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/writing-a-filters-python-stage-with-numpy/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Write and wire a filters.python stage with NumPy",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Write the exact signature",
          "text": "Define a module-level function taking ins and outs and returning True."
        },
        {
          "@type": "HowToStep",
          "name": "Cast before arithmetic",
          "text": "Convert integer dimensions to a floating type so subtraction cannot wrap around."
        },
        {
          "@type": "HowToStep",
          "name": "Compute over whole arrays",
          "text": "Use vectorised NumPy operations rather than iterating over points."
        },
        {
          "@type": "HowToStep",
          "name": "Assign with an explicit dtype",
          "text": "Write results into outs cast back to the dimension type PDAL expects."
        },
        {
          "@type": "HowToStep",
          "name": "Reference it from the pipeline",
          "text": "Add filters.python with script, function and module keys, then run with verbose logging."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What exactly does my function receive?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Two dictionaries. ins maps dimension names to NumPy arrays, one element per point in the current buffer, and the arrays are views onto PDAL memory. outs starts empty and holds whatever you assign; anything you put there with a matching dimension is copied back into the buffer."
          }
        },
        {
          "@type": "Question",
          "name": "Why did my intensity values become 65535?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Unsigned integer arithmetic. Intensity is uint16, so subtracting a larger value from a smaller one wraps to the top of the range instead of going negative. Cast to float64 before any arithmetic and cast back explicitly at the end."
          }
        },
        {
          "@type": "Question",
          "name": "Can I test the function without running a pipeline?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes, and you should. The signature is two dictionaries of arrays, so a test can build them with NumPy and call the function directly. Those tests run in milliseconds, need no LiDAR data, and catch most logic errors long before a pipeline is involved."
          }
        },
        {
          "@type": "Question",
          "name": "Which dimension names are available?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Whatever the reader produced, which depends on the point format. ScanAngleRank exists in point formats 0 to 5 and is called ScanAngle in format 6 and above, so a function that hard-codes one name breaks on half the files it meets. Read the schema instead of assuming."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Write a module-level function taking `(ins, outs)`, operate on the NumPy arrays whole rather than element by element, assign your results into `outs`, return `True` — then reference it from `filters.python` with `script`, `function` and `module`.

## Context and Motivation

This guide is part of [Programmable Python Filters in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/), which explains the buffer hand-off and the performance model. Here we go from an empty file to a stage running inside a pipeline, with the mistakes that eat an afternoon called out where they happen.

The reason to reach for a programmable filter is almost always that a rule exists in someone's head or in a specification document and nowhere in PDAL's stage list. Normalising intensity against range. Rejecting returns whose scan angle exceeds the acceptance envelope for a particular sensor. Combining three dimensions into a confidence score that the rest of the pipeline can filter on. All of these are a few lines of NumPy and none of them is a native stage.

<svg viewBox="0 0 720 252" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The four required parts of a filters.python stage and where each one lives" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Four parts, two files</title>
  <desc>The stage is split across two files. The Python module holds the function, its signature and its return value. The pipeline JSON names the script path, the function, a module label for error messages and any dimensions the function creates. Getting either half wrong produces a different, and differently confusing, failure.</desc>
  <rect x="0" y="0" width="720" height="252" fill="var(--dg-bg)" rx="10"/>
  <text x="180" y="40" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">qa_flag.py</text>
  <text x="530" y="40" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">pipeline.json</text>
  <rect x="20" y="52" width="320" height="40" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="180" y="77" text-anchor="middle" font-size="11" fill="var(--dg-text)">import numpy as np</text>
  <rect x="20" y="98" width="320" height="40" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="180" y="123" text-anchor="middle" font-size="11" fill="var(--dg-text)">def normalise(ins, outs):</text>
  <rect x="20" y="144" width="320" height="40" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="180" y="169" text-anchor="middle" font-size="11" fill="var(--dg-text)">outs["Intensity"] = …</text>
  <rect x="20" y="190" width="320" height="40" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="180" y="215" text-anchor="middle" font-size="11" fill="var(--dg-text)">return True</text>
  <rect x="380" y="52" width="320" height="40" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="540" y="77" text-anchor="middle" font-size="11" fill="var(--dg-text)">"script": "qa_flag.py"</text>
  <rect x="380" y="98" width="320" height="40" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="540" y="123" text-anchor="middle" font-size="11" fill="var(--dg-text)">"function": "normalise"</text>
  <rect x="380" y="144" width="320" height="40" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="540" y="169" text-anchor="middle" font-size="11" fill="var(--dg-text)">"module": "qa"</text>
  <rect x="380" y="190" width="320" height="40" rx="6" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="540" y="215" text-anchor="middle" font-size="11" fill="var(--dg-text)">"add_dimension": only if you create one</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL with Python support | `pdal --drivers | grep filters.python` must list it |
| The right interpreter | the one PDAL links against, which `pdal --debug` reports |
| `numpy` | installed into that interpreter |
| A dimension that already exists | this recipe modifies rather than creates; creating is the [next guide](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/adding-a-new-dimension-from-a-python-filter/) |

## Step-by-Step Implementation

### Step 1 — Write the function signature exactly

```python
def normalise(ins, outs):
    ...
    return True
```

Two positional parameters, both dictionaries. `ins` maps dimension names to NumPy arrays; `outs` starts empty and holds whatever you want written back.

### Step 2 — Read what you need as arrays

```python
intensity = ins["Intensity"].astype(np.float64)
scan_angle = ins["ScanAngleRank"].astype(np.float64)
```

Cast to a floating type before arithmetic. `Intensity` is `uint16`, and subtracting a larger value from a smaller one in unsigned arithmetic wraps to 65,000-odd rather than going negative.

### Step 3 — Compute over the whole array

```python
cos_angle = np.cos(np.radians(np.abs(scan_angle)))
corrected = np.clip(intensity / np.maximum(cos_angle, 0.35), 0, 65535)
```

`np.maximum` on the divisor is doing real work: it prevents a division by something near zero at extreme scan angles from producing infinities that then fail the cast back to `uint16`.

### Step 4 — Assign into `outs` with the right dtype

```python
outs["Intensity"] = corrected.astype(np.uint16)
```

An assignment of `float64` into a `uint16` dimension is either an error or a silent truncation depending on the PDAL version. Cast explicitly.

### Step 5 — Wire it into the pipeline and run

```json
{"type": "filters.python", "script": "intensity_norm.py", "function": "normalise", "module": "norm"}
```

## Complete Working Example

```python
"""filters.python: normalise intensity for scan angle, with a unit test."""
import numpy as np

MIN_COS = 0.35  # about 70 degrees off nadir; beyond this the correction is noise


def normalise(ins, outs):
    intensity = ins["Intensity"].astype(np.float64)
    scan_angle = ins["ScanAngleRank"].astype(np.float64)

    cos_angle = np.cos(np.radians(np.abs(scan_angle)))
    corrected = intensity / np.maximum(cos_angle, MIN_COS)
    outs["Intensity"] = np.clip(corrected, 0, 65535).astype(np.uint16)
    return True


# --- test, runnable without PDAL or any LiDAR data -------------------------
def test_nadir_is_unchanged():
    ins = {"Intensity": np.array([1000, 2000], dtype=np.uint16),
           "ScanAngleRank": np.array([0, 0], dtype=np.int8)}
    outs = {}
    normalise(ins, outs)
    assert list(outs["Intensity"]) == [1000, 2000]


def test_off_nadir_is_boosted():
    ins = {"Intensity": np.array([1000], dtype=np.uint16),
           "ScanAngleRank": np.array([30], dtype=np.int8)}
    outs = {}
    normalise(ins, outs)
    assert outs["Intensity"][0] > 1100, "a 30 degree return should be corrected upward"


def test_extreme_angle_is_clamped():
    ins = {"Intensity": np.array([60000], dtype=np.uint16),
           "ScanAngleRank": np.array([85], dtype=np.int8)}
    outs = {}
    normalise(ins, outs)
    assert outs["Intensity"][0] == 65535, "clipping must keep the value in range"
```

Run the tests with `pytest intensity_norm.py` — no pipeline, no tile, no PDAL. Then run the pipeline:

```bash
pdal pipeline normalise.json --verbose 4
```

## Key Parameter Table

| Item | Rule |
|---|---|
| Function signature | exactly `(ins, outs)`; extra parameters are not passed |
| Return value | `True` for success; `False` fails the stage |
| `ins` arrays | views onto PDAL memory — read freely, do not resize |
| `outs` arrays | must have the same length as the input buffer |
| dtypes | cast explicitly; integer dimensions do not accept floats silently on every version |
| `module` | any label; it appears in tracebacks, so make it identifiable |

## Verification

**The unit tests pass.** They run in milliseconds and cover the logic; the pipeline run only proves the wiring.

**The dimension changed.** Compare statistics before and after:

```bash
pdal info in.laz --stats  | grep -A3 Intensity
pdal info out.laz --stats | grep -A3 Intensity
```

**Nothing else changed.** Point counts, bounding box and CRS must be identical. A programmable filter that alters a dimension should not alter the geometry.

<svg viewBox="0 0 720 258" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Intensity against scan angle before and after the correction" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What the correction does to the data</title>
  <desc>Mean intensity plotted against absolute scan angle. Before correction the mean falls steadily from the swath centre to the edge, because an oblique return spreads its energy over more ground. After correction the line is nearly flat out to about sixty degrees, and the clamp keeps the extreme edge from being amplified into noise.</desc>
  <rect x="0" y="0" width="720" height="258" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="40" x2="80" y2="200" stroke="var(--dg-line)" stroke-width="1.5"/>
  <line x1="80" y1="200" x2="680" y2="200" stroke="var(--dg-line)" stroke-width="1.5"/>
  <polyline points="80,72 180,80 280,94 380,116 480,146 580,180 680,194" fill="none" stroke="var(--dg-e)" stroke-width="2.5"/>
  <polyline points="80,72 180,72 280,73 380,74 480,76 580,82 680,120" fill="none" stroke="var(--dg-d)" stroke-width="2.5"/>
  <line x1="580" y1="40" x2="580" y2="200" stroke="var(--dg-line-soft)" stroke-width="1.2" stroke-dasharray="5 4"/>
  <text x="572" y="54" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">clamp at 70°</text>
  <text x="200" y="62" font-size="11" fill="var(--dg-d)">after correction — flat across the swath</text>
  <text x="300" y="168" font-size="11" fill="var(--dg-e)">before — falls toward the edge</text>
  <text x="72" y="204" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">0</text>
  <text x="72" y="76" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">3000</text>
  <text x="80" y="220" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">0°</text>
  <text x="380" y="220" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">40°</text>
  <text x="680" y="220" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">80°</text>
  <text x="380" y="242" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">absolute scan angle</text>
  <text x="26" y="120" text-anchor="middle" font-size="11.5" fill="var(--dg-text)" transform="rotate(-90 26 120)">mean intensity</text>
</svg>

## Gotchas and Edge Cases

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Four mistakes in a filters.python function and the symptom each produces" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Four mistakes and how each one shows up</title>
  <desc>Four rows pairing a mistake with its symptom. Forgetting the return statement fails the stage with no explanation. Doing unsigned arithmetic without a cast wraps negative values to sixty-five thousand. Returning an array of the wrong length errors at the buffer boundary. Looping over points in Python produces a correct result a hundred times too slowly.</desc>
  <rect x="0" y="0" width="720" height="250" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="44" width="310" height="40" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="175" y="68" text-anchor="middle" font-size="11" fill="var(--dg-text)">no return statement</text>
  <rect x="390" y="44" width="310" height="40" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="545" y="68" text-anchor="middle" font-size="11" fill="var(--dg-text)">stage fails; None is not True</text>
  <rect x="20" y="94" width="310" height="40" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="175" y="118" text-anchor="middle" font-size="11" fill="var(--dg-text)">uint16 arithmetic, no cast</text>
  <rect x="390" y="94" width="310" height="40" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="545" y="118" text-anchor="middle" font-size="11" fill="var(--dg-text)">−1 becomes 65535, silently</text>
  <rect x="20" y="144" width="310" height="40" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="175" y="168" text-anchor="middle" font-size="11" fill="var(--dg-text)">outs array of the wrong length</text>
  <rect x="390" y="144" width="310" height="40" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="545" y="168" text-anchor="middle" font-size="11" fill="var(--dg-text)">error at the buffer boundary</text>
  <rect x="20" y="194" width="310" height="40" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="175" y="218" text-anchor="middle" font-size="11" fill="var(--dg-text)">for loop over points</text>
  <rect x="390" y="194" width="310" height="40" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="545" y="218" text-anchor="middle" font-size="11" fill="var(--dg-text)">right answer, 100× the runtime</text>
</svg>

**A dimension that does not exist raises a `KeyError` from inside the stage.** `ScanAngleRank` is present in point formats 0 to 5 but is called `ScanAngle` in format 6 and above. Check the schema rather than assuming.

**`ins` arrays are views.** Assigning into `ins["Z"]` directly may appear to work and is not the contract. Write to `outs`.

**The function runs once per buffer.** In standard mode that is once; under [streaming](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/) it is once per chunk. Any state you accumulate between calls belongs at module scope and needs thinking about.

## Frequently Asked Questions

**What exactly does my function receive?**

Two dictionaries. ins maps dimension names to NumPy arrays, one element per point in the current buffer, and the arrays are views onto PDAL memory. outs starts empty and holds whatever you assign; anything you put there with a matching dimension is copied back into the buffer.

**Why did my intensity values become 65535?**

Unsigned integer arithmetic. Intensity is uint16, so subtracting a larger value from a smaller one wraps to the top of the range instead of going negative. Cast to float64 before any arithmetic and cast back explicitly at the end.

**Can I test the function without running a pipeline?**

Yes, and you should. The signature is two dictionaries of arrays, so a test can build them with NumPy and call the function directly. Those tests run in milliseconds, need no LiDAR data, and catch most logic errors long before a pipeline is involved.

**Which dimension names are available?**

Whatever the reader produced, which depends on the point format. ScanAngleRank exists in point formats 0 to 5 and is called ScanAngle in format 6 and above, so a function that hard-codes one name breaks on half the files it meets. Read the schema instead of assuming.

---

## Related

- [Programmable Python Filters in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/) — the parent guide to the buffer hand-off and its cost
- [Adding a New Dimension from a Python Filter](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/adding-a-new-dimension-from-a-python-filter/) — creating a dimension rather than modifying one
- [Debugging and Profiling filters.python](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/debugging-and-profiling-filters-python/) — when the stage is silent or slow
- [Attribute Mapping](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/) — how dimensions travel through a pipeline
- [PDAL Pipeline Architecture and Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/) — the section overview
