/* هستي — the voice agent. Browser <-> Gemini Live (WebSocket) or OpenAI Realtime (WebRTC).
   The server only mints a short-lived key (/api/voice/session); the real key never reaches the browser.
   Every tool the model calls drives the real site through window.H, so the screen follows the conversation. */
(() => {
const H = window.H, $ = s => document.querySelector(s);
const dock = $("#dock"), log = $("#vLog"), stateEl = $("#vState"), subEl = $("#vSub"), toolEl = $("#vTool");
let available = null, live = false, demo = false, pc, dc, mic, audioEl, botAnalyser, micAnalyser, ending = false, muted = false;
let botBubble = null, busy = false, cfg = {}, callTimer, ac = null;
/* Gemini Live state */
let ws = null, userBubble = null, playHead = 0, sources = new Set(), outGain = null, micNode = null, micSink = null;
const codeKey = "hys-code";
const getCode = () => { try { return localStorage.getItem(codeKey) || ""; } catch { return ""; } };
const setCode = v => { try { v ? localStorage.setItem(codeKey, v) : localStorage.removeItem(codeKey); } catch {} };
let memCode = "";

/* ---------------- availability ---------------- */
async function checkAvailable() {
  if (location.protocol === "file:") return (available = false);
  try { const r = await fetch("/api/config", { cache: "no-store" }); cfg = r.ok ? await r.json() : {}; available = cfg.voice === true; }
  catch { available = false; }
  return available;
}
checkAvailable();

document.addEventListener("click", e => { if (e.target.closest("[data-voice]")) { e.preventDefault(); toggle(); } });
$("#vEnd").onclick = () => end("سكّرت المكالمة");
$("#vMute").onclick = () => { muted = !muted; mic?.getAudioTracks().forEach(t => t.enabled = !muted); $("#vMute").setAttribute("aria-pressed", muted); setState(muted ? "المايك مكتوم" : "بسمعك…", muted ? "اكبس على المايك لترجع تحكي" : "احكي براحتك"); };

async function toggle() {
  if (live || demo) return dock.scrollIntoView({ block: "end" });
  if (available === null) await checkAvailable();
  if (available) return cfg.code_required && !(memCode || getCode()) ? askCode() : start();
  const local = location.protocol === "file:";
  H.showModal(`<h3 id="mTitle">هستي بحاجة للسيرفر</h3>
    <p>${local ? "فتحت الموقع كملف، والمكالمة الصوتية بتحتاج السيرفر الصغير اللي معه." : "السيرفر شغّال بس ما في مفتاح OpenAI، أو الصفحة مفتوحة بمكان ما بيسمح بالمايك."}</p>
    <ol><li>شغّل <code>1-install.bat</code> مرة وحدة.</li><li>حط مفتاحك بـ <code>3-change-key.bat</code>.</li><li>شغّل <code>2-start.bat</code> وافتح <code>http://localhost:8000</code>.</li></ol>
    <p>وبهالوقت بتقدر تشوف الحركات بجولة تجريبية بدون صوت:</p>
    <div class="ctas"><button class="btn btn-hot" id="demoBtn">شغّل الجولة التجريبية <span class="chip">▶</span></button><button class="btn btn-ghost" data-close>مش هسّا</button></div>`);
  $("#demoBtn").onclick = () => { H.closeModal(); runDemo(); };
}

function askCode(wrong = false) {
  H.showModal(`<h3 id="mTitle">رمز الدخول</h3>
    <p>${wrong ? "الرمز غلط، جرّب كمان مرة." : "هاي نسخة تجريبية. اكتب الرمز اللي وصلك عشان تحكي مع هستي."}</p>
    <form id="codeForm" style="display:grid;gap:12px"><div class="field"><input id="codeIn" autocomplete="off" inputmode="text" placeholder="الرمز" aria-label="رمز الدخول" required></div>
    <div class="ctas"><button class="btn btn-hot" type="submit">يلا نحكي <span class="chip">▶</span></button><button class="btn btn-ghost" type="button" id="codeDemo">الجولة التجريبية</button></div></form>`);
  setTimeout(() => document.getElementById("codeIn")?.focus(), 100);
  document.getElementById("codeForm").onsubmit = e => { e.preventDefault(); memCode = document.getElementById("codeIn").value.trim(); setCode(memCode); H.closeModal(); start(); };
  document.getElementById("codeDemo").onclick = () => { H.closeModal(); runDemo(); };
}

/* ---------------- UI helpers ---------------- */
function setState(t, s = "") { stateEl.textContent = t; subEl.textContent = s; }
function line(cls, text) { const p = document.createElement("p"); p.className = cls; p.textContent = text; log.append(p); while (log.children.length > 14) log.firstChild.remove(); log.scrollTop = log.scrollHeight; return p; }
let toolT; function toolChip(t) { toolEl.textContent = "⚡ " + t; toolEl.classList.add("on"); clearTimeout(toolT); toolT = setTimeout(() => toolEl.classList.remove("on"), 2600); }
function openDock() { dock.classList.add("live"); log.innerHTML = ""; orbLoop(); }
function closeDock() { dock.classList.remove("live"); }

/* ---------------- orb (audio-reactive) ---------------- */
let orbRAF, demoLevel = 0;
const level = an => { if (!an) return 0; const a = new Uint8Array(an.fftSize); an.getByteTimeDomainData(a); let s = 0; for (const v of a) s += ((v - 128) / 128) ** 2; return Math.min(1, Math.sqrt(s / a.length) * 4); };
function orbLoop() {
  const c = $("#orb"), x = c.getContext("2d"); let bl = 0, ml = 0, t = 0;
  cancelAnimationFrame(orbRAF);
  (function f() {
    t += .016; bl += ((demo ? demoLevel : level(botAnalyser)) - bl) * .25; ml += ((muted ? 0 : level(micAnalyser)) - ml) * .25;
    const lv = Math.max(bl, ml * .8), hot = bl >= ml;
    x.clearRect(0, 0, 116, 116);
    for (let k = 3; k >= 0; k--) {
      x.beginPath();
      for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2, n = Math.sin(a * 3 + t * (2 + k)) * .5 + Math.sin(a * 5 - t * 3) * .5;
        const r = 30 + k * 4 + lv * (10 + k * 3) + n * (2 + lv * 8); const px = 58 + Math.cos(a) * r, py = 58 + Math.sin(a) * r; i ? x.lineTo(px, py) : x.moveTo(px, py); }
      x.closePath();
      x.fillStyle = hot ? [`rgba(255,77,28,.9)`, `rgba(255,120,40,.35)`, `rgba(255,181,71,.18)`, `rgba(255,181,71,.08)`][k] : [`rgba(251,241,230,.85)`, `rgba(251,241,230,.3)`, `rgba(251,241,230,.14)`, `rgba(251,241,230,.06)`][k];
      x.fill();
    }
    if (live || demo) orbRAF = requestAnimationFrame(f); else x.clearRect(0, 0, 116, 116);
  })();
}

/* ---------------- tools: each one moves the screen ---------------- */
const dishInfo = d => ({ id: d.id, name: d.name, price: d.price, spoken_price: H.spoken(d.price), desc: d.desc, tags: d.tags, category: H.catName(d.category) });
const noDish = id => ({ error: `ما في طبق بالرقم "${id}"`, available: H.data.dishes.map(d => `${d.id}: ${d.name}`) });
const SEC_AR = { home: "الرئيسية", menu: "القائمة", signature: "أطباق البيت", story: "قصتنا", reserve: "الحجز", location: "الموقع" };

const TOOLS = {
  async go_to({ section }) { toolChip(`نقلتك لـ${SEC_AR[section] || section}`); return { ok: H.goTo(section) }; },
  async open_menu_category({ category }) {
    if (!H.showCategory(category)) return { error: "قسم مش موجود", categories: H.data.categories };
    toolChip(`فتحت ${H.catName(category)}`);
    return { category: H.catName(category), dishes: H.data.dishes.filter(d => d.category === category).map(d => ({ id: d.id, name: d.name, spoken_price: H.spoken(d.price) })) };
  },
  async show_dish({ dish_id }) {
    const d = H.dish(dish_id); if (!d) return noDish(dish_id);
    toolChip(`بفرجيك ${d.name}`); await H.spotlight(dish_id); return dishInfo(d);
  },
  async recommend({ spicy, vegetarian, max_price, people, category } = {}) {
    let list = H.data.dishes.filter(d => d.img);
    if (category) list = list.filter(d => d.category === category);
    if (spicy) list = list.filter(d => d.tags.includes("حار")).concat(list.filter(d => !d.tags.includes("حار") && d.category === "grill"));
    if (vegetarian) list = H.data.dishes.filter(d => d.tags.includes("نباتي"));
    if (max_price) list = list.filter(d => d.price <= max_price);
    const rank = d => (people >= 3 && d.id === "platter" ? -3 : 0) + (d.tags.includes("الأكثر طلباً") ? -2 : 0) + (d.tags.includes("طبق البيت") ? -1 : 0);
    list = [...new Set(list)].sort((a, b) => rank(a) - rank(b)).slice(0, 3);
    if (!list.length) return { result: "ما لقيت إشي بهالشروط", tip: "اقترح بدائل من القائمة" };
    toolChip("اخترتلك كم طبق");
    const sameCat = list.filter(d => d.category === list[0].category).map(d => d.id);
    await (list[0].id === "platter" || list[0].id === "zarb" ? H.spotlight(list[0].id) : H.spotlightMany(sameCat));
    return { picks: list.map(dishInfo) };
  },
  async add_to_order({ dish_id, qty = 1, note = "" }) {
    const d = H.dish(dish_id); if (!d) return noDish(dish_id);
    const el = document.querySelector(`[data-dish="${dish_id}"]`);
    if (!el || el.getBoundingClientRect().bottom < 0) { await H.spotlight(dish_id); await H.sleep(500); }
    const l = H.add(dish_id, qty, note); toolChip(`زدت ${qty > 1 ? qty + "× " : ""}${d.name}`); H.toast(`${d.name} انضاف للطلب`);
    return { added: d.name, qty_now: l.qty, cart: H.cartSummary() };
  },
  async remove_from_order({ dish_id, qty }) {
    const d = H.dish(dish_id); if (!d) return noDish(dish_id);
    const l = H.remove(dish_id, qty); if (!l) return { error: "هالطبق مش بالسلة", cart: H.cartSummary() };
    toolChip(`شلت ${d.name}`); return { removed: d.name, qty_now: l.qty, cart: H.cartSummary() };
  },
  async show_order() { H.openCart(true); toolChip("فتحت السلة"); return H.cartSummary(); },
  async place_order({ name, phone, method, address }) {
    if (method === "delivery" && !address) return { ok: false, missing: ["address"], tip: "اسأله عن العنوان" };
    H.openCart(true); await H.sleep(500); toolChip("بأكّد الطلب");
    return H.submitOrder({ name, phone, method, address });
  },
  async fill_reservation(args) { toolChip("بعبّي الحجز"); return H.fillBooking(args); },
  async confirm_reservation() { toolChip("بأكّد الحجز"); return H.confirmBooking(); },
  async end_call() { ending = true; return { ok: true }; },
};

async function runTool(name, args) {
  try { return TOOLS[name] ? await TOOLS[name](args || {}) : { error: "أداة مش معروفة" }; }
  catch (e) { console.error(name, e); return { error: String(e.message || e) }; }
}

/* ---------------- live call ---------------- */
async function start() {
  live = true; ending = false; muted = false; $("#vMute").setAttribute("aria-pressed", false);
  openDock(); setState("بتصل بهستي…", "اسمحله يستعمل المايك");
  // create/resume the audio engine inside the tap, otherwise Safari/Chrome keep it silent
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); ac.resume(); } catch { ac = null; }
  try {
    mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  } catch (e) {
    line("sys", e.name === "NotAllowedError" ? "لازم تسمح للمايك عشان تحكي مع هستي (من القفل جنب العنوان)." : "ما لقينا مايك على هالجهاز.");
    return fail("المايك مش شغّال");
  }
  let s;
  try {
    const r = await fetch("/api/voice/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ section: H.section, cart: H.cartText(), code: memCode || getCode() }) });
    s = await r.json().catch(() => ({}));
    if (r.status === 403) { memCode = ""; setCode(""); live = false; cleanup(); closeDock(); return askCode(true); }
    if (!r.ok) throw new Error(s.detail || "السيرفر ما رد");
    if (!live) return cleanup();
    if (s.provider === "gemini") {
      try { await startGemini(s); }
      catch (err) {
        if (!live || !s.hints) throw err;
        // Gemini refused the session setup (e.g. language hint) -> one retry with a plain session
        console.warn("gemini retry without hints:", err);
        stopGeminiSocket();
        const r2 = await fetch("/api/voice/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ section: H.section, cart: H.cartText(), code: memCode || getCode(), plain: true }) });
        const s2 = await r2.json().catch(() => ({})); if (!r2.ok) throw new Error(s2.detail || "السيرفر ما رد");
        if (!live) return cleanup();
        await startGemini(s2);
      }
    } else await startOpenAI(s);
  } catch (e) {
    console.error(e);
    const who = s && s.provider === "gemini" ? "Gemini" : "OpenAI";
    line("sys", e instanceof TypeError ? `ما قدرنا نوصل لـ ${who}. تأكد من الإنترنت وجرّب كمان مرة.` : String(e.message || e));
    fail("ما زبط الاتصال");
  }
}

function armCallTimer() {
  const mins = cfg.max_minutes || 8;
  clearTimeout(callTimer);
  callTimer = setTimeout(() => end(`خلص وقت المكالمة التجريبية (${mins} دقائق)`), mins * 60000);
}

/* ---------- OpenAI Realtime (WebRTC) ---------- */
async function startOpenAI(s) {
  pc = new RTCPeerConnection();
  audioEl = new Audio(); audioEl.autoplay = true;
  pc.ontrack = e => {
    audioEl.srcObject = e.streams[0];
    if (ac) { botAnalyser = ac.createAnalyser(); botAnalyser.fftSize = 512; ac.createMediaStreamSource(e.streams[0]).connect(botAnalyser); }
  };
  if (ac) { micAnalyser = ac.createAnalyser(); micAnalyser.fftSize = 512; ac.createMediaStreamSource(mic).connect(micAnalyser); }
  mic.getTracks().forEach(t => pc.addTrack(t, mic));
  pc.onconnectionstatechange = () => { if (["failed", "disconnected"].includes(pc?.connectionState) && live) fail("انقطع الاتصال"); };
  dc = pc.createDataChannel("oai-events");
  dc.onopen = () => { setState("هستي معك", "احكي براحتك"); send({ type: "response.create" }); armCallTimer(); };
  dc.onmessage = e => onEvent(JSON.parse(e.data));
  const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
  const sdp = await fetch(s.calls_url, { method: "POST", body: offer.sdp, headers: { Authorization: `Bearer ${s.key}`, "Content-Type": "application/sdp" } });
  if (!sdp.ok) throw new Error("OpenAI رفض الاتصال (" + sdp.status + ")");
  await pc.setRemoteDescription({ type: "answer", sdp: await sdp.text() });
}

/* ---------- Gemini Live (WebSocket, PCM 16 kHz up / 24 kHz down) ---------- */
const MIC_WORKLET = `class HysMic extends AudioWorkletProcessor{process(i){const c=i[0]&&i[0][0];if(c)this.port.postMessage(c.slice(0));return true}}registerProcessor("hys-mic",HysMic);`;
const b64 = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = str => { const bin = atob(str), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; };
const gsend = o => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };

