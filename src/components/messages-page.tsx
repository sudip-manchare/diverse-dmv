"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, mutation, useResource, ApiError } from "@/lib/client-api";
import {
  characterCount,
  type Conversation,
  type Message,
  type MessagesResponse,
  type MemberProfile,
} from "@/shared/contracts";
import { useMember } from "./app-shell";
import { PageTitle, Notice, Fish, ErrorPanel } from "./ui";
type Pending = {
  id: string;
  body: string;
  recipientId: string;
  failed: boolean;
};
const pendingOperations = new Map<string, Pending>();
const drafts = new Map<string, string>();
if (typeof window !== "undefined")
  window.addEventListener("clear-private-drafts", () => {
    pendingOperations.clear();
    drafts.clear();
  });
export default function MessagesPage({ id }: { id?: string }) {
  const { account } = useMember();
  const router = useRouter();
  const list = useResource<{ conversations: Conversation[] }>(
    "/api/conversations",
    3000,
  );
  const [recipient, setRecipient] = useState(""),
    [conversation, setConversation] = useState<Conversation | null>(null),
    [messages, setMessages] = useState<Message[]>([]),
    [loading, setLoading] = useState(!!id),
    [error, setError] = useState<ApiError | null>(null),
    [historyError, setHistoryError] = useState(""),
    [before, setBefore] = useState<string | null>(null),
    [more, setMore] = useState(false),
    [olderLoading, setOlderLoading] = useState(false),
    [body, setBody] = useState(""),
    [pending, setPending] = useState<Pending | null>(null),
    [sending, setSending] = useState(false),
    [sendError, setSendError] = useState(""),
    [status, setStatus] = useState(""),
    [newCount, setNewCount] = useState(0),
    [retryVersion, setRetryVersion] = useState(0);
  const afterRef = useRef<string | null>(null),
    historyRef = useRef<HTMLOListElement>(null),
    lastCount = useRef(0),
    keyRef = useRef(""),
    activeRef = useRef(true),
    sendingRef = useRef(false);
  const selected = !!id;
  const scrollLatest = () => {
    const h = historyRef.current;
    if (h) h.scrollTop = h.scrollHeight;
    setNewCount(0);
  };
  const merge = useCallback(
    (current: Message[], incoming: Message[]) =>
      Array.from(
        new Map([...current, ...incoming].map((m) => [m.id, m])).values(),
      ).sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) ||
          (BigInt(a.id) < BigInt(b.id)
            ? -1
            : BigInt(a.id) > BigInt(b.id)
              ? 1
              : 0),
      ),
    [],
  );
  useEffect(() => {
    if (!id) return;
    let active = true,
      busy = false,
      stopped = false;
    activeRef.current = true;
    setLoading(true);
    setMessages([]);
    setConversation(null);
    setError(null);
    setStatus("");
    afterRef.current = null;
    const denied = (e: ApiError) => {
      stopped = true;
      activeRef.current = false;
      setError(e);
      setMessages([]);
      setConversation(null);
      setBody("");
      setPending(null);
      if (e.code !== "UNAUTHENTICATED") {
        pendingOperations.delete(keyRef.current);
        drafts.delete(keyRef.current);
      }
    };
    const load = async (initial = false) => {
      if (busy || !active || stopped || !activeRef.current) return;
      busy = true;
      try {
        if (id === "new") {
          const target =
            new URLSearchParams(window.location.search).get("recipient") || "";
          if (!target)
            throw new ApiError(
              "UNAVAILABLE",
              "This conversation is unavailable.",
            );
          const [member, existing] = await Promise.all([
            api<{ profile: MemberProfile }>(`/api/profiles/${target}`),
            api<{ conversations: Conversation[] }>("/api/conversations"),
          ]);
          const canonical = existing.conversations.find(
            (c) => c.recipientId === target,
          );
          if (!active) return;
          if (canonical) {
            router.replace(`/messages/${canonical.id}`);
            return;
          }
          setRecipient(target);
          setConversation({
            id: "",
            recipientId: target,
            displayName: member.profile.data.displayName,
            canMessage: member.profile.canMessage,
            latestMessage: "",
            updatedAt: "",
          });
          keyRef.current = `${account.id}:${target}`;
          setPending(pendingOperations.get(keyRef.current) || null);
          setBody(
            pendingOperations.get(keyRef.current)?.body ||
              drafts.get(keyRef.current) ||
              "",
          );
          return;
        }
        let cursor = initial ? null : afterRef.current;
        let burst = 0;
        let morePages = true;
        while (active && morePages && burst < 30) {
          const response: MessagesResponse = await api(
            `/api/conversations/${id}/messages${cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`,
          );
          if (!active) return;
          const h = historyRef.current;
          const atEnd =
            !h || h.scrollHeight - h.scrollTop - h.clientHeight < 80;
          setConversation(response.conversation);
          setRecipient(response.conversation.recipientId);
          keyRef.current = `${account.id}:${response.conversation.recipientId}`;
          if (initial) {
            setMessages(response.messages);
            setBefore(response.before);
            setMore(response.hasMore);
            setBody(
              pendingOperations.get(keyRef.current)?.body ||
                drafts.get(keyRef.current) ||
                "",
            );
            setPending(pendingOperations.get(keyRef.current) || null);
          } else if (response.messages.length) {
            setMessages((previous) => merge(previous, response.messages));
            if (atEnd) setTimeout(scrollLatest, 0);
            else setNewCount((n) => n + response.messages.length);
            setStatus(
              atEnd
                ? `New message from ${response.conversation.displayName}.`
                : `${response.messages.length} new messages. Go to latest messages when ready.`,
            );
          }
          afterRef.current = response.after || afterRef.current;
          cursor = response.after;
          morePages = !initial && response.hasMore && !!response.after;
          initial = false;
          burst++;
        }
        setHistoryError("");
      } catch (e) {
        if (active) {
          const failure = e as ApiError;
          if (
            ["NOT_ALLOWED", "UNAVAILABLE", "UNAUTHENTICATED"].includes(
              failure.code,
            )
          )
            denied(failure);
          else if (initial) setError(failure);
          else setHistoryError("Messages couldn’t refresh. Try again.");
        }
      } finally {
        busy = false;
        if (active) {
          setLoading(false);
          if (initial) setTimeout(scrollLatest, 0);
        }
      }
    };
    void load(true).then(() => setTimeout(scrollLatest, 50));
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && !sendingRef.current)
        void load();
    }, 2000);
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => {
      active = false;
      activeRef.current = false;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [id, account.id, router, merge, retryVersion]);
  useEffect(() => {
    if (!pending) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);
  useEffect(() => {
    lastCount.current = messages.length;
  }, [messages.length]);
  async function earlier() {
    if (!id || !before || olderLoading) return;
    setOlderLoading(true);
    setHistoryError("");
    const h = historyRef.current;
    const oldHeight = h?.scrollHeight || 0,
      oldTop = h?.scrollTop || 0,
      oldViewportTop = h?.getBoundingClientRect().top || 0;
    try {
      const response = await api<MessagesResponse>(
        `/api/conversations/${id}/messages?before=${encodeURIComponent(before)}`,
      );
      setMessages((previous) => merge(previous, response.messages));
      setBefore(response.before);
      setMore(response.hasMore);
      requestAnimationFrame(() => {
        if (h)
          h.scrollTop =
            oldTop +
            h.scrollHeight -
            oldHeight +
            h.getBoundingClientRect().top -
            oldViewportTop;
      });
      setStatus("Earlier messages loaded.");
    } catch (e) {
      const failure = e as ApiError;
      if (
        ["UNAVAILABLE", "NOT_ALLOWED", "UNAUTHENTICATED"].includes(failure.code)
      ) {
        activeRef.current = false;
        setError(failure);
        setMessages([]);
        setConversation(null);
        setBody("");
        setPending(null);
        if (failure.code !== "UNAUTHENTICATED") {
          pendingOperations.delete(keyRef.current);
          drafts.delete(keyRef.current);
        }
      } else setHistoryError("Earlier messages couldn’t load.");
    } finally {
      setOlderLoading(false);
    }
  }
  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!conversation?.canMessage || sending) return;
    if (!pending && !body.trim()) {
      setSendError("Enter a message.");
      return;
    }
    if (!pending && characterCount(body) > 2000) {
      setSendError("Keep your message to 2,000 characters or fewer.");
      return;
    }
    const operation = pending || {
      id: crypto.randomUUID(),
      body,
      recipientId: recipient,
      failed: false,
    };
    pendingOperations.set(keyRef.current, operation);
    setPending(operation);
    setSending(true);
    sendingRef.current = true;
    setSendError("");
    try {
      const response = await mutation("/api/conversations/send", {
        recipientId: operation.recipientId,
        body: operation.body,
        clientOperationId: operation.id,
      });
      pendingOperations.delete(keyRef.current);
      drafts.delete(keyRef.current);
      setPending(null);
      setBody("");
      setStatus("Message saved.");
      setMessages((previous) => merge(previous, [response.message]));
      setConversation(response.conversation);
      void list.reload();
      setTimeout(() => {
        scrollLatest();
        document.getElementById("message")?.focus();
      }, 0);
      if (id === "new") router.replace(`/messages/${response.conversation.id}`);
    } catch (e: any) {
      if (e.code === "NOT_ALLOWED") {
        const failed = { ...operation, failed: true };
        pendingOperations.set(keyRef.current, failed);
        setPending(failed);
        setConversation((current) =>
          current ? { ...current, canMessage: false } : current,
        );
        setSendError(
          "New messages are unavailable. Your unconfirmed text is preserved in this tab.",
        );
        try {
          if (id && id !== "new") {
            const current = await api<MessagesResponse>(
              `/api/conversations/${id}/messages`,
            );
            setConversation(current.conversation);
          } else {
            const current = await api<{ profile: MemberProfile }>(
              `/api/profiles/${operation.recipientId}`,
            );
            setConversation((c) =>
              c ? { ...c, canMessage: current.profile.canMessage } : c,
            );
          }
        } catch (readError) {
          const denied = readError as ApiError;
          if (["UNAVAILABLE", "NOT_ALLOWED"].includes(denied.code)) {
            pendingOperations.delete(keyRef.current);
            drafts.delete(keyRef.current);
            setPending(null);
            setBody("");
            activeRef.current = false;
            setError(denied);
            setMessages([]);
          }
        }
      } else if (e.code === "UNAVAILABLE") {
        pendingOperations.delete(keyRef.current);
        drafts.delete(keyRef.current);
        setPending(null);
        setBody("");
        activeRef.current = false;
        setError(e);
        setMessages([]);
      } else if (e.code === "VALIDATION_FAILED") {
        pendingOperations.delete(keyRef.current);
        setPending(null);
        setSendError(e.message || "Check your message.");
      } else {
        const failed = { ...operation, failed: true };
        pendingOperations.set(keyRef.current, failed);
        setPending(failed);
        setSendError(
          e.code === "IDEMPOTENCY_CONFLICT"
            ? "This message could not be retried safely. Reload the conversation to check its status."
            : e.code === "RATE_LIMITED"
              ? "You’re sending too quickly. Try again later."
              : "We couldn’t confirm whether your message was saved. Retry to check or save it.",
        );
      }
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  }
  return (
    <>
      <PageTitle title="Messages">
        <p>Keep the conversation going.</p>
      </PageTitle>
      <div className={`messages-layout ${selected ? "has-thread" : ""}`}>
        <aside className="panel conversation-pane" aria-label="Conversations">
          {list.error ? (
            <ErrorPanel error={list.error} retry={list.reload} />
          ) : !list.data ? (
            <Notice title="Loading conversations…" />
          ) : list.data.conversations.length ? (
            list.data.conversations.map((c) => (
              <Link
                className="conversation-link"
                key={c.id}
                href={`/messages/${c.id}`}
                aria-current={id === c.id ? "page" : undefined}
                aria-label={`${c.displayName}, ${new Date(c.updatedAt).toLocaleString()}`}
              >
                <strong>{c.displayName}</strong>
                <span>{c.latestMessage}</span>
                <time dateTime={c.updatedAt}>
                  {new Date(c.updatedAt).toLocaleString()}
                </time>
              </Link>
            ))
          ) : (
            <div className="empty-state">
              <Fish />
              <h2>No conversations yet.</h2>
              <p>Message a connection to start a conversation.</p>
              <Link href="/connections/mine">My connections</Link>
            </div>
          )}
        </aside>
        {!selected ? (
          <section className="panel thread-placeholder empty-state">
            <Fish />
            <h2>Choose a conversation.</h2>
            <p>Open a conversation to read your messages.</p>
          </section>
        ) : (
          <section className="panel thread-panel">
            <Link href="/messages">Back to Messages</Link>
            {loading ? (
              <Notice title="Loading messages…" />
            ) : error ? (
              <ErrorPanel
                error={error}
                unavailable="This conversation is unavailable."
                retry={() => setRetryVersion((v) => v + 1)}
              />
            ) : conversation ? (
              <>
                <div className="thread-heading" style={{ marginTop: "1.5rem" }}>
                  <h2 tabIndex={-1}>{conversation.displayName}</h2>
                  {conversation.displayName !== "Unavailable member" && (
                    <Link href={`/members/${conversation.recipientId}`}>
                      View profile
                    </Link>
                  )}
                </div>
                {id === "new" ? (
                  <Notice title="Start your conversation.">
                    <p>Messages are saved after you send them.</p>
                  </Notice>
                ) : (
                  <>
                    <div className="actions">
                      {more ? (
                        <button
                          className="secondary"
                          disabled={olderLoading}
                          onClick={() => void earlier()}
                        >
                          {olderLoading ? "Loading…" : "Load earlier messages"}
                        </button>
                      ) : (
                        <p className="help">Beginning of conversation.</p>
                      )}
                    </div>
                    {historyError && (
                      <Notice title={historyError}>
                        <button
                          onClick={() =>
                            more
                              ? void earlier()
                              : setRetryVersion((v) => v + 1)
                          }
                        >
                          Retry
                        </button>
                      </Notice>
                    )}
                    <ol
                      className="history"
                      ref={historyRef}
                      tabIndex={0}
                      aria-label="Conversation history"
                    >
                      {messages.map((m) => (
                        <li
                          className={`message ${m.senderId === account.id ? "own" : ""}`}
                          key={m.id}
                        >
                          <strong>
                            {m.senderId === account.id
                              ? "You"
                              : conversation.displayName}
                          </strong>
                          <p>{m.body}</p>
                          <time
                            dateTime={m.createdAt}
                            aria-label={new Date(m.createdAt).toLocaleString()}
                          >
                            {new Date(m.createdAt).toLocaleString()}
                          </time>
                        </li>
                      ))}
                    </ol>
                    {newCount > 0 && (
                      <button className="secondary" onClick={scrollLatest}>
                        {newCount} new messages — Go to latest
                      </button>
                    )}
                  </>
                )}
                <p className="sr-only" role="status">
                  {status}
                </p>
                {conversation.canMessage ? (
                  <form className="composer" onSubmit={send}>
                    <div className="field">
                      <label htmlFor="message">
                        Message {conversation.displayName}
                      </label>
                      <textarea
                        id="message"
                        value={pending?.body ?? body}
                        disabled={sending || !!pending}
                        aria-invalid={!!sendError}
                        aria-describedby="message-help"
                        onChange={(e) => {
                          setBody(e.target.value);
                          drafts.set(keyRef.current, e.target.value);
                          setSendError("");
                        }}
                      />
                      <p id="message-help" className="help">
                        {characterCount(pending?.body ?? body)}/2,000
                        characters. Enter adds a new line.
                      </p>
                    </div>
                    {pending && (
                      <Notice
                        title={
                          sending
                            ? "Sending… Not yet confirmed."
                            : "Not yet confirmed."
                        }
                      >
                        <p>
                          Unconfirmed text may be lost if you close or reload
                          this page.
                        </p>
                      </Notice>
                    )}
                    {sendError && <Notice error title={sendError} />}
                    <div className="actions">
                      <button
                        type="submit"
                        aria-label={pending ? "Retry message" : "Send message"}
                        disabled={
                          sending ||
                          sendError.includes("could not be retried safely")
                        }
                      >
                        {sending
                          ? "Sending…"
                          : pending
                            ? "Retry message"
                            : "Send"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <Notice title="New messages are unavailable. You can still read this conversation.">
                    <p>
                      You need a current mutual connection to send messages.
                    </p>
                    {pending && (
                      <p>
                        Unconfirmed text is preserved in this tab. It may be
                        lost if you close or reload this page.
                      </p>
                    )}
                    {conversation.displayName !== "Unavailable member" && (
                      <Link href={`/members/${conversation.recipientId}`}>
                        Connect again to send messages
                      </Link>
                    )}
                  </Notice>
                )}
              </>
            ) : null}
          </section>
        )}
      </div>
    </>
  );
}
