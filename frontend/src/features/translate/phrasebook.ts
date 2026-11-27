export type PhraseLanguage = "en" | "hi" | "ta" | "bn" | "mr";

export type PhraseLanguageMeta = {
  code: PhraseLanguage;
  label: string;
  nativeLabel: string;
  needs_review: boolean;
};

export type PhraseEntry = {
  id: string;
  translations: Record<
    PhraseLanguage,
    {
      text: string;
      transliteration?: string;
      needs_review: boolean;
    }
  >;
};

export const PHRASEBOOK_LANGUAGES: PhraseLanguageMeta[] = [
  { code: "en", label: "English", nativeLabel: "English", needs_review: false },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी", needs_review: true },
  { code: "ta", label: "Tamil", nativeLabel: "தமிழ்", needs_review: true },
  { code: "bn", label: "Bengali", nativeLabel: "বাংলা", needs_review: true },
  { code: "mr", label: "Marathi", nativeLabel: "मराठी", needs_review: true },
];

export const TRAVEL_PHRASES: PhraseEntry[] = [
  {
    id: "where-is-place",
    translations: {
      en: { text: "Where is this place?", needs_review: false },
      hi: { text: "यह जगह कहाँ है?", transliteration: "Yah jagah kahan hai?", needs_review: true },
      ta: { text: "இந்த இடம் எங்கே உள்ளது?", transliteration: "Indha idam enge ulladhu?", needs_review: true },
      bn: { text: "এই জায়গাটি কোথায়?", transliteration: "Ei jaygati kothay?", needs_review: true },
      mr: { text: "हे ठिकाण कुठे आहे?", transliteration: "He thikan kuthe ahe?", needs_review: true },
    },
  },
  {
    id: "how-much-cost",
    translations: {
      en: { text: "How much does this cost?", needs_review: false },
      hi: { text: "इसकी कीमत कितनी है?", transliteration: "Iski keemat kitni hai?", needs_review: true },
      ta: { text: "இதன் விலை என்ன?", transliteration: "Idhan vilai enna?", needs_review: true },
      bn: { text: "এটার দাম কত?", transliteration: "Etar dam koto?", needs_review: true },
      mr: { text: "याची किंमत किती आहे?", transliteration: "Yachi kimmat kiti ahe?", needs_review: true },
    },
  },
  {
    id: "help-find-location",
    translations: {
      en: { text: "Can you help me find this location?", needs_review: false },
      hi: { text: "क्या आप मुझे यह जगह ढूंढने में मदद कर सकते हैं?", transliteration: "Kya aap mujhe yah jagah dhoondhne mein madad kar sakte hain?", needs_review: true },
      ta: { text: "இந்த இடத்தைக் கண்டுபிடிக்க எனக்கு உதவ முடியுமா?", transliteration: "Indha idathaik kandupidikka enakku udhava mudiyuma?", needs_review: true },
      bn: { text: "আপনি কি আমাকে এই জায়গাটি খুঁজে পেতে সাহায্য করতে পারেন?", transliteration: "Apni ki amake ei jaygati khuje pete sahajyo korte paren?", needs_review: true },
      mr: { text: "हे ठिकाण शोधण्यात तुम्ही मला मदत करू शकता का?", transliteration: "He thikan shodhnyat tumhi mala madat karu shakta ka?", needs_review: true },
    },
  },
  {
    id: "nearest-food-shop",
    translations: {
      en: { text: "Where is the nearest food shop?", needs_review: false },
      hi: { text: "सबसे पास खाने की दुकान कहाँ है?", transliteration: "Sabse paas khane ki dukaan kahan hai?", needs_review: true },
      ta: { text: "அருகிலுள்ள உணவகம் எங்கே உள்ளது?", transliteration: "Arugilulla unavagam enge ulladhu?", needs_review: true },
      bn: { text: "সবচেয়ে কাছের খাবারের দোকান কোথায়?", transliteration: "Sobcheye kacher khabarer dokan kothay?", needs_review: true },
      mr: { text: "जवळचे खाण्याचे दुकान कुठे आहे?", transliteration: "Javalche khanyache dukan kuthe ahe?", needs_review: true },
    },
  },
  {
    id: "is-place-open",
    translations: {
      en: { text: "Is this place open?", needs_review: false },
      hi: { text: "क्या यह जगह खुली है?", transliteration: "Kya yah jagah khuli hai?", needs_review: true },
      ta: { text: "இந்த இடம் திறந்திருக்கிறதா?", transliteration: "Indha idam thirandhirukkiradha?", needs_review: true },
      bn: { text: "এই জায়গাটি কি খোলা আছে?", transliteration: "Ei jaygati ki khola ache?", needs_review: true },
      mr: { text: "हे ठिकाण उघडे आहे का?", transliteration: "He thikan ughade ahe ka?", needs_review: true },
    },
  },
  {
    id: "thank-you",
    translations: {
      en: { text: "Thank you.", needs_review: false },
      hi: { text: "धन्यवाद।", transliteration: "Dhanyavaad.", needs_review: true },
      ta: { text: "நன்றி.", transliteration: "Nandri.", needs_review: true },
      bn: { text: "ধন্যবাদ।", transliteration: "Dhonnobad.", needs_review: true },
      mr: { text: "धन्यवाद.", transliteration: "Dhanyavaad.", needs_review: true },
    },
  },
];
