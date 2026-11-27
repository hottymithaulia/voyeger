import { addProtocol, Map as MapLibreMapClass, NavigationControl, type Map as MapLibreMap } from "maplibre-gl";
import { PMTiles, Protocol } from "pmtiles";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Compass, Footprints, Landmark, LocateFixed, Sparkles, Utensils } from "lucide-react";

import { hasValidGeo } from "@/lib/geo";
import type { CityConfig, Language, Place } from "@/types";

type ProjectedMarker = {
  id: string;
  x: number;
  y: number;
  count: number;
  center: [number, number];
  places: Place[];
  muted: boolean;
};

const protocol = new Protocol();
let protocolReady = false;

function swatchColor(container: HTMLElement, className: string): string {
  const swatch = container.querySelector<HTMLElement>(className);
  return swatch ? getComputedStyle(swatch).backgroundColor : getComputedStyle(container).color;
}

export function markerIcon(place: Place) {
  if (place.is_anchor) return Compass;
  if (place.category === "food") return Utensils;
  if (place.category === "culture") return Landmark;
  if (place.category === "experience") return Footprints;
  return Sparkles;
}

export function matchesPlaceFilter(place: Place, filter: string): boolean {
  if (filter === "all" || !filter) return true;
  if (filter === "partners") return Boolean(place.partner_id);
  return place.category === filter;
}

export function isMarkerVisibleAtZoom(place: Place, zoom: number, activeFilter: string, focusPlaceId: string): boolean {
  if (!hasValidGeo(place.geo)) return false;
  if (place.is_anchor) return true;
  if (focusPlaceId && place.id === focusPlaceId) return true;
  if (activeFilter !== "all" && activeFilter !== "" && matchesPlaceFilter(place, activeFilter)) return true;
  return zoom >= 13;
}

type MarkerPinProps = {
  place: Place;
  x: number;
  y: number;
  muted: boolean;
  activeFilter: string;
  selected: boolean;
  title: string;
  ariaLabel: string;
  onSelect: (place: Place) => void;
};

const MarkerPin = memo(function MarkerPin({
  place,
  x,
  y,
  muted,
  activeFilter,
  selected,
  title,
  ariaLabel,
  onSelect,
}: MarkerPinProps) {
  const Icon = markerIcon(place);
  const shapeClass = place.is_anchor ? "map-marker--anchor" : `map-marker--${place.category}`;
  const partnerClass = place.partner_id ? " map-marker--partner" : "";
  const stateClass = muted
    ? " map-marker--muted"
    : activeFilter !== "all"
      ? " map-marker--emphasized"
      : "";
  const focusClass = selected ? " map-marker--selected" : "";
  return (
    <button
      type="button"
      className={`map-marker ${shapeClass}${partnerClass}${stateClass}${focusClass}`}
      style={{ left: x, top: y }}
      aria-label={ariaLabel}
      title={title}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(place);
      }}
    >
      <Icon aria-hidden="true" />
    </button>
  );
});

