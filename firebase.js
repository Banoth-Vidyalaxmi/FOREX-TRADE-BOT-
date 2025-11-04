// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";
import {
  collection,
  addDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";

// ----------------------
// Replace with your project's config (from Firebase Console)
// ----------------------
// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyB5tmGzFqJ3TW1mFR6lNDA9u2C4FuFZux8",
  authDomain: "trading-bot-5764f.firebaseapp.com",
  projectId: "trading-bot-5764f",
  storageBucket: "trading-bot-5764f.firebasestorage.app",
  messagingSenderId: "570726560527",
  appId: "1:570726560527:web:5cd90617cec9ea5597847a",
  measurementId: "G-T0KRFQB0RH"
};


// ----------------------

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// re-export commonly used functions/objects
export { db, storage, collection, addDoc, ref, uploadBytes, getDownloadURL };
