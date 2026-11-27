import { useEffect, useState } from "react";

export type RevealDetail = {
  x: number;
  y: number;
  navigate: () => void;
};

const REVEAL_EVENT = "voyeger:circular-reveal";

export function triggerCircularReveal(
  x: number,
  y: number,
  navigate: () => void,
): void {
  if (typeof window === "undefined") {
    navigate();
    return;
  }
  const prefersReduced =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const supportsClipPath =
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("clip-path", "circle(10px at 50% 50%)");

  if (prefersReduced || !supportsClipPath) {
    navigate();
    return;
  }

  window.dispatchEvent(
    new CustomEvent<RevealDetail>(REVEAL_EVENT, { detail: { x, y, navigate } }),
  );
}

type Phase = "idle" | "expanding" | "fading";

export function CircularReveal() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [origin, setOrigin] = useState({ x: 50, y: 50, unit: "%" as "%" | "px" });

  useEffect(() => {
    let navTimer: number | undefined;
    let fadeTimer: number | undefined;
    let resetTimer: number | undefined;

    const clearTimers = () => {
      if (navTimer !== undefined) window.clearTimeout(navTimer);
      if (fadeTimer !== undefined) window.clearTimeout(fadeTimer);
      if (resetTimer !== undefined) window.clearTimeout(resetTimer);
    };

    const onReveal = (event: Event) => {
      const detail = (event as CustomEvent<RevealDetail>).detail;
      if (!detail) return;
      clearTimers();
      setOrigin({ x: Math.round(detail.x), y: Math.round(detail.y), unit: "px" });
      setPhase("expanding");

      navTimer = window.setTimeout(() => {
        detail.navigate();
        setPhase("fading");
      }, 220);

      resetTimer = window.setTimeout(() => {
        setPhase("idle");
      }, 480);
    };

    window.addEventListener(REVEAL_EVENT, onReveal);
    return () => {
      clearTimers();
      window.removeEventListener(REVEAL_EVENT, onReveal);
    };
  }, []);

  if (phase === "idle") return null;

  const originStr = `${origin.x}${origin.unit} ${origin.y}${origin.unit}`;

  return (
    <div
      className={`circular-reveal-overlay circular-reveal-overlay--${phase}`}
      style={{ ["--reveal-origin" as string]: originStr }}
      aria-hidden="true"
    />
  );
}
