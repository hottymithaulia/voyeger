import { Compass, Download, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { getMeta } from "@/data/repo";
import { installPack, loadManifest, type TransferProgress } from "@/data/sync";
import { changeAppLanguage } from "@/i18n";
import type { Language, Manifest } from "@/types";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Onboarding({ onInstalled }: { onInstalled: (language: Language) => Promise<void> }) {
  const { t } = useTranslation();
  const [language, setLanguage] = useState<Language>("en");
  const [manifest, setManifest] = useState<Manifest>();
  const [progress, setProgress] = useState<TransferProgress>();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void getMeta<Language>("active_language").then((saved) => {
      if (active && saved) setLanguage(saved);
    });
    void loadManifest().then((value) => {
      if (active) setManifest(value);
    }).catch(async () => {
      const cached = await getMeta<Manifest>("remote_manifest").catch(() => undefined);
      if (active) {
        if (cached) setManifest(cached);
        else setMessage(t("onboarding.offlineFirst"));
      }
    });
    return () => { active = false; };
  }, [t]);

  const download = async () => {
    setWorking(true);
    setMessage("");
    try {
      await installPack(language, setProgress);
      await changeAppLanguage(language);
      await onInstalled(language);
    } catch {
      setMessage(t("onboarding.offlineFirst"));
    } finally {
      setWorking(false);
    }
  };

  const chooseLanguage = (next: Language) => {
    setLanguage(next);
    void changeAppLanguage(next);
  };

  return (
    <section className="onboarding" aria-labelledby="onboarding-title">
      <div>
        <span className="eyebrow">{t("onboarding.eyebrow")}</span>
        <h1 id="onboarding-title" className="onboarding-title">{t("onboarding.title")}</h1>
        <p className="onboarding-copy">{t("onboarding.description")}</p>
      </div>
      <div className="onboarding-side">
        <div className="onboarding-mark"><Compass aria-hidden="true" size={26} /></div>
        <h2>{t("onboarding.chooseLanguage")}</h2>
        <div className="language-options" role="group" aria-label={t("onboarding.chooseLanguage")}>
          <button type="button" className={`language-option${language === "en" ? " language-option--active" : ""}`} aria-pressed={language === "en"} onClick={() => chooseLanguage("en")}>{t("onboarding.english")}</button>
          <button type="button" className={`language-option${language === "hi" ? " language-option--active" : ""}`} aria-pressed={language === "hi"} onClick={() => chooseLanguage("hi")}>{t("onboarding.hindi")}</button>
        </div>
        <div className="pack-size">
          <span>{t("onboarding.packSize", { size: formatBytes(manifest?.total_bytes ?? 0) })}</span>
          <span>{t("common.sample")}</span>
        </div>
        <p className="onboarding-footnote">{t("onboarding.mapSize")}</p>
        {working ? (
          <div className="transfer-block" role="status">
            <span>{progress?.label === "images" ? t("status.downloadingImages") : progress?.label === "tiles" ? t("status.downloadingTiles") : t("onboarding.progress")}</span>
            <progress className="onboarding-progress" value={progress?.loaded ?? 0} max={progress?.total ?? 4} />
          </div>
        ) : null}
        {message ? <p className="notice notice--error"><WifiOff aria-hidden="true" size={18} />{message}</p> : null}
        <Button className="onboarding-cta" size="lg" onClick={() => void download()} disabled={!manifest || working}>
          <Download aria-hidden="true" size={18} />
          {working ? t("onboarding.progress") : t("action.download")}
        </Button>
      </div>
    </section>
  );
}