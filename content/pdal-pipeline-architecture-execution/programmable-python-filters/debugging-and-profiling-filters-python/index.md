---
title: "Debugging and Profiling filters.python"
description: "Getting output out of a PDAL Python stage, counting the calls to catch streaming surprises, profiling the body, and the ordered checklist for a stage that produced nothing at all."
slug: "debugging-and-profiling-filters-python"
type: "howto"
breadcrumb: "Debugging and Profiling"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Debugging and Profiling filters.python",
      "description": "Getting output out of a PDAL Python stage, counting the calls to catch streaming surprises, profiling the body, and the ordered checklist for a stage that produced nothing at all.",
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
          "name": "Debugging and Profiling",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/debugging-and-profiling-filters-python/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Debug and profile a filters.python stage",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Write markers to stderr",
          "text": "Print to sys.stderr with flush enabled and run with --verbose 4 so the output reaches the terminal."
        },
        {
          "@type": "HowToStep",
          "name": "Count the calls",
          "text": "Increment a module-level counter to reveal whether the function runs once per cloud or once per streaming chunk."
        },
        {
          "@type": "HowToStep",
          "name": "Profile the body",
          "text": "Wrap the implementation in cProfile and print the cumulative statistics to stderr."
        },
        {
          "@type": "HowToStep",
          "name": "Assert inside the function",
          "text": "Check the output dtype and array length so a drift raises a traceback instead of producing a wrong file."
        },
        {
          "@type": "HowToStep",
          "name": "Gate it behind an environment variable",
          "text": "Enable the instrumentation with an env flag so it can stay in the repository at no cost when off."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does print produce no output from my filter?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because stdout may be buffered or swallowed depending on how PDAL was invoked. Print to sys.stderr with flush set to True and run the pipeline with --verbose 4. If the marker still does not appear, the function is not being called and the script path or function name is wrong."
          }
        },
        {
          "@type": "Question",
          "name": "My dimension exists but is all zeros \u2014 where do I start?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Work through four checks in order: is the function called at all, does it return True, is the key you wrote into outs spelled exactly as declared in add_dimension, and is that name in the writer extra_dims. Each of these produces a run that exits zero, so none of them shows up without an explicit check."
          }
        },
        {
          "@type": "Question",
          "name": "How do I tell whether my function is the bottleneck?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Log the points-per-second the function achieves on each buffer. Vectorised NumPy runs in the millions of points per second; anything in the tens of thousands is a Python loop hiding somewhere in code that looks vectorised."
          }
        },
        {
          "@type": "Question",
          "name": "Is module-level state safe?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "For counters and immutable lookups, yes \u2014 it persists across buffers and across tiles in the same process, which is usually what you want. A growing cache is a memory leak that only shows up hours into a long parallel run, so keep anything mutable bounded."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Print to `sys.stderr` from inside the function and run `pdal pipeline --verbose 4` to see it; wrap the body in `cProfile` when it is slow; and when the stage produces nothing, check in this order — is the function being called at all, is it returning `True`, and is the key you wrote into `outs` spelled exactly as declared.

## Context and Motivation

This guide is part of [Programmable Python Filters in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/). It exists because the debugging experience inside a `filters.python` stage is unusually poor: there is no interactive prompt, `print` appears to go nowhere, an exception surfaces as a C++ error with a truncated traceback, and the most common failure — a dimension that exists and is entirely zero — produces no diagnostic at all.

None of that is unfixable. The stage runs in an ordinary Python interpreter with an ordinary standard library, so every normal tool is available once you know where its output goes. The three techniques below cover essentially every failure people actually hit.

<svg viewBox="0 0 720 258" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A decision path from a silent or wrong filters.python stage to its cause" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Working backwards from a stage that did nothing</title>
  <desc>A diagnostic path. First check whether the function is called at all by writing a marker to stderr. If it is not, the script path or function name is wrong. If it is called, check the return value, then check the key spelling against add_dimension, then check the writer's extra_dims. Each branch ends at a specific, checkable cause.</desc>
  <defs><marker id="dbg-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="720" height="258" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="46" width="150" height="52" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="95" y="70" text-anchor="middle" font-size="11" fill="var(--dg-text)">is it called?</text>
  <text x="95" y="88" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">stderr marker</text>
  <rect x="196" y="46" width="150" height="52" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="271" y="70" text-anchor="middle" font-size="11" fill="var(--dg-text)">does it return True?</text>
  <text x="271" y="88" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">None fails silently</text>
  <rect x="372" y="46" width="150" height="52" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="447" y="70" text-anchor="middle" font-size="11" fill="var(--dg-text)">is the key spelled right?</text>
  <text x="447" y="88" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">must match add_dimension</text>
  <rect x="548" y="46" width="152" height="52" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="624" y="70" text-anchor="middle" font-size="11" fill="var(--dg-text)">is it in extra_dims?</text>
  <text x="624" y="88" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">writer decides the file</text>
  <line x1="170" y1="72" x2="190" y2="72" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#dbg-arw)"/>
  <line x1="346" y1="72" x2="366" y2="72" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#dbg-arw)"/>
  <line x1="522" y1="72" x2="542" y2="72" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#dbg-arw)"/>
  <line x1="95" y1="98" x2="95" y2="130" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#dbg-arw)"/>
  <line x1="271" y1="98" x2="271" y2="130" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#dbg-arw)"/>
  <line x1="447" y1="98" x2="447" y2="130" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#dbg-arw)"/>
  <line x1="624" y1="98" x2="624" y2="130" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#dbg-arw)"/>
  <rect x="20" y="134" width="150" height="52" rx="7" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="95" y="164" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">script path or</text>
  <text x="95" y="180" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">function name wrong</text>
  <rect x="196" y="134" width="150" height="52" rx="7" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="271" y="164" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">missing return —</text>
  <text x="271" y="180" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">stage marked failed</text>
  <rect x="372" y="134" width="150" height="52" rx="7" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="447" y="164" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">typo — the value</text>
  <text x="447" y="180" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">is discarded</text>
  <rect x="548" y="134" width="152" height="52" rx="7" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="624" y="164" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">present in memory,</text>
  <text x="624" y="180" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">absent from the file</text>
  <text x="20" y="218" font-size="10.5" fill="var(--dg-muted)">work left to right and stop at the first check that fails — every one of these produces a run that exits zero,</text>
  <text x="20" y="236" font-size="10.5" fill="var(--dg-muted)">so the exit code tells you nothing and the checks have to be explicit.</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL | 2.4+ with Python support |
| A stage that already runs | this is about behaviour, not setup |
| `pdal pipeline --verbose 4` | the flag that lets stage output reach your terminal |
| `cProfile`, `time` | standard library, available inside the stage |

## Step-by-Step Implementation

### Step 1 — Get output out of the stage

`print` goes to stdout, which PDAL may buffer or swallow depending on how it was invoked. `sys.stderr` is reliable:

```python
import sys

def score(ins, outs):
    print(f"[score] buffer of {len(ins['Z'])} points", file=sys.stderr, flush=True)
    ...
```

Run with `pdal pipeline p.json --verbose 4` and the line appears. If it does not appear at all, the function is not being called — check `script` and `function`.

### Step 2 — Count the calls

In streaming mode the function runs once per chunk, and a rule that assumed one call per cloud will behave differently. A module-level counter makes it visible:

```python
_CALLS = 0

def score(ins, outs):
    global _CALLS
    _CALLS += 1
    print(f"[score] call {_CALLS}", file=sys.stderr, flush=True)
```

### Step 3 — Profile the body when it is slow

```python
import cProfile, pstats, io

def score(ins, outs):
    profiler = cProfile.Profile()
    profiler.enable()
    result = _score_impl(ins, outs)
    profiler.disable()
    buf = io.StringIO()
    pstats.Stats(profiler, stream=buf).sort_stats("cumulative").print_stats(8)
    print(buf.getvalue(), file=sys.stderr)
    return result
```

The top line is nearly always either a NumPy call doing real work — fine — or a Python-level loop, which is the problem.

### Step 4 — Assert inside the function

An assertion that fires produces a real traceback with your `module` label, which is far better than a wrong answer:

```python
assert outs["Confidence"].dtype == np.uint8, "dtype drifted from the declaration"
assert len(outs["Confidence"]) == len(ins["Z"]), "output length must match the buffer"
```

## Complete Working Example

```python
"""A filters.python stage instrumented for diagnosis."""
import io
import os
import sys
import time

import numpy as np

DEBUG = os.environ.get("PDAL_PY_DEBUG") == "1"
_CALLS = 0
_SECONDS = 0.0


def _log(message: str) -> None:
    if DEBUG:
        print(f"[roughness] {message}", file=sys.stderr, flush=True)


def _impl(ins, outs):
    z = ins["Z"]
    # A cheap local roughness proxy: deviation from the buffer median.
    med = np.median(z)
    mad = np.median(np.abs(z - med)) * 1.4826
    scaled = np.zeros_like(z, dtype=np.float32) if mad == 0 else \
        (np.abs(z - med) / mad).astype(np.float32)
    outs["Roughness"] = np.clip(scaled, 0, 1000).astype(np.float32)
    return True


def roughness(ins, outs):
    global _CALLS, _SECONDS
    _CALLS += 1
    started = time.perf_counter()

    n = len(ins["Z"])
    _log(f"call {_CALLS}: {n:,} points")

    result = _impl(ins, outs)

    elapsed = time.perf_counter() - started
    _SECONDS += elapsed
    _log(f"call {_CALLS}: {elapsed * 1000:.1f} ms "
         f"({n / max(elapsed, 1e-9) / 1e6:.1f} M pts/s), total {_SECONDS:.2f} s")

    assert result is True, "impl must return True"
    assert outs["Roughness"].dtype == np.float32, "dtype drifted from the declaration"
    assert len(outs["Roughness"]) == n, "output length must match the input buffer"
    return result
```

Enable it without editing the pipeline:

```bash
PDAL_PY_DEBUG=1 pdal pipeline roughness.json --verbose 4
```

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="What each PDAL verbosity level adds to the log" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Four verbosity levels, three of them useful</title>
  <desc>PDAL verbosity from zero to eight. Level zero prints nothing. Level two names stages and errors. Level four is where output written to stderr from inside a Python stage becomes visible, which is the level to debug at. Level eight adds capability negotiation and option resolution, which is what to use when a pipeline refuses to stream.</desc>
  <rect x="0" y="0" width="720" height="250" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="52" width="80" height="36" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="60" y="76" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">0</text>
  <rect x="112" y="52" width="260" height="36" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="126" y="75" font-size="11" fill="var(--dg-text)">nothing</text>
  <text x="392" y="75" font-size="10.5" fill="var(--dg-muted)">the default, and useless while debugging</text>
  <rect x="20" y="98" width="80" height="36" rx="6" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="60" y="122" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">2</text>
  <rect x="112" y="98" width="260" height="36" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="126" y="121" font-size="11" fill="var(--dg-text)">stage names and errors</text>
  <text x="392" y="121" font-size="10.5" fill="var(--dg-muted)">enough to see which stage failed</text>
  <rect x="20" y="144" width="80" height="36" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="60" y="168" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">4</text>
  <rect x="112" y="144" width="260" height="36" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="126" y="167" font-size="11" fill="var(--dg-text)">your stderr output appears</text>
  <text x="392" y="167" font-size="10.5" fill="var(--dg-muted)">the level to debug a Python stage at</text>
  <rect x="20" y="190" width="80" height="36" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="60" y="214" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">8</text>
  <rect x="112" y="190" width="260" height="36" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="126" y="213" font-size="11" fill="var(--dg-text)">capability and option resolution</text>
  <text x="392" y="213" font-size="10.5" fill="var(--dg-muted)">why a chain refused to stream</text>
  <text x="20" y="36" font-size="10.5" fill="var(--dg-muted)">pdal pipeline p.json --verbose N</text>
  <text x="20" y="242" font-size="10.5" fill="var(--dg-muted)">in Python the same dial is pipeline.loglevel, and it must be set before execute rather than after</text>
</svg>

## Key Parameter Table

| Technique | Cost | Catches |
|---|---|---|
| `sys.stderr` marker | negligible | function never called, wrong call count |
| call counter | negligible | streaming surprises, chunk-dependent logic |
| `cProfile` around the body | 10–30% | a Python loop hiding inside vectorised-looking code |
| in-function assertions | negligible | dtype drift, wrong array length |
| `PDAL_PY_DEBUG` env flag | none when off | leaving instrumentation in place safely |

## Verification

**The instrumentation is off by default.** `PDAL_PY_DEBUG` unset means no output and no profiler. Instrumentation that cannot be left in the repository gets deleted and rewritten every time.

**The assertions fire when they should.** Deliberately break the dtype — assign `float64` — and confirm the assertion raises rather than the pipeline quietly succeeding. An assertion that has never rejected anything proves nothing.

**Throughput is where you expect.** The logged points-per-second should be in the millions. Anything in the tens of thousands is a Python loop.

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Points per second achieved by four ways of writing the same rule" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>The number that tells you which mistake you made</title>
  <desc>Throughput in millions of points per second for four implementations of the same per-point rule. Vectorised NumPy operations reach tens of millions. A list comprehension reaches ninety thousand and an explicit loop with append reaches forty thousand. When the logged throughput is in the tens of thousands, the cause is always the same.</desc>
  <rect x="0" y="0" width="720" height="250" fill="var(--dg-bg)" rx="10"/>
  <text x="210" y="78" text-anchor="end" font-size="11" fill="var(--dg-text)">np.where on a mask</text>
  <rect x="220" y="56" width="301" height="32" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="529" y="78" font-size="10.5" fill="var(--dg-muted)">41 M pts/s</text>
  <text x="210" y="122" text-anchor="end" font-size="11" fill="var(--dg-text)">np.percentile</text>
  <rect x="220" y="100" width="184" height="32" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="412" y="122" font-size="10.5" fill="var(--dg-muted)">12 M pts/s</text>
  <text x="210" y="166" text-anchor="end" font-size="11" fill="var(--dg-text)">a list comprehension</text>
  <rect x="220" y="144" width="25" height="32" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="253" y="166" font-size="10.5" fill="var(--dg-muted)">0.09 M pts/s</text>
  <text x="210" y="210" text-anchor="end" font-size="11" fill="var(--dg-text)">a for loop with append</text>
  <rect x="220" y="188" width="19" height="32" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="247" y="210" font-size="10.5" fill="var(--dg-muted)">0.04 M pts/s</text>
  <text x="220" y="42" font-size="10.5" fill="var(--dg-muted)">same rule, same tile, log scale</text>
  <text x="60" y="240" font-size="10.5" fill="var(--dg-muted)">log the rate in the stage itself and the diagnosis takes one run instead of an afternoon with a profiler</text>
</svg>

## Gotchas and Edge Cases

**`print` to stdout can vanish.** Use `stderr` with `flush=True`. Buffered output that never flushes is indistinguishable from a function that never ran.

**A profiler around a NumPy call tells you very little.** `cProfile` sees one entry taking all the time. Its value is showing you the *Python* calls, and the giveaway is a call count in the millions.

**Module-level state persists across buffers and across tiles in the same process.** A counter is fine; a cache keyed by nothing is a memory leak that only appears in a long [parallel run](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/).

**Exceptions lose their traceback.** The `module` label is what identifies the stage in the error PDAL surfaces, so give every programmable filter a distinct one.

## Frequently Asked Questions

**Why does print produce no output from my filter?**

Because stdout may be buffered or swallowed depending on how PDAL was invoked. Print to sys.stderr with flush set to True and run the pipeline with --verbose 4. If the marker still does not appear, the function is not being called and the script path or function name is wrong.

**My dimension exists but is all zeros — where do I start?**

Work through four checks in order: is the function called at all, does it return True, is the key you wrote into outs spelled exactly as declared in add_dimension, and is that name in the writer extra_dims. Each of these produces a run that exits zero, so none of them shows up without an explicit check.

**How do I tell whether my function is the bottleneck?**

Log the points-per-second the function achieves on each buffer. Vectorised NumPy runs in the millions of points per second; anything in the tens of thousands is a Python loop hiding somewhere in code that looks vectorised.

**Is module-level state safe?**

For counters and immutable lookups, yes — it persists across buffers and across tiles in the same process, which is usually what you want. A growing cache is a memory leak that only shows up hours into a long parallel run, so keep anything mutable bounded.

---

## Related

- [Programmable Python Filters in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/) — the parent guide to the stage and its execution model
- [Writing a filters.python Stage with NumPy](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/writing-a-filters-python-stage-with-numpy/) — the function contract these checks assume
- [Adding a New Dimension from a Python Filter](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/adding-a-new-dimension-from-a-python-filter/) — the three declarations behind the empty-dimension failure
- [Pipeline Validation](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/) — catching these failures in CI rather than in production
- [Streaming Mode Execution in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/) — why the call count is not always one
