import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Database, FileSpreadsheet, LogIn, LogOut, RefreshCw, ShieldCheck, UploadCloud } from 'lucide-react'
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { ref, uploadBytesResumable } from 'firebase/storage'
import { firebaseConfigured, getFirebaseServices } from '../lib/firebaseClient.js'

const MAX_FILE_SIZE = 50 * 1024 * 1024

function StatusCard({ job, uploadProgress }) {
  const status = job?.status || (uploadProgress > 0 ? 'uploading' : 'idle')
  if (status === 'idle') return null
  const complete = status === 'complete'
  const failed = status === 'failed'
  const percent = complete ? 100 : failed ? job?.progress || uploadProgress : Math.max(uploadProgress, job?.progress || 0)

  return (
    <section className={`rounded-xl border p-4 ${failed ? 'border-red-200 bg-red-50' : complete ? 'border-emerald-200 bg-emerald-50' : 'border-blue-200 bg-blue-50'}`} aria-live="polite">
      <div className="flex items-start gap-3">
        {failed ? <AlertTriangle className="mt-0.5 text-red-700" size={20} /> : complete ? <CheckCircle2 className="mt-0.5 text-emerald-700" size={20} /> : <RefreshCw className="mt-0.5 animate-spin text-blue-700" size={20} />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold capitalize text-slate-900">{status === 'warming' ? 'Warming dashboard caches' : status}</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {failed ? job.error : complete ? `${Number(job.rowsProcessed || 0).toLocaleString()} rows validated and activated.` : `${Number(job?.rowsProcessed || 0).toLocaleString()} rows processed.`}
          </p>
          {!failed ? <div className="mt-3 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${Math.min(100, percent)}%` }} /></div> : null}
        </div>
      </div>
      {complete ? <button type="button" onClick={() => window.location.reload()} className="mt-4 min-h-10 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800">Reload dashboard with new data</button> : null}
    </section>
  )
}

export default function DataImport() {
  const [authState, setAuthState] = useState({ loading: true, user: null, admin: false })
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [job, setJob] = useState(null)
  const pollingRef = useRef(false)

  useEffect(() => {
    if (!firebaseConfigured) {
      setAuthState({ loading: false, user: null, admin: false })
      return undefined
    }
    const { auth } = getFirebaseServices()
    return onAuthStateChanged(auth, async (user) => {
      if (!user) return setAuthState({ loading: false, user: null, admin: false })
      const token = await user.getIdTokenResult()
      setAuthState({ loading: false, user, admin: token.claims.admin === true })
    })
  }, [])

  async function refreshClaims() {
    if (!authState.user) return
    await authState.user.getIdToken(true)
    const token = await authState.user.getIdTokenResult()
    setAuthState((current) => ({ ...current, admin: token.claims.admin === true }))
  }

  async function signIn() {
    setError('')
    try {
      const { auth } = getFirebaseServices()
      await signInWithPopup(auth, new GoogleAuthProvider())
    } catch (signInError) {
      setError(signInError.message || 'Sign-in failed.')
    }
  }

  async function pollImport(importId) {
    pollingRef.current = true
    const { db } = getFirebaseServices()
    for (let attempt = 0; attempt < 600 && pollingRef.current; attempt++) {
      const snapshot = await getDoc(doc(db, 'imports', importId))
      if (snapshot.exists()) {
        const value = snapshot.data()
        setJob(value)
        if (value.status === 'complete' || value.status === 'failed') return
      }
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    if (pollingRef.current) setError('Import status timed out. Check Firebase Functions logs for the import ID.')
  }

  useEffect(() => () => { pollingRef.current = false }, [])

  async function upload(event) {
    event.preventDefault()
    setError('')
    setJob(null)
    if (!file) return setError('Choose a CSV file first.')
    if (!file.name.toLowerCase().endsWith('.csv')) return setError('Only CSV files are accepted.')
    if (file.size > MAX_FILE_SIZE) return setError('The CSV exceeds the 50 MB upload limit.')

    try {
      const { storage } = getFirebaseServices()
      const importId = crypto.randomUUID()
      const destination = ref(storage, `csv-imports/${authState.user.uid}/${importId}.csv`)
      const task = uploadBytesResumable(destination, file, {
        contentType: file.type || 'text/csv',
        customMetadata: { originalName: file.name, uploadedBy: authState.user.uid },
      })
      await new Promise((resolve, reject) => task.on('state_changed',
        (snapshot) => setUploadProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
        reject,
        resolve))
      setJob({ importId, status: 'queued', progress: 100, rowsProcessed: 0 })
      await pollImport(importId)
    } catch (uploadError) {
      setError(uploadError.message || 'CSV upload failed.')
    }
  }

  if (!firebaseConfigured) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 text-amber-700" size={20} /><div><h3 className="font-bold text-slate-900">Firebase setup required</h3><p className="mt-1 text-sm leading-6 text-slate-600">Add the VITE_FIREBASE_* web configuration values to Netlify and redeploy before enabling portal uploads.</p></div></div>
      </div>
    )
  }

  if (authState.loading) return <div className="skeleton h-48 rounded-2xl" role="status"><span className="sr-only">Checking administrator access</span></div>

  if (!authState.user) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><ShieldCheck size={23} /></span>
        <h3 className="mt-4 text-lg font-bold text-slate-900">Administrator sign-in</h3>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">CSV imports can replace the active dashboard dataset, so this workflow requires a Firebase account with the admin custom claim.</p>
        <button type="button" onClick={signIn} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#102a43] px-4 text-sm font-semibold text-white hover:bg-[#183b56]"><LogIn size={17} /> Sign in with Google</button>
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      </div>
    )
  }

  if (!authState.admin) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h3 className="font-bold text-slate-900">Administrator claim required</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">Signed in as {authState.user.email}. Grant this account the Firebase admin claim, then refresh the token.</p>
        <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={refreshClaims} className="min-h-10 rounded-lg bg-amber-700 px-4 text-sm font-semibold text-white">Refresh access</button><button type="button" onClick={() => signOut(getFirebaseServices().auth)} className="min-h-10 rounded-lg border border-amber-300 px-4 text-sm font-semibold text-amber-900">Sign out</button></div>
      </div>
    )
  }

  const busy = job && !['complete', 'failed'].includes(job.status)
  return (
    <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><UploadCloud size={20} /></span><div><h3 className="font-bold text-slate-900">Upload replacement dataset</h3><p className="mt-1 text-sm text-slate-600">Signed in as {authState.user.email}</p></div></div>
          <button type="button" onClick={() => signOut(getFirebaseServices().auth)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100"><LogOut size={14} /> Sign out</button>
        </div>

        <form onSubmit={upload} className="mt-5">
          <label htmlFor="csv-import" className="flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-5 text-center transition hover:border-blue-400 hover:bg-blue-50/50">
            <FileSpreadsheet className="text-slate-400" size={30} />
            <span className="mt-3 text-sm font-bold text-slate-800">{file ? file.name : 'Choose a SIAP CSV file'}</span>
            <span className="mt-1 text-xs text-slate-500">Maximum 50 MB. The server validates headers and every row.</span>
          </label>
          <input id="csv-import" type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => { setFile(event.target.files?.[0] || null); setError(''); setJob(null); setUploadProgress(0) }} />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <a href="/siap-import-template.csv" download className="text-sm font-semibold text-blue-700 hover:text-blue-900">Download CSV template</a>
            <button type="submit" disabled={!file || busy} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"><UploadCloud size={17} /> Validate and import</button>
          </div>
        </form>
        {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-4"><StatusCard job={job} uploadProgress={uploadProgress} /></div>
      </section>

      <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><Database className="text-emerald-700" size={19} /><h3 className="font-bold text-slate-900">Safe activation workflow</h3></div>
        <ol className="mt-4 space-y-4 text-sm text-slate-600">
          {['Upload to protected Cloud Storage', 'Validate headers, dates, and row limits', 'Normalize data without intern names', 'Build indexed filter keys and dashboard caches', 'Atomically activate the completed dataset'].map((step, index) => <li key={step} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-800">{index + 1}</span><span className="leading-6">{step}</span></li>)}
        </ol>
        <p className="mt-5 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">A failed import remains isolated as a staging dataset. It never replaces the currently active dashboard version.</p>
      </aside>
    </div>
  )
}
