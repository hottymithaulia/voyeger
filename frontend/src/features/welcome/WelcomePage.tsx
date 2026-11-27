import { ArrowRight, MapPin } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import {
  isCircularRevealActive,
  resolveRevealOrigin,
  triggerCircularReveal,
} from "@/components/CircularReveal";
import { getDiscoveryStats, getMeta } from "@/data/repo";
import {
  resolveHomepageContext,
  type HomepageLocationContext,
  type ResolveHomepageDeps,
} from "@/features/welcome/location";
import {
  pickSessionTaglineIndex,
  TRAVEL_TAGLINES_EN,
  TRAVEL_TAGLINES_HI,
} from "@/features/welcome/taglines";
import type { DiscoveryStats, Language } from "@/types";

const INITIAL_STATS: DiscoveryStats = {
  lastExplorationAt: null,
  hiddenGemsCount: 0,
  totalDiscoveries: 0,
  totalXp: 0,
};

const INITIAL_CONTEXT: HomepageLocationContext = {
  scenario: "unknown",
  headingEn: "TRAVELLER",
  headingHi: "यात्री",
  userLocation: { source: "none" },
  matchedCity: null,
  availableInstalledCity: null,
  nearestAnchor: null,
  nearestDistanceKm: null,
};

function formatLastExploration(
  iso: string | null,
  t: (key: any, opts?: any) => any,
): string {
  if (!iso) return t("welcome.notYet");
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return t("welcome.notYet");
  const diffMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (diffMinutes < 1) return t("welcome.justNow");
  if (diffMinutes < 60) return t("welcome.minutesAgo", { count: diffMinutes });
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return t("welcome.hoursAgo", { count: diffHours });
  return t("welcome.daysAgo", { count: Math.floor(diffHours / 24) });
}