function stopGeminiSocket() {
  try { if (ws) { ws.onclose = ws.onmessage = ws.onerror = null; if (ws.readyState <= 1) ws.close(1000); } } catch {}
  ws = null; try { botAnalyser && botAnalyser.disconnect(); outGain && outGain.disconnect(); } catch {}
}
function startGemini(s) {
  if (!ac) throw new Error("المتصفح ما بيدعم الصوت المطلوب");
  outGain = ac.createGain(); botAnalyser = ac.createAnalyser(); botAnalyser.fftSize = 512;
  outGain.connect(botAnalyser); botAnalyser.connect(ac.destination);
  return new Promise((resolve, reject) => {
    let ready = false;
    ws = new WebSocket(`${s.ws_url}?access_token=${encodeURIComponent(s.token)}`);
    ws.onopen = () => gsend({ setup: { model: s.model } });
    ws.onmessage = async e => {
      let msg; try { msg = JSON.parse(typeof e.data === "string" ? e.data : await e.data.text()); } catch { return; }
      if (msg.setupComplete && !ready) {
        ready = true; resolve();
        setState("هستي معك", "احكي براحتك"); armCallTimer();
        await startMicStream().catch(err => { line("sys", "المايك: " + err.message); fail("المايك مش شغّال"); });
        gsend({ realtimeInput: { text: "ابدأ المكالمة هسّا: رحّب بالزبون بجملة قصيرة واسأله شو نفسه ياكل." } });
        return;
      }
      onGemini(msg);
    };
    ws.onerror = () => { if (!ready) reject(new Error("ما قدرنا نفتح الاتصال مع Gemini")); };
    ws.onclose = e => {
      if (!ready) return reject(new Error("Gemini سكّر الاتصال" + (e.reason ? ": " + e.reason : ` (${e.code})`)));
      if (live) { if (e.code !== 1000 && e.reason) line("sys", "انقطع الاتصال: " + e.reason); end(ending ? "هستي سكّر المكالمة" : "انقطع الاتصال"); }
    };
  });
}

