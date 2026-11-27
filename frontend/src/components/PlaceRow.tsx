import { useState } from "react";
import { ArrowUpRight, Compass } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { resolvePackAssetUrl } from "@/lib/assets";
import type { Language, Place } from "@/types";

export function PlaceRow({ place, language }: { place: Place; language: Language }) {
  const { t } = useTranslation();
  const [imgError, setImgError] = useState(false);
  const copy = place.i18n[language] ?? place.i18n.en;
  const image = place.media.images[0];
  return (
    <Link to="/place/$slug" params={{ slug: place.slug }} className="place-list-item">
      {image && !imgError ? (
        <img
          className="place-thumb"
          src={resolvePackAssetUrl(image.thumb || image.file)}
          alt={image.alt[language] ?? image.alt.en}
          loading="lazy"
          onError={() => setImgError(true)}
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