---
title: "Understanding LAS Point Data Record Formats"
description: "What LAS point data record formats 0 to 10 contain, how legacy formats 0–5 differ from LAS 1.4 formats 6–10, record sizes in bytes, which format to deliver, and how to inspect a file's format with laspy and PDAL."
slug: "understanding-las-point-data-record-formats"
type: "howto"
breadcrumb: "Point Data Record Formats"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Understanding LAS Point Data Record Formats",
      "description": "What LAS point data record formats 0 to 10 contain, how legacy formats 0\u20135 differ from LAS 1.4 formats 6\u201310, record sizes in bytes, which format to deliver, and how to inspect a file's format with laspy and PDAL.",
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
          "name": "LAS/LAZ File Structure",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Point Data Record Formats",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/understanding-las-point-data-record-formats/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Identify and choose a LAS point data record format",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Read the format ID",
          "text": "With laspy: laspy.open(path).header.point_format.id. With PDAL: pdal info --metadata path | jq .metadata.dataformat_id."
        },
        {
          "@type": "HowToStep",
          "name": "List the dimensions",
          "text": "header.point_format.dimension_names in laspy, or pdal info --schema, shows exactly which fields exist \u2014 including any extra-bytes dimensions appended after the standard record."
        },
        {
          "@type": "HowToStep",
          "name": "Map format to capabilities",
          "text": "Use the table below: colour, NIR, GPS time, waveform, classification range and flags."
        },
        {
          "@type": "HowToStep",
          "name": "Decide the delivery format",
          "text": "For new airborne deliveries, PDRF 6 without imagery, 7 with RGB, 8 with RGB and NIR. Use 9 or 10 only if full-waveform packets are genuinely delivered."
        },
        {
          "@type": "HowToStep",
          "name": "Convert when needed",
          "text": "laspy.convert or writers.las with dataformat_id changes the format; see upgrading LAS 1.2 files to LAS 1.4."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Which LAS point format should I use?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "For new data, a LAS 1.4 format: 6 without colour, 7 with RGB, 8 with RGB and near-infrared. These support the full classification range, the overlap flag and modern metadata. Use 9 or 10 only when delivering full-waveform data."
          }
        },
        {
          "@type": "Question",
          "name": "Why are my classification codes above 31 lost?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The file uses a legacy format, 0 to 5, whose classification field has only 5 bits. Convert to format 6 or later to store codes up to 255."
          }
        },
        {
          "@type": "Question",
          "name": "How do I find the point format of a LAS file?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Open it with laspy and read header.point_format.id, or run pdal info with the metadata flag and look at dataformat_id. Both read only the header."
          }
        },
        {
          "@type": "Question",
          "name": "Does LAZ compression change the point format?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. LAZ compresses the records of whatever format the file uses, and decompression restores them exactly. The format ID in the header is the same for the LAS and LAZ versions of a file, although LAS 1.4 formats 6 to 10 compress with a newer, layered LAZ scheme that older decoders cannot read."
          }
        },
        {
          "@type": "Question",
          "name": "What is the difference between format 6 and format 1?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Both have GPS time and no colour, but format 6 has a full-byte classification, a separate flags byte including overlap, a higher-resolution scan angle and a scanner channel field, and it is 30 bytes instead of 28."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** A LAS file's point data record format (PDRF) fixes which fields each point has and its size in bytes. Formats 0–5 are the legacy layouts (5-bit classification, 1-byte scan angle, GPS time optional); formats 6–10, introduced in LAS 1.4, have an 8-bit classification, a separate flags byte with an overlap bit, a 16-bit scan angle and mandatory GPS time. Deliver new data in PDRF 6 (no colour), 7 (RGB) or 8 (RGB + NIR); check any file with `laspy.open(path).header.point_format.id` or `pdal info --metadata`.

## Context and Motivation

This guide is part of [LAS/LAZ File Structure](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/). The point format is the single header value that most often explains confusing behaviour: why classification codes above 31 disappear, why there is no RGB when the vendor promised colour, why an overlap flag cannot be set, why a file is 30 percent larger than expected. Every LAS 1.4 specification requirement about classes, flags and GPS time is really a statement about PDRF 6–10, and most modern specifications — including the USGS Lidar Base Specification — require one of them.

<svg viewBox="0 0 740 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Record sizes of LAS point data record formats 0 to 10" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Eleven formats, two families</title>
  <desc>Horizontal bars of record size in bytes for formats 0 to 10. The legacy family: 0 is 20 bytes, 1 is 28, 2 is 26, 3 is 34, 4 is 57, 5 is 63. The LAS 1.4 family: 6 is 30, 7 is 36, 8 is 38, 9 is 59, 10 is 67. Formats 4, 5, 9 and 10 include waveform packet fields, which accounts for their size.</desc>
  <rect x="0" y="0" width="740" height="230" fill="var(--dg-bg)" rx="10"/>
  <g font-size="10.5" fill="var(--dg-text)"><text text-anchor="end" x="60" y="30">0</text><text text-anchor="end" x="60" y="48">1</text><text text-anchor="end" x="60" y="66">2</text><text text-anchor="end" x="60" y="84">3</text><text text-anchor="end" x="60" y="102">4</text><text text-anchor="end" x="60" y="120">5</text><text text-anchor="end" x="60" y="146">6</text><text text-anchor="end" x="60" y="164">7</text><text text-anchor="end" x="60" y="182">8</text><text text-anchor="end" x="60" y="200">9</text><text text-anchor="end" x="60" y="218">10</text></g>
  <g fill="var(--dg-surface-2)" stroke="var(--dg-line)" stroke-width="0.8"><rect x="70" y="20" width="160" height="12"/><rect x="70" y="38" width="224" height="12"/><rect x="70" y="56" width="208" height="12"/><rect x="70" y="74" width="272" height="12"/><rect x="70" y="92" width="456" height="12"/><rect x="70" y="110" width="504" height="12"/></g>
  <g fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="0.8"><rect x="70" y="136" width="240" height="12"/><rect x="70" y="154" width="288" height="12"/><rect x="70" y="172" width="304" height="12"/><rect x="70" y="190" width="472" height="12"/><rect x="70" y="208" width="536" height="12"/></g>
  <g font-size="10" fill="var(--dg-muted)"><text x="236" y="30">20 B</text><text x="300" y="48">28</text><text x="284" y="66">26</text><text x="348" y="84">34</text><text x="532" y="102">57</text><text x="580" y="120">63</text><text x="316" y="146">30</text><text x="364" y="164">36</text><text x="380" y="182">38</text><text x="548" y="200">59</text><text x="612" y="218">67</text></g>
  <text x="620" y="70" font-size="10.5" fill="var(--dg-text)">legacy 0–5</text>
  <text x="640" y="178" font-size="10.5" fill="var(--dg-text)">LAS 1.4: 6–10</text>
</svg>

## Prerequisites and Assumptions

- A LAS or LAZ file to inspect; laspy 2.x or PDAL.
- LAS 1.4 R15 as the reference specification; earlier versions support only formats 0–5.
- Awareness that LAZ compresses records, so file size on disk does not reveal the format directly.

## Step-by-Step Implementation

### Step 1 — Read the format ID

With laspy: `laspy.open(path).header.point_format.id`. With PDAL: `pdal info --metadata path | jq .metadata.dataformat_id`.

### Step 2 — List the dimensions

`header.point_format.dimension_names` in laspy, or `pdal info --schema`, shows exactly which fields exist — including any extra-bytes dimensions appended after the standard record.

### Step 3 — Map format to capabilities

Use the table below: colour, NIR, GPS time, waveform, classification range and flags.

### Step 4 — Decide the delivery format

For new airborne deliveries, PDRF 6 without imagery, 7 with RGB, 8 with RGB and NIR. Use 9 or 10 only if full-waveform packets are genuinely delivered.

### Step 5 — Convert when needed

`laspy.convert` or `writers.las` with `dataformat_id` changes the format; see [upgrading LAS 1.2 files to LAS 1.4](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/upgrading-las-1-2-files-to-las-1-4/).

## Complete Working Example

```python
"""Report point format details for every LAS/LAZ file in a folder."""
from __future__ import annotations

from pathlib import Path

import laspy

CAPS = {
    0: "base", 1: "base + GPS", 2: "base + RGB", 3: "base + GPS + RGB",
    4: "1 + waveform", 5: "3 + waveform",
    6: "1.4 base (GPS)", 7: "6 + RGB", 8: "7 + NIR", 9: "6 + waveform", 10: "8 + waveform",
}


def describe(path: Path) -> dict:
    with laspy.open(path) as f:
        h = f.header
        pf = h.point_format
        return {
            "file": path.name,
            "las": f"{h.version.major}.{h.version.minor}",
            "pdrf": pf.id,
            "record_bytes": pf.size,
            "standard_bytes": pf.num_standard_bytes,
            "extra_dims": list(pf.extra_dimension_names),
            "caps": CAPS.get(pf.id, "?"),
            "max_class": 31 if pf.id <= 5 else 255,
            "has_overlap_flag": pf.id >= 6,
            "points": h.point_count,
        }


if __name__ == "__main__":
    for p in sorted(Path("delivery").glob("*.la[sz]")):
        d = describe(p)
        warn = "  <-- legacy format" if d["pdrf"] <= 5 else ""
        print(f"{d['file']:<28} LAS {d['las']} PDRF {d['pdrf']:>2} "
              f"{d['record_bytes']:>3} B ({d['caps']}), extra {d['extra_dims']}{warn}")
```

The same information from PDAL for a single file:

```bash
pdal info --metadata delivery/t_0431.laz | jq '.metadata | {minor_version, dataformat_id, point_length, count}'
```

<svg viewBox="0 0 600 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="How classification and flags are packed in legacy versus LAS 1.4 formats" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Where classification lives</title>
  <desc>Two byte diagrams. In formats 0 to 5, one byte holds a 5-bit classification plus synthetic, key-point and withheld flag bits, so classes are limited to 0 to 31. In formats 6 to 10, a full byte holds classification from 0 to 255, and a separate byte holds four classification flags — synthetic, key-point, withheld and overlap — plus scanner channel and scan direction bits.</desc>
  <rect x="0" y="0" width="600" height="210" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="40" font-size="11" font-weight="600" fill="var(--dg-text)">PDRF 0–5</text>
  <g stroke="var(--dg-line)" stroke-width="1"><rect x="140" y="24" width="200" height="30" fill="var(--dg-surface-2)"/><rect x="340" y="24" width="40" height="30" fill="var(--dg-c-soft)"/><rect x="380" y="24" width="40" height="30" fill="var(--dg-c-soft)"/><rect x="420" y="24" width="40" height="30" fill="var(--dg-c-soft)"/></g>
  <text x="240" y="44" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">class, 5 bits (0–31)</text>
  <text x="360" y="44" text-anchor="middle" font-size="10" fill="var(--dg-text)">S</text>
  <text x="400" y="44" text-anchor="middle" font-size="10" fill="var(--dg-text)">K</text>
  <text x="440" y="44" text-anchor="middle" font-size="10" fill="var(--dg-text)">W</text>
  <text x="480" y="44" font-size="10.5" fill="var(--dg-muted)">one byte shared</text>
  <text x="20" y="120" font-size="11" font-weight="600" fill="var(--dg-text)">PDRF 6–10</text>
  <g stroke="var(--dg-line)" stroke-width="1"><rect x="140" y="104" width="320" height="30" fill="var(--dg-a-soft)"/></g>
  <text x="300" y="124" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">classification, full byte (0–255)</text>
  <g stroke="var(--dg-line)" stroke-width="1"><rect x="140" y="146" width="40" height="30" fill="var(--dg-c-soft)"/><rect x="180" y="146" width="40" height="30" fill="var(--dg-c-soft)"/><rect x="220" y="146" width="40" height="30" fill="var(--dg-c-soft)"/><rect x="260" y="146" width="40" height="30" fill="var(--dg-d-soft)"/><rect x="300" y="146" width="160" height="30" fill="var(--dg-surface-2)"/></g>
  <text x="160" y="166" text-anchor="middle" font-size="10" fill="var(--dg-text)">S</text>
  <text x="200" y="166" text-anchor="middle" font-size="10" fill="var(--dg-text)">K</text>
  <text x="240" y="166" text-anchor="middle" font-size="10" fill="var(--dg-text)">W</text>
  <text x="280" y="166" text-anchor="middle" font-size="10" fill="var(--dg-text)">O</text>
  <text x="380" y="166" text-anchor="middle" font-size="10" fill="var(--dg-text)">channel, scan dir, edge</text>
  <text x="480" y="166" font-size="10.5" fill="var(--dg-muted)">separate flags byte</text>
  <text x="20" y="200" font-size="10.5" fill="var(--dg-muted)">S synthetic · K key-point · W withheld · O overlap (new in 1.4)</text>
</svg>

## Key Parameter Table

| PDRF | Bytes | GPS time | RGB | NIR | Waveform | Class range | Overlap flag |
|---|---|---|---|---|---|---|---|
| 0 | 20 | — | — | — | — | 0–31 | — |
| 1 | 28 | yes | — | — | — | 0–31 | — |
| 2 | 26 | — | yes | — | — | 0–31 | — |
| 3 | 34 | yes | yes | — | — | 0–31 | — |
| 4 | 57 | yes | — | — | yes | 0–31 | — |
| 5 | 63 | yes | yes | — | yes | 0–31 | — |
| 6 | 30 | yes | — | — | — | 0–255 | yes |
| 7 | 36 | yes | yes | — | — | 0–255 | yes |
| 8 | 38 | yes | yes | yes | — | 0–255 | yes |
| 9 | 59 | yes | — | — | yes | 0–255 | yes |
| 10 | 67 | yes | yes | yes | yes | 0–255 | yes |

Extra-bytes dimensions add to these sizes; `point_format.size` reports the total record length.

## Verification

- **Header and data agree.** The header's point record length equals the format's standard size plus the extra-bytes size. A mismatch means extra bytes are undeclared, which some readers reject.
- **Classes fit the format.** In PDRF 0–5 files, the maximum classification is 31. Values above that mean the file was written incorrectly or read with the wrong format.
- **Consistent across a delivery.** Every tile in a project should share version and PDRF; mixed formats complicate merging and QA.

## Gotchas and Edge Cases

**LAS 1.4 with legacy formats.** LAS 1.4 files may still use PDRF 0–5 for compatibility. Version 1.4 alone does not guarantee 8-bit classification; check the format.

**Scan angle units differ.** Formats 0–5 store a signed byte in whole degrees ("scan angle rank"); 6–10 store a 16-bit value in 0.006° increments. Libraries expose both as degrees, but scripts that read raw values must know which.

**Waveform formats without waveforms.** Some software writes PDRF 9 or 10 with empty waveform packets. It wastes 29 bytes per point; convert to 6 or 8 unless waveforms are delivered.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Storage cost of carrying unused waveform fields" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Unused fields still cost bytes</title>
  <desc>Uncompressed size for 100 million points in three formats. PDRF 6 needs 3.0 gigabytes. PDRF 8 needs 3.8 gigabytes because of colour and NIR. PDRF 10 with empty waveform fields needs 6.7 gigabytes, more than double PDRF 6 for no additional information.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <text x="180" y="46" text-anchor="end" font-size="11" fill="var(--dg-text)">PDRF 6</text>
  <rect x="190" y="32" width="200" height="22" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/>
  <text x="398" y="48" font-size="10.5" fill="var(--dg-muted)">3.0 GB</text>
  <text x="180" y="90" text-anchor="end" font-size="11" fill="var(--dg-text)">PDRF 8</text>
  <rect x="190" y="76" width="253" height="22" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/>
  <text x="451" y="92" font-size="10.5" fill="var(--dg-muted)">3.8 GB</text>
  <text x="180" y="134" text-anchor="end" font-size="11" fill="var(--dg-text)">PDRF 10, empty waveforms</text>
  <rect x="190" y="120" width="446" height="22" fill="var(--dg-e-soft)" stroke="var(--dg-e)"/>
  <text x="644" y="136" font-size="10.5" fill="var(--dg-muted)">6.7 GB</text>
  <text x="190" y="162" font-size="10.5" fill="var(--dg-muted)">100 million points, uncompressed LAS</text>
</svg>

**RGB in PDRF 6.** There is no colour field in PDRF 6. Colour added by photogrammetry or colourization must be written to 7 or 8, or it is silently dropped by writers.

## Frequently Asked Questions

**Which LAS point format should I use?**

For new data, a LAS 1.4 format: 6 without colour, 7 with RGB, 8 with RGB and near-infrared. These support the full classification range, the overlap flag and modern metadata. Use 9 or 10 only when delivering full-waveform data.

**Why are my classification codes above 31 lost?**

The file uses a legacy format, 0 to 5, whose classification field has only 5 bits. Convert to format 6 or later to store codes up to 255.

**How do I find the point format of a LAS file?**

Open it with laspy and read header.point_format.id, or run pdal info with the metadata flag and look at dataformat_id. Both read only the header.

**Does LAZ compression change the point format?**

No. LAZ compresses the records of whatever format the file uses, and decompression restores them exactly. The format ID in the header is the same for the LAS and LAZ versions of a file, although LAS 1.4 formats 6 to 10 compress with a newer, layered LAZ scheme that older decoders cannot read.

**What is the difference between format 6 and format 1?**

Both have GPS time and no colour, but format 6 has a full-byte classification, a separate flags byte including overlap, a higher-resolution scan angle and a scanner channel field, and it is 30 bytes instead of 28.

## Related

- [LAS/LAZ File Structure](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/) — header, VLRs and records
- [Upgrading LAS 1.2 Files to LAS 1.4](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/upgrading-las-1-2-files-to-las-1-4/) — converting legacy formats
- [How to Parse LAS Headers with Python](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/how-to-parse-las-headers-with-python/) — reading the format ID yourself
- [Flagging Overlap and Withheld Points](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/flagging-overlap-and-withheld-points/) — the flags byte in use
- [Estimating PDAL Memory from Point Layout](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/estimating-pdal-memory-from-point-layout/) — record size versus in-memory size