async function startMicStream() {
  const src = ac.createMediaStreamSource(mic);
  micAnalyser = ac.createAnalyser(); micAnalyser.fftSize = 512; src.connect(micAnalyser);
  const url = URL.createObjectURL(new Blob([MIC_WORKLET], { type: "text/javascript" }));
  await ac.audioWorklet.addModule(url); URL.revokeObjectURL(url);
  micNode = new AudioWorkletNode(ac, "hys-mic");
  micSink = ac.createGain(); micSink.gain.value = 0;               // keeps the worklet pulled without playing the mic back
  src.connect(micNode); micNode.connect(micSink); micSink.connect(ac.destination);
  const ratio = ac.sampleRate / 16000; let pos = 0, carry = new Float32Array(0), pending = [];
  micNode.port.onmessage = ev => {
    if (muted || !ws || ws.readyState !== 1) return;
    const input = new Float32Array(carry.length + ev.data.length); input.set(carry); input.set(ev.data, carry.length);
    for (; pos + 1 < input.length; pos += ratio) {                  // linear resample to 16 kHz
      const i = Math.floor(pos), f = pos - i, v = input[i] * (1 - f) + input[i + 1] * f;
      pending.push(Math.max(-1, Math.min(1, v)) * 0x7fff);
    }
    const used = Math.floor(pos); carry = input.slice(used); pos -= used;
    if (pending.length >= 640) {                                     // ~40 ms per message
      const pcm = Int16Array.from(pending); pending = [];
      gsend({ realtimeInput: { audio: { data: b64(new Uint8Array(pcm.buffer)), mimeType: "audio/pcm;rate=16000" } } });
    }
  };
}

