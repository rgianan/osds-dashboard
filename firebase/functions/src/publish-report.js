// Publish a report built by firebase/reports/build_reports.py and make it the
// version served by reportsApi.
// Usage (from firebase/functions): npm run publish:report -- <report-id> [path/to/report.json]
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { REPORT_ID_PATTERN, REPORTS_COLLECTION, validateReport } from './reports.js'

const KEEP_VERSIONS = 5
const here = dirname(fileURLToPath(import.meta.url))
const reportId = process.argv[2] || ''
if (!REPORT_ID_PATTERN.test(reportId)) throw new Error('Usage: npm run publish:report -- <report-id> [path/to/report.json]')
const filePath = resolve(process.argv[3] || resolve(here, `../../reports/${reportId}.json`))
if (!existsSync(filePath)) throw new Error(`Report not found: ${filePath}. Run npm run build:report first.`)

function projectId() {
  const fromEnv = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT
  if (fromEnv) return fromEnv
  const firebaserc = resolve(here, '../../../.firebaserc')
  const fromFile = existsSync(firebaserc) ? JSON.parse(readFileSync(firebaserc, 'utf8')).projects?.default : ''
  if (!fromFile) throw new Error('Set GOOGLE_CLOUD_PROJECT or add a default project to .firebaserc.')
  return fromFile
}

const report = validateReport(JSON.parse(readFileSync(filePath, 'utf8')))
if (report.id !== reportId) throw new Error(`The file contains report "${report.id}", not "${reportId}".`)

initializeApp({ projectId: projectId() })
const db = getFirestore()
const reportRef = db.doc(`${REPORTS_COLLECTION}/${reportId}`)
const version = `v-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')}`

await reportRef.collection('versions').doc(version).set({ version, report, publishedAt: FieldValue.serverTimestamp() })

const previousVersion = await db.runTransaction(async (transaction) => {
  const pointer = await transaction.get(reportRef)
  const current = pointer.data()?.currentVersion || null
  transaction.set(reportRef, { id: reportId, title: report.title, currentVersion: version, previousVersion: current, activatedAt: FieldValue.serverTimestamp() }, { merge: true })
  return current
})

const versions = await reportRef.collection('versions').orderBy('publishedAt', 'desc').select().get()
const stale = versions.docs.slice(KEEP_VERSIONS).filter((doc) => doc.id !== version && doc.id !== previousVersion)
await Promise.all(stale.map((doc) => doc.ref.delete()))

console.log(`Published ${reportId} ${version}: ${report.tables.map((table) => `${table.key} (${table.rows.length} rows)`).join(', ')}.`)
console.log(`Replaced ${previousVersion || 'no previous version'}; removed ${stale.length} old version(s).`)
