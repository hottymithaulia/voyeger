import { ArrowRight, Compass, MapPin } from "lucide-react";
import type { TFunction } from "i18next";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { getCityConfig } from "@/config/city";
import { getActiveCity, getDiscoveryStats } from "@/data/repo";
import type { CityConfig, DiscoveryStats, Language } from "@/types";

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
  const [loading, setLoading] = useState(true);
  const [nearStatus, setNearStatus] = useState("");
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [activeCity, discoveryStats] = await Promise.all([
          getActiveCity().catch(() => getCityConfig()),
          getDiscoveryStats().catch(() => ({
            totalXp: 0,
            hiddenGemsCount: 0,
            totalDiscoveries: 0,
            lastExplorationAt: null,
          })),
        ]);
        if (!active) return;
        setCity(activeCity);
        setStats(discoveryStats);
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

  const cityName = city.name[language] ?? city.name.en;
  const cityTagline = city.tagline[language] ?? city.tagline.en;

  return (
    <section className="welcome-screen" aria-labelledby="welcome-city-title">
      <div className="welcome-backdrop" aria-hidden="true" />

      <div className="welcome-top-bar">
        <button
          type="button"
          className="welcome-near-btn"
          onClick={handleNearLocation}
          disabled={locating}
        >
          <MapPin size={15} aria-hidden="true" />
          <span>{t("welcome.nearMe")}</span>
        </button>

        <span className="welcome-city-badge">
          <Compass size={14} aria-hidden="true" />
          <span>
            {cityName}, {city.country}
          </span>
        </span>
      </div>

      {nearStatus ? (
        <p className="welcome-near-note" role="status">
          {nearStatus}
        </p>
      ) : null}

      <div className="welcome-hero">
        <span className="welcome-eyebrow">{t("welcome.eyebrow")}</span>
        <h1 id="welcome-city-title" className="welcome-city-display">
          {cityName}
        </h1>
        <p className="welcome-tagline">{cityTagline}</p>
      </div>

      <div className="welcome-footer">
        <dl className="welcome-stats" aria-label={t("welcome.xpEarned")}>
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
        >
          <span>{t("welcome.cta")}</span>
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
