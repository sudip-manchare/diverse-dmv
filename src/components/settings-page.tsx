"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMember } from "./app-shell";
import { useResource, mutation } from "@/lib/client-api";
import { PageTitle, Notice, ErrorPanel } from "./ui";
import { ConfirmAction } from "./relationships";
export default function SettingsPage() {
  const { account, profile, refresh } = useMember();
  const blocks = useResource<{
    blocks: { id: string; blockedId: string; name: string }[];
  }>("/api/blocks");
  const router = useRouter();
  const [name, setName] = useState(account.name),
    [phone, setPhone] = useState(account.phone || ""),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await mutation("/api/me", { name, phone }, "PATCH");
      setPhone(result.account.phone || "");
      setName(result.account.name);
      refresh();
      setStatus("Changes saved.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await mutation("/api/session", undefined, "DELETE");
      window.dispatchEvent(new Event("clear-private-drafts"));
      router.replace("/");
      router.refresh();
    } catch {
      setError("We couldn’t log you out. Try again.");
    }
  }
  return (
    <>
      <PageTitle title="Settings">
        <p>Your information, your boundaries.</p>
      </PageTitle>
      {status && <Notice title={status} />}{" "}
      {error && <Notice error title={error} />}
      <div className="settings-grid">
        <section className="panel">
          <h2>Private account information</h2>
          <p className="help">
            Only you can see this information. Accepting a connection won’t
            share it.
          </p>
          <form onSubmit={save}>
            <div className="field">
              <label htmlFor="account-name">Name</label>
              <input
                id="account-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="account-email">Email</label>
              <input
                id="account-email"
                type="email"
                value={account.email}
                readOnly
              />
              <p className="help">
                Used to log in. Never shown on your profile.
              </p>
            </div>
            <div className="field">
              <label htmlFor="account-phone">Phone number (optional)</label>
              <input
                id="account-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <p className="help">
                Use + and your country code. Private. Not verified. Not used for
                account recovery.
              </p>
            </div>
            <button disabled={busy}>
              {busy ? "Saving…" : "Save account changes"}
            </button>
          </form>
          <div className="actions">
            <Link href="/recover">Reset your password</Link>
            <button className="secondary" onClick={logout}>
              Log out
            </button>
          </div>
        </section>
        <section className="panel">
          <h2>Profile and visibility</h2>
          <p>
            {profile.published
              ? "Your selected profile details are visible to signed-in community members."
              : "Only you can view your profile."}
          </p>
          <Link className="button" href="/profile/edit">
            Edit profile and visibility
          </Link>
          <div className="actions">
            {profile.published ? (
              <ConfirmAction
                label="Unpublish profile"
                title="Unpublish your profile?"
                description="Other members won’t be able to view or discover your profile. New messages will stop. Existing conversations remain readable unless blocked."
                path="/api/me/profile/unpublish"
                idempotency="version"
                cancelLabel="Keep published"
                body={{ version: profile.version }}
                onDone={() => {
                  refresh();
                  setStatus("Profile unpublished. Only you can view it.");
                }}
              />
            ) : (
              <Link href="/profile/edit?preview=1">Review and publish</Link>
            )}
          </div>
        </section>
        <section className="panel">
          <h2>Blocked members</h2>
          <p className="help">
            Unblocking restores no previous requests or connections.
          </p>
          {blocks.error ? (
            <ErrorPanel error={blocks.error} retry={blocks.reload} />
          ) : !blocks.data ? (
            <p>Loading blocked members…</p>
          ) : blocks.data.blocks.length ? (
            <ul className="rows">
              {blocks.data.blocks.map((b) => (
                <li className="list-row" key={b.id}>
                  <strong>{b.name || "Blocked member"}</strong>
                  <div className="actions">
                    <ConfirmAction
                      label="Unblock"
                      title="Unblock this member?"
                      description="This won’t reconnect you. If a conversation is still available, you may be able to read it. You must connect again to send messages."
                      cancelLabel="Keep blocked"
                      confirmLabel="Unblock member"
                      path={`/api/blocks/${b.id}`}
                      method="DELETE"
                      onDone={() => void blocks.reload()}
                      danger={false}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>You haven’t blocked anyone.</p>
          )}
        </section>
        <section className="panel">
          <h2>Account deletion</h2>
          {account.deletionRequest ? (
            <Notice title="Deletion request received.">
              <p>
                Your request is awaiting processing. This does not confirm that
                your information has been erased.
              </p>
              <p>Status: {account.deletionRequest.status}</p>
            </Notice>
          ) : (
            <>
              <p>
                Request review of your account deletion. This is not immediate
                erasure.
              </p>
              <ConfirmAction
                label="Request account deletion"
                title="Request account deletion?"
                confirmLabel="Submit deletion request"
                description="We’ll record your request for processing. Access is disabled when processing is confirmed. Retention, including messages in another participant’s history, follows the deletion policy; this request does not promise immediate erasure."
                path="/api/deletion-requests"
                onDone={() => {
                  refresh();
                  setStatus(
                    "Deletion request received. Your request is awaiting processing.",
                  );
                }}
              />
            </>
          )}
        </section>
      </div>
    </>
  );
}
