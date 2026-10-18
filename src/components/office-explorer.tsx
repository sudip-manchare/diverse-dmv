"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { characterCount } from "@/shared/contracts";
import {
  OFFICE_PRESETS,
  type OfficePreset,
  type OfficeArea,
  type Office,
  type OfficeSearchInput,
  type OfficeSearchResponse,
} from "@/lib/office-contract";

let sdkPromise: Promise<void> | null = null;
function loadMaps(key: string): Promise<void> {
  if (window.google?.maps?.Map) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&libraries=marker&callback=diverseDmvMapsReady`;
    script.async = true;
    const timer = window.setTimeout(() => {
      script.remove();
      sdkPromise = null;
      reject(new Error("Unavailable"));
    }, 15000);
    const win = window as unknown as Record<string, unknown>;
    win.diverseDmvMapsReady = () => {
      clearTimeout(timer);
      delete win.diverseDmvMapsReady;
      resolve();
    };
    win.gm_authFailure = () => {
      clearTimeout(timer);
      sdkPromise = null;
      reject(new Error("Unavailable"));
    };
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      sdkPromise = null;
      reject(new Error("Unavailable"));
    };
    document.head.append(script);
  });
  return sdkPromise;
}
export default function OfficeExplorer({
  authenticated = false,
}: {
  authenticated?: boolean;
}) {
  const [preset, setPreset] = useState<OfficePreset>("metro");
  const [useMapArea, setUseMapArea] = useState(false);
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<OfficeSearchResponse | null>(null);
  const [selected, setSelected] = useState<Office | null>(null);
  const [moved, setMoved] = useState(false);
  const mapNode = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const detail = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const circle = useRef<google.maps.Circle | null>(null);
  const markers = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const query = useRef<OfficeSearchInput>({ preset: "metro" });
  const lastAttempt = useRef<{ input: OfficeSearchInput; more: boolean }>({
    input: { preset: "metro" },
    more: false,
  });
  const pending = useRef(false);
  const autoStarted = useRef(false);
  const alive = useRef(true);
  const source = useRef<HTMLElement | null>(null);
  const request = useRef<AbortController | null>(null);
  const select = useCallback((office: Office, origin?: HTMLElement) => {
    source.current = origin ?? rows.current.get(office.id) ?? null;
    setSelected(office);
  }, []);
  useEffect(() => {
    if (selected) detail.current?.focus();
  }, [selected]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      request.current?.abort();
      markers.current.forEach((m) => {
        m.map = null;
      });
    };
  }, []);
  const search = useCallback(async (input: OfficeSearchInput, more = false) => {
    if (characterCount(input.company?.trim() ?? "") > 80) {
      setError("Use 80 characters or fewer for the company name.");
      return;
    }
    if (pending.current) return;
    pending.current = true;
    lastAttempt.current = { input, more };
    setBusy(true);
    setError("");
    setSelected(null);
    if (!more) {
      setResult(null);
      query.current = input;
    }
    request.current?.abort();
    request.current = new AbortController();
    try {
      const response = await fetch("/api/offices/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Protection": "1",
        },
        body: JSON.stringify(input),
        signal: request.current.signal,
      });
      if (!response.ok) {
        if (response.status === 503 || response.status === 429)
          setUnavailable(true);
        throw new Error("Search failed");
      }
      const data = (await response.json()) as OfficeSearchResponse;
      if (!alive.current) return;
      setUnavailable(false);
      setMoved(false);
      setResult((previous) =>
        more && previous
          ? {
              ...data,
              offices: [
                ...previous.offices,
                ...data.offices.filter(
                  (o) => !previous.offices.some((p) => p.id === o.id),
                ),
              ],
            }
          : data,
      );
      if (map.current) {
        circle.current?.setMap(null);
        circle.current = new google.maps.Circle({
          map: map.current,
          center: { lat: data.area.lat, lng: data.area.lng },
          radius: data.area.radius,
          fillColor: "#a52660",
          fillOpacity: 0.035,
          strokeColor: "#a52660",
          strokeWeight: 1,
          clickable: false,
        });
      }
    } catch (e) {
      if (
        alive.current &&
        !(e instanceof DOMException && e.name === "AbortError")
      )
        setError(
          more
            ? "More offices couldn’t load. Try again."
            : "We couldn’t load office listings. Try again.",
        );
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }, []);
  const activate = useCallback(async () => {
    if (map.current) {
      heading.current?.focus();
      return;
    }
    if (pending.current) return;
    setBusy(true);
    setUnavailable(false);
    setError("");
    pending.current = true;
    try {
      const config = await fetch("/api/offices/config").then((r) => r.json());
      if (!config.enabled) throw new Error("Unavailable");
      await loadMaps(config.browserKey);
      if (!alive.current || !mapNode.current) return;
      const area = OFFICE_PRESETS[preset];
      map.current = new google.maps.Map(mapNode.current, {
        center: { lat: area.lat, lng: area.lng },
        zoom: area.zoom,
        mapId: config.mapId,
        gestureHandling: "cooperative",
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        clickableIcons: false,
      });
      map.current.addListener("dragend", () => setMoved(true));
      map.current.addListener("zoom_changed", () => setMoved(true));
      pending.current = false;
      setBusy(false);
      setUnavailable(false);
      await search({ preset, company: company.trim() || undefined });
    } catch {
      setUnavailable(true);
      setBusy(false);
      pending.current = false;
    }
  }, [preset, company, search]);
  useEffect(() => {
    // Load once on entry, without moving focus or searching on every field edit.
    if (autoStarted.current) return;
    autoStarted.current = true;
    void activate();
  }, [activate]);
  useEffect(() => {
    const load = () => {
      heading.current?.focus();
      void activate();
    };
    window.addEventListener("load-office-explorer", load);
    // Anchor entry focuses the section; initialization is shared with automatic loading.
    const click = (event: MouseEvent) => {
      const el =
        event.target instanceof Element ? event.target.closest("a") : null;
      if (
        el?.getAttribute("href") === "/#office-explorer" ||
        el?.getAttribute("href") === "#office-explorer"
      )
        load();
    };
    document.addEventListener("click", click);
    return () => {
      window.removeEventListener("load-office-explorer", load);
      document.removeEventListener("click", click);
    };
  }, [activate]);
  useEffect(() => {
    markers.current.forEach((marker) => {
      marker.map = null;
    });
    markers.current = [];
    if (!map.current || !result) return;
    result.offices.forEach((office, index) => {
      const pin = new google.maps.marker.PinElement({
        glyphText: String(index + 1),
        background: "#a52660",
        borderColor: "#4c102b",
        glyphColor: "#fff",
      });
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map: map.current,
        position: { lat: office.lat, lng: office.lng },
        title: `${index + 1}. ${office.name}`,
        content: pin,
        gmpClickable: true,
      });
      marker.addEventListener("gmp-click", () => select(office));
      markers.current.push(marker);
    });
  }, [result, select]);
  useEffect(() => {
    markers.current.forEach((marker, index) => {
      const active = result?.offices[index]?.id === selected?.id;
      marker.zIndex = active ? 100 : undefined;
    });
  }, [selected, result]);
  const searchArea = () => {
    const bounds = map.current?.getBounds(),
      center = map.current?.getCenter();
    if (!bounds || !center) return;
    const ne = bounds.getNorthEast(),
      sw = bounds.getSouthWest();
    const radius = Math.min(
      (Math.abs(ne.lat() - sw.lat()) * 111320) / 2,
      (Math.abs(ne.lng() - sw.lng()) *
        111320 *
        Math.cos((center.lat() * Math.PI) / 180)) /
        2,
    );
    if (
      radius > 50000 ||
      radius < 500 ||
      center.lat() < 37.7 ||
      center.lat() > 39.8 ||
      center.lng() < -78.3 ||
      center.lng() > -75
    ) {
      setError("Zoom in or choose an area to search offices.");
      return;
    }
    const area: OfficeArea = {
      lat: center.lat(),
      lng: center.lng(),
      radius: Math.floor(radius),
    };
    void search({ area, company: company.trim() || undefined });
  };
  const closeDetails = () => {
    setSelected(null);
    source.current?.focus();
  };
  return (
    <section
      id="office-explorer"
      className="office-explorer"
      aria-labelledby="office-title"
    >
      <div className="office-heading">
        <h2 id="office-title" tabIndex={-1} ref={heading}>
          Look at corporate offices in the DMV
        </h2>
        <p>
          Browse office listings from Google Maps. Choose an area and optionally
          add a company name to narrow your search.
        </p>
      </div>
      <form
        className="office-controls"
        onSubmit={(event) => {
          event.preventDefault();
          if (useMapArea && map.current) {
            searchArea();
            return;
          }
          if (map.current) {
            const area = OFFICE_PRESETS[preset];
            map.current.moveCamera({
              center: { lat: area.lat, lng: area.lng },
              zoom: area.zoom,
            });
            void search({ preset, company: company.trim() || undefined });
          } else void activate();
        }}
      >
        <label>
          Explore an area
          <select
            value={useMapArea ? "map" : preset}
            onChange={(event) => {
              if (event.target.value === "map") {
                setUseMapArea(true);
                setMoved(true);
                setError("");
                return;
              }
              const next = event.target.value as OfficePreset;
              const area = OFFICE_PRESETS[next];
              setUseMapArea(false);
              setPreset(next);
              map.current?.moveCamera({
                center: { lat: area.lat, lng: area.lng },
                zoom: area.zoom,
              });
              setMoved(true);
              setError("");
            }}
            disabled={busy}
          >
            {Object.entries(OFFICE_PRESETS).map(([key, area]) => (
              <option key={key} value={key}>
                {area.label}
              </option>
            ))}
            <option value="map">Current map area</option>
          </select>
        </label>
        <label>
          <span className="office-field-title">
            Company name <span>(optional)</span>
          </span>
          <input
            value={company}
            aria-invalid={characterCount(company.trim()) > 80}
            aria-describedby="office-company-limit"
            onChange={(event) => setCompany(event.target.value)}
            placeholder="Search by company name"
            disabled={busy}
          />
          <span id="office-company-limit">
            {characterCount(company.trim())}/80 characters
          </span>
        </label>
        <button
          type="submit"
          className="button button-secondary"
          disabled={busy}
        >
          Search
        </button>
      </form>
      <div className="office-actions">
        {moved && (
          <p>
            {useMapArea
              ? "Search will use the visible map area."
              : `Search will use ${OFFICE_PRESETS[preset].label}. Choose Current map area to search where you’ve moved the map.`}{" "}
            Current results are from the previous search.
          </p>
        )}
      </div>
      <div role="status" aria-live="polite" className="office-status">
        {busy
          ? `Finding offices in ${useMapArea ? "the current map area" : OFFICE_PRESETS[preset].label}…`
          : result
            ? `${result.offices.length} offices shown · ${result.areaLabel}`
            : ""}
      </div>
      {unavailable && (
        <div className="office-notice">
          <p>
            The office map is unavailable right now. You can still join the
            community.
          </p>
          <Link href={authenticated ? "/dashboard" : "/signup"}>
            {authenticated ? "Go to dashboard" : "Join community"}
          </Link>
          <button
            type="button"
            className="button button-secondary"
            disabled={busy}
            onClick={() =>
              map.current ? void search(query.current) : void activate()
            }
          >
            Retry office search
          </button>
        </div>
      )}
      {error && (
        <div className="office-notice" role="alert">
          <p>{error}</p>
          {!unavailable && (
            <button
              type="button"
              onClick={() =>
                void search(lastAttempt.current.input, lastAttempt.current.more)
              }
              disabled={busy}
            >
              {lastAttempt.current.more
                ? "Retry load more"
                : "Retry office search"}
            </button>
          )}
        </div>
      )}
      <div
        className={`office-layout${!unavailable ? " is-started" : ""}`}
        aria-busy={busy}
      >
        <div>
          <div
            ref={mapNode}
            className="google-office-map"
            aria-label="Google map of loaded office locations"
            role="region"
            hidden={unavailable && !map.current}
          />
          {result && (
            <p className="office-area-note">
              {result.areaLabel} · Search circle:{" "}
              {(result.area.radius / 1000).toFixed(1)} km. Only offices inside
              this circle are shown.
            </p>
          )}
        </div>
        <div className="office-results">
          {result && (
            <>
              {!result.offices.length && (
                <p>
                  <strong>No results found</strong>
                  {query.current.company
                    ? ` for “${query.current.company}” in ${result.areaLabel.replace(/\.$/, "")}.`
                    : ` in ${result.areaLabel.replace(/\.$/, "")}.`}{" "}
                  Try another area or company name.
                </p>
              )}
              <ol aria-label="Office results">
                {result.offices.map((office, index) => (
                  <li key={office.id}>
                    <button
                      type="button"
                      ref={(el) => {
                        if (el) rows.current.set(office.id, el);
                        else rows.current.delete(office.id);
                      }}
                      aria-pressed={selected?.id === office.id}
                      onClick={(event) => select(office, event.currentTarget)}
                    >
                      <span className="office-number" aria-hidden="true">
                        {index + 1}
                      </span>
                      <span>
                        <strong>{office.name}</strong>
                        <span>
                          {office.address || "Office details are unavailable."}
                        </span>
                        {office.businessStatus === "CLOSED_TEMPORARILY" && (
                          <em>Temporarily closed</em>
                        )}
                        {office.businessStatus === "UNKNOWN" && (
                          <em>Business status unavailable</em>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              {result.nextPageToken && (
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() =>
                    void search(
                      { ...query.current, pageToken: result.nextPageToken },
                      true,
                    )
                  }
                >
                  Load more offices
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {selected && (
        <div
          ref={detail}
          className="office-details"
          tabIndex={-1}
          role="region"
          aria-label={`Office details: ${selected.name}`}
          onKeyDown={(event) => {
            if (event.key === "Escape") closeDetails();
          }}
        >
          <button type="button" onClick={closeDetails}>
            Back to office results
          </button>
          <h3>{selected.name}</h3>
          <p>{selected.address || "Office details are unavailable."}</p>
          <p>
            {selected.types.includes("corporate_office")
              ? "Corporate office"
              : "Office listing"}
            {selected.businessStatus === "CLOSED_TEMPORARILY"
              ? " · Temporarily closed"
              : selected.businessStatus === "UNKNOWN"
                ? " · Business status unavailable"
                : ""}
          </p>
          <div className="office-detail-links">
            <a
              href={selected.mapsUri}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on Google Maps{" "}
              <span className="sr-only">(opens a new tab)</span>
            </a>
            <Link href={authenticated ? "/dashboard" : "/signup"}>
              {authenticated ? "Go to dashboard" : "Join community"}
            </Link>
          </div>
        </div>
      )}
      {result && (
        <div className="office-attribution">
          <span translate="no">Google Maps</span>
          {Array.from(
            new Map(
              result.offices
                .flatMap((o) => o.attributions)
                .map((a) => [a.provider + a.uri, a]),
            ).values(),
          ).map((a) =>
            a.uri ? (
              <a
                key={a.provider + a.uri}
                href={a.uri}
                target="_blank"
                rel="noopener noreferrer"
              >
                {a.provider}
              </a>
            ) : (
              <span key={a.provider}>{a.provider}</span>
            ),
          )}
        </div>
      )}
      <p className="office-disclaimer">
        Results are not a complete directory. An office listing does not mean
        the company is hiring.
      </p>
      <p className="office-policy-links">
        <Link href="/terms">Terms of use</Link> ·{" "}
        <Link href="/privacy">Privacy policy</Link>
      </p>
      <style jsx>{`
        .office-explorer {
          padding: 5rem max(1.25rem, calc((100vw - 1240px) / 2));
          background: #fcecf4;
          color: #4c102b;
          scroll-margin-top: 2rem;
          overflow-wrap: anywhere;
        }
        .office-heading {
          max-width: 52rem;
        }
        .office-heading h2 {
          font-size: clamp(1.9rem, 3vw, 3rem);
          line-height: 1.15;
          margin: 0.8rem 0 1rem;
        }
        .office-heading p {
          line-height: 1.7;
          color: #70465a;
        }
        .office-controls {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr)) auto;
          align-items: start;
          gap: 1rem;
          margin: 2rem 0 1rem;
        }
        .office-controls label {
          display: grid;
          gap: 0.5rem;
          min-width: 0;
          font-size: 0.88rem;
          font-weight: 650;
        }
        .office-controls label span {
          font-weight: 400;
        }
        .office-controls label .office-field-title {
          font-weight: 650;
        }
        .office-controls > button {
          height: 48px;
          margin-top: calc(1.32rem + 0.5rem);
        }
        .office-controls select,
        .office-controls input {
          width: 100%;
          min-width: 0;
          height: 48px;
          min-height: 48px;
          border: 1px solid #a16a83;
          background: #fff;
          border-radius: 8px;
          padding: 0.7rem;
          color: #4c102b;
          font: inherit;
        }
        .office-explorer button {
          cursor: pointer;
          min-height: 44px;
        }
        .office-explorer button:disabled {
          cursor: wait;
          opacity: 0.65;
        }
        .office-explorer :is(button, a, input, select):focus-visible {
          outline: 3px solid #9d174d;
          outline-offset: 4px;
        }
        .office-actions {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .office-actions p,
        .office-status,
        .office-area-note {
          font-size: 0.85rem;
        }
        .office-status {
          margin: 1rem 0;
        }
        .office-layout.is-started {
          display: grid;
          grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
          gap: 1.25rem;
        }
        .google-office-map {
          height: 420px;
          width: 100%;
          border-radius: 12px;
          background: #f5dbe7;
        }
        .office-results {
          min-width: 0;
        }
        .office-results ol {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          align-content: start;
          gap: 0.6rem;
          max-height: 420px;
          overflow: auto;
          padding: 0.3rem;
        }
        .office-results li {
          min-width: 0;
          margin: 0;
          padding: 0;
          border: 0;
        }
        .office-results li > button {
          width: 100%;
          min-width: 0;
          display: grid;
          grid-template-columns: 28px minmax(0, 1fr);
          align-items: start;
          justify-items: start;
          justify-content: start;
          gap: 0.85rem;
          text-align: left;
          background: #fff;
          border: 1px solid #e5bfd1;
          border-radius: 9px;
          padding: 1rem;
          color: #4c102b;
        }
        .office-results li > button[aria-pressed="true"] {
          border-color: #a52660;
          box-shadow: inset 0 0 0 1px #a52660;
          background: #fff0f6;
        }
        .office-results li > button > span:last-child {
          width: 100%;
          min-width: 0;
          display: grid;
          justify-items: start;
          gap: 0.4rem;
        }
        .office-results strong {
          font-size: 1rem;
        }
        .office-results span span,
        .office-results em {
          font-size: 0.82rem;
          line-height: 1.5;
          font-weight: 400;
        }
        .office-number {
          width: 28px;
          height: 28px;
          background: #a52660;
          color: white;
          border-radius: 50%;
          display: grid;
          place-items: center;
          font-size: 0.75rem;
          font-variant-numeric: tabular-nums;
        }
        .office-details,
        .office-notice {
          padding: 1.5rem;
          border-radius: 12px;
          background: #fff;
          border: 1px solid #e5bfd1;
          margin: 1rem 0;
        }
        .office-details h3 {
          margin: 1rem 0;
          font-size: 1.5rem;
        }
        .office-detail-links {
          display: flex;
          gap: 1.5rem;
          flex-wrap: wrap;
          margin-top: 1rem;
        }
        .office-details > button {
          border: 0;
          background: transparent;
          text-decoration: underline;
          color: #8f2455;
          padding: 0;
        }
        .office-attribution {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
          font-size: 0.82rem;
          margin-top: 1rem;
        }
        .office-attribution > span:first-child {
          font-size: 1rem;
          font-weight: 400;
          font-style: normal;
          letter-spacing: normal;
          white-space: nowrap;
          color: #1f1f1f;
        }
        .office-disclaimer {
          font-size: 0.86rem;
          line-height: 1.6;
          max-width: 48rem;
          margin-top: 1.5rem;
        }
        .office-policy-links {
          font-size: 0.8rem;
        }
        .office-notice button {
          margin-left: 1rem;
        }
        .office-explorer a {
          color: #8f2455;
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .office-explorer .button {
          border: 1px solid #a16a83;
          background: #fff;
          color: #4c102b;
          border-radius: 8px;
          padding: 0.75rem 1rem;
          font-weight: 650;
        }
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
        }
        @media (max-width: 850px) {
          .office-explorer {
            padding: 3rem 1.25rem;
          }
          .office-layout.is-started {
            grid-template-columns: 1fr;
          }
          .google-office-map {
            height: 300px;
          }
          .office-results ol {
            max-height: none;
          }
          .office-controls {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .office-controls > button {
            grid-column: 1 / -1;
            margin-top: 0;
            width: 100%;
          }
          .office-notice button {
            margin: 0.8rem 0 0;
          }
          .office-details {
            padding: 1rem;
          }
        }
        @media (max-width: 540px) {
          .office-controls {
            grid-template-columns: minmax(0, 1fr);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          * {
            scroll-behavior: auto !important;
          }
        }
      `}</style>
    </section>
  );
}
