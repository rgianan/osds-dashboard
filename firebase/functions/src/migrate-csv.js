import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

const fileArgument = process.argv[2]
if (!fileArgument) throw new Error('Usage: npm run migrate:csv -- <path-to-csv>')
const filePath = resolve(fileArgument)
if (!existsSync(filePath)) throw new Error(`CSV file not found: ${filePath}`)
if (!process.env.DASHBOARD_STORAGE_BUCKET) throw new Error('Set DASHBOARD_STORAGE_BUCKET to your project bucket name.')

initializeApp({ storageBucket: process.env.DASHBOARD_STORAGE_BUCKET })
const importId = `migration-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomUUID().slice(0, 8)}`
const destination = `csv-imports/migration/${importId}.csv`
const bucket = getStorage().bucket()

await bucket.upload(filePath, {
  destination,
  contentType: 'text/csv',
  metadata: { metadata: { originalName: basename(filePath), uploadedBy: 'migration' } },
})

console.log(`Uploaded ${basename(filePath)} as import ${importId}. Waiting for activation...`)
const db = getFirestore()
const deadline = Date.now() + 20 * 60 * 1000
while (Date.now() < deadline) {
  const snapshot = await db.doc(`imports/${importId}`).get()
  const data = snapshot.data()
  if (data?.status === 'complete') {
    console.log(`Migration complete: ${data.rowsProcessed} rows activated as dataset ${importId}.`)
    process.exit(0)
  }
  if (data?.status === 'failed') throw new Error(`Migration failed: ${data.error}`)
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 5000))
}
throw new Error(`Timed out waiting for import ${importId}. Check Firebase Functions logs.`)
