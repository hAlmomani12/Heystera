"""مطعم هستيريا — سيرفر الموقع + المساعد الصوتي.

السيرفر يخدم صفحات الموقع، ويعطي المتصفح مفتاحاً مؤقتاً (دقائق قليلة) ليتحدث مباشرة مع
Gemini Live (WebSocket) أو OpenAI Realtime (WebRTC). مفتاحك الحقيقي لا يغادر هذا الجهاز أبداً.
اختيار المزوّد: VOICE_PROVIDER=gemini|openai بملف .env (أو تلقائياً حسب المفتاح الموجود).

التشغيل:  python server.py   ثم افتح  http://localhost:8000
"""
import json
import mimetypes
import os
import secrets
import time
from datetime import date, datetime
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("text/javascript", ".js")

ROOT = Path(__file__).parent
WEB = ROOT / "web"

# ---------- .env ----------
_env = ROOT / ".env"
if _env.exists():
    for line in _env.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

OPENAI_URL = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
MODEL = os.environ.get("REALTIME_MODEL", "gpt-realtime-2.1")
FALLBACK_MODEL = "gpt-realtime"
VOICE = os.environ.get("VOICE", "marin")
PORT = int(os.environ.get("PORT", "8000"))
# Protection for a public deployment (Render etc.)
ACCESS_CODE = os.environ.get("ACCESS_CODE", "").strip()          # if set, callers must type this code before talking to Hasti
MAX_SESSIONS_PER_DAY = int(os.environ.get("MAX_SESSIONS_PER_DAY", "150"))  # hard cap on voice calls per day (all users)
MAX_CALL_MINUTES = int(os.environ.get("MAX_CALL_MINUTES", "8"))   # the browser hangs up after this


GEMINI_URL = os.environ.get("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com").rstrip("/")
GEMINI_WS = os.environ.get("GEMINI_WS_URL", "wss://generativelanguage.googleapis.com/ws/"
                           "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.8-live")
GEMINI_FALLBACK_MODEL = os.environ.get("GEMINI_FALLBACK_MODEL", "gemini-3.1-flash-live-preview")
GEMINI_VOICE = os.environ.get("GEMINI_VOICE", "Puck")
GEMINI_LANG = [c.strip() for c in os.environ.get("GEMINI_LANG", "ar-JO").split(",") if c.strip()]  # speech recognition language hint


def openai_key() -> str:
    return os.environ.get("OPENAI_API_KEY", "").strip()


def gemini_key() -> str:
    return (os.environ.get("GEMINI_API_KEY", "") or os.environ.get("GOOGLE_API_KEY", "")).strip()


def provider() -> str:
    """gemini | openai — VOICE_PROVIDER wins; otherwise whichever key exists (Gemini first)."""
    want = os.environ.get("VOICE_PROVIDER", "").strip().lower()
    if want in ("gemini", "openai"):
        return want
    return "gemini" if gemini_key() else "openai"


def key() -> str:
    return gemini_key() if provider() == "gemini" else openai_key()


def kb() -> dict:
    # one source of truth for the site and the agent: web/data/restaurant.js  (window.HYSTERIA = {...};)
    txt = (WEB / "data" / "restaurant.js").read_text(encoding="utf-8-sig")
    return json.loads(txt.split("=", 1)[1].strip().rstrip(";"))


