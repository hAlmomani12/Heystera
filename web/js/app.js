/* مطعم هستيريا — the site: menu, cart, booking, and the screen effects the voice agent drives (window.H). */
(() => {
const D = window.HYSTERIA, R = D.restaurant;
const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const dish = id => D.dishes.find(d => d.id === id);
const catName = id => (D.categories.find(c => c.id === id) || {}).name || id;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = n => (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const store = (k, v) => { try { v === undefined ? (v = JSON.parse(localStorage.getItem(k))) : localStorage.setItem(k, JSON.stringify(v)); } catch { v = v ?? null; } return v; };

/* Price as a Jordanian says it: 9.5 -> "9 دنانير ونص", 0.75 -> "75 قرش" */
function spoken(jd) {
  const d = Math.floor(jd + 1e-9), q = Math.round((jd - d) * 100);
  const dn = d === 0 ? "" : d === 1 ? "دينار" : d === 2 ? "دينارين" : `${d} ${d <= 10 ? "دنانير" : "دينار"}`;
  const qn = q === 0 ? "" : q === 50 ? "ونص" : q === 25 ? "وربع" : q === 75 && d ? "وثلاث تربع" : `${d ? "و" : ""}${q} قرش`;
  return (dn && qn ? `${dn} ${qn}` : dn || qn.replace(/^و/, "")) || "ببلاش";
}

/* ---------------- static content ---------------- */
$("#addr").textContent = R.address; $("#addrFoot").textContent = R.address.split("(")[0].trim();
$("#phone").textContent = R.phone;
$("#hoursLine").textContent = R.hours.map(h => `${h.days}: ${h.open} – ${h.close}`).join(" · ");
$("#hoursFoot").innerHTML = R.hours.map(h => `<li><span>${esc(h.days)}</span><span>${h.open} – ${h.close}</span></li>`).join("");
const names = D.dishes.filter(d => d.img).map(d => d.name);
$("#marquee").innerHTML = [0, 1].map(() => `<span>${names.map(n => `${esc(n)} <b>✦</b>`).join(" ")}</span>`).join("");

function openState(now = new Date()) {
  const day = now.getDay(); // 4 Thu, 5 Fri
  const h = R.hours[(day === 4 || day === 5) ? 1 : 0];
  const mins = now.getHours() * 60 + now.getMinutes(), [oh, om] = h.open.split(":").map(Number), [ch, cm] = h.close.split(":").map(Number);
  const o = oh * 60 + om, c = ch * 60 + cm + (ch < oh ? 1440 : 0);
  const prev = R.hours[(day === 5 || day === 6) ? 1 : 0], [pch, pcm] = prev.close.split(":").map(Number);
  const open = (mins >= o && mins < c) || (pch < 12 && mins < pch * 60 + pcm);
  return { open, today: h };
}
const os = openState();
$("#openNow").textContent = os.open ? `مفتوحين هسّا لحد ${os.today.close} · عمّان` : `مسكّرين هسّا · بنفتح ${os.today.open} الظهر`;
if (!os.open) $(".eyebrow i").style.cssText = "background:#ffb547;box-shadow:0 0 12px 2px rgba(255,181,71,.6)";

/* images fade in when loaded (hero has a fiery fallback) */
/* prefer the local copy (web/img/<name>.png, saved by 1-install.bat) and fall back to the online one */
const localOf = src => src && /^https?:/.test(src) ? "img/" + src.split("/").pop() : src;
const loadImg = (img, src) => {
  img.onload = () => img.classList.add("ready");
  img.onerror = () => { if (img.dataset.remote !== "1" && src) { img.dataset.remote = "1"; img.src = src; } else img.classList.remove("ready"); };
  img.src = localOf(src);
};
loadImg($("#heroImg"), R.media.hero);
loadImg($("#sigImg"), dish("platter").img);

/* ---------------- menu ---------------- */
const cart = new Map((store("hys-cart") || []).filter(([id]) => dish(id)));
let method = "delivery", lastOrder = null;
let currentCat = "grill";
const tabs = $("#tabs");
tabs.innerHTML = D.categories.map(c => `<button class="tab" role="tab" id="t-${c.id}" data-cat="${c.id}" aria-selected="${c.id === currentCat}">${esc(c.name)}</button>`).join("");
tabs.addEventListener("click", e => { const b = e.target.closest(".tab"); if (b) showCategory(b.dataset.cat); });
tabs.addEventListener("keydown", e => {
  const all = $$(".tab", tabs), i = all.findIndex(t => t.dataset.cat === currentCat);
  const d = e.key === "ArrowLeft" ? 1 : e.key === "ArrowRight" ? -1 : 0; if (!d) return;
  const n = all[(i + d + all.length) % all.length]; showCategory(n.dataset.cat); n.focus();
});

const addCtl = d => {
  const q = cart.get(d.id)?.qty || 0;
  return q ? `<div class="stepper" data-step="${d.id}"><button data-dec aria-label="نقّص">−</button><span>${q}</span><button data-inc aria-label="زيد">+</button></div>`
           : `<button class="add" data-add="${d.id}" aria-label="أضف ${esc(d.name)} للطلب"><span>أضف</span><i>+</i></button>`;
};
const tagHtml = d => (d.tags || []).map(t => `<span class="tag ${t === "حار" ? "hot" : ""}">${esc(t)}</span>`).join("");
const cardHtml = (d, i = 0) => `<article class="dish" data-dish="${d.id}" style="--i:${i * .06}s">
  <div class="ph"><div class="tags">${tagHtml(d)}</div><img alt="${esc(d.name)}" loading="lazy" data-src="${d.img}"></div>
  <div class="body"><h3>${esc(d.name)}</h3><p>${esc(d.desc)}</p>
  <div class="foot"><span class="price">${fmt(d.price)}<small>دينار</small></span><span class="ctl">${addCtl(d)}</span></div></div></article>`;
const rowHtml = (d, i = 0) => `<div class="row" data-dish="${d.id}" style="--i:${i * .05}s"><div class="t"><h3>${esc(d.name)}</h3><p>${esc(d.desc)}</p></div>
  <span class="price">${fmt(d.price)}<small>دينار</small></span><span class="ctl">${addCtl(d)}</span></div>`;

function showCategory(cat, { flash = false } = {}) {
  if (!D.categories.some(c => c.id === cat)) return false;
  currentCat = cat;
  $$(".tab", tabs).forEach(t => { const on = t.dataset.cat === cat; t.setAttribute("aria-selected", on); t.tabIndex = on ? 0 : -1; if (on && flash) { t.classList.remove("flash"); void t.offsetWidth; t.classList.add("flash"); t.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); } });
  const list = D.dishes.filter(d => d.category === cat);
  const grid = $("#grid"); grid.classList.remove("dimmed");
  grid.innerHTML = list.every(d => !d.img) ? `<div class="rows">${list.map(rowHtml).join("")}</div>` : list.map(cardHtml).join("");
  $$("img[data-src]", grid).forEach(img => loadImg(img, img.dataset.src));
  return true;
}
showCategory(currentCat);

const sideDish = dish("zarb");
$("#sigSide").innerHTML = cardHtml(sideDish).replace('class="dish"', 'class="dish reveal"');
$$("#sigSide img[data-src]").forEach(img => loadImg(img, img.dataset.src));

/* ---------------- cart ---------------- */
const subtotal = () => [...cart.values()].reduce((s, l) => s + dish(l.id).price * l.qty, 0);
const fee = () => method === "delivery" && cart.size && subtotal() < 25 ? 1.5 : 0;
const count = () => [...cart.values()].reduce((s, l) => s + l.qty, 0);

function syncCart(bump) {
  store("hys-cart", [...cart.entries()]);
  const b = $("#cartCount"); b.textContent = count(); b.classList.toggle("on", count() > 0);
  if (bump) { const btn = $("#cartBtn"); btn.classList.remove("bump"); void btn.offsetWidth; btn.classList.add("bump"); }
  $$("[data-dish]").forEach(el => { const d = dish(el.dataset.dish), c = $(".ctl", el); if (d && c) c.innerHTML = addCtl(d); });
  renderCart();
}
function add(id, qty = 1, note = "", from) {
  const d = dish(id); if (!d) return null;
  const l = cart.get(id) || { id, qty: 0, note: "" };
  l.qty = Math.min(50, l.qty + Math.max(1, qty | 0)); if (note) l.note = String(note).slice(0, 120);
  cart.set(id, l); lastOrder = null;
  fly(from || document.querySelector(`[data-dish="${id}"] img, [data-dish="${id}"]`), d);
  syncCart(true);
  return l;
}
function remove(id, qty) {
  const l = cart.get(id); if (!l) return null;
  l.qty = qty ? l.qty - qty : 0;
  l.qty > 0 ? cart.set(id, l) : cart.delete(id);
  syncCart(); return l.qty > 0 ? l : { id, qty: 0 };
}
document.addEventListener("click", e => {
  const a = e.target.closest("[data-add]"); if (a) { add(a.dataset.add, 1, "", a.closest("[data-dish]")?.querySelector("img") || a); toast(`${dish(a.dataset.add).name} انضاف للطلب`); return; }
  const s = e.target.closest("[data-step]");
  if (s && e.target.closest("[data-inc]")) add(s.dataset.step, 1, "", s);
  else if (s && e.target.closest("[data-dec]")) remove(s.dataset.step, 1);
});

function fly(fromEl, d) {
  if (reduce || !fromEl || !d) return;
  const r = fromEl.getBoundingClientRect(), t = $("#cartBtn").getBoundingClientRect();
  if (!r.width || r.bottom < 0 || r.top > innerHeight) return;
  const el = document.createElement(d.img ? "img" : "div"); el.className = "fly";
  if (d.img) el.src = fromEl.currentSrc || fromEl.src || d.img; else el.style.background = "var(--chili)";
  const sx = r.left + r.width / 2 - 35, sy = r.top + r.height / 2 - 35, ex = t.left + t.width / 2 - 35, ey = t.top + t.height / 2 - 35;
  el.style.left = sx + "px"; el.style.top = sy + "px"; document.body.append(el);
  el.animate([{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: `translate(${(ex - sx) / 2}px,${ey - sy - 120}px) scale(.9)`, opacity: 1, offset: .5 },
    { transform: `translate(${ex - sx}px,${ey - sy}px) scale(.25)`, opacity: .3 }], { duration: 850, easing: "cubic-bezier(.5,0,.3,1)" }).onfinish = () => el.remove();
}

const cartEl = $("#cart"), scrim = $("#scrim");
function openCart(on = true) { document.body.classList.toggle("cart-open", on); cartEl.classList.toggle("on", on); scrim.classList.toggle("on", on); cartEl.setAttribute("aria-hidden", !on); if (on) renderCart(); }
$("#cartBtn").onclick = () => openCart(true); $("#cartClose").onclick = () => openCart(false); scrim.onclick = () => openCart(false);
addEventListener("keydown", e => { if (e.key === "Escape") { openCart(false); closeModal(); } });

function renderCart() {
  const items = $("#cartItems"), foot = $("#cartFoot");
  if (lastOrder) {
    items.innerHTML = `<div class="done"><div class="big">انطلب! 🔥</div><p>رقم طلبك <b class="ltr">${esc(lastOrder.ref)}</b><br>${lastOrder.method === "delivery" ? "الطلب بيوصلك خلال 45 دقيقة تقريباً." : "جاهز للاستلام خلال 25 دقيقة."}</p></div>`;
    foot.innerHTML = `<button class="btn btn-ghost glass" id="newOrder">طلب جديد <span class="chip">+</span></button>`;
    $("#newOrder").onclick = () => { lastOrder = null; renderCart(); }; return;
  }
  if (!cart.size) {
    items.innerHTML = `<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M5 7h14l-1.3 10.4A2 2 0 0 1 15.7 19H8.3a2 2 0 0 1-2-1.6L5 7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>السلة فاضية.<br>جرّب كباب هستيريا، أو قول لهستي شو نفسك.</div>`;
    foot.innerHTML = ""; return;
  }
  items.innerHTML = [...cart.values()].map(l => { const d = dish(l.id); return `<div class="ci" data-ci="${d.id}">${d.img ? `<img src="${localOf(d.img)}" alt="" onerror="if(!this.dataset.r){this.dataset.r=1;this.src='${d.img}'}else this.dataset.broken=1">` : `<span class="noimg"></span>`}
    <div class="t"><b>${esc(d.name)}</b><small>${fmt(d.price * l.qty)} دينار${l.note ? " · " + esc(l.note) : ""}</small></div>
    <div class="stepper" data-step="${d.id}"><button data-dec aria-label="نقّص">−</button><span>${l.qty}</span><button data-inc aria-label="زيد">+</button></div></div>`; }).join("");
  const f = fee(), total = subtotal() + f, saved = store("hys-me") || {};
  foot.innerHTML = `<div class="seg" role="group" aria-label="طريقة الاستلام"><button data-m="delivery" aria-pressed="${method === "delivery"}">توصيل</button><button data-m="pickup" aria-pressed="${method === "pickup"}">استلام من المطعم</button></div>
    <div class="sum"><span>المجموع</span><span>${fmt(subtotal())} دينار</span></div>
    <div class="sum"><span>التوصيل</span><span>${method === "pickup" ? "—" : f ? fmt(f) + " دينار" : "مجاني"}</span></div>
    <div class="sum total"><span>الإجمالي</span><b>${fmt(total)}<small style="font:500 13px var(--body);color:var(--ink-40)"> دينار</small></b></div>
    <form class="form" id="orderForm" novalidate>
      <div class="field"><label for="o-name">الاسم</label><input id="o-name" required value="${esc(saved.name || "")}" autocomplete="name"></div>
      <div class="field"><label for="o-phone">التلفون</label><input id="o-phone" type="tel" required dir="ltr" style="text-align:right" value="${esc(saved.phone || "")}" autocomplete="tel"></div>
      ${method === "delivery" ? `<div class="field full"><label for="o-addr">العنوان</label><input id="o-addr" required placeholder="المنطقة، الشارع، رقم البناية" value="${esc(saved.address || "")}" autocomplete="street-address"></div>` : ""}
      <button class="btn btn-hot" type="submit">أكّد الطلب · ${fmt(total)} دينار <span class="chip"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M13 8H3M7 4L3 8l4 4"/></svg></span></button>
    </form>`;
  $$("[data-m]", foot).forEach(b => b.onclick = () => { setMethod(b.dataset.m); });
  $("#orderForm").onsubmit = e => { e.preventDefault(); submitOrder(); };
}
function setMethod(m) { if (m !== "delivery" && m !== "pickup") return; keepForm(); method = m; renderCart(); }
function keepForm() { const v = id => $("#" + id)?.value; const me = store("hys-me") || {}; store("hys-me", { name: v("o-name") ?? me.name, phone: v("o-phone") ?? me.phone, address: v("o-addr") ?? me.address }); }

async function post(url, body) {
  if (location.protocol === "file:") throw new Error("offline");
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.status);
  return r.json();
}
async function submitOrder(fields = {}) {
  if (!cart.size) return { ok: false, error: "السلة فاضية" };
  if (fields.method) setMethod(fields.method);
  const f = { name: $("#o-name"), phone: $("#o-phone"), address: $("#o-addr") };
  for (const [k, el] of Object.entries(f)) if (el && fields[k]) await typeInto(el, fields[k]);
  const missing = Object.entries(f).filter(([, el]) => el && !el.value.trim()).map(([k]) => k);
  if (missing.length) { missing.forEach(k => flagBad(f[k])); f[missing[0]].focus(); return { ok: false, missing }; }
  keepForm();
  const body = { name: f.name.value, phone: f.phone.value, address: f.address?.value || "", method, items: [...cart.values()] };
  const total = subtotal() + fee();
  let ref; try { ref = (await post("/api/order", body)).ref; } catch { ref = "H-" + String(Date.now()).slice(-5); }
  lastOrder = { ref, method, total }; cart.clear(); syncCart(); burst();
  return { ok: true, ref, total, eta_minutes: method === "delivery" ? 45 : 25 };
}

/* ---------------- booking ---------------- */
const bf = $("#bookForm"), bdate = $("#b-date");
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
bdate.min = today();
bf.addEventListener("submit", e => { e.preventDefault(); confirmBooking(); });
async function fillBooking(v = {}) {
  goTo("reserve");
  await sleep(500);
  const map = { name: "b-name", phone: "b-phone", date: "b-date", time: "b-time", guests: "b-guests", area: "b-area", note: "b-note" };
  const done = [];
  for (const [k, id] of Object.entries(map)) if (v[k] !== undefined && v[k] !== null && v[k] !== "") { await typeInto($("#" + id), String(v[k])); done.push(k); }
  return { filled: done, form: readBooking() };
}
const readBooking = () => Object.fromEntries(new FormData(bf));
async function confirmBooking() {
  const req = ["b-name", "b-phone", "b-date", "b-time"].map(id => $("#" + id)).filter(el => !el.value.trim());
  if (req.length) { req.forEach(flagBad); req[0].focus(); return { ok: false, missing: req.map(el => el.name) }; }
  if ($("#b-date").value < today()) { flagBad($("#b-date")); return { ok: false, error: "التاريخ فات" }; }
  const v = readBooking(); let ref;
  try { ref = (await post("/api/booking", v)).ref; } catch { ref = "B-" + String(Date.now()).slice(-5); }
  const area = $("#b-area").selectedOptions[0].text;
  const ok = $("#bookOk"); ok.textContent = `تم يا ${v.name}! حجزك رقم ${ref}: ${v.guests} أشخاص يوم ${v.date} الساعة ${v.time} (${area}). رح نتصل فيك على ${v.phone} للتأكيد.`;
  ok.classList.add("show"); burst();
  return { ok: true, ref, ...v };
}

/* ---------------- effects the agent drives ---------------- */
async function typeInto(el, value) {
  if (!el) return;
  const field = el.closest(".field"); field?.classList.add("typing");
  el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  if (el.tagName === "SELECT" || el.type === "date" || el.type === "time" || el.type === "number" || reduce) {
    await sleep(250); el.value = value; el.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    el.value = "";
    for (const ch of value) { el.value += ch; await sleep(34); }
  }
  await sleep(280); field?.classList.remove("typing");
}
function flagBad(el) { const f = el.closest(".field"); f?.classList.add("bad"); setTimeout(() => f?.classList.remove("bad"), 2200); }

const SECTIONS = { home: "#home", menu: "#menu", signature: "#signature", story: "#story", reserve: "#reserve", location: "#location" };
function goTo(sec) {
  const el = $(SECTIONS[sec] || SECTIONS.home); if (!el) return false;
  openCart(false);
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: sec === "location" ? "center" : "start" });
  return true;
}
let spotTimer;
async function spotlight(id) {
  const d = dish(id); if (!d) return false;
  openCart(false);
  let el = id === "platter" ? $("#sigMain") : id === "zarb" ? $("#sigSide .dish") : null;
  if (!el) { if (currentCat !== d.category) showCategory(d.category, { flash: true }); goTo("menu"); await sleep(380); el = $(`#grid [data-dish="${id}"]`); }
  if (!el) return false;
  clearSpot();
  el.classList.add("spot"); el.closest(".grid")?.classList.add("dimmed");
  const chip = document.createElement("span"); chip.className = "spot-chip"; chip.innerHTML = "<i></i>هستي بيفرجيك"; el.append(chip);
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  spotTimer = setTimeout(clearSpot, 6500);
  return true;
}
function clearSpot() { clearTimeout(spotTimer); $$(".spot").forEach(e => e.classList.remove("spot")); $$(".spot-chip").forEach(e => e.remove()); $$(".dimmed").forEach(e => e.classList.remove("dimmed")); }
async function spotlightMany(ids) {
  if (!ids.length) return;
  const cat = dish(ids[0]).category;
  if (!["platter", "zarb"].includes(ids[0])) { showCategory(cat, { flash: true }); goTo("menu"); await sleep(400); }
  clearSpot();
  const els = ids.map(id => $(`#grid [data-dish="${id}"]`)).filter(Boolean);
  if (!els.length) return spotlight(ids[0]);
  els.forEach(el => el.classList.add("spot")); $("#grid").classList.add("dimmed");
  els[0].scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  spotTimer = setTimeout(clearSpot, 7000);
}

