// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA4a2raokJQqLmO15O87y-Ho80nCN5_jEY",
  authDomain: "diverse-dmv.firebaseapp.com",
  projectId: "diverse-dmv",
  storageBucket: "diverse-dmv.firebasestorage.app",
  messagingSenderId: "180727501087",
  appId: "1:180727501087:web:752c479727563a098ea02a",
  measurementId: "G-2XTCJP9S14"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
