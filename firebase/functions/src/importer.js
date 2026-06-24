import { parse } from 'csv-parse'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { buildOptions } from './aggregate.js'
import { buildAndCachePayload, DASHBOARD_SECTIONS } from './dashboard.js'
import { normalizeCsvRecord, resolveHeaders } from './schema.js'

const MAX_IMPORT_ROWS = Math.max(1, Number(process.env.MAX_IMPORT_ROWS || 200000))
const PROGRESS_INTERVAL = 500

function importPath(name) {
  const match = String(name || '').match(/^csv-imports\/([^/]+)\/([^/]+)\.csv$/i)
  return match ? { uploadedBy: match[1], importId: match[2] } : null
}

export async function processCsvObject({ db, bucket, object, eventId = '' }) {
  const path = importPath(object.name)
  if (!path) return { ignored: true }
  const { importId, uploadedBy } = path
  const importRef = db.doc(`imports/${importId}`)
  const datasetRef = db.doc(`datasets/${importId}`)
  const existing = await importRef.get()
  if (existing.exists && existing.data()?.status === 'complete') return { duplicate: true, importId }

  const originalName = object.metadata?.originalName || object.name.split('/').pop()
  await importRef.set({
    importId,
    uploadedBy,
    originalName,
    storagePath: object.name,
    status: 'processing',
    eventId,
    progress: 0,
    rowsProcessed: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })
  await datasetRef.set({ status: 'processing', importedAt: FieldValue.serverTimestamp(), importedBy: uploadedBy, sourceFile: originalName })

  const writer = db.bulkWriter()
  writer.onWriteError((error) => error.failedAttempts < 3)
  const rows = []
  let headers
  let rowNumber = 1

  try {
    const parser = bucket.file(object.name).createReadStream().pipe(parse({
      bom: true,
      columns(columnNames) {
        headers = resolveHeaders(columnNames)
        return columnNames
      },
      skip_empty_lines: true,
      relax_column_count: false,
      trim: false,
    }))

    for await (const record of parser) {
      rowNumber++
      if (rows.length >= MAX_IMPORT_ROWS) throw new Error(`CSV exceeds the ${MAX_IMPORT_ROWS.toLocaleString()} row import limit.`)
      const normalized = normalizeCsvRecord(record, headers, rowNumber)
      rows.push(normalized)
      const documentId = String(rows.length).padStart(8, '0')
      writer.set(datasetRef.collection('interns').doc(documentId), normalized)

      if (rows.length % PROGRESS_INTERVAL === 0) {
        await importRef.set({ rowsProcessed: rows.length, progress: Math.min(90, 5 + Math.floor(rows.length / 1000)), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      }
    }

    if (!rows.length) throw new Error('The CSV contains no data rows.')
    await writer.close()

    const options = buildOptions(rows)
    const importedAt = Timestamp.now()
    await datasetRef.set({
      status: 'warming',
      rowCount: rows.length,
      options,
      importedAt,
      importedBy: uploadedBy,
      sourceFile: originalName,
    }, { merge: true })
    await importRef.set({ status: 'warming', rowsProcessed: rows.length, progress: 92, updatedAt: FieldValue.serverTimestamp() }, { merge: true })

    const emptyFilters = { year: '', quarter: '', country: '', region: '', sex: '' }
    for (const section of DASHBOARD_SECTIONS) {
      await buildAndCachePayload(datasetRef, { options, importedAt }, section, emptyFilters, section === 'overview', rows)
    }

    const configRef = db.doc('config/dashboard')
    const currentConfig = await configRef.get()
    const previousVersion = currentConfig.data()?.currentVersion || null
    const activatedAt = Timestamp.now()
    const batch = db.batch()
    batch.set(datasetRef, { status: 'active', activatedAt }, { merge: true })
    batch.set(configRef, { currentVersion: importId, previousVersion, activatedAt, rowCount: rows.length }, { merge: true })
    batch.set(importRef, { status: 'complete', progress: 100, rowsProcessed: rows.length, activatedAt, updatedAt: activatedAt }, { merge: true })
    await batch.commit()

    // Activation has already succeeded; a source-file cleanup failure must not
    // incorrectly mark an otherwise healthy import as failed.
    try { await bucket.file(object.name).delete() } catch { /* Storage lifecycle rules can clean up any orphaned source file. */ }
    return { importId, rowCount: rows.length, previousVersion }
  } catch (error) {
    try { await writer.close() } catch { /* Preserve the original import error. */ }
    const message = error?.message || String(error)
    await Promise.all([
      importRef.set({ status: 'failed', error: message.slice(0, 2000), rowsProcessed: rows.length, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
      datasetRef.set({ status: 'failed', error: message.slice(0, 2000), rowCount: rows.length, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
    ])
    throw error
  }
}

export function parseImportPath(name) {
  return importPath(name)
}