let toastT; function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("on"), 2400); }

const modal = $("#modal");
function showModal(html) { $("#modalBox").innerHTML = html; modal.classList.add("on"); $("#modalBox [data-close]")?.addEventListener("click", closeModal); }
function closeModal() { modal.classList.remove("on"); }
modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });

/* ember burst on success */
function burst() {
  if (reduce) return;
  const c = $("#burst"), x = c.getContext("2d"); c.width = innerWidth; c.height = innerHeight;
  const P = Array.from({ length: 90 }, () => ({ x: innerWidth / 2, y: innerHeight * .55, vx: (Math.random() - .5) * 14, vy: -Math.random() * 14 - 4, r: 2 + Math.random() * 4, l: 1, h: 20 + Math.random() * 30 }));
  (function f() { x.clearRect(0, 0, c.width, c.height); let alive = 0;
    for (const p of P) { p.vy += .35; p.x += p.vx; p.y += p.vy; p.l -= .012; if (p.l <= 0) continue; alive++;
      x.fillStyle = `hsla(${p.h},100%,60%,${p.l})`; x.beginPath(); x.arc(p.x, p.y, p.r, 0, 6.28); x.fill(); }
    if (alive) requestAnimationFrame(f); else x.clearRect(0, 0, c.width, c.height); })();
}