def instructions(page: dict) -> str:
    data = kb()
    r = data["restaurant"]
    menu_lines = []
    for cat in data["categories"]:
        menu_lines.append(f"\n[{cat['name']}] (category id: {cat['id']})")
        for d in data["dishes"]:
            if d["category"] == cat["id"]:
                tags = "، ".join(d.get("tags", []))
                menu_lines.append(f"- {d['name']} (id: {d['id']}) — {d['price']} دينار — {d['desc']}" + (f" — [{tags}]" if tags else ""))
    hours = "؛ ".join(f"{h['days']}: {h['open']} – {h['close']}" for h in r["hours"])
    faq = "\n".join(f"- س: {q['q']}\n  ج: {q['a']}" for q in data["faq"])
    now = time.strftime("%A %Y-%m-%d %H:%M")
    return f"""أنت "هَستي"، موظف الاستقبال الصوتي في {r['name']} في {r['city']}.
احكِ دائماً باللهجة الأردنية العمّانية، بنبرة دافئة ومرحة وفيها طاقة، زي واحد بيحب الأكل وبيحب يضيّف.
الزبون دايماً بيحكي عربي (لهجة أردنية)، وأنت بترد دايماً بالعربي الأردني حتى لو سمعت كلمة إنجليزي. إذا الكلام مش واضح أو سمعته كأنه لغة ثانية، لا تخمّن: قول بلطف «ما سمعتك منيح، عيدها؟».
أنت في مكالمة صوتية: ردودك قصيرة جداً (جملة أو جملتين)، بدون قوائم أو رموز. لا تقرأ القائمة كاملة أبداً؛ اقترح طبقين أو ثلاثة بالكثير.
الأسعار قلها بالطريقة الأردنية: "9 دنانير ونص"، "دينارين وربع"، "75 قرش".

الشاشة قدّام الزبون، وأنت بتحرّكها بالأدوات. هذا أهم شي:
- لما تحكي عن طبق، استدعِ show_dish عشان يشوفه.
- لما يسأل عن قسم، استدعِ open_menu_category.
- لما يطلب أكل، استدعِ add_to_order مباشرة، وبعدين اسأل إذا بده إشي ثاني.
- قبل ما تأكد الطلب: استدعِ show_order، اقرأ المجموع، وخذ الاسم والتلفون وطريقة الاستلام (توصيل أو استلام من المطعم، وللتوصيل العنوان). بعد موافقته الصريحة استدعِ place_order.
- للحجز: عبّي البيانات بـ fill_reservation أول ما تعرفها (حتى لو ناقصة) عشان يشوفها تنكتب، وبعد ما يأكد استدعِ confirm_reservation.
- للتنقل العام استخدم go_to.
- لا تخترع أطباق أو أسعار أو معلومات مش موجودة تحت. إذا ما بتعرف، قول بصراحة واقترح يتصل على {r['phone']}.
- إذا الزبون عنده حساسية، نبّه إنه يحكي للمطبخ، ولا تضمن خلو الطبق من شي.
- لما يخلص الزبون ويودّع، ودّعه بجملة وحدة واستدعِ end_call.

معلومات المطعم:
- الاسم: {r['name']} — {r['tagline']}
- العنوان: {r['address']}
- التلفون: {r['phone']}
- الدوام: {hours}
- التوصيل: {r['delivery']}
- الوقت الحالي عند الزبون: {now}

القائمة:{chr(10).join(menu_lines)}

أسئلة شائعة:
{faq}

الشاشة هسّا: {page.get('section', 'الرئيسية')}. السلة: {page.get('cart', 'فاضية')}.
ابدأ المكالمة بترحيب قصير جداً باسم المطعم واسأل شو نفسه ياكل اليوم."""


