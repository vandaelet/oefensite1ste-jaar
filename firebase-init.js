// Firebase-configuratie en gedeelde functies voor de leerlingen- en leerkrachtenpagina.
// De firebaseConfig is geen geheim: de beveiliging zit in de Firestore-regels (firestore.rules).

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, getDocs, setDoc, updateDoc, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBAvglfBny5NbdKovnKOP_ihApOEdB4tfo",
  authDomain: "oefensite-1ste-jaar-svsl.firebaseapp.com",
  projectId: "oefensite-1ste-jaar-svsl",
  storageBucket: "oefensite-1ste-jaar-svsl.firebasestorage.app",
  messagingSenderId: "817757980285",
  appId: "1:817757980285:web:f742479e1ad8e4c5fd1314"
};

export const SCHOOL_DOMEIN = "svsl.be";
export const LEERKRACHT_EMAIL = "vandaele.tom@svsl.be";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export {
  onAuthStateChanged, collection, doc, getDocs, setDoc, updateDoc, query, where, serverTimestamp
};

export function isSchoolAccount(user) {
  return !!(user && user.email && user.email.toLowerCase().endsWith("@" + SCHOOL_DOMEIN));
}

export function isLeerkracht(user) {
  return !!(user && user.email && user.email.toLowerCase() === LEERKRACHT_EMAIL);
}

export function meldAan() {
  const provider = new GoogleAuthProvider();
  // 'hd' toont enkel schoolaccounts in het keuzescherm; de echte controle staat in de regels.
  provider.setCustomParameters({ hd: SCHOOL_DOMEIN, prompt: "select_account" });
  return signInWithPopup(auth, provider);
}

export function meldAf() {
  return signOut(auth);
}

export function aanmeldFoutTekst(fout) {
  switch (fout && fout.code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "";
    case "auth/popup-blocked":
      return "Je browser blokkeerde het aanmeldvenster. Sta pop-ups toe voor deze site en probeer opnieuw.";
    case "auth/unauthorized-domain":
      return "Deze website is nog niet toegelaten in Firebase (Authentication > Settings > Authorized domains).";
    default:
      return "Aanmelden is niet gelukt. Probeer opnieuw of meld je leerkracht.";
  }
}
