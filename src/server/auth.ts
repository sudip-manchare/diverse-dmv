import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "./db";
import { getFirebaseAuth } from "./firebase";
import { ApiError, readJson } from "./http";
import { emptyProfile, linkedinSchema } from "@/shared/contracts";
import { phoneSchema } from "./validation";
import { boundedText } from "@/shared/contracts";
export interface AccountRow {
  id: string;
  auth_uid: string;
  name: string;
  email: string;
  phone: string | null;
  state: string;
}
const COOKIE = "dmv_session";
const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function requireAccount(_request?: Request): Promise<AccountRow> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token)
    throw new ApiError(
      401,
      "UNAUTHENTICATED",
      "Your session ended. Log in to continue.",
    );
  const sql = getSql();
  const rows =
    await sql`SELECT a.*, s.firebase_cookie FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=${hashToken(token)} AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND a.state='active'`;
  const row = rows[0];
  if (!row)
    throw new ApiError(
      401,
      "UNAUTHENTICATED",
      "Your session ended. Log in to continue.",
    );
  try {
    await getFirebaseAuth().verifySessionCookie(row.firebase_cookie, true);
  } catch {
    throw new ApiError(
      401,
      "UNAUTHENTICATED",
      "Your session ended. Log in to continue.",
    );
  }
  return {
    id: row.id,
    auth_uid: row.auth_uid,
    name: row.name,
    email: row.email,
    phone: row.phone,
    state: row.state,
  };
}
export async function createSession(request: Request) {
  const body = z
    .object({
      idToken: z.string().min(1).max(10000),
      name: boundedText(100)
        .refine((v) => !!v.trim(), "Enter your name.")
        .optional(),
      phone: phoneSchema.optional(),
      linkedin: linkedinSchema.optional(),
    })
    .strict()
    .parse(await readJson(request));
  let identity;
  try {
    identity = await getFirebaseAuth().verifyIdToken(body.idToken, true);
  } catch {
    throw new ApiError(
      401,
      "UNAUTHENTICATED",
      "Account access is unavailable. Try logging in again.",
    );
  }
  if (!identity.email || Date.now() / 1000 - identity.auth_time > 300)
    throw new ApiError(401, "UNAUTHENTICATED", "Log in again to continue.");
  const expiresIn = 5 * 24 * 60 * 60 * 1000;
  const firebaseCookie = await getFirebaseAuth().createSessionCookie(
    body.idToken,
    { expiresIn },
  );
  const token = randomBytes(32).toString("base64url");
  const sql = getSql();
  const account = await sql.begin(async (tx) => {
    const name = body.name || identity.name || identity.email!.split("@")[0];
    const [account] =
      await tx`INSERT INTO accounts(auth_uid,name,email,phone) VALUES(${identity.uid},${name},${identity.email!},${body.phone || null}) ON CONFLICT(auth_uid) DO UPDATE SET email=EXCLUDED.email,updated_at=clock_timestamp() RETURNING *`;
    if (account.state !== "active")
      throw new ApiError(
        401,
        "UNAUTHENTICATED",
        "Your account is no longer available.",
      );
    const [recent] =
      await tx`SELECT count(*)::int AS count FROM sessions WHERE account_id=${account.id} AND created_at>clock_timestamp()-interval '15 minutes'`;
    if (recent.count >= 30)
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "Too many attempts. Try again later.",
      );
    await tx`DELETE FROM sessions WHERE account_id=${account.id} AND expires_at<clock_timestamp()`;
    const profile = emptyProfile(account.name);
    if (body.linkedin) profile.linkedinUrl = body.linkedin;
    await tx`INSERT INTO profiles(account_id,data) VALUES(${account.id},${tx.json(profile)}) ON CONFLICT(account_id) DO NOTHING`;
    await tx`INSERT INTO sessions(account_id,token_hash,firebase_cookie,expires_at) VALUES(${account.id},${hashToken(token)},${firebaseCookie},${new Date(Date.now() + expiresIn)})`;
    return account;
  });
  const response = NextResponse.json({
    account: {
      id: account.id,
      name: account.name,
      email: account.email,
      phone: account.phone,
      state: account.state,
    },
  });
  response.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: expiresIn / 1000,
  });
  return response;
}
export async function deleteSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (token)
    await getSql()`UPDATE sessions SET revoked_at=clock_timestamp() WHERE token_hash=${hashToken(token)}`;
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
