import {
  Bookmark,
  Compass,
  Info,
  Mail,
  Map,
  Moon,
  PlusCircle,
  RefreshCw,
  Route,
  Search,
  Settings,
  Store,
  Sun,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useRouterState } from "@tanstack/react-router";

import { getActiveCity, getMeta, isPackReady, setMeta } from "@/data/repo";
import { flushOutbox, listOutbox } from "@/data/outbox";
import { shouldSyncByTime, syncNow } from "@/data/sync";
import { CircularReveal } from "@/components/CircularReveal";
import { Button } from "@/components/ui/button";
import { apiMode } from "@/net/api";
import { readMockToggles, setMockToggle, bumpMockVersion } from "@/net/mockApi";
import { probeConnectivity } from "@/net/connectivity";
import { registerVoyegerWorker } from "@/pwa/register";
import { changeAppLanguage } from "@/i18n";
import { getCityConfig } from "@/config/city";
import type { AppConnectivity, CityConfig, Language, OutboxItem } from "@/types";

type NavigationItem = {
  to: "/discover" | "/search" | "/planner" | "/saved" | "/partners" | "/submit-place" | "/about" | "/settings";
  key: string;
  icon: typeof Compass;
};

const navigation: NavigationItem[] = [
  { to: "/discover", key: "nav.discover", icon: Compass },
  { to: "/search", key: "nav.search", icon: Search },
  { to: "/planner", key: "nav.planner", icon: Route },
  { to: "/saved", key: "nav.saved", icon: Bookmark },
  { to: "/partners", key: "nav.partners", icon: Store },
  { to: "/submit-place", key: "nav.addPlace", icon: PlusCircle },
  { to: "/about", key: "nav.about", icon: Info },
];

const mobileNavigation: NavigationItem[] = navigation.slice(0, 5);

