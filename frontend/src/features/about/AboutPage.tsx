import { Compass, Globe, Handshake, Mail, MapPin, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Link } from "@tanstack/react-router";

const CREATORS = [
  {
    name: "Dharmesh Krish Mithaulia",
    role: "Co-Creator · Engineering & Offline Architecture",
  },
  {
    name: "Ujjval Rajauriya",
    role: "Co-Creator · Product, Curation & Experience",
  },
];

export function AboutPage() {
  return (
    <section className="screen about-screen">
      <header className="about-hero">
        <span className="eyebrow">About Voyeger</span>
        <h1>Discover Bhopal Beyond the Obvious</h1>
        <p className="lead-copy">
          Voyeger is an offline-first, multilingual city guide built to celebrate Bhopal&apos;s lesser-known heritage,
          regional food, and living local culture—without ads or noisy rankings.
        </p>
      </header>

      <section className="content-panel about-section" aria-labelledby="mission-heading">
        <div className="about-section-head">
          <Compass size={18} aria-hidden="true" />
          <h2 id="mission-heading">Our Mission</h2>
        </div>
        <p>
          Most travel platforms only surface the same handful of crowded landmarks. Voyeger pairs Bhopal&apos;s major
          anchor monuments with verified hidden gems, neighborhood food lanes, and living cultural spaces within
          walking reach—helping travellers explore deeper while supporting local artisans and hosts.
        </p>
      </section>

      <section className="content-panel about-section" aria-labelledby="how-heading">
        <div className="about-section-head">
          <Sparkles size={18} aria-hidden="true" />
          <h2 id="how-heading">How Voyeger Works</h2>
        </div>
        <div className="about-pillars">
          <article className="about-pillar-card">
            <Globe size={18} aria-hidden="true" />
            <h3>Offline City Packs</h3>
            <p>
              Download Bhopal&apos;s guide, bilingual English/Hindi stories, photos, and map data once to explore
              reliably even without mobile signal.
            </p>
          </article>
          <article className="about-pillar-card">
            <ShieldCheck size={18} aria-hidden="true" />
            <h3>Verified Local Heritage</h3>
            <p>
              Every landmark and hidden gem is grounded in curated sources and reviewed for accuracy, etiquette notes,
              and respectful photography.
            </p>
          </article>
          <article className="about-pillar-card">
            <MapPin size={18} aria-hidden="true" />
            <h3>Community Submissions</h3>
            <p>
              Locals and travellers can{" "}
              <Link to="/submit-place" className="text-link">
                suggest a hidden gem
              </Link>{" "}
              with photos and coordinates, held in pending verification until reviewed.
            </p>
          </article>
          <article className="about-pillar-card">
            <Handshake size={18} aria-hidden="true" />
            <h3>Zero-Ad-Ranking Partners</h3>
            <p>
              Local stays, food kitchens, and craft studios appear transparently alongside nearby landmarks—never
              pay-to-rank.
            </p>
          </article>
        </div>
      </section>

      <section className="content-panel about-section" aria-labelledby="creators-heading">
        <div className="about-section-head">
          <Users size={18} aria-hidden="true" />
          <h2 id="creators-heading">Meet the Creators</h2>
        </div>
        <div className="about-creators-grid">
          {CREATORS.map((creator) => (
            <article key={creator.name} className="about-creator-card">
              <h3>{creator.name}</h3>
              <p>{creator.role}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="content-panel about-section" aria-labelledby="contact-heading">
        <div className="about-section-head">
          <Mail size={18} aria-hidden="true" />
          <h2 id="contact-heading">Contact</h2>
        </div>
        <p>
          Questions, heritage corrections, or partnership inquiries? Reach us at{" "}
          <a href="mailto:cnttoujjval@gmail.com" className="text-link">
            cnttoujjval@gmail.com
          </a>
          .
        </p>
      </section>
    </section>
  );
}
