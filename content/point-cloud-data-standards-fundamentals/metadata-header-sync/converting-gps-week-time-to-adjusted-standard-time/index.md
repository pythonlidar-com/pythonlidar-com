---
title: "Converting GPS Week Time to Adjusted Standard Time"
description: "Convert LAS GPS time from seconds-of-week to adjusted standard GPS time: finding the GPS week from the flight date, handling flights that cross a week boundary, setting global encoding bit 0, and checking the result against trajectories."
slug: "converting-gps-week-time-to-adjusted-standard-time"
type: "howto"
breadcrumb: "GPS Week to Standard Time"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Converting GPS Week Time to Adjusted Standard Time",
      "description": "Convert LAS GPS time from seconds-of-week to adjusted standard GPS time: finding the GPS week from the flight date, handling flights that cross a week boundary, setting global encoding bit 0, and checking the result against trajectories.",
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
          "name": "Metadata & Header Sync",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/metadata-header-sync/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "GPS Week to Standard Time",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/metadata-header-sync/converting-gps-week-time-to-adjusted-standard-time/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Convert LAS GPS week time to adjusted standard GPS time",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Confirm the time type",
          "text": "With laspy: las.header.global_encoding.gps_time_type \u2014 WEEK_TIME or STANDARD. Values between 0 and 604,800 also point to week time; values in the hundreds of millions to standard time."
        },
        {
          "@type": "HowToStep",
          "name": "Compute the GPS week",
          "text": "Days since 1980-01-06 divided by 7, using the flight date. GPS time runs ahead of UTC by the accumulated leap seconds (18 s since 2017), which only matters for flights within seconds of the week boundary."
        },
        {
          "@type": "HowToStep",
          "name": "Handle week rollover",
          "text": "If a flight crosses Sunday 00:00 GPS time, week times jump from ~604,800 back to ~0 mid-flight. Points with small week times after the jump belong to the next week; detect them by a large negative step in time order, or by comparing against the flight's start time."
        },
        {
          "@type": "HowToStep",
          "name": "Convert",
          "text": "standard = week \u00d7 604,800 + seconds_of_week \u2212 1e9, adding one week to points after a rollover."
        },
        {
          "@type": "HowToStep",
          "name": "Write and flag",
          "text": "Write new times, set the time type to standard (bit 0 = 1) and, for LAS 1.4 formats, keep the WKT bit (bit 4) set as well."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is adjusted standard GPS time?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It is the number of seconds since the GPS epoch of 6 January 1980, minus one billion. The subtraction keeps values small enough to store with full precision in a double, and the scale is continuous across weeks and years."
          }
        },
        {
          "@type": "Question",
          "name": "How do I find the GPS week for a flight?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Count the days from 6 January 1980 to the flight's date in GPS time and divide by seven, discarding the remainder. Near the week boundary, use the flight's UTC time rather than its local calendar date."
          }
        },
        {
          "@type": "Question",
          "name": "Why does LAS 1.4 require adjusted standard time?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Point formats 6 to 10 are defined with it so that timestamps are unambiguous across weeks and flights, which matters for trajectory matching, merging flights and multi-temporal work."
          }
        },
        {
          "@type": "Question",
          "name": "How do I tell which time type a file uses?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Check bit 0 of the header's global encoding field, and confirm with the values: week times lie between 0 and 604,800, adjusted standard times for recent data lie in the hundreds of millions."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Adjusted standard GPS time = GPS week × 604,800 + seconds of week − 1,000,000,000. Get the GPS week from the flight date (weeks count from 6 January 1980), watch for flights that cross Saturday/Sunday midnight UTC — seconds of week reset to zero there — then write the new times and set global encoding bit 0 so readers know the time type.

## Context and Motivation

This guide is part of [Metadata and Header Sync](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/metadata-header-sync/). LAS files store a GPS timestamp per point, used to match points to the aircraft trajectory, separate flightlines, order returns and diagnose timing problems. Older files commonly store *GPS week time*: seconds since the start of the current GPS week, which resets every Sunday at 00:00 GPS time. That is compact but ambiguous: the same value occurs every week, and two flights a week apart look simultaneous. *Adjusted standard GPS time* is seconds since the GPS epoch minus one billion, a continuous scale that keeps values in a comfortable double-precision range. LAS 1.4 point formats 6–10 require it, and any work combining flights or matching trajectories needs it.

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Week time resetting weekly versus continuous adjusted standard time" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>A sawtooth versus a straight line</title>
  <desc>Two lines over three weeks of calendar time. GPS week time rises from 0 to 604,800 seconds and drops back to zero at the start of each week, a sawtooth. Adjusted standard time rises steadily without resets. Two flights one week apart have identical week times but different standard times.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <line x1="60" y1="170" x2="700" y2="170" stroke="var(--dg-line)" stroke-width="1.3"/>
  <polyline points="60,170 260,80 260,170 460,80 460,170 660,80 660,170" fill="none" stroke="var(--dg-c)" stroke-width="2"/>
  <line x1="60" y1="150" x2="700" y2="30" stroke="var(--dg-a)" stroke-width="2"/>
  <circle cx="180" cy="116" r="5" fill="var(--dg-e)"/>
  <circle cx="380" cy="116" r="5" fill="var(--dg-e)"/>
  <text x="280" y="134" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">same week time, one week apart</text>
  <text x="560" y="40" font-size="10.5" fill="var(--dg-a)">adjusted standard</text>
  <text x="560" y="100" font-size="10.5" fill="var(--dg-c)">week time</text>
  <g font-size="10" fill="var(--dg-muted)"><text text-anchor="middle" x="160" y="190">week 1987</text><text text-anchor="middle" x="360" y="190">week 1988</text><text text-anchor="middle" x="560" y="190">week 1989</text></g>
</svg>

## Prerequisites and Assumptions

- LAS files with GPS time (point formats 1, 3–10) and global encoding bit 0 = 0, meaning week time.
- The flight date, or better the flight's start time in UTC or GPS time, from the flight log, the trajectory file or the acquisition report.
- laspy 2.x or PDAL; Python's `datetime`.

## Step-by-Step Implementation

### Step 1 — Confirm the time type

With laspy: `las.header.global_encoding.gps_time_type` — `WEEK_TIME` or `STANDARD`. Values between 0 and 604,800 also point to week time; values in the hundreds of millions to standard time.

### Step 2 — Compute the GPS week

Days since 1980-01-06 divided by 7, using the flight date. GPS time runs ahead of UTC by the accumulated leap seconds (18 s since 2017), which only matters for flights within seconds of the week boundary.

### Step 3 — Handle week rollover

If a flight crosses Sunday 00:00 GPS time, week times jump from ~604,800 back to ~0 mid-flight. Points with small week times after the jump belong to the next week; detect them by a large negative step in time order, or by comparing against the flight's start time.

### Step 4 — Convert

standard = week × 604,800 + seconds_of_week − 1e9, adding one week to points after a rollover.

### Step 5 — Write and flag

Write new times, set the time type to standard (bit 0 = 1) and, for LAS 1.4 formats, keep the WKT bit (bit 4) set as well.

## Complete Working Example

```python
"""Convert LAS GPS week time to adjusted standard GPS time, handling week rollover."""
from __future__ import annotations

from datetime import date

import laspy
import numpy as np

GPS_EPOCH = date(1980, 1, 6)
WEEK = 604_800


def gps_week(flight_date: date) -> int:
    return (flight_date - GPS_EPOCH).days // 7


def convert(src: str, dst: str, flight_date: date) -> None:
    las = laspy.read(src)
    if las.header.global_encoding.gps_time_type == laspy.header.GpsTimeType.STANDARD:
        print("already adjusted standard time; nothing to do")
        return
    sow = np.asarray(las.gps_time, dtype=np.float64)
    if sow.min() < 0 or sow.max() > WEEK:
        raise ValueError(f"values {sow.min():.0f}–{sow.max():.0f} are not seconds of week")

    week = gps_week(flight_date)
    # A flight that crosses the week boundary has late points with small seconds-of-week.
    start = np.percentile(sow, 1)
    rolled = sow < start - WEEK / 2           # far below the flight's early times
    weeks = np.where(rolled, week + 1, week)
    std = weeks * WEEK + sow - 1e9

    las.gps_time = std
    las.header.global_encoding.gps_time_type = laspy.header.GpsTimeType.STANDARD
    las.write(dst)
    print(f"GPS week {week}; {rolled.sum():,} points after rollover; "
          f"new range {std.min():.1f}–{std.max():.1f}")


if __name__ == "__main__":
    convert("legacy/line_1102.las", "fixed/line_1102.las", date(2018, 2, 10))
```

A quick sanity check of the arithmetic for one timestamp:

```python
week = gps_week(date(2018, 2, 10))            # 1987
print(week, week * WEEK + 385_214.37 - 1e9)   # 1987  202,122,814.37
```

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A flight crossing the week boundary and how rollover points are detected" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Flights that cross Sunday midnight</title>
  <desc>Week time of points in acquisition order for a flight starting Saturday evening. Times climb toward 604,800 seconds, then drop to near zero at the week boundary and continue climbing. Points after the drop are assigned to the following GPS week before conversion; without that, they would appear a week earlier than the rest of the flight.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <line x1="60" y1="170" x2="700" y2="170" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="60" y1="30" x2="700" y2="30" stroke="var(--dg-line-soft)" stroke-width="1" stroke-dasharray="4 3"/>
  <text x="696" y="24" text-anchor="end" font-size="10" fill="var(--dg-muted)">604,800 s</text>
  <polyline points="60,70 200,50 380,32" fill="none" stroke="var(--dg-a)" stroke-width="2.2"/>
  <polyline points="380,164 520,150 700,128" fill="none" stroke="var(--dg-e)" stroke-width="2.2"/>
  <line x1="380" y1="36" x2="380" y2="160" stroke="var(--dg-line)" stroke-width="1.2" stroke-dasharray="3 3"/>
  <text x="390" y="100" font-size="10.5" fill="var(--dg-text)">week boundary</text>
  <text x="200" y="86" text-anchor="middle" font-size="10.5" fill="var(--dg-a)">week N</text>
  <text x="560" y="120" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">week N + 1</text>
  <text x="380" y="190" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">points in acquisition order</text>
</svg>

## Key Parameter Table

| Quantity | Value | Notes |
|---|---|---|
| GPS epoch | 1980-01-06 00:00 GPS | Week 0 begins |
| seconds per week | 604,800 | Week time range 0 to 604,800 |
| adjustment | 1,000,000,000 s | Subtracted to keep values small |
| GPS − UTC | 18 s since 2017 | Leap seconds; matters only at the boundary |
| global encoding bit 0 | 1 = standard | 0 = week time |
| global encoding bit 4 | 1 = WKT CRS | Required for PDRF 6–10 |

## Verification

- **Range.** Converted times for flights between 2012 and 2026 fall between roughly 0 and 460 million seconds. Values outside that range for recent data mean the wrong week.
- **Monotonic per line.** Within a flightline, times sorted by acquisition should be monotonic after conversion, with no drop at the week boundary.
- **Trajectory match.** If an SBET or trajectory file exists, the point times should fall inside its time range; convert the trajectory's times the same way if it too is in week time.

```python
out = laspy.read("fixed/line_1102.las")
t = np.sort(np.asarray(out.gps_time))
assert np.all(np.diff(t) >= 0) and t.min() > 0 and t.max() < 5e8
```

## Gotchas and Edge Cases

**Wrong week from a local date.** A flight on Saturday evening in a western time zone is already Sunday in GPS time. Use the flight's UTC date and time near the boundary, not the local calendar date.

**Files merged from different weeks.** A file combining flights from several weeks in week time is not convertible without knowing which points came from which flight. `PointSourceId` usually identifies the flightline; convert per line with each line's date.

**Header says standard, values say week.** Some writers set bit 0 without converting. Trust the values: 385,214 is a week time whatever the header claims.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Local calendar date versus GPS date near the week boundary" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Time zones and the boundary</title>
  <desc>A timeline around Saturday night. A flight begins at 18:30 local time on Saturday in UTC minus 7. In UTC and GPS time that is already 01:30 on Sunday, the start of a new GPS week. Using the local calendar date would assign the flight to the previous week.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <line x1="60" y1="60" x2="700" y2="60" stroke="var(--dg-line)" stroke-width="1.4"/>
  <line x1="60" y1="120" x2="700" y2="120" stroke="var(--dg-line)" stroke-width="1.4"/>
  <text x="20" y="64" font-size="10.5" fill="var(--dg-text)">local</text>
  <text x="20" y="124" font-size="10.5" fill="var(--dg-text)">GPS</text>
  <line x1="380" y1="40" x2="380" y2="140" stroke="var(--dg-e)" stroke-width="1.4" stroke-dasharray="5 4"/>
  <text x="386" y="36" font-size="10.5" fill="var(--dg-e)">GPS week boundary</text>
  <circle cx="440" cy="60" r="5" fill="var(--dg-c)"/>
  <circle cx="440" cy="120" r="5" fill="var(--dg-c)"/>
  <text x="440" y="84" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">Sat 18:30 (UTC−7)</text>
  <text x="440" y="144" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">Sun 01:30 GPS</text>
</svg>

**PDAL route.** PDAL can perform the same arithmetic with `filters.assign` (`"GpsTime = GpsTime + 201737600"` for week 1987, which is 1987 × 604,800 − 1,000,000,000) and write `global_encoding` with `writers.las`, which suits batch pipelines; the week-rollover logic is easier in Python.

## Frequently Asked Questions

**What is adjusted standard GPS time?**

It is the number of seconds since the GPS epoch of 6 January 1980, minus one billion. The subtraction keeps values small enough to store with full precision in a double, and the scale is continuous across weeks and years.

**How do I find the GPS week for a flight?**

Count the days from 6 January 1980 to the flight's date in GPS time and divide by seven, discarding the remainder. Near the week boundary, use the flight's UTC time rather than its local calendar date.

**Why does LAS 1.4 require adjusted standard time?**

Point formats 6 to 10 are defined with it so that timestamps are unambiguous across weeks and flights, which matters for trajectory matching, merging flights and multi-temporal work.

**How do I tell which time type a file uses?**

Check bit 0 of the header's global encoding field, and confirm with the values: week times lie between 0 and 604,800, adjusted standard times for recent data lie in the hundreds of millions.

## Related

- [Metadata and Header Sync](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/metadata-header-sync/) — keeping header and data consistent
- [Upgrading LAS 1.2 Files to LAS 1.4](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/upgrading-las-1-2-files-to-las-1-4/) — where this conversion is required
- [Repairing Stale LAS Header Bounds and Counts](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/metadata-header-sync/repairing-stale-las-header-bounds-and-counts/) — the other common header repair
- [Understanding LAS Point Data Record Formats](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/understanding-las-point-data-record-formats/) — which formats carry GPS time
- [Measuring Swath-to-Swath Relative Accuracy](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/measuring-swath-to-swath-relative-accuracy/) — work that depends on per-line identity
