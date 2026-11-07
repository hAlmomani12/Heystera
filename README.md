# Heystera

موقع **مطعم هستيريا** مع **هستي**، موظف استقبال صوتي بيحكي أردني وبيحرّك الشاشة وهو بيحكي: بيفرجي الأطباق، بيعبّي السلة، بيعبّي الحجز، وبيأكّد الطلب.

## التشغيل (ويندوز)
1. `1-install.bat` — بيثبّت المكتبات وبينزّل صور الأكل وبيطلب مفتاح OpenAI.
2. `2-start.bat` — بيفتح الموقع على `http://localhost:8000`.
3. `3-change-key.bat` — لتغيير المفتاح.

بدون مفتاح: اكبس «احكي مع هستي» ثم «الجولة التجريبية».

## كيف شغّال
- `server.py` (FastAPI): بيخدم الموقع، وبيطلع مفتاح مؤقت لكل مكالمة (`/api/voice/session`): Gemini (`auth_tokens`) أو OpenAI، وبيحفظ الطلبات والحجوزات.
- المتصفح بيحكي مع Gemini Live مباشرة عبر WebSocket (صوت PCM 16kHz رايح و24kHz راجع)، أو مع OpenAI عبر WebRTC. المفتاح الحقيقي ما بيطلع من السيرفر.
- `web/js/voice.js`: أدوات هستي (`show_dish`، `add_to_order`، `fill_reservation`، ...) وكل وحدة بتحرّك الموقع الحقيقي.
- `web/data/restaurant.js`: القائمة والأسعار والمعلومات. مصدر واحد للموقع ولهستي.

## الإعدادات (`.env`)
هستي بيشتغل على **Gemini Live** (الافتراضي) أو **OpenAI Realtime**. شغّل `3-change-key.bat` واختار.
```
VOICE_PROVIDER=gemini          # أو openai
GEMINI_API_KEY=AIza...         # من aistudio.google.com/apikey
GEMINI_MODEL=gemini-3.8-live   # بديل تلقائي: gemini-3.1-flash-live-preview
GEMINI_VOICE=Puck              # أصوات ثانية: Charon, Kore, Fenrir, Aoede, Leda, Orus, Zephyr
OPENAI_API_KEY=sk-...          # اختياري
PORT=8000
```
`.env` مش مرفوع على GitHub.

## الرفع على Render
1. ادخل [dashboard.render.com](https://dashboard.render.com) ← **New** ← **Blueprint** ← اختار هذا الريبو.
2. Render بيقرأ `render.yaml` لحاله. عبّي:
   - `GEMINI_API_KEY`: مفتاح Gemini (أو `OPENAI_API_KEY` وغيّر `VOICE_PROVIDER` لـ openai).
   - `ACCESS_CODE`: رمز بتعطيه للعميل (مثلاً `hysteria2026`). إذا تركته فاضي، أي حدا معه الرابط بيقدر يحكي مع هستي على حسابك.
3. **Apply**، واستنى 2–3 دقائق، وبيطلعلك رابط مثل `https://heystera.onrender.com`.

ملاحظات:
- الخطة المجانية بتنام بعد 15 دقيقة بدون زوار، وأول فتحة بعدها بتاخذ حوالي 50 ثانية. افتح الرابط قبل العرض بدقيقة.
- الطلبات والحجوزات على Render بتنمسح مع كل إعادة تشغيل (للعرض بس).
- الصوت ما بيحتاج TURN هون: المتصفح بيحكي مع OpenAI مباشرة.

## الهوية (Rainbrand)
- هوية «هستيريا» على Rainbrand: الألوان `#0D0806` `#FF4D1C` `#FFB547` `#FBF1E6`، والخطوط Lalezar وIBM Plex Sans Arabic وAref Ruqaa.
- `brand/`: اللوقو (شفاف وعلى خلفية غامقة)، والأيقونة، وصورة المشاركة، ومنشور وستوري إنستغرام.
- `web/brand/`: نسخ الموقع (لوقو، favicon، صورة المشاركة og.jpg، صورة جو المطعم).