TOOLS = [
    {"type": "function", "name": "go_to", "description": "انقل الشاشة لقسم من الموقع.",
     "parameters": {"type": "object", "properties": {"section": {"type": "string", "enum": ["home", "menu", "signature", "story", "reserve", "location"]}}, "required": ["section"]}},
    {"type": "function", "name": "open_menu_category", "description": "افتح قسم من القائمة على الشاشة.",
     "parameters": {"type": "object", "properties": {"category": {"type": "string", "description": "category id"}}, "required": ["category"]}},
    {"type": "function", "name": "show_dish", "description": "اعرض طبق على الشاشة وميّزه (تكبير وتوهج). استعمله كل ما تحكي عن طبق.",
     "parameters": {"type": "object", "properties": {"dish_id": {"type": "string"}}, "required": ["dish_id"]}},
    {"type": "function", "name": "recommend", "description": "اعرض مجموعة اقتراحات على الشاشة حسب ذوق الزبون، وارجع بالأطباق المناسبة.",
     "parameters": {"type": "object", "properties": {
         "spicy": {"type": "boolean"}, "vegetarian": {"type": "boolean"}, "max_price": {"type": "number"},
         "people": {"type": "integer"}, "category": {"type": "string"}}}},
    {"type": "function", "name": "add_to_order", "description": "أضف طبق للسلة.",
     "parameters": {"type": "object", "properties": {"dish_id": {"type": "string"}, "qty": {"type": "integer", "minimum": 1}, "note": {"type": "string", "description": "ملاحظة مثل: بدون بصل، حار زيادة"}}, "required": ["dish_id"]}},
    {"type": "function", "name": "remove_from_order", "description": "شيل طبق من السلة أو نقّص كميته.",
     "parameters": {"type": "object", "properties": {"dish_id": {"type": "string"}, "qty": {"type": "integer", "description": "كم واحد تشيل؛ اتركها فاضية لتشيله كله"}}, "required": ["dish_id"]}},
    {"type": "function", "name": "show_order", "description": "افتح السلة على الشاشة وارجع بمحتواها والمجموع.",
     "parameters": {"type": "object", "properties": {}}},
    {"type": "function", "name": "place_order", "description": "أكّد الطلب بعد موافقة الزبون الصريحة.",
     "parameters": {"type": "object", "properties": {
         "name": {"type": "string"}, "phone": {"type": "string"},
         "method": {"type": "string", "enum": ["delivery", "pickup"]}, "address": {"type": "string"}},
         "required": ["name", "phone", "method"]}},
    {"type": "function", "name": "fill_reservation", "description": "عبّي نموذج الحجز على الشاشة. ابعث الحقول اللي بتعرفها بس.",
     "parameters": {"type": "object", "properties": {
         "name": {"type": "string"}, "phone": {"type": "string"},
         "date": {"type": "string", "description": "YYYY-MM-DD"}, "time": {"type": "string", "description": "HH:MM بنظام 24 ساعة"},
         "guests": {"type": "integer"}, "area": {"type": "string", "enum": ["indoor", "terrace", "private"]}, "note": {"type": "string"}}}},
    {"type": "function", "name": "confirm_reservation", "description": "أرسل الحجز بعد ما الزبون يأكد.",
     "parameters": {"type": "object", "properties": {}}},
    {"type": "function", "name": "end_call", "description": "سكّر المكالمة بعد الوداع.",
     "parameters": {"type": "object", "properties": {}}},
]


def _gemini_schema(sch: dict) -> dict:
    """OpenAI-style JSON schema -> Gemini Schema (uppercase types, supported keys only)."""
    out = {"type": sch.get("type", "string").upper()}
    for k in ("description", "enum", "minimum", "maximum"):
        if k in sch:
            out[k] = sch[k]
    if "properties" in sch:
        out["properties"] = {n: _gemini_schema(v) for n, v in sch["properties"].items()}
    if sch.get("required"):
        out["required"] = sch["required"]
    if "items" in sch:
        out["items"] = _gemini_schema(sch["items"])
    return out


def gemini_tools() -> list:
    decls = []
    for t in TOOLS:
        d = {"name": t["name"], "description": t["description"]}
        params = t.get("parameters") or {}
        if params.get("properties"):
            d["parameters"] = _gemini_schema(params)
        decls.append(d)
    return [{"functionDeclarations": decls}]


def vocabulary() -> list:
    """Words the recogniser should expect: restaurant name, host, dishes."""
    words = ["هستيريا", "هستي", "مطعم هستيريا", "دينار", "قرش", "توصيل", "استلام", "حجز", "طاولة"]
    words += [d["name"] for d in kb()["dishes"]]
    return list(dict.fromkeys(words))[:50]


