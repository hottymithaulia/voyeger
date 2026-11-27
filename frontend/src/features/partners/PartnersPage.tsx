import { ArrowUpRight, Camera, CheckCircle2, Clock3, Store } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { getCityConfig } from "@/config/city";
import { getActiveCity, getPartners, getPlaces } from "@/data/repo";
import { queuePartnerApplication } from "@/data/outbox";
import type { CityConfig, Language, Partner, PartnerApplication, Place } from "@/types";

const partnerTypes: Partner["type"][] = [
  "homestay",
  "food",
  "artisan",
  "performer",
  "experience",
  "vendor",
  "board",
];

export function PartnersPage() {
  const { t, i18n } = useTranslation();
  const [city, setCity] = useState<CityConfig>(() => getCityConfig());
  const [partners, setPartners] = useState<Partner[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [ready, setReady] = useState(false);
  const [submittedName, setSubmittedName] = useState("");
  const [application, setApplication] = useState({
    name: "",
    type: "artisan" as Partner["type"],
    contact: "",
    offer: "",
    placeId: "",
  });
  const language: Language = i18n.language === "hi" ? "hi" : "en";
  const cityName = city.name[language] ?? city.name.en;

  useEffect(() => {
    let active = true;
    void Promise.all([
      getActiveCity().catch(() => getCityConfig()),
      getPartners(),
      getPlaces(),
    ])
      .then(([activeCity, partnerRows, placeRows]) => {
        if (!active) return;
        setCity(activeCity);
        setPartners(partnerRows);
        setPlaces(placeRows);
      })
      .catch(() => {
        if (active) {
          setPartners([]);
          setPlaces([]);
        }
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const submitApplication = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submittedBusiness = application.name.trim();
    const payload: Omit<PartnerApplication, "id" | "created_at"> = {
      name: submittedBusiness,
      type: application.type,
      contact: application.contact.trim(),
      offer: application.offer.trim(),
      place_ids: application.placeId ? [application.placeId] : [],
    };
    await queuePartnerApplication(payload);
    setSubmittedName(submittedBusiness);
    setApplication({ name: "", type: "artisan", contact: "", offer: "", placeId: "" });
  };

  return (
    <section className="screen partners-screen">
      <header className="partners-hero">
        <span className="eyebrow">{t("partners.campaignBadge")}</span>
        <h1 className="partners-hero-title">{t("partners.campaignTitle")}</h1>
        <p className="partners-hero-copy">
          {t("partners.campaignLead", { city: cityName })}
        </p>

        <div className="partners-participants">
          <span className="partners-participants-label">{t("partners.whoJoins")}</span>
          <div className="partners-pill-row">
            {partnerTypes.map((type) => (
              <span className="partners-pill" key={type}>
                {t(`partners.types.${type}`)}
              </span>
            ))}
          </div>
        </div>

        <div className="partners-hero-actions">
          <a href="#partner-application" className="voyager-button voyager-button--primary voyager-button--default">
            {t("partners.become")}
          </a>
        </div>
      </header>

      <section className="partners-section" aria-labelledby="verified-partners-heading">
        <div className="partners-section-head">
          <div>
            <span className="eyebrow">{t("partners.title")}</span>
            <h2 id="verified-partners-heading">{t("partners.verifiedDirectory")}</h2>
          </div>
        </div>

        {!ready ? (
          <div className="empty-state">
            <p>{t("common.loading")}</p>
          </div>
        ) : partners.length === 0 ? (
          <div className="empty-state">
            <Store aria-hidden="true" size={24} />
            <p>{t("partners.noPartners")}</p>
          </div>
        ) : (
          <div className="content-grid partner-grid">
            {partners.map((partner) => {
              const copy = partner.i18n[language] ?? partner.i18n.en;
              return (
                <article className="partner-card partner-card--editorial" key={partner.id}>
                  <div className="partner-card-meta">
                    <span className="category-label">{t(`partners.types.${partner.type}`)}</span>
                    <span className="partner-verified-tag">
                      <CheckCircle2 size={12} aria-hidden="true" />
                      <span>{t("partners.samplePartner")}</span>
                    </span>
                  </div>
                  <h3>{copy.name}</h3>
                  <p>{copy.description}</p>
                  <p className="partner-offer">{copy.offer}</p>
                  <Link to="/partner/$id" params={{ id: partner.id }} className="text-link">
                    {t("action.open")}
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="content-panel application-panel" id="partner-application">
        <h2>{t("partners.applicationTitle")}</h2>
        <form className="form-stack" onSubmit={(event) => void submitApplication(event)}>
          <label className="field-label">
            {t("partners.businessName")}
            <input
              className="text-field"
              value={application.name}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setApplication((current) => ({ ...current, name: value }));
              }}
              required
            />
          </label>

          <label className="field-label">
            {t("partners.kind")}
            <select
              className="text-field"
              value={application.type}
              onChange={(event) => {
                const value = event.currentTarget.value as Partner["type"];
                setApplication((current) => ({ ...current, type: value }));
              }}
            >
              {partnerTypes.map((type) => (
                <option value={type} key={type}>
                  {t(`partners.types.${type}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="field-label">
            {t("partners.contact")}
            <input
              className="text-field"
              value={application.contact}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setApplication((current) => ({ ...current, contact: value }));
              }}
              required
            />
          </label>

          <label className="field-label">
            {t("partners.offer")}
            <textarea
              className="text-field text-field--area"
              value={application.offer}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setApplication((current) => ({ ...current, offer: value }));
              }}
              required
            />
          </label>

          <label className="field-label">
            {t("partners.linkedPlace")}
            <select
              className="text-field"
              value={application.placeId}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setApplication((current) => ({ ...current, placeId: value }));
              }}
            >
              <option value="">{t("partners.noPlaceOption")}</option>
              {places.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.i18n[language]?.title ?? place.i18n.en.title}
                </option>
              ))}
            </select>
          </label>

          <div className="partner-photo-placeholder" aria-disabled="true">
            <div className="partner-photo-head">
              <Camera size={16} aria-hidden="true" />
              <strong>{t("partners.photoFutureLabel")}</strong>
            </div>
            <p>{t("partners.photoFutureNote")}</p>
          </div>

          <Button type="submit">{t("partners.become")}</Button>

          {submittedName ? (
            <div className="notice partners-review-note" role="status">
              <Clock3 size={16} aria-hidden="true" />
              <div>
                <strong>
                  {submittedName} — {t("partners.submitted")}
                </strong>
                <p>{t("partners.reviewPending")}</p>
              </div>
            </div>
          ) : null}

          <p className="form-helper">{t("status.willSend")}</p>
        </form>
      </section>
    </section>
  );
}
