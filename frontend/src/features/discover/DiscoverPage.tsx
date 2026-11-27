import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ClientOnly, Link, useNavigate } from "@tanstack/react-router";
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
import { getActiveCity, getMeta, isPackReady, placesInBounds, searchPlaces } from "@/data/repo";
import { logEvent } from "@/data/outbox";
import { Onboarding } from "@/features/discover/Onboarding";
import { rankNearbySpots } from "@/features/nudge/logic";
import { PhrasebookSheet } from "@/features/translate/PhrasebookSheet";
import { fallbackPackAssetUrl, resolvePackAssetUrl } from "@/lib/assets";
import { hasValidGeo } from "@/lib/geo";
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
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [city, setCity] = useState<CityConfig>(() => getCityConfig());
  const [places, setPlaces] = useState<Place[]>([]);
  const [language, setLanguage] = useState<Language>("en");
  const [selected, setSelected] = useState<Place | null>(null);
  const [selectedThumbError, setSelectedThumbError] = useState(false);
  const [focusId, setFocusId] = useState(focusPlaceId);
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [phrasebookOpen, setPhrasebookOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Place[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [transfer, setTransfer] = useState<TransferProgress>();

  useEffect(() => {
    setFocusId(focusPlaceId);
  }, [focusPlaceId]);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void searchPlaces(trimmed, language)
        .then((rows) => {
          if (active) setSearchResults(rows.slice(0, 5));
        })
        .catch(() => {
          if (active) setSearchResults([]);
        });
    }, 120);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [searchQuery, language]);

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
    setSelectedThumbError(false);
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
              focusPlaceId={focusId}
              nearCenter={nearCenter}
              onSelect={onSelect}
            />
          </ClientOnly>
        </Suspense>
      </div>

      <div className="map-top-controls">
        <div className="map-search-wrap">
          <div className="map-search glass-panel">
            <Search aria-hidden="true" />
            <input
              type="search"
              className="map-search-input"
              value={searchQuery}
              placeholder={t("map.searchPlaceholder")}
              aria-label={t("map.searchPlaceholder")}
              onFocus={() => setSearchOpen(true)}
              onChange={(event) => {
                setSearchQuery(event.currentTarget.value);
                setSearchOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setSearchOpen(false);
                } else if (event.key === "Enter" && searchQuery.trim()) {
                  const first = searchResults[0];
                  if (first && hasValidGeo(first.geo)) {
                    setSelected(first);
                    setFocusId(first.id);
                    setNearbyOpen(false);
                    setSearchOpen(false);
                  } else {
                    void navigate({ to: "/search", search: { q: searchQuery.trim() } });
                  }
                }
              }}
            />
            {searchQuery ? (
              <button
                type="button"
                className="map-search-clear"
                aria-label={t("action.close")}
                onClick={() => {
                  setSearchQuery("");
                  setSearchResults([]);
                  setSearchOpen(false);
                }}
              >
                <X size={14} aria-hidden="true" />
              </button>
            ) : null}
          </div>

          {searchOpen && searchQuery.trim() ? (
            <div className="map-search-dropdown glass-panel" role="listbox" aria-label={t("nav.search")}>
              {searchResults.length > 0 ? (
                <>
                  {searchResults.map((place) => {
                    const copy = place.i18n[language] ?? place.i18n.en;
                    return (
                      <button
                        key={place.id}
                        type="button"
                        role="option"
                        className="map-search-option"
                        onClick={() => {
                          setSearchOpen(false);
                          if (hasValidGeo(place.geo)) {
                            setSelected(place);
                            setFocusId(place.id);
                            setNearbyOpen(false);
                          } else {
                            void navigate({ to: "/place/$slug", params: { slug: place.slug } });
                          }
                        }}
                      >
                        <span className={`map-search-dot map-search-dot--${place.category}`} aria-hidden="true" />
                        <span className="map-search-option-copy">
                          <strong>{copy.title}</strong>
                          <span>{t(`filters.${place.category}`)}</span>
                        </span>
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </button>
                    );
                  })}
                  <Link
                    to="/search"
                    search={{ q: searchQuery.trim() }}
                    className="map-search-all"
                    onClick={() => setSearchOpen(false)}
                  >
                    {t("map.viewAllResults")}
                  </Link>
                </>
              ) : (
                <Link
                  to="/search"
                  search={{ q: searchQuery.trim() }}
                  className="map-search-all"
                  onClick={() => setSearchOpen(false)}
                >
                  {t("map.viewAllResults")}
                </Link>
              )}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="map-phrasebook-trigger glass-panel"
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
              className={`map-cat-btn glass-panel map-cat-btn--${id}${active ? " map-cat-btn--active" : ""}`}
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
          <section className="map-bottom-sheet glass-panel" aria-label={t("map.selected")}>
            <div className="map-sheet-lead">
              {selected.media.images[0] && !selectedThumbError ? (
                <img
                  className="map-sheet-thumb"
                  src={resolvePackAssetUrl(selected.media.images[0].thumb || selected.media.images[0].file)}
                  alt={selected.media.images[0].alt[language] ?? selected.media.images[0].alt.en}
                  width={58}
                  height={58}
                  loading="lazy"
                  onError={(event) => {
                    const assetPath = selected.media.images[0]?.thumb || selected.media.images[0]?.file || "";
                    const fallback = fallbackPackAssetUrl(event.currentTarget.src, assetPath);
                    if (fallback) event.currentTarget.src = fallback;
                    else setSelectedThumbError(true);
                  }}
                />
              ) : (
                <span className="map-sheet-thumb map-sheet-thumb--fallback" aria-hidden="true">
                  <Compass size={20} />
                </span>
              )}
              <div className="map-sheet-copy-wrap">
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
