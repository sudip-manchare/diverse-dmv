"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  validatePassword,
  updateProfile,
  type User,
} from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase-client";
import { mutation } from "@/lib/client-api";
import { Brand } from "./landing";
import { Fish, Notice } from "./ui";
import { profileSchema } from "@/shared/contracts";
export default function AuthForm({
  mode,
}: {
  mode: "signup" | "login" | "recover";
}) {
  const router = useRouter();
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [phone, setPhone] = useState(""),
    [linkedin, setLinkedin] = useState(""),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [fieldErrors, setFieldErrors] = useState<Record<string, string>>({}),
    [created, setCreated] = useState<User | null>(null),
    [policy, setPolicy] = useState(
      "Password requirements are checked securely by your account provider.",
    );
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.querySelector<HTMLElement>("h1")?.focus();
    document.title = `${mode === "signup" ? "Join the community" : mode === "login" ? "Log in" : "Reset your password"} · Diverse DMV`;
    if (mode === "signup")
      void firebaseAuth()
        .then((a) => validatePassword(a, ""))
        .then((p) => {
          const o = p.passwordPolicy.customStrengthOptions;
          setPolicy(
            [
              o.minPasswordLength
                ? `At least ${o.minPasswordLength} characters`
                : null,
              o.containsLowercaseLetter ? "a lowercase letter" : null,
              o.containsUppercaseLetter ? "an uppercase letter" : null,
              o.containsNumericCharacter ? "a number" : null,
              o.containsNonAlphanumericCharacter ? "a symbol" : null,
            ]
              .filter(Boolean)
              .join(", ") + ".",
          );
        })
        .catch(() => {});
  }, [mode]);
  useEffect(() => {
    if (mode === "recover") return;
    let active = true;
    void fetch("/api/me", { credentials: "same-origin", cache: "no-store" })
      .then((response) => {
        if (active && response.ok) router.replace("/dashboard");
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [mode, router]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setFieldErrors({});
    let providerCreated = false;
    try {
      if (
        mode === "signup" &&
        (!name.trim() ||
          !profileSchema.shape.displayName.safeParse(name).success)
      ) {
        setFieldErrors({ name: "Enter a name of 100 characters or fewer." });
        setError("Check the highlighted fields.");
        return;
      }
      const auth = await firebaseAuth();
      if (mode === "recover") {
        try {
          await sendPasswordResetEmail(auth, email.trim());
        } catch (e: any) {
          if (e.code !== "auth/user-not-found") throw e;
        }
        setDone(true);
        setPassword("");
        return;
      }
      let user = created;
      if (!user) {
        const credentials =
          mode === "signup"
            ? await createUserWithEmailAndPassword(auth, email.trim(), password)
            : await signInWithEmailAndPassword(auth, email.trim(), password);
        user = credentials.user;
        if (mode === "signup") {
          setCreated(user);
          providerCreated = true;
        }
      }
      // Retain the initial display name in Firebase if application provisioning is interrupted.
      if (mode === "signup") await updateProfile(user, { displayName: name });
      await mutation("/api/session", {
        idToken: await user.getIdToken(true),
        ...(mode === "signup" ? { name, phone, linkedin } : {}),
      });
      setPassword("");
      window.dispatchEvent(new Event("session-restored"));
      const target = new URLSearchParams(window.location.search).get(
        "returnTo",
      );
      const safe =
        target &&
        /^\/(dashboard|profile(?:\/(?:setup|edit))?|connections\/(?:discover|requests|mine)|messages(?:\/(?:new|[a-f0-9-]+))?|settings)(?:\?[^#]*)?$/.test(
          target,
        )
          ? target
          : "/dashboard";
      router.replace(safe);
      router.refresh();
    } catch (e: any) {
      if (e.fields) setFieldErrors(e.fields);
      const c = e.code || "";
      if (
        c === "auth/invalid-credential" ||
        c === "auth/wrong-password" ||
        c === "auth/user-not-found"
      ) {
        setError(
          "Email or password wasn’t recognized. Try again or reset your password.",
        );
        setPassword("");
      } else if (c === "auth/email-already-in-use")
        setError(
          "We couldn’t create this account. Try logging in or reset your password.",
        );
      else if (c === "auth/weak-password")
        setError("Your password doesn’t meet the requirements shown above.");
      else if (c === "auth/too-many-requests")
        setError("Too many attempts. Try again later.");
      else if (c === "auth/network-request-failed")
        setError("Check your connection and try again.");
      else
        setError(
          created || providerCreated
            ? "Your account was created, but we couldn’t finish logging you in. Try again."
            : e.message?.startsWith("Firebase")
              ? "Account access is unavailable. Try again later."
              : e.message || "We couldn’t finish logging you in. Try again.",
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <header className="public-header">
        <Brand />
        <Link href="/">Back to community</Link>
      </header>
      <main tabIndex={-1} id="main" className="auth-layout">
        <aside className="auth-aside">
          <p className="eyebrow">Your next chapter starts here</p>
          <h2>
            A little courage.
            <br />A sea of possibility.
          </h2>
          <p>
            Find peers, share what you know, and make room for what comes next.
          </p>
          <Fish variant="sunlight" />
          <p className="help">D.C. · Maryland · Virginia</p>
        </aside>
        <section className="auth-card">
          <h1 tabIndex={-1}>
            {done
              ? "Check your email"
              : mode === "signup"
                ? "Join the community"
                : mode === "login"
                  ? "Log in"
                  : "Reset your password"}
          </h1>
          {done ? (
            <>
              <Notice title="If an account uses that email, you’ll receive a password reset link.">
                <p>Check your spam folder too.</p>
              </Notice>
              <div className="actions">
                <Link className="button" href="/login">
                  Back to log in
                </Link>
                <button className="secondary" onClick={() => setDone(false)}>
                  Send another link
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="muted">
                {mode === "signup"
                  ? "Start with your name and email. Add professional details when you’re ready."
                  : mode === "recover"
                    ? "Enter the email you use to log in."
                    : "Welcome back. Your community is waiting."}
              </p>
              {error && (
                <div ref={errorRef} tabIndex={-1}>
                  <Notice error title={error}>
                    {Object.keys(fieldErrors).length > 0 && (
                      <ul>
                        {Object.entries(fieldErrors).map(([key, value]) => (
                          <li key={key}>
                            <a
                              href={`#${key}`}
                              onClick={() => {
                                const element = document.getElementById(key);
                                element
                                  ?.closest("details")
                                  ?.setAttribute("open", "");
                                element?.focus();
                              }}
                            >
                              {value}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Notice>
                </div>
              )}
              <form onSubmit={submit}>
                {mode === "signup" && (
                  <div className="field">
                    <label htmlFor="name">Name</label>
                    <input
                      aria-invalid={!!fieldErrors.name}
                      aria-describedby={
                        fieldErrors.name ? "name-error" : undefined
                      }
                      id="name"
                      autoComplete="name"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                    {fieldErrors.name && (
                      <p id="name-error" className="field-error">
                        {fieldErrors.name}
                      </p>
                    )}
                    <p className="help">
                      Use the name you want people to know you by.
                    </p>
                  </div>
                )}
                <div className="field">
                  <label htmlFor="email">Email</label>
                  <input
                    aria-invalid={!!fieldErrors.email}
                    aria-describedby={
                      fieldErrors.email ? "email-error" : undefined
                    }
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  {fieldErrors.email && (
                    <p id="email-error" className="field-error">
                      {fieldErrors.email}
                    </p>
                  )}
                  {mode === "signup" && (
                    <p className="help">
                      Used to log in. Never shown on your profile.
                    </p>
                  )}
                </div>
                {mode !== "recover" && (
                  <div className="field">
                    <label htmlFor="password">Password</label>
                    <div className="password-wrap">
                      <input
                        id="password"
                        type={show ? "text" : "password"}
                        autoComplete={
                          mode === "signup"
                            ? "new-password"
                            : "current-password"
                        }
                        required={!created}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        aria-pressed={show}
                        aria-label={show ? "Hide password" : "Show password"}
                        onClick={() => setShow(!show)}
                      >
                        {show ? "Hide" : "Show"}
                      </button>
                    </div>
                    {mode === "signup" && <p className="help">{policy}</p>}
                  </div>
                )}
                {mode === "signup" && (
                  <details>
                    <summary>Optional details — you can skip these</summary>
                    <div>
                      <div className="field">
                        <label htmlFor="phone">Phone number (optional)</label>
                        <input
                          aria-invalid={!!fieldErrors.phone}
                          aria-describedby={
                            fieldErrors.phone ? "phone-error" : undefined
                          }
                          id="phone"
                          type="tel"
                          autoComplete="tel"
                          value={phone}
                          placeholder="+13015551234"
                          onChange={(e) => setPhone(e.target.value)}
                        />
                        {fieldErrors.phone && (
                          <p id="phone-error" className="field-error">
                            {fieldErrors.phone}
                          </p>
                        )}
                        <p className="help">
                          Include + and your country code. Private. Not
                          verified. Not used for matching, messages or account
                          recovery. You can leave this blank.
                        </p>
                      </div>
                      <div className="field">
                        <label htmlFor="linkedin">
                          LinkedIn profile URL (optional)
                        </label>
                        <input
                          aria-invalid={!!fieldErrors.linkedin}
                          aria-describedby={
                            fieldErrors.linkedin ? "linkedin-error" : undefined
                          }
                          id="linkedin"
                          type="url"
                          value={linkedin}
                          onChange={(e) => setLinkedin(e.target.value)}
                        />
                        {fieldErrors.linkedin && (
                          <p id="linkedin-error" className="field-error">
                            {fieldErrors.linkedin}
                          </p>
                        )}
                        <p className="help">
                          A link only. We don’t import your LinkedIn
                          information.
                        </p>
                      </div>
                    </div>
                  </details>
                )}
                {mode === "signup" && (
                  <p className="help">
                    Your account email and optional phone stay private. Creating
                    an account does not publish your profile.
                  </p>
                )}
                <button
                  style={{ width: "100%", marginTop: "1rem" }}
                  disabled={busy}
                >
                  {busy
                    ? mode === "signup"
                      ? "Creating account…"
                      : mode === "login"
                        ? "Logging in…"
                        : "Sending reset link…"
                    : created
                      ? "Continue logging in"
                      : mode === "signup"
                        ? "Create account"
                        : mode === "login"
                          ? "Log in"
                          : "Send reset link"}
                </button>
              </form>
              <div className="actions">
                {mode === "login" ? (
                  <>
                    <Link href="/recover">Forgot password?</Link>
                    <Link href="/signup">New here? Join community</Link>
                  </>
                ) : (
                  <Link href="/login">
                    {mode === "signup"
                      ? "Already a member? Log in"
                      : "Back to log in"}
                  </Link>
                )}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
