---
title: "Assigning Classification with Conditional filters.assign"
description: "Rewrite LiDAR classes safely with PDAL filters.assign value/WHERE syntax: ordered rules, reclassifying low vegetation by height, resetting a class before a new ground run, the legacy assignment/condition form, and verifying every change."
slug: "assigning-classification-with-conditional-filters-assign"
type: "howto"
breadcrumb: "Conditional filters.assign"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Assigning Classification with Conditional filters.assign",
      "description": "Rewrite LiDAR classes safely with PDAL filters.assign value/WHERE syntax: ordered rules, reclassifying low vegetation by height, resetting a class before a new ground run, the legacy assignment/condition form, and verifying every change.",
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
          "name": "Conditional filters.assign",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/assigning-classification-with-conditional-filters-assign/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Assign classification conditionally with PDAL filters.assign",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Compute the dimensions the rules need",
          "text": "Add filters.hag_nn (or whatever computes the evidence) before the assign stage."
        },
        {
          "@type": "HowToStep",
          "name": "Write each rule with an explicit source class",
          "text": "Always include the class you are changing from \u2014 WHERE Classification == 1 && ... \u2014 so a rule can never overwrite ground, buildings or anything else you did not intend."
        },
        {
          "@type": "HowToStep",
          "name": "Make rules mutually exclusive",
          "text": "Non-overlapping conditions make rule order irrelevant, which makes the stage easy to reason about. The vegetation split uses half-open intervals (< 0.5, >= 0.5 && < 2.0, >= 2.0) for that reason."
        },
        {
          "@type": "HowToStep",
          "name": "Use ordered rules only deliberately",
          "text": "When a rule must see an earlier rule's result \u2014 reset then reassign \u2014 put them in one stage in that order and comment the intent in the surrounding code."
        },
        {
          "@type": "HowToStep",
          "name": "Verify changes with a before-and-after histogram",
          "text": "Compare class counts on either side of the stage and check that only the intended classes moved."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Can filters.assign apply several rules in one stage?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. The value option takes a list of rules, each of the form Dimension = expression WHERE condition, applied in order. Later rules see the results of earlier ones."
          }
        },
        {
          "@type": "Question",
          "name": "What is the difference between value and the older assignment option?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "value accepts multiple rules with full expression syntax in both the assigned value and the WHERE condition. The older assignment and condition pair accepts one rule per stage with range syntax. Both remain supported."
          }
        },
        {
          "@type": "Question",
          "name": "How do I split unclassified points into vegetation classes by height?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Compute HeightAboveGround first, then use three rules restricted to Classification equal to 1 with non-overlapping height intervals, assigning classes 3, 4 and 5."
          }
        },
        {
          "@type": "Question",
          "name": "Does filters.assign stream?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. Each point is evaluated independently, so the stage works in streaming mode and adds almost no memory."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** `{"type": "filters.assign", "value": ["Classification = 3 WHERE Classification == 1 && HeightAboveGround < 0.5", "Classification = 5 WHERE Classification == 1 && HeightAboveGround >= 2.0"]}` applies each rule in order, only to points matching its WHERE expression. Rules run sequentially, so later rules see the results of earlier ones — write them so order does not matter, or order them deliberately.

## Context and Motivation

This guide is part of [Attribute Mapping in PDAL Pipelines](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/). Much of classification work is not detection but bookkeeping: split class 1 into vegetation classes by height, reset all ground to class 1 before running a better ground filter, move points inside water polygons to class 9, promote a model's candidate label to the real classification only where confidence is high. Doing this in NumPy means reading the whole cloud into Python and writing it back. `filters.assign` does it inside the pipeline, streams, and records the rule in the pipeline JSON where reviewers can see it.

Since PDAL 2.3 the stage accepts a list of `value` rules in `Dimension = expression WHERE condition` form. Older pipelines use the `assignment` plus `condition` pair, which still works but allows only one rule per stage.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Class 1 points split into vegetation classes by height with WHERE rules" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Three rules, three height bands</title>
  <desc>A vertical height axis with three bands. Class 1 points below 0.5 metres above ground become class 3, low vegetation. Points from 0.5 to 2 metres become class 4, medium vegetation. Points at 2 metres and above become class 5, high vegetation. Points already in other classes, such as ground and buildings, are untouched because every rule requires Classification equal to 1.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="200" x2="80" y2="20" stroke="var(--dg-line)" stroke-width="1.3"/>
  <rect x="90" y="170" width="620" height="28" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1"/>
  <rect x="90" y="120" width="620" height="48" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1"/>
  <rect x="90" y="24" width="620" height="94" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <text x="100" y="189" font-size="10.5" fill="var(--dg-text)">HAG &lt; 0.5 m → Classification = 3 (low vegetation)</text>
  <text x="100" y="148" font-size="10.5" fill="var(--dg-text)">0.5 ≤ HAG &lt; 2.0 m → Classification = 4 (medium vegetation)</text>
  <text x="100" y="74" font-size="10.5" fill="var(--dg-text)">HAG ≥ 2.0 m → Classification = 5 (high vegetation)</text>
  <text x="72" y="172" text-anchor="end" font-size="10" fill="var(--dg-muted)">0.5</text>
  <text x="72" y="122" text-anchor="end" font-size="10" fill="var(--dg-muted)">2.0</text>
  <text x="700" y="100" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">every rule also requires Classification == 1</text>
</svg>

## Prerequisites and Assumptions

- PDAL 2.3+ for the `value` / `WHERE` syntax; `pdal --options filters.assign` shows which form your build accepts.
- The dimensions your conditions reference must exist before the stage — `HeightAboveGround` needs `filters.hag_nn` or `filters.hag_delaunay` upstream.
- A clear specification of what each class means for the project; see [understanding ASPRS classification codes](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/understanding-asprs-classification-codes/).

## Step-by-Step Implementation

### Step 1 — Compute the dimensions the rules need

Add `filters.hag_nn` (or whatever computes the evidence) before the assign stage.

### Step 2 — Write each rule with an explicit source class

Always include the class you are changing from — `WHERE Classification == 1 && ...` — so a rule can never overwrite ground, buildings or anything else you did not intend.

### Step 3 — Make rules mutually exclusive

Non-overlapping conditions make rule order irrelevant, which makes the stage easy to reason about. The vegetation split uses half-open intervals (`< 0.5`, `>= 0.5 && < 2.0`, `>= 2.0`) for that reason.

### Step 4 — Use ordered rules only deliberately

When a rule must see an earlier rule's result — reset then reassign — put them in one stage in that order and comment the intent in the surrounding code.

### Step 5 — Verify changes with a before-and-after histogram

Compare class counts on either side of the stage and check that only the intended classes moved.

## Complete Working Example

Height-based vegetation classes, water reassignment from an overlay, and a reset before a new ground run, in one pipeline:

```json
{
  "pipeline": [
    "tiles/t_0431.laz",
    { "type": "filters.range", "limits": "Classification![7:7],Classification![18:18]" },
    { "type": "filters.hag_nn", "count": 2 },
    { "type": "filters.assign", "value": [
        "Classification = 3 WHERE Classification == 1 && HeightAboveGround >= -0.5 && HeightAboveGround < 0.5",
        "Classification = 4 WHERE Classification == 1 && HeightAboveGround >= 0.5 && HeightAboveGround < 2.0",
        "Classification = 5 WHERE Classification == 1 && HeightAboveGround >= 2.0"
    ]},
    { "type": "writers.las", "filename": "out/t_0431_veg.laz",
      "minor_version": 4, "dataformat_id": 6, "forward": "all" }
  ]
}
```

Resetting ground before running a different ground filter — two rules that must run in this order:

```json
{ "type": "filters.assign", "value": [
    "Classification = 1 WHERE Classification == 2",
    "Classification = 1 WHERE Classification == 8"
]}
```

And a Python check of what changed:

```python
"""Before/after class histograms around a filters.assign stage."""
import json

import numpy as np
import pdal

src = "tiles/t_0431.laz"
before = pdal.Pipeline(json.dumps({"pipeline": [src]})); before.execute()
after = pdal.Pipeline(json.dumps({"pipeline": ["out/t_0431_veg.laz"]})); after.execute()

hb = np.bincount(before.arrays[0]["Classification"], minlength=32)
ha = np.bincount(after.arrays[0]["Classification"], minlength=32)
for c in np.nonzero(hb + ha)[0]:
    delta = int(ha[c]) - int(hb[c])
    print(f"class {c:>2}: {hb[c]:>10,} -> {ha[c]:>10,}  ({delta:+,})")
```

Typical output shows class 1 draining into 3, 4 and 5, classes 7 and 18 removed by the range filter, and every other class unchanged:

```text
class  1:  9,812,440 ->     61,203  (-9,751,237)
class  2: 14,208,991 -> 14,208,991  (+0)
class  3:          0 ->  2,114,780  (+2,114,780)
class  4:          0 ->  1,902,114  (+1,902,114)
class  5:          0 ->  5,734,343  (+5,734,343)
class  6:  3,301,522 ->  3,301,522  (+0)
class  7:     11,008 ->          0  (-11,008)
```

The 61,203 class-1 points left behind are those more than half a metre below the interpolated ground, which the first rule's lower bound deliberately excludes — they are worth inspecting as possible low noise rather than silently calling them low vegetation.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Overlapping rules where order changes the result" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>When rules overlap, order decides</title>
  <desc>Two orderings of two overlapping rules applied to a point with height above ground of 3 metres. In the first order, the rule for height above 2 metres runs first and sets class 5, then the rule for height above 1 metre only matches class 1 points, so class 5 stays. In the second order, the rule for height above 1 metre sets class 4 first, and the later rule that requires class 1 no longer matches, so the point ends as class 4.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="20" width="340" height="160" rx="9" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <rect x="380" y="20" width="340" height="160" rx="9" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="36" y="44" font-size="11" font-weight="600" fill="var(--dg-text)">order A</text>
  <text x="36" y="70" font-size="10.5" fill="var(--dg-text)">1. = 5 WHERE C == 1 &amp;&amp; HAG &gt;= 2</text>
  <text x="36" y="92" font-size="10.5" fill="var(--dg-text)">2. = 4 WHERE C == 1 &amp;&amp; HAG &gt;= 1</text>
  <text x="36" y="130" font-size="10.5" fill="var(--dg-muted)">point with HAG 3 m:</text>
  <text x="36" y="152" font-size="11" fill="var(--dg-d)">ends as class 5</text>
  <text x="396" y="44" font-size="11" font-weight="600" fill="var(--dg-text)">order B</text>
  <text x="396" y="70" font-size="10.5" fill="var(--dg-text)">1. = 4 WHERE C == 1 &amp;&amp; HAG &gt;= 1</text>
  <text x="396" y="92" font-size="10.5" fill="var(--dg-text)">2. = 5 WHERE C == 1 &amp;&amp; HAG &gt;= 2</text>
  <text x="396" y="130" font-size="10.5" fill="var(--dg-muted)">point with HAG 3 m:</text>
  <text x="396" y="152" font-size="11" fill="var(--dg-e)">ends as class 4</text>
</svg>

## Key Parameter Table

| Form | Example | Notes |
|---|---|---|
| `value` rule | `"Classification = 3 WHERE ..."` | PDAL 2.3+; list of rules, applied in order |
| value expression | `"Z = Z - 0.12"` | Right side may be an expression, not just a constant |
| no WHERE | `"UserData = 0"` | Applies to every point |
| legacy `assignment` | `"Classification[:]=2"` | One rule per stage |
| legacy `condition` | `"HeightAboveGround[0:0.5]"` | Range syntax for the legacy form |
| stage `where` | `"where": "PointSourceId == 12"` | Restricts the whole stage, in addition to per-rule WHERE |

## Verification

- **Histogram diff**, as above: only intended source classes decrease and only intended target classes increase.
- **Left-behind points.** Check for points still in the source class and understand why — negative HAG, missing dimensions, boundary values.
- **Idempotence.** Running the stage twice should change nothing the second time; if it does, a rule's target overlaps another rule's source.

## Gotchas and Edge Cases

**Half-open intervals.** Writing `< 2.0` in one rule and `> 2.0` in the next leaves points at exactly 2.0 unassigned. Use `<` with `>=` consistently.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Interval boundaries that leave a gap versus half-open intervals that tile the axis" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Gaps at the boundaries</title>
  <desc>Two number lines of height above ground. On the first, rules use less-than 2.0 and greater-than 2.0, leaving the single value 2.0 uncovered, marked with an open circle and labelled unassigned. On the second, rules use less-than 2.0 and greater-than-or-equal 2.0, and the intervals meet exactly with no gap.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="44" font-size="10.5" fill="var(--dg-e)">&lt; 2.0 and &gt; 2.0</text>
  <line x1="170" y1="40" x2="366" y2="40" stroke="var(--dg-b)" stroke-width="6"/>
  <line x1="374" y1="40" x2="700" y2="40" stroke="var(--dg-a)" stroke-width="6"/>
  <circle cx="370" cy="40" r="6" fill="var(--dg-bg)" stroke="var(--dg-e)" stroke-width="2"/>
  <text x="370" y="68" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">HAG = 2.0 matches neither rule</text>
  <text x="20" y="114" font-size="10.5" fill="var(--dg-d)">&lt; 2.0 and &gt;= 2.0</text>
  <line x1="170" y1="110" x2="370" y2="110" stroke="var(--dg-b)" stroke-width="6"/>
  <line x1="370" y1="110" x2="700" y2="110" stroke="var(--dg-a)" stroke-width="6"/>
  <circle cx="370" cy="110" r="6" fill="var(--dg-a)"/>
  <text x="370" y="140" text-anchor="middle" font-size="10.5" fill="var(--dg-d)">intervals meet exactly; every value lands in one rule</text>
</svg>

Height values are doubles computed from interpolated ground, so an exact 2.0 is rare — but "rare" across forty million points means a handful of points left in class 1 on every tile, which then show up as speckle in a QA viewer and as an unexplained count in the histogram check.

**Negative heights.** Points just below the interpolated ground have negative `HeightAboveGround`. Decide whether they belong in the lowest band — `HeightAboveGround < 0.5` without a lower bound includes them all — or, as in the example, bound the rule at −0.5 m so deeper points stay visible for review.

**Legacy syntax in old pipelines.** `assignment` and `condition` still work, but mixing them with `value` in one stage is confusing. Convert old pipelines when you touch them.

**Assigning outside the dimension's type.** `Classification` is an 8-bit unsigned value in PDRF 6+. Assigning 300 wraps or fails depending on version. Keep classes within 0–255 and, for the ASPRS range, within the values your specification defines.

## Frequently Asked Questions

**Can filters.assign apply several rules in one stage?**

Yes. The value option takes a list of rules, each of the form Dimension = expression WHERE condition, applied in order. Later rules see the results of earlier ones.

**What is the difference between value and the older assignment option?**

value accepts multiple rules with full expression syntax in both the assigned value and the WHERE condition. The older assignment and condition pair accepts one rule per stage with range syntax. Both remain supported.

**How do I split unclassified points into vegetation classes by height?**

Compute HeightAboveGround first, then use three rules restricted to Classification equal to 1 with non-overlapping height intervals, assigning classes 3, 4 and 5.

**Does filters.assign stream?**

Yes. Each point is evaluated independently, so the stage works in streaming mode and adds almost no memory.

## Related

- [Attribute Mapping in PDAL Pipelines](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/) — dimensions and their mapping
- [Copying Dimensions with filters.ferry](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/copying-dimensions-with-filters-ferry/) — keeping a copy before overwriting
- [Remapping Vendor Classification Codes to ASPRS](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/remapping-vendor-classification-codes-to-asprs/) — bulk code translation
- [Filtering Points with filters.expression](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/filtering-points-with-filters-expression/) — the expression language used in WHERE
- [Counting Points per Class with PDAL](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/counting-points-per-class-with-pdal/) — histograms for verification
