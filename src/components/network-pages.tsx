"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useResource, mutation } from "@/lib/client-api";
import type { RequestItem, ConnectionItem } from "@/shared/contracts";
import { Avatar, PageTitle, Notice, ErrorPanel, Fish } from "./ui";
import { ConnectionsNav } from "./app-shell";
import { ConfirmAction } from "./relationships";
export function RequestsPage() {
  const resource = useResource<{
    incoming: RequestItem[];
    outgoing: RequestItem[];
  }>("/api/requests", 3000);
  const [view, setView] = useState<"incoming" | "outgoing">("incoming"),
    [busy, setBusy] = useState(""),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const acceptOperations = useRef(new Map<string, string>());
  useEffect(() => {
    const sync = () =>
      setView(
        new URLSearchParams(window.location.search).get("view") === "outgoing"
          ? "outgoing"
          : "incoming",
      );
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  async function accept(item: RequestItem) {
    setBusy(item.id);
    setError("");
    try {
      const operationId =
        acceptOperations.current.get(item.id) || crypto.randomUUID();
      acceptOperations.current.set(item.id, operationId);
      await mutation(`/api/requests/${item.id}/accept`, {
        operationId,
      });
      acceptOperations.current.delete(item.id);
      setStatus(`You’re now connected with ${item.member.data.displayName}.`);
      await resource.reload();
    } catch (e: any) {
      setError(e.message);
      await resource.reload();
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <PageTitle title="Requests">
        <p>A good conversation starts with mutual interest.</p>
      </PageTitle>
      <ConnectionsNav />
      <nav className="subnav" aria-label="Request direction">
        {(["incoming", "outgoing"] as const).map((v) => (
          <Link
            href={`/connections/requests?view=${v}`}
            key={v}
            aria-current={view === v ? "page" : undefined}
            onClick={() => setView(v)}
          >
            {v === "incoming" ? "Incoming" : "Outgoing"}
          </Link>
        ))}
      </nav>
      {status && (
        <Notice title={status}>
          <Link href="/connections/mine">View my connections</Link>
        </Notice>
      )}
      {error && <Notice error title={error} />}
      <div className="panel">
        {resource.error ? (
          <ErrorPanel error={resource.error} retry={resource.reload} />
        ) : !resource.data ? (
          <Notice title="Loading requests…" />
        ) : resource.data[view].length ? (
          <ul className="rows">
            {resource.data[view].map((item) => (
              <li className="list-row" key={item.id}>
                <div className="profile-heading">
                  <Avatar name={item.member.data.displayName} />
                  <div>
                    <h2>
                      <Link href={`/members/${item.member.id}`}>
                        {item.member.data.displayName}
                      </Link>
                    </h2>
                    <time className="help" dateTime={item.createdAt}>
                      {view === "incoming" ? "Received" : "Sent"}{" "}
                      {new Date(item.createdAt).toLocaleString()}
                    </time>
                  </div>
                </div>
                {item.introduction && (
                  <blockquote>{item.introduction}</blockquote>
                )}
                <p>
                  {view === "outgoing"
                    ? "Pending"
                    : "This member sent you a request."}
                </p>
                <div className="actions">
                  {view === "incoming" ? (
                    <>
                      <button
                        disabled={busy === item.id}
                        onClick={() => void accept(item)}
                      >
                        {busy === item.id ? "Accepting…" : "Accept"}
                      </button>
                      <ConfirmAction
                        label="Decline"
                        title="Decline this request?"
                        description="You won’t become connected."
                        cancelLabel="Keep request"
                        confirmLabel="Decline request"
                        path={`/api/requests/${item.id}/decline`}
                        onDone={() => void resource.reload()}
                      />
                    </>
                  ) : (
                    <ConfirmAction
                      label="Cancel request"
                      title="Cancel this request?"
                      description="This will close your pending request."
                      cancelLabel="Keep request"
                      path={`/api/requests/${item.id}/cancel`}
                      onDone={() => void resource.reload()}
                    />
                  )}
                  <ConfirmAction
                    label="Block member"
                    title={`Block ${item.member.data.displayName}?`}
                    description="You won’t be able to view each other’s profiles, connect or message. Existing conversations will be hidden. Unblocking won’t restore a connection."
                    path="/api/blocks"
                    body={{ blockedId: item.member.id }}
                    onDone={() => void resource.reload()}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state">
            <Fish />
            <h2>
              {view === "incoming"
                ? "No incoming requests."
                : "No outgoing requests."}
            </h2>
            <p>
              {view === "incoming"
                ? "When someone wants to connect, their introduction will appear here."
                : "Find people you’d like to meet."}
            </p>
            <Link className="button" href="/connections/discover">
              Discover people
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
export function ConnectionsPage() {
  const resource = useResource<{ connections: ConnectionItem[] }>(
    "/api/connections",
    3000,
  );
  const [status, setStatus] = useState("");
  return (
    <>
      <PageTitle title="My connections">
        <p>People you’ve both chosen to connect with.</p>
      </PageTitle>
      <ConnectionsNav />
      {status && <Notice title={status} />}
      <div className="panel">
        {resource.error ? (
          <ErrorPanel error={resource.error} retry={resource.reload} />
        ) : !resource.data ? (
          <Notice title="Loading connections…" />
        ) : resource.data.connections.length ? (
          <ul className="rows">
            {resource.data.connections.map((item) => (
              <li className="list-row" key={item.id}>
                <div className="profile-heading">
                  <Avatar name={item.member.data.displayName} />
                  <div>
                    <h2>{item.member.data.displayName}</h2>
                    {item.member.data.headline && (
                      <p>{item.member.data.headline}</p>
                    )}
                    <span className="tag">Connected</span>
                  </div>
                </div>
                <div className="actions">
                  <Link
                    className="button secondary"
                    href={`/members/${item.member.id}`}
                  >
                    View profile
                  </Link>
                  {item.member.canMessage && (
                    <Link
                      className="button"
                      href={
                        item.conversationId
                          ? `/messages/${item.conversationId}`
                          : `/messages/new?recipient=${item.member.id}`
                      }
                    >
                      Message
                    </Link>
                  )}
                  <ConfirmAction
                    label="Remove connection"
                    title="Remove this connection?"
                    description="You won’t be able to send new messages until you reconnect. Your existing conversation will remain readable unless either of you blocks the other."
                    cancelLabel="Keep connection"
                    path={`/api/connections/${item.id}`}
                    method="DELETE"
                    onDone={() => {
                      setStatus("Connection removed.");
                      void resource.reload();
                    }}
                  />
                  <ConfirmAction
                    label="Block member"
                    title={`Block ${item.member.data.displayName}?`}
                    description="You won’t be able to view each other’s profiles, connect or message. Existing conversations will be hidden. Unblocking won’t restore your connection."
                    path="/api/blocks"
                    body={{ blockedId: item.member.id }}
                    onDone={() => void resource.reload()}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state">
            <Fish />
            <h2>Your connections will appear here.</h2>
            <p>Discover people and send a request to start.</p>
            <Link className="button" href="/connections/discover">
              Discover people
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
