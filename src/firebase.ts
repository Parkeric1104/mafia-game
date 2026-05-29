import { initializeApp, type FirebaseApp } from "firebase/app";
import { getDatabase, type Database } from "firebase/database";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// 필수값(데이터베이스 URL)이 있어야 Firebase 사용 가능
export const firebaseReady = Boolean(config.databaseURL && config.apiKey);

let app: FirebaseApp | undefined;
let db: Database | undefined;

if (firebaseReady) {
  app = initializeApp(config);
  db = getDatabase(app);
}

export { db };
