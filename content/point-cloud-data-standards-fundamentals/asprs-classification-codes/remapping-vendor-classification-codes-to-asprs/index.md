---
title: "Remapping Vendor Classification Codes to ASPRS"
description: "Translate a supplier’s private classification codes to the ASPRS schema at ingest, order the rules so none undoes another, and assert that no unknown code survives."
slug: "remapping-vendor-classification-codes-to-asprs"
type: "howto"
breadcrumb: "Remapping Vendor Codes to ASPRS"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Remapping Vendor Classification Codes to ASPRS",
      "description": "Translate a supplier\u2019s private classification codes to the ASPRS schema at ingest, order the rules so none undoes another, and assert that no unknown code survives.",
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
          "name": "Point Cloud Data Standards and Fundamentals",
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
          "name": "Remapping Vendor Codes to ASPRS",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/remapping-vendor-classification-codes-to-asprs/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Remap supplier classification codes to the ASPRS schema",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Write the mapping down as data",
          "text": "Keep the source-to-target table in a JSON file versioned beside the pipeline rather than inline in expressions."
        },
        {
          "@type": "HowToStep",
          "name": "Order the rules safely",
          "text": "Arrange assignments so no rule target appears as a later rule source, and refuse cyclic mappings outright."
        },
        {
          "@type": "HowToStep",
          "name": "Apply with filters.assign",
          "text": "Generate one conditional assignment per mapping entry and run them in the safe order."
        },
        {
          "@type": "HowToStep",
          "name": "Write LAS 1.4 when codes exceed 31",
          "text": "Point format 6 or above is required for any classification value above 31."
        },
        {
          "@type": "HowToStep",
          "name": "Assert only schema codes survive",
          "text": "Read the output histogram and fail if any code outside the target schema is present."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why not just handle the vendor codes downstream?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because every stage then has to know which supplier produced which tile, and one that forgets produces an empty result rather than an error. Translating once at ingest gives the pipeline a single vocabulary and one place to be wrong \u2014 a file you can read and review."
          }
        },
        {
          "@type": "Question",
          "name": "Why does rule order matter?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "filters.assign applies expressions in sequence and each one sees the previous result. Mapping 11 to 2 and then 2 to 20 sends the originally-11 points through both rules. Ordering so that no rule target is a later rule source avoids it; a mapping where that is impossible has a cycle and needs a scratch dimension."
          }
        },
        {
          "@type": "Question",
          "name": "Can I infer the mapping from the data?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. Guessing that the most common code is ground is how a delivery\u2019s water class ends up in a terrain model. The delivery report is the only authoritative statement of what the numbers mean, and if it is missing the right move is to ask rather than to assume."
          }
        },
        {
          "@type": "Question",
          "name": "Does remapping fix a bad classification?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Not at all. It changes the labels, not the judgements behind them. If the supplier classified a bridge deck as ground, translating their ground code to 2 faithfully carries the error into your schema."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Put the mapping in a JSON file next to the pipeline, apply it with `filters.assign` expressions ordered so no rule can undo an earlier one, and assert afterwards that the output contains only codes in your target schema.

## Context and Motivation

This guide is part of [ASPRS Classification Codes](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/), which covers the standard and its version differences. This page deals with the practical consequence of that standard being widely ignored: every delivery arrives with its own idea of what the numbers mean.

The failure this prevents is quiet. A pipeline that selects ground with `Classification[2:2]` runs perfectly against a delivery that codes ground as 11, produces an empty ground set, rasterizes nothing, and writes a DTM of NoData. Nothing errors. The remedy is to remap at ingest — to treat the vendor's codes as a foreign vocabulary that gets translated once, at the boundary, rather than as something every downstream stage has to know about.

<svg viewBox="0 0 720 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Vendor codes translated to ASPRS codes at ingest rather than accommodated downstream" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Translate once, at the boundary</title>
  <desc>Above, three deliveries with three code sets flow directly into a pipeline, so every downstream stage needs to know which vendor produced which tile. Below, each delivery passes through a remap step at ingest and everything after it sees ASPRS codes only, so the pipeline has one vocabulary instead of three.</desc>
  <defs><marker id="rm-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="720" height="260" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="34" font-size="11.5" font-weight="600" fill="var(--dg-e)">without a remap step</text>
  <rect x="20" y="44" width="120" height="26" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.1"/>
  <text x="80" y="62" text-anchor="middle" font-size="10" fill="var(--dg-text)">vendor A codes</text>
  <rect x="20" y="74" width="120" height="26" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.1"/>
  <text x="80" y="92" text-anchor="middle" font-size="10" fill="var(--dg-text)">vendor B codes</text>
  <rect x="20" y="104" width="120" height="26" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.1"/>
  <text x="80" y="122" text-anchor="middle" font-size="10" fill="var(--dg-text)">vendor C codes</text>
  <line x1="140" y1="87" x2="196" y2="87" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#rm-arw)"/>
  <rect x="202" y="60" width="220" height="54" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="312" y="84" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">every stage must know</text>
  <text x="312" y="102" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">which vendor each tile came from</text>
  <text x="20" y="164" font-size="11.5" font-weight="600" fill="var(--dg-d)">with a remap step</text>
  <rect x="20" y="174" width="120" height="26" rx="4" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.1"/>
  <text x="80" y="192" text-anchor="middle" font-size="10" fill="var(--dg-text)">vendor A codes</text>
  <rect x="20" y="204" width="120" height="26" rx="4" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.1"/>
  <text x="80" y="222" text-anchor="middle" font-size="10" fill="var(--dg-text)">vendor B codes</text>
  <line x1="140" y1="202" x2="176" y2="202" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#rm-arw)"/>
  <rect x="182" y="180" width="150" height="44" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.4"/>
  <text x="257" y="207" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">remap at ingest</text>
  <line x1="332" y1="202" x2="368" y2="202" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#rm-arw)"/>
  <rect x="374" y="180" width="326" height="44" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.4"/>
  <text x="537" y="207" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">everything downstream sees ASPRS codes only</text>
  <text x="20" y="252" font-size="10.5" fill="var(--dg-muted)">the second shape has one place to be wrong, and it is a file you can read</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL | 2.4+ for `filters.assign` with `value` expressions |
| The delivery report | the only authoritative statement of what the vendor's codes mean |
| A target schema | ASPRS LAS 1.4, unless you have a reason to differ |
| Output format | LAS 1.4, point format 6+, if any target code exceeds 31 |

The report row is not negotiable. Inferring a mapping from the data — "code 11 is probably ground because it is the most common" — is how a delivery's water class becomes ground and a lake ends up in the terrain model.

## Step-by-Step Implementation

### Step 1 — Write the mapping down as data

```json
{
  "vendor": "acme-2026",
  "source_schema": "ACME internal v3",
  "map": {"11": 2, "20": 5, "21": 6, "30": 9, "31": 7}
}
```

A JSON file beside the pipeline, versioned with it, is reviewable in a way that a chain of inline expressions is not.

### Step 2 — Order the rules so none can undo another

`filters.assign` applies its expressions in order, and each one sees the results of the previous. Mapping 11 to 2 and then 2 to 20 would send the first group through both rules. Two defences: process the mapping in an order where no target is also a source, or stage through a scratch dimension.

### Step 3 — Generate the assignments

```json
{"type": "filters.assign",
 "value": ["Classification = 2 WHERE Classification == 11",
           "Classification = 5 WHERE Classification == 20",
           "Classification = 6 WHERE Classification == 21"]}
```

### Step 4 — Assert only known codes survive

The check is the point of the exercise. A code that no rule matched is a code nobody has thought about.

## Complete Working Example

```python
"""Remap vendor classification codes to ASPRS, safely and verifiably."""
from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np
import pdal

LOG = logging.getLogger("remap")

ASPRS_ALLOWED = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18}


def order_safely(mapping: dict[int, int]) -> list[tuple[int, int]]:
    """Order rules so no rule's target is a later rule's source.

    When that is impossible the mapping has a cycle and must be staged through
    a scratch dimension instead; we detect it rather than producing silent nonsense.
    """
    remaining = dict(mapping)
    ordered: list[tuple[int, int]] = []
    while remaining:
        safe = [s for s, t in remaining.items() if t not in remaining]
        if not safe:
            raise ValueError(f"cyclic mapping, cannot order safely: {remaining}")
        for s in safe:
            ordered.append((s, remaining.pop(s)))
    return ordered


def remap(src: Path, dst: Path, mapping: dict[int, int]) -> dict:
    rules = [f"Classification = {t} WHERE Classification == {s}"
             for s, t in order_safely(mapping)]
    spec = json.dumps({"pipeline": [
        {"type": "readers.las", "filename": str(src)},
        {"type": "filters.assign", "value": rules},
        {"type": "writers.las", "filename": str(dst), "compression": "laszip",
         "minor_version": 4, "dataformat_id": 6, "forward": "all"},
    ]})
    written = pdal.Pipeline(spec).execute()

    check = pdal.Pipeline(json.dumps({"pipeline": [
        {"type": "readers.las", "filename": str(dst)}]}))
    check.execute()
    codes = np.unique(check.arrays[0]["Classification"])
    unexpected = sorted(set(int(c) for c in codes) - ASPRS_ALLOWED)
    if unexpected:
        raise AssertionError(f"codes outside the target schema survived: {unexpected}")

    LOG.info("%s → %s: %d points, codes %s", src.name, dst.name, written,
             sorted(int(c) for c in codes))
    return {"points": written, "codes": sorted(int(c) for c in codes)}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    spec_file = json.loads(Path("acme_mapping.json").read_text())
    table = {int(k): int(v) for k, v in spec_file["map"].items()}
    print(json.dumps(remap(Path("delivery/tile_0431.laz"),
                           Path("ingest/tile_0431.laz"), table), indent=2))
```

## Key Parameter Table

| Item | Choice | Why |
|---|---|---|
| `filters.assign` `value` | list of expressions | Applied in order; each sees the previous result |
| Rule ordering | targets never appear as later sources | Prevents a two-hop remap |
| Cyclic mappings | stage through a scratch dimension | Detected and refused by the example |
| `minor_version` | 4 | Required for any target code above 31 |
| `forward` | `all` | The delivery's other records are still worth keeping |

<svg viewBox="-2 50 724 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The mapping file becoming ordered rules and then an audited output" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>From a reviewable file to an audited result</title>
  <desc>The mapping lives in a JSON file that a person can review. A script orders the rules so none can undo another and refuses cyclic mappings outright. filters.assign applies them. The output is then checked against the target schema, and any code that no rule matched fails the run rather than passing quietly.</desc>
  <rect x="-2" y="50" width="724" height="195" fill="var(--dg-bg)" rx="10"/>
  <defs><marker id="rmf-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="20" y="72" width="150" height="52" rx="7" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="95" y="94" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">mapping.json</text>
  <text x="95" y="112" text-anchor="middle" font-size="9" fill="var(--dg-muted)">reviewable</text>
  <rect x="196" y="72" width="150" height="52" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="271" y="94" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">safe ordering</text>
  <text x="271" y="112" text-anchor="middle" font-size="9" fill="var(--dg-muted)">cycles refused</text>
  <rect x="372" y="72" width="150" height="52" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="447" y="94" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">filters.assign</text>
  <text x="447" y="112" text-anchor="middle" font-size="9" fill="var(--dg-muted)">one rule per entry</text>
  <rect x="548" y="72" width="152" height="52" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="624" y="94" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">schema audit</text>
  <text x="624" y="112" text-anchor="middle" font-size="9" fill="var(--dg-muted)">unknown code fails</text>
  <line x1="170" y1="98" x2="190" y2="98" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#rmf-arw)"/>
  <line x1="346" y1="98" x2="366" y2="98" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#rmf-arw)"/>
  <line x1="522" y1="98" x2="542" y2="98" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#rmf-arw)"/>
  <text x="20" y="176" font-size="10.5" fill="var(--dg-muted)">the only human decision is the first box, and it is a file in version control rather than a chain of</text>
  <text x="20" y="194" font-size="10.5" fill="var(--dg-muted)">inline expressions nobody can diff.</text>
  <text x="20" y="220" font-size="10.5" fill="var(--dg-muted)">Every other box is mechanical, which is what makes the last one trustworthy.</text>
</svg>

## Verification

**Only schema codes survive.** The assertion above, and the reason the whole script exists.

**Point counts are unchanged.** Remapping relabels; it must never remove a point.

**The class histogram is plausible.** Ground between roughly 25 and 55 percent on suburban terrain; a ground class of 2 percent after a remap means a rule missed.

<svg viewBox="0 0 720 252" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A two-hop remap caused by rule ordering, and the ordering that avoids it" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Why rule order is not cosmetic</title>
  <desc>Two orderings of the same two rules. Applying 11 to 2 first and then 2 to 20 sends the originally-11 points through both rules and out as 20. Reversing the order maps 2 to 20 first, so the points that become 2 afterwards are no longer matched by any rule and the result is correct.</desc>
  <rect x="0" y="0" width="720" height="252" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="38" font-size="11.5" font-weight="600" fill="var(--dg-e)">rules applied 11→2 then 2→20</text>
  <rect x="20" y="50" width="150" height="40" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.1"/>
  <text x="95" y="75" text-anchor="middle" font-size="11" fill="var(--dg-text)">points coded 11</text>
  <rect x="200" y="50" width="150" height="40" rx="6" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="275" y="75" text-anchor="middle" font-size="11" fill="var(--dg-text)">become 2</text>
  <rect x="380" y="50" width="150" height="40" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="455" y="75" text-anchor="middle" font-size="11" fill="var(--dg-text)">then become 20</text>
  <text x="546" y="75" font-size="10.5" fill="var(--dg-e)">ground lost entirely</text>
  <text x="20" y="140" font-size="11.5" font-weight="600" fill="var(--dg-d)">rules applied 2→20 then 11→2</text>
  <rect x="20" y="152" width="150" height="40" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.1"/>
  <text x="95" y="177" text-anchor="middle" font-size="11" fill="var(--dg-text)">points coded 11</text>
  <rect x="200" y="152" width="150" height="40" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.1"/>
  <text x="275" y="177" text-anchor="middle" font-size="11" fill="var(--dg-muted)">no rule matches yet</text>
  <rect x="380" y="152" width="150" height="40" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="455" y="177" text-anchor="middle" font-size="11" fill="var(--dg-text)">become 2, and stop</text>
  <text x="546" y="177" font-size="10.5" fill="var(--dg-d)">correct</text>
  <text x="20" y="228" font-size="10.5" fill="var(--dg-muted)">order rules so that no rule’s target appears as a later rule’s source; when that is impossible the mapping</text>
  <text x="20" y="244" font-size="10.5" fill="var(--dg-muted)">has a cycle and needs a scratch dimension rather than a cleverer ordering.</text>
</svg>

## Gotchas and Edge Cases

**Codes above 31 need LAS 1.4.** Writing a target of 64 into a point format 3 file loses the top bits into the classification flags — the layout described in [understanding ASPRS classification codes](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/understanding-asprs-classification-codes/).

**An unmapped code is a decision, not an omission.** Deciding to leave vendor code 44 alone is fine; leaving it alone because nobody noticed it is not. That is what the allow-list assertion is for.

**Remapping does not fix a wrong classification.** If the vendor labelled a bridge deck as ground, translating 11 to 2 faithfully preserves the error.

**Keep the original.** Store the delivery untouched and the remapped copy separately. The mapping will turn out to be wrong about something, and re-deriving it from a remapped file is impossible.

## Frequently Asked Questions

**Why not just handle the vendor codes downstream?**

Because every stage then has to know which supplier produced which tile, and one that forgets produces an empty result rather than an error. Translating once at ingest gives the pipeline a single vocabulary and one place to be wrong — a file you can read and review.

**Why does rule order matter?**

filters.assign applies expressions in sequence and each one sees the previous result. Mapping 11 to 2 and then 2 to 20 sends the originally-11 points through both rules. Ordering so that no rule target is a later rule source avoids it; a mapping where that is impossible has a cycle and needs a scratch dimension.

**Can I infer the mapping from the data?**

No. Guessing that the most common code is ground is how a delivery’s water class ends up in a terrain model. The delivery report is the only authoritative statement of what the numbers mean, and if it is missing the right move is to ask rather than to assume.

**Does remapping fix a bad classification?**

Not at all. It changes the labels, not the judgements behind them. If the supplier classified a bridge deck as ground, translating their ground code to 2 faithfully carries the error into your schema.

---

## Related

- [ASPRS Classification Codes](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/) — the standard the remap targets
- [Understanding ASPRS Classification Codes](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/understanding-asprs-classification-codes/) — the byte layout that limits codes to 31 in older formats
- [Metadata and Header Sync](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/metadata-header-sync/) — keeping the header consistent after a rewrite
- [Reading and Writing LAS VLRs with PDAL](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/reading-and-writing-las-vlrs-with-pdal/) — preserving the classification lookup record across the rewrite
- [Point Cloud Data Standards and Fundamentals](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/) — the section overview
