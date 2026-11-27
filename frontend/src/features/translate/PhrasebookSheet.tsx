import { Check, Copy, Languages, WifiOff, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  PHRASEBOOK_LANGUAGES,
  TRAVEL_PHRASES,
  type PhraseLanguage,
} from "@/features/translate/phrasebook";

export function PhrasebookSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [fromLang, setFromLang] = useState<PhraseLanguage>(
    i18n.language === "hi" ? "hi" : "en",
  );
  const [toLang, setToLang] = useState<PhraseLanguage>(
    i18n.language === "hi" ? "en" : "hi",
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!open) return null;

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
    } catch {
      setCopiedId(null);
    }
  };

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="phrasebook-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="phrasebook-title"
      >
        <div className="panel-heading-row">
          <div>
            <span className="phrasebook-offline-badge">
              <WifiOff size={13} aria-hidden="true" />
              <span>{t("phrasebook.offlineBadge")}</span>
            </span>
            <h2 id="phrasebook-title" className="phrasebook-title">
              <Languages size={18} aria-hidden="true" />
              <span>{t("phrasebook.title")}</span>
            </h2>
          </div>
          <Button
            variant="quiet"
            size="icon"
            className="icon-button"
            onClick={onClose}
            aria-label={t("phrasebook.close")}
          >
            <X aria-hidden="true" />
          </Button>
        </div>

        <p className="phrasebook-subtitle">{t("phrasebook.subtitle")}</p>
        <p className="phrasebook-note">{t("phrasebook.onlineNote")}</p>

        <div className="phrasebook-selectors">
          <label className="field-label">
            <span>{t("phrasebook.fromLabel")}</span>
            <select
              className="text-field"
              value={fromLang}
              onChange={(event) =>
                setFromLang(event.currentTarget.value as PhraseLanguage)
              }
            >
              {PHRASEBOOK_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label} ({lang.nativeLabel})
                </option>
              ))}
            </select>
          </label>

          <label className="field-label">
            <span>{t("phrasebook.toLabel")}</span>
            <select
              className="text-field"
              value={toLang}
              onChange={(event) =>
                setToLang(event.currentTarget.value as PhraseLanguage)
              }
            >
              {PHRASEBOOK_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label} ({lang.nativeLabel})
                </option>
              ))}
            </select>
          </label>
        </div>

        <ul className="phrasebook-list">
          {TRAVEL_PHRASES.map((entry) => {
            const source = entry.translations[fromLang];
            const target = entry.translations[toLang];
            const isCopied = copiedId === entry.id;
            return (
              <li key={entry.id} className="phrasebook-item">
                <div className="phrasebook-copy">
                  <span className="phrasebook-source">{source.text}</span>
                  <strong className="phrasebook-target">{target.text}</strong>
                  {target.transliteration ? (
                    <span className="phrasebook-translit">
                      {target.transliteration}
                    </span>
                  ) : null}
                  {target.needs_review ? (
                    <span className="phrasebook-draft-tag">
                      {t("phrasebook.draftBadge")}
                    </span>
                  ) : null}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleCopy(entry.id, target.text)}
                  aria-label={`${t("phrasebook.copy")}: ${target.text}`}
                >
                  {isCopied ? (
                    <>
                      <Check size={14} aria-hidden="true" />
                      <span>{t("phrasebook.copied")}</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} aria-hidden="true" />
                      <span>{t("phrasebook.copy")}</span>
                    </>
                  )}
                </Button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