function activeFor(pathname: string, to: NavigationItem["to"]): boolean {
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function AppFrame({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [connectivity, setConnectivity] = useState<AppConnectivity>("OFFLINE");
  const [version, setVersion] = useState<number | undefined>();
  const [hasPack, setHasPack] = useState(false);
  const [city, setCity] = useState<CityConfig>(() => getCityConfig());
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);
  const [showDev, setShowDev] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [toast, setToast] = useState("");
  const [reloadNeeded, setReloadNeeded] = useState(false);
  const language: Language = i18n.language === "hi" ? "hi" : "en";

  const refreshConnectivity = async () => {
    const ready = await isPackReady().catch(() => false);
    setHasPack(ready);
    setVersion(await getMeta<number>("content_version").catch(() => undefined));
    const state = await probeConnectivity();
    setConnectivity(state);
    if (state === "ONLINE_IDLE") {
      if (ready && (await shouldSyncByTime().catch(() => false))) {
        setConnectivity("SYNCING");
        try {
          const result = await syncNow();
          if (result.updated) window.dispatchEvent(new CustomEvent("voyeger:content-updated"));
        } catch {
          // The current pack stays readable when a background update is unavailable.
        }
        await flushOutbox().catch(() => {});
        setVersion(await getMeta<number>("content_version").catch(() => undefined));
        setConnectivity(await probeConnectivity());
      } else {
        await flushOutbox().catch(() => {});
      }
    }
  };

  useEffect(() => {
    setMounted(true);
    let active = true;
    const refresh = async () => {
      if (!active) return;
      await refreshConnectivity();
    };
    void refresh();
    void registerVoyegerWorker();
    void getMeta<"light" | "dark">("theme").then((saved) => {
      if (active && saved) setTheme(saved);
    });
    void getMeta<Language>("active_language").then((saved) => {
      if (active && saved) void changeAppLanguage(saved);
    });
    void getActiveCity().then((loadedCity) => {
      if (active) setCity(loadedCity);
    });
    const online = () => void refresh();
    const visibility = () => {
      if (document.visibilityState === "visible") void flushOutbox();
    };
    const mockNetwork = () => void refresh();
    const reload = () => setReloadNeeded(true);
    const contentUpdated = () => {
      void isPackReady().then(setHasPack).catch(() => setHasPack(false));
      void getMeta<number>("content_version").then(setVersion).catch(() => setVersion(undefined));
    };
    const dev = new URLSearchParams(window.location.search).get("dev") === "1";
    setDevMode(dev && apiMode === "mock");
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    window.addEventListener("voyeger:mock-network-updated", mockNetwork);
    window.addEventListener("voyeger:reload-required", reload);
    window.addEventListener("voyeger:content-updated", contentUpdated);
    document.addEventListener("visibilitychange", visibility);
    const timer = window.setInterval(() => {
      void refresh();
      void flushOutbox();
    }, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      window.removeEventListener("voyeger:mock-network-updated", mockNetwork);
      window.removeEventListener("voyeger:reload-required", reload);
      window.removeEventListener("voyeger:content-updated", contentUpdated);
      document.removeEventListener("visibilitychange", visibility);
    };
    // refreshConnectivity intentionally runs as an app-level connectivity effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const refreshNow = async () => {
    setConnectivity("SYNCING");
    try {
      const ready = await isPackReady();
      if (ready) {
        const result = await syncNow();
        if (result.updated) {
          window.dispatchEvent(new CustomEvent("voyeger:content-updated"));
          setToast(t("settings.syncComplete"));
        } else {
          setToast(t("settings.syncComplete"));
        }
        await flushOutbox();
      }
    } catch {
      setToast(t("settings.syncFailed"));
    } finally {
      await refreshConnectivity();
    }
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    void setMeta("theme", next);
  };

  const isWelcomeView = !mounted || pathname === "/";
  const isMapView = mounted && pathname === "/discover" && hasPack;
  const statusLabel =
    connectivity === "SYNCING"
      ? t("status.syncing")
      : connectivity === "OFFLINE"
        ? t("status.offlinePack", { version: version ?? "—" })
        : t("status.updated");
  const themeLabel = t("action.theme");
  const cityLabel = `${city.name[language] ?? city.name.en}, ${city.country}`;

  return (
    <div className={`app-frame${isWelcomeView ? " app-frame--welcome" : ""}`}>
      <header className="app-header">
        <Link to="/" className="brand-lockup" aria-label={t("app.name")}>
          <span className="brand-mark"><Compass aria-hidden="true" size={20} /></span>
          <span>
            <span className="brand-name">{t("app.name")}</span>
            <span className="brand-city">{cityLabel}</span>
          </span>
        </Link>
        <div className="header-actions">
          {apiMode === "mock" ? <span className="sample-stamp">{t("status.sample")}</span> : null}
          <Button
            variant="quiet"
            size="sm"
            className="header-status"
            onClick={() => void refreshNow()}
            aria-label={t("action.refresh")}
            title={t("action.refresh")}
          >
            <span className={`status-dot${connectivity === "OFFLINE" ? " status-dot--offline" : connectivity === "SYNCING" ? " status-dot--syncing" : ""}`} />
            <span className="header-status-text">{statusLabel}</span>
            <RefreshCw size={14} aria-hidden="true" />
          </Button>
          <Button variant="quiet" size="icon" className="icon-button" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
            {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </Button>
          <Link to="/settings" className="voyager-button voyager-button--quiet voyager-button--icon icon-button" aria-label={t("nav.settings")} title={t("nav.settings")}>
            <Settings aria-hidden="true" />
          </Link>
          {devMode ? <Button variant="quiet" size="icon" className="icon-button" onClick={() => setShowDev((value) => !value)} aria-label={t("dev.title")} title={t("dev.title")}><Map aria-hidden="true" /></Button> : null}
        </div>
      </header>

      {!isWelcomeView ? (
        <aside className="desktop-nav" aria-label={t("app.name")}>
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.to} to={item.to} className={`nav-link${activeFor(pathname, item.to) ? " nav-link--active" : ""}`} aria-current={activeFor(pathname, item.to) ? "page" : undefined}>
                <Icon aria-hidden="true" />
                <span>{t(item.key)}</span>
              </Link>
            );
          })}
        </aside>
      ) : null}

      <main className={`app-main${isMapView ? " app-main--map" : ""}${isWelcomeView ? " app-main--welcome" : ""}`}>
        {mounted ? children : null}
        {mounted && !isMapView ? (
          <footer className="app-footer" aria-label="Voyeger footer">
            <div className="app-footer-inner">
              <div className="app-footer-brand">
                <strong>Voyeger · Bhopal, India</strong>
                <span>Built by Dharmesh Krish Mithaulia &amp; Ujjval Rajauriya</span>
              </div>
              <nav className="app-footer-links" aria-label="Footer navigation">
                <Link to="/discover">{t("nav.discover")}</Link>
                <Link to="/submit-place">{t("nav.addPlace")}</Link>
                <Link to="/partners">{t("nav.partners")}</Link>
                <Link to="/about">{t("nav.about")}</Link>
                <a href="mailto:cnttoujjval@gmail.com" className="app-footer-mail">
                  <Mail size={13} aria-hidden="true" />
                  cnttoujjval@gmail.com
                </a>
              </nav>
            </div>
          </footer>
        ) : null}
      </main>

      {!isWelcomeView ? (
        <nav className="mobile-nav" aria-label={t("app.name")}>
          {mobileNavigation.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.to} to={item.to} className={`nav-link${activeFor(pathname, item.to) ? " nav-link--active" : ""}`} aria-current={activeFor(pathname, item.to) ? "page" : undefined}>
                <Icon aria-hidden="true" />
                <span>{t(item.key)}</span>
              </Link>
            );
          })}
        </nav>
      ) : null}

      {toast ? <div className="toast-note" role="status">{toast}</div> : null}
      {reloadNeeded ? (
        <div className="dialog-backdrop" role="presentation">
          <section className="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="reload-title">
            <h2 id="reload-title">{t("settings.reloadRequired")}</h2>
            <Button onClick={() => window.location.reload()}>{t("action.refresh")}</Button>
          </section>
        </div>
      ) : null}
      {devMode && showDev ? <DeveloperPanel onClose={() => setShowDev(false)} onRefresh={refreshNow} version={version} /> : null}
      <CircularReveal />
    </div>
  );
}

