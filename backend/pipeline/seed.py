from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any, Dict, List

import yaml

from pipeline.ingest_curated import ingest_curated
from server.db import SessionLocal

SAMPLE_PLACES: List[Dict[str, Any]] = [
    {
        "id": "upper-lake",
        "slug": "upper-lake",
        "category": "experience",
        "tags": ["lake", "sunrise", "waterfront"],
        "geo": {"lat": 23.2583, "lng": 77.4006},
        "is_anchor": True,
        "anchor_for": ["gauhar-mahal", "sadar-manzil", "shaukat-mahal", "heritage-courtyard-walk"],
        "hours": "Open 24 hours (SAMPLE DATA)",
        "best_time": "Morning or late afternoon",
        "cost_note": "Free promenade access (SAMPLE DATA)",
        "sensitivity": {"is_sacred": False, "note": ""},
        "partner_id": "sample-lakeside-stay",
        "media": {
            "images": [
                {
                    "id": "upper-lake-cover",
                    "source_file": "upper-lake.jpg",
                    "alt": {
                        "en": "Illustrated sample view of Upper Lake",
                        "hi": "बड़ा तालाब का नमूना चित्र",
                    },
                    "credit": "Voyeger Bhopal Curated (SAMPLE DATA)",
                }
            ],
            "video": {"url": "/media/bhopal-sample-clip.mp4", "poster": "/pack/v1/images/upper-lake-cover.webp", "offline": False},
        },
        "provenance": {
            "source": "SAMPLE DATA",
            "license": "CC-BY-SA-4.0",
            "verified_by": "bhopal-editorial",
            "verified_at": "2026-11-01",
        },
        "text": {
            "en": {
                "title": "Upper Lake",
                "summary": "A broad, calm horizon at the heart of Bhopal.",
                "story": "Bhojtal, often called Upper Lake, has shaped Bhopal's rhythm for centuries. Its shoreline opens into changing views of the old city and surrounding hills.",
                "tips": [
                    "Check current access and opening information before visiting.",
                    "Be considerate of residents and shared public spaces.",
                ],
                "needs_review": False,
            },
            "hi": {
                "title": "बड़ा तालाब",
                "summary": "भोपाल के बीचोंबीच फैला शांत, खुला क्षितिज।",
                "story": "भोजताल, जिसे बड़ा तालाब भी कहते हैं, सदियों से भोपाल की जीवन-धारा रहा है। इसके किनारे पुराने शहर और आसपास की पहाड़ियों के बदलते दृश्य दिखते हैं।",
                "tips": [
                    "जाने से पहले खुलने और पहुंच की जानकारी जांचें।",
                    "स्थानीय लोगों और सार्वजनिक जगहों की निजता का सम्मान करें।",
                ],
                "needs_review": False,
            },
        },
        "deleted": False,
    },
    {
        "id": "bharat-bhavan",
        "slug": "bharat-bhavan",
        "category": "culture",
        "tags": ["arts", "architecture", "lakeside"],
        "geo": {"lat": 23.2358, "lng": 77.4014},
        "is_anchor": True,
        "anchor_for": ["lake-view-walk", "gauhar-mahal", "heritage-courtyard-walk"],
        "hours": "14:00 - 20:00 (SAMPLE DATA)",
        "best_time": "Late afternoon",
        "cost_note": "INR 20 entry (SAMPLE DATA)",
        "sensitivity": {"is_sacred": False, "note": ""},
        "partner_id": None,
        "media": {
            "images": [
                {
                    "id": "bharat-bhavan-cover",
                    "source_file": "bharat-bhavan.jpg",
                    "alt": {
                        "en": "Terraced courtyards of Bharat Bhavan overlooking the lake",
                        "hi": "झील की ओर खुलते भारत भवन के सीढ़ीदार प्रांगण",
                    },
                    "credit": "Voyeger Bhopal Curated (SAMPLE DATA)",
                }
            ],
            "video": None,
        },
        "provenance": {
            "source": "SAMPLE DATA",
            "license": "CC-BY-SA-4.0",
            "verified_by": "bhopal-editorial",
            "verified_at": "2026-11-01",
        },
        "text": {
            "en": {
                "title": "Bharat Bhavan",
                "summary": "Sunken multi-arts complex celebrating tribal, folk, and contemporary Indian art.",
                "story": "Stepping gently down toward the Upper Lake, Bharat Bhavan houses Roopankar's Gond and Bhil collections alongside an open-air amphitheatre.",
                "tips": [
                    "Visit after 4 PM for gallery light and sunset over the lake.",
                    "Check gallery schedules before visiting.",
                ],
                "needs_review": False,
            },
            "hi": {
                "title": "भारत भवन",
                "summary": "आदिवासी, लोक और समकालीन भारतीय कला को समर्पित कला केंद्र।",
                "story": "बड़े तालाब की ओर उतरते हुए भारत भवन में गोंड और भील कला का समृद्ध संग्रह और मुक्ताकाश रंगमंच है।",
                "tips": [
                    "शाम 4 बजे के बाद गैलरी और सूर्यास्त देखने आएं।",
                    "जाने से पहले गैलरी का समय जांच लें।",
                ],
                "needs_review": False,
            },
        },
        "deleted": False,
    },
    {
        "id": "gauhar-mahal",
        "slug": "gauhar-mahal",
        "category": "hidden_gem",
        "tags": ["palace", "begums", "heritage", "courtyard"],
        "geo": {"lat": 23.259, "lng": 77.4001},
        "is_anchor": False,
        "anchor_for": [],
        "hours": "09:00 - 18:00 (SAMPLE DATA)",
        "best_time": "Morning or late afternoon",
        "cost_note": "Free entry (SAMPLE DATA)",
        "sensitivity": {"is_sacred": False, "note": ""},
        "partner_id": None,
        "media": {
            "images": [
                {
                    "id": "gauhar-mahal-cover",
                    "source_file": "gauhar-mahal.jpg",
                    "alt": {
                        "en": "Carved sandstone arches inside Gauhar Mahal courtyard",
                        "hi": "गौहर महल प्रांगण के अंदर नक्काशीदार बलुआ पत्थर के मेहराब",
                    },
                    "credit": "Voyeger Bhopal Curated (SAMPLE DATA)",
                }
            ],
            "video": None,
        },
        "provenance": {
            "source": "SAMPLE DATA",
            "license": "CC-BY-SA-4.0",
            "verified_by": "bhopal-editorial",
            "verified_at": "2026-11-01",
        },
        "text": {
            "en": {
                "title": "Gauhar Mahal",
                "summary": "1820 lakeside palace built by Qudsia Begum blending Hindu and Mughal motifs.",
                "story": "Commissioned by Bhopal's first female ruler, Gauhar Mahal's inner Diwan-e-Aam courtyard opens onto cooling lake breezes.",
                "tips": [
                    "Look up at the painted wooden ceilings in the upper jharokha.",
                    "Pair with a short walk toward VIP Road.",
                ],
                "needs_review": False,
            },
            "hi": {
                "title": "गौहर महल",
                "summary": "1820 में कुदसिया बेगम द्वारा बनवाया गया झील के किनारे स्थित ऐतिहासिक महल।",
                "story": "भोपाल की पहली महिला शासिका द्वारा निर्मित यह महल हिंदू और मुगल स्थापत्य का सुंदर संगम है।",
                "tips": [
                    "ऊपरी झरोखे की चित्रित लकड़ी की छत अवश्य देखें।",
                    "पास की झील की सैर के साथ इसे जोड़ें।",
                ],
                "needs_review": False,
            },
        },
        "deleted": False,
    },
    {
        "id": "moti-masjid",
        "slug": "moti-masjid",
        "category": "culture",
        "tags": ["mosque", "heritage", "architecture", "sacred"],
        "geo": {"lat": 23.2598, "lng": 77.4025},
        "is_anchor": False,
        "anchor_for": [],
        "hours": "06:00 - 20:00 (non-prayer hours for visitors)",
        "best_time": "Morning",
        "cost_note": "Free entry (SAMPLE DATA)",
        "sensitivity": {
            "is_sacred": True,
            "note": "Active place of worship. Dress modestly, remove footwear before entering the courtyard, and avoid visiting during congregational prayers.",
        },
        "partner_id": None,
        "media": {
            "images": [
                {
                    "id": "moti-masjid-cover",
                    "source_file": "moti-masjid.jpg",
                    "alt": {
                        "en": "White marble facade and twin minarets of Moti Masjid in Bhopal",
                        "hi": "भोपाल की मोती मस्जिद का सफेद संगमरमर का अग्रभाग",
                    },
                    "credit": "Voyeger Bhopal Curated (SAMPLE DATA)",
                }
            ],
            "video": None,
        },
        "provenance": {
            "source": "SAMPLE DATA",
            "license": "CC-BY-SA-4.0",
            "verified_by": "bhopal-editorial",
            "verified_at": "2026-11-01",
        },
        "text": {
            "en": {
                "title": "Moti Masjid",
                "summary": "1860 white marble mosque commissioned by Sikandar Begum in Old Bhopal.",
                "story": "Known as the Pearl Mosque, Moti Masjid rises on a quiet plinth above Chowk Bazaar with finely proportioned domes and red sandstone flanking towers.",
                "tips": [
                    "Visit in the morning outside prayer times.",
                    "Dress modestly and remove shoes at the entrance.",
                ],
                "needs_review": False,
            },
            "hi": {
                "title": "मोती मस्जिद",
                "summary": "1860 में सिकंदर बेगम द्वारा निर्मित सफेद संगमरमर की ऐतिहासिक मस्जिद।",
                "story": "चौक बाजार के पास स्थित मोती मस्जिद अपने शांत प्रांगण और सुंदर गुंबदों के लिए जानी जाती है।",
                "tips": [
                    "नमाज़ के समय के अलावा सुबह आएं।",
                    "शालीन वस्त्र पहनें और प्रवेश से पहले जूते उतारें।",
                ],
                "needs_review": False,
            },
        },
        "deleted": False,
    },
    {
        "id": "sadar-manzil",
        "slug": "sadar-manzil",
        "category": "hidden_gem",
        "tags": ["heritage", "begums", "courtyard"],
        "geo": {"lat": 23.2611, "lng": 77.4026},
        "is_anchor": False,
        "anchor_for": [],
        "hours": "09:00 - 18:00 (SAMPLE DATA)",
        "best_time": "Morning",
        "cost_note": "Free exterior view (SAMPLE DATA)",
        "sensitivity": {"is_sacred": False, "note": ""},
        "partner_id": None,
        "media": {
            "images": [
                {
                    "id": "sadar-manzil-cover",
                    "source_file": "sadar-manzil.jpg",
                    "alt": {
                        "en": "Red and cream arched hall of Sadar Manzil in Old Bhopal",
                        "hi": "पुराने भोपाल में सदर मंजिल का ऐतिहासिक मेहराबदार हॉल",
                    },
                    "credit": "Voyeger Bhopal Curated (SAMPLE DATA)",
                }
            ],
            "video": None,
        },
        "provenance": {
            "source": "SAMPLE DATA",
            "license": "CC-BY-SA-4.0",
            "verified_by": "bhopal-editorial",
            "verified_at": "2026-11-01",
        },
        "text": {
            "en": {
                "title": "Sadar Manzil",
                "summary": "Former Hall of Public Audience in the old walled city, framing lush courtyard gardens.",
                "story": "Built during the Begums' reign as a civic audience hall, Sadar Manzil links Moti Masjid and Shaukat Mahal along a walkable heritage spine.",
                "tips": [
                    "Walk through early in the morning before market traffic builds.",
                    "Combine with Moti Masjid next door.",
                ],
                "needs_review": False,
            },
            "hi": {
                "title": "सदर मंजिल",
                "summary": "पुराने शहर में स्थित पूर्व जन-सभा हॉल और हरा-भरा प्रांगण।",
                "story": "बेगमों के शासनकाल में निर्मित सदर मंजिल मोती मस्जिद और शौकत महल के बीच की विरासत कड़ी है।",
                "tips": [
                    "बाजार की भीड़ से पहले सुबह टहलें।",
                    "पास की मोती मस्जिद के साथ इसे देखें।",
                ],
                "needs_review": False,
            },
        },
        "deleted": False,
    },
    {
        "id": "old-city-food-lane",
        "slug": "old-city-food-lane",
        "category": "food",
        "tags": ["street-food", "old-bhopal", "evening", "chai"],
        "geo": {"lat": 23.2609, "lng": 77.4052},
        "is_anchor": False,
        "anchor_for": [],
        "hours": "17:00 - 23:30 (SAMPLE DATA)",
        "best_time": "After 19:00",
        "cost_note": "INR 150-350 per person (SAMPLE DATA)",
        "sensitivity": {"is_sacred": False, "note": ""},
        "partner_id": "sample-chowk-kitchen",
        "media": {
            "images": [
                {
                    "id": "old-city-food-lane-cover",
                    "source_file": "old-city-food-lane.jpg",
                    "alt": {
                        "en": "Evening street food stalls in Old Bhopal's food lane",
                        "hi": "पुराने भोपाल की फूड लेन में शाम के स्ट्रीट फूड स्टॉल",
                    },
                    "credit": "Voyeger Bhopal Curated (SAMPLE DATA)",
                }
            ],
            "video": None,
        },
        "provenance": {
            "source": "SAMPLE DATA",
            "license": "CC-BY-SA-4.0",
            "verified_by": "bhopal-editorial",
            "verified_at": "2026-11-01",
        },
        "text": {
            "en": {
                "title": "Old City Food Lane",
                "summary": "Evening food lane in Old Bhopal famous for Bhopali chaat, snacks, and salted chai.",
                "story": "As dusk settles over Chowk Bazaar, samovars and coal sigris light up the lane with recipes passed down through family stalls.",
                "tips": [
                    "Arrive on foot from Peer Gate.",
                    "Carry small cash notes for street stalls.",
                ],
                "needs_review": False,
            },
            "hi": {
                "title": "पुराना शहर फूड लेन",
                "summary": "पुराने भोपाल की शाम की फूड लेन, जो भोपाली चाट और नमकीन चाय के लिए प्रसिद्ध है।",
                "story": "शाम ढलते ही चौक बाजार के पास यह गली पारंपरिक भोपाली व्यंजनों की खुशबू से महक उठती है।",
                "tips": [
                    "पीर गेट से पैदल आएं।",
                    "दुकानों के लिए छोटे नकद नोट साथ रखें।",
                ],
                "needs_review": False,
            },
        },
        "deleted": False,
    },
    {
        "id": "shaukat-mahal",
        "slug": "shaukat-mahal",
        "category": "hidden_gem",
        "tags": ["architecture", "begums", "heritage"],
        "geo": {"lat": 23.2581, "lng": 77.4051},
        "is_anchor": False,
        "anchor_for": [],
        "hours": "Exterior viewable all day (SAMPLE DATA)",
        "best_time": "Morning light",
        "cost_note": "Free exterior view (SAMPLE DATA)",
        "sensitivity": {"is_sacred": False, "note": ""},
        "partner_id": None,
        "media": {
            "images": [
                {
                    "id": "shaukat-mahal-cover",
                    "source_file": "shaukat-mahal.jpg",
                    "alt": {
                        "en": "Indo-European arched facade of Shaukat Mahal in Bhopal",
                        "hi": "भोपाल में शौकत महल का इंडो-यूरोपीय मेहराबदार अग्रभाग",
                    },
                    "credit": "Voyeger Bhopal Curated (SAMPLE DATA)",
                }
            ],
            "video": None,
        },
        "provenance": {
            "source": "SAMPLE DATA",
            "license": "CC-BY-SA-4.0",
            "verified_by": "bhopal-editorial",
            "verified_at": "2026-11-01",
        },
        "text": {
            "en": {
                "title": "Shaukat Mahal",
                "summary": "1830s palace fusing Gothic and Islamic arches in the heart of Chowk.",
                "story": "Designed with European Renaissance flourishes beside Mughal floral motifs, Shaukat Mahal stands as one of Old Bhopal's most unusual facades.",
                "tips": [
                    "Look closely at the triangular pediments and carved floral arches.",
                    "Best photographed in soft morning light.",
                ],
                "needs_review": False,
            },
            "hi": {
                "title": "शौकत महल",
                "summary": "चौक के बीचोंबीच गोथिक और इस्लामी स्थापत्य का अनूठा संगम।",
                "story": "1830 के दशक में बना शौकत महल यूरोपीय और मुगल शैलियों के मिश्रण का दुर्लभ उदाहरण है।",
                "tips": [
                    "मेहराबों और नक्काशी को ध्यान से देखें।",
                    "सुबह की नरम रोशनी में यह सबसे सुंदर दिखता है।",
                ],
                "needs_review": False,
            },
        },
        "deleted": False,
    },
    {
        "id": "tribal-museum",
        "slug": "tribal-museum",
        "category": "culture",
        "tags": ["museum", "gond-art", "bhil", "culture"],
        "geo": {"lat": 23.2078, "lng": 77.4171},
        "is_anchor": False,
        "anchor_for": [],
        "hours": "12:00 - 19:00 (Closed Mondays)",
        "best_time": "Afternoon",
        "cost_note": "INR 20 entry (SAMPLE DATA)",
        "sensitivity": {"is_sacred": False, "note": ""},
        "partner_id": None,
        "media": {
            "images": [
                {
                    "id": "tribal-museum-cover",
                    "source_file": "tribal-museum.jpg",
                    "alt": {
                        "en": "Sculptural galleries of the Madhya Pradesh Tribal Museum",
                        "hi": "मध्य प्रदेश जनजातीय संग्रहालय की कलात्मक दीर्घाएं",
                    },
                    "credit": "Voyeger Bhopal Curated (SAMPLE DATA)",
                }
            ],
            "video": None,
        },
        "provenance": {
            "source": "SAMPLE DATA",
            "license": "CC-BY-SA-4.0",
            "verified_by": "bhopal-editorial",
            "verified_at": "2026-11-01",
        },
        "text": {
            "en": {
                "title": "Madhya Pradesh Tribal Museum",
                "summary": "Immersive galleries built by Gond, Bhil, Baiga, and Korku artisans.",
                "story": "Rather than glass cases, the museum's rooms are full-scale dwellings, mythic installations, and painted murals crafted by community artists.",
                "tips": [
                    "Allow at least 90 minutes to explore all six galleries.",
                    "Closed on Mondays and public holidays.",
                ],
                "needs_review": False,
            },
            "hi": {
                "title": "मध्य प्रदेश जनजातीय संग्रहालय",
                "summary": "गोंड, भील, बैगा और कोरकू कलाकारों द्वारा निर्मित जीवंत दीर्घाएं।",
                "story": "यहाँ कांच के बक्सों के बजाय पारंपरिक आवास, लोककथाएं और भित्ति चित्र कलाकारों ने स्वयं बनाए हैं।",
                "tips": [
                    "सभी दीर्घाओं को देखने के लिए कम से कम 90 मिनट रखें।",
                    "सोमवार को संग्रहालय बंद रहता है।",
                ],
                "needs_review": False,
            },
        },
        "deleted": False,
    },
    {
        "id": "heritage-courtyard-walk",
        "slug": "heritage-courtyard-walk",
        "category": "experience",
        "tags": ["walk", "craft", "courtyard", "artisan"],
        "geo": {"lat": 23.2548, "lng": 77.3986},
        "is_anchor": False,
        "anchor_for": [],
        "hours": "10:00 - 18:00 (SAMPLE DATA)",
        "best_time": "Mid-morning",
        "cost_note": "Free walk; studio workshops extra (SAMPLE DATA)",
        "sensitivity": {"is_sacred": False, "note": ""},
        "partner_id": "sample-begum-studio",
        "media": {
            "images": [
                {
                    "id": "heritage-courtyard-walk-cover",
                    "source_file": "heritage-courtyard-walk.jpg",
                    "alt": {
                        "en": "Quiet stone courtyard along the Old Bhopal craft walk",
                        "hi": "पुराने भोपाल की शिल्प सैर के किनारे शांत पत्थर का प्रांगण",
                    },
                    "credit": "Voyeger Bhopal Curated (SAMPLE DATA)",
                }
            ],
            "video": None,
        },
        "provenance": {
            "source": "SAMPLE DATA",
            "license": "CC-BY-SA-4.0",
            "verified_by": "bhopal-editorial",
            "verified_at": "2026-11-01",
        },
        "text": {
            "en": {
                "title": "Heritage Courtyard Walk",
                "summary": "A slow walking loop connecting stone havelis, zardozi workshops, and lakeside gates.",
                "story": "Tucked off the main bazaar arteries, quiet residential courtyards still host traditional craft studios and mid-day tea stops.",
                "tips": [
                    "Enquire ahead for artisan studio demonstrations.",
                    "Wear comfortable walking shoes.",
                ],
                "needs_review": False,
            },
            "hi": {
                "title": "हेरिटेज कोर्टयार्ड वॉक",
                "summary": "पत्थर की हवेलियों, ज़रदोज़ी कार्यशालाओं और झील के द्वारों को जोड़ती पैदल सैर।",
                "story": "मुख्य बाजार से हटकर शांत आंगनों में आज भी पारंपरिक शिल्प स्टूडियो काम करते हैं।",
                "tips": [
                    "कार्यशाला देखने के लिए पहले से पूछें।",
                    "आरामदायक चलने वाले जूते पहनें।",
                ],
                "needs_review": False,
            },
        },
        "deleted": False,
    },
    {
        "id": "lake-view-walk",
        "slug": "lake-view-walk",
        "category": "experience",
        "tags": ["lakeside", "sunset", "walk"],
        "geo": {"lat": 23.2465, "lng": 77.3948},
        "is_anchor": False,
        "anchor_for": [],
        "hours": "06:00 - 21:00 (SAMPLE DATA)",
        "best_time": "Sunset",
        "cost_note": "Free promenade access (SAMPLE DATA)",
        "sensitivity": {"is_sacred": False, "note": ""},
        "partner_id": None,
        "media": {
            "images": [
                {
                    "id": "lake-view-walk-cover",
                    "source_file": "lake-view-walk.jpg",
                    "alt": {
                        "en": "Evening walkway overlooking Upper Lake in Bhopal",
                        "hi": "भोपाल में बड़े तालाब के किनारे शाम का सैरगाह",
                    },
                    "credit": "Voyeger Bhopal Curated (SAMPLE DATA)",
                }
            ],
            "video": None,
        },
        "provenance": {
            "source": "SAMPLE DATA",
            "license": "CC-BY-SA-4.0",
            "verified_by": "bhopal-editorial",
            "verified_at": "2026-11-01",
        },
        "text": {
            "en": {
                "title": "Lake View Walk",
                "summary": "Breezy hillside promenade linking Shamla Hills with the southern shore of Bhojtal.",
                "story": "Popular for unhurried evening strolls, this stretch frames views across the water toward Old Bhopal's minarets.",
                "tips": [
                    "Arrive 30 minutes before sunset for the best light.",
                    "Pair with a visit to Bharat Bhavan nearby.",
                ],
                "needs_review": False,
            },
            "hi": {
                "title": "लेक व्यू वॉक",
                "summary": "श्यामला हिल्स को भोजताल के दक्षिणी किनारे से जोड़ने वाला हवादार सैरगाह।",
                "story": "शाम की सैर के लिए लोकप्रिय यह मार्ग झील के पार पुराने भोपाल के सुंदर दृश्य दिखाता है।",
                "tips": [
                    "सूर्यास्त से 30 मिनट पहले पहुंचें।",
                    "पास के भारत भवन की यात्रा के साथ जोड़ें।",
                ],
                "needs_review": False,
            },
        },
        "deleted": False,
    },
]

