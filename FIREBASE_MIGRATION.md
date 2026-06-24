# Firebase migration and CSV import guide

This migration keeps the Google Apps Script backend available as a rollback path. Firebase becomes active only after a validated CSV dataset is imported and `VITE_FIREBASE_API_URL` is set on Netlify.

## What has already been implemented

- Versioned Firestore datasets: every import writes to `datasets/{version}` and cannot partially replace live data.
- Indexed filtering: each row stores one `filterKeys` array, so any dashboard filter combination uses one indexed lookup instead of scanning every row.
- Version-scoped dashboard caches with automatic Firestore TTL cleanup.
- Aggregate-only HTTPS API. Browser clients cannot read dataset rows directly.
- Admin-only CSV uploads through Firebase Authentication and protected Cloud Storage.
- Server-side CSV validation, normalization, cache warming, and atomic activation.
- Failed imports remain isolated; the previous active dataset continues serving traffic.

Intern names are deliberately not accepted or stored. The normalized dataset contains dashboard fields only.

## 1. Create and configure Firebase

1. Create a Firebase project and attach billing. Cloud Functions and production Cloud Storage event processing require the Blaze plan.
2. Create Firestore in Native mode. Select a location near the dashboard's users and keep Firestore, Storage, and Functions in compatible nearby regions. The checked-in Functions default is `asia-southeast1`.
3. Create the default Cloud Storage bucket.
4. In Authentication, enable the Google provider.
5. In Authentication > Settings > Authorized domains, add the production Netlify hostname.
6. In Project settings, create a Web app and retain its web configuration values, including the exact Storage bucket name. New and older Firebase projects can use different bucket suffixes.

Copy the project selector and install dependencies from the repository root:

```powershell
Copy-Item .firebaserc.example .firebaserc
# Replace YOUR_FIREBASE_PROJECT_ID inside .firebaserc.
cd firebase/functions
npm install
Copy-Item .env.example .env
# Set ALLOWED_ORIGINS to the exact local and Netlify origins.
# Set DASHBOARD_STORAGE_BUCKET to the exact Firebase Storage bucket name.
cd ../..
npx firebase-tools@15.22.0 login
```

Do not commit `.firebaserc`, `firebase/functions/.env`, or service-account JSON files; they are ignored.

## 2. Deploy the backend, rules, and indexes

From the repository root:

```powershell
npx firebase-tools@15.22.0 deploy --only firestore,storage,functions
```

Record the deployed `dashboardApi` URL. It normally has this form:

```text
https://asia-southeast1-PROJECT_ID.cloudfunctions.net/dashboardApi
```

The deploy also creates the `filterKeys` array index, disables unnecessary indexes on large text/date fields, and enables TTL cleanup for cache documents.

## 3. Create the first portal administrator

Create the user by signing in once through the portal or Firebase Authentication, then grant the custom claim from an authenticated developer machine. Authenticate the Admin SDK with Application Default Credentials:

```powershell
gcloud auth application-default login
cd firebase/functions
npm run set-admin -- admin@example.com
```

If `gcloud` is unavailable, use a tightly controlled service-account key instead by setting `GOOGLE_APPLICATION_CREDENTIALS` to its local path. Never commit that JSON file.

The administrator must sign out and back in, or use **Refresh access**, before the new claim appears in the ID token.

## 4. Migrate the current dataset

Export the current Google Sheet as CSV. Its required columns and accepted aliases are represented by [`frontend/public/siap-import-template.csv`](frontend/public/siap-import-template.csv).

Run the one-time migration from an authenticated developer machine:

```powershell
cd firebase/functions
$env:DASHBOARD_STORAGE_BUCKET = "THE_EXACT_BUCKET_NAME_FROM_FIREBASE_PROJECT_SETTINGS"
npm run migrate:csv -- "C:\path\to\siap-data.csv"
```

The command uploads the file to the protected import path and waits up to 20 minutes. The backend then:

1. Validates required headers, dates, file size, and the row limit.
2. Normalizes each row and calculates internship duration once.
3. Writes a staging dataset and optimized filter keys.
4. Prebuilds the unfiltered Overview, Timeline, HEI, and Geography caches.
5. Atomically changes `config/dashboard.currentVersion` only after every step succeeds.

Confirm the command reports `Migration complete` before changing Netlify.

## 5. Point Netlify to Firebase

Add these production environment variables in Netlify:

```text
VITE_FIREBASE_API_URL=https://asia-southeast1-PROJECT_ID.cloudfunctions.net/dashboardApi
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=PROJECT_ID.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET=PROJECT_ID.firebasestorage.app
VITE_FIREBASE_APP_ID=...
```

Keep `VITE_GAS_WEB_APP_URL` during the observation period. The Firebase URL takes precedence, but removing it immediately restores the Apps Script backend after a Netlify redeploy.

Deploy the frontend, then verify:

- Overview loads first and filter changes return data.
- Timeline, HEI, Geography, and Data Import load only when opened.
- An admin can upload the template and see validation/import progress.
- A malformed CSV fails without changing the live row count.

## Future CSV workflow

An administrator opens **Data Import**, signs in with Google, downloads the template if needed, and uploads a CSV of at most 50 MB. Uploads are not activated immediately: validation, normalization, indexing, and cache warming happen first. A completed import becomes the new version; a failed import shows its error and leaves the current version intact.

For operational safety, keep the previous dataset until the new one has been reviewed. To roll back data without changing code, run the controlled Admin SDK command below. With no dataset ID, it selects `config/dashboard.previousVersion`:

```powershell
cd firebase/functions
npm run rollback
# Or choose a specific retained version:
npm run rollback -- DATASET_ID
```

## Local verification

Firebase emulators are configured on ports 9099, 5001, 8080, and 9199:

```powershell
cd firebase/functions
npm run serve
```

In another terminal, set `VITE_USE_FIREBASE_EMULATORS=true` in `frontend/.env.local` and run `npm run dev` from `frontend`.
