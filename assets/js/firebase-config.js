import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyDLscDTFvi0uBg8fRMJuV5ZDozJQuBX9AA",
    authDomain: "orecliente-daa0d.firebaseapp.com",
    projectId: "orecliente-daa0d",
    storageBucket: "orecliente-daa0d.firebasestorage.app",
    messagingSenderId: "510090564679",
    appId: "1:510090564679:web:7b95bae80ee6eb3c568d62",
    measurementId: "G-7ZR1CX64VW"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);