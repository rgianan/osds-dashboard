# SIAP Dashboard — React + Netlify + Google Apps Script

This starter converts the attached Power BI-style SIAP dashboard into a Netlify-hosted React dashboard with Google Apps Script as the aggregation API and Google Sheets as the database.

## What it implements

- React + Vite frontend
- Tailwind CSS layout patterned after the attached dashboard PDF
- Recharts for KPI, donut, bar, stacked, and timeline charts
- Leaflet map for country / destination flows
- Google Apps Script backend that reads the converted Google Sheet and returns aggregate-only JSON
