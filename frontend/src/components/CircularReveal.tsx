import { useEffect, useRef, useState, type CSSProperties } from "react";

interface RevealDetail {
  x: number;
  y: number;
  navigate: () => Promise<unknown> | void;
}

const REVEAL_EVENT = "voyeger:circular-reveal";
const EXPAND_DURATION_MS = 420;
const NAVIGATE_AT_MS = 395;
const FADE_DURATION_MS = 330;
const FAILSAFE_CLEAR_MS = 1600;

let revealInProgress = false;

export function isCircularRevealActive(): boolean {
  return revealInProgress;
}

/**
 * Extracts reliable viewport click coordinates from mouse/pointer clicks or
 * falls back to the center of the triggering element for keyboard activation.
 */
export function resolveRevealOrigin(
  event: { clientX?: number; clientY?: number; currentTarget?: EventTarget | null },
  fallbackElement?: HTMLElement | null,
): { x: number; y: number } {
  const targetEl =
    fallbackElement ??
    (event.currentTarget instanceof HTMLElement ? event.currentTarget : null);

  if (
    typeof event.clientX === "number" &&
    typeof event.clientY === "number" &&
    (event.clientX !== 0 || event.clientY !== 0)
  ) {
    return { x: event.clientX, y: event.clientY };
  }

  if (targetEl) {
    const rect = targetEl.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  return {
    x: typeof window !== "undefined" ? window.innerWidth / 2 : 0,
    y: typeof window !== "undefined" ? window.innerHeight / 2 : 0,
  };
}

export function triggerCircularReveal(
  x: number,
  y: number,
  navigate: () => Promise<unknown> | void,
): void {
  if (typeof window === "undefined") {
    void navigate();
    return;
  }

  if (revealInProgress) {
    return;
  }

  const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const supportsClip =
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("clip-path", "circle(10px at 50% 50%)");

  if (prefersReduced || !supportsClip) {
    revealInProgress = true;
    window.dispatchEvent(
      new CustomEvent<RevealDetail>(REVEAL_EVENT, { detail: { x, y, navigate } }),
    );
    return;
  }

  revealInProgress = true;
  window.dispatchEvent(
    new CustomEvent<RevealDetail>(REVEAL_EVENT, { detail: { x, y, navigate } }),
  );
}

export function CircularReveal() {
  const [reveal, setReveal] = useState<{
    x: number;
    y: number;
    radius: number;
    phase: "start" | "expanding" | "fading" | "reduced";
  } | null>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    const clearAllTimers = () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };

    const finishReveal = () => {
      clearAllTimers();
      revealInProgress = false;
      setReveal(null);
    };

    const handleReveal = (event: Event) => {
      const detail = (event as CustomEvent<RevealDetail>).detail;
      if (!detail) {
        revealInProgress = false;
        return;
      }

      clearAllTimers();
      const prefersReduced =
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      const supportsClip =
        typeof CSS !== "undefined" &&
        typeof CSS.supports === "function" &&
        CSS.supports("clip-path", "circle(10px at 50% 50%)");

      const safeFinishFailsafe = window.setTimeout(finishReveal, FAILSAFE_CLEAR_MS);
      timersRef.current.push(safeFinishFailsafe);

      if (prefersReduced || !supportsClip) {
        setReveal({ x: detail.x, y: detail.y, radius: 0, phase: "reduced" });
        void Promise.resolve(detail.navigate())
          .catch(() => undefined)
          .finally(() => {
            const t = window.setTimeout(finishReveal, 160);
            timersRef.current.push(t);
          });
        return;
      }

      const maxRadius = Math.ceil(
        Math.hypot(
          Math.max(detail.x, window.innerWidth - detail.x),
          Math.max(detail.y, window.innerHeight - detail.y),
        ),
      );

      setReveal({
        x: detail.x,
        y: detail.y,
        radius: Math.max(maxRadius, 32),
        phase: "start",
      });

      const rafId = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setReveal((current) =>
            current ? { ...current, phase: "expanding" } : null,
          );
        });
      });

      const navTimer = window.setTimeout(() => {
        let navigationCompleted = false;
        const startFade = () => {
          if (navigationCompleted) return;
          navigationCompleted = true;
          setReveal((current) =>
            current ? { ...current, phase: "fading" } : null,
          );
          const doneTimer = window.setTimeout(finishReveal, FADE_DURATION_MS);
          timersRef.current.push(doneTimer);
        };

        try {
          Promise.resolve(detail.navigate())
            .catch(() => undefined)
            .finally(() => {
              const remaining = Math.max(0, EXPAND_DURATION_MS - NAVIGATE_AT_MS);
              const settleTimer = window.setTimeout(startFade, remaining);
              timersRef.current.push(settleTimer);
            });
        } catch {
          finishReveal();
        }
      }, NAVIGATE_AT_MS);

      timersRef.current.push(navTimer);

      return () => {
        window.cancelAnimationFrame(rafId);
      };
    };

    window.addEventListener(REVEAL_EVENT, handleReveal);
    return () => {
      clearAllTimers();
      revealInProgress = false;
      window.removeEventListener(REVEAL_EVENT, handleReveal);
    };
  }, []);

  if (!reveal) return null;

  const origin = `${reveal.x}px ${reveal.y}px`;
  const style: CSSProperties =
    reveal.phase === "reduced"
      ? {
        opacity: 0.9,
        transition: "opacity 160ms cubic-bezier(0.4, 0, 0.2, 1)",
      }
      : {
        "--reveal-origin": origin,
        "--reveal-radius": `${reveal.radius}px`,
        clipPath:
          reveal.phase === "start"
            ? `circle(6px at ${origin})`
            : `circle(${reveal.radius}px at ${origin})`,
        opacity: reveal.phase === "fading" ? 0 : 1,
        transition:
          reveal.phase === "fading"
            ? `opacity ${FADE_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`
            : `clip-path ${EXPAND_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
      } as CSSProperties;

  return (
    <div
      className="circular-reveal-overlay"
      aria-hidden="true"
      data-reveal-phase={reveal.phase}
      style={style}
    />
  );
}