export function WelcomePage({
  locationDeps,
}: {
  locationDeps?: ResolveHomepageDeps | undefined;
} = {}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const ctaRef = useRef<HTMLAnchorElement>(null);
  const locationBtnRef = useRef<HTMLButtonElement>(null);
  const transitionTimerRef = useRef<number | null>(null);

  const [language, setLanguage] = useState<Language>(
    i18n.language === "hi" ? "hi" : "en",
  );
  const [stats, setStats] = useState<DiscoveryStats>(INITIAL_STATS);
  const [context, setContext] = useState<HomepageLocationContext>(INITIAL_CONTEXT);
  const [contextLoaded, setContextLoaded] = useState(false);
  const [taglineIndex] = useState(() =>
    pickSessionTaglineIndex(TRAVEL_TAGLINES_EN.length),
  );
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    setLanguage(i18n.language === "hi" ? "hi" : "en");
  }, [i18n.language]);

  useEffect(() => {
    let active = true;

    const loadAll = async () => {
      const [savedLang, nextStats, nextContext] = await Promise.all([
        getMeta<Language>("active_language").catch(() => undefined),
        getDiscoveryStats().catch(() => INITIAL_STATS),
        resolveHomepageContext(locationDeps).catch(() => INITIAL_CONTEXT),
      ]);
      if (!active) return;
      if (savedLang === "en" || savedLang === "hi") {
        setLanguage(savedLang);
      }
      setStats(nextStats);
      setContext(nextContext);
      setContextLoaded(true);
    };

    void loadAll();
    const onUpdated = () => void loadAll();
    window.addEventListener("voyeger:content-updated", onUpdated);
    return () => {
      active = false;
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
      }
      window.removeEventListener("voyeger:content-updated", onUpdated);
    };
  }, [locationDeps]);

  const startCircularNavigation = (
    event: MouseEvent<HTMLElement>,
    fallbackEl: HTMLElement | null,
    performNavigate: () => Promise<unknown>,
  ) => {
    if (isCircularRevealActive() || revealing) return;
    const { x, y } = resolveRevealOrigin(event, fallbackEl);
    setRevealing(true);
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
    }
    transitionTimerRef.current = window.setTimeout(() => {
      setRevealing(false);
      transitionTimerRef.current = null;
    }, 1000);
    triggerCircularReveal(x, y, performNavigate);
  };

  const handleExperience = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    startCircularNavigation(event, ctaRef.current, () =>
      navigate({ to: "/discover", search: {} }),
    );
  };

  const handleLocationExperience = (event: MouseEvent<HTMLButtonElement>) => {
    startCircularNavigation(event, locationBtnRef.current, () => {
      if (context.nearestAnchor) {
        const nearLat = context.nearestAnchor.geo.lat ?? undefined;
        const nearLng = context.nearestAnchor.geo.lng ?? undefined;
        return navigate({
          to: "/discover",
          search: {
            place: context.nearestAnchor.id,
            nearLat,
            nearLng,
          },
        });
      }
      return navigate({ to: "/discover", search: {} });
    });
  };

  const activeQuotes = language === "hi" ? TRAVEL_TAGLINES_HI : TRAVEL_TAGLINES_EN;
  const sessionTagline = activeQuotes[taglineIndex] ?? activeQuotes[0];

  const headingText = !contextLoaded
    ? t("welcome.travellerHeading")
    : context.scenario === "unknown"
      ? t("welcome.travellerHeading")
      : language === "hi"
        ? context.headingHi
        : context.headingEn;

  const anchorName = context.nearestAnchor
    ? context.nearestAnchor.i18n[language]?.title ??
      context.nearestAnchor.i18n.en.title
    : null;

  const locationLabel = anchorName
    ? t("welcome.nearMe", { place: anchorName })
    : context.userLocation.state
      ? t("welcome.nearMe", {
          place:
            language === "hi" && context.scenario !== "matched_city"
              ? context.headingHi
              : context.userLocation.state,
        })
      : t("welcome.chooseLocation");

  const availableMapCityName = context.availableInstalledCity
    ? context.availableInstalledCity.name[language]
    : null;

  const isUnavailableNotice =
    contextLoaded &&
    (context.scenario === "unavailable_map" || context.scenario === "state_only");

  return (
    <section
      className="welcome-screen"
      aria-labelledby="welcome-heading"
      data-location-scenario={context.scenario}
    >
      <div className="welcome-backdrop" aria-hidden="true">
        <svg
          className="welcome-contour"
          viewBox="0 0 1200 760"
          preserveAspectRatio="xMidYMid slice"
        >
          <path d="M-80 560 C 200 430, 410 660, 680 510 S 1060 360, 1290 480" />
          <path d="M-60 440 C 240 310, 440 530, 720 380 S 1080 230, 1280 330" />
          <path d="M-40 310 C 220 190, 480 400, 760 250 S 1080 120, 1260 210" />
          <path d="M120 790 C 310 620, 560 720, 820 590 S 1090 520, 1260 610" />
        </svg>
      </div>

      <div className="welcome-top-bar">
        <button
          ref={locationBtnRef}
          type="button"
          className="welcome-location-btn"
          onClick={handleLocationExperience}
          disabled={revealing}
          aria-label={locationLabel}
        >
          <MapPin className="welcome-location-pin" aria-hidden="true" size={14} />
          <span className="welcome-location-text">{locationLabel}</span>
          <ArrowRight className="welcome-location-arrow" aria-hidden="true" size={14} />
        </button>
      </div>

      <div className="welcome-hero">
        <span className="welcome-eyebrow">{t("welcome.eyebrow")}</span>
        <h1
          id="welcome-heading"
          className={`welcome-title${headingText.length > 10 ? " welcome-title--long" : ""}`}
        >
          {headingText}
        </h1>
        <div className="welcome-tagline-wrap">
          {isUnavailableNotice ? (
            <>
              <p className="welcome-tagline">{t("welcome.unavailableMap")}</p>
              {availableMapCityName ? (
                <p className="welcome-map-available">
                  {t("welcome.availableMap", { city: availableMapCityName })}
                </p>
              ) : null}
            </>
          ) : context.scenario === "unknown" ? (
            <>
              <p className="welcome-tagline">{t("welcome.chooseCityPrompt")}</p>
              {availableMapCityName ? (
                <p className="welcome-map-available">
                  {t("welcome.availableMap", { city: availableMapCityName })}
                </p>
              ) : null}
            </>
          ) : (
            <p className="welcome-tagline">{sessionTagline}</p>
          )}
        </div>
      </div>

      <div className="welcome-bottom-stack">
        <div
          className="welcome-stats"
          aria-label={t("welcome.lastExploration")}
        >
          <div className="welcome-stat">
            <span className="welcome-stat-label">
              {t("welcome.lastExploration")}
            </span>
            <strong className="welcome-stat-value">
              {formatLastExploration(stats.lastExplorationAt, t)}
            </strong>
          </div>
          <div className="welcome-stat">
            <span className="welcome-stat-label">
              {t("welcome.hiddenDiscovered")}
            </span>
            <strong className="welcome-stat-value">
              {stats.hiddenGemsCount}
            </strong>
          </div>
          <div className="welcome-stat">
            <span className="welcome-stat-label">{t("welcome.xpEarned")}</span>
            <strong className="welcome-stat-value">
              {stats.totalXp} {t("welcome.xpUnit")}
            </strong>
          </div>
        </div>

        <a
          ref={ctaRef}
          href="/discover"
          className="welcome-cta"
          onClick={handleExperience}
        >
          <span>{t("welcome.cta")}</span>
          <ArrowRight aria-hidden="true" size={18} />
        </a>
      </div>
    </section>
  );
}
