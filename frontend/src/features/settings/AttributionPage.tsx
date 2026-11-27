import { ArrowUpRight, BookOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { getPlaces } from "@/data/repo";
import type { ProvenanceSource } from "@/types";

export function AttributionPage() {
  const { t } = useTranslation();
  const [sources, setSources] = useState<ProvenanceSource[]>([]);

  useEffect(() => {
    let active = true;
    void getPlaces()
      .then((places) => {
        if (!active) return;
        const unique = new Map<string, ProvenanceSource>();
        for (const place of places) {
          for (const source of place.provenance?.sources ?? []) {
            if (!source.url && !source.name) continue;
            const key = `${source.name}::${source.url}`;
            if (!unique.has(key)) unique.set(key, source);
          }
        }
        setSources(Array.from(unique.values()));
      })
      .catch(() => {
        if (active) setSources([]);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="screen">
      <div className="place-back-row"><Link to="/settings" className="text-link">{t("nav.settings")}</Link></div>
      <header className="screen-heading"><div><h1 className="screen-title">{t("attribution.title")}</h1><p className="screen-description">{t("attribution.description")}</p></div></header>
      <ul className="source-list attribution-list">
        <li><BookOpen aria-hidden="true" size={18} /><div><strong>{t("attribution.osm")}</strong><p>{t("attribution.note")}</p><a className="text-link" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">{t("place.source")}<ArrowUpRight size={14} aria-hidden="true" /></a></div></li>
        <li><BookOpen aria-hidden="true" size={18} /><div><strong>{t("attribution.wikivoyage")}</strong><p>{t("attribution.note")}</p><a className="text-link" href="https://en.wikivoyage.org/wiki/Wikivoyage:Copyleft" target="_blank" rel="noreferrer">{t("place.source")}<ArrowUpRight size={14} aria-hidden="true" /></a></div></li>
        <li><BookOpen aria-hidden="true" size={18} /><div><strong>{t("attribution.images")}</strong><p>{t("attribution.note")}</p></div></li>
      </ul>
      {sources.length > 0 ? (
        <section className="content-panel" aria-labelledby="content-sources-heading">
          <h2 id="content-sources-heading">{t("attribution.contentSources")}</h2>
          <p>{t("attribution.sourcesDescription")}</p>
          <ul className="source-list attribution-list">
            {sources.map((source) => (
              <li key={`${source.name}-${source.url}`}>
                <BookOpen aria-hidden="true" size={18} />
                <div>
                  <strong>{source.name}</strong>
                  {source.type ? <p>{source.type}</p> : null}
                  {source.url ? (
                    <a className="text-link" href={source.url} target="_blank" rel="noreferrer">
                      {t("place.source")}
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}