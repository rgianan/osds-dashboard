import { getFirestore } from 'firebase-admin/firestore'

// The dashboard's Firestore database: osds-dash, an Enterprise edition database in
// asia-southeast1 next to the functions, and the project's free-tier database. The project's
// (default) database is in nam5 (United States). A database's location cannot be changed, and
// the Pacific round trip on every read made the dashboards slow, so the data moved here.
export const DATABASE_ID = process.env.DASHBOARD_FIRESTORE_DATABASE || 'osds-dash'

export function dashboardDatabase() {
  return getFirestore(DATABASE_ID)
}