def gemini_setup(page: dict, model: str, hints: bool = True) -> dict:
    transcription = {"languageCodes": GEMINI_LANG, "customVocabulary": vocabulary()} if hints else {}
    return {
        "model": f"models/{model}",
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": GEMINI_VOICE}}},
        },
        "systemInstruction": {"parts": [{"text": instructions(page)}]},
        "tools": gemini_tools(),
        "inputAudioTranscription": transcription,
        "outputAudioTranscription": {},
        "realtimeInputConfig": {"automaticActivityDetection": {"silenceDurationMs": 500, "prefixPaddingMs": 200}},
    }


async def mint_gemini(page: dict, hints: bool = True) -> dict:
    from datetime import timezone, timedelta
    now = datetime.now(timezone.utc)
    iso = lambda d: d.strftime("%Y-%m-%dT%H:%M:%SZ")
    last = ""
    for model in dict.fromkeys([GEMINI_MODEL, GEMINI_FALLBACK_MODEL]):
        token = {
            "uses": 1,
            "expireTime": iso(now + timedelta(minutes=MAX_CALL_MINUTES + 2)),
            "newSessionExpireTime": iso(now + timedelta(minutes=1)),
            "bidiGenerateContentSetup": gemini_setup(page, model, hints),
        }
        async with httpx.AsyncClient(timeout=20) as c:
            for attempt in range(3):
                body = token if attempt != 1 else {"authToken": token}   # REST takes fields at top level; older docs wrap them
                r = await c.post(f"{GEMINI_URL}/v1beta/auth_tokens",
                                 headers={"x-goog-api-key": gemini_key(), "Content-Type": "application/json"}, json=body)
                if r.status_code != 400:
                    break
                if attempt == 1 and hints:                              # language hint rejected -> plain transcription
                    print("[voice:gemini] transcription hints rejected, retrying without:", r.text[:200])
                    token["bidiGenerateContentSetup"] = gemini_setup(page, model, hints=False)
                    hints = False
        if r.status_code == 200 and r.json().get("name"):
            return {"provider": "gemini", "token": r.json()["name"], "ws_url": GEMINI_WS, "model": f"models/{model}", "hints": hints}
        last = f"{r.status_code}: {r.text[:300]}"
        print(f"[voice:gemini] {model} -> {last}")
        if r.status_code in (401, 403, 429):
            break
    if last.startswith(("401", "403")):
        raise HTTPException(502, "مفتاح Gemini غلط أو مش مفعّل للـ Live API")
    raise HTTPException(502, "ما قدرنا نشغّل المساعد هسّا (Gemini)")


def session_config(page: dict, model: str) -> dict:
    return {
        "type": "realtime",
        "model": model,
        "instructions": instructions(page),
        "tools": TOOLS,
        "tool_choice": "auto",
        "audio": {
            "input": {
                "transcription": {"model": "gpt-4o-mini-transcribe", "language": "ar",
                                  "prompt": "محادثة بالعربية، لهجة أردنية، عن طلب أكل وحجز طاولة في مطعم هستيريا. كلمات متوقعة: " + "، ".join(vocabulary())},
                "noise_reduction": {"type": "near_field"},
                "turn_detection": {"type": "semantic_vad", "eagerness": "high"},
            },
            "output": {"voice": VOICE},
        },
    }


app = FastAPI(title="Hysteria")
_hits: dict[str, list[float]] = {}
_retried: dict[str, float] = {}


_day = {"date": "", "count": 0}


def client_ip(request: Request) -> str:
    # behind Render/Cloudflare the real visitor is the first X-Forwarded-For entry
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() or (request.client.host if request.client else "x")


def daily_ok() -> bool:
    today = time.strftime("%Y-%m-%d")
    if _day["date"] != today:
        _day.update(date=today, count=0)
    if _day["count"] >= MAX_SESSIONS_PER_DAY:
        return False
    _day["count"] += 1
    return True


