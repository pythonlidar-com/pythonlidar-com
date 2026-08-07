---
title: "Converting LAS to LAZ with PDAL"
description: "How to losslessly compress LAS to LAZ (and back) with PDAL writers.las compression, preserving the header, VLRs, extra dimensions, and point format, plus batch conversion and verification."
slug: "converting-las-to-laz-with-pdal"
type: "howto"
breadcrumb: "Converting LAS to LAZ"
datePublished: "2024-07-07"
dateModified: "2026-07-12"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Converting LAS to LAZ with PDAL",
      "description": "How to losslessly compress LAS to LAZ (and back) with PDAL writers.las compression, preserving the header, VLRs, extra dimensions, and point format, plus batch conversion and verification.",
      "datePublished": "2024-07-07",
      "dateModified": "2026-07-12",
      "author": { "@type": "Organization", "name": "pythonlidar.com" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pythonlidar.com/" },
        { "@type": "ListItem", "position": 2, "name": "Point Cloud Data Standards & Fundamentals", "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/" },
        { "@type": "ListItem", "position": 3, "name": "LAS/LAZ File Structure", "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/" },
        { "@type": "ListItem", "position": 4, "name": "Converting LAS to LAZ", "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/converting-las-to-laz-with-pdal/" }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Convert LAS to LAZ losslessly with PDAL",
      "description": "Compress a LAS file to LAZ with writers.las while preserving the header, VLRs, extra dimensions, and point format, then verify point-count and header parity.",
      "step": [
        { "@type": "HowToStep", "position": 1, "name": "Write a compression pipeline", "text": "Declare writers.las with compression:true and a .laz filename to produce a LASzip-compressed output." },
        { "@type": "HowToStep", "position": 2, "name": "Preserve header and extra dimensions", "text": "Set forward:all and extra_dims:all so every VLR, scale, offset, and custom dimension carries through." },
        { "@type": "HowToStep", "position": 3, "name": "Batch a directory of tiles", "text": "Loop the compression pipeline over every .las file, writing matching .laz outputs." },
        { "@type": "HowToStep", "position": 4, "name": "Verify parity", "text": "Assert the point count matches and the header fields are equal between source LAS and output LAZ with laspy." }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Does converting LAS to LAZ lose any precision?",
          "acceptedAnswer": { "@type": "Answer", "text": "No. LASzip is a lossless codec: it re-encodes the exact stored integers without altering scale, offset, or any attribute. Converting LAS to LAZ and decompressing back to LAS yields byte-identical point records, so coordinates, intensity, classification, and GPS time all survive unchanged." }
        },
        {
          "@type": "Question",
          "name": "Do extra dimensions survive LAS to LAZ conversion?",
          "acceptedAnswer": { "@type": "Answer", "text": "They do, but only if you tell PDAL to carry them. Set extra_dims:all on writers.las so custom per-point dimensions declared in the Extra Bytes VLR are copied into the LAZ output. Without it, PDAL writes only the standard dimensions for the point format and silently drops your custom fields." }
        },
        {
          "@type": "Question",
          "name": "How do I keep the original header and VLRs when compressing?",
          "acceptedAnswer": { "@type": "Answer", "text": "Use forward:all on writers.las. This propagates the source header's scale, offset, point format, creation date, and every VLR — including the CRS record — into the output. Without forward:all, PDAL recomputes some header fields and may drop non-CRS VLRs that downstream tools rely on." }
        },
        {
          "@type": "Question",
          "name": "Can PDAL convert LAZ back to LAS?",
          "acceptedAnswer": { "@type": "Answer", "text": "Yes. The reverse is symmetric: read the .laz and write with writers.las using compression:false and a .las filename. Because compression is lossless, the decompressed LAS is identical in content to the original, which makes the round trip safe for archival verification." }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Point a PDAL pipeline at your `.las` file and write it with `writers.las` using `compression: true`, a `.laz` filename, `forward: "all"`, and `extra_dims: "all"` — the header, every VLR, the point format, and any custom dimensions carry through losslessly, and the round trip back to LAS is byte-identical.

## Context and Motivation

This guide is part of [LAS/LAZ File Structure](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/), which lays out the binary anatomy that compression has to preserve. Conversion sounds trivial — swap an extension — but the details that get dropped along the way are what turn a routine compression into a corrupted deliverable.

LAZ is LAS with LASzip compression applied to the point records; the two formats share an identical header structure and point layout. Because the codec is lossless, the appeal is obvious: a survey tile shrinks to a fraction of its uncompressed size with no loss of precision, which is why almost every archive, download portal, and cloud bucket stores LiDAR as LAZ. The trap is that a careless conversion preserves the coordinates while quietly discarding the things that make the file usable — the coordinate reference system in a VLR, the custom per-point dimensions a classifier wrote into the Extra Bytes record, or the exact scale and offset that downstream tools expect. PDAL's `writers.las` handles the compression itself in one flag, but faithful conversion depends on two more settings that tell it to carry the full header and every extra dimension across the boundary. Get those right and the LAZ is a perfect stand-in for the LAS; get them wrong and the loss is invisible until something downstream fails to find its CRS or its custom attribute.

<svg viewBox="0 0 760 290" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="LAS to LAZ conversion preserving header, VLRs, extra dimensions and point records through PDAL writers.las" style="width:100%;max-width:760px;display:block;margin:1.5rem auto;">
  <title>What carries across a LAS to LAZ conversion with forward:all and extra_dims:all</title>
  <desc>On the left a LAS file is drawn as a stack of four parts: Public Header Block, VLRs including the CRS record, point data records, and an Extra Bytes dimension. An arrow labelled writers.las with compression true, forward all, and extra_dims all points to a LAZ file on the right with the same four parts, where only the point data block is shown compressed. A note states the codec is lossless and the round trip back to LAS is byte-identical.</desc>
  <rect x="0" y="0" width="760" height="290" fill="var(--dg-bg)" rx="10"/>
  <defs>
    <marker id="cv-arr" markerWidth="9" markerHeight="9" refX="7" refY="3.2" orient="auto">
      <path d="M0,0 L0,6.4 L8,3.2 z" fill="currentColor"/>
    </marker>
  </defs>
  <!-- LAS stack -->
  <text x="105" y="34" text-anchor="middle" font-size="13" fill="currentColor" font-family="sans-serif" font-weight="600">source.las</text>
  <rect x="30" y="46" width="150" height="34" rx="5" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="105" y="67" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">Public Header Block</text>
  <rect x="30" y="84" width="150" height="34" rx="5" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="105" y="105" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">VLRs (CRS / WKT2)</text>
  <rect x="30" y="122" width="150" height="42" rx="5" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="105" y="140" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">point data records</text>
  <text x="105" y="155" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.6">uncompressed</text>
  <rect x="30" y="168" width="150" height="34" rx="5" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="105" y="189" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">Extra Bytes dim</text>
  <!-- arrow + label -->
  <line x1="188" y1="124" x2="300" y2="124" stroke="currentColor" stroke-width="1.5" marker-end="url(#cv-arr)"/>
  <text x="244" y="98" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">writers.las</text>
  <text x="244" y="113" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">compression: true</text>
  <text x="244" y="146" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">forward: all</text>
  <text x="244" y="159" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">extra_dims: all</text>
  <!-- LAZ stack -->
  <text x="410" y="34" text-anchor="middle" font-size="13" fill="currentColor" font-family="sans-serif" font-weight="600">output.laz</text>
  <rect x="335" y="46" width="150" height="34" rx="5" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="410" y="67" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">Public Header Block</text>
  <rect x="335" y="84" width="150" height="34" rx="5" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="410" y="105" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">VLRs (CRS / WKT2)</text>
  <rect x="335" y="122" width="150" height="42" rx="5" fill="currentColor" opacity="0.14" stroke="currentColor" stroke-width="1.5"/>
  <text x="410" y="140" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">point data records</text>
  <text x="410" y="155" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">LASzip compressed</text>
  <rect x="335" y="168" width="150" height="34" rx="5" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="410" y="189" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">Extra Bytes dim</text>
  <!-- round-trip note -->
  <path d="M410 214 Q410 244 244 244 Q105 244 105 214" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="4 3" opacity="0.5" marker-end="url(#cv-arr)"/>
  <text x="257" y="266" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75" font-style="italic">lossless — round trip back to LAS is byte-identical</text>
  <!-- right annotation -->
  <text x="600" y="120" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">only point records</text>
  <text x="600" y="135" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">change size;</text>
  <text x="600" y="150" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">metadata is copied</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL | 2.4+ with LASzip compiled in (`pdal --drivers | grep writers.las`) |
| Python `pdal` bindings | 3.x (`pip install pdal`) |
| `laspy` (verification) | 2.4+ for header and point comparison |
| Input | any LAS 1.2–1.4 file; extra dimensions declared in an Extra Bytes VLR if present |
| Disk | space for both source and output during conversion |

If your source LAS has an empty or incorrect CRS, fix it before compressing — LASzip faithfully preserves whatever VLR is present, including a wrong one. The [Coordinate Reference Systems](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/) guide covers repair. For header edge cases the conversion must carry across intact, the sibling [How to Parse LAS Headers with Python](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/how-to-parse-las-headers-with-python/) guide is the reference.

## Step-by-Step Implementation

### Step 1 — Write the compression pipeline

A conversion pipeline is a reader and a writer, with the writer doing the compression. The `.laz` extension alone is not enough — set `compression` explicitly so intent is clear and version-independent.

```json
{
  "pipeline": [
    "input.las",
    {
      "type": "writers.las",
      "filename": "output.laz",
      "compression": true,
      "forward": "all",
      "extra_dims": "all"
    }
  ]
}
```

Three settings do the real work. `compression: true` triggers LASzip. `forward: "all"` copies the source header — scale, offset, point format, creation date, and every VLR including the CRS — rather than letting PDAL recompute them. `extra_dims: "all"` carries any custom per-point dimensions declared in the Extra Bytes VLR into the output.

### Step 2 — Preserve the point format and header exactly

By default PDAL may pick a point format that fits the dimensions it sees, which can silently downgrade a format 6 file. `forward: "all"` pins the output format to match the source, so a format 7 file with RGB stays format 7. This matters because the point format ID governs which dimensions exist at all, as the [LAS/LAZ File Structure](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/) reference details. If you need to force a specific version regardless of source, add `minor_version`:

```json
{
  "type": "writers.las",
  "filename": "output.laz",
  "compression": true,
  "forward": "all",
  "extra_dims": "all",
  "minor_version": 4
}
```

### Step 3 — Batch a directory of tiles

Production surveys arrive as directories of tiles. Loop the same pipeline over every `.las`, writing a matching `.laz` beside it. Each file is an independent conversion, so failures are isolated per tile.

```python
import json
from pathlib import Path

import pdal

def convert_las_to_laz(src: Path, dst: Path) -> int:
    """Compress one LAS to LAZ losslessly; return the point count written."""
    pipeline = {
        "pipeline": [
            str(src),
            {
                "type": "writers.las",
                "filename": str(dst),
                "compression": True,
                "forward": "all",
                "extra_dims": "all",
            },
        ]
    }
    return pdal.Pipeline(json.dumps(pipeline)).execute()
```

### Step 4 — Verify parity before deleting the source

Never delete the LAS until you have confirmed the LAZ holds the same points and header. The verification step below compares point count and key header fields with `laspy`.

<svg viewBox="0 0 720 266" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="How much of a LAS file survives LAZ compression, by which dimensions it carries" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What LAZ can and cannot squeeze</title>
  <desc>Compressed size as a share of the uncompressed file for five point layouts. Coordinates alone compress to about 18 percent because neighbouring points differ by very little. Adding intensity, GPS time and colour each add poorly-correlated bytes, and four custom float dimensions push the compressed file to 58 percent — the extra dimensions are stored with far less cleverness than the coordinates are.</desc>
  <rect x="0" y="0" width="720" height="266" fill="var(--dg-bg)" rx="10"/>
  <rect x="200" y="56" width="460" height="14" rx="3" fill="var(--dg-surface-2)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <rect x="200" y="74" width="82" height="14" rx="3" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="190" y="78" text-anchor="end" font-size="11" fill="var(--dg-text)">XYZ only</text>
  <text x="288" y="86" font-size="10" fill="var(--dg-muted)">18%</text>
  <rect x="200" y="96" width="460" height="14" rx="3" fill="var(--dg-surface-2)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <rect x="200" y="114" width="110" height="14" rx="3" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="190" y="118" text-anchor="end" font-size="11" fill="var(--dg-text)">+ Intensity</text>
  <text x="316" y="126" font-size="10" fill="var(--dg-muted)">24%</text>
  <rect x="200" y="136" width="460" height="14" rx="3" fill="var(--dg-surface-2)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <rect x="200" y="154" width="151" height="14" rx="3" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="190" y="158" text-anchor="end" font-size="11" fill="var(--dg-text)">+ GpsTime</text>
  <text x="357" y="166" font-size="10" fill="var(--dg-muted)">33%</text>
  <rect x="200" y="176" width="460" height="14" rx="3" fill="var(--dg-surface-2)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <rect x="200" y="194" width="188" height="14" rx="3" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="190" y="198" text-anchor="end" font-size="11" fill="var(--dg-text)">+ RGB</text>
  <text x="394" y="206" font-size="10" fill="var(--dg-muted)">41%</text>
  <rect x="200" y="216" width="460" height="14" rx="3" fill="var(--dg-surface-2)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <rect x="200" y="234" width="266" height="14" rx="3" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="190" y="238" text-anchor="end" font-size="11" fill="var(--dg-text)">+ 4 extra floats</text>
  <text x="472" y="246" font-size="10" fill="var(--dg-muted)">58%</text>
  <rect x="200" y="34" width="14" height="10" rx="2" fill="var(--dg-surface-2)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="220" y="43" font-size="10.5" fill="var(--dg-muted)">uncompressed LAS</text>
  <rect x="360" y="34" width="14" height="10" rx="2" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="380" y="43" font-size="10.5" fill="var(--dg-muted)">the same tile as LAZ</text>
  <text x="60" y="258" font-size="10.5" fill="var(--dg-muted)">if your compression ratio is worse than you expected, look at what the point record carries before blaming the encoder</text>
</svg>

## Complete Working Example

Save this as `las_to_laz.py`. It converts an entire directory of LAS tiles to LAZ, then verifies each output against its source for point-count and header parity, refusing to report success on any mismatch.

```python
#!/usr/bin/env python3
"""
las_to_laz.py
Losslessly convert a directory of LAS tiles to LAZ with PDAL, then verify parity.

Usage:
    python las_to_laz.py /data/las_in /data/laz_out

Requirements:
    pip install pdal laspy
    PDAL 2.4+ with LASzip
"""

import json
import sys
from pathlib import Path

import laspy
import pdal


def convert_las_to_laz(src: Path, dst: Path) -> int:
    """Compress one LAS to LAZ; preserve header, VLRs, and extra dimensions."""
    pipeline = {
        "pipeline": [
            str(src),
            {
                "type": "writers.las",
                "filename": str(dst),
                "compression": True,
                "forward": "all",
                "extra_dims": "all",
            },
        ]
    }
    count = pdal.Pipeline(json.dumps(pipeline)).execute()
    if count == 0:
        raise RuntimeError(f"Converted 0 points from {src} — source may be empty.")
    return count


def verify_parity(src: Path, dst: Path) -> None:
    """Assert point count and core header fields match between LAS and LAZ."""
    with laspy.open(src) as a, laspy.open(dst) as b:
        ha, hb = a.header, b.header

        assert ha.point_count == hb.point_count, (
            f"Point count differs: {ha.point_count:,} vs {hb.point_count:,}"
        )
        assert ha.point_format.id == hb.point_format.id, (
            f"Point format changed: {ha.point_format.id} -> {hb.point_format.id}"
        )
        assert ha.scales.tolist() == hb.scales.tolist(), "Scale factors differ"
        assert ha.offsets.tolist() == hb.offsets.tolist(), "Offsets differ"

        # CRS VLR must survive the conversion
        src_has_crs = any(v.record_id in (2112, 34735) for v in ha.vlrs)
        dst_has_crs = any(v.record_id in (2112, 34735) for v in hb.vlrs)
        assert src_has_crs == dst_has_crs, "CRS VLR presence changed during conversion"


def main() -> None:
    if len(sys.argv) != 3:
        print("Usage: python las_to_laz.py <las_dir> <laz_dir>")
        sys.exit(1)

    src_dir, dst_dir = Path(sys.argv[1]), Path(sys.argv[2])
    dst_dir.mkdir(parents=True, exist_ok=True)

    tiles = sorted(src_dir.glob("*.las"))
    if not tiles:
        print(f"No .las files found in {src_dir}")
        sys.exit(1)

    total = 0
    for i, src in enumerate(tiles, start=1):
        dst = dst_dir / (src.stem + ".laz")
        count = convert_las_to_laz(src, dst)
        verify_parity(src, dst)

        ratio = src.stat().st_size / max(dst.stat().st_size, 1)
        total += count
        print(
            f"[{i}/{len(tiles)}] {src.name}: {count:,} pts, "
            f"{ratio:.1f}x smaller, parity OK"
        )

    print(f"\nConverted {len(tiles)} tiles, {total:,} points total. All parity checks passed.")


if __name__ == "__main__":
    main()
```

Typical output over a directory of survey tiles (LAS 1.4, point format 7, `EPSG:2193` NZGD2000):

```text
[1/3] tile_0001.las: 9,214,880 pts, 7.4x smaller, parity OK
[2/3] tile_0002.las: 8,903,551 pts, 7.1x smaller, parity OK
[3/3] tile_0003.las: 9,540,102 pts, 7.6x smaller, parity OK

Converted 3 tiles, 27,658,533 points total. All parity checks passed.
```

## Key Parameter Table

| Parameter | Stage | Values | Effect |
|---|---|---|---|
| `compression` | `writers.las` | `true` / `false` | `true` writes LASzip (`.laz`); `false` writes plain LAS |
| `forward` | `writers.las` | `"all"`, `"header"`, dim list | `"all"` copies header, scale, offset, and every VLR unchanged |
| `extra_dims` | `writers.las` | `"all"`, name list | `"all"` carries custom Extra Bytes dimensions into the output |
| `minor_version` | `writers.las` | `2`–`4` | Forces LAS version; `4` required for point formats 6–10 |
| `a_srs` | `writers.las` | EPSG / WKT2 | Only needed to override or add a CRS; `forward:"all"` already copies an existing one |

`forward: "all"` and an explicit `a_srs` can conflict — if you set `a_srs`, it overrides the forwarded CRS. Leave `a_srs` unset for a faithful copy and only supply it when you are deliberately correcting a missing or wrong CRS during the conversion.

## Verification

Parity has two independent parts: the points and the header. The example script checks both, but you can also confirm a full lossless round trip by decompressing the LAZ back to LAS and comparing raw point records.

```python
import json
import numpy as np
import pdal

def assert_round_trip(las_path: str, laz_path: str) -> None:
    """Confirm LAS -> LAZ preserved every stored point value."""
    def load(path):
        p = pdal.Pipeline(json.dumps({"pipeline": [path]}))
        p.execute()
        return p.arrays[0]

    a, b = load(las_path), load(laz_path)
    assert a.shape[0] == b.shape[0], "Point count changed"
    for dim in a.dtype.names:
        assert np.array_equal(a[dim], b[dim]), f"Dimension {dim} changed during conversion"
    print(f"OK: {a.shape[0]:,} points identical across all {len(a.dtype.names)} dimensions.")
```

Because LASzip is lossless, `np.array_equal` holds for every dimension including custom Extra Bytes fields. If any dimension fails, suspect a missing `extra_dims: "all"` or a point-format downgrade, not the codec. Comparing on-disk sizes with `os.stat` gives the compression ratio, which typically lands between 5x and 8x for airborne LiDAR depending on point format width.

<svg viewBox="0 0 720 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="What a LAS to LAZ conversion carries across by default and what needs an explicit option" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Conversion is lossless about points and careless about everything else</title>
  <desc>Seven things a LAS file holds, and whether a plain conversion keeps them. Point records, header fields and the coordinate reference system always survive. Extra dimensions, other variable length records and extended VLRs survive only when you ask for them by name. Point order is never guaranteed, which matters if anything downstream indexes by row number.</desc>
  <rect x="0" y="0" width="720" height="300" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="50" width="330" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="34" y="69" font-size="11" fill="var(--dg-text)">point records</text>
  <rect x="380" y="50" width="300" height="28" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="530" y="69" text-anchor="middle" font-size="11" fill="var(--dg-text)">always</text>
  <rect x="20" y="84" width="330" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="34" y="103" font-size="11" fill="var(--dg-text)">public header fields</text>
  <rect x="380" y="84" width="300" height="28" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="530" y="103" text-anchor="middle" font-size="11" fill="var(--dg-text)">always</text>
  <rect x="20" y="118" width="330" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="34" y="137" font-size="11" fill="var(--dg-text)">CRS records</text>
  <rect x="380" y="118" width="300" height="28" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="530" y="137" text-anchor="middle" font-size="11" fill="var(--dg-text)">always</text>
  <rect x="20" y="152" width="330" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="34" y="171" font-size="11" fill="var(--dg-text)">extra dimensions</text>
  <rect x="380" y="152" width="300" height="28" rx="5" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.1"/>
  <text x="530" y="171" text-anchor="middle" font-size="11" fill="var(--dg-text)">only with extra_dims</text>
  <rect x="20" y="186" width="330" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="34" y="205" font-size="11" fill="var(--dg-text)">other VLRs</text>
  <rect x="380" y="186" width="300" height="28" rx="5" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.1"/>
  <text x="530" y="205" text-anchor="middle" font-size="11" fill="var(--dg-text)">only with forward</text>
  <rect x="20" y="220" width="330" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="34" y="239" font-size="11" fill="var(--dg-text)">EVLRs past the points</text>
  <rect x="380" y="220" width="300" height="28" rx="5" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.1"/>
  <text x="530" y="239" text-anchor="middle" font-size="11" fill="var(--dg-text)">only with forward</text>
  <rect x="20" y="254" width="330" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="34" y="273" font-size="11" fill="var(--dg-text)">the original file order</text>
  <rect x="380" y="254" width="300" height="28" rx="5" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.1"/>
  <text x="530" y="273" text-anchor="middle" font-size="11" fill="var(--dg-text)">never guaranteed</text>
  <text x="20" y="36" font-size="10.5" fill="var(--dg-muted)">one pdal translate in.las out.laz, and what comes out the other side</text>
  <text x="20" y="292" font-size="10.5" fill="var(--dg-muted)">"forward": "all" plus "extra_dims": "all" on the writer turns every amber row green — and is worth setting by default on any archival conversion</text>
</svg>

## Gotchas and Edge Cases

**1. Extra dimensions vanish without `extra_dims: "all"`.**
If a classifier or feature-extraction step wrote custom per-point dimensions into the Extra Bytes VLR, PDAL will not carry them into the LAZ unless you ask. The default writes only the standard dimensions for the point format, so the conversion looks fine — same point count, same coordinates — while silently dropping the data your downstream model needs. Always set `extra_dims: "all"` when converting analysed data.

**2. `forward: "all"` copies a wrong CRS just as faithfully as a right one.**
Lossless preservation cuts both ways. If the source header carries an incorrect CRS VLR, the LAZ inherits it exactly. Validate and fix the CRS in the LAS before compressing, using the [Coordinate Reference Systems](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/) workflow, rather than expecting the conversion to clean it up.

**3. A point-format downgrade quietly truncates dimensions.**
Omitting `forward: "all"` lets PDAL choose a point format, and it may pick a narrower one than the source. A format 7 file (with RGB) written as format 1 loses colour with no error. Pinning the format via `forward: "all"` — or `minor_version` plus an explicit format — prevents this.

**4. Compressing without keeping the source is risky until verified.**
It is tempting to compress in place and delete the LAS to reclaim disk. Do the verification first. A failed conversion that dropped extra dimensions is unrecoverable once the source is gone, whereas the parity check in the example catches it while you still have the original.

## Frequently Asked Questions

**Does converting LAS to LAZ lose any precision?**

No. LASzip is a lossless codec: it re-encodes the exact stored integers without altering scale, offset, or any attribute. Converting LAS to LAZ and decompressing back to LAS yields byte-identical point records, so coordinates, intensity, classification, and GPS time all survive unchanged.

**Do extra dimensions survive LAS to LAZ conversion?**

They do, but only if you tell PDAL to carry them. Set `extra_dims: "all"` on `writers.las` so custom per-point dimensions declared in the Extra Bytes VLR are copied into the LAZ output. Without it, PDAL writes only the standard dimensions for the point format and silently drops your custom fields.

**How do I keep the original header and VLRs when compressing?**

Use `forward: "all"` on `writers.las`. This propagates the source header's scale, offset, point format, creation date, and every VLR — including the CRS record — into the output. Without `forward: "all"`, PDAL recomputes some header fields and may drop non-CRS VLRs that downstream tools rely on. Inspecting those fields is covered in [How to Parse LAS Headers with Python](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/how-to-parse-las-headers-with-python/).

**Can PDAL convert LAZ back to LAS?**

Yes. The reverse is symmetric: read the `.laz` and write with `writers.las` using `compression: false` and a `.las` filename. Because compression is lossless, the decompressed LAS is identical in content to the original, which makes the round trip safe for archival verification. Whether to keep files as LAZ or LAS during active work is weighed in [LAZ vs Uncompressed LAS for Iterative Processing](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/laz-vs-uncompressed-las-for-iterative-processing/).

---

## Related

- [LAS/LAZ File Structure](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/) — parent guide on the binary layout that compression preserves
- [How to Parse LAS Headers with Python](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/how-to-parse-las-headers-with-python/) — inspect the header and VLR fields the conversion must carry across
- [LAZ vs Uncompressed LAS for Iterative Processing](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/laz-vs-uncompressed-las-for-iterative-processing/) — when to keep files compressed versus uncompressed during development
- [Coordinate Reference Systems](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/) — validate and fix the CRS VLR before compressing
- [Point Cloud Data Standards & Fundamentals](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/) — parent section on LAS/LAZ, CRS, metadata, and classification standards
