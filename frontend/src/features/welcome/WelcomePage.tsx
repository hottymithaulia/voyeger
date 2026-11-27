import { ArrowRight, Compass, MapPin } from "lucide-react";
import type { TFunction } from "i18next";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { triggerCircularReveal } from "@/components/CircularReveal";
import { getCityConfig } from "@/config/city";
import { getActiveCity, getDiscoveryStats, getPlaces } from "@/data/repo";
import { distanceKm } from "@/features/nudge/logic";
import { hasValidGeo } from "@/lib/geo";
import type { CityConfig, DiscoveryStats, Language, Place } from "@/types";

function formatRelativeExploration(iso: string | null, t: TFunction): string {
  if (!iso) return t("welcome.notYet");
  const diffMs = Math.max(0, Date.now() - Date.parse(iso));
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 2) return t("welcome.justNow");
  if (mins < 60) return t("welcome.minutesAgo", { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("welcome.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 14) return t("welcome.daysAgo", { count: days });
  return new Date(iso).toLocaleDateString();
}

export function WelcomePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const language: Language = i18n.language === "hi" ? "hi" : "en";

  const [city, setCity] = useState<CityConfig>(() => getCityConfig());
  const [stats, setStats] = useState<DiscoveryStats | null>(null);
  const [nearbyLandmark, setNearbyLandmark] = useState<Place | null>(null);
  const [loading, setLoading] = useState(true);
  const [nearStatus, setNearStatus] = useState("");
  const [locating, setLocating] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [activeCity, discoveryStats, installedPlaces] = await Promise.all([
          getActiveCity().catch(() => getCityConfig()),
          getDiscoveryStats().catch(() => ({
            totalXp: 0,
            hiddenGemsCount: 0,
            totalDiscoveries: 0,
            lastExplorationAt: null,
          })),
          getPlaces().catch(() => [] as Place[]),
        ]);
        if (!active) return;
        setCity(activeCity);
        setStats(discoveryStats);

        const cityCenter = { lat: activeCity.center[1], lng: activeCity.center[0] };
        const locatedAnchors = installedPlaces
          .filter((place) => place.is_anchor && hasValidGeo(place.geo))
          .sort((a, b) => distanceKm(cityCenter, a.geo) - distanceKm(cityCenter, b.geo));
        const preferred =
          locatedAnchors.find((place) => /upper-lake/i.test(place.id)) ?? locatedAnchors[0] ?? null;
        setNearbyLandmark(preferred);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const onUpdated = () => void load();
    window.addEventListener("voyeger:content-updated", onUpdated);
    return () => {
      active = false;
      window.removeEventListener("voyeger:content-updated", onUpdated);
    };
  }, []);

  const quotes = useMemo(() => {
    const localized = t("welcome.quotes", { returnObjects: true });
    const list = Array.isArray(localized)
      ? localized.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    const fallback = city.tagline[language] ?? city.tagline.en;
    return list.length > 0 ? list : [fallback];
  }, [t, city.tagline, language]);

  useEffect(() => {
    if (quotes.length <= 1) return;
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      setQuoteIndex((current) => (current + 1) % quotes.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [quotes.length]);

  const handleNearLocation = () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setNearStatus(t("welcome.nearUnsupported"));
      void navigate({ to: "/discover", search: { filter: "all" } });
      return;
    }
    setLocating(true);
    setNearStatus(t("welcome.nearChecking"));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setNearStatus("");
        // Never silently change active_city; pass coordinates only as a proximity hint to /discover.
        void navigate({
          to: "/discover",
          search: {
            filter: "all",
            nearLat: Number(pos.coords.latitude.toFixed(4)),
            nearLng: Number(pos.coords.longitude.toFixed(4)),
          },
        });
      },
      () => {
        setLocating(false);
        setNearStatus(t("welcome.nearDenied"));
        void navigate({ to: "/discover", search: { filter: "all" } });
      },
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 60_000 },
    );
  };

  const handleExperienceClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX || rect.left + rect.width / 2;
    const y = event.clientY || rect.top + rect.height / 2;
    triggerCircularReveal(x, y, () => {
      void navigate({ to: "/discover", search: { filter: "all" } });
    });
  };

  const cityName = city.name[language] ?? city.name.en;
  const activeQuote = quotes[quoteIndex % quotes.length] ?? city.tagline[language] ?? city.tagline.en;
  const nearbyTitle = nearbyLandmark
    ? (nearbyLandmark.i18n[language]?.title ?? nearbyLandmark.i18n.en.title)
    : "";

  return (
    <section className="welcome-screen" aria-labelledby="welcome-city-title">
      <div className="welcome-backdrop" aria-hidden="true">
        <svg className="welcome-contours" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
          <g fill="none" stroke="currentColor" strokeWidth="1.2">
            <path d="M-80 620 C 180 510, 340 690, 620 560 C 890 440, 1020 570, 1290 480" />
            <path d="M-60 540 C 210 430, 380 610, 650 470 C 900 350, 1040 480, 1280 390" />
            <path d="M-40 460 C 240 350, 420 520, 690 380 C 930 260, 1060 390, 1270 300" />
            <circle cx="960" cy="210" r="140" />
            <circle cx="960" cy="210" r="220" />
          </g>
        </svg>
      </div>

      <div className="welcome-top-bar">
        <div className="welcome-location-controls">
          <button
            type="button"
            className="welcome-near-btn glass-panel"
            onClick={handleNearLocation}
            disabled={locating}
          >
            <MapPin size={15} aria-hidden="true" />
            <span>{t("welcome.nearMe")}</span>
          </button>

          {nearbyLandmark ? (
            <Link
              to="/discover"
              search={{ filter: "all", place: nearbyLandmark.id }}
              className="welcome-anchor-pill glass-panel"
            >
              <Compass size={14} aria-hidden="true" />
              <span>{t("welcome.nearLandmark", { place: nearbyTitle })}</span>
            </Link>
          ) : null}
        </div>

        <span className="welcome-city-badge glass-panel">
          <Compass size={14} aria-hidden="true" />
          <span>
            {cityName}, {city.country}
          </span>
        </span>
      </div>

      {nearStatus ? (
        <p className="welcome-near-note glass-panel" role="status">
          {nearStatus}
        </p>
      ) : null}

      <div className="welcome-hero">
        <span className="welcome-eyebrow">{t("welcome.eyebrow")}</span>
        <h1 id="welcome-city-title" className="welcome-city-display">
          {cityName}
        </h1>
        <div className="welcome-tagline-wrap">
          <p key={quoteIndex} className="welcome-tagline">
            {activeQuote}
          </p>
        </div>
      </div>

      <div className="welcome-footer">
        <dl className="welcome-stats glass-panel" aria-label={t("welcome.xpEarned")}>
          <div className="welcome-stat">
            <dt>{t("welcome.lastExploration")}</dt>
            <dd>
              {loading
                ? "—"
                : formatRelativeExploration(stats?.lastExplorationAt ?? null, t)}
            </dd>
          </div>
          <div className="welcome-stat">
            <dt>{t("welcome.hiddenDiscovered")}</dt>
            <dd>{loading ? "—" : (stats?.hiddenGemsCount ?? 0)}</dd>
          </div>
          <div className="welcome-stat">
            <dt>{t("welcome.xpEarned")}</dt>
            <dd>
              {loading
                ? "—"
                : `${stats?.totalXp ?? 0} ${t("welcome.xpUnit")}`}
            </dd>
          </div>
        </dl>

        <Link
          to="/discover"
          search={{ filter: "all" }}
          className="welcome-cta"
          onClick={handleExperienceClick}
        >
          <span>{t("welcome.cta")}</span>
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
