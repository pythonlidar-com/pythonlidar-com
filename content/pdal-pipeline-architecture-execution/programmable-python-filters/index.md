---
title: "Programmable Python Filters in PDAL"
description: "How filters.python hands a PDAL point buffer to a NumPy function, the rules for adding dimensions, and why a vectorised implementation costs twenty percent while a Python loop costs a hundred times more."
slug: "programmable-python-filters"
type: "topic"
breadcrumb: "Programmable Python Filters"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Programmable Python Filters in PDAL",
      "description": "How filters.python hands a PDAL point buffer to a NumPy function, the rules for adding dimensions, and why a vectorised implementation costs twenty percent while a Python loop costs a hundred times more.",
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
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Write a filters.python stage that adds a computed dimension",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Declare the stage",
          "text": "Add filters.python with a script path, a function name and a distinctive module label."
        },
        {
          "@type": "HowToStep",
          "name": "Declare any new dimension",
          "text": "List every dimension the function creates in add_dimension with an explicit type, or the values are discarded."
        },
        {
          "@type": "HowToStep",
          "name": "Write the function vectorised",
          "text": "Operate on whole NumPy arrays; a Python loop over points costs roughly a hundred times more."
        },
        {
          "@type": "HowToStep",
          "name": "Return True",
          "text": "Assign into outs and return True; returning False marks the stage as failed."
        },
        {
          "@type": "HowToStep",
          "name": "Write the dimension to the file",
          "text": "Set extra_dims on the writer to the same name and type, and use LAS 1.4 with point format 6 or above."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why is my computed dimension missing from the output file?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because add_dimension and extra_dims do different jobs. The first makes the dimension exist inside the pipeline; the second makes the writer store it. You need both, and the LAS version has to be able to carry extra bytes \u2014 point format 6 or above in a 1.4 file."
          }
        },
        {
          "@type": "Question",
          "name": "How much slower is filters.python than a native stage?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "About twenty percent if the function is vectorised NumPy, and roughly a hundred times slower if it loops over points in Python. The interpreter overhead is per call, not per point, so the whole question is whether your function makes one call or ten million."
          }
        },
        {
          "@type": "Question",
          "name": "Can filters.python stream?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The stage itself can, and PDAL will call your function once per chunk. Whether that is correct depends on the function: one that computes a threshold from buffer statistics gets different thresholds per chunk. If the rule needs whole-cloud context, compute the statistics in a prior pass and pass them in through pdalargs."
          }
        },
        {
          "@type": "Question",
          "name": "Why does PDAL say it cannot import numpy?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "PDAL links against a specific Python interpreter, which is often not the one first on your PATH. Run pdal --debug to see which one, then install numpy into that interpreter. This is the most common setup failure with programmable filters and the error message does not name the interpreter."
          }
        }
      ]
    }
  ]
}
</script>

PDAL ships with well over a hundred stages, and sooner or later your workflow needs the one it does not have. A local quality flag computed from three existing dimensions; a vendor's intensity normalisation formula; a rejection rule that depends on the acquisition's flight-line geometry. `filters.python` is the escape hatch: it hands your function a dictionary of NumPy arrays — one entry per dimension, one element per point in the current buffer — and takes back whatever you put in it. This topic belongs to [PDAL Pipeline Architecture and Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/), and it is where a pipeline stops being configuration and starts being code.

The trade is real and worth stating plainly. A programmable filter is the most flexible stage in PDAL and the slowest one available, because every point crosses the C++/Python boundary as part of an array and your function runs in the interpreter. Written with vectorised NumPy it costs perhaps twenty percent over a native stage. Written with a `for` loop over points it costs two orders of magnitude, and no amount of tuning elsewhere in the pipeline will hide that.

