# SIAP Dashboard Netlify + Firebase setup guide

This guide captures the Firebase, Firestore, Storage, Functions, CSV import, and Netlify setup used for the SIAP Analytics dashboard migration.

Official references:

- [Firebase Firestore quickstart](https://firebase.google.com/docs/firestore/quickstart)
- [Firebase CLI deploy targets](https://firebase.google.com/docs/cli/targets)
- [Netlify Vite setup](https://docs.netlify.com/build/frameworks/framework-setup-guides/vite/)
- [Netlify environment variables](https://docs.netlify.com/build/configure-builds/environment-variables/)

## Current project values

Use these values unless the Firebase project changes later.

```text
Firebase project ID: osds-dashboard
Firebase web app ID: 1:445999268721:web:991a7158835be9ce32acd0
Firebase Storage bucket: osds-dashboard.firebasestorage.app
Firebase API URL: https://asia-southeast1-osds-dashboard.cloudfunctions.net/dashboardApi
Region: asia-southeast1
Admin email: gianan.r@gmail.com
```

Firebase web API keys are public browser configuration values, not private server secrets. Security comes from Firebase Authentication, Firestore rules, Storage rules, backend validation, and admin-only upload permissions.

## 1. Firebase and Firestore setup

### 1.1 Enable Firebase services

In Firebase Console, confirm these services are enabled:

1. Firestore Database
2. Authentication
3. Storage
4. Cloud Functions

Firestore should be created in production mode. Browser clients should not directly read raw dashboard rows; the deployed `dashboardApi` function returns aggregate dashboard data instead.

### 1.2 Enable Google sign-in

Go to:

```text
Firebase Console > Authentication > Sign-in method
```

Enable:

```text
Google
```

Then go to:

```text
Firebase Console > Authentication > Settings > Authorized domains
```

Add the Netlify domain, for example:

```text
osds-dashboard.netlify.app
```

Use only the domain. Do not include `https://` and do not include a trailing slash.

Keep `localhost` authorized for local testing.

### 1.3 Firestore data model

The Firebase backend uses this structure:

```text
config/dashboard
datasets/{datasetVersion}
datasets/{datasetVersion}/interns/{rowId}
datasets/{datasetVersion}/cache/{cacheKey}
imports/{importId}
```

Meaning:

- `config/dashboard` points to the active dataset version.
- `datasets/{version}/interns` stores normalized dashboard rows.
- `datasets/{version}/cache` stores precomputed dashboard responses.
- `imports/{importId}` stores CSV import status.
- Browser clients cannot directly read raw dataset rows.

### 1.4 Local Firebase Functions environment

Open:

```text
D:\projects\siap-dashboard-react-gas-netlify\firebase\functions\.env
```

Expected values:

```env
DASHBOARD_FUNCTION_REGION=asia-southeast1
ALLOWED_ORIGINS=http://localhost:5173,https://osds-dashboard.netlify.app
DASHBOARD_CACHE_SECONDS=3600
MAX_IMPORT_ROWS=200000
DASHBOARD_STORAGE_BUCKET=osds-dashboard.firebasestorage.app
```

If the Netlify URL changes, update `ALLOWED_ORIGINS`.

Example:

```env
ALLOWED_ORIGINS=http://localhost:5173,https://your-real-site.netlify.app
```

Then redeploy functions.

### 1.5 Deploy Firestore rules, Storage rules, indexes, and Functions

From the repository root:

```powershell
cd D:\projects\siap-dashboard-react-gas-netlify
npx firebase-tools@15.22.0 deploy --only firestore,storage,functions --project osds-dashboard
```

If Firebase asks how long to keep container images, enter:

```text
7
```

This keeps old container images briefly for rollback while limiting cost growth.

### 1.6 Grant dashboard admin access

Install Google Cloud CLI if `gcloud` is not available.

Authenticate:

```powershell
gcloud auth login
gcloud config set project osds-dashboard
gcloud auth application-default login
```

Important: the user must sign in once through the dashboard's `Data import` tab before running the admin script. Otherwise Firebase Auth has no user record and the script fails with:

```text
auth/user-not-found
```

After signing in once through the dashboard, run:

```powershell
cd D:\projects\siap-dashboard-react-gas-netlify\firebase\functions
npm.cmd run set-admin -- gianan.r@gmail.com
```

After this succeeds, sign out and sign back in on the dashboard so the refreshed ID token contains the admin claim.

### 1.7 CSV import workflow

In the dashboard:

1. Open `Data import`.
2. Sign in with Google.
3. Upload the CSV.
4. Wait for import status to complete.
5. Refresh the dashboard.

The backend will:

- validate the CSV,
- normalize rows,
- calculate duration once per row,
- write Firestore documents,
- prebuild caches,
- activate the new dataset only after success.

If import fails, the current active dataset stays live.

## 2. Netlify setup

### 2.1 Build settings

In Netlify, go to:

```text
Site configuration > Build & deploy > Continuous deployment > Build settings
```

Use:

```text
Base directory: frontend
Build command: npm run build
Publish directory: dist
```

The React/Vite app lives inside:

```text
D:\projects\siap-dashboard-react-gas-netlify\frontend
```

Netlify's usual Vite defaults are `npm run build` and `dist`, but this repository also needs the base directory set to `frontend`.

### 2.2 Netlify environment variables

Go to:

```text
Netlify > Site configuration > Environment variables
```

Add these:

```env
VITE_FIREBASE_API_URL=https://asia-southeast1-osds-dashboard.cloudfunctions.net/dashboardApi
VITE_FIREBASE_API_KEY=<Web API key from Firebase Console > Project settings > General>
VITE_FIREBASE_AUTH_DOMAIN=osds-dashboard.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=osds-dashboard
VITE_FIREBASE_STORAGE_BUCKET=osds-dashboard.firebasestorage.app
VITE_FIREBASE_APP_ID=1:445999268721:web:991a7158835be9ce32acd0
```

Do not write the real API key into files that are committed. It still reaches every visitor's browser inside the site bundle, which is how Firebase web keys work. Access is limited by the key's restrictions in Google Cloud Console (allowed websites and APIs) and by the Firestore and Storage security rules.

Keep the old Apps Script URL temporarily as a rollback path:

```env
VITE_GAS_WEB_APP_URL=your_existing_apps_script_url
```

The frontend uses Firebase first when `VITE_FIREBASE_API_URL` exists.

### 2.3 Redeploy Netlify

After setting environment variables:

```text
Netlify > Deploys > Trigger deploy > Clear cache and deploy site
```

Use `Clear cache and deploy site` because the previous live build may still contain the old Apps Script-only configuration.

### 2.4 Confirm the live frontend is the new build

The new live dashboard should show these tabs:

```text
Overview
Timeline
HEI risk
Geography
Data import
```

If `Data import` is missing, Netlify is still serving the old code.

In that case, commit and push the updated repository:

```powershell
cd D:\projects\siap-dashboard-react-gas-netlify
git status
git add .
git commit -m "Migrate dashboard to Firebase backend and CSV import"
git push origin main
```

Then trigger a fresh Netlify deploy.

## 3. Local development

Run the local dashboard:

```powershell
cd D:\projects\siap-dashboard-react-gas-netlify\frontend
npm.cmd run dev
```

Open:

```text
http://localhost:5173
```

The local frontend should use these values from:

```text
D:\projects\siap-dashboard-react-gas-netlify\frontend\.env.local
```

Expected Firebase values:

```env
VITE_FIREBASE_API_URL=https://asia-southeast1-osds-dashboard.cloudfunctions.net/dashboardApi
VITE_FIREBASE_API_KEY=<Web API key from Firebase Console > Project settings > General>
VITE_FIREBASE_AUTH_DOMAIN=osds-dashboard.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=osds-dashboard
VITE_FIREBASE_STORAGE_BUCKET=osds-dashboard.firebasestorage.app
VITE_FIREBASE_APP_ID=1:445999268721:web:991a7158835be9ce32acd0
```

If `.env.local` changes, restart the Vite dev server.

## 4. Expected behavior after setup

Local and production dashboards should support:

- Overview data from Firebase.
- Debounced filters.
- On-demand loading for Timeline, HEI risk, and Geography tabs.
- Lazy-loaded chart and map modules.
- Admin-only Data Import tab.
- Google sign-in for CSV upload.
- Firestore-backed cached dashboard responses.

## 5. Troubleshooting

### 5.1 `Unauthorized dashboard request`

This usually means the frontend is still calling the old Google Apps Script backend.

Fix:

1. Make sure Netlify has `VITE_FIREBASE_API_URL`.
2. Redeploy with `Clear cache and deploy site`.
3. Confirm the `Data import` tab appears.

### 5.2 `Dashboard data could not be loaded`

Possible causes:

- wrong `VITE_FIREBASE_API_URL`,
- function not public,
- `ALLOWED_ORIGINS` missing the Netlify domain,
- deploy not finished,
- browser is still serving an old build.

Useful direct test:

```powershell
curl.exe -i -X GET https://asia-southeast1-osds-dashboard.cloudfunctions.net/dashboardApi
```

Expected result:

```json
{"ok":true,"message":"SIAP Firebase backend is running."}
```

If needed, redeploy functions:

```powershell
cd D:\projects\siap-dashboard-react-gas-netlify
npx firebase-tools@15.22.0 deploy --only functions --project osds-dashboard
```

### 5.3 `Data import` says Firebase setup required

The frontend is missing Firebase browser config.

Check Netlify or `.env.local` has:

```env
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_APP_ID
```

Then redeploy or restart the local Vite server.

### 5.4 Google sign-in fails on production

Add the Netlify domain in:

```text
Firebase Authentication > Settings > Authorized domains
```

Example:

```text
osds-dashboard.netlify.app
```

### 5.5 Admin script fails with `auth/user-not-found`

The account has not signed into the dashboard app yet.

Fix:

1. Open the dashboard.
2. Go to `Data import`.
3. Sign in with Google.
4. Rerun:

```powershell
cd D:\projects\siap-dashboard-react-gas-netlify\firebase\functions
npm.cmd run set-admin -- gianan.r@gmail.com
```

### 5.6 CSV import fails

Open the import error in `Data import`.

Common causes:

- missing required column,
- renamed header,
- invalid date format,
- CSV exported from the wrong sheet tab,
- file too large,
- non-admin user uploaded.

Use the CSV template at:

```text
D:\projects\siap-dashboard-react-gas-netlify\frontend\public\siap-import-template.csv
```

### 5.7 Region mismatch error

If deploy fails with a message like:

```text
A function in region asia-southeast1 cannot listen to a bucket in region us-east1
```

Then the Storage bucket and Storage-triggered Function are in different regions.

Use the Singapore Firebase bucket:

```env
DASHBOARD_FUNCTION_REGION=asia-southeast1
DASHBOARD_STORAGE_BUCKET=osds-dashboard.firebasestorage.app
```

Then redeploy:

```powershell
cd D:\projects\siap-dashboard-react-gas-netlify
npx firebase-tools@15.22.0 deploy --only functions --project osds-dashboard
```

## 6. Operational notes

- Keep the old `VITE_GAS_WEB_APP_URL` during the initial observation period.
- Firebase takes priority when `VITE_FIREBASE_API_URL` is present.
- Removing `VITE_FIREBASE_API_URL` and redeploying Netlify falls back to Apps Script.
- Do not commit `.env`, `.env.local`, service-account JSON files, or other private credentials.
- Failed CSV imports do not replace the active dashboard dataset.
- Use the rollback script if needed:

```powershell
cd D:\projects\siap-dashboard-react-gas-netlify\firebase\functions
npm.cmd run rollback
```

Or roll back to a specific retained dataset:

```powershell
npm.cmd run rollback -- DATASET_ID
```