def allow(ip: str) -> bool:
    now = time.time()
    h = [t for t in _hits.get(ip, []) if now - t < 3600]
    if (h and now - h[-1] < 4) or len(h) >= 30:
        _hits[ip] = h
        return False
    h.append(now)
    _hits[ip] = h
    return True


@app.middleware("http")
async def headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers["Permissions-Policy"] = "microphone=(self), camera=(), geolocation=()"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    path = request.url.path
    if path == "/sw.js":
        resp.headers["Cache-Control"] = "no-cache"
        resp.headers["Service-Worker-Allowed"] = "/"
    elif path == "/" or path.endswith(".webmanifest"):
        resp.headers["Cache-Control"] = "no-cache"
    elif path.startswith(("/img/", "/brand/")):
        resp.headers["Cache-Control"] = "public, max-age=2592000, immutable"
    elif path.endswith((".js", ".css")):
        resp.headers["Cache-Control"] = "public, max-age=300"
    return resp


@app.get("/api/config")
def config():
    return {"voice": bool(key()), "provider": provider(), "code_required": bool(ACCESS_CODE), "max_minutes": MAX_CALL_MINUTES}


@app.post("/api/voice/session")
async def voice_session(request: Request):
    if not key():
        raise HTTPException(503, "المساعد الصوتي مش مفعّل: حط مفتاح Gemini أو OpenAI بملف .env (شغّل 3-change-key.bat)")
    try:
        page = await request.json()
    except Exception:
        page = {}
    if not isinstance(page, dict):
        page = {}
    if ACCESS_CODE and not secrets.compare_digest(str((page or {}).get("code", "")).strip(), ACCESS_CODE):
        raise HTTPException(403, "رمز الدخول غلط")
    ip = client_ip(request)
    # one immediate "plain" retry is allowed right after a session (Gemini refused the language hint)
    retry_ok = page.get("plain") is True and ip in _hits and time.time() - _hits[ip][-1] < 20 and _retried.get(ip) != _hits[ip][-1]
    if retry_ok:
        _retried[ip] = _hits[ip][-1]
    elif not allow(ip):
        raise HTTPException(429, "استنى ثواني وجرّب كمان مرة")
    if not retry_ok and not daily_ok():
        raise HTTPException(429, "خلصت مكالمات اليوم للعرض التجريبي، جرّب بكرا")
    plain = page.get("plain") is True
    page = {k: str(v)[:400] for k, v in page.items() if k in ("section", "cart")}
    if provider() == "gemini":
        return await mint_gemini(page, hints=not plain)
    last = ""
    for model in dict.fromkeys([MODEL, FALLBACK_MODEL]):
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(f"{OPENAI_URL}/realtime/client_secrets",
                             headers={"Authorization": f"Bearer {openai_key()}"},
                             json={"session": session_config(page, model)})
        if r.status_code == 200:
            d = r.json()
            value = d.get("value") or (d.get("client_secret") or {}).get("value")
            if value:
                return {"provider": "openai", "key": value, "calls_url": f"{OPENAI_URL}/realtime/calls", "model": model}
        last = f"{r.status_code}: {r.text[:300]}"
        print(f"[voice] {model} -> {last}")
        if r.status_code in (401, 429):
            break
    msg = "مفتاح OpenAI غلط أو منتهي" if last.startswith("401") else "ما قدرنا نشغّل المساعد هسّا"
    raise HTTPException(502, msg)


ORDERS, BOOKINGS = ROOT / "orders.jsonl", ROOT / "bookings.jsonl"