<svg viewBox="0 0 720 264" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="How a PDAL point buffer is presented to a Python function as a dictionary of arrays" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What your function actually receives</title>
  <desc>A point buffer of one hundred thousand points enters filters.python. PDAL presents it as a dictionary whose keys are dimension names and whose values are NumPy arrays of that length — X, Y, Z, Intensity, Classification. The function mutates or adds arrays and returns True, and PDAL copies the arrays back into the buffer before passing it to the next stage.</desc>
  <defs><marker id="pyf-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="720" height="264" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="72" width="150" height="110" rx="8" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.4"/>
  <text x="95" y="112" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">point buffer</text>
  <text x="95" y="134" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">100,000 points</text>
  <text x="95" y="152" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">in C++</text>
  <line x1="170" y1="126" x2="222" y2="126" stroke="var(--dg-line)" stroke-width="1.6" marker-end="url(#pyf-arw)"/>
  <rect x="228" y="52" width="264" height="26" rx="4" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="360" y="70" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">ins["X"] — float64[100000]</text>
  <rect x="228" y="84" width="264" height="26" rx="4" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="360" y="102" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">ins["Y"] — float64[100000]</text>
  <rect x="228" y="116" width="264" height="26" rx="4" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="360" y="134" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">ins["Z"] — float64[100000]</text>
  <rect x="228" y="148" width="264" height="26" rx="4" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="360" y="166" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">ins["Intensity"] — uint16[100000]</text>
  <rect x="228" y="180" width="264" height="26" rx="4" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="360" y="198" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">outs["QaFlag"] — the one you add</text>
  <line x1="492" y1="126" x2="544" y2="126" stroke="var(--dg-line)" stroke-width="1.6" marker-end="url(#pyf-arw)"/>
  <rect x="550" y="72" width="150" height="110" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.4"/>
  <text x="625" y="112" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">next stage</text>
  <text x="625" y="134" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">sees the mutated</text>
  <text x="625" y="152" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">buffer</text>
  <text x="20" y="238" font-size="10.5" fill="var(--dg-muted)">the arrays are views onto PDAL’s memory, so an in-place vectorised assignment costs nothing beyond the arithmetic —</text>
  <text x="20" y="256" font-size="10.5" fill="var(--dg-muted)">and a Python loop over 100,000 elements costs everything.</text>
</svg>

## Prerequisites

| Requirement | Detail |
|---|---|
| PDAL | 2.4+ built with Python support (`pdal --drivers | grep python` should list it) |
| Python | the interpreter PDAL was built against, not necessarily the one on your PATH |
| `numpy` | importable by that interpreter |
| A dimension plan | know which dimensions you read and which you create before writing the function |
| `filters.python` docs for `pdalargs` | the mechanism for passing configuration into the function |

The interpreter mismatch is the single most common setup failure. A conda-forge PDAL uses the conda Python; a system PDAL uses the system one. Installing NumPy into the wrong one produces an import error inside the stage that mentions neither.

## Core Workflow Architecture

1. **Declare the stage.** `filters.python` takes either a `script` path or an inline `source`, plus a `function` name and a `module` label used in error messages.
2. **Declare added dimensions.** Any dimension your function creates must be listed in `add_dimension`, with an explicit type. PDAL allocates it before the function runs; a key written into `outs` that was never declared is discarded silently.
3. **Receive the buffer.** PDAL calls your function once per buffer — once for the whole cloud in standard mode, once per chunk if the surrounding pipeline streams.
4. **Mutate or add.** Assign into `outs` to change a dimension or fill a new one. The arrays are the right length by construction; producing a different length is an error.
5. **Return True.** Returning `False` tells PDAL the stage failed. There is no partial success.
6. **Hand on.** The next stage sees the modified buffer with its new dimension, indistinguishable from one a native stage produced.

## Full Implementation

The example computes a per-point quality flag from intensity and return geometry, adds it as a new dimension, and demotes suspect points to a review class rather than deleting them.

```python
"""filters.python stage: derive a QA flag from intensity and return geometry."""
import numpy as np


def flag_quality(ins, outs):
    intensity = ins["Intensity"].astype(np.float64)
    ret = ins["ReturnNumber"].astype(np.int16)
    n_ret = ins["NumberOfReturns"].astype(np.int16)
    z = ins["Z"]

    # Robust intensity bounds from this buffer, not a hard-coded threshold.
    lo, hi = np.percentile(intensity, [1.0, 99.0])
    weak = intensity < lo
    saturated = intensity > hi

    # A last return that is also the only return over a rough surface is the
    # most trustworthy ground candidate; an intermediate return is the least.
    intermediate = (ret > 1) & (ret < n_ret)

    # Elevation blunders: more than five robust deviations from the median.
    med = np.median(z)
    mad = np.median(np.abs(z - med)) * 1.4826
    blunder = np.abs(z - med) > (5.0 * mad) if mad > 0 else np.zeros_like(z, dtype=bool)

    flag = np.zeros(len(z), dtype=np.uint8)
    flag[weak] |= 1
    flag[saturated] |= 2
    flag[intermediate] |= 4
    flag[blunder] |= 8

    outs["QaFlag"] = flag

    # Anything with a blunder bit goes to class 12 (overlap/reserved for review)
    # rather than being deleted, so the decision stays auditable.
    cls = ins["Classification"].copy()
    cls[blunder] = 12
    outs["Classification"] = cls

    return True
```