function DeveloperPanel({ onClose, onRefresh, version }: { onClose: () => void; onRefresh: () => Promise<void>; version: number | undefined }) {
  const { t } = useTranslation();
  const [toggles, setToggles] = useState(readMockToggles());
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);

  const updateToggle = (key: "offline" | "failSyncMidway", value: boolean) => {
    setMockToggle(key, value);
    setToggles(readMockToggles());
    window.dispatchEvent(new CustomEvent("voyeger:mock-network-updated"));
  };

  const refreshOutbox = () => void listOutbox().then(setOutbox).catch(() => setOutbox([]));
  useEffect(() => { refreshOutbox(); }, []);

  const releaseV2 = () => {
    bumpMockVersion();
    void onRefresh();
  };

  return (
    <section className="dev-panel" aria-labelledby="dev-panel-title">
      <div className="panel-heading-row">
        <h2 id="dev-panel-title">{t("dev.title")}</h2>
        <Button variant="quiet" size="icon" className="icon-button" onClick={onClose} aria-label={t("dev.close")}><X aria-hidden="true" /></Button>
      </div>
      <label className="dev-row"><span>{t("dev.offline")}</span><input className="toggle-control" type="checkbox" checked={toggles.offline} onChange={(event) => updateToggle("offline", event.currentTarget.checked)} /></label>
      <div className="dev-row"><span>{t("dev.bump")}</span><Button variant="outline" size="sm" onClick={releaseV2}>v2</Button></div>
      <label className="dev-row"><span>{t("dev.fail")}</span><input className="toggle-control" type="checkbox" checked={toggles.failSyncMidway} onChange={(event) => updateToggle("failSyncMidway", event.currentTarget.checked)} /></label>
      <div className="dev-row"><span>{t("dev.version")}</span><strong>{version ?? "—"}</strong></div>
      <div className="dev-row"><span>{t("dev.outbox")}</span><strong>{outbox.length}</strong></div>
      <Button variant="quiet" size="sm" onClick={refreshOutbox}>{t("action.refresh")}</Button>
    </section>
  );
}