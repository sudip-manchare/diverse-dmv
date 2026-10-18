"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { INTENTION_LABELS } from "@/shared/contracts";
export function Fish({
  variant = "teal",
  className = "",
}: {
  variant?: string;
  className?: string;
}) {
  const colors: Record<string, string> = {
    teal: "#f9a8c9",
    coral: "#ed83ad",
    sunlight: "#ffd5e6",
    indigo: "#dba0c1",
  };
  return (
    <svg
      className={`fish ${className}`}
      viewBox="0 0 100 66"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="fish-tail"
        d="M29 29 9 13Q1 33 10 51L31 39"
        fill={colors[variant] || colors.teal}
        stroke="#4c102b"
        strokeWidth="2"
      />
      <path
        d="M39 17 49 5 63 17"
        fill={colors[variant] || colors.teal}
        stroke="#4c102b"
        strokeWidth="2"
      />
      <ellipse
        cx="58"
        cy="33"
        rx="31"
        ry="21"
        fill={colors[variant] || colors.teal}
        stroke="#4c102b"
        strokeWidth="2"
      />
      <path
        d="M43 20Q35 32 44 47M52 16Q43 32 53 52"
        stroke="#4c102b"
        strokeWidth="2"
        fill="none"
        opacity=".35"
      />
      <circle cx="75" cy="28" r="4" fill="#4c102b" />
      <path d="M78 38q5 3 9-2" stroke="#4c102b" strokeWidth="2" fill="none" />
      <path d="m59 36-9 10 14-2" fill="#fff" opacity=".6" />
    </svg>
  );
}
export function Avatar({
  name = "Member",
  imageUrl,
}: {
  name?: string;
  imageUrl?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="avatar" aria-hidden="true">
      {imageUrl && !failed ? (
        <img
          src={imageUrl}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "50%",
          }}
        />
      ) : (
        name
          .split(/\s+/)
          .slice(0, 2)
          .map((s) => Array.from(s)[0])
          .join("")
      )}
    </span>
  );
}
export function Notice({
  title,
  children,
  error = false,
}: {
  title: string;
  children?: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`notice ${error ? "error" : ""}`}
      role={error ? "alert" : "status"}
    >
      <strong>{title}</strong>
      {children && <div>{children}</div>}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement;
    const d = ref.current;
    d?.showModal();
    const targets = d?.querySelectorAll<HTMLElement>("[data-autofocus]");
    targets?.[targets.length - 1]?.focus();
    return () => {
      d?.close();
      opener?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const first = controls[0],
          last = controls[controls.length - 1];
        if (!first || !last) {
          event.preventDefault();
          return;
        }
        const active = document.activeElement;
        if (
          event.shiftKey &&
          (active === first || !controls.includes(active as HTMLElement))
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      aria-labelledby="dialog-heading"
    >
      <div className="dialog-content">
        <h2 id="dialog-heading" tabIndex={-1} data-autofocus>
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}
export function ErrorPanel({
  error,
  retry,
  unavailable = "This item is unavailable.",
}: {
  error: any;
  retry?: () => void;
  unavailable?: string;
}) {
  const code = error?.code;
  return (
    <Notice
      error
      title={
        code === "UNAUTHENTICATED"
          ? "Your session ended. Log in to continue."
          : code === "UNAVAILABLE" || code === "NOT_ALLOWED"
            ? unavailable
            : error?.message || "We couldn’t load this. Try again."
      }
    >
      {code === "UNAUTHENTICATED" ? (
        <>
          <p>Unsent text may be lost when you log in again.</p>
          <Link className="button" href="/login">
            Log in
          </Link>
        </>
      ) : (
        retry && <button onClick={retry}>Try again</button>
      )}
    </Notice>
  );
}
const intentionLabels: Readonly<Record<string, string>> = INTENTION_LABELS;
export function Tags({ items = [] }: { items?: string[] }) {
  return (
    <div className="tags">
      {items.map((x) => (
        <span className="tag" key={x}>
          {intentionLabels[x] || x}
        </span>
      ))}
    </div>
  );
}
export function PageTitle({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-title">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 tabIndex={-1}>{title}</h1>
      {children}
    </div>
  );
}