Wired into a pipeline:

```json
{
  "pipeline": [
    {"type": "readers.las", "filename": "tile_0431.laz"},
    {
      "type": "filters.python",
      "script": "qa_flag.py",
      "function": "flag_quality",
      "module": "qa",
      "add_dimension": "QaFlag=uint8"
    },
    {
      "type": "writers.las",
      "filename": "tile_0431_qa.laz",
      "compression": "laszip",
      "minor_version": 4,
      "dataformat_id": 6,
      "extra_dims": "QaFlag=uint8",
      "forward": "all"
    }
  ]
}
```

## Code Breakdown

**Every operation is vectorised.** There is no `for` loop over points anywhere. `np.percentile`, boolean masks and in-place bitwise assignment all run at C speed over the whole array; the Python interpreter executes about twenty statements regardless of whether the buffer holds ten points or ten million.

**Thresholds are derived from the buffer, not hard-coded.** Intensity scaling varies between sensors and even between flight lines, so a fixed cutoff transfers badly. Percentiles adapt. The cost is that in streaming mode each chunk computes its own percentiles, which is a real difference in behaviour — see the gotcha below.

**A median absolute deviation is used instead of a standard deviation.** A cloud with a handful of returns at 4,000 m has a standard deviation dominated by exactly the points you are trying to find. The MAD does not move.

**Suspect points are reclassified, not dropped.** Deleting evidence inside a QA stage makes the result unauditable. A downstream `filters.range` can remove class 12 when the pipeline actually wants it gone.

**`add_dimension` and `extra_dims` are both required.** The first makes the dimension exist inside the pipeline; the second makes the writer put it in the file. Omitting the second is the commonest reason a computed dimension "disappears", as [attribute mapping](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/) explains at length.

## Parameter Reference Table

| Option | Type | Default | Effect |
|---|---|---|---|
| `script` | path | — | File containing the function; mutually exclusive with `source` |
| `source` | string | — | Inline Python source, useful for one-liners and awkward in version control |
| `function` | string | — | Name of the callable PDAL invokes |
| `module` | string | — | Label used in tracebacks; make it distinctive |
| `add_dimension` | string or list | — | Dimensions to create, as `Name=type`; required for anything new |
| `pdalargs` | JSON object | `{}` | Passed to the function as a global dict — the way to parameterise a script |

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Runtime of the same rule written as a Python loop, as vectorised NumPy, and as a native PDAL stage" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>The cost of writing the loop yourself</title>
  <desc>Three implementations of the same per-point rule over an 18.4 million point tile. A Python for-loop takes 412 seconds. The same logic written as vectorised NumPy takes 3.9 seconds. An equivalent native PDAL stage takes 3.1. The gap between the first two bars is entirely how the function was written, not what it computed.</desc>
  <rect x="0" y="0" width="720" height="250" fill="var(--dg-bg)" rx="10"/>
  <text x="200" y="40" font-size="10.5" fill="var(--dg-muted)">same rule, same 18.4 M point tile, three implementations</text>
  <text x="190" y="80" text-anchor="end" font-size="11.5" fill="var(--dg-text)">Python for-loop</text>
  <rect x="200" y="58" width="480" height="30" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="440" y="78" text-anchor="middle" font-size="11" fill="var(--dg-text)">412 s</text>
  <text x="190" y="134" text-anchor="end" font-size="11.5" fill="var(--dg-text)">vectorised NumPy</text>
  <rect x="200" y="112" width="42" height="30" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="252" y="132" font-size="11" fill="var(--dg-muted)">3.9 s</text>
  <text x="190" y="188" text-anchor="end" font-size="11.5" fill="var(--dg-text)">native PDAL stage</text>
  <rect x="200" y="166" width="34" height="30" rx="4" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="244" y="186" font-size="11" fill="var(--dg-muted)">3.1 s</text>
  <text x="200" y="228" font-size="10.5" fill="var(--dg-muted)">the interpreter is not the problem — a hundred million round trips through it are</text>