function playPcm(b64data, mime) {
  const rate = +((/rate=(\d+)/.exec(mime || "") || [])[1] || 24000);
  const u8 = unb64(b64data), n = u8.length >> 1; if (!n) return;
  const dv = new DataView(u8.buffer), buf = ac.createBuffer(1, n, rate), ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) ch[i] = dv.getInt16(i * 2, true) / 0x8000;
  const src = ac.createBufferSource(); src.buffer = buf; src.connect(outGain);
  playHead = Math.max(playHead, ac.currentTime + 0.03); src.start(playHead); playHead += buf.duration;
  sources.add(src); src.onended = () => sources.delete(src);
}
function stopPlayback() { sources.forEach(x => { try { x.stop(); } catch {} }); sources.clear(); playHead = 0; }
const playbackLeft = () => Math.max(0, playHead - (ac ? ac.currentTime : 0));

async function onGemini(msg) {
  const sc = msg.serverContent;
  if (sc) {
    if (sc.interrupted) { stopPlayback(); botBubble = null; setState("بسمعك…", "كمّل"); }
    if (sc.inputTranscription && sc.inputTranscription.text) {
      setState("بسمعك…", "كمّل");
      if (!userBubble) { userBubble = line("u", ""); botBubble = null; }
      userBubble.textContent += sc.inputTranscription.text; log.scrollTop = log.scrollHeight;
    }
    for (const part of (sc.modelTurn && sc.modelTurn.parts) || []) {
      if (part.inlineData && part.inlineData.data && /audio/.test(part.inlineData.mimeType || "audio")) {
        userBubble = null; setState("هستي بيحكي…", "قاطعه وقت ما بدك"); playPcm(part.inlineData.data, part.inlineData.mimeType);
      }
    }
    if (sc.outputTranscription && sc.outputTranscription.text) {
      userBubble = null;
      if (!botBubble) botBubble = line("b", "");
      botBubble.textContent += sc.outputTranscription.text; log.scrollTop = log.scrollHeight;
    }
    if (sc.turnComplete) {
      botBubble = null; userBubble = null;
      setTimeout(() => { if (live && !busy && !sources.size) setState("بسمعك…", "احكي براحتك"); }, playbackLeft() * 1000 + 100);
      if (ending) setTimeout(() => end("هستي سكّر المكالمة"), playbackLeft() * 1000 + 700);
    }
  }
  if (msg.toolCall && msg.toolCall.functionCalls) {
    busy = true; setState("ثانية…", "هستي بيحرّك الشاشة");
    const functionResponses = [];
    for (const c of msg.toolCall.functionCalls) {
      const out = await runTool(c.name, c.args || {});
      functionResponses.push({ id: c.id, name: c.name, response: { result: out } });
    }
    busy = false;
    gsend({ toolResponse: { functionResponses } });
    if (ending) setTimeout(() => end("هستي سكّر المكالمة"), playbackLeft() * 1000 + 2500);
  }
  if (msg.goAway) line("sys", "المكالمة رح تخلص بعد شوي");
}