export function MapCanvas({
  places,
  city,
  activeFilter,
  focusPlaceId,
  nearCenter,
  onSelect,
}: {
  places: Place[];
  city: CityConfig;
  activeFilter: string;
  focusPlaceId: string;
  nearCenter?: [number, number] | undefined;
  onSelect: (place: Place | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const rafRef = useRef<number | null>(null);
  const placesRef = useRef(places);
  const filterRef = useRef(activeFilter);
  const focusRef = useRef(focusPlaceId);
  const selectRef = useRef(onSelect);

  const [markers, setMarkers] = useState<ProjectedMarker[]>([]);
  const [tilesReady, setTilesReady] = useState(false);
  const [zoom, setZoom] = useState(city.defaultZoom);

  placesRef.current = places;
  filterRef.current = activeFilter;
  focusRef.current = focusPlaceId;
  selectRef.current = onSelect;

  const updateMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const currentZoom = map.getZoom();
    setZoom(currentZoom);

    const visible = placesRef.current.filter(
      (place): place is Place & { geo: { lat: number; lng: number } } =>
        hasValidGeo(place.geo) &&
        isMarkerVisibleAtZoom(place, currentZoom, filterRef.current, focusRef.current),
    );
    const projected = visible.map((place) => {
      const point = map.project([place.geo.lng, place.geo.lat]);
      return { place, x: point.x, y: point.y };
    });

    const clustered: ProjectedMarker[] = [];
    const consumed = new Set<string>();
    for (const current of projected) {
      if (consumed.has(current.place.id)) continue;
      const group = projected.filter((candidate) => {
        const distance = Math.hypot(candidate.x - current.x, candidate.y - current.y);
        return !consumed.has(candidate.place.id) && distance < 40;
      });
      group.forEach(({ place }) => consumed.add(place.id));
      const count = group.length;
      const x = group.reduce((sum, item) => sum + item.x, 0) / count;
      const y = group.reduce((sum, item) => sum + item.y, 0) / count;
      const currentLat = current.place.geo.lat ?? 0;
      const currentLng = current.place.geo.lng ?? 0;
      const center: [number, number] =
        count === 1
          ? [currentLng, currentLat]
          : [
              group.reduce((sum, item) => sum + (item.place.geo.lng ?? 0), 0) / count,
              group.reduce((sum, item) => sum + (item.place.geo.lat ?? 0), 0) / count,
            ];
      const muted =
        filterRef.current !== "all" &&
        !group.some((item) => matchesPlaceFilter(item.place, filterRef.current));
      clustered.push({
        id: group.map((item) => item.place.id).join("-"),
        x,
        y,
        count,
        center,
        places: group.map((item) => item.place),
        muted,
      });
    }
    setMarkers(clustered);
  }, []);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let cancelled = false;
    if (!protocolReady) {
      addProtocol("pmtiles", protocol.tile);
      protocolReady = true;
    }

    const startCenter: [number, number] =
      nearCenter &&
      nearCenter[0] >= city.bounds.west &&
      nearCenter[0] <= city.bounds.east &&
      nearCenter[1] >= city.bounds.south &&
      nearCenter[1] <= city.bounds.north
        ? nearCenter
        : city.center;

    const map = new MapLibreMapClass({
      container: element,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "empty-map-background", type: "background", paint: { "background-opacity": 0 } }],
      },
      center: startCenter,
      zoom: city.defaultZoom,
      minZoom: city.minZoom,
      maxZoom: city.maxZoom,
      maxBounds: [
        [city.bounds.west, city.bounds.south],
        [city.bounds.east, city.bounds.north],
      ],
      attributionControl: {},
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    const attachOnlineRasterFallback = () => {
      if (cancelled || map.getSource("osm-raster")) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setTilesReady(false);
        return;
      }
      try {
        map.addSource("osm-raster", {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          minzoom: city.minZoom,
          maxzoom: 19,
          attribution: "© OpenStreetMap contributors",
        });
        map.addLayer({
          id: "osm-raster-layer",
          type: "raster",
          source: "osm-raster",
          paint: { "raster-opacity": 0.94 },
        });
      } catch {
        setTilesReady(false);
      }
    };

    const addLocalArchive = async () => {
      const tilePath = import.meta.env["VITE_TILES_URL"] || "/tiles/bhopal.pmtiles";
      const archiveUrl = new URL(tilePath, window.location.origin).toString();
      try {
        const archive = new PMTiles(archiveUrl);
        const header = await archive.getHeader();
        if (cancelled) return;
        if (header.tileType !== 1) {
          attachOnlineRasterFallback();
          return;
        }
        const metadata = (await archive.getMetadata()) as { vector_layers?: Array<{ id: string }> };
        if (cancelled) return;
        protocol.add(archive);
        map.addSource("city-tiles", {
          type: "vector",
          url: `pmtiles://${archiveUrl}`,
          attribution: "© OpenStreetMap contributors",
        });
        const sourceLayers = metadata.vector_layers ?? [];
        const water = sourceLayers.find((layer) => /water|lake|river/i.test(layer.id));
        const land = sourceLayers.find((layer) => /landuse|landcover|park/i.test(layer.id));
        const roads = sourceLayers.find((layer) => /road|transport|street|highway/i.test(layer.id));
        const landColor = swatchColor(element, ".map-swatch--land");
        const waterColor = swatchColor(element, ".map-swatch--water");
        const roadColor = swatchColor(element, ".map-swatch--road");
        if (land) map.addLayer({ id: "city-land", type: "fill", source: "city-tiles", "source-layer": land.id, paint: { "fill-color": landColor, "fill-opacity": 0.72 } });
        if (water) map.addLayer({ id: "city-water", type: "fill", source: "city-tiles", "source-layer": water.id, paint: { "fill-color": waterColor, "fill-opacity": 0.9 } });
        if (roads) map.addLayer({ id: "city-roads", type: "line", source: "city-tiles", "source-layer": roads.id, paint: { "line-color": roadColor, "line-width": 2, "line-opacity": 0.8 } });
        setTilesReady(true);
        updateMarkers();
      } catch {
        attachOnlineRasterFallback();
      }
    };

    map.on("sourcedata", (event) => {
      if (!cancelled && event.sourceId === "osm-raster" && event.isSourceLoaded) {
        setTilesReady(true);
      }
    });
    map.on("error", () => {
      if (!cancelled && !map.getSource("city-tiles")) {
        setTilesReady((current) => current);
      }
    });
    const scheduleMarkers = () => {
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        if (!cancelled) updateMarkers();
      });
    };

    map.on("load", () => {
      if (cancelled) return;
      updateMarkers();
      void addLocalArchive();
    });
    map.on("move", scheduleMarkers);
    map.on("zoom", scheduleMarkers);
    map.on("click", () => selectRef.current(null));
    const resize = () => map.resize();
    window.addEventListener("resize", resize);
    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      window.removeEventListener("resize", resize);
      map.remove();
      mapRef.current = null;
    };
  }, [city, nearCenter, updateMarkers]);

  useEffect(() => {
    updateMarkers();
  }, [places, activeFilter, focusPlaceId, updateMarkers]);

  useEffect(() => {
    if (!focusPlaceId || !mapRef.current) return;
    const target = places.find((place) => place.id === focusPlaceId);
    if (target && hasValidGeo(target.geo)) {
      mapRef.current.easeTo({
        center: [target.geo.lng, target.geo.lat],
        zoom: Math.max(mapRef.current.getZoom(), 14),
      });
    }
  }, [focusPlaceId, places]);

  return (
    <>
      <div className="map-canvas" ref={host} aria-label={t("map.explore")} />
      <div className="map-marker-layer" aria-label={t("map.layers")}>
        {markers.map((marker) =>
          marker.count > 1 ? (
            <button
              key={marker.id}
              type="button"
              className={`map-cluster${marker.muted ? " map-marker--muted" : ""}`}
              style={{ left: marker.x, top: marker.y }}
              aria-label={`${marker.count} places`}
              onClick={() =>
                mapRef.current?.easeTo({
                  center: marker.center,
                  zoom: Math.min((mapRef.current?.getZoom() ?? city.defaultZoom) + 2, city.maxZoom),
                })
              }
            >
              {marker.count}
            </button>
          ) : marker.places[0] ? (
            (() => {
              const place = marker.places[0];
              const language: Language = i18n.language === "hi" ? "hi" : "en";
              const copy = place.i18n[language] ?? place.i18n.en;
              return (
                <MarkerPin
                  key={marker.id}
                  place={place}
                  x={marker.x}
                  y={marker.y}
                  muted={marker.muted}
                  activeFilter={activeFilter}
                  selected={focusPlaceId === place.id}
                  title={copy.title}
                  ariaLabel={`${copy.title} (${place.is_anchor ? t("map.anchorBadge") : t(`filters.${place.category}`)})`}
                  onSelect={(picked) => selectRef.current(picked)}
                />
              );
            })()
          ) : null,
        )}
      </div>

      <button
        type="button"
        className="map-recenter-btn glass-panel"
        aria-label={t("map.recenter")}
        title={t("map.recenter")}
        onClick={() => {
          mapRef.current?.easeTo({
            center: nearCenter ?? city.center,
            zoom: city.defaultZoom,
          });
        }}
      >
        <LocateFixed size={16} aria-hidden="true" />
      </button>

      {zoom < 13 && activeFilter === "all" && places.some((p) => !p.is_anchor) ? (
        <p className="map-zoom-hint">{t("map.zoomHint")}</p>
      ) : null}
      {!tilesReady ? <p className="map-tiles-note">{t("map.mapFallback")}</p> : null}
      <div className="map-credit">© OpenStreetMap contributors</div>
      <div className="map-swatch map-swatch--land" aria-hidden="true" />
      <div className="map-swatch map-swatch--water" aria-hidden="true" />
      <div className="map-swatch map-swatch--road" aria-hidden="true" />
    </>
  );
}
