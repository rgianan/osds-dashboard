import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

initializeApp()
const db = getFirestore()
const requestedVersion = process.argv[2] || ''
const configRef = db.doc('config/dashboard')

const result = await db.runTransaction(async (transaction) => {
  const configSnapshot = await transaction.get(configRef)
  if (!configSnapshot.exists) throw new Error('Dashboard configuration does not exist.')

  const config = configSnapshot.data()
  const targetVersion = requestedVersion || config.previousVersion
  if (!targetVersion) throw new Error('No previous dataset is recorded. Pass a dataset ID explicitly.')
  if (targetVersion === config.currentVersion) throw new Error(`${targetVersion} is already active.`)

  const datasetRef = db.doc(`datasets/${targetVersion}`)
  const datasetSnapshot = await transaction.get(datasetRef)
  if (!datasetSnapshot.exists) throw new Error(`Dataset ${targetVersion} does not exist.`)
  const dataset = datasetSnapshot.data()
  if (!Number.isFinite(dataset.rowCount)) throw new Error(`Dataset ${targetVersion} has no valid row count.`)

  transaction.set(datasetRef, { status: 'active', reactivatedAt: FieldValue.serverTimestamp() }, { merge: true })
  transaction.set(configRef, {
    currentVersion: targetVersion,
    previousVersion: config.currentVersion || null,
    rowCount: dataset.rowCount,
    activatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  return { targetVersion, replacedVersion: config.currentVersion || null, rowCount: dataset.rowCount }
})

console.log(`Rolled back to ${result.targetVersion} (${result.rowCount.toLocaleString()} rows). Replaced ${result.replacedVersion || 'no active dataset'}.`)
