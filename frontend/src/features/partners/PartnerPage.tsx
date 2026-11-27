import { ArrowUpRight } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { getPartner, getPlaces } from "@/data/repo";
import { logEvent, queueEnquiry } from "@/data/outbox";
import type { Language, Partner, Place } from "@/types";

export function PartnerPage({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const [partner, setPartner] = useState<Partner>();
  const [places, setPlaces] = useState<Place[]>([]);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ name: "", contact: "", message: "" });
  const language: Language = i18n.language === "hi" ? "hi" : "en";

  useEffect(() => {
    let active = true;
    void Promise.all([getPartner(id), getPlaces()]).then(([found, allPlaces]) => {
      if (!active) return;
      setPartner(found);
      setPlaces(allPlaces);
    }).catch(() => {
      if (active) { setPartner(undefined); setPlaces([]); }
    }).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [id]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!partner) return;
    const placeId = partner.place_ids[0];
    await queueEnquiry({
      partner_id: partner.id,
      ...(placeId ? { place_id: placeId } : {}),
      name: form.name,
      contact: form.contact,
      message: form.message,
    });
    if (placeId) void logEvent("enquiry", placeId, partner.id);
    setForm({ name: "", contact: "", message: "" });
    setNotice(t("partners.queued"));
  };

  if (!ready) return <div className="screen"><div className="empty-state"><p>{t("common.loading")}</p></div></div>;
  if (!partner) return <div className="screen"><div className="empty-state"><p>{t("partners.noPartners")}</p><Link to="/partners" className="voyager-button voyager-button--outline">{t("partners.title")}</Link></div></div>;

  const copy = partner.i18n[language] ?? partner.i18n.en;
  const phone = partner.contact.phone?.replace(/[^0-9+]/g, "");
  const whatsapp = partner.contact.whatsapp?.replace(/[^0-9]/g, "");
  const linkedPlaces = places.filter((place) => partner.place_ids.includes(place.id));

  return (
    <section className="screen">
      <div className="place-back-row"><Link to="/partners" className="text-link">{t("partners.title")}</Link><span className="sample-stamp">{t("partners.samplePartner")}</span></div>
      <header className="screen-heading partner-heading"><div><span className="category-label">{t(`partners.types.${partner.type}`)}</span><h1 className="screen-title">{copy.name}</h1><p className="screen-description">{copy.description}</p></div></header>
      <div className="partner-offer"><span className="eyebrow">{t("place.offer")}</span><p>{copy.offer}</p></div>
      <div className="partner-contact-actions">
        {phone ? <a className="voyager-button voyager-button--outline" href={`tel:${phone}`}>{t("partners.phone")}</a> : null}
        {whatsapp ? <a className="voyager-button voyager-button--outline" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">{t("partners.whatsapp")}<ArrowUpRight size={14} aria-hidden="true" /></a> : null}
      </div>
      {linkedPlaces.length > 0 ? <section className="content-panel"><h2>{t("map.nearby")}</h2><div className="content-list">{linkedPlaces.map((place) => <Link to="/place/$slug" params={{ slug: place.slug }} className="nearby-item" key={place.id}><span>{place.i18n[language]?.title ?? place.i18n.en.title}</span><ArrowUpRight size={15} aria-hidden="true" /></Link>)}</div></section> : null}
      <section className="content-panel"><h2>{t("partners.enquiry")}</h2><form className="form-stack" onSubmit={(event) => void submit(event)}>
        <label className="field-label">{t("partners.name")}<input className="text-field" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.currentTarget.value }))} required /></label>
        <label className="field-label">{t("partners.contact")}<input className="text-field" value={form.contact} onChange={(event) => setForm((current) => ({ ...current, contact: event.currentTarget.value }))} required /></label>
        <label className="field-label">{t("partners.message")}<textarea className="text-field text-field--area" value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.currentTarget.value }))} required /></label>
        <Button type="submit">{t("partners.enquiry")}</Button>
        {notice ? <p className="notice" role="status">{notice}</p> : null}
        <p className="form-helper">{t("status.willSend")}</p>
      </form></section>
    </section>
  );
}