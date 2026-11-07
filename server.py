"""مطعم هستيريا — سيرفر الموقع + المساعد الصوتي.

السيرفر يخدم صفحات الموقع، ويعطي المتصفح مفتاحاً مؤقتاً (دقائق قليلة) ليتحدث مع
OpenAI Realtime مباشرة عبر WebRTC. مفتاحك الحقيقي لا يغادر هذا الجهاز أبداً.

التشغيل:  python server.py   ثم افتح  http://localhost:8000
"""
import json
import os
import secrets
import time
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

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


def key() -> str:
    return os.environ.get("OPENAI_API_KEY", "").strip()


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
                                  "prompt": "محادثة بالعربية، لهجة أردنية، عن طلب أكل وحجز طاولة في مطعم."},
                "noise_reduction": {"type": "near_field"},
                "turn_detection": {"type": "semantic_vad", "eagerness": "high"},
            },
            "output": {"voice": VOICE},
        },
    }


app = FastAPI(title="Hysteria")
_hits: dict[str, list[float]] = {}


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
    if path.startswith(("/img/", "/brand/")):
        resp.headers["Cache-Control"] = "public, max-age=2592000, immutable"
    elif path.endswith((".js", ".css")):
        resp.headers["Cache-Control"] = "public, max-age=300"
    return resp


@app.get("/api/config")
def config():
    return {"voice": bool(key()), "code_required": bool(ACCESS_CODE), "max_minutes": MAX_CALL_MINUTES}


@app.post("/api/voice/session")
async def voice_session(request: Request):
    if not key():
        raise HTTPException(503, "المساعد الصوتي مش مفعّل: حط مفتاح OpenAI بملف .env (شغّل 3-change-key.bat)")
    try:
        page = await request.json()
    except Exception:
        page = {}
    if ACCESS_CODE and not secrets.compare_digest(str((page or {}).get("code", "")).strip(), ACCESS_CODE):
        raise HTTPException(403, "رمز الدخول غلط")
    if not allow(client_ip(request)):
        raise HTTPException(429, "استنى ثواني وجرّب كمان مرة")
    if not daily_ok():
        raise HTTPException(429, "خلصت مكالمات اليوم للعرض التجريبي، جرّب بكرا")
    page = {k: str(v)[:400] for k, v in (page or {}).items() if k in ("section", "cart")}
    last = ""
    for model in dict.fromkeys([MODEL, FALLBACK_MODEL]):
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(f"{OPENAI_URL}/realtime/client_secrets",
                             headers={"Authorization": f"Bearer {key()}"},
                             json={"session": session_config(page, model)})
        if r.status_code == 200:
            d = r.json()
            value = d.get("value") or (d.get("client_secret") or {}).get("value")
            if value:
                return {"key": value, "calls_url": f"{OPENAI_URL}/realtime/calls", "model": model}
        last = f"{r.status_code}: {r.text[:300]}"
        print(f"[voice] {model} -> {last}")
        if r.status_code in (401, 429):
            break
    msg = "مفتاح OpenAI غلط أو منتهي" if last.startswith("401") else "ما قدرنا نشغّل المساعد هسّا"
    raise HTTPException(502, msg)


ORDERS, BOOKINGS = ROOT / "orders.jsonl", ROOT / "bookings.jsonl"


def _save(path: Path, rec: dict, prefix: str) -> dict:
    rec = {k: (str(v)[:300] if not isinstance(v, (list, dict, int, float)) else v) for k, v in rec.items()}
    rec["ref"] = f"{prefix}-{secrets.randbelow(90000) + 10000}"
    rec["at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    print(f"[{path.stem}] {rec['ref']} {rec.get('name','')} {rec.get('phone','')}")
    return {"ok": True, "ref": rec["ref"]}


@app.post("/api/order")
async def order(request: Request):
    body = await request.json()
    if not body.get("items") or not body.get("name") or not body.get("phone"):
        raise HTTPException(400, "الطلب ناقص")
    prices = {d["id"]: d["price"] for d in kb()["dishes"]}
    items = [{"id": i["id"], "qty": max(1, int(i.get("qty", 1))), "note": str(i.get("note", ""))[:120]}
             for i in body["items"] if i.get("id") in prices][:40]
    total = round(sum(prices[i["id"]] * i["qty"] for i in items), 2)
    return _save(ORDERS, {**{k: body.get(k, "") for k in ("name", "phone", "method", "address")}, "items": items, "total": total}, "H")


@app.post("/api/booking")
async def booking(request: Request):
    body = await request.json()
    if not all(body.get(k) for k in ("name", "phone", "date", "time")):
        raise HTTPException(400, "الحجز ناقص")
    return _save(BOOKINGS, {k: body.get(k, "") for k in ("name", "phone", "date", "time", "guests", "area", "note")}, "B")


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
    print(f"\n  مطعم هستيريا شغّال:  http://localhost:{PORT}\n  المساعد الصوتي: {'مفعّل' if key() else 'مش مفعّل (ما في مفتاح)'}{' · محمي برمز' if ACCESS_CODE else ''}\n")
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="warning")