const send = o => { if (dc?.readyState === "open") dc.send(JSON.stringify(o)); };

async function onEvent(ev) {
  switch (ev.type) {
    case "input_audio_buffer.speech_started": setState("بسمعك…", "كمّل"); botBubble = null; break;
    case "input_audio_buffer.speech_stopped": setState("ثانية…", "هستي بيفكّر"); break;
    case "conversation.item.input_audio_transcription.completed": if (ev.transcript?.trim()) line("u", ev.transcript.trim()); break;
    case "response.output_audio_transcript.delta":
      setState("هستي بيحكي…", "قاطعه وقت ما بدك");
      if (!botBubble) botBubble = line("b", "");
      botBubble.textContent += ev.delta; log.scrollTop = log.scrollHeight; break;
    case "response.output_audio_transcript.done": botBubble = null; break;
    case "response.done": {
      const calls = (ev.response?.output || []).filter(o => o.type === "function_call");
      if (!calls.length) { if (!busy) setState("بسمعك…", "احكي براحتك"); if (ending) setTimeout(() => end("هستي سكّر المكالمة"), 2600); break; }
      busy = true;
      for (const c of calls) {
        let args = {}; try { args = JSON.parse(c.arguments || "{}"); } catch {}
        const out = await runTool(c.name, args);
        send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: c.call_id, output: JSON.stringify(out) } });
      }
      busy = false;
      if (ending && calls.every(c => c.name === "end_call")) { setTimeout(() => end("هستي سكّر المكالمة"), 2200); break; }
      send({ type: "response.create" });
      break;
    }
    case "error": console.warn(ev.error); if (ev.error?.message && !/active response/i.test(ev.error.message)) line("sys", "خطأ: " + ev.error.message); break;
  }
}

