"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { states } from "./us-geography";
import { Modal } from "./ui";
import { useResource } from "@/lib/client-api";
import OfficeExplorer from "./office-explorer";
import OceanBackground, { SwimmingFish } from "./ocean-background";
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Diverse DMV home">
      <span className="brand-mark" aria-hidden="true">
        ≈
      </span>{" "}
      Diverse DMV
    </Link>
  );
}
export default function Landing() {
  const { data } = useResource("/api/me");
  const signedIn = !!data?.account;
  const [dialog, setDialog] = useState(false);
  const [pointerNavigation, setPointerNavigation] = useState(false);
  const router = useRouter();
  const join = (
    <Link className="button" href={signedIn ? "/dashboard" : "/signup"}>
      {signedIn ? "Go to dashboard" : "Join community"}{" "}
      <span aria-hidden="true">↗</span>
    </Link>
  );
  return (
    <div
      className="landing"
      data-pointer-navigation={pointerNavigation}
      onPointerDownCapture={() => setPointerNavigation(true)}
      onKeyDownCapture={() => setPointerNavigation(false)}
    >
      <header className="public-header">
        <Brand />
        <nav aria-label="Public navigation">
          <a
            className="how-link"
            href="#how-it-works"
            onClick={() =>
              setTimeout(
                () => document.getElementById("how-heading")?.focus(),
                20,
              )
            }
          >
            How it works
          </a>
          {!signedIn && <Link href="/login">Log in</Link>}
          {join}
        </nav>
      </header>
      <main tabIndex={-1} id="main">
        <section className="hero ocean-scene">
          <div className="hero-copy">
            <p className="eyebrow">D.C. · Maryland · Virginia</p>
            <h1>
              Dare to dive into your next <em>connection.</em>
            </h1>
            <p>
              A community for underrepresented genders in tech. Find your next
              peer, mentor or collaborator.
            </p>
            <p className="reassurance">
              No résumé or LinkedIn account required.
            </p>
          </div>
          <div className="hero-art">
            <button
              className="map-stage"
              aria-label={
                signedIn
                  ? "Open your DMV dashboard"
                  : "Explore the DMV community — join or log in"
              }
              onClick={() =>
                signedIn ? router.push("/dashboard") : setDialog(true)
              }
            >
              <svg
                className="national-map"
                viewBox="0 0 1000 680"
                aria-hidden="true"
                focusable="false"
              >
                <defs>
                  <radialGradient id="halo">
                    <stop stopColor="#f5afd0" stopOpacity=".7" />
                    <stop offset="1" stopColor="#fce0ed" stopOpacity=".15" />
                  </radialGradient>
                </defs>
                <ellipse
                  cx="760"
                  cy="263"
                  rx="192"
                  ry="175"
                  fill="url(#halo)"
                  stroke="#c97b9e"
                  strokeDasharray="5 8"
                />
                <g transform="translate(10 14) scale(.98)">
                  {states.map((s) => (
                    <path
                      key={s.id}
                      d={s.d}
                      className={
                        ["11", "24", "51"].includes(s.id)
                          ? "dmv-state"
                          : "us-state"
                      }
                    />
                  ))}
                </g>
                <circle
                  cx="786"
                  cy="294"
                  r="18"
                  fill="#4c102b"
                  stroke="#fff8fb"
                  strokeWidth="5"
                />
                <circle cx="786" cy="294" r="6" fill="#f9a8c9" />
                <path
                  d="M789 312 815 403 780 452"
                  fill="none"
                  stroke="#4c102b"
                  strokeWidth="2"
                  strokeDasharray="5 5"
                />
                <g className="desktop-dmv-inset" transform="translate(555 440)">
                  <rect
                    x="0"
                    y="0"
                    width="400"
                    height="208"
                    rx="22"
                    fill="#fff"
                    stroke="#e5bcd0"
                  />
                  <text
                    x="24"
                    y="31"
                    fill="#70465a"
                    fontSize="13"
                    fontWeight="650"
                    letterSpacing="2"
                  >
                    A CLOSER LOOK · DMV
                  </text>
                  <svg
                    x="8"
                    y="40"
                    width="350"
                    height="150"
                    viewBox="710 240 145 100"
                  >
                    <g transform="translate(10 14) scale(.98)">
                      {states
                        .filter((s) => ["11", "24", "51"].includes(s.id))
                        .map((s) => (
                          <path
                            key={s.id}
                            d={s.d}
                            fill="#f7b9d4"
                            stroke="#a52660"
                            strokeWidth=".6"
                          />
                        ))}
                    </g>
                    <circle cx="786" cy="294" r="2.6" fill="#4c102b" />
                    <text
                      x="791"
                      y="290"
                      fontSize="6"
                      fontWeight="700"
                      fill="#4c102b"
                    >
                      D.C.
                    </text>
                    <text
                      x="800"
                      y="269"
                      fontSize="5"
                      fontWeight="600"
                      fill="#4c102b"
                    >
                      Maryland
                    </text>
                    <text
                      x="755"
                      y="314"
                      fontSize="6"
                      fontWeight="600"
                      fill="#4c102b"
                    >
                      Virginia
                    </text>
                  </svg>
                </g>
                <text x="112" y="595" fontSize="13" fill="#7c5265">
                  Alaska
                </text>
                <text x="300" y="595" fontSize="13" fill="#7c5265">
                  Hawaii
                </text>
                <g transform="translate(920 72)" fill="#945c74">
                  <path d="M0 0-7 20 0 16 7 20Z" />
                  <text x="-5" y="-9" fontSize="12">
                    N
                  </text>
                </g>
              </svg>
              <span className="mobile-dmv-inset">
                <span>A closer look · DMV</span>
                <svg
                  viewBox="710 240 145 100"
                  aria-hidden="true"
                  focusable="false"
                >
                  <g transform="translate(10 14) scale(.98)">
                    {states
                      .filter((s) => ["11", "24", "51"].includes(s.id))
                      .map((s) => (
                        <path
                          key={s.id}
                          d={s.d}
                          fill="#f7b9d4"
                          stroke="#a52660"
                          strokeWidth=".6"
                        />
                      ))}
                  </g>
                  <circle cx="786" cy="294" r="2.6" fill="#4c102b" />
                  <text
                    x="790"
                    y="290"
                    fontSize="8"
                    fontWeight="700"
                    fill="#4c102b"
                  >
                    D.C.
                  </text>
                  <text
                    x="794"
                    y="269"
                    fontSize="7"
                    fontWeight="600"
                    fill="#4c102b"
                  >
                    Maryland
                  </text>
                  <text
                    x="749"
                    y="316"
                    fontSize="8"
                    fontWeight="600"
                    fill="#4c102b"
                  >
                    Virginia
                  </text>
                </svg>
              </span>
            </button>
            <div className="map-caption">
              <div>
                <strong>DMV · Washington, D.C. · Maryland · Virginia</strong>
                <span>Our starting point. Your next connection.</span>
              </div>
              <span>
                Room for our community to grow.
                <br />
                Conceptual community expansion
              </span>
            </div>
            <div className="map-invitation">
              <span>
                Explore offices
                <br />
                <strong>across the DMV</strong>
              </span>
              <a
                href="#office-explorer"
                onClick={() => {
                  window.dispatchEvent(new Event("load-office-explorer"));
                  setTimeout(
                    () =>
                      document
                        .querySelector<HTMLElement>("#office-explorer h2")
                        ?.focus(),
                    50,
                  );
                }}
              >
                Explore office map <span aria-hidden="true"> ↗</span>
              </a>
            </div>
          </div>
          <OceanBackground />
        </section>
        <div className="coastline" aria-hidden="true" />
        <section
          id="how-it-works"
          className="journey ocean-scene ocean-scene-deep"
        >
          <p className="eyebrow">Small steps. Meaningful connections.</p>
          <h2 id="how-heading" tabIndex={-1}>
            From intentions to a conversation
          </h2>
          <p className="journey-intro">
            Choose what matters to you now. Your intentions can overlap and
            change.
          </p>
          <ol className="steps">
            {[
              [
                "Express your intentions",
                "Share what you’re here for and who you’d like to connect with. Add skills you have or interests you’re exploring.",
              ],
              [
                "Discover people",
                "Explore relevant people and visible reasons to connect.",
              ],
              [
                "Make a mutual connection",
                "Send a request with an optional introduction. The other person chooses whether to accept.",
              ],
              [
                "Keep the conversation going",
                "After acceptance, exchange messages and return to your conversation history.",
              ],
            ].map(([title, text], i) => (
              <li key={title}>
                <span className="step-number" aria-hidden="true">
                  0{i + 1}
                </span>
                <h3>
                  {i + 1}. {title}
                </h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
          <OceanBackground />
        </section>
        <div className="public-section">
          <OfficeExplorer authenticated={signedIn} />
        </div>
        <section className="public-section community-section">
          <div>
            <p className="eyebrow">There’s a place for you here</p>
            <h2>
              Room to start,
              <br />
              grow and give back.
            </h2>
            <SwimmingFish />
          </div>
          <div>
            <p>
              Students, career changers, experienced professionals, hiring
              members and mentors can take part. You can seek opportunities,
              offer help and explore at the same time.
            </p>
            <p>
              Profiles are shared with signed-in community members after you
              publish. Your account email and optional phone stay private.
            </p>
            <p className="help">
              Your intentions lead the way. A fish companion is simply a little
              self-expression — never a measure of experience or worth.
            </p>
          </div>
        </section>
        <div className="public-section" style={{ paddingTop: 0 }}>
          <section className="closing">
            <h2>
              Start with what
              <br />
              you’re here for.
            </h2>
            {join}
          </section>
        </div>
      </main>
      <footer className="footer">
        <span>Diverse DMV · Connecting the DMV tech community</span>
        <nav aria-label="Policies">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </footer>
      {dialog && (
        <Modal
          title="Dive into the DMV community"
          onClose={() => setDialog(false)}
        >
          <p>Create your profile to meet people, or log in to continue.</p>
          <div className="actions">
            <Link className="button" href="/signup">
              Join community
            </Link>
            <Link className="button secondary" href="/login">
              Log in
            </Link>
            <button className="text-button" onClick={() => setDialog(false)}>
              Keep exploring
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
