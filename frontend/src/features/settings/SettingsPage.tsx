import {
  ArrowUpRight,
  BookOpen,
  Check,
  CloudDownload,
  Globe,
  HardDrive,
  RefreshCw,
  Trash2,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { getMeta, setMeta } from "@/data/repo";
import { installLanguage, syncNow } from "@/data/sync";
import { changeAppLanguage } from "@/i18n";
import { probeConnectivity } from "@/net/connectivity";
import type { Language, Manifest } from "@/types";

function formatBytes(value?: number): string {
  if (value === undefined) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export async function clearOfflineCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  const names = await caches.keys();
  // Preserve IndexedDB (including discoveries/XP, saved, and outbox); clear only Cache Storage media/JSON caches.
  await Promise.all(
    names
      .filter(
        (name) =>
          name.startsWith("img-v") ||
          name === "map-tiles-v1" ||
          name === "voyeger-pack-json" ||
          name === "voyeger-api",
      )
      .map((name) => caches.delete(name)),
  );
}

type BusyAction = "lang-en" | "lang-hi" | "sync" | "clear" | null;

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const [version, setVersion] = useState<number>();
  const [manifest, setManifest] = useState<Manifest>();
  const [installedLanguages, setInstalledLanguages] = useState<Language[]>([]);
  const [storageUsed, setStorageUsed] = useState<number>();
  const [storageQuota, setStorageQuota] = useState<number>();
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: "info" | "error" } | null>(null);
  const activeLanguage: Language = i18n.language === "hi" ? "hi" : "en";
  const busy = busyAction !== null;

  const refreshState = useCallback(async () => {
    const [packVersion, packManifest, languages] = await Promise.all([
      getMeta<number>("content_version"),
      getMeta<Manifest>("pack_manifest"),
      getMeta<Language[]>("languages_installed"),
    ]);
    setVersion(packVersion);
    setManifest(packManifest);
    setInstalledLanguages(languages ?? []);
    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      setStorageUsed(estimate.usage);
      setStorageQuota(
        typeof estimate.quota === "number" && Number.isFinite(estimate.quota) && estimate.quota > 0
          ? estimate.quota
          : undefined,
      );
    }
  }, []);

  useEffect(() => {
    let active = true;
    void refreshState().catch(() => {});
    const updated = () => {
      if (active) void refreshState();
    };
    window.addEventListener("voyeger:content-updated", updated);
    return () => {
      active = false;
      window.removeEventListener("voyeger:content-updated", updated);
    };
  }, [refreshState]);

  const changeLanguage = async (language: Language) => {
    setBusyAction(language === "en" ? "lang-en" : "lang-hi");
    setNotice(null);
    try {
      if (installedLanguages.includes(language)) {
        await setMeta("active_language", language);
        await changeAppLanguage(language);
        setNotice({ text: t("settings.languageChanged"), tone: "info" });
        return;
      }
      if ((await probeConnectivity()) === "OFFLINE") {
        setNotice({ text: t("settings.offlineLanguage"), tone: "error" });
        return;
      }
      await installLanguage(language);
      await changeAppLanguage(language);
      setNotice({ text: t("settings.languageInstalled"), tone: "info" });
      await refreshState();
    } catch {
      setNotice({ text: t("settings.offlineLanguage"), tone: "error" });
    } finally {
      setBusyAction(null);
    }
  };

  const synchronize = async () => {
    setBusyAction("sync");
    setNotice(null);
    try {
      const result = await syncNow();
      await refreshState();
      setVersion(result.version);
      setNotice({ text: t("settings.syncComplete"), tone: "info" });
      if (result.updated) window.dispatchEvent(new CustomEvent("voyeger:content-updated"));
    } catch {
      setNotice({ text: t("settings.syncFailed"), tone: "error" });
    } finally {
      setBusyAction(null);
    }
  };

  const clearCache = async () => {
    setBusyAction("clear");
    setNotice(null);
    try {
      await clearOfflineCaches();
      await refreshState();
      setConfirmClear(false);
      setNotice({ text: t("settings.cacheCleared"), tone: "info" });
    } catch {
      setNotice({ text: t("common.error"), tone: "error" });
    } finally {
      setBusyAction(null);
    }
  };

  const quotaPct =
    typeof storageUsed === "number" && typeof storageQuota === "number" && storageQuota > 0
      ? Math.min(100, Math.max(0.5, (storageUsed / storageQuota) * 100))
      : null;

  return (
    <div className="settings-background">
      <div className="settings-ambient-orb" aria-hidden="true" />
      <section className="screen settings-shell" aria-labelledby="settings-page-title">
        <header className="settings-hero">
          <span className="settings-eyebrow">{t("settings.eyebrow")}</span>
          <h1 id="settings-page-title" className="settings-title">
            <span>{t("settings.title")}</span>
            <span className="settings-title-dot" aria-hidden="true" />
          </h1>
          <p className="settings-subtitle">{t("settings.subtitle")}</p>
        </header>

        {notice ? (
          <p
            className={`notice settings-notice${notice.tone === "error" ? " notice--error" : ""}`}
            role="status"
          >
            {notice.text}
          </p>
        ) : null}

        <div className="settings-grid">
          <div className="settings-col-primary">
            <article className="settings-panel settings-glass settings-panel--language">
              <header className="settings-panel-head">
                <span className="settings-icon-badge" aria-hidden="true">
                  <Globe size={18} />
                </span>
                <div>
                  <span className="settings-panel-kicker">{t("settings.languageSection")}</span>
                  <p className="settings-panel-copy">{t("settings.languageDescription")}</p>
                </div>
              </header>

              <div className="settings-lang-list" role="group" aria-label={t("settings.language")}>
                {(["en", "hi"] as const).map((language) => {
                  const installed = installedLanguages.includes(language);
                  const active = activeLanguage === language;
                  const isInstallingThis =
                    busyAction === (language === "en" ? "lang-en" : "lang-hi");
                  const label =
                    language === "en" ? t("onboarding.english") : t("onboarding.hindi");
                  return (
                    <div
                      key={language}
                      className={`settings-lang-row${active ? " settings-lang-row--active" : ""}`}
                    >
                      <div className="settings-lang-info">
                        <strong lang={language} className="settings-lang-name">
                          {label}
                        </strong>
                        <span
                          className={`settings-status-pill${installed ? " settings-status-pill--ready" : " settings-status-pill--missing"}`}
                        >
                          {installed ? <Check size={12} aria-hidden="true" /> : null}
                          <span>
                            {installed
                              ? t("settings.languageReady")
                              : t("settings.languageMissing")}
                          </span>
                        </span>
                      </div>

                      <div className="settings-lang-action">
                        {active ? (
                          <span className="settings-active-pill">
                            <Check size={14} aria-hidden="true" />
                            <span>{t("settings.activeLabel")}</span>
                          </span>
                        ) : (
                          <Button
                            variant={installed ? "secondary" : "outline"}
                            size="sm"
                            onClick={() => void changeLanguage(language)}
                            disabled={busy}
                          >
                            {isInstallingThis
                              ? t("onboarding.progress")
                              : installed
                                ? t("settings.switchLanguage")
                                : t("action.installLanguage")}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="settings-panel settings-glass settings-panel--storage">
              <header className="settings-panel-head">
                <span className="settings-icon-badge" aria-hidden="true">
                  <HardDrive size={18} />
                </span>
                <div>
                  <span className="settings-panel-kicker">{t("settings.storageSection")}</span>
                  <p className="settings-panel-copy">{t("settings.storageDescription")}</p>
                </div>
              </header>

              <div className="settings-storage-readout">
                <div className="settings-metric-block">
                  <strong className="settings-metric-value">{formatBytes(storageUsed)}</strong>
                  <span className="settings-metric-label">
                    {t("settings.storage")} · {t("settings.storageNote")}
                  </span>
                </div>
                {quotaPct !== null && typeof storageQuota === "number" ? (
                  <div className="settings-quota-bar-wrap">
                    <div
                      className="settings-quota-track"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(quotaPct)}
                      aria-label={t("settings.storage")}
                    >
                      <div
                        className="settings-quota-fill"
                        style={{ width: `${quotaPct.toFixed(1)}%` }}
                      />
                    </div>
                    <span className="settings-quota-meta">
                      {formatBytes(storageUsed)} / {formatBytes(storageQuota)}
                    </span>
                  </div>
                ) : null}
              </div>

              {!confirmClear ? (
                <div className="settings-panel-actions">
                  <Button
                    variant="outline"
                    className="settings-clear-trigger"
                    onClick={() => setConfirmClear(true)}
                    disabled={busy}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                    <span>{t("action.clearCache")}</span>
                  </Button>
                </div>
              ) : (
                <div
                  className="settings-confirm-box"
                  role="region"
                  aria-label={t("settings.cacheConfirmTitle")}
                >
                  <strong className="settings-confirm-title">
                    {t("settings.cacheConfirmTitle")}
                  </strong>
                  <p className="settings-confirm-copy">{t("settings.cacheConfirmBody")}</p>
                  <div className="settings-confirm-actions">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => void clearCache()}
                      disabled={busy}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      <span>
                        {busyAction === "clear"
                          ? t("onboarding.progress")
                          : t("settings.cacheConfirmAction")}
                      </span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmClear(false)}
                      disabled={busy}
                    >
                      {t("action.cancel")}
                    </Button>
                  </div>
                </div>
              )}
            </article>
          </div>

          <div className="settings-col-secondary">
            <article className="settings-panel settings-panel--forest">
              <header className="settings-panel-head">
                <span className="settings-icon-badge settings-icon-badge--forest" aria-hidden="true">
                  <CloudDownload size={18} />
                </span>
                <div>
                  <span className="settings-panel-kicker">{t("settings.packSection")}</span>
                  <p className="settings-panel-copy">{t("settings.packDescription")}</p>
                </div>
              </header>

              <div className="settings-pack-metrics">
                <div className="settings-metric-block">
                  <span className="settings-metric-label">{t("settings.packVersionLabel")}</span>
                  <strong className="settings-version-value">v{version ?? "—"}</strong>
                </div>
                <div className="settings-pack-divider" aria-hidden="true" />
                <div className="settings-metric-block">
                  <span className="settings-metric-label">{t("settings.packSizeLabel")}</span>
                  <strong className="settings-size-value">
                    {manifest ? formatBytes(manifest.total_bytes) : t("settings.storageUnknown")}
                  </strong>
                </div>
              </div>

              <div className="settings-panel-actions">
                <Button
                  variant="secondary"
                  className="settings-refresh-btn"
                  onClick={() => void synchronize()}
                  disabled={busy}
                >
                  <RefreshCw
                    size={15}
                    aria-hidden="true"
                    className={busyAction === "sync" ? "settings-spin" : undefined}
                  />
                  <span>
                    {busyAction === "sync" ? t("status.syncing") : t("action.refresh")}
                  </span>
                </Button>
              </div>
            </article>

            <article className="settings-panel settings-glass settings-panel--about">
              <header className="settings-panel-head">
                <span className="settings-icon-badge" aria-hidden="true">
                  <BookOpen size={18} />
                </span>
                <div>
                  <span className="settings-panel-kicker">{t("settings.aboutSection")}</span>
                  <p className="settings-panel-copy">{t("settings.aboutDescription")}</p>
                </div>
              </header>

              <Link to="/attribution" className="settings-attribution-card">
                <span>{t("nav.attribution")}</span>
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>

              <div className="settings-sample-note">
                <WifiOff size={15} aria-hidden="true" />
                <span>{t("status.sampleNotice")}</span>
              </div>
            </article>
          </div>
        </div>
      </section>
    </div>
  );
}