async def json_body(request: Request) -> dict:
    """Parse a JSON object body; anything else is a 400, never a 500."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "البيانات مش مفهومة")
    if not isinstance(body, dict):
        raise HTTPException(400, "البيانات مش مفهومة")
    return body


def text(v, n=200) -> str:
    return str(v if v is not None else "").strip()[:n]


def _save(path: Path, rec: dict, prefix: str) -> dict:
    rec["ref"] = f"{prefix}-{secrets.randbelow(90000) + 10000}"
    rec["at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    print(f"[{path.stem}] {rec['ref']} {rec.get('name','')} {rec.get('phone','')}")
    return {"ok": True, "ref": rec["ref"]}


@app.post("/api/order")
async def order(request: Request):
    body = await json_body(request)
    name, phone, method = text(body.get("name"), 80), text(body.get("phone"), 30), text(body.get("method"), 20) or "delivery"
    address = text(body.get("address"), 300)
    raw = body.get("items")
    if not name or not phone or not isinstance(raw, list) or not raw:
        raise HTTPException(400, "الطلب ناقص: الاسم والتلفون والأطباق")
    if method not in ("delivery", "pickup"):
        raise HTTPException(400, "طريقة الاستلام لازم تكون توصيل أو استلام")
    if method == "delivery" and not address:
        raise HTTPException(400, "للتوصيل لازم عنوان")
    prices = {d["id"]: d["price"] for d in kb()["dishes"]}
    items = []
    for it in raw[:40]:
        if not isinstance(it, dict) or it.get("id") not in prices:
            continue
        try:
            qty = int(it.get("qty", 1))
        except (TypeError, ValueError):
            qty = 1
        items.append({"id": it["id"], "qty": min(max(qty, 1), 50), "note": text(it.get("note"), 120)})
    if not items:
        raise HTTPException(400, "ولا طبق من الطلب موجود بالقائمة")
    total = round(sum(prices[i["id"]] * i["qty"] for i in items), 2)
    fee = 1.5 if method == "delivery" and total < 25 else 0
    return _save(ORDERS, {"name": name, "phone": phone, "method": method, "address": address,
                          "items": items, "subtotal": total, "delivery_fee": fee, "total": round(total + fee, 2)}, "H")


@app.post("/api/booking")
async def booking(request: Request):
    body = await json_body(request)
    rec = {k: text(body.get(k), 300 if k == "note" else 80) for k in ("name", "phone", "date", "time", "area", "note")}
    if not all(rec[k] for k in ("name", "phone", "date", "time")):
        raise HTTPException(400, "الحجز ناقص: الاسم والتلفون والتاريخ والوقت")
    try:
        day = datetime.strptime(rec["date"], "%Y-%m-%d").date()
        datetime.strptime(rec["time"], "%H:%M")
    except ValueError:
        raise HTTPException(400, "التاريخ أو الوقت مش مضبوط")
    if day < date.today():
        raise HTTPException(400, "التاريخ فات")
    try:
        guests = int(body.get("guests", 2))
    except (TypeError, ValueError):
        guests = 0
    if not 1 <= guests <= 40:
        raise HTTPException(400, "عدد الأشخاص لازم يكون بين 1 و40")
    rec["guests"] = guests
    if rec["area"] not in ("indoor", "terrace", "private"):
        rec["area"] = "indoor"
    return _save(BOOKINGS, rec, "B")


@app.get("/")
def index(request: Request):
    # absolute URL for the WhatsApp / social link preview image
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host", request.headers.get("host", f"localhost:{PORT}"))
    html = (WEB / "index.html").read_text(encoding="utf-8").replace("%%ORIGIN%%", f"{proto}://{host}")
    return HTMLResponse(html)


app.mount("/", StaticFiles(directory=WEB), name="web")


if __name__ == "__main__":
    import uvicorn
    print(f"\n  مطعم هستيريا شغّال:  http://localhost:{PORT}\n  المساعد الصوتي: {('مفعّل · ' + provider()) if key() else 'مش مفعّل (ما في مفتاح)'}{' · محمي برمز' if ACCESS_CODE else ''}\n")
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="warning")