function fail(t) { setState(t, "جرّب كمان مرة"); live = false; cleanup(); setTimeout(() => { if (!live && !demo) closeDock(); }, 4500); }
function end(t) { if (!live) return; line("sys", t); live = false; cleanup(); setState("المكالمة خلصت", "يسلموا!"); setTimeout(() => { if (!live && !demo) closeDock(); }, 1800); }
function cleanup() {
  clearTimeout(callTimer);
  try { dc?.close(); } catch {} try { pc?.close(); } catch {}
  try { if (ws && ws.readyState <= 1) ws.close(1000, "bye"); } catch {}
  stopPlayback();
  try { micNode?.port && (micNode.port.onmessage = null); micNode?.disconnect(); micSink?.disconnect(); } catch {}
  mic?.getTracks().forEach(t => t.stop()); if (audioEl) audioEl.srcObject = null;
  try { ac && ac.state !== "closed" && ac.close(); } catch {}
  pc = dc = mic = ws = micNode = micSink = outGain = ac = null; botAnalyser = micAnalyser = null; botBubble = userBubble = null; busy = false;
}
addEventListener("pagehide", cleanup);

/* ---------------- demo tour (no key needed): same tools, scripted lines ---------------- */
function nextThursday() { const d = new Date(); d.setDate(d.getDate() + ((4 - d.getDay() + 7) % 7 || 7)); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }
async function say(text) {
  setState("هستي بيحكي…", "جولة تجريبية"); const p = line("b", "");
  for (const w of text.split(" ")) { if (!demo) return; p.textContent += (p.textContent ? " " : "") + w; demoLevel = .35 + Math.random() * .5; await H.sleep(150); }
  demoLevel = 0; await H.sleep(500);
}
async function hear(text) { if (!demo) return; setState("بسمعك…", "جولة تجريبية"); await H.sleep(700); line("u", text); await H.sleep(600); }
async function tool(n, a) { if (!demo) return; setState("ثانية…", "هستي بيحرّك الشاشة"); await runTool(n, a); await H.sleep(900); }
async function runDemo() {
  demo = true; openDock(); $("#vEnd").onclick = () => { demo = false; closeDock(); $("#vEnd").onclick = () => end("سكّرت المكالمة"); };
  const steps = [
    () => say("أهلين وسهلين بهستيريا! شو نفسك تاكل اليوم؟"),
    () => hear("بدي إشي حار ومشبع"),
    () => tool("recommend", { spicy: true }),
    () => say("جرّب كباب هستيريا، حار ومعه دبس رمان، بـ9 دنانير ونص. وهو أكثر طبق بينطلب عنّا."),
    () => hear("تمام، زيدلي اثنين، ومعهم حمص باللحمة"),
    () => tool("add_to_order", { dish_id: "kebab", qty: 2 }),
    () => tool("add_to_order", { dish_id: "hummus", qty: 1 }),
    () => say("زبطت: اثنين كباب وحمص باللحمة. بدك إشي حلو بالآخر؟"),
    () => hear("شو عندك حلو؟"),
    () => tool("show_dish", { dish_id: "knafeh" }),
    () => say("الكنافة النابلسية السخنة، بتطلع بتمطّ، بـ4 دنانير ونص."),
    () => hear("لا خلص هيك. وبدي أحجز طاولة لأربعة يوم الخميس الساعة ثمانية، باسم أحمد"),
    () => tool("fill_reservation", { name: "أحمد", date: nextThursday(), time: "20:00", guests: 4, area: "indoor" }),
    () => say("عبّيتلك الحجز، بس عطيني رقم تلفونك."),
    () => hear("0791234567"),
    () => tool("fill_reservation", { phone: "0791234567" }),
    () => tool("confirm_reservation", {}),
    () => say("تم يا أحمد، طاولتك جاهزة يوم الخميس الساعة ثمانية. وهاي سلتك كمان."),
    () => tool("show_order", {}),
    () => say(`المجموع ${H.cartSummary().spoken_total} مع التوصيل. أكّد السلة وبنبعتلك الأكل. يعطيك العافية!`),
  ];
  for (const s of steps) { if (!demo) break; await s(); }
  if (demo) { setState("خلصت الجولة", "شغّل السيرفر عشان تحكي مع هستي فعلياً"); await H.sleep(4000); }
  demo = false; closeDock(); $("#vEnd").onclick = () => end("سكّرت المكالمة");
}
window.HYS_VOICE = { runDemo, TOOLS, runTool, _onEvent: onEvent, _onGemini: onGemini };
})();
