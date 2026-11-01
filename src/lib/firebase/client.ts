import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { getStorage, connectStorageEmulator, type FirebaseStorage } from "firebase/storage";

/** Public web config — safe to ship to the browser (access is enforced by rules). */
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let emulatorsConnected = false;

export function getFirebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(config);
}

export function getClientAuth(): Auth {
  const auth = getAuth(getFirebaseApp());
  if (process.env.NEXT_PUBLIC_USE_EMULATORS === "true" && !emulatorsConnected) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectStorageEmulator(getStorage(getFirebaseApp()), "127.0.0.1", 9199);
    emulatorsConnected = true;
  }
  return auth;
}

export function getClientStorage(): FirebaseStorage {
  getClientAuth(); // ensures emulator wiring happens once
  return getStorage(getFirebaseApp());
}
