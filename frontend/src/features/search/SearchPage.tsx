import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { PlaceRow } from "@/components/PlaceRow";
import { searchPlaces } from "@/data/repo";
import type { Language, Place } from "@/types";

export function SearchPage({ query, onQueryChange }: { query: string; onQueryChange: (query: string) => void }) {
  const { t, i18n } = useTranslation();
  const [places, setPlaces] = useState<Place[]>([]);
  const [ready, setReady] = useState(false);
  const language: Language = i18n.language === "hi" ? "hi" : "en";

  useEffect(() => {
    let active = true;
    setReady(false);
    if (!query.trim()) {
      setPlaces([]);
      setReady(true);
      return () => { active = false; };
    }
    void searchPlaces(query, language).then((results) => {
      if (active) setPlaces(results);
    }).catch(() => {
      if (active) setPlaces([]);
    }).finally(() => {
      if (active) setReady(true);
    });
    return () => { active = false; };
  }, [query, language]);

  return (
    <section className="screen">
      <header className="screen-heading">
        <div>
          <h1 className="screen-title">{t("search.title")}</h1>
          <p className="screen-description">{t("search.description")}</p>
        </div>
      </header>
      <label className="search-field-wrap">
        <Search aria-hidden="true" size={18} />
        <input className="text-field search-field" type="search" value={query} placeholder={t("search.placeholder")} onChange={(event) => onQueryChange(event.currentTarget.value)} autoComplete="off" />
      </label>
      {!query.trim() ? <div className="empty-state"><Search aria-hidden="true" size={23} /><p>{t("search.start")}</p></div> : !ready ? <div className="empty-state"><p>{t("common.loading")}</p></div> : places.length === 0 ? <div className="empty-state"><p>{t("search.empty")}</p></div> : <div className="content-list">{places.map((place) => <PlaceRow key={place.id} place={place} language={language} />)}</div>}
    </section>
  );
}