// Import the functions you need from the SDKs you need
 
// src/firebase.js
// ─────────────────────────────────────────────────────────────────────────────
// FIXES:
//  ✅ getFiresore → getFirestore (typo fixed)
//  ✅ forestore → firestore (typo fixed)
//  ✅ getAuth imported from "firebase/auth" (not "firebase/app")
//  ✅ auth exported with app reference
// ─────────────────────────────────────────────────────────────────────────────
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";


const firebaseConfig = {
  apiKey: "AIzaSyAHbSTrNqxbS4VroWAkVB7y90YvjRyPqN4",
  authDomain: "emt-e9471.firebaseapp.com",
  projectId: "emt-e9471",
  storageBucket: "emt-e9471.firebasestorage.app",
  messagingSenderId: "771853617292",
  appId: "1:771853617292:web:0f57cb3feae4f673aa13a9"
};

const firebaseApp  = initializeApp(firebaseConfig);
export const auth  = getAuth(firebaseApp);
export const db    = getFirestore(firebaseApp);
export default firebaseApp;




 


 