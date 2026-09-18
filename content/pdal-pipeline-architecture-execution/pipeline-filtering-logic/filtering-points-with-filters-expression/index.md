---
title: "Filtering Points with filters.expression"
description: "Write PDAL expression filters that read like code: comparison and logical operators, combining dimensions, how filters.expression differs from filters.range, and the where option that restricts any stage to a subset of points."
slug: "filtering-points-with-filters-expression"
type: "howto"
breadcrumb: "filters.expression"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Filtering Points with filters.expression",
      "description": "Write PDAL expression filters that read like code: comparison and logical operators, combining dimensions, how filters.expression differs from filters.range, and the where option that restricts any stage to a subset of points.",
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
          "name": "Pipeline Filtering Logic",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "filters.expression",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/filtering-points-with-filters-expression/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Filter LiDAR points with PDAL filters.expression",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Write the condition as a boolean",
          "text": "Think in terms of \"keep if\". Classification == 2 || Classification == 9 keeps ground and water."
        },
        {
          "@type": "HowToStep",
          "name": "Use dimension arithmetic when needed",
          "text": "Expressions can compute: (Z - HeightAboveGround) < 250 keeps points whose ground elevation is below 250 m, useful after filters.hag_nn."
        },
        {
          "@type": "HowToStep",
          "name": "Prefer where for partial processing",
          "text": "To apply a filter to only some points while keeping the rest, add \"where\" to that filter instead of splitting the pipeline. filters.assign with where is the common case."
        },
        {
          "@type": "HowToStep",
          "name": "Test on a small tile",
          "text": "Run with --verbose 4 or read pipeline.log to see how many points passed each stage."
        },
        {
          "@type": "HowToStep",
          "name": "Keep expressions readable",
          "text": "Break complex conditions into two stages rather than one long expression; each stage's point count then documents what it removed."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the difference between filters.range and filters.expression?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "filters.range uses compact bound syntax with implicit OR within a dimension and AND across dimensions. filters.expression takes an explicit boolean expression with logical operators, parentheses, arithmetic and comparisons between dimensions, which covers far more cases."
          }
        },
        {
          "@type": "Question",
          "name": "How do I select last returns in PDAL?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Use an expression comparing two dimensions: ReturnNumber == NumberOfReturns. filters.range cannot express that directly; filters.returns with the groups option last and only is another route."
          }
        },
        {
          "@type": "Question",
          "name": "Does a where clause remove points?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. It limits which points the filter acts on and passes the others through unchanged. To remove points, use filters.expression or filters.range."
          }
        },
        {
          "@type": "Question",
          "name": "Are expressions slow on large tiles?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. They are evaluated per point in compiled code and stream, so the cost is small compared with neighbourhood stages. Filtering early usually makes the whole pipeline faster."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** `{"type": "filters.expression", "expression": "Classification == 2 && Z > 100 && ReturnNumber == NumberOfReturns"}` keeps points for which the boolean expression is true. It supports `==`, `!=`, `<`, `>`, `<=`, `>=`, `&&`, `||`, `!`, parentheses and arithmetic on dimensions — which `filters.range` cannot do — and the same syntax powers the `where` option available on most PDAL filters.

## Context and Motivation

This guide is part of [Pipeline Filtering Logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/). For years, `filters.range` was the way to subset points, and its compact syntax — `"Classification[2:2],Z[100:]"` — is still fine for simple bounds. It becomes awkward quickly: ranges on the same dimension are OR-ed while ranges on different dimensions are AND-ed, there is no arithmetic, and conditions involving two dimensions (last return, for example, means `ReturnNumber == NumberOfReturns`) cannot be expressed. `filters.expression` accepts an ordinary boolean expression instead, and the same expression language appears in the `where` option that lets any filter operate on a subset while passing the rest through untouched.

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The same selection written with filters.range and filters.expression" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Range syntax versus expressions</title>
  <desc>Two panels. The range panel shows the syntax Classification[2:2],Z[100:] with a note that same-dimension ranges are OR-ed and different dimensions AND-ed, and that last-return selection cannot be written. The expression panel shows Classification == 2 and Z at least 100 and ReturnNumber equals NumberOfReturns, reading left to right as a single boolean.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="24" width="340" height="164" rx="9" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="40" y="50" font-size="11.5" font-weight="600" fill="var(--dg-text)">filters.range</text>
  <text x="40" y="78" font-size="11" fill="var(--dg-text)">"Classification[2:2],Z[100:]"</text>
  <text x="40" y="108" font-size="10.5" fill="var(--dg-muted)">same dimension: OR</text>
  <text x="40" y="128" font-size="10.5" fill="var(--dg-muted)">different dimensions: AND</text>
  <text x="40" y="160" font-size="10.5" fill="var(--dg-e)">cannot compare two dimensions</text>
  <rect x="380" y="24" width="340" height="164" rx="9" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="400" y="50" font-size="11.5" font-weight="600" fill="var(--dg-text)">filters.expression</text>
  <text x="400" y="78" font-size="11" fill="var(--dg-text)">Classification == 2 &amp;&amp; Z &gt;= 100</text>
  <text x="400" y="98" font-size="11" fill="var(--dg-text)">&amp;&amp; ReturnNumber == NumberOfReturns</text>
  <text x="400" y="128" font-size="10.5" fill="var(--dg-muted)">explicit &amp;&amp;, ||, !, parentheses</text>
  <text x="400" y="160" font-size="10.5" fill="var(--dg-text)">dimension-to-dimension comparisons</text>
</svg>

## Prerequisites and Assumptions

- PDAL 2.2 or newer. The expression syntax and the `where` option arrived in the 2.x series; check with `pdal --options filters.expression`.
- Dimension names spelled exactly as PDAL reports them (`pdal info --schema`); they are case-sensitive.
- An idea of which points you need at each point in the pipeline — expressions are cheap, but filtering early saves every later stage work.

## Step-by-Step Implementation

### Step 1 — Write the condition as a boolean

Think in terms of "keep if". `Classification == 2 || Classification == 9` keeps ground and water.

### Step 2 — Use dimension arithmetic when needed

Expressions can compute: `(Z - HeightAboveGround) < 250` keeps points whose ground elevation is below 250 m, useful after `filters.hag_nn`.

### Step 3 — Prefer where for partial processing

To apply a filter to only some points while keeping the rest, add `"where"` to that filter instead of splitting the pipeline. `filters.assign` with `where` is the common case.

### Step 4 — Test on a small tile

Run with `--verbose 4` or read `pipeline.log` to see how many points passed each stage.

### Step 5 — Keep expressions readable

Break complex conditions into two stages rather than one long expression; each stage's point count then documents what it removed.

## Complete Working Example

```json
{
  "pipeline": [
    "tiles/t_0431.laz",
    { "type": "filters.expression",
      "expression": "Classification != 7 && Classification != 18" },
    { "type": "filters.hag_nn", "count": 2 },
    { "type": "filters.expression",
      "expression": "ReturnNumber == NumberOfReturns && HeightAboveGround > 2.0 && HeightAboveGround < 60.0" },
    { "type": "filters.assign",
      "value": ["UserData = 1 WHERE Intensity > 3000"] },
    { "type": "writers.las", "filename": "out/t_0431_last_elevated.laz",
      "extra_dims": "HeightAboveGround=float", "minor_version": 4, "dataformat_id": 6 }
  ]
}
```

The Python equivalent, with a count after each filter to see what each removed:

```python
import json
import pdal

base = ["tiles/t_0431.laz"]
steps = [
    {"type": "filters.expression", "expression": "Classification != 7 && Classification != 18"},
    {"type": "filters.hag_nn", "count": 2},
    {"type": "filters.expression",
     "expression": "ReturnNumber == NumberOfReturns && HeightAboveGround > 2.0 && HeightAboveGround < 60.0"},
]
for i in range(len(steps) + 1):
    n = pdal.Pipeline(json.dumps({"pipeline": base + steps[:i]})).execute()
    label = steps[i - 1].get("expression", steps[i - 1]["type"]) if i else "read"
    print(f"{n:>12,}  {label}")
```

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Points remaining after each expression stage" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>What each expression removed</title>
  <desc>Horizontal bars of point counts after each stage: 41.8 million read, 41.5 million after removing noise classes, 41.5 million after HAG which adds a dimension without removing points, and 9.2 million after keeping last returns between 2 and 60 metres above ground.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <text x="200" y="46" text-anchor="end" font-size="11" fill="var(--dg-text)">read</text>
  <rect x="210" y="30" width="480" height="22" fill="var(--dg-line-soft)"/>
  <text x="200" y="84" text-anchor="end" font-size="11" fill="var(--dg-text)">noise removed</text>
  <rect x="210" y="68" width="476" height="22" fill="var(--dg-b)"/>
  <text x="200" y="122" text-anchor="end" font-size="11" fill="var(--dg-text)">+ hag_nn</text>
  <rect x="210" y="106" width="476" height="22" fill="var(--dg-b)"/>
  <text x="200" y="160" text-anchor="end" font-size="11" fill="var(--dg-text)">last, 2–60 m</text>
  <rect x="210" y="144" width="106" height="22" fill="var(--dg-a)"/>
  <text x="324" y="160" font-size="10.5" fill="var(--dg-muted)">9.2 M</text>
  <text x="210" y="190" font-size="10.5" fill="var(--dg-muted)">illustrative counts; 41.8 M read, 41.5 M after noise removal</text>
</svg>

## A Small Library of Useful Expressions

Most production pipelines reuse the same handful of conditions. Keeping them as named constants in your pipeline-building code — rather than retyping them — avoids subtle differences between projects.

| Purpose | Expression |
|---|---|
| Drop low and high noise | `Classification != 7 && Classification != 18` |
| Ground and water only | `Classification == 2 \|\| Classification == 9` |
| First returns (surface) | `ReturnNumber == 1` |
| Last and single returns | `ReturnNumber == NumberOfReturns` |
| Single returns only | `NumberOfReturns == 1` |
| Vegetation above 2 m | `Classification >= 3 && Classification <= 5 && HeightAboveGround > 2` |
| Near-nadir returns | `ScanAngleRank >= -15 && ScanAngleRank <= 15` |
| Exclude withheld points | `Withheld == 0` |
| One flightline | `PointSourceId == 1104` |
| Plausible elevations | `Z > -100 && Z < 4500` |

Two of these deserve a note. The scan-angle condition uses `ScanAngleRank`, which is what PDAL exposes for older point formats; for PDRF 6 and later, PDAL provides the finer-grained scan angle under the same dimension name in degrees, so check the values in your data with `pdal info --stats` before relying on the bounds. And the withheld condition requires a point format and reader that expose the flag as a dimension; on older formats withheld points may be carried in the classification bits instead.

## Key Parameter Table

| Element | Syntax | Example |
|---|---|---|
| Comparison | `== != < > <= >=` | `Intensity >= 1500` |
| Logical | `&& \|\| !` | `!(Classification == 2)` |
| Grouping | `( )` | `(Classification == 3 \|\| Classification == 4) && Z > 10` |
| Arithmetic | `+ - * /` | `Z - HeightAboveGround < 250` |
| Dimension compare | dim op dim | `ReturnNumber == NumberOfReturns` |
| `where` option | on most filters | `"where": "Classification == 1"` |

## Verification

- **Count after each stage**, as in the Python loop, and sanity-check the numbers against expectations.
- **Invert and add.** Running the expression and its negation (`!(...)`) should produce counts that sum to the input count.
- **Spot check values.** Read the output and assert the condition holds for every point.

```python
p = pdal.Pipeline(json.dumps({"pipeline": ["out/t_0431_last_elevated.laz"]})); p.execute()
a = p.arrays[0]
assert (a["ReturnNumber"] == a["NumberOfReturns"]).all()
assert ((a["HeightAboveGround"] > 2.0) & (a["HeightAboveGround"] < 60.0)).all()
```

## Gotchas and Edge Cases

**Shell quoting.** `&&` and `||` mean something to the shell. When passing an expression on the command line as an override, quote the whole argument in single quotes.

**Floating point equality.** `Z == 100.5` rarely matches because Z is a double reconstructed from scaled integers. Use ranges for continuous dimensions and equality for integer ones such as `Classification` and `ReturnNumber`.

**Unknown dimensions fail late.** An expression that names a dimension not yet in the table — `HeightAboveGround` before `filters.hag_nn` — fails when the stage runs. Order stages so dimensions exist before they are referenced.

<svg viewBox="0 0 740 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A where clause passing non-matching points through a filter untouched" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>What where does</title>
  <desc>Points enter a filters.assign stage with a where clause. Points matching the clause go through the assignment and have their value changed. Points not matching bypass the assignment on a parallel path. Both streams rejoin and leave the stage together, so no points are removed.</desc>
  <defs><marker id="wh-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="180" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="70" width="120" height="40" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="80" y="94" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">all points</text>
  <rect x="260" y="26" width="220" height="40" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="370" y="50" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">match where → assign</text>
  <rect x="260" y="114" width="220" height="40" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="370" y="138" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">no match → unchanged</text>
  <rect x="600" y="70" width="120" height="40" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="660" y="94" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">all points out</text>
  <path d="M140 84 L200 84 L200 46 L256 46" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#wh-arw)"/>
  <path d="M140 96 L200 96 L200 134 L256 134" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#wh-arw)"/>
  <path d="M480 46 L540 46 L540 84 L596 84" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#wh-arw)"/>
  <path d="M480 134 L540 134 L540 96 L596 96" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#wh-arw)"/>
</svg>

**`where` is not a filter.** A `where` clause on a filter restricts what that filter operates on; it does not remove non-matching points. Use `filters.expression` when you want points gone.

## Frequently Asked Questions

**What is the difference between filters.range and filters.expression?**

filters.range uses compact bound syntax with implicit OR within a dimension and AND across dimensions. filters.expression takes an explicit boolean expression with logical operators, parentheses, arithmetic and comparisons between dimensions, which covers far more cases.

**How do I select last returns in PDAL?**

Use an expression comparing two dimensions: ReturnNumber == NumberOfReturns. filters.range cannot express that directly; filters.returns with the groups option last and only is another route.

**Does a where clause remove points?**

No. It limits which points the filter acts on and passes the others through unchanged. To remove points, use filters.expression or filters.range.

**Are expressions slow on large tiles?**

No. They are evaluated per point in compiled code and stream, so the cost is small compared with neighbourhood stages. Filtering early usually makes the whole pipeline faster.

## Related

- [Pipeline Filtering Logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) — filter costs and ordering
- [Removing Noise Classes Before Processing](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/removing-noise-classes-before-processing/) — the most common expression
- [Cropping a Point Cloud to a Polygon Boundary](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/cropping-a-point-cloud-to-a-polygon-boundary/) — spatial rather than attribute filtering
- [Assigning Classification with Conditional filters.assign](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/assigning-classification-with-conditional-filters-assign/) — expressions in WHERE clauses
- [Which PDAL Filters Break Streaming Mode](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/which-pdal-filters-break-streaming-mode/) — expressions stream; neighbourhood filters do not
