// Publish the counts-only foreign students summary to Firestore and make it the
// version served by foreignStudentsApi.
// Usage (from firebase/functions): npm run publish:foreign-students [-- path/to/foreign-students.json]
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { CONFIG_DOC, DATASET_COLLECTION, validateDataset } from './foreign-students.js'

const KEEP_VERSIONS = 5
const here = dirname(fileURLToPath(import.meta.url))
const filePath = resolve(process.argv[2] || resolve(here, '../../foreign-students/foreign-students.json'))
if (!existsSync(filePath)) throw new Error(`Summary not found: ${filePath}. Run npm run build:foreign-students first.`)

function projectId() {
  const fromEnv = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT
  if (fromEnv) return fromEnv
  const firebaserc = resolve(here, '../../../.firebaserc')
  const fromFile = existsSync(firebaserc) ? JSON.parse(readFileSync(firebaserc, 'utf8')).projects?.default : ''
  if (!fromFile) throw new Error('Set GOOGLE_CLOUD_PROJECT or add a default project to .firebaserc.')
  return fromFile
}

const dataset = JSON.parse(readFileSync(filePath, 'utf8'))
const total = validateDataset(dataset)

initializeApp({ projectId: projectId() })
const db = getFirestore()
const version = `fs-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')}`
const configRef = db.doc(CONFIG_DOC)

await db.doc(`${DATASET_COLLECTION}/${version}`).set({
  version,
  meta: dataset.meta,
  dimensions: dataset.dimensions,
  cellsJson: JSON.stringify(dataset.cells),
  cellCount: dataset.cells.length,
  totalRecords: total,
  publishedAt: FieldValue.serverTimestamp(),
})

const previousVersion = await db.runTransaction(async (transaction) => {
  const config = await transaction.get(configRef)
  const current = config.data()?.currentVersion || null
  transaction.set(configRef, { currentVersion: version, previousVersion: current, activatedAt: FieldValue.serverTimestamp(), totalRecords: total }, { merge: true })
  return current
})

const versions = await db.collection(DATASET_COLLECTION).orderBy('publishedAt', 'desc').select().get()
const stale = versions.docs.slice(KEEP_VERSIONS).filter((doc) => doc.id !== version && doc.id !== previousVersion)
await Promise.all(stale.map((doc) => doc.ref.delete()))

console.log(`Published ${version}: ${total.toLocaleString()} records in ${dataset.cells.length.toLocaleString()} count cells.`)
console.log(`Replaced ${previousVersion || 'no previous version'}; removed ${stale.length} old version(s).`)
