import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ClientOnly, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Compass,
  Footprints,
  Landmark,
  Languages,
  Search,
  Sparkles,
  Utensils,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { getCityConfig } from "@/config/city";
import { getActiveCity, getMeta, isPackReady, placesInBounds } from "@/data/repo";
import { logEvent } from "@/data/outbox";
import { Onboarding } from "@/features/discover/Onboarding";
import { rankNearbySpots } from "@/features/nudge/logic";
import { PhrasebookSheet } from "@/features/translate/PhrasebookSheet";
import type { CityConfig, Language, Place, PlaceCategory } from "@/types";
import type { TransferProgress } from "@/data/sync";

const MapCanvas = lazy(() =>
  import("@/features/discover/MapCanvas").then((module) => ({
    default: module.MapCanvas,
  })),
);

const categoryOptions: Array<{
  id: PlaceCategory;
  icon: typeof Sparkles;
}> = [
  { id: "hidden_gem", icon: Sparkles },
  { id: "food", icon: Utensils },
  { id: "culture", icon: Landmark },
  { id: "experience", icon: Footprints },
];

export type DiscoverFilter = "all" | PlaceCategory | "partners";

export function DiscoverPage({
  filter,
  onFilterChange,
  focusPlaceId,
  nearCenter,
}: {
  filter: string;
  onFilterChange: (filter: DiscoverFilter) => void;
  focusPlaceId: string;
  nearCenter?: [number, number] | undefined;
}) {
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [city, setCity] = useState<CityConfig>(() => getCityConfig());
  const [places, setPlaces] = useState<Place[]>([]);
  const [language, setLanguage] = useState<Language>("en");
  const [selected, setSelected] = useState<Place | null>(null);
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [phrasebookOpen, setPhrasebookOpen] = useState(false);
  const [transfer, setTransfer] = useState<TransferProgress>();

  const loadLocalGuide = useCallback(async () => {
    const isReady = await isPackReady().catch(() => false);
    setReady(isReady);
    if (!isReady) {
      setChecking(false);
      return;
    }
    const [activeCity, storedLanguage] = await Promise.all([
      getActiveCity().catch(() => getCityConfig()),
      getMeta<Language>("active_language").catch(() => undefined),
    ]);
    const installedPlaces = await placesInBounds(activeCity.bounds).catch(() => []);
    setCity(activeCity);
    setLanguage(storedLanguage ?? "en");
    setPlaces(installedPlaces);
    setChecking(false);
  }, []);

  useEffect(() => {
    void loadLocalGuide();
    const updated = () => void loadLocalGuide();
    const progress = (event: Event) => {
      const detail = (event as CustomEvent<TransferProgress>).detail;
      if (detail) setTransfer(detail);
    };
    window.addEventListener("voyeger:content-updated", updated);
    window.addEventListener("voyeger:transfer-progress", progress);
    return () => {
      window.removeEventListener("voyeger:content-updated", updated);
      window.removeEventListener("voyeger:transfer-progress", progress);
    };
  }, [loadLocalGuide]);

  useEffect(() => {
    if (!focusPlaceId) return;
    const target = places.find((place) => place.id === focusPlaceId);
    if (target) setSelected(target);
  }, [focusPlaceId, places]);

  const onInstalled = async (nextLanguage: Language) => {
    await loadLocalGuide();
    setLanguage(nextLanguage);
    window.dispatchEvent(new CustomEvent("voyeger:content-updated"));
  };

  const onSelect = useCallback((place: Place | null) => {
    setSelected(place);
    setNearbyOpen(false);
    if (place) void logEvent("view", place.id, place.partner_id);
  }, []);

  const nonAnchorPlaces = useMemo(
    () => places.filter((place) => !place.is_anchor),
    [places],
  );
  const nearby = useMemo(
    () =>
      selected?.is_anchor
        ? rankNearbySpots(selected, nonAnchorPlaces, 5, 3)
        : [],
    [selected, nonAnchorPlaces],
  );

  if (checking) {
    return (
      <div className="empty-state">
        <Compass aria-hidden="true" size={24} />
        <p>{t("common.loading")}</p>
      </div>
    );
  }

  if (!ready) return <Onboarding onInstalled={onInstalled} />;

  const selectedCopy = selected
    ? selected.i18n[language] ?? selected.i18n.en
    : undefined;

  const toggleCategory = (category: PlaceCategory) => {
    onFilterChange(filter === category ? "all" : category);
  };

  return (
    <section className="map-screen" aria-label={t("nav.discover")}>
      <div className="map-stage">
        <Suspense
          fallback={
            <div className="map-loading">
              <Compass aria-hidden="true" />
              {t("common.loading")}
            </div>
          }
        >
          <ClientOnly
            fallback={
              <div className="map-loading">
                <Compass aria-hidden="true" />
                {t("common.loading")}
              </div>
            }
          >
            <MapCanvas
              places={places}
              city={city}
              activeFilter={filter}
              focusPlaceId={focusPlaceId}
              nearCenter={nearCenter}
              onSelect={onSelect}
            />
          </ClientOnly>
        </Suspense>
      </div>

      <div className="map-top-controls">
        <Link to="/search" className="map-search">
          <Search aria-hidden="true" />
          <span>{t("map.searchPlaceholder")}</span>
        </Link>

        <button
          type="button"
          className="map-phrasebook-trigger"
          onClick={() => setPhrasebookOpen(true)}
          aria-label={t("phrasebook.button")}
        >
          <Languages size={17} aria-hidden="true" />
          <span>{t("phrasebook.button")}</span>
        </button>
      </div>

      <nav
        className="map-vertical-panel"
        aria-label={t("map.layers")}
      >
        {categoryOptions.map(({ id, icon: Icon }) => {
          const active = filter === id;
          return (
            <button
              key={id}
              type="button"
              className={`map-cat-btn map-cat-btn--${id}${active ? " map-cat-btn--active" : ""}`}
              aria-pressed={active}
              onClick={() => toggleCategory(id)}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{t(`filters.${id}`)}</span>
            </button>
          );
        })}
      </nav>

      {places.length === 0 ? (
        <div className="map-empty-banner" role="status">
          <p>{t("map.noResults")}</p>
        </div>
      ) : null}

      {transfer && transfer.loaded < transfer.total ? (
        <div className="map-progress" role="status">
          <span>
            {transfer.label === "tiles"
              ? t("status.downloadingTiles")
              : t("status.downloadingImages")}
          </span>
          <progress
            className="onboarding-progress"
            value={transfer.loaded}
            max={transfer.total || 1}
          />
        </div>
      ) : null}

      {selected && selectedCopy ? (
        <div className={`map-bottom${nearbyOpen ? " map-bottom--expanded" : ""}`}>
          <section className="map-bottom-sheet" aria-label={t("map.selected")}>
            <div>
              <span className="category-label">
                {selected.is_anchor
                  ? `${t("map.anchorBadge")} · ${t(`filters.${selected.category}`)}`
                  : t(`filters.${selected.category}`)}
              </span>
              <h2 className="map-sheet-title">{selectedCopy.title}</h2>
              <p className="map-sheet-copy">{selectedCopy.summary}</p>
              {selected.is_anchor && nearby.length > 0 ? (
                <p className="nudge-count">
                  {t("nudge.title")} · {t("nudge.count", { count: nearby.length })}
                </p>
              ) : null}
            </div>
            <div className="map-sheet-actions">
              <Link
                to="/place/$slug"
                params={{ slug: selected.slug }}
                className="voyager-button voyager-button--primary voyager-button--small"
                aria-label={t("action.open")}
              >
                {t("action.open")}
                <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
              <Button
                variant="quiet"
                size="icon"
                className="icon-button"
                onClick={() => setSelected(null)}
                aria-label={t("action.close")}
              >
                <X aria-hidden="true" />
              </Button>
            </div>

            {selected.is_anchor && nearby.length > 0 ? (
              <div className="nearby-wrap">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setNearbyOpen((open) => !open);
                    if (!nearbyOpen) void logEvent("nudge_click", selected.id);
                  }}
                >
                  {nearbyOpen ? t("nudge.dismiss") : t("nudge.explore")}
                </Button>
                {nearbyOpen ? (
                  <div className="nearby-list">
                    {nearby.map((place) => (
                      <Link
                        key={place.id}
                        to="/place/$slug"
                        params={{ slug: place.slug }}
                        className="nearby-item"
                      >
                        <span>{place.i18n[language]?.title ?? place.i18n.en.title}</span>
                        <ArrowUpRight size={15} aria-hidden="true" />
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      <PhrasebookSheet
        open={phrasebookOpen}
        onClose={() => setPhrasebookOpen(false)}
      />
    </section>
  );
}
