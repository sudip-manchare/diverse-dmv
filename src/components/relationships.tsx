"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { mutation } from "@/lib/client-api";
import { characterCount, type MemberProfile } from "@/shared/contracts";
import { Modal, Notice } from "./ui";
export function RelationshipAction({
  member,
  onChange,
}: {
  member: MemberProfile;
  onChange?: () => void;
}) {
  const [open, setOpen] = useState(false),
    [body, setBody] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [state, setState] = useState(member.relationship);
  const operation = useRef<{ id: string; body: string } | null>(null);
  useEffect(() => setState(member.relationship), [member.relationship]);
  async function send() {
    if (characterCount(body) > 500) {
      setError("Keep your introduction to 500 characters or fewer.");
      return;
    }
    setBusy(true);
    setError("");
    operation.current ||= { id: crypto.randomUUID(), body };
    try {
      const result = await mutation("/api/requests", {
        recipientId: member.id,
        introduction: operation.current.body,
        operationId: operation.current.id,
      });
      if (result.request.status === "pending") setState("outgoing");
      setOpen(false);
      onChange?.();
    } catch (e: any) {
      if (e.code === "STALE_STATE" || e.code === "NOT_ALLOWED") {
        setOpen(false);
        onChange?.();
      } else
        setError(
          e.code === "RATE_LIMITED"
            ? e.retryAt
              ? `You can request a connection again ${new Date(e.retryAt).toLocaleString()}.`
              : e.message
            : "We couldn’t confirm whether your request was sent. Retry to check or complete it.",
        );
    } finally {
      setBusy(false);
    }
  }
  if (state === "connected")
    return (
      <>
        {member.canMessage && (
          <Link
            className="button"
            href={`/messages/new?recipient=${member.id}`}
          >
            Message
          </Link>
        )}
        <Link href="/connections/mine">View my connections</Link>
      </>
    );
  if (state === "incoming")
    return (
      <Link className="button" href="/connections/requests?view=incoming">
        Review incoming request
      </Link>
    );
  if (state === "outgoing")
    return (
      <>
        <span>Request pending</span>
        <Link href="/connections/requests?view=outgoing">
          View outgoing requests
        </Link>
      </>
    );
  if (member.retryAt && new Date(member.retryAt).getTime() > Date.now())
    return (
      <p>
        You can request a connection again{" "}
        {new Date(member.retryAt).toLocaleString()}.
      </p>
    );
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`Connect with ${member.data.displayName}`}
      >
        Connect
      </button>
      {open && (
        <Modal
          title={`Connect with ${member.data.displayName}`}
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <p>
            Add an introduction (optional). Accepting a connection does not
            share your private email or phone.
          </p>
          <div className="field">
            <label htmlFor="introduction">Introduction (optional)</label>
            <textarea
              id="introduction"
              placeholder="Share why you’d like to connect."
              value={operation.current?.body ?? body}
              disabled={busy || !!operation.current}
              onChange={(e) => setBody(e.target.value)}
            />
            <p className="help">{characterCount(body)}/500 characters</p>
          </div>
          {error && <Notice error title={error} />}
          <div className="actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button onClick={send} disabled={busy}>
              {busy
                ? "Sending request…"
                : operation.current
                  ? "Retry request"
                  : "Send request"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function ConfirmAction({
  label,
  title,
  description,
  path,
  body,
  method = "POST",
  onDone,
  danger = true,
  idempotency = "operation",
  cancelLabel = "Cancel",
  confirmLabel,
}: {
  label: string;
  title: string;
  description: string;
  path: string;
  body?: Record<string, unknown>;
  method?: string;
  onDone?: () => void;
  danger?: boolean;
  idempotency?: "operation" | "version";
  cancelLabel?: string;
  confirmLabel?: string;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const operation = useRef<string | null>(null);
  async function act() {
    setBusy(true);
    setError("");
    operation.current ||= crypto.randomUUID();
    try {
      await mutation(
        path,
        idempotency === "version"
          ? body
          : { ...body, operationId: operation.current },
        method,
      );
      setOpen(false);
      onDone?.();
    } catch (e: any) {
      setError(
        e.message ||
          "We couldn’t confirm whether that change was saved. Refresh to check.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className={danger ? "text-button danger" : "secondary"}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      {open && (
        <Modal
          title={title}
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <p>{description}</p>
          {error && <Notice error title={error} />}
          <div className="actions">
            <button
              className="secondary"
              data-autofocus
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              {cancelLabel}
            </button>
            <button
              className={danger ? "danger" : ""}
              disabled={busy}
              onClick={act}
            >
              {busy ? "Saving…" : confirmLabel || label}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
