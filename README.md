# SIAP Dashboard — React + Netlify + Google Apps Script

This starter converts the attached Power BI-style SIAP dashboard into a Netlify-hosted React dashboard with Google Apps Script as the aggregation API and Google Sheets as the database.

## What it implements

- React + Vite frontend
- Tailwind CSS layout patterned after the attached dashboard PDF
- Recharts for KPI, donut, bar, stacked, and timeline charts
- Leaflet map for country / destination flows
- Google Apps Script backend that reads the converted Google Sheet and returns aggregate-only JSON
- Filters: Year, Quarter, Country, Region, Sex
- Pages:
  1. Executive Overview
  2. Internship Timeline and Forecasting
  3. HEI Performance and Concentration Risk
  4. Geography and Host Destination

## Database setup

1. Upload `SIAP Data.xlsx` to Google Drive.
2. Open it with Google Sheets or import it into a new Google Sheet.
3. Keep these sheet names exactly:
   - `SIAP Data`
   - `Stops`
4. The Apps Script currently reads the `SIAP Data` sheet for all dashboard aggregates. The map uses the latitude/longitude columns from that sheet.

## Apps Script setup

1. Create a new Apps Script project.
2. Paste `google-apps-script/Code.gs` into `Code.gs`.
3. Set Script Properties:
   - `SPREADSHEET_ID` = your Google Sheet ID
   - `SIAP_SHEET_NAME` = `SIAP Data` optional
   - `STOPS_SHEET_NAME` = `Stops` optional
   - `DASHBOARD_TOKEN` = optional weak token
   - `CACHE_SECONDS` = `600` optional
4. Deploy as Web App:
   - Execute as: Me
   - Who has access: Anyone with the link
5. Copy the `/exec` web app URL.

## Netlify setup

1. Push the `frontend` folder to GitHub.
2. In Netlify:
   - Build command: `npm run build`
   - Publish directory: `dist`
3. Add environment variables:
   - `VITE_GAS_WEB_APP_URL` = Apps Script `/exec` URL
   - `VITE_DASHBOARD_TOKEN` = same value as `DASHBOARD_TOKEN`, if used

## Local run

```bash
cd frontend
npm install
cp .env.example .env.local
# edit .env.local
npm run dev
```

## Security warning

Netlify static environment variables are visible in the browser bundle. That means `VITE_DASHBOARD_TOKEN` is not a real secret. Keep the Apps Script endpoint aggregate-only and never return intern names, email addresses, raw rows, or other PII. For stricter access control, add a login flow with server-side sessions in Apps Script, or put a real backend/API gateway in front of Apps Script.

## Formula assumptions

- Total Interns = filtered row count.
- Total Endorsements = unique `SIAP ENDORSEMENT No`.
- Avg Lead Time Days = `Start of Internship - Date of CHED Endorsement to BI`.
- Avg Duration Work Hours = inclusive weekdays between start/end multiplied by 8.
- Active Internships Today = rows where today is between internship start and end.
