import { useState } from "react";
import { ArrowUpRight, Compass } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { fallbackPackAssetUrl, resolvePackAssetUrl } from "@/lib/assets";
import type { Language, Place } from "@/types";

export function PlaceRow({ place, language }: { place: Place; language: Language }) {
  const { t } = useTranslation();
  const [imgError, setImgError] = useState(false);
  const copy = place.i18n[language] ?? place.i18n.en;
  const image = place.media.images[0];
  const assetPath = image ? image.thumb || image.file : "";
  return (
    <Link to="/place/$slug" params={{ slug: place.slug }} className="place-list-item">
      {image && !imgError ? (
        <img
          className="place-thumb"
          src={resolvePackAssetUrl(assetPath)}
          alt={image.alt[language] ?? image.alt.en}
          loading="lazy"
          onError={(event) => {
            const fallback = fallbackPackAssetUrl(event.currentTarget.src, assetPath);
            if (fallback) event.currentTarget.src = fallback;
            else setImgError(true);
          }}
        />
      ) : (
        <span className="place-thumb place-thumb--fallback" aria-hidden="true">
          <Compass size={20} />
        </span>
      )}
      <span>
        <span className="category-label">{t(`filters.${place.category}`)}</span>
        <h2 className="place-list-title">{copy.title}</h2>
        <p className="place-list-copy">{copy.summary}</p>
      </span>
      <ArrowUpRight size={18} aria-hidden="true" />
    </Link>
  );
}