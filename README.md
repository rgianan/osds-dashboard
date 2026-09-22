# SIAP Dashboard - React, Netlify, and Google Apps Script

SIAP is a Netlify-hosted React dashboard. It supports a versioned Firebase backend with protected CSV imports, while Google Apps Script and Google Sheets remain available as a transition and rollback path.

## What it implements

- Responsive React and Tailwind CSS dashboard
- Lazy-loaded Recharts visualizations and Leaflet route map
- Debounced filters with section-level data loading
- Google Apps Script aggregation API that does not expose row-level PII
- Compressed, chunked caching of normalized Sheet rows and filtered responses
- Versioned Firestore datasets, indexed filter keys, and TTL-backed aggregate caches
- Admin-only CSV imports with validation, cache warming, and atomic activation

## Firebase migration

The Firebase backend and portal import workflow are included under `firebase/`. Follow [FIREBASE_MIGRATION.md](FIREBASE_MIGRATION.md) to create the project, deploy rules/functions/indexes, migrate the current CSV, configure an administrator, and switch Netlify safely.

`VITE_FIREBASE_API_URL` takes precedence over `VITE_GAS_WEB_APP_URL`, so the existing Apps Script deployment can remain configured as a quick rollback during the transition.

## SIAP data and shareable API

SIAP is visible in the dashboard navigation at `#/siap` and is the default view.
To update from an Excel workbook, extract only the dashboard's allowlisted columns,
then use the existing versioned import (run from the repository root):

```powershell
python firebase/build_siap.py "path/to/SIAP Data_updated_wo_names.xlsx" "$env:TEMP/siap-import.csv"
$env:GOOGLE_CLOUD_PROJECT = "osds-dashboard"
$env:DASHBOARD_STORAGE_BUCKET = "osds-dashboard.firebasestorage.app"
node firebase/functions/src/migrate-csv.js "$env:TEMP/siap-import.csv"
```

The `SIAP Data` sheet supplies one row per internship record. The derived `Stops`
sheet is excluded to avoid double-counting. Names, addresses, and columns outside
the import template are excluded. The previous active dataset is retained for rollback.

Public API: `GET https://asia-southeast1-osds-dashboard.cloudfunctions.net/siapApi`

| Query parameter | Values |
| --- | --- |
| `section` | `overview` (default), `timeline`, `hei`, `geography` |
| `year`, `quarter`, `country`, `region`, `sex` | Optional filters. Use exact values from the response's `options`; quarters are `Q1`–`Q4`. |

Example: `.../siapApi?section=overview&year=2026&country=Japan`

Responses contain `ok`, `section`, `filters`, `dataVersion`, `lastUpdatedAt`,
`options`, and the selected section's aggregates. There is no row export or
endorsement-identifier list. Chart rankings retain the dashboard's top-N limits.
Responses can be cached for five minutes; unsupported parameters return HTTP 400.
The dashboard's existing `dashboardApi` POST interface is unchanged.

## Foreign Students Data

The dashboard has two views, switched from the header: **SIAP** (`#/siap`) and **Foreign Students Data** (`#/foreign-students`). Foreign Students data is a counts-only summary of the CHED foreign students workbook, stored in Firestore and served by the public, read-only `foreignStudentsApi` function. The dashboard reads the same API.

### Updating the data

Run from `firebase/functions/` (Python 3, no extra packages; Google application-default credentials for the publish step):

```bash
npm run build:foreign-students -- "path/to/foreign-students.xlsx"
npm run publish:foreign-students
```

The build step writes `firebase/foreign-students/foreign-students.json`. It:

- reads only academic year, region, sex, nationality, and the HEI's city and province. Birth-date, address, passport, and ACR columns are never written out. Keep the workbook out of the repository; `*.xlsx` is gitignored.
- finds the HEI city and province columns by matching their values against the HEI list (`Sheet2`), so mislabeled headers don't matter.
- combines nationality spellings (for example `INDIAN` and `Indian`) through the rules in `NATIONALITY_SYNONYMS`.
- places HEI cities on the map using `firebase/foreign-students/ph-city-coordinates.json`. New cities are geocoded once through OpenStreetMap Nominatim, which receives only city and province names. Check any entry the script reports for review before publishing.

The publish step stores the summary as a new version in `foreignStudentsDatasets/{version}`, switches `config/foreignStudents.currentVersion` to it, and keeps the five most recent versions. No site redeploy is needed. The API picks up a new version within a minute, and responses may be cached for up to five minutes.

### API

`GET https://asia-southeast1-osds-dashboard.cloudfunctions.net/foreignStudentsApi`

| Query parameter | Values |
| --- | --- |
| `format` | `summary` (default): totals by academic year, region, sex, nationality, and city. `cube`: every count cell. `dimensions`: the valid filter values. |
| `academicYear`, `region`, `sex`, `nationality` | Optional filters, matched case-insensitively against `format=dimensions`. |

Example: `...foreignStudentsApi?academicYear=2024-2025&nationality=Indian`

Counts are enrollment records per academic year, so a student enrolled in several years is counted once per year when no academic year is selected.

## Reports: TOSF Increase and Anti-Hazing Law

The **TOSF Increase** (`#/tosf`) and **Anti-Hazing Law** (`#/anti-hazing`) views show summary tables from CHED report workbooks. They are stored in Firestore and served by the public, read-only `reportsApi` function.

### Updating a report

Run from `firebase/functions/`:

```bash
npm run build:report -- tosf-increase "path/to/tuition and other school fee increase.xlsx"
npm run publish:report -- tosf-increase
```

Use `anti-hazing` with the RA 11053 workbook the same way. The build step (`firebase/reports/build_reports.py`) finds each table by its header row, so sheet names and column order can change. It reads a number followed by a note, such as `1- pending confirmation of CHEDRO`, as the number plus a note. It checks any `GRAND TOTAL` row against the rows and prints warnings for review. To add another report, describe its tables in `REPORTS` in that script and add a view for it in the frontend.

Publishing stores a new version in `reports/{id}/versions/{version}`, points `reports/{id}.currentVersion` at it, and keeps the five most recent versions.

### API

`GET https://asia-southeast1-osds-dashboard.cloudfunctions.net/reportsApi` lists the published reports. `GET ...reportsApi?id=tosf-increase` (or `id=anti-hazing`) returns one report: its title, academic year when stated, and tables. Each table has `columns`, `rows` (`label`, `values`, and optional `notes`), and `totals`.

## Apps Script performance setup

Set the optional `CACHE_SECONDS` Script Property to control normalized-row and response caching. The default is 600 seconds; 1800-3600 seconds is appropriate when the Sheet does not need near-real-time updates.

After importing or materially changing Sheet data:

1. Run `clearDashboardCache()` in Apps Script to advance the cache version.
2. Run `warmDashboardCache()` to load and normalize the Sheet before the next dashboard visitor.

`warmDashboardCache()` returns the number of normalized rows placed in cache. It can also be attached to a time-driven Apps Script trigger if the dashboard must remain warm throughout the day.
