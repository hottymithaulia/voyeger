import { ArrowRight, Footprints } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { getPlaces } from "@/data/repo";
import { buildDayItinerary } from "@/features/planner/logic";
import { hasValidGeo } from "@/lib/geo";
import type { Language, Place } from "@/types";

export function PlannerPage() {
  const { t, i18n } = useTranslation();
  const [places, setPlaces] = useState<Place[]>([]);
  const [anchorId, setAnchorId] = useState("");
  const [ready, setReady] = useState(false);
  const language: Language = i18n.language === "hi" ? "hi" : "en";

  useEffect(() => {
    let active = true;
    void getPlaces().then((rows) => {
      if (!active) return;
      setPlaces(rows);
      setAnchorId(rows.find((place) => place.is_anchor && hasValidGeo(place.geo))?.id ?? "");
    }).catch(() => {
      if (active) setPlaces([]);
    }).finally(() => {
      if (active) setReady(true);
    });
    return () => { active = false; };
  }, []);

  const anchors = useMemo(() => places.filter((place) => place.is_anchor && hasValidGeo(place.geo)), [places]);
  const anchor = anchors.find((place) => place.id === anchorId);
  const itinerary = useMemo(() => anchor ? buildDayItinerary(anchor, places) : [], [anchor, places]);
  const totalMinutes = itinerary.reduce((sum, stop) => sum + stop.minutesFromPrevious, 0);

  return (
    <section className="screen">
      <header className="screen-heading"><div><span className="eyebrow">{t("app.city")}</span><h1 className="screen-title">{t("planner.title")}</h1><p className="screen-description">{t("planner.description")}</p></div></header>
      {!ready ? <div className="empty-state"><p>{t("common.loading")}</p></div> : anchors.length === 0 ? <div className="empty-state"><p>{places.length > 0 ? t("planner.noLocatedAnchors") : t("planner.empty")}</p></div> : (
        <>
          <label className="field-label anchor-select-label">{t("planner.chooseAnchor")}
            <select className="text-field anchor-select" value={anchorId} onChange={(event) => setAnchorId(event.currentTarget.value)}>
              {anchors.map((place) => <option key={place.id} value={place.id}>{place.i18n[language]?.title ?? place.i18n.en.title}</option>)}
            </select>
          </label>
          {anchor ? <div className="planner-summary"><Footprints aria-hidden="true" size={18} /><span>{t("planner.estimated", { minutes: totalMinutes })}</span></div> : null}
          <h2 className="section-subtitle">{t("planner.stops")}</h2>
          <ol className="planner-list">
            {itinerary.map((stop, index) => (
              <li key={stop.place.id} className="planner-stop">
                <span className="planner-number">{index + 1}</span>
                <div>
                  <span className="category-label">{t(`filters.${stop.place.category}`)}</span>
                  <h2 className="place-list-title">{stop.place.i18n[language]?.title ?? stop.place.i18n.en.title}</h2>
                  <p className="place-list-copy">{stop.place.i18n[language]?.summary ?? stop.place.i18n.en.summary}</p>
                  {stop.distanceFromPreviousKm > 0 ? <p className="planner-distance">{t("planner.distance", { distance: stop.distanceFromPreviousKm.toFixed(1) })} · {t("planner.estimated", { minutes: stop.minutesFromPrevious })}</p> : null}
                </div>
                <Link to="/discover" search={{ filter: "all", place: stop.place.id }} className="planner-map-link" aria-label={t("planner.map")}><ArrowRight size={17} aria-hidden="true" /></Link>
              </li>
            ))}
          </ol>
          <Link to="/discover" search={{ filter: "all", place: itinerary[0]?.place.id ?? "" }} className="voyager-button voyager-button--primary planner-open-map">{t("planner.map")}<ArrowRight size={16} aria-hidden="true" /></Link>
        </>
      )}
    </section>
  );
}