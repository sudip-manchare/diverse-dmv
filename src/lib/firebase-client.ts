"use client";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  inMemoryPersistence,
  connectAuthEmulator,
} from "firebase/auth";
let emulatorConnected = false;
export async function firebaseAuth() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  if (!config.apiKey || !config.projectId)
    throw new Error("Account access is unavailable. Try again later.");
  const auth = getAuth(getApps().length ? getApp() : initializeApp(config));
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL &&
    !emulatorConnected
  ) {
    connectAuthEmulator(
      auth,
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL,
      { disableWarnings: true },
    );
    emulatorConnected = true;
  }
  await setPersistence(auth, inMemoryPersistence);
  return auth;
}