SAMPLE_PARTNERS: List[Dict[str, Any]] = [
    {
        "id": "sample-lakeside-stay",
        "type": "homestay",
        "name": "Sample Lakeside Homestay",
        "contact": {"phone": "917555010001", "whatsapp": "917555010001", "email": "stay@example.invalid"},
        "place_ids": ["upper-lake", "bharat-bhavan"],
        "offer": "Sample welcome tea for Voyeger visitors",
        "featured_until": "2026-12-31",
        "onboarded_via": "admin",
        "text": {
            "en": {
                "name": "Sample Lakeside Homestay",
                "offer": "Sample welcome tea for Voyeger visitors",
                "description": "Illustrative homestay listing near Bhopal's lakefront.",
                "needs_review": False,
            },
            "hi": {
                "name": "नमूना लेकसाइड होमस्टे",
                "offer": "यात्रियों के लिए नमूना स्वागत चाय",
                "description": "भोपाल की झील के पास होमस्टे की उदाहरण सूची।",
                "needs_review": False,
            },
        },
        "deleted": False,
    },
    {
        "id": "sample-chowk-kitchen",
        "type": "food",
        "name": "Sample Chowk Kitchen",
        "contact": {"phone": "917555010002", "whatsapp": "917555010002", "email": "food@example.invalid"},
        "place_ids": ["old-city-food-lane"],
        "offer": "Sample breakfast pairing; prices not verified",
        "featured_until": "2026-12-31",
        "onboarded_via": "whatsapp",
        "text": {
            "en": {
                "name": "Sample Chowk Kitchen",
                "offer": "Sample breakfast pairing; prices not verified",
                "description": "Illustrative street-food partner listing for the demo pack.",
                "needs_review": False,
            },
            "hi": {
                "name": "नमूना चौक रसोई",
                "offer": "नमूना नाश्ता सुझाव; कीमतें सत्यापित नहीं",
                "description": "डेमो पैक में सड़क के खाने के साथी की उदाहरण सूची।",
                "needs_review": False,
            },
        },
        "deleted": False,
    },
    {
        "id": "sample-begum-studio",
        "type": "artisan",
        "name": "Sample Begum Studio",
        "contact": {"phone": "917555010003", "whatsapp": "917555010003", "email": "craft@example.invalid"},
        "place_ids": ["heritage-courtyard-walk"],
        "offer": "Sample introduction to Bhopali craft traditions",
        "featured_until": "2026-12-31",
        "onboarded_via": "form",
        "text": {
            "en": {
                "name": "Sample Begum Studio",
                "offer": "Sample introduction to Bhopali craft traditions",
                "description": "Illustrative artisan listing; not a confirmed business.",
                "needs_review": False,
            },
            "hi": {
                "name": "नमूना बेगम स्टूडियो",
                "offer": "भोपाली शिल्प परंपराओं का नमूना परिचय",
                "description": "कारीगर साथी की उदाहरण सूची; वास्तविक व्यवसाय की पुष्टि नहीं।",
                "needs_review": False,
            },
        },
        "deleted": False,
    },
]