</svg>

## Validation and Integrity Checks

**The dimension exists and is populated.** After the run, read it back and confirm it is not uniformly zero:

```python
p = pdal.Pipeline(json.dumps({"pipeline": [{"type": "readers.las", "filename": "tile_0431_qa.laz"}]}))
p.execute()
arr = p.arrays[0]
assert "QaFlag" in arr.dtype.names, "dimension was declared but never written to the file"
assert arr["QaFlag"].any(), "every point has flag zero — the rule matched nothing"
```

**The point count did not change.** A programmable filter that assigns dimensions must not alter the buffer length. If the output count differs from the input, the function returned arrays of the wrong shape.

**The type survived.** A `uint8` dimension that comes back as `float64` means `extra_dims` declared a different type from `add_dimension`, and every consumer downstream now reads eight bytes where one was intended.

## Performance Tuning

The single decision that matters is vectorisation, and the table above quantifies it. Beyond that, three smaller levers apply.

- **Compute once, not per chunk.** Anything that does not depend on the points — loading a lookup table, opening a raster — belongs at module scope, not inside the function, because the function runs once per buffer.
- **Prefer views to copies.** `ins["Z"]` is a view; `ins["Z"].copy()` is a copy of a potentially enormous array. Copy only when you need to keep the original.
- **Consider whether a native stage already does it.** `filters.assign` with an expression covers a surprising amount of what people write Python for, at native speed and with no interpreter in the pipeline at all.

## Shipping a Programmable Filter to Production

A `filters.python` stage turns a pipeline into a program with a dependency, and it needs the same handling any other dependency gets.

**Version the script with the pipeline JSON.** They are one artefact. A pipeline that references `qa_flag.py` by a relative path and a script that lives in someone's home directory is a job that works on one machine. Put both in the repository, reference the script relative to the pipeline file, and record a hash of each in the output's provenance record.

**Pin the interpreter, not just the packages.** The behaviour of `np.percentile` on ties has changed across NumPy releases, and a QA flag that shifts by a percent between runs is worse than one that is slightly wrong consistently. The container is the right unit here — the [PDAL Docker containers](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/) guide covers pinning PDAL, GDAL, PROJ and the Python stack together so none of them drifts independently.

**Parameterise through `pdalargs` rather than editing the script.** Thresholds, sensor identifiers and file paths belong in the pipeline JSON, which changes per run, not in the function, which should not. Inside the function they arrive as a dictionary:

```python
def flag_quality(ins, outs):
    args = globals().get("pdalargs", {})
    lo_pct = float(args.get("intensity_low_percentile", 1.0))
    ...
```

**Test the function without PDAL.** The signature is just two dictionaries of arrays, so a unit test can build them with NumPy and call the function directly. That test runs in milliseconds, needs no LiDAR data, and catches the majority of logic errors before a pipeline is involved at all:

```python
def test_blunder_is_flagged():
    n = 1000
    ins = {
        "Z": np.concatenate([np.full(n - 1, 100.0), [4000.0]]),
        "Intensity": np.full(n, 3000, dtype=np.uint16),
        "ReturnNumber": np.ones(n, dtype=np.uint8),
        "NumberOfReturns": np.ones(n, dtype=np.uint8),
        "Classification": np.ones(n, dtype=np.uint8),
    }
    outs = {}
    assert flag_quality(ins, outs) is True
    assert outs["QaFlag"][-1] & 8, "the 4000 m return should carry the blunder bit"
    assert outs["Classification"][-1] == 12
```

**Fail loudly inside the function.** A stage that catches every exception and returns `True` produces a file full of zeros and a run that reports success. Let the exception propagate; PDAL will surface it with your module label attached, which is what the label is for.

