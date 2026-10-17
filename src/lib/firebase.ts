import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getStorage } from "firebase/storage";
import firebaseConfig from "../../firebase-applet-config.json";

// Initialize Firebase
const app = initializeApp(firebaseConfig);

interface ExtendedFirebaseConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  firestoreDatabaseId?: string;
}

// 🔥 ВАЖНОЕ: Fix for sandbox environment
export const db = getFirestore(app, (firebaseConfig as ExtendedFirebaseConfig).firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);

export const analyticsPromise = isSupported()
  .then(yes => {
    if (yes) {
      try {
        const analytics = getAnalytics(app);
        return analytics;
      } catch (error) {
        console.warn("Firebase Analytics initialization failed:", error);
        return null;
      }
    }
    return null;
  })
  .catch(error => {
    console.warn("isSupported() check failed:", error);
    return null;
  });

// (опционально) проверка подключения
async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    console.log("Firestore connection OK");
  } catch (error) {
    if(error instanceof Error) {
      if (error.message.includes('the client is offline')) {
        console.error("Please check your Firebase configuration.");
      } else if (error.message.includes('Missing or insufficient permissions')) {
        // This is expected since we don't have a rule for test/connection
        // It proves we reached the server successfully!
        console.log("Firestore connection OK (Server reached)");
      } else {
        console.error("Firestore error:", error);
      }
    } else {
      console.error("Firestore error:", error);
    }
  }
}

testConnection();