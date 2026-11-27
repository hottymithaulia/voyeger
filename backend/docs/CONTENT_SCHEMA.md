# Voyeger Content YAML Schema

Curated content lives in `content/places/*.yaml` (one file per place) and `content/partners/*.yaml` (one file per partner).
Curated fields are authoritative and never overwritten by online enrichment (OSM / Wikivoyage).

## Place YAML Schema (`content/places/<id>.yaml`)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | yes | Unique stable identifier (kebab-case) |
| `slug` | string | yes | Unique URL slug |
| `category` | enum | yes | One of `hidden_gem`, `food`, `culture`, `experience` |
| `status` | enum | no | `draft`, `ready`, or `hold` (default `draft`). `hold` is never published; `draft` publishes only when `PUBLISH_STATUSES` includes `draft`. |
| `tags` | list[string] | no | Searchable tags |
| `geo` | object | yes (for `ready`) | `{ lat: float \| null, lng: float \| null }` inside `BHOPAL_BBOX` (nullable in `draft` until resolved/approved) |
| `is_anchor` | bool | no | True if this is a major anchor landmark (`record_type: anchor`) |
| `anchor_for` | list[string] | no | List of nearby place IDs anchored by this place |
| `theme` | object | no | Optional `{ primary: "#hex", secondary: "#hex", on_primary: "#000" \| "#fff" }` computed at build time from the first real image |
| `hours` | string | no | Human-readable opening hours (`null` until verified) |
| `best_time` | string | no | Best time of day/year to visit (`null` until verified) |
| `cost_note` | string | no | Entry fee / budget note (`null` until verified) |
| `sensitivity` | object | no | `{ is_sacred: bool, note: string \| null }` (`note` required when `status: ready` and `is_sacred: true`) |
| `partner_id` | string | no | Optional linked partner ID |
| `media` | object | yes | `{ images: [{ id, source_file, alt: {en, hi}, credit, license?, source_url? }], placeholder?: bool, video: { url, poster, offline } \| null }` |
| `provenance` | object | yes | `{ source, license, verified_by, verified_at, sources?: [{ name, url, type }] }` |
| `text` | object | yes | Map of `lang` -> `{ title, summary, story, tips: list[string], needs_review }` for all `REQUIRED_LANGUAGES` |
| `deleted` | bool | no | Soft-delete tombstone flag (default `false`) |

### Example Place YAML

```yaml
id: kamla-park-baori
slug: kamla-park-baori
category: hidden_gem
tags:
  - stepwell
  - heritage
  - lakeside
geo:
  lat: 23.2512
  lng: 77.3921
is_anchor: false
anchor_for: []
hours: "06:00 - 18:30"
best_time: "Early morning or golden hour"
cost_note: "Free entry"
sensitivity:
  is_sacred: false
  note: null
partner_id: null
media:
  images:
    - id: kamla-baori-1
      source_file: kamla-park-baori.jpg
      alt:
        en: "Stone arches of the quiet stepwell near Kamla Park"
        hi: "कमला पार्क के पास शांत बावड़ी के पत्थर के मेहराब"
      credit: "Voyeger Bhopal Curated (SAMPLE DATA)"
  video: null
provenance:
  source: "SAMPLE DATA"
  license: "CC-BY-SA-4.0"
  verified_by: "bhopal-editorial"
  verified_at: "2026-11-01"
text:
  en:
    title: "Kamla Park Stepwell"
    summary: "A quiet 18th-century stone stepwell tucked beside the Upper Lake promenade."
    story: "Built during the early Bhopal State period, this shaded baori once cooled travellers walking between the old city gates and the lakefront."
    tips:
      - "Walk down from the Kamla Park gate."
      - "Wear sturdy sandals on the stone steps."
    needs_review: false
  hi:
    title: "कमला पार्क बावड़ी"
    summary: "बड़े तालाब के किनारे स्थित 18वीं सदी की एक शांत पत्थर की बावड़ी।"
    story: "भोपाल रियासत के शुरुआती दौर में बनी यह छायादार बावड़ी पुराने शहर और तालाब के बीच चलने वाले यात्रियों को ठंडक देती थी।"
    tips:
      - "कमला पार्क गेट से नीचे उतरें।"
      - "पत्थर की सीढ़ियों पर मजबूत चप्पल पहनें।"
    needs_review: false
deleted: false
```

## Partner YAML Schema (`content/partners/<id>.yaml`)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | yes | Unique stable identifier |
| `type` | enum | yes | `board`, `homestay`, `food`, `experience`, `artisan`, `performer`, `vendor` |
| `name` | string | yes | Display name |
| `contact` | object | no | Non-PII public business contact (e.g. `{ phone_display, whatsapp, hours }`) |
| `place_ids` | list[string] | yes | Referenced place IDs |
| `offer` | string | no | Curated visitor offer |
| `featured_until` | string | no | ISO date string or null |
| `onboarded_via` | enum | no | `form`, `whatsapp`, `admin` |
| `text` | object | no | Map of `lang` -> `{ name, description, offer, needs_review }` |
| `deleted` | bool | no | Soft-delete tombstone flag |
