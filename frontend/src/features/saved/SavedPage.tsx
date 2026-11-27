import { Bookmark } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { PlaceRow } from "@/components/PlaceRow";
import { getSavedPlaces } from "@/data/repo";
import type { Language, Place } from "@/types";

export function SavedPage() {
  const { t, i18n } = useTranslation();
  const [places, setPlaces] = useState<Place[]>([]);
  const [ready, setReady] = useState(false);
  const language: Language = i18n.language === "hi" ? "hi" : "en";

  useEffect(() => {
    let active = true;
    void getSavedPlaces().then((saved) => {
      if (active) setPlaces(saved);
    }).catch(() => {
      if (active) setPlaces([]);
    }).finally(() => {
      if (active) setReady(true);
    });
    const reload = () => void getSavedPlaces().then((saved) => { if (active) setPlaces(saved); });
    window.addEventListener("voyeger:content-updated", reload);
    return () => {
      active = false;
      window.removeEventListener("voyeger:content-updated", reload);
    };
  }, []);

  return (
    <section className="screen">
      <header className="screen-heading"><div><h1 className="screen-title">{t("saved.title")}</h1></div></header>
      {!ready ? <div className="empty-state"><p>{t("common.loading")}</p></div> : places.length === 0 ? <div className="empty-state"><Bookmark aria-hidden="true" size={23} /><p>{t("saved.empty")}</p></div> : <div className="content-list">{places.map((place) => <PlaceRow key={place.id} place={place} language={language} />)}</div>}
    </section>
  );
}