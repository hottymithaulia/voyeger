import { Check, Clock3, ImagePlus, LocateFixed, Mail, ShieldCheck, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { db } from "@/data/db";
import { getMeta, getPlaces, setMeta } from "@/data/repo";
import { hasValidGeo } from "@/lib/geo";
import type { Language, Place, PlaceCategory } from "@/types";

export const PENDING_PLACES_KEY = "pending_place_submissions";

export type PendingPlaceSubmission = {
  id: string;
  name: string;
  category: PlaceCategory;
  area: string;
  coords?: { lat: number; lng: number };
  nearbyAnchorId: string;
  nearbyAnchorLabel: string;
  description: string;
  photos: string[];
  contributor: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `community-${Date.now()}`
  );
}

function readFilesAsDataUrls(files: FileList): Promise<string[]> {
  return Promise.all(
    Array.from(files)
      .slice(0, 6)
      .map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          }),
      ),
  ).then((urls) => urls.filter(Boolean));
}

export function SubmitPlacePage() {
  const { t, i18n } = useTranslation();
  const language: Language = i18n.language === "hi" ? "hi" : "en";

  const [places, setPlaces] = useState<Place[]>([]);
  const [submissions, setSubmissions] = useState<PendingPlaceSubmission[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<PlaceCategory>("hidden_gem");
  const [area, setArea] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | undefined>();
  const [locating, setLocating] = useState(false);
  const [nearbyAnchorId, setNearbyAnchorId] = useState("");
  const [customLandmark, setCustomLandmark] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [contributor, setContributor] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [lastSubmitted, setLastSubmitted] = useState<PendingPlaceSubmission | null>(null);
  const [emailStatus, setEmailStatus] = useState<"idle" | "sent" | "offline">("idle");

  useEffect(() => {
    let active = true;
    void Promise.all([
      getPlaces().catch(() => [] as Place[]),
      getMeta<PendingPlaceSubmission[]>(PENDING_PLACES_KEY).catch(() => []),
    ]).then(([placeRows, pendingRows]) => {
      if (!active) return;
      setPlaces(placeRows);
      if (Array.isArray(pendingRows)) setSubmissions(pendingRows);
    });
    return () => {
      active = false;
    };
  }, []);

  const anchors = useMemo(() => places.filter((p) => p.is_anchor), [places]);
  const pendingList = useMemo(
    () => submissions.filter((item) => item.status === "pending"),
    [submissions],
  );

  const useCurrentLocation = () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lng = Number(pos.coords.longitude.toFixed(5));
        setCoords({ lat, lng });
        if (!area.trim()) {
          setArea(`Bhopal (${lat}, ${lng})`);
        }
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 6000 },
    );
  };

  const handlePhotoPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files;
    if (!files || files.length === 0) return;
    const urls = await readFilesAsDataUrls(files).catch(() => []);
    setPhotos((prev) => [...prev, ...urls].slice(0, 6));
    event.currentTarget.value = "";
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || !name.trim() || !area.trim()) return;
    setSubmitting(true);

    const matchedAnchor = anchors.find((a) => a.id === nearbyAnchorId);
    const nearbyLabel =
      nearbyAnchorId === "__custom__"
        ? customLandmark.trim() || "Custom landmark"
        : matchedAnchor
          ? matchedAnchor.i18n[language]?.title ?? matchedAnchor.i18n.en.title
          : "Not specified";

    const entry: PendingPlaceSubmission = {
      id: `sub-${Date.now()}`,
      name: name.trim(),
      category,
      area: area.trim(),
      ...(coords ? { coords } : {}),
      nearbyAnchorId: nearbyAnchorId === "__custom__" ? "" : nearbyAnchorId,
      nearbyAnchorLabel: nearbyLabel,
      description: description.trim(),
      photos,
      contributor: contributor.trim(),
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    const next = [entry, ...submissions];
    await setMeta(PENDING_PLACES_KEY, next);
    setSubmissions(next);

    if (typeof navigator !== "undefined" && navigator.onLine) {
      try {
        const res = await fetch("https://formsubmit.co/ajax/cnttoujjval@gmail.com", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            _subject: `New Voyeger Place Suggestion: ${entry.name}`,
            place_name: entry.name,
            category: entry.category,
            area: entry.area,
            nearby_landmark: entry.nearbyAnchorLabel,
            description: entry.description,
            contributor: entry.contributor || "Anonymous",
            photo_count: entry.photos.length,
          }),
        });
        setEmailStatus(res.ok ? "sent" : "offline");
      } catch {
        setEmailStatus("offline");
      }
    } else {
      setEmailStatus("offline");
    }

    setLastSubmitted(entry);
    setName("");
    setArea("");
    setCoords(undefined);
    setNearbyAnchorId("");
    setCustomLandmark("");
    setDescription("");
    setPhotos([]);
    setContributor("");
    setSubmitting(false);
  };

  const approveSubmission = async (entry: PendingPlaceSubmission) => {
    const anchor = anchors.find((a) => a.id === entry.nearbyAnchorId);
    const baseGeo =
      entry.coords ??
      (anchor && hasValidGeo(anchor.geo)
        ? {
            lat: Number(((anchor.geo.lat as number) + 0.0018).toFixed(5)),
            lng: Number(((anchor.geo.lng as number) + 0.0018).toFixed(5)),
          }
        : { lat: 23.2583, lng: 77.4006 });

    const slug = `${slugify(entry.name)}-${entry.id.slice(-4)}`;
    const newPlace: Place = {
      id: slug,
      slug,
      status: "ready",
      category: entry.category,
      tags: ["community-verified", entry.category],
      geo: baseGeo,
      is_anchor: false,
      anchor_for: entry.nearbyAnchorId ? [entry.nearbyAnchorId] : [],
      i18n: {
        en: {
          title: entry.name,
          summary: entry.description || `${entry.name} in ${entry.area} (Community Verified).`,
          story: entry.description || `Submitted by a local explorer near ${entry.nearbyAnchorLabel} in ${entry.area}.`,
          tips: [`Area: ${entry.area}`],
        },
        hi: {
          title: entry.name,
          summary: entry.description || `${entry.area} में ${entry.name} (समुदाय द्वारा सत्यापित)।`,
          story: entry.description || `${entry.area} में ${entry.nearbyAnchorLabel} के पास समुदाय द्वारा सुझाया गया स्थान।`,
          tips: [`क्षेत्र: ${entry.area}`],
        },
      },
      media: {
        images: entry.photos.map((src, idx) => ({
          id: `${slug}-${idx + 1}`,
          file: src,
          thumb: src,
          alt: { en: `${entry.name} — photo ${idx + 1}`, hi: `${entry.name} — तस्वीर ${idx + 1}` },
          credit: entry.contributor || "Community Contributor",
        })),
      },
      hours: null,
      best_time: null,
      cost_note: null,
      sensitivity: { is_sacred: false, note: null },
      enrichment: {},
      provenance: {
        source: "community-verified",
        license: "Community contribution",
        verified_by: "Voyeger local review",
        verified_at: new Date().toISOString().slice(0, 10),
      },
      updated_in_version: 1,
    };

    await db.places.put(newPlace);
    const updated = submissions.map((s) => (s.id === entry.id ? { ...s, status: "approved" as const } : s));
    await setMeta(PENDING_PLACES_KEY, updated);
    setSubmissions(updated);
    window.dispatchEvent(new CustomEvent("voyeger:content-updated"));
  };

  const rejectSubmission = async (entryId: string) => {
    const updated = submissions.map((s) => (s.id === entryId ? { ...s, status: "rejected" as const } : s));
    await setMeta(PENDING_PLACES_KEY, updated);
    setSubmissions(updated);
  };

  return (
    <section className="screen submit-place-screen">
      <header className="submit-place-header">
        <div>
          <span className="eyebrow">Community Discovery</span>
          <h1>Suggest / Add a Place</h1>
          <p className="lead-copy">
            Help fellow travellers uncover Bhopal&apos;s lesser-known gems, local food corners, and living heritage.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setReviewOpen((open) => !open)}
        >
          <ShieldCheck size={16} aria-hidden="true" />
          Review Pending Submissions ({pendingList.length})
        </Button>
      </header>

      {lastSubmitted ? (
        <div className="submit-confirm-banner" role="status">
          <div className="submit-confirm-head">
            <span className="pending-badge">
              <Clock3 size={13} aria-hidden="true" />
              Pending Verification
            </span>
            <strong>{lastSubmitted.name}</strong>
          </div>
          <p>
            {emailStatus === "sent"
              ? "Saved for review and sent to the Voyeger team. It will appear on the public map once verified."
              : "Saved offline in your device queue for verification. It will not appear on the live map until approved."}
          </p>
          <a
            className="text-link"
            href={`mailto:cnttoujjval@gmail.com?subject=${encodeURIComponent(`New Voyeger Place Suggestion: ${lastSubmitted.name}`)}&body=${encodeURIComponent(`Place: ${lastSubmitted.name}\nCategory: ${lastSubmitted.category}\nArea: ${lastSubmitted.area}\nNearby: ${lastSubmitted.nearbyAnchorLabel}\nDescription: ${lastSubmitted.description}`)}`}
          >
            <Mail size={14} aria-hidden="true" />
            Send details via Email App
          </a>
        </div>
      ) : null}

      {reviewOpen ? (
        <section className="content-panel pending-review-panel" aria-label="Review Pending Submissions">
          <h2>Review Pending Submissions</h2>
          {pendingList.length === 0 ? (
            <p className="empty-inline">No pending submissions right now.</p>
          ) : (
            <div className="pending-review-grid">
              {pendingList.map((item) => (
                <article key={item.id} className="pending-review-card">
                  <div className="pending-review-top">
                    <span className="category-label">{t(`filters.${item.category}`)}</span>
                    <span className="pending-badge">
                      <Clock3 size={12} aria-hidden="true" />
                      Pending Verification
                    </span>
                  </div>
                  <h3>{item.name}</h3>
                  <p className="pending-meta">
                    {item.area} · Near {item.nearbyAnchorLabel}
                  </p>
                  {item.description ? <p>{item.description}</p> : null}
                  {item.photos.length > 0 ? (
                    <div className="submit-photo-previews">
                      {item.photos.map((src, i) => (
                        <img key={i} src={src} alt="" className="submit-photo-thumb" />
                      ))}
                    </div>
                  ) : null}
                  <div className="pending-review-actions">
                    <Button type="button" size="sm" onClick={() => void approveSubmission(item)}>
                      <Check size={14} aria-hidden="true" />
                      Approve (Community Verified)
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => void rejectSubmission(item.id)}>
                      <Trash2 size={14} aria-hidden="true" />
                      Reject
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <form className="form-stack submit-place-form" onSubmit={(event) => void handleSubmit(event)}>
        <label className="field-label">
          Place Name *
          <input
            className="text-field"
            placeholder="e.g. Chhota Talaab Tea Point"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            required
          />
        </label>

        <label className="field-label">
          Category
          <select
            className="text-field"
            value={category}
            onChange={(event) => setCategory(event.currentTarget.value as PlaceCategory)}
          >
            <option value="hidden_gem">Hidden Gem</option>
            <option value="food">Local Food</option>
            <option value="culture">Culture &amp; Heritage</option>
            <option value="experience">Local Experience</option>
          </select>
        </label>

        <div className="field-label">
          <span>Area / Location in Bhopal *</span>
          <div className="submit-area-row">
            <input
              className="text-field"
              placeholder="e.g. Peer Gate, Old Bhopal"
              value={area}
              onChange={(event) => setArea(event.currentTarget.value)}
              required
            />
            <Button type="button" variant="outline" size="sm" onClick={useCurrentLocation} disabled={locating}>
              <LocateFixed size={15} aria-hidden="true" />
              {locating ? "Locating…" : "Use my current location"}
            </Button>
          </div>
          {coords ? (
            <span className="form-helper">
              Captured coordinates: {coords.lat}, {coords.lng}
            </span>
          ) : null}
        </div>

        <label className="field-label">
          Nearby Landmark
          <select
            className="text-field"
            value={nearbyAnchorId}
            onChange={(event) => setNearbyAnchorId(event.currentTarget.value)}
          >
            <option value="">Select a nearby Bhopal landmark…</option>
            {anchors.map((anchor) => (
              <option key={anchor.id} value={anchor.id}>
                {anchor.i18n[language]?.title ?? anchor.i18n.en.title}
              </option>
            ))}
            <option value="__custom__">Other / Custom landmark</option>
          </select>
        </label>

        {nearbyAnchorId === "__custom__" ? (
          <label className="field-label">
            Custom Nearby Landmark
            <input
              className="text-field"
              placeholder="e.g. Near Moti Masjid"
              value={customLandmark}
              onChange={(event) => setCustomLandmark(event.currentTarget.value)}
            />
          </label>
        ) : null}

        <label className="field-label">
          Why is this place special? / Short Description
          <textarea
            className="text-field text-field--area"
            placeholder="Share what makes this spot worth discovering…"
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
          />
        </label>

        <div className="field-label">
          <span>Upload Photos (up to 6)</span>
          <label className="submit-upload-drop">
            <ImagePlus size={18} aria-hidden="true" />
            <span>Choose photos from device</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(event) => void handlePhotoPick(event)}
            />
          </label>
          {photos.length > 0 ? (
            <div className="submit-photo-previews">
              {photos.map((src, index) => (
                <div key={index} className="submit-photo-item">
                  <img src={src} alt={`Upload preview ${index + 1}`} className="submit-photo-thumb" />
                  <button
                    type="button"
                    className="submit-photo-remove"
                    aria-label={`Remove photo ${index + 1}`}
                    onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <label className="field-label">
          Contributor Name / Contact (optional)
          <input
            className="text-field"
            placeholder="Your name or email/phone"
            value={contributor}
            onChange={(event) => setContributor(event.currentTarget.value)}
          />
        </label>

        <Button type="submit" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit Place for Verification"}
        </Button>
      </form>
    </section>
  );
}
