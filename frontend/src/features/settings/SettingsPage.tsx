import { Check, CloudDownload, RefreshCw, Trash2, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
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

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const [version, setVersion] = useState<number>();
  const [manifest, setManifest] = useState<Manifest>();
  const [installedLanguages, setInstalledLanguages] = useState<Language[]>([]);
  const [storageUsed, setStorageUsed] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const activeLanguage: Language = i18n.language === "hi" ? "hi" : "en";

  const refreshState = async () => {
    const [packVersion, packManifest, languages] = await Promise.all([
      getMeta<number>("content_version"),
      getMeta<Manifest>("pack_manifest"),
      getMeta<Language[]>("languages_installed"),
    ]);
    setVersion(packVersion);
    setManifest(packManifest);
    setInstalledLanguages(languages ?? []);
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      setStorageUsed(estimate.usage);
    }
  };

  useEffect(() => {
    let active = true;
    void refreshState().catch(() => {});
    const updated = () => { if (active) void refreshState(); };
    window.addEventListener("voyeger:content-updated", updated);
    return () => {
      active = false;
      window.removeEventListener("voyeger:content-updated", updated);
    };
  }, []);

  const changeLanguage = async (language: Language) => {
    setBusy(true);
    setNotice("");
    try {
      if (installedLanguages.includes(language)) {
        await setMeta("active_language", language);
        await changeAppLanguage(language);
        setNotice(t("settings.languageChanged"));
        return;
      }
      if ((await probeConnectivity()) === "OFFLINE") {
        setNotice(t("settings.offlineLanguage"));
        return;
      }
      await installLanguage(language);
      await changeAppLanguage(language);
      setNotice(t("settings.languageInstalled"));
      await refreshState();
    } catch {
      setNotice(t("settings.offlineLanguage"));
    } finally {
      setBusy(false);
    }
  };

  const synchronize = async () => {
    setBusy(true);
    setNotice("");
    try {
      const result = await syncNow();
      setVersion(result.version);
      setNotice(t("settings.syncComplete"));
      if (result.updated) window.dispatchEvent(new CustomEvent("voyeger:content-updated"));
    } catch {
      setNotice(t("settings.syncFailed"));
    } finally {
      setBusy(false);
    }
  };

  const clearCache = async () => {
    await clearOfflineCaches();
    setNotice(t("settings.cacheCleared"));
  };

  return (
    <section className="screen">
      <header className="screen-heading"><div><h1 className="screen-title">{t("settings.title")}</h1></div></header>
      <section className="settings-section">
        <h2>{t("settings.language")}</h2>
        <div className="settings-language-list">
          {(["en", "hi"] as const).map((language) => {
            const installed = installedLanguages.includes(language);
            const active = activeLanguage === language;
            return (
              <div className="setting-row" key={language}>
                <div><strong>{language === "en" ? t("onboarding.english") : t("onboarding.hindi")}</strong><span>{installed ? t("settings.languageReady") : t("settings.languageMissing")}</span></div>
                {active ? <span className="setting-active"><Check size={15} aria-hidden="true" />{t("settings.languageReady")}</span> : <Button variant="outline" size="sm" onClick={() => void changeLanguage(language)} disabled={busy}>{installed ? t("action.install") : t("action.installLanguage")}</Button>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="settings-section">
        <h2>{t("settings.version")}</h2>
        <div className="setting-row"><div><strong>v{version ?? "—"}</strong><span>{manifest ? formatBytes(manifest.total_bytes) : t("settings.storageUnknown")}</span></div><Button variant="outline" onClick={() => void synchronize()} disabled={busy}><RefreshCw size={15} aria-hidden="true" />{t("action.refresh")}</Button></div>
      </section>

      <section className="settings-section">
        <h2>{t("settings.storage")}</h2>
        <div className="setting-row"><div><strong>{formatBytes(storageUsed)}</strong><span>{t("settings.storage")}</span></div><Button variant="outline" onClick={() => void clearCache()}><Trash2 size={15} aria-hidden="true" />{t("action.clearCache")}</Button></div>
      </section>

      {notice ? <p className="notice" role="status">{notice}</p> : null}
      <section className="settings-section"><Link to="/attribution" className="text-link">{t("nav.attribution")}</Link></section>
      <div className="settings-note"><CloudDownload aria-hidden="true" size={17} /><span>{t("status.sampleNotice")}</span><WifiOff aria-hidden="true" size={17} /></div>
    </section>
  );
}