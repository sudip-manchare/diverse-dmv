import "server-only";
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { ApiError } from "./http";
export function getFirebaseAuth() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.FIREBASE_AUTH_EMULATOR_HOST
  )
    throw new ApiError(
      503,
      "DEPENDENCY_UNAVAILABLE",
      "Authentication is not configured for production.",
    );
  if (!process.env.FIREBASE_PROJECT_ID)
    throw new ApiError(
      503,
      "DEPENDENCY_UNAVAILABLE",
      "Account access is unavailable right now.",
    );
  if (!getApps().length) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID,
      credential: serviceAccount
        ? cert(JSON.parse(serviceAccount))
        : applicationDefault(),
    });
  }
  return getAuth();
}
