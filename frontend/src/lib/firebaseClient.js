import { getApp, getApps, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectStorageEmulator, getStorage } from 'firebase/storage'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
}

export const firebaseConfigured = Object.values(config).every(Boolean)

let services
let emulatorsConnected = false

export function getFirebaseServices() {
  if (!firebaseConfigured) throw new Error('Firebase web configuration is incomplete.')
  if (services) return services
  const app = getApps().length ? getApp() : initializeApp(config)
  const auth = getAuth(app)
  const db = getFirestore(app)
  const storage = getStorage(app)

  if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' && !emulatorsConnected) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
    connectStorageEmulator(storage, '127.0.0.1', 9199)
    emulatorsConnected = true
  }

  services = { app, auth, db, storage }
  return services
}