/* ---------------- hero sparks ---------------- */
(function sparks() {
  const cv = $("#sparks"), ctx = cv.getContext("2d"); let W, H, vis = true;
  const size = () => { const d = Math.min(devicePixelRatio, 2); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
  size(); addEventListener("resize", size);
  new IntersectionObserver(([e]) => vis = e.isIntersecting).observe(cv);
  const N = innerWidth < 720 ? 40 : 85, P = [];
  const spawn = (p, init) => Object.assign(p, { x: W * (.05 + Math.random() * .55), y: init ? Math.random() * H : H * (.6 + Math.random() * .4), vy: .5 + Math.random() * 1.3, vx: (Math.random() - .3) * .5, r: .6 + Math.random() * 1.8, life: 0, max: 160 + Math.random() * 260, ph: Math.random() * 6.3 });
  for (let i = 0; i < N; i++) P.push(spawn({}, true));
  let mx = -1e4, my = -1e4; addEventListener("pointermove", e => { mx = e.clientX; my = e.clientY; });
  (function f(t) {
    if (vis) { ctx.clearRect(0, 0, W, H); ctx.globalCompositeOperation = "lighter";
      for (const p of P) { p.life++; p.y -= p.vy; p.x += p.vx + Math.sin(t / 700 + p.ph) * .4;
        const dx = p.x - mx, dy = p.y - my; if (dx * dx + dy * dy < 14000) { p.x += dx * .02; p.y += dy * .01; }
        const k = 1 - p.life / p.max; if (k <= 0 || p.y < -10) { spawn(p); continue; }
        const a = k * Math.min(1, p.life / 25) * (.6 + .4 * Math.sin(t / 90 + p.ph));
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        g.addColorStop(0, `rgba(255,225,160,${a})`); g.addColorStop(.35, `rgba(255,120,40,${a * .6})`); g.addColorStop(1, "rgba(255,60,10,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 4, 0, 6.283); ctx.fill(); }
      ctx.globalCompositeOperation = "source-over"; }
    if (!reduce) requestAnimationFrame(f);
  })(0);
})();

/* ---------------- reveals, counters, nav ---------------- */
const io = new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) return; e.target.classList.add("in"); io.unobserve(e.target);
  $$("[data-count]", e.target).forEach(el => { const to = +el.dataset.count, sup = el.querySelector("sup").outerHTML, st = performance.now();
    const step = n => { const k = Math.min(1, (n - st) / 1300); el.innerHTML = Math.round(to * (1 - Math.pow(1 - k, 3))) + sup; if (k < 1) requestAnimationFrame(step); };
    reduce ? el.innerHTML = to + sup : requestAnimationFrame(step); });
}), { threshold: .12 });
$$(".reveal").forEach(el => io.observe(el));
const nav = $(".nav");
const secIO = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { H.section = e.target.id; $$(".links a").forEach(a => a.classList.toggle("on", a.dataset.sec === e.target.id)); } }), { rootMargin: "-45% 0px -50% 0px" });
$$("main section").forEach(s => secIO.observe(s));
addEventListener("scroll", () => nav.classList.toggle("scrolled", scrollY > innerHeight * .5), { passive: true });

syncCart();

/* ---------------- public API for the voice agent ---------------- */
const cartSummary = () => ({
  items: [...cart.values()].map(l => ({ id: l.id, name: dish(l.id).name, qty: l.qty, note: l.note || undefined, line_total: dish(l.id).price * l.qty })),
  subtotal: subtotal(), delivery_fee: fee(), total: subtotal() + fee(), method,
  spoken_total: spoken(subtotal() + fee()),
});
const H = window.H = {
  data: D, dish, catName, spoken, fmt, sleep, toast, showModal, closeModal, section: "home",
  goTo, showCategory: c => { const ok = showCategory(c, { flash: true }); if (ok) goTo("menu"); return ok; },
  spotlight, spotlightMany, clearSpot, add, remove, openCart, setMethod, submitOrder,
  fillBooking, confirmBooking, readBooking, cartSummary, openState,
  cartText: () => cart.size ? [...cart.values()].map(l => `${l.qty}× ${dish(l.id).name}`).join("، ") : "فاضية",
};
})();