<svg viewBox="0 0 720 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="How pdalargs carries configuration from the pipeline JSON into the Python function" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Configuration goes in the JSON, logic stays in the function</title>
  <desc>Values set under pdalargs in the pipeline JSON arrive inside the function as a global dictionary. Thresholds, sensor identifiers and file paths belong there, so the script is identical between runs and only the JSON changes. Anything hard-coded in the function has to be edited, reviewed and redeployed instead.</desc>
  <rect x="0" y="0" width="720" height="240" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="56" width="280" height="118" rx="8" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.4"/>
  <text x="160" y="46" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">pipeline.json — changes per run</text>
  <text x="40" y="86" font-size="11" fill="var(--dg-text)">"pdalargs": {</text>
  <text x="56" y="110" font-size="11" fill="var(--dg-text)">"sensor": "riegl_vq1560",</text>
  <text x="56" y="134" font-size="11" fill="var(--dg-text)">"min_confidence": 40</text>
  <text x="40" y="158" font-size="11" fill="var(--dg-text)">}</text>
  <path d="M300 115 L392 115" fill="none" stroke="var(--dg-line)" stroke-width="1.6" marker-end="url(#pa-arw)"/>
  <defs><marker id="pa-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="398" y="56" width="302" height="118" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.4"/>
  <text x="549" y="46" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">score.py — identical every run</text>
  <text x="416" y="86" font-size="11" fill="var(--dg-text)">args = globals().get("pdalargs", {})</text>
  <text x="416" y="110" font-size="11" fill="var(--dg-text)">sensor = args["sensor"]</text>
  <text x="416" y="134" font-size="11" fill="var(--dg-text)">floor = float(args["min_confidence"])</text>
  <text x="416" y="158" font-size="11" fill="var(--dg-muted)">— no thresholds in the code —</text>
  <text x="20" y="204" font-size="10.5" fill="var(--dg-muted)">a script with no constants in it can be reviewed once and reused across sensors, campaigns and seasons;</text>
  <text x="20" y="222" font-size="10.5" fill="var(--dg-muted)">a script with a magic number in it is edited under time pressure at three in the morning.</text>
</svg>

## Common Errors and Troubleshooting

**`Unable to import module`.** PDAL is using a different interpreter from the one you installed NumPy into. `pdal --debug` prints the Python it links against.

**The new dimension is missing from the output file.** `add_dimension` was set but `extra_dims` on the writer was not, or the LAS version cannot carry it. Write LAS 1.4 with point format 6 or higher.

**`Invalid dimension` at pipeline start.** A key written into `outs` that PDAL does not know about. Every created dimension needs a matching `add_dimension` entry.

**Results differ between runs on the same tile.** Almost always a threshold derived from buffer statistics combined with streaming, so each chunk computes different percentiles. Either compute the statistics in a prior pass and pass them in through `pdalargs`, or accept that the stage is chunk-dependent and document it.

**The pipeline is no longer streamable.** `filters.python` itself can stream, but a function that needs whole-cloud statistics cannot honestly do so. That tension is the subject of [streaming mode execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/).

## Frequently Asked Questions

**Why is my computed dimension missing from the output file?**

Because add_dimension and extra_dims do different jobs. The first makes the dimension exist inside the pipeline; the second makes the writer store it. You need both, and the LAS version has to be able to carry extra bytes — point format 6 or above in a 1.4 file.

**How much slower is filters.python than a native stage?**

About twenty percent if the function is vectorised NumPy, and roughly a hundred times slower if it loops over points in Python. The interpreter overhead is per call, not per point, so the whole question is whether your function makes one call or ten million.

**Can filters.python stream?**

The stage itself can, and PDAL will call your function once per chunk. Whether that is correct depends on the function: one that computes a threshold from buffer statistics gets different thresholds per chunk. If the rule needs whole-cloud context, compute the statistics in a prior pass and pass them in through pdalargs.

**Why does PDAL say it cannot import numpy?**

PDAL links against a specific Python interpreter, which is often not the one first on your PATH. Run pdal --debug to see which one, then install numpy into that interpreter. This is the most common setup failure with programmable filters and the error message does not name the interpreter.

---

## Related

- [PDAL Pipeline Architecture and Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/) — the section this stage type belongs to
- [Writing a filters.python Stage with NumPy](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/writing-a-filters-python-stage-with-numpy/) — the hands-on walkthrough from empty file to working stage
- [Adding a New Dimension from a Python Filter](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/adding-a-new-dimension-from-a-python-filter/) — add_dimension, extra_dims and getting the type right
- [Debugging and Profiling filters.python](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/debugging-and-profiling-filters-python/) — finding out why the stage is slow or silent
- [Attribute Mapping](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/) — how dimensions move through a pipeline and into a file
- [Streaming Mode Execution in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/) — what changes when your function is called once per chunk
