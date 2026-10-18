import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const enabled = process.env.RUN_AUTH_EMULATOR_TESTS === "1";
test(
  "Firebase emulator token exchange, persisted private account, CSRF rejection and session revocation",
  { skip: !enabled },
  async () => {
    const origin = process.env.APP_ORIGIN || "http://127.0.0.1:3000";
    const email = `fictional-${randomUUID()}@example.invalid`;
    const signup = await fetch(
      "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password: "Fictional-only-password-123!",
          returnSecureToken: true,
        }),
      },
    );
    assert.equal(signup.status, 200);
    const identity = (await signup.json()) as any;
    const headers = {
      "Content-Type": "application/json",
      Origin: origin,
      "x-csrf-protection": "1",
    };
    const denied = await fetch(origin + "/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idToken: identity.idToken,
        name: "Fictional Auth Example",
      }),
    });
    assert.equal(denied.status, 403);
    const exchanged = await fetch(origin + "/api/session", {
      method: "POST",
      headers,
      body: JSON.stringify({
        idToken: identity.idToken,
        name: "Fictional Auth Example",
        phone: "+1 202 555 0123",
      }),
    });
    assert.equal(exchanged.status, 200);
    const cookie = exchanged.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie);
    const me = await fetch(origin + "/api/me", {
      headers: { Cookie: cookie! },
    });
    assert.equal(me.status, 200);
    const own = (await me.json()) as any;
    assert.equal(own.account.email, email);
    assert.equal(own.account.phone, "+12025550123");
    assert.equal(own.profile.published, false);
    const anonymous = await fetch(origin + "/api/me");
    assert.equal(anonymous.status, 401);
    const signedout = await fetch(origin + "/api/session", {
      method: "DELETE",
      headers: { ...headers, Cookie: cookie! },
    });
    assert.equal(signedout.status, 200);
    const revoked = await fetch(origin + "/api/me", {
      headers: { Cookie: cookie! },
    });
    assert.equal(revoked.status, 401);
    // The fixture is deliberately disposable; remove both provider identity and its own DB rows.
    await fetch(
      "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:delete?key=demo",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: identity.idToken }),
      },
    );
    const { getSql } = await import("../src/server/db");
    const sql = getSql();
    await sql`DELETE FROM sessions WHERE account_id=${own.account.id}`;
    await sql`DELETE FROM profiles WHERE account_id=${own.account.id}`;
    await sql`DELETE FROM accounts WHERE id=${own.account.id}`;
    await sql.end();
  },
);
