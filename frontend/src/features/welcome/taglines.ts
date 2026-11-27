export const LAST_TAGLINE_INDEX_KEY = "voyeger:last_tagline_index";

export const TRAVEL_TAGLINES_EN = [
  "A city of stories waiting to be discovered.",
  "Every street has a story. Every turn has a discovery.",
  "Travel beyond the obvious.",
  "Find the places locals keep close to heart.",
  "Discover the soul behind every destination.",
  "Not just places. The stories behind them.",
  "Take the road less travelled.",
  "The best discoveries are never on the usual route.",
  "Find something the guidebooks missed.",
  "Every corner holds a little wonder.",
  "Meet the city beyond its landmarks.",
  "Go where the local stories begin.",
  "Discover more than what meets the eye.",
  "Follow the streets. Find the stories.",
  "Experience the city like you belong here.",
  "Hidden places. Real people. Unforgettable stories.",
  "Let curiosity choose your next turn.",
  "The city is bigger than its famous places.",
  "See familiar streets in an entirely new way.",
  "Your next discovery is closer than you think.",
] as const;

export const TRAVEL_TAGLINES_HI = [
  "कहानियों का शहर, खोजे जाने की प्रतीक्षा में।",
  "हर गली की एक कहानी है। हर मोड़ पर एक खोज।",
  "जानी-पहचानी राह से आगे बढ़ें।",
  "वे जगहें खोजें जिन्हें स्थानीय लोग दिल के करीब रखते हैं।",
  "हर मंज़िल के पीछे बसी रूह को पहचानें।",
  "सिर्फ़ जगहें नहीं, उनके पीछे की कहानियाँ।",
  "कम चली हुई राह चुनें।",
  "सबसे बेहतरीन खोजें आम रास्तों पर नहीं मिलतीं।",
  "वह खोजें जो गाइडबुक में छूट गया।",
  "हर नुक्कड़ में एक छोटा सा अजूबा छिपा है।",
  "शहर को उसके मशहूर स्मारकों से आगे मिलकर जानें।",
  "वहाँ जाएं जहाँ से स्थानीय कहानियाँ शुरू होती हैं।",
  "जो नज़र आता है, उससे कहीं अधिक खोजें।",
  "गलियों के साथ चलें, कहानियाँ पाएं।",
  "शहर को ऐसे जिएं जैसे आप यहीं के हों।",
  "छुपी जगहें। सच्चे लोग। अनभुली कहानियाँ।",
  "जिज्ञासा को अपना अगला मोड़ चुनने दें।",
  "शहर अपनी मशहूर जगहों से कहीं बड़ा है।",
  "पहचानी सड़कों को बिल्कुल नए नज़रिए से देखें।",
  "आपकी अगली खोज आपकी सोच से भी ज़्यादा करीब है।",
] as const;

function readLastIndex(storage?: Pick<Storage, "getItem"> | null): number | null {
  try {
    const raw = storage?.getItem(LAST_TAGLINE_INDEX_KEY);
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  } catch {
    return null;
  }
}

function writeLastIndex(index: number, storage?: Pick<Storage, "setItem"> | null): void {
  try {
    storage?.setItem(LAST_TAGLINE_INDEX_KEY, String(index));
  } catch {
    // Ignore storage quota / privacy mode errors.
  }
}

function nextRandomInt(limit: number): number {
  if (limit <= 1) return 0;
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return (buf[0] ?? 0) % limit;
  }
  return Math.floor(Math.random() * limit);
}

/**
 * Selects one tagline index per homepage initialization/reload while avoiding
 * repeating the immediately preceding index whenever more than one option exists.
 */
export function pickSessionTaglineIndex(
  count: number,
  storage?: Pick<Storage, "getItem" | "setItem"> | null,
): number {
  if (count <= 1) return 0;
  const resolvedStorage =
    storage !== undefined
      ? storage
      : typeof window !== "undefined"
        ? window.localStorage
        : null;
  const previous = readLastIndex(resolvedStorage);
  let next = nextRandomInt(count);
  if (previous !== null && previous >= 0 && previous < count && next === previous) {
    next = (previous + 1 + nextRandomInt(count - 1)) % count;
  }
  writeLastIndex(next, resolvedStorage);
  return next;
}
