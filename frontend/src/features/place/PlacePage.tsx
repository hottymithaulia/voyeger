import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Bookmark, Compass, Landmark, MapPin, Play, Share2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { getMeta, getPartner, getPlaceBySlug, getPlaces, isSaved, recordDiscovery, toggleSaved } from "@/data/repo";
import { logEvent } from "@/data/outbox";
import { rankNearbySpots } from "@/features/nudge/logic";
import { changeAppLanguage } from "@/i18n";
import { resolvePackAssetUrl } from "@/lib/assets";
import { hasValidGeo } from "@/lib/geo";
import { probeConnectivity } from "@/net/connectivity";
import type { AppConnectivity, Language, Partner, Place } from "@/types";

export function PlacePage({ slug }: { slug: string }) {
  const { t, i18n } = useTranslation();
  const [place, setPlace] = useState<Place>();
  const [places, setPlaces] = useState<Place[]>([]);
  const [partner, setPartner] = useState<Partner>();
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [connectivity, setConnectivity] = useState<AppConnectivity>("OFFLINE");
  const [photoIndex, setPhotoIndex] = useState(0);
  const [slideshowPaused, setSlideshowPaused] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const language: Language = i18n.language === "hi" ? "hi" : "en";

  const imageCount = place?.media.images.length ?? 0;
  useEffect(() => {
    if (imageCount <= 1 || slideshowPaused) return;
    const timer = window.setInterval(() => {
      setPhotoIndex((prev) => (prev + 1) % imageCount);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [imageCount, slideshowPaused]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setPhotoIndex(0);
    setShareMessage("");
    const load = async () => {
      const found = await getPlaceBySlug(slug);
      if (!active) return;
      setPlace(found);
      if (!found) {
        setLoading(false);
        return;
      }
      void logEvent("view", found.id, found.partner_id);
      const [allPlaces, savedNow, placePartner, status] = await Promise.all([
        getPlaces(),
        isSaved(found.id),
        found.partner_id ? getPartner(found.partner_id) : Promise.resolve(undefined),
        probeConnectivity(),
        recordDiscovery(found).catch(() => undefined),
      ]);
      if (!active) return;
      setPlaces(allPlaces);
      setSaved(savedNow);
      setPartner(placePartner);
      setConnectivity(status);
      setLoading(false);
    };
    void getMeta<Language>("active_language").then((activeLanguage) => changeAppLanguage(activeLanguage ?? "en"));
    void load().catch(() => setLoading(false));
    return () => {
      active = false;
    };
  }, [slug]);

  const nearby = useMemo(() => {
    if (!place?.is_anchor) return [];
    const nonAnchors = places.filter((item) => !item.is_anchor);
    const linked = nonAnchors.filter((item) => item.anchor_for.includes(place.id));
    const ranked = rankNearbySpots(place, nonAnchors, 6, 3);
    const merged: Place[] = [];
    const seen = new Set<string>();
    for (const spot of [...linked, ...ranked]) {
      if (seen.has(spot.id)) continue;
      seen.add(spot.id);
      merged.push(spot);
      if (merged.length >= 6) break;
    }
    return merged;
  }, [place, places]);

  if (loading) {
    return (
      <div className="screen">
        <div className="empty-state">
          <p>{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (!place) {
    return (
      <div className="screen">
        <div className="empty-state">
          <p>{t("place.missing")}</p>
          <Link to="/discover" className="voyager-button voyager-button--outline">
            {t("common.backHome")}
          </Link>
        </div>
      </div>
    );
  }

  const copy = place.i18n[language] ?? place.i18n.en;
  const images = place.media.images;
  const activePhoto = images[photoIndex] ?? images[0];
  const destination = hasValidGeo(place.geo)
    ? `https://www.google.com/maps/dir/?api=1&destination=${place.geo.lat},${place.geo.lng}`
    : null;
  const partnerCopy = partner ? partner.i18n[language] ?? partner.i18n.en : undefined;
  const enrichmentRows = [
    ...(place.enrichment.osm ? [{ key: "osm", url: place.enrichment.osm.url, note: place.enrichment.osm.note }] : []),
    ...(place.enrichment.wikivoyage ? [{ key: "wikivoyage", url: place.enrichment.wikivoyage.url, note: place.enrichment.wikivoyage.note }] : []),
  ];
  const hoursValue = (place.hours ?? "").trim();
  const bestTimeValue = (place.best_time ?? "").trim();
  const costNoteValue = (place.cost_note ?? "").trim();
  const storyValue = (copy.story ?? "").trim();
  const tipsList = copy.tips ?? [];
  const sacredNoteValue = (place.sensitivity.note ?? "").trim();
  const isPlaceholderMedia = place.media.placeholder === true;
  const facts = [
    hoursValue ? { label: t("place.hours"), value: hoursValue } : null,
    bestTimeValue ? { label: t("place.bestTime"), value: bestTimeValue } : null,
    costNoteValue ? { label: t("place.cost"), value: costNoteValue } : null,
  ].filter((item): item is { label: string; value: string } => item !== null);

  const themeVars: CSSProperties | undefined =
    place.theme && !isPlaceholderMedia
      ? ({
          "--place-primary": place.theme.primary,
          "--place-secondary": place.theme.secondary,
          ...(place.theme.on_primary ? { "--place-on-primary": place.theme.on_primary } : {}),
        } as CSSProperties)
      : undefined;

  const savePlace = async () => {
    const next = await toggleSaved(place.id);
    setSaved(next);
    if (next) void logEvent("save", place.id, place.partner_id);
  };

  const sharePlace = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: copy.title, text: copy.summary, url });
      else await navigator.clipboard.writeText(url);
      setShareMessage(t("action.share"));
    } catch {
      setShareMessage("");
    }
  };

  return (
    <article className="place-detail-shell" style={themeVars}>
      <div className="place-backdrop" aria-hidden="true">
        {images.length > 0 ? (
          images.map((photo, index) => (
            <img
              key={photo.id}
              className={`place-backdrop-img${index === photoIndex ? " place-backdrop-img--active" : ""}`}
              src={resolvePackAssetUrl(photo.file)}
              alt=""
            />
          ))
        ) : (
          <div className="place-backdrop-fallback" />
        )}
        <div className="place-backdrop-scrim" />
      </div>

      <div className="screen place-detail">
        <div className="place-back-row">
          <Link to="/discover" className="text-link">
            {t("common.backHome")}
          </Link>
          <span className="sample-stamp">{t("place.sampleCredit")}</span>
        </div>

        <section className="place-editorial-card">
          <div className="place-copy-column">
            <div className="place-badge-row">
              <span className="place-classification-badge">
                {place.is_anchor ? (
                  <>
                    <Compass size={13} aria-hidden="true" />
                    <span>{t("map.anchorBadge")}</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={13} aria-hidden="true" />
                    <span>{t(`filters.${place.category}`)}</span>
                  </>
                )}
              </span>
              {place.is_anchor ? (
                <span className="category-label">{t(`filters.${place.category}`)}</span>
              ) : null}
            </div>

            <h1 className="place-title">{copy.title}</h1>
            <p className="place-summary">{copy.summary}</p>
            {place.is_anchor ? <p className="place-landmark-intro">{t("place.landmarkIntro")}</p> : null}

            {place.tags.length > 0 ? (
              <div className="tag-row">
                {place.tags.map((tag) => (
                  <span className="tag-pill" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="place-actions">
              <Button variant={saved ? "secondary" : "primary"} onClick={() => void savePlace()}>
                <Bookmark size={16} aria-hidden="true" />
                {saved ? t("action.saved") : t("action.save")}
              </Button>
              {destination ? (
                <a
                  className="voyager-button voyager-button--outline voyager-button--default"
                  href={destination}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => void logEvent("directions", place.id, place.partner_id)}
                >
                  <MapPin size={16} aria-hidden="true" />
                  {t("action.directions")}
                </a>
              ) : null}
              <Button variant="outline" onClick={() => void sharePlace()}>
                <Share2 size={16} aria-hidden="true" />
                {t("action.share")}
              </Button>
            </div>
            {shareMessage ? (
              <p className="inline-feedback" role="status">
                {shareMessage}
              </p>
            ) : null}
          </div>

          {activePhoto ? (
            <div
              className="place-portrait-stage"
              onMouseEnter={() => setSlideshowPaused(true)}
              onMouseLeave={() => setSlideshowPaused(false)}
              onFocus={() => setSlideshowPaused(true)}
              onBlur={() => setSlideshowPaused(false)}
            >
              <figure className="place-portrait-frame">
                <img
                  key={activePhoto.id}
                  className="place-portrait-img"
                  src={resolvePackAssetUrl(activePhoto.file)}
                  alt={activePhoto.alt[language] ?? activePhoto.alt.en}
                />
                {!isPlaceholderMedia && activePhoto.credit ? <figcaption>{activePhoto.credit}</figcaption> : null}
              </figure>
              {images.length > 1 ? (
                <>
                  <div className="place-slideshow-dots" role="tablist" aria-label={t("nav.discover")}>
                    {images.map((photo, index) => (
                      <button
                        key={photo.id}
                        type="button"
                        role="tab"
                        aria-selected={index === photoIndex}
                        aria-label={t("place.gallerySelect", { index: index + 1 })}
                        className={`place-slideshow-dot${index === photoIndex ? " place-slideshow-dot--active" : ""}`}
                        onClick={() => setPhotoIndex(index)}
                      />
                    ))}
                  </div>
                  <div className="place-thumb-strip" role="group" aria-label={t("nav.discover")}>
                    {images.map((photo, index) => (
                      <button
                        key={photo.id}
                        type="button"
                        className={`place-thumb-btn${index === photoIndex ? " place-thumb-btn--active" : ""}`}
                        aria-label={t("place.gallerySelect", { index: index + 1 })}
                        aria-pressed={index === photoIndex}
                        onClick={() => setPhotoIndex(index)}
                      >
                        <img src={resolvePackAssetUrl(photo.thumb || photo.file)} alt="" />
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </section>

        {place.sensitivity.is_sacred ? (
          <div className="place-sacred-section">
            <span className="place-sacred-badge">
              <Landmark size={13} aria-hidden="true" />
              <span>{t("place.sacredLabel")}</span>
            </span>
            {sacredNoteValue ? <p className="sacred-note">{sacredNoteValue}</p> : null}
          </div>
        ) : null}

        {facts.length > 0 ? (
          <div className="place-facts">
            {facts.map((fact) => (
              <div key={fact.label}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
        ) : null}

        {storyValue ? (
          <section className="content-panel place-story-panel">
            <h2>{t("place.story")}</h2>
            <p>{storyValue}</p>
          </section>
        ) : null}

        {tipsList.length > 0 ? (
          <section className="content-panel">
            <h2>{t("place.tips")}</h2>
            <ul className="tips-list">
              {tipsList.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {place.media.video ? (
          <section className="content-panel video-panel">
            <h2>{t("place.video")}</h2>
            {connectivity === "OFFLINE" ? (
              <Button variant="outline" disabled>
                <Play size={16} aria-hidden="true" />
                {t("status.needsInternet")}
              </Button>
            ) : (
              <video
                className="place-video"
                controls
                preload="none"
                poster={resolvePackAssetUrl(place.media.video.poster)}
                src={resolvePackAssetUrl(place.media.video.url)}
                aria-label={t("place.video")}
              />
            )}
          </section>
        ) : null}

        {partner && partnerCopy ? (
          <section className="content-panel">
            <h2>{t("place.partner")}</h2>
            <div className="partner-offer">
              <Link to="/partner/$id" params={{ id: partner.id }} className="text-link">
                <strong>{partnerCopy.name}</strong>
                <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
              <p>{partnerCopy.offer}</p>
            </div>
          </section>
        ) : null}

        {place.is_anchor && nearby.length > 0 ? (
          <section className="content-panel nudge-section">
            <div className="nudge-header">
              <span className="eyebrow">{t("nudge.title")}</span>
              <h2>{t("nudge.count", { count: nearby.length })}</h2>
            </div>
            <div className="place-nearby-grid">
              {nearby.map((nearbyPlace) => {
                const nearbyCopy = nearbyPlace.i18n[language] ?? nearbyPlace.i18n.en;
                return (
                  <Link
                    to="/place/$slug"
                    params={{ slug: nearbyPlace.slug }}
                    className="place-nearby-card"
                    key={nearbyPlace.id}
                    onClick={() => void logEvent("nudge_click", place.id, nearbyPlace.id)}
                  >
                    <span className="category-label">{t(`filters.${nearbyPlace.category}`)}</span>
                    <strong>{nearbyCopy.title}</strong>
                    <span className="place-nearby-summary">{nearbyCopy.summary}</span>
                    <span className="place-nearby-open">
                      {t("action.open")}
                      <ArrowUpRight size={15} aria-hidden="true" />
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        {enrichmentRows.length > 0 ? (
          <section className="content-panel">
            <h2>{t("place.moreFromWeb")}</h2>
            <ul className="source-list">
              {enrichmentRows.map((row) => (
                <li key={row.key}>
                  <span className="source-name">{t(`attribution.${row.key}`)}</span>
                  {row.note ? <p>{row.note}</p> : null}
                  {row.url ? (
                    <a className="text-link" href={row.url} target="_blank" rel="noreferrer">
                      {t("place.source")}
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </article>
  );
}
