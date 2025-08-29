import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";


// Firebase コンソールで取得した値で置き換えてください
const firebaseConfig = {
  apiKey: "AIzaSyC0mjmCYlctve5zLeIVXbdZS1BFWxnLQxE",
  authDomain: "gourmet-3ac27.firebaseapp.com",
  projectId: "gourmet-3ac27",
  storageBucket: "gourmet-3ac27.firebasestorage.app",
  messagingSenderId: "512406466232",
  appId: "1:512406466232:web:760de61adc5fe6807c4e4d",
  measurementId: "G-GL9KZV7GJM"
};


export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
