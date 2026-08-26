import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const getCredential = () => {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    return { projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n") };
  }
  return null;
};

let adminAuth = null;
const credential = getCredential();
if (credential) {
  const app = getApps()[0] || initializeApp({ credential: cert(credential) });
  adminAuth = getAuth(app);
}

export const getFirebaseAdminAuth = () => {
  if (!adminAuth) throw Object.assign(new Error("Firebase Admin is not configured on the server"), { status: 503 });
  return adminAuth;
};
