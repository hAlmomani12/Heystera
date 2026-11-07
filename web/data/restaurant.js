window.HYSTERIA = {
  "restaurant": {
    "name": "مطعم هستيريا",
    "tagline": "أكل بيجنّن، على الفحم",
    "city": "عمّان",
    "address": "عمّان — شارع مكة، بجانب دوار المدينة الرياضية (عنوان تجريبي)",
    "phone": "+962 79 000 0000",
    "delivery": "توصيل داخل عمّان خلال 45 دقيقة تقريباً، رسوم التوصيل دينار ونص، ومجاني للطلبات فوق 25 دينار",
    "hours": [
      {"days": "السبت – الأربعاء", "open": "12:00", "close": "01:00"},
      {"days": "الخميس – الجمعة", "open": "12:00", "close": "02:00"}
    ],
    "media": {
      "hero": "https://d8j0ntlcm91z4.cloudfront.net/user_3L9KsfPzHJ8y1L0bevZ54xBN967/hf_20261107_123240_309385c2-177e-453c-9461-1c184882c4fc.png"
    }
  },
  "categories": [
    {"id": "grill", "name": "المشاوي"},
    {"id": "signature", "name": "أطباق هستيريا"},
    {"id": "mezze", "name": "المقبّلات والسلطات"},
    {"id": "sweets", "name": "الحلو"},
    {"id": "extras", "name": "إضافات ومشروبات"}
  ],
  "dishes": [
    {"id": "kebab", "category": "grill", "name": "كباب هستيريا", "price": 9.5, "tags": ["حار", "الأكثر طلباً"],
     "desc": "لحم غنم مفروم بالفلفل الحلبي ودبس الرمان، على أسياخ عريضة فوق الفحم، مع بندورة وفلفل مشوي.",
     "img": "https://d8j0ntlcm91z4.cloudfront.net/user_3L9KsfPzHJ8y1L0bevZ54xBN967/hf_20261107_123327_3b67698c-995c-4ff7-a992-95ae5567d209.png"},
    {"id": "tawook", "category": "grill", "name": "شيش طاووق", "price": 7.75, "tags": [],
     "desc": "صدر دجاج متبّل باللبن والثوم والليمون، مع ثومية مخفوقة يدوياً ومخلل بيتي.",
     "img": "https://d8j0ntlcm91z4.cloudfront.net/user_3L9KsfPzHJ8y1L0bevZ54xBN967/hf_20261107_123350_21c7dafa-4c3f-4152-b96b-a1a380b71174.png"},
    {"id": "chops", "category": "grill", "name": "ريش غنم بلدي", "price": 14, "tags": [],
     "desc": "ريش بلدي بالملح الخشن والزعتر البري، مشوية لحد ما يقرمش الدهن، مع ليمون مشوي.",
     "img": "https://d8j0ntlcm91z4.cloudfront.net/user_3L9KsfPzHJ8y1L0bevZ54xBN967/hf_20261107_123416_7bf97559-9e4d-48ad-8c53-c85ee40ec4fa.png"},
    {"id": "platter", "category": "signature", "name": "صحن الهستيريا", "price": 32, "tags": ["لـ4 أشخاص", "طبق البيت"],
     "desc": "صينية مشاوي ضخمة: كباب، طاووق، كفتة وريش، فوق خبز الطابون، مع حمّص وثومية وخضار مشوية.",
     "img": "https://d8j0ntlcm91z4.cloudfront.net/user_3L9KsfPzHJ8y1L0bevZ54xBN967/hf_20261107_123327_8f64476e-d61b-437d-b125-a9e0878d1322.png"},
    {"id": "zarb", "category": "signature", "name": "زرب هستيريا", "price": 18, "tags": ["احجزه قبلها بيوم"],
     "desc": "كتف غنم بيستوي 8 ساعات تحت الأرض فوق الجمر لحد ما يذوب عن العظم، على رز بالسمن البلدي واللوز.",
     "img": "https://d8j0ntlcm91z4.cloudfront.net/user_3L9KsfPzHJ8y1L0bevZ54xBN967/hf_20261107_123456_50e62792-5661-429a-b674-beec88a2d850.png"},
    {"id": "hummus", "category": "mezze", "name": "حمّص باللحمة", "price": 4.5, "tags": [],
     "desc": "حمّص ناعم وعليه لحمة مفرومة محمّرة بالسمن مع صنوبر محمّص.",
     "img": "https://d8j0ntlcm91z4.cloudfront.net/user_3L9KsfPzHJ8y1L0bevZ54xBN967/hf_20261107_123549_37cbad92-ae74-43c9-aa97-e929bbe26856.png"},
    {"id": "mutabbal", "category": "mezze", "name": "متبّل مدخّن", "price": 3.25, "tags": ["نباتي"],
     "desc": "باذنجان محروق على الفحم، طحينة، دبس رمان وحب رمان.",
     "img": "https://d8j0ntlcm91z4.cloudfront.net/user_3L9KsfPzHJ8y1L0bevZ54xBN967/hf_20261107_123624_a2b1ecec-58d8-41e9-9130-3110a4489d4e.png"},
    {"id": "fattoush", "category": "mezze", "name": "فتّوش", "price": 3.75, "tags": ["نباتي"],
     "desc": "خضار طازة، خبز محمّص على النار، سماق ودبس رمان.",
     "img": "https://d8j0ntlcm91z4.cloudfront.net/user_3L9KsfPzHJ8y1L0bevZ54xBN967/hf_20261107_123903_6f160a45-f814-492b-a23b-dd3f796c1637.png"},
    {"id": "knafeh", "category": "sweets", "name": "كنافة نابلسية سخنة", "price": 4.5, "tags": ["بتمطّ"],
     "desc": "كنافة بالجبنة النابلسية بصينية نحاس، مع فستق حلبي وقطر.",
     "img": "https://d8j0ntlcm91z4.cloudfront.net/user_3L9KsfPzHJ8y1L0bevZ54xBN967/hf_20261107_123657_d3fe5b69-58bb-4e28-8924-a230552766fb.png"},
    {"id": "taboon", "category": "extras", "name": "خبز طابون", "price": 0.75, "tags": ["نباتي"], "desc": "بينخبز قدّامك على الحصى."},
    {"id": "toum", "category": "extras", "name": "ثومية زيادة", "price": 0.5, "tags": ["نباتي"], "desc": "ثومية مخفوقة يدوياً."},
    {"id": "fries", "category": "extras", "name": "بطاطا مقلية بالسماق", "price": 2, "tags": ["نباتي"], "desc": "مقرمشة، مع سماق وملح بحري."},
    {"id": "lemonmint", "category": "extras", "name": "ليمون ونعنع", "price": 2.25, "tags": [], "desc": "عصير طازة مثلّج."},
    {"id": "tea", "category": "extras", "name": "شاي على الفحم", "price": 1.5, "tags": [], "desc": "إبريق شاي بالميرمية بيغلي على الجمر."},
    {"id": "soda", "category": "extras", "name": "مشروب غازي", "price": 1, "tags": [], "desc": "علبة باردة."}
  ],
  "faq": [
    {"q": "في مواقف سيارات؟", "a": "آه، في موقف مجاني قدّام المطعم وخدمة صفّ سيارات بالليل."},
    {"q": "عندكم أكل نباتي؟", "a": "آه: المتبّل والفتّوش والبطاطا وخبز الطابون كلها نباتية."},
    {"q": "كيف بقدر أدفع؟", "a": "كاش، بطاقة، أو كليك (CliQ)."},
    {"q": "في قاعة للمناسبات؟", "a": "آه، قاعة خاصة لحد 40 شخص، وبنعمل قائمة مشاوي خاصة لمناسبتك."},
    {"q": "الزرب متوفر دايماً؟", "a": "الزرب لازم ينطلب قبلها بيوم لأنه بيستوي 8 ساعات."},
    {"q": "في جلسات للأطفال؟", "a": "آه، في كراسي أطفال وصحن خاص للصغار عند الطلب."}
  ]
};
