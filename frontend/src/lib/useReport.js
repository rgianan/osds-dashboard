import { useEffect, useState } from 'react'
import { getReport } from './api.js'

// Loads a published report from reportsApi. retry() reloads after an error.
export function useReport(id) {
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let isCurrent = true
    setError('')
    getReport(id)
      .then((value) => { if (isCurrent) setReport(value) })
      .catch(() => { if (isCurrent) setError('The data service did not respond. Try again in a moment.') })
    return () => { isCurrent = false }
  }, [id, attempt])

  return { report, error, retry: () => setAttempt((value) => value + 1) }
}

export function reportTable(report, key) {
  return report?.tables.find((table) => table.key === key) || null
}

export function formatPublishedDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(value))
}
