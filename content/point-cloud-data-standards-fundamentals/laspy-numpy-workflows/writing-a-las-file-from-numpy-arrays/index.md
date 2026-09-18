---
title: "Writing a LAS File from NumPy Arrays"
description: "Create valid LAS 1.4 and LAZ files from NumPy arrays with laspy: choosing a point format, setting scales and offsets that preserve precision without integer overflow, adding extra dimensions, attaching a CRS, and checking the result."
slug: "writing-a-las-file-from-numpy-arrays"
type: "howto"
breadcrumb: "Writing LAS from NumPy"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Writing a LAS File from NumPy Arrays",
      "description": "Create valid LAS 1.4 and LAZ files from NumPy arrays with laspy: choosing a point format, setting scales and offsets that preserve precision without integer overflow, adding extra dimensions, attaching a CRS, and checking the result.",
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
          "name": "laspy and NumPy Workflows",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Writing LAS from NumPy",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/writing-a-las-file-from-numpy-arrays/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Write a LAS 1.4 file from NumPy arrays with laspy",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Create a header with version and point format",
          "text": "laspy.LasHeader(point_format=6, version=\"1.4\")."
        },
        {
          "@type": "HowToStep",
          "name": "Set scales from required precision",
          "text": "Millimetre precision is 0.001; centimetre is 0.01. Finer than needed costs nothing in LAS but makes LAZ compress less well."
        },
        {
          "@type": "HowToStep",
          "name": "Set offsets near the data",
          "text": "Use a round number just below the minimum of each axis, for example np.floor(x.min() / 1000) 1000. That keeps stored integers small, positive and well within range."
        },
        {
          "@type": "HowToStep",
          "name": "Register extra dimensions and the CRS",
          "text": "header.add_extra_dim(laspy.ExtraBytesParams(name=..., type=...)) for each custom field, and header.add_crs(pyproj.CRS(\"EPSG:6347+5703\")) for the spatial reference."
        },
        {
          "@type": "HowToStep",
          "name": "Fill and write",
          "text": "Create laspy.LasData(header), assign coordinates and attributes, and write. laspy computes header counts and bounds on write."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How do I create a LAS file from NumPy arrays in Python?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Create a laspy LasHeader with the version and point format, set scales and offsets, optionally add extra dimensions and a CRS, build a LasData from the header, assign the coordinate and attribute arrays, and call write with a .las or .laz filename."
          }
        },
        {
          "@type": "Question",
          "name": "What scale and offset should I use?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Choose the scale from the precision you need, commonly 0.001 or 0.01 metres, and set each offset to a round value just below that axis's minimum. That preserves precision and keeps the stored integers well within the 32-bit range."
          }
        },
        {
          "@type": "Question",
          "name": "How do I add a custom attribute to a LAS file?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Register it on the header with add_extra_dim, giving a name, a NumPy type and optionally a description, then assign values to the field of that name before writing."
          }
        },
        {
          "@type": "Question",
          "name": "How do I set the CRS when writing with laspy?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Call add_crs on the header with a pyproj CRS object, ideally a compound CRS with both horizontal and vertical components. laspy writes it as a WKT record, which LAS 1.4 readers such as PDAL recognize."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Create `laspy.LasHeader(point_format=6, version="1.4")`, set `header.scales` to your precision (0.001 for millimetres) and `header.offsets` to a round value near the data minimum, add any extra dimensions, attach a CRS with `header.add_crs(pyproj.CRS(...))`, then build `laspy.LasData(header)`, assign `las.x`, `las.y`, `las.z` and attributes, and `las.write("out.laz")`. Get the offset wrong and coordinates overflow the 32-bit integers LAS stores; get the scale wrong and you lose precision silently.

## Context and Motivation

This guide is part of [laspy and NumPy Workflows for LAS Data](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/). Points created in Python — simulated scenes for tests, photogrammetry exports, model outputs, results of a custom filter — usually need to end up in a LAS or LAZ file so that GIS software, viewers and PDAL can use them. laspy makes the mechanics easy, but LAS has two properties that punish carelessness. Coordinates are stored as 32-bit integers scaled and offset per axis, so the header's scale and offset decide both precision and the representable range. And the point format fixes which fields exist; assigning colour to a format without colour simply is not possible.

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Choosing scale and offset so coordinates fit in 32-bit integers" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Scale sets precision; offset sets range</title>
  <desc>A number line of stored integers from minus 2.1 billion to plus 2.1 billion. With scale 0.001 and offset zero, a UTM northing of 4,471,380 metres needs 4.47 billion units, overflowing the range. With the same scale and an offset of 4,400,000 metres, the same northing needs only 71 million units and fits comfortably.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <line x1="60" y1="70" x2="680" y2="70" stroke="var(--dg-line)" stroke-width="1.5"/>
  <line x1="60" y1="60" x2="60" y2="80" stroke="var(--dg-line)" stroke-width="1.5"/>
  <line x1="370" y1="60" x2="370" y2="80" stroke="var(--dg-line)" stroke-width="1.5"/>
  <line x1="680" y1="60" x2="680" y2="80" stroke="var(--dg-line)" stroke-width="1.5"/>
  <text x="60" y="98" text-anchor="middle" font-size="10" fill="var(--dg-muted)">−2.1 B</text>
  <text x="370" y="98" text-anchor="middle" font-size="10" fill="var(--dg-muted)">0</text>
  <text x="680" y="98" text-anchor="middle" font-size="10" fill="var(--dg-muted)">+2.1 B</text>
  <text x="60" y="40" font-size="10.5" fill="var(--dg-muted)">int32 range available for each stored coordinate</text>
  <path d="M672 132 L716 132" stroke="var(--dg-e)" stroke-width="2.4"/>
  <text x="664" y="136" text-anchor="end" font-size="10.5" fill="var(--dg-e)">offset 0: 4.47 B units — overflow</text>
  <circle cx="380" cy="170" r="5" fill="var(--dg-d)"/>
  <text x="392" y="174" font-size="10.5" fill="var(--dg-text)">offset 4,400,000: 71 M units — fits</text>
  <text x="60" y="200" font-size="10.5" fill="var(--dg-muted)">northing 4,471,380 m at scale 0.001</text>
</svg>

## Prerequisites and Assumptions

- laspy 2.x (with `lazrs` for LAZ output) and pyproj for the CRS.
- Coordinates in a projected CRS in metres (or a known unit), as float64.
- A decision on point format: 6 for plain LAS 1.4, 7 with RGB, 8 with RGB and NIR.

## Step-by-Step Implementation

### Step 1 — Create a header with version and point format

`laspy.LasHeader(point_format=6, version="1.4")`.

### Step 2 — Set scales from required precision

Millimetre precision is `0.001`; centimetre is `0.01`. Finer than needed costs nothing in LAS but makes LAZ compress less well.

### Step 3 — Set offsets near the data

Use a round number just below the minimum of each axis, for example `np.floor(x.min() / 1000) * 1000`. That keeps stored integers small, positive and well within range.

### Step 4 — Register extra dimensions and the CRS

`header.add_extra_dim(laspy.ExtraBytesParams(name=..., type=...))` for each custom field, and `header.add_crs(pyproj.CRS("EPSG:6347+5703"))` for the spatial reference.

### Step 5 — Fill and write

Create `laspy.LasData(header)`, assign coordinates and attributes, and write. laspy computes header counts and bounds on write.

## Complete Working Example

```python
"""Write a LAS 1.4 / PDRF 7 LAZ from NumPy arrays with an extra dimension and a CRS."""
from __future__ import annotations

import laspy
import numpy as np
from pyproj import CRS


def write_las(path: str, x: np.ndarray, y: np.ndarray, z: np.ndarray, *,
              rgb: np.ndarray | None = None, classification: np.ndarray | None = None,
              confidence: np.ndarray | None = None, crs: str = "EPSG:6347+5703",
              scale: float = 0.001) -> None:
    fmt = 7 if rgb is not None else 6
    header = laspy.LasHeader(point_format=fmt, version="1.4")
    header.scales = np.array([scale, scale, scale])
    header.offsets = np.array([np.floor(x.min() / 1000) * 1000,
                               np.floor(y.min() / 1000) * 1000,
                               np.floor(z.min() / 100) * 100])
    if confidence is not None:
        header.add_extra_dim(laspy.ExtraBytesParams(
            name="confidence", type=np.float32, description="model score 0-1"))
    header.add_crs(CRS.from_user_input(crs))

    las = laspy.LasData(header)
    las.x, las.y, las.z = x, y, z
    n = x.size
    las.return_number = np.ones(n, dtype=np.uint8)
    las.number_of_returns = np.ones(n, dtype=np.uint8)
    las.classification = classification if classification is not None else np.ones(n, np.uint8)
    if rgb is not None:
        las.red, las.green, las.blue = (rgb.astype(np.uint16) * 257).T   # 8-bit to 16-bit
    if confidence is not None:
        las.confidence = confidence.astype(np.float32)
    las.write(path)


if __name__ == "__main__":
    rng = np.random.default_rng(11)
    n = 250_000
    x = 431_000 + rng.uniform(0, 500, n)
    y = 4_471_000 + rng.uniform(0, 500, n)
    z = 210 + 0.02 * (x - 431_000) + rng.normal(0, 0.05, n)
    rgb = rng.integers(0, 256, size=(n, 3))
    cls = np.where(rng.random(n) < 0.7, 2, 1).astype(np.uint8)
    conf = rng.random(n).astype(np.float32)
    write_las("out/synthetic_site.laz", x, y, z, rgb=rgb, classification=cls, confidence=conf)

    back = laspy.read("out/synthetic_site.laz")
    print(back.header.point_format.id, back.header.point_count, back.header.parse_crs().name)
    print("max xyz error:", float(np.abs(back.x - x).max()), float(np.abs(back.z - z).max()))
```

The final lines read the file back: the maximum coordinate error should be at most half the scale, 0.0005 m here.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Point formats and the optional fields each adds" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Pick the format for the fields you have</title>
  <desc>Three LAS 1.4 point formats as rows. Format 6 holds the base fields: coordinates, intensity, returns, classification, flags, scan angle, user data, point source ID and GPS time, 30 bytes. Format 7 adds red, green and blue for 36 bytes. Format 8 adds near-infrared for 38 bytes. Extra dimensions can be appended to any of them.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="46" font-size="11" fill="var(--dg-text)">PDRF 6</text>
  <rect x="90" y="30" width="400" height="26" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <text x="290" y="48" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">base fields + GPS time · 30 B</text>
  <text x="20" y="96" font-size="11" fill="var(--dg-text)">PDRF 7</text>
  <rect x="90" y="80" width="400" height="26" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="490" y="80" width="80" height="26" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1"/>
  <text x="290" y="98" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">base fields + GPS time</text>
  <text x="530" y="98" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">RGB</text>
  <text x="580" y="98" font-size="10.5" fill="var(--dg-muted)">36 B</text>
  <text x="20" y="146" font-size="11" fill="var(--dg-text)">PDRF 8</text>
  <rect x="90" y="130" width="400" height="26" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="490" y="130" width="80" height="26" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1"/>
  <rect x="570" y="130" width="40" height="26" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1"/>
  <text x="290" y="148" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">base fields + GPS time</text>
  <text x="530" y="148" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">RGB</text>
  <text x="590" y="148" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">NIR</text>
  <text x="620" y="148" font-size="10.5" fill="var(--dg-muted)">38 B</text>
  <text x="90" y="186" font-size="10.5" fill="var(--dg-muted)">extra dimensions append after the standard fields in any format</text>
</svg>

## Key Parameter Table

| Setting | Recommended | Why |
|---|---|---|
| `version` | `"1.4"` | Supports classes above 31, WKT CRS, extra bytes |
| `point_format` | 6, 7 or 8 | Match the fields you have |
| `scales` | 0.001 or 0.01 | Storage precision per axis |
| `offsets` | rounded minimum per axis | Keeps int32 values small and positive |
| `add_crs` | compound CRS | Horizontal and vertical reference in the WKT VLR |
| RGB | 16-bit (`× 257` from 8-bit) | LAS colour is 16-bit per channel |

## Verification

- **Round-trip error** at most half the scale on every axis, as in the example.
- **Header counts and bounds** match the arrays: `back.header.point_count == n`, `back.header.mins` close to the minima.
- **CRS present.** `back.header.parse_crs()` returns the CRS you set, and `pdal info --metadata` shows it too.
- **Other readers agree.** Open the file with PDAL (`pdal info --summary`) to confirm it is valid for tools other than laspy.

## Gotchas and Edge Cases

**Overflow with zero offsets.** At scale 0.001, any coordinate above about 2,147 km overflows. UTM northings and State Plane coordinates exceed that routinely. laspy raises an error in recent versions, but older code or other writers may wrap silently. Always set offsets.

**Required fields left at zero.** A return number of 0 is invalid in LAS; set `return_number` and `number_of_returns` to 1 for single-return data, as the example does. Some readers reject or misinterpret zeros.

**8-bit colour.** Writing 8-bit colour values into 16-bit fields makes images look almost black in viewers that expect 16-bit. Multiply by 257 to map 0–255 onto 0–65535.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Precision lost with a coarse scale" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>What the scale throws away</title>
  <desc>Three stored versions of the same coordinate 431522.3147 metres. At scale 0.001 it is stored as 431522.315, an error of 0.3 millimetres. At scale 0.01 it becomes 431522.31, an error of 4.7 millimetres. At scale 0.1 it becomes 431522.3, an error of 14.7 millimetres, coarser than many survey-grade deliverables allow.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="30" font-size="10.5" fill="var(--dg-muted)">true value 431522.3147 m</text>
  <text x="170" y="66" text-anchor="end" font-size="11" fill="var(--dg-text)">scale 0.001</text>
  <rect x="180" y="52" width="10" height="20" fill="var(--dg-d)"/>
  <text x="198" y="67" font-size="10.5" fill="var(--dg-muted)">431522.315 · error 0.3 mm</text>
  <text x="170" y="106" text-anchor="end" font-size="11" fill="var(--dg-text)">scale 0.01</text>
  <rect x="180" y="92" width="140" height="20" fill="var(--dg-c)"/>
  <text x="328" y="107" font-size="10.5" fill="var(--dg-muted)">431522.31 · error 4.7 mm</text>
  <text x="170" y="146" text-anchor="end" font-size="11" fill="var(--dg-text)">scale 0.1</text>
  <rect x="180" y="132" width="440" height="20" fill="var(--dg-e)"/>
  <text x="628" y="147" font-size="10.5" fill="var(--dg-muted)">14.7 mm</text>
</svg>

**Classification above 31 in old formats.** PDRF 0–5 store classification in 5 bits. Writing class 64 there wraps or fails. Use PDRF 6 or later for modern class ranges.

## Frequently Asked Questions

**How do I create a LAS file from NumPy arrays in Python?**

Create a laspy LasHeader with the version and point format, set scales and offsets, optionally add extra dimensions and a CRS, build a LasData from the header, assign the coordinate and attribute arrays, and call write with a .las or .laz filename.

**What scale and offset should I use?**

Choose the scale from the precision you need, commonly 0.001 or 0.01 metres, and set each offset to a round value just below that axis's minimum. That preserves precision and keeps the stored integers well within the 32-bit range.

**How do I add a custom attribute to a LAS file?**

Register it on the header with add_extra_dim, giving a name, a NumPy type and optionally a description, then assign values to the field of that name before writing.

**How do I set the CRS when writing with laspy?**

Call add_crs on the header with a pyproj CRS object, ideally a compound CRS with both horizontal and vertical components. laspy writes it as a WKT record, which LAS 1.4 readers such as PDAL recognize.

## Related

- [laspy and NumPy Workflows for LAS Data](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/) — the library overview
- [Reading LAS into NumPy with laspy](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/reading-las-into-numpy-with-laspy/) — the reverse direction
- [Understanding LAS Point Data Record Formats](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/understanding-las-point-data-record-formats/) — fields per format
- [Passing NumPy Arrays into a PDAL Pipeline](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/passing-numpy-arrays-into-a-pdal-pipeline/) — writing via PDAL instead
- [Reading and Writing LAS VLRs with PDAL](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/reading-and-writing-las-vlrs-with-pdal/) — CRS and custom records
