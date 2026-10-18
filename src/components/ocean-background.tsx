"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Fish } from "./ui";

const MotionContext = createContext({ paused: false, toggle: () => {} });

export function OceanMotionProvider({ children }: { children: ReactNode }) {
  const [paused, setPaused] = useState(false);
  return (
    <MotionContext.Provider
      value={{ paused, toggle: () => setPaused((value) => !value) }}
    >
      {children}
    </MotionContext.Provider>
  );
}

export function SwimmingFish() {
  const { paused, toggle } = useContext(MotionContext);
  return (
    <div className="community-fish-animation" data-paused={paused}>
      <div className="community-fish-tank" aria-hidden="true">
        <div className="community-fish-track">
          <Fish variant="sunlight" className="ocean-fish" />
        </div>
      </div>
      <div className="ocean-motion-control">
        <button type="button" className="text-button" onClick={toggle}>
          <span aria-hidden="true">{paused ? "▷" : "Ⅱ"}</span>
          {paused
            ? "Resume background animation"
            : "Pause background animation"}
        </button>
      </div>
    </div>
  );
}

// Fixed paths and phases keep server/client markup identical and avoid frame-loop JS.
const swimmers = [
  { top: 30, size: 72, duration: 39, delay: -11, variant: "coral" },
  { top: 49, size: 100, duration: 47, delay: -32, variant: "teal" },
  { top: 69, size: 56, duration: 34, delay: -7, variant: "sunlight" },
  { top: 84, size: 85, duration: 52, delay: -38, variant: "indigo" },
  { top: 39, size: 45, duration: 43, delay: -24, variant: "teal" },
  { top: 76, size: 42, duration: 36, delay: -19, variant: "coral" },
];

export default function OceanBackground() {
  const { paused, toggle } = useContext(MotionContext);
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    if (ref.current) observer.observe(ref.current);
    const onVisibility = () => setHidden(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return (
    <>
      <div
        ref={ref}
        className="ocean-background"
        aria-hidden="true"
        data-paused={paused || !visible || hidden}
      >
        {swimmers.map((fish, index) => (
          <span
            key={index}
            className={`ocean-swimmer${index % 2 ? " ocean-swimmer-left" : ""}`}
            style={
              {
                "--swim-top": `${fish.top}%`,
                "--fish-size": `${fish.size}px`,
                "--swim-duration": `${fish.duration}s`,
                "--swim-delay": `${fish.delay}s`,
                "--rest-position": `${12 + index * 14}%`,
              } as CSSProperties
            }
          >
            <span className="ocean-fish-heading">
              <Fish variant={fish.variant} className="ocean-fish" />
            </span>
          </span>
        ))}
      </div>
      <div className="ocean-motion-control">
        <button type="button" className="text-button" onClick={toggle}>
          <span aria-hidden="true">{paused ? "▷" : "Ⅱ"}</span>
          {paused
            ? "Resume background animation"
            : "Pause background animation"}
        </button>
      </div>
    </>
  );
}
