/* Clerk sign-in. Orders and bookings are for members only, so app.js asks this file
   for a session token before posting, and opens the sign-in window when nobody is signed in.
   The publishable key comes from /api/config (the server reads it from .env). */
(() => {
  const box = document.getElementById("authBox");
  let clerk = null;
  let ready;   // resolves once Clerk has loaded (or failed)

  const script = src => new Promise((ok, fail) => {
    const s = document.createElement("script");
    s.src = src; s.crossOrigin = "anonymous"; s.onload = ok; s.onerror = fail;
    document.head.appendChild(s);
  });

  // pk_test_<base64("xxx.clerk.accounts.dev$")> -> the Frontend API host that serves Clerk's scripts
  const fapiHost = pk => atob(pk.split("_")[2]).replace(/\$$/, "");

  function render() {
    if (!box || !clerk) return;
    box.innerHTML = "";
    if (clerk.isSignedIn) {
      const u = document.createElement("div");
      u.className = "auth-user";
      box.appendChild(u);
      clerk.mountUserButton(u);
    } else {
      const inBtn = document.createElement("button");
      inBtn.className = "btn btn-ghost auth-btn"; inBtn.type = "button"; inBtn.textContent = "دخول";
      inBtn.onclick = () => clerk.openSignIn();
      const upBtn = document.createElement("button");
      upBtn.className = "btn btn-hot auth-btn"; upBtn.type = "button"; upBtn.textContent = "حساب جديد";
      upBtn.onclick = () => clerk.openSignUp();
      box.append(inBtn, upBtn);
    }
    box.hidden = false;
  }

  ready = (async () => {
    if (location.protocol === "file:") return;
    try {
      const cfg = await (await fetch("/api/config", { cache: "no-store" })).json();
      if (!cfg.clerk_pk) return;
      const host = fapiHost(cfg.clerk_pk);
      await script(`https://${host}/npm/@clerk/ui@1/dist/ui.browser.js`);
      const s = document.createElement("script");
      s.dataset.clerkPublishableKey = cfg.clerk_pk;
      s.src = `https://${host}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`;
      s.crossOrigin = "anonymous";
      await new Promise((ok, fail) => { s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
      await window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
      clerk = window.Clerk;
      clerk.addListener(render);
      render();
    } catch (e) {
      console.warn("Clerk did not load", e);
    }
  })();

  window.HysAuth = {
    ready: () => ready,
    signedIn: () => !!clerk?.isSignedIn,
    // a fresh session token for the Authorization header, or null when signed out
    token: async () => { await ready; return clerk?.session ? await clerk.session.getToken() : null; },
    signIn: async () => { await ready; clerk?.openSignIn(); },
  };
})();
