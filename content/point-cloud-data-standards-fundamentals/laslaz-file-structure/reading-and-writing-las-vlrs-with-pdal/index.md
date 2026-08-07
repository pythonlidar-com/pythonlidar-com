---
title: "Reading and Writing LAS VLRs with PDAL"
description: "Inspect variable length records with pdal info and laspy, preserve them across conversions with forward, and stamp your own provenance record with the writers.las vlrs option."
slug: "reading-and-writing-las-vlrs-with-pdal"
type: "howto"
breadcrumb: "Reading and Writing LAS VLRs"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Reading and Writing LAS VLRs with PDAL",
      "description": "Inspect variable length records with pdal info and laspy, preserve them across conversions with forward, and stamp your own provenance record with the writers.las vlrs option.",
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
          "name": "LAS/LAZ File Structure",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Reading and Writing LAS VLRs",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/reading-and-writing-las-vlrs-with-pdal/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Read, preserve and write LAS variable length records with PDAL",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Inspect the existing records",
          "text": "List user id, record id and payload size with pdal info --metadata or laspy header.vlrs."
        },
        {
          "@type": "HowToStep",
          "name": "Preserve records across a conversion",
          "text": "Set forward to all on writers.las so header fields and records from the source are copied."
        },
        {
          "@type": "HowToStep",
          "name": "Add your own record",
          "text": "Supply a vlrs array with a user id you own, a record id above 1000, and base64-encoded payload data."
        },
        {
          "@type": "HowToStep",
          "name": "Use an extended record for large payloads",
          "text": "Anything over 65,535 bytes must go after the point block, which requires LAS 1.4."
        },
        {
          "@type": "HowToStep",
          "name": "Assert nothing was dropped",
          "text": "Compare the set of user id and record id pairs before and after the conversion and fail if any are missing."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is actually stored in a VLR?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Anything the fixed header cannot express: the coordinate reference system as OGC WKT or GeoTIFF keys, the extra-bytes descriptor that names and types custom dimensions, classification lookup tables, and vendor processing history. Losing them produces a file that opens fine and no longer knows what its own dimensions are called."
          }
        },
        {
          "@type": "Question",
          "name": "Why did my conversion lose its VLRs?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because the writer was not told to forward them. Without forward set, writers.las builds a header from what the pipeline computed and carries nothing else across. Setting forward to all, together with extra_dims all, is the safe default for any archival conversion."
          }
        },
        {
          "@type": "Question",
          "name": "What is the difference between a VLR and an EVLR?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Position and size. Variable length records sit between the header and the point block and are capped at 65,535 bytes of payload. Extended records sit after the points, have a 64-bit length field, and exist only in LAS 1.4 \u2014 so writing a 1.4 file down to 1.2 discards them."
          }
        },
        {
          "@type": "Question",
          "name": "How do I choose a record id that will not collide?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Use a user id that belongs to you rather than LASF_Spec or LASF_Projection, and a record id above 1000. Identifiers are only unique within a user id, so the pair is what matters and matching on the number alone will eventually surprise you."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Read variable length records with `pdal info --metadata` or `laspy`'s `header.vlrs`, write them with `forward: "all"` on the writer to preserve what came in, and add your own with `writers.las` `vlrs` — a JSON array of records with `user_id`, `record_id` and base64 `data`.

## Context and Motivation

This guide is part of [LAS/LAZ File Structure](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/), which describes the binary layout. Variable length records are the extension mechanism inside that layout: a list of typed blobs sitting between the public header and the point records, where everything the fixed header cannot express ends up.

That includes things you cannot afford to lose. The coordinate reference system lives in a VLR. So does the extra-bytes descriptor that names and types every custom dimension in the file. So do classification lookup tables, flight-line metadata and whatever the vendor's processing software chose to record about how the cloud was produced. A conversion that drops VLRs produces a file that opens perfectly and has forgotten what its own dimensions are called — which is why `forward: "all"` appears in nearly every writer configuration on this site.

<svg viewBox="0 0 720 252" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Where variable length records sit in a LAS file and what the common ones carry" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>The records between the header and the points</title>
  <desc>A LAS file laid out left to right: the public header, then a run of variable length records, then the point records, then extended VLRs after them. The VLR block is expanded to show four common records: the OGC WKT coordinate system, the extra bytes descriptor, a classification lookup table and a vendor-specific processing record.</desc>
  <rect x="0" y="0" width="720" height="252" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="44" width="110" height="46" rx="5" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="75" y="72" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">public header</text>
  <rect x="136" y="44" width="230" height="46" rx="5" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.6"/>
  <text x="251" y="72" text-anchor="middle" font-size="10.5" font-weight="600" fill="var(--dg-text)">variable length records</text>
  <rect x="372" y="44" width="240" height="46" rx="5" fill="var(--dg-surface-2)" stroke="var(--dg-line-soft)" stroke-width="1.3"/>
  <text x="492" y="72" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">point records</text>
  <rect x="618" y="44" width="82" height="46" rx="5" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="659" y="72" text-anchor="middle" font-size="10" fill="var(--dg-text)">EVLRs</text>
  <path d="M136 90 L60 124" fill="none" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <path d="M366 90 L690 124" fill="none" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <rect x="40" y="128" width="310" height="34" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="54" y="150" font-size="10.5" fill="var(--dg-text)">LASF_Projection · 2112 — OGC WKT</text>
  <rect x="370" y="128" width="310" height="34" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="384" y="150" font-size="10.5" fill="var(--dg-text)">LASF_Spec · 4 — extra bytes descriptor</text>
  <rect x="40" y="168" width="310" height="34" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="54" y="190" font-size="10.5" fill="var(--dg-text)">LASF_Spec · 0 — classification lookup</text>
  <rect x="370" y="168" width="310" height="34" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="384" y="190" font-size="10.5" fill="var(--dg-text)">vendor id · 1000+ — processing history</text>
  <text x="40" y="228" font-size="10.5" fill="var(--dg-muted)">a record is identified by the pair (user_id, record_id) — the user_id namespaces the number, so 4 means one thing</text>
  <text x="40" y="244" font-size="10.5" fill="var(--dg-muted)">under LASF_Spec and something else entirely under a vendor’s own identifier.</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL | 2.4+ for `vlrs` on `writers.las` |
| `laspy` | 2.x, for inspecting records outside a pipeline |
| A file with records worth keeping | most delivered tiles have at least the projection VLR |
| base64 | VLR payloads in pipeline JSON are base64-encoded bytes |

## Step-by-Step Implementation

### Step 1 — See what is there

```bash
pdal info tile_0431.laz --metadata | python -m json.tool | grep -A4 vlr
```

`laspy` gives a friendlier view when you want to look at payloads:

```python
import laspy
with laspy.open("tile_0431.laz") as fh:
    for vlr in fh.header.vlrs:
        print(vlr.user_id, vlr.record_id, len(vlr.record_data), vlr.description)
```

### Step 2 — Preserve what you did not create

```json
{"type": "writers.las", "filename": "out.laz", "forward": "all", "extra_dims": "all"}
```

`forward` copies header fields and records from the source; without it a conversion is a quiet amputation.

### Step 3 — Add your own record

```json
{
  "type": "writers.las",
  "filename": "out.laz",
  "vlrs": [{
    "description": "processing run id",
    "user_id": "PYLIDAR",
    "record_id": 1200,
    "data": "cnVuPTIwMjYtMDgtMDdUMDk6MTQ6MjJa"
  }]
}
```

Choose a `user_id` that is yours and a `record_id` above 1000 so it cannot collide with the reserved ranges.

### Step 4 — Prefer an EVLR for anything large

Records before the point block are limited to 65,535 bytes. Anything bigger — a full processing log, a large lookup table — belongs in an extended record after the points, which LAS 1.4 supports and 1.2 does not.

## Complete Working Example

```python
"""Copy a tile, preserving its VLRs and stamping a provenance record of our own."""
from __future__ import annotations

import base64
import json
from pathlib import Path

import laspy
import pdal


def provenance_vlr(run_id: str, pipeline_sha: str) -> dict:
    payload = json.dumps({"run_id": run_id, "pipeline_sha256": pipeline_sha}).encode()
    return {
        "description": "pythonlidar provenance",
        "user_id": "PYLIDAR",
        "record_id": 1200,
        "data": base64.b64encode(payload).decode("ascii"),
    }


def convert(src: Path, dst: Path, run_id: str, pipeline_sha: str) -> int:
    spec = json.dumps({"pipeline": [
        {"type": "readers.las", "filename": str(src)},
        {"type": "filters.range", "limits": "Classification![7:7]"},
        {"type": "writers.las", "filename": str(dst), "compression": "laszip",
         "minor_version": 4, "dataformat_id": 6,
         "forward": "all", "extra_dims": "all",
         "vlrs": [provenance_vlr(run_id, pipeline_sha)]},
    ]})
    return pdal.Pipeline(spec).execute()


def audit(path: Path) -> list[tuple[str, int, int]]:
    with laspy.open(str(path)) as fh:
        return [(v.user_id, v.record_id, len(v.record_data)) for v in fh.header.vlrs]


if __name__ == "__main__":
    src, dst = Path("tile_0431.laz"), Path("tile_0431_clean.laz")
    before = audit(src)
    convert(src, dst, run_id="2026-08-07T09:14:22Z", pipeline_sha="9f2c…")
    after = audit(dst)

    lost = {(u, r) for u, r, _ in before} - {(u, r) for u, r, _ in after}
    assert not lost, f"records dropped by the conversion: {sorted(lost)}"
    print(json.dumps({"before": before, "after": after}, indent=2))
```

<svg viewBox="0 0 720 244" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The byte layout of one variable length record header" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>One record, six fields, 54 bytes of header</title>
  <desc>The fixed part of a variable length record: two reserved bytes, a sixteen-byte user identifier, a two-byte record identifier, a two-byte payload length, and a thirty-two byte description. The payload follows, up to 65,535 bytes. Identity is the user identifier and record identifier together, not the number alone.</desc>
  <rect x="0" y="0" width="720" height="244" fill="var(--dg-bg)" rx="10"/>
  <rect x="24" y="64" width="72" height="64" rx="5" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="60" y="92" text-anchor="middle" font-size="9.5" fill="var(--dg-text)">reserved</text>
  <text x="60" y="112" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">2 B</text>
  <rect x="102" y="64" width="88" height="64" rx="5" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="146" y="92" text-anchor="middle" font-size="9.5" fill="var(--dg-text)">user_id</text>
  <text x="146" y="112" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">16 B</text>
  <rect x="196" y="64" width="72" height="64" rx="5" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="232" y="92" text-anchor="middle" font-size="9.5" fill="var(--dg-text)">record_id</text>
  <text x="232" y="112" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">2 B</text>
  <rect x="274" y="64" width="72" height="64" rx="5" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="310" y="92" text-anchor="middle" font-size="9.5" fill="var(--dg-text)">record_length_</text>
  <text x="310" y="112" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">2 B</text>
  <rect x="352" y="64" width="152" height="64" rx="5" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="428" y="92" text-anchor="middle" font-size="9.5" fill="var(--dg-text)">description</text>
  <text x="428" y="112" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">32 B</text>
  <rect x="510" y="64" width="96" height="64" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="558" y="92" text-anchor="middle" font-size="9.5" fill="var(--dg-text)">payload</text>
  <text x="558" y="112" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">up to 65,535 B</text>
  <text x="24" y="46" font-size="10.5" fill="var(--dg-muted)">the record header, then the payload — repeated once per record</text>
  <line x1="30" y1="152" x2="182" y2="152" stroke="var(--dg-a)" stroke-width="2.4"/>
  <text x="30" y="176" font-size="10.5" fill="var(--dg-a)">identity is this pair — user_id namespaces record_id</text>
  <text x="24" y="212" font-size="10.5" fill="var(--dg-muted)">an extended record uses the same fields with a 64-bit length, and lives after the point block instead of before it,</text>
  <text x="24" y="230" font-size="10.5" fill="var(--dg-muted)">which is why LAS 1.2 cannot carry one at all.</text>
</svg>

## Key Parameter Table

| Option | Stage | Meaning |
|---|---|---|
| `forward` | `writers.las` | Which header fields and records to copy from the source; `all` is the safe default |
| `vlrs` | `writers.las` | Array of records to add, each with `user_id`, `record_id`, `description`, base64 `data` |
| `extra_dims` | `writers.las` | Custom dimensions to write, which also writes the extra-bytes descriptor record |
| `minor_version` | `writers.las` | Must be 4 for extended records after the point block |
| `record_id` | per record | Below 1000 is reserved under `LASF_Spec`; use your own namespace above it |

## Verification

**Nothing was dropped.** The assertion in the example compares the record set before and against after, keyed by `(user_id, record_id)`.

**The projection record survived.** `pdal info --metadata` should still report a spatial reference on the output. Losing it is the most consequential VLR failure and the easiest to miss — see [coordinate reference systems](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/).

**Your record round-trips.** Read it back with `laspy`, base64-decode, and parse. A record that writes without error and cannot be decoded is worse than no record.

<svg viewBox="0 0 720 268" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="What survives a conversion to LAS 1.4 against a conversion down to LAS 1.2" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>forward: all does not mean everything survives</title>
  <desc>Five things a file carries, checked against two conversion targets. Writing to LAS 1.4 keeps all five. Writing down to LAS 1.2 keeps the points and the projection record, drops the extra-bytes descriptor and any extended records, and truncates classification codes above 31 — all without raising an error.</desc>
  <rect x="0" y="0" width="720" height="268" fill="var(--dg-bg)" rx="10"/>
  <text x="440" y="48" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">→ LAS 1.4</text>
  <text x="600" y="48" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">→ LAS 1.2</text>
  <rect x="20" y="58" width="330" height="30" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="34" y="78" font-size="11" fill="var(--dg-text)">point records</text>
  <rect x="370" y="58" width="140" height="30" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="440" y="78" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">kept</text>
  <rect x="530" y="58" width="140" height="30" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="600" y="78" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">kept</text>
  <rect x="20" y="96" width="330" height="30" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="34" y="116" font-size="11" fill="var(--dg-text)">projection VLR</text>
  <rect x="370" y="96" width="140" height="30" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="440" y="116" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">kept</text>
  <rect x="530" y="96" width="140" height="30" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="600" y="116" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">kept</text>
  <rect x="20" y="134" width="330" height="30" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="34" y="154" font-size="11" fill="var(--dg-text)">extra bytes VLR</text>
  <rect x="370" y="134" width="140" height="30" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="440" y="154" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">kept</text>
  <rect x="530" y="134" width="140" height="30" rx="5" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.1"/>
  <text x="600" y="154" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">dropped</text>
  <rect x="20" y="172" width="330" height="30" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="34" y="192" font-size="11" fill="var(--dg-text)">EVLRs</text>
  <rect x="370" y="172" width="140" height="30" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="440" y="192" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">kept</text>
  <rect x="530" y="172" width="140" height="30" rx="5" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.1"/>
  <text x="600" y="192" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">dropped</text>
  <rect x="20" y="210" width="330" height="30" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="34" y="230" font-size="11" fill="var(--dg-text)">classification > 31</text>
  <rect x="370" y="210" width="140" height="30" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="440" y="230" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">kept</text>
  <rect x="530" y="210" width="140" height="30" rx="5" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.1"/>
  <text x="600" y="230" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">truncated</text>
  <text x="20" y="262" font-size="10.5" fill="var(--dg-muted)">every red cell is a silent loss — the conversion exits zero and the file opens without complaint</text>
</svg>

## Gotchas and Edge Cases

**`forward: "all"` does not forward everything.** It copies what the writer can legitimately carry into the target version. Writing a 1.4 file down to 1.2 drops extended records with no error, because there is nowhere to put them.

**Record identifiers are only unique within a user identifier.** Two vendors may both use record 1001 for different things. Always match on the pair.

**LAZ compresses the points, not the records.** A large VLR is stored uncompressed, so a megabyte of embedded metadata is a megabyte in every copy of the tile.

## Frequently Asked Questions

**What is actually stored in a VLR?**

Anything the fixed header cannot express: the coordinate reference system as OGC WKT or GeoTIFF keys, the extra-bytes descriptor that names and types custom dimensions, classification lookup tables, and vendor processing history. Losing them produces a file that opens fine and no longer knows what its own dimensions are called.

**Why did my conversion lose its VLRs?**

Because the writer was not told to forward them. Without forward set, writers.las builds a header from what the pipeline computed and carries nothing else across. Setting forward to all, together with extra_dims all, is the safe default for any archival conversion.

**What is the difference between a VLR and an EVLR?**

Position and size. Variable length records sit between the header and the point block and are capped at 65,535 bytes of payload. Extended records sit after the points, have a 64-bit length field, and exist only in LAS 1.4 — so writing a 1.4 file down to 1.2 discards them.

**How do I choose a record id that will not collide?**

Use a user id that belongs to you rather than LASF_Spec or LASF_Projection, and a record id above 1000. Identifiers are only unique within a user id, so the pair is what matters and matching on the number alone will eventually surprise you.

---

## Related

- [LAS/LAZ File Structure](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/) — the binary layout these records live inside
- [Converting LAS to LAZ with PDAL](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/converting-las-to-laz-with-pdal/) — the conversion where forward matters most
- [How to Parse LAS Headers with Python](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/how-to-parse-las-headers-with-python/) — reading the fixed header that precedes the records
- [Coordinate Reference Systems](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/) — the record whose loss costs the most
- [Metadata and Header Sync](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/metadata-header-sync/) — keeping the header honest across a pipeline