def write_seed_yaml(content_dir: Path = Path("content"), force: bool = False) -> None:
    places_dir = content_dir / "places"
    partners_dir = content_dir / "partners"
    places_dir.mkdir(parents=True, exist_ok=True)
    partners_dir.mkdir(parents=True, exist_ok=True)

    for place in SAMPLE_PLACES:
        out = places_dir / f"{place['id']}.yaml"
        if force or not out.exists():
            out.write_text(
                yaml.safe_dump(place, allow_unicode=True, sort_keys=False),
                encoding="utf-8",
            )

    for partner in SAMPLE_PARTNERS:
        out = partners_dir / f"{partner['id']}.yaml"
        if force or not out.exists():
            out.write_text(
                yaml.safe_dump(partner, allow_unicode=True, sort_keys=False),
                encoding="utf-8",
            )


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Bhopal sample places & partners")
    parser.add_argument("--content-dir", type=Path, default=Path("content"))
    parser.add_argument("--force", action="store_true", help="Overwrite existing YAML files")
    args = parser.parse_args()

    write_seed_yaml(args.content_dir, force=args.force)
    with SessionLocal() as db:
        counts = ingest_curated(db, args.content_dir, target_version=1)
    print(f"Seeded YAML and ingested {counts['places']} places, {counts['partners']} partners.")


if __name__ == "__main__":
    main()
