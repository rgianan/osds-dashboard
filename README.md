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

## Foreign Students Data

The dashboard has two views, switched from the header: **SIAP** (`#/siap`) and **Foreign Students Data** (`#/foreign-students`). The Foreign Students view reads `frontend/src/data/foreign-students.json`, a counts-only summary built from the CHED foreign students workbook. It has no backend.

To update it, run from `frontend/` (Python 3, no extra packages):

```bash
npm run data:foreign-students -- "path/to/foreign-students.xlsx"
```

Then commit the regenerated JSON and redeploy. The script:

- reads only academic year, region, sex, nationality, and the HEI's city and province. Passport, ACR, birth-date, and address columns are never written out. Keep the workbook out of the repository; `*.xlsx` is gitignored.
- combines nationality spellings (for example `INDIAN` and `Indian`) through the rules in `NATIONALITY_SYNONYMS`.
- places HEI cities on the map using `frontend/scripts/ph-city-coordinates.json`. New cities are geocoded once through OpenStreetMap Nominatim, which receives only city and province names. Check any entry the script reports for review before deploying.

Counts are enrollment records per academic year, so a student enrolled in several years is counted once per year when "All years" is selected.

## Apps Script performance setup

Set the optional `CACHE_SECONDS` Script Property to control normalized-row and response caching. The default is 600 seconds; 1800-3600 seconds is appropriate when the Sheet does not need near-real-time updates.

After importing or materially changing Sheet data:

1. Run `clearDashboardCache()` in Apps Script to advance the cache version.
2. Run `warmDashboardCache()` to load and normalize the Sheet before the next dashboard visitor.

`warmDashboardCache()` returns the number of normalized rows placed in cache. It can also be attached to a time-driven Apps Script trigger if the dashboard must remain warm throughout the day.
