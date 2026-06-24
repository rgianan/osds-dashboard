import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const email = process.argv[2]
if (!email) throw new Error('Usage: npm run set-admin -- admin@example.com')

initializeApp()
const auth = getAuth()
const user = await auth.getUserByEmail(email)
await auth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), admin: true })
console.log(`Granted the Firebase admin claim to ${email}. The user must sign in again or refresh their ID token.`)
