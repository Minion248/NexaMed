import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyAHbSTrNqxbS4VroWAkVB7y90YvjRyPqN4",
    authDomain: "emt-e9471.firebaseapp.com",
    projectId: "emt-e9471",
    storageBucket: "emt-e9471.firebasestorage.app",
    messagingSenderId: "771853617292",
    appId: "1:771853617292:web:0f57cb3feae4f673aa13a9"
  };

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);