(() => {
  "use strict";
  const I18N = window.FriendsI18n;
  const t = I18N.t;
  const cfg = window.FRIENDS_CONFIG || {};
  const apiBase = (cfg.apiBaseUrl || "").replace(/\/$/, "");
  const supabaseUrl = cfg.supabaseUrl || "";
  const supabaseKey = cfg.supabasePublishableKey || "";
  const privacyPolicyUrl = cfg.privacyPolicyUrl || "";
  const offerUrl = cfg.offerUrl || "";
  const crmUrl = cfg.crmUrl || "";
  // Two apps share this client: the resident app (index.html) and the admin
  // app (admin.html, <body data-app="admin">). Admin screens are never shown
  // in the resident app; the API enforces roles either way.
  // "pilot" (owner-only artifact build) shows both menus without a role check.
  const APP = ["admin", "pilot"].includes(document.body.dataset.app) ? document.body.dataset.app : "resident";
  const ADMIN_VIEWS = ["events-admin", "admin", "admin-experts", "admin-learn", "admin-announcements", "admin-discounts", "admin-stats", "admin-feedback", "admin-referrals", "admin-staff", "admin-loans", "admin-pulse", "admin-polls", "admin-learning-orders", "admin-chats", "admin-trust", "admin-deals", "admin-partners", "admin-proposals", "admin-signups", "admin-bans", "admin-activity", "admin-subscriptions"];
  const RESIDENT_ONLY = ["books", "blogger", "overview", "membership", "companies", "notifications", "profile", "my-card", "experts", "learn", "course", "lesson", "team", "announcements", "discounts", "card", "partner", "feedback", "business", "certificate", "checkin", "polls", "services", "me", "messages", "chat", "tests", "test", "settings", "member", "trust", "deals", "deal", "host", "recordings", "templates", "professions", "partner-apply"];
  // Own phone sign-in (SMS code against our API) replaces Supabase when authMode is "phone".
  const ownAuth = cfg.authMode === "phone" && !!apiBase;
  let supabaseClient = null;
  function authClient() {
    if (!supabaseUrl || !supabaseKey) return Promise.reject(new Error(t("auth.notConfigured")));
    if (!supabaseClient) {
      supabaseClient = import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm")
        .then(({ createClient }) => createClient(supabaseUrl, supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }));
    }
    return supabaseClient;
  }
  const KEY = "friends.access_token", REFRESH = "friends.refresh_token", IDTOKEN = "friends.id_token";
  const content = document.querySelector("#view-content");
  const title = document.querySelector("#page-title");
  const subtitle = document.querySelector("#page-subtitle");
  const VIEW_KEYS = {
    overview: "overview", events: "events", "events-admin": "eventsAdmin", members: "members", companies: "companies",
    membership: "membership", notifications: "notifications", profile: "profile", admin: "admin",
    experts: "experts", "admin-experts": "adminExperts", learn: "learn", course: "learn", lesson: "learn", team: "team", "admin-learn": "adminLearn",
    announcements: "announcements", "admin-announcements": "adminAnnouncements",
    discounts: "discounts", card: "card", "my-card": "myCard", partner: "partner", "admin-discounts": "adminDiscounts", feedback: "feedback", "admin-stats": "adminStats", "admin-feedback": "adminFeedback", "admin-referrals": "adminReferrals", "admin-staff": "adminStaff", business: "business", "admin-loans": "adminLoans", certificate: "certificate", checkin: "checkin", polls: "polls", "admin-pulse": "adminPulse", "admin-polls": "adminPolls", "admin-learning-orders": "adminLearningOrders", services: "services", messages: "messages", chat: "chat", "admin-chats": "adminChats", tests: "tests", test: "test", settings: "settings", member: "member", trust: "trust", "admin-trust": "adminTrust", deals: "deals", deal: "deal", "admin-deals": "adminDeals", "admin-partners": "adminPartners", blogger: "blogger", "admin-signups": "adminSignups", "admin-bans": "adminBans", "admin-activity": "adminActivity", "admin-subscriptions": "adminSubscriptions", "admin-proposals": "adminProposals", host: "host", recordings: "recordings", books: "books", templates: "templates", professions: "professions", "partner-apply": "partnerApply", me: "me"
  };
  let user = null, profile = null, roles = null, active = APP === "admin" ? "admin-stats" : "overview";
  const token = () => sessionStorage.getItem(KEY);
  // Own auth: the refresh token lives on the device (localStorage), so the phone stays signed in after one SMS code.
  const getRefresh = () => { try { return (ownAuth ? localStorage : sessionStorage).getItem(REFRESH); } catch { return null; } };
  const setRefresh = v => { try { (ownAuth ? localStorage : sessionStorage).setItem(REFRESH, v); } catch { /* private mode */ } };
  async function ownPost(path, payload) {
    let r;
    try { r = await fetch(apiBase + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); }
    catch { const e = Error(t("error.network")); e.status = 0; throw e; }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = Error(d && d.error === "sms_retry_later" ? t("error.sms_retry_later", { s: d.retry_after || RESEND_S }) : I18N.apiError(d && d.error, r.status)); e.status = r.status; e.code = d && d.error; e.retryAfter = d && d.retry_after; throw e; }
    return d;
  }
  async function ownChannels() {
    try { const r = await fetch(apiBase + "/v1/auth/channels"); const d = await r.json(); return { sms: true, whatsapp: d && d.whatsapp === true }; }
    catch { return { sms: true, whatsapp: false }; }
  }
  function storeSession(d) { sessionStorage.setItem(KEY, d.access_token); if (d.refresh_token) setRefresh(d.refresh_token); }
  // Theme: dark by default (owner request), light on demand; remembered per device.
  const THEME_KEY = "friends.theme";
  const currentTheme = () => document.documentElement.dataset.theme === "light" ? "light" : "dark";
  const ACCENTS = ["blue", "teal", "violet", "green"];
  const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* this page only */ } } };
  function applyTheme(mode) {
    // "navy" is the dark mode with a deep-blue palette.
    const m = mode === "light" ? "light" : "dark";
    const root = document.documentElement;
    root.dataset.theme = m;
    if (mode === "navy") root.dataset.palette = "navy"; else delete root.dataset.palette;
    const accent = store.get("friends.accent");
    if (ACCENTS.includes(accent) && accent !== "blue") root.dataset.accent = accent; else delete root.dataset.accent;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", m === "light" ? "#ffffff" : mode === "navy" ? "#0b1220" : "#18191a");
  }
  const themeChoice = () => document.documentElement.dataset.theme === "light" ? "light" : document.documentElement.dataset.palette === "navy" ? "navy" : "dark";
  try { applyTheme(localStorage.getItem(THEME_KEY)); } catch { applyTheme("dark"); }
  const themeButton = () => '<button type="button" class="theme-toggle" data-theme-toggle aria-label="' + esc(t(currentTheme() === "dark" ? "theme.toLight" : "theme.toDark")) + '" title="' + esc(t(currentTheme() === "dark" ? "theme.toLight" : "theme.toDark")) + '"><span aria-hidden="true">' + (currentTheme() === "dark" ? ic("sun") : ic("moon")) + "</span></button>";
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-theme-toggle]");
    if (!b) return;
    const next = currentTheme() === "dark" ? "light" : "dark";
    try { localStorage.setItem(THEME_KEY, next); } catch { /* remembered for this page only */ }
    applyTheme(next);
    document.querySelectorAll("[data-theme-toggle]").forEach(x => { x.outerHTML = themeButton(); });
    document.querySelector("[data-theme-toggle]")?.focus();
  });
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Monochrome line icons (inherit the text colour) instead of colour emoji.
  const ICON_PATHS = {
    home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
    business: "M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3",
    qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2",
    learn: "M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5M22 9v6",
    user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6",
    users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5c2.5.6 4 2.5 4 5.5",
    chat: "M4 5h16v11H9l-5 4z",
    bell: "M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4",
    calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
    star: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z",
    megaphone: "M3 10v4h4l8 4V6l-8 4zM18 9a4 4 0 0 1 0 6",
    pin: "M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    gift: "M3 9h18v4H3zM5 13v8h14v-8M12 9v12M12 9C10 5 6 5 6 7.5S9 9 12 9s6-.5 6-1.5S14 5 12 9",
    lock: "M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3",
    speaker: "M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12",
    attach: "M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.9-8.9a3.7 3.7 0 0 1 5.2 5.2l-8.9 8.9a1.8 1.8 0 0 1-2.6-2.6l8.2-8.2",
    smile: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01",
    file: "M7 3h7l5 5v13H7zM14 3v5h5",
    send: "M4 12l16-8-6 16-3-7z",
    stop: "M7 7h10v10H7z",
    deal: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
    building: "M5 21V4h10v17M15 9h4v12M3 21h18M8 8h1M11 8h1M8 12h1M11 12h1M8 16h1M11 16h1",
    bank: "M3 10l9-6 9 6zM5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18",
    receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
    help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01",
    test: "M8 3h8v3H8zM6 4.5H5V21h14V4.5h-1M9 14l2 2 4-4",
    pen: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
    tag: "M3 12V4h8l10 10-8 8zM7.5 8.5h.01",
    gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1",
    card: "M3 6h18v12H3zM7 10h5M7 14h8",
    grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
    trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
    spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
    coffee: "M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 11h2a2 2 0 0 1 0 4h-2M8 3v3M12 3v3",
    sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5",
    moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
    phone: "M7 2h10v20H7zM11 18h2",
    cake: "M4 21h16M5 21v-7h14v7M5 16c2 1.5 4.5 1.5 7 0s5-1.5 7 0M12 14v-4M12 7.5v-.01",
    wave: "M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM3 21c0-4 3-6 7-6M18 14v6M15 17h6",
    scale: "M12 3v18M5 21h14M5 7h14M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0z",
    store: "M4 9l1.5-5h13L20 9M4 9h16v2a3 3 0 0 1-5.3 2 3 3 0 0 1-5.4 0A3 3 0 0 1 4 11zM5 13v8h14v-8",
    book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M19 19v2H6",
    percent: "M19 5 5 19M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    briefcase: "M4 7h16v12H4zM9 7V5h6v2M4 12h16",
    shield: "M12 3l8 3v6c0 4.5-3.5 8-8 9-4.5-1-8-4.5-8-9V6z M9 12l2 2 4-4",
    play: "M8 5v14l11-7z",
    pause: "M7 5h4v14H7z M13 5h4v14h-4z",
    mail: "M3 6h18v12H3zM3 7l9 6 9-6",
    logout: "M9 4H5v16h4M15 8l4 4-4 4M19 12H9",
    chevron: "M9 6l6 6-6 6",
    back: "M15 5l-7 7 7 7",
    face1: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 10h.01M15 10h.01M8 16.5c2.5-2.5 5.5-2.5 8 0",
    face2: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 10h.01M15 10h.01M9 16c2-1.3 4-1.3 6 0",
    face3: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 10h.01M15 10h.01M9 15.5h6",
    face4: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 10h.01M15 10h.01M9 14.5c2 1.5 4 1.5 6 0",
    face5: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 10h.01M15 10h.01M8 14c2.5 3 5.5 3 8 0"
  };
  const ic = (name, cls) => '<svg class="ic' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' + (ICON_PATHS[name] || ICON_PATHS.grid) + '"/></svg>';
  const paintIcons = (root = document) => root.querySelectorAll("[data-ic]").forEach(el => { if (!el.firstElementChild) el.innerHTML = ic(el.dataset.ic); });
  paintIcons();
  const safeUrl = v => { try { const u = new URL(String(v || ""), location.origin); return ["http:", "https:"].includes(u.protocol) ? u.href : ""; } catch { return ""; } };
  const date = v => I18N.formatDate(v);
  // Date without the time (subscriptions, badges).
  const day = v => { const x = date(v); return x.replace(/,?\s*(\u0432\s*)?\d{1,2}:\d{2}(\s*[AP]M)?$/i, "").replace(/\s+at$/, "").trim(); };
  const money = v => I18N.formatMoney(v);
  const clearTokens = () => { [KEY, REFRESH, IDTOKEN].forEach(k => sessionStorage.removeItem(k)); try { localStorage.removeItem(REFRESH); } catch { /* none */ } };

  function status(message, error = false) {
    let el = document.querySelector("#app-status");
    if (!el) {
      el = document.createElement("div");
      el.id = "app-status";
      el.className = "app-status";
      el.setAttribute("role", "status");
      document.querySelector(".main").prepend(el);
    }
    el.textContent = message;
    el.hidden = !message;
    el.classList.toggle("error", error);
  }

  // ---------- Own sign-in dialogs: phone with a mask, code that fills itself from the SMS ----------
  function authDialog(html) {
    const wrap = document.createElement("div");
    wrap.className = "auth-overlay";
    wrap.innerHTML = '<div class="auth-card" role="dialog" aria-modal="true">' + html + "</div>";
    document.body.appendChild(wrap);
    return { root: wrap, q: sel => wrap.querySelector(sel), close: () => wrap.remove() };
  }
  const digitsOf = v => String(v).replace(/\D/g, "");
  function maskPhone(v) {
    let d = digitsOf(v);
    if (!d) return "";
    if (d[0] === "8") d = "7" + d.slice(1);
    if (d[0] !== "7") return "+" + d.slice(0, 15);
    d = d.slice(0, 11);
    const r = d.slice(1);
    let out = "+7";
    if (r.length) out += " " + r.slice(0, 3);
    if (r.length > 3) out += " " + r.slice(3, 6);
    if (r.length > 6) out += " " + r.slice(6, 8);
    if (r.length > 8) out += " " + r.slice(8, 10);
    return out;
  }
  const isKzPhone = v => /^\+7[67]\d{9}$/.test(v); // Kazakhstan: +7 6xx / +7 7xx; other +7 numbers are Russia
  const RESEND_S = 60;
  const phoneValue = v => { let d = digitsOf(v); if (d[0] === "8" && d.length === 11) d = "7" + d.slice(1); return "+" + d; };
  function askPhone(ch) {
    return new Promise(resolve => {
      const wa = !!(ch && ch.whatsapp);
      const dlg = authDialog('<h3>' + esc(t("auth.phoneTitle")) + '</h3><p class="muted">' + esc(t(wa ? "auth.phoneHintWa" : "auth.phoneHint")) + '</p>' +
        '<input class="auth-input" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 700 000 00 00" value="+7 " aria-label="' + esc(t("auth.phoneTitle")) + '">' +
        '<p class="muted auth-other">' + esc(t("auth.phoneOther")) + '</p>' +
        '<p class="auth-error" hidden></p><div class="auth-actions auth-actions-col">' +
        // SMS first: most members have Kazakhstan numbers. WhatsApp is the second option (and the default abroad).
        '<button type="button" class="primary-button" data-ok>' + esc(t(wa ? "auth.viaSms" : "auth.sendCode")) + '</button>' +
        (wa ? '<button type="button" class="outline-button" data-wa>' + esc(t("auth.viaWhatsapp")) + '</button>' : "") +
        '<button type="button" class="text-button" data-x>' + esc(t("auth.cancel")) + "</button></div>");
      const input = dlg.q("input"), err = dlg.q(".auth-error");
      // The prefix is only a default: erase the 7 to type another country code (for example +375).
      input.addEventListener("input", () => {
        let raw = input.value; const k = raw.lastIndexOf("+"); if (k > 0) raw = raw.slice(k); // a full number typed or pasted after the default prefix
        const d = digitsOf(raw);
        if (d.length === 12 && d[0] === "7" && (d[1] === "7" || d[1] === "8")) raw = "+" + d.slice(1); // "+7 " + pasted 8701... / 7701...
        input.value = raw.trim() === "+" ? "+" : (maskPhone(raw) || "+7 "); err.hidden = true;
      });
      const done = v => { dlg.close(); resolve(v); };
      dlg.q("[data-x]").addEventListener("click", () => done(null));
      const go = channel => { const v = phoneValue(input.value); if (!/^\+[1-9]\d{7,14}$/.test(v) || (v.startsWith("+7") && v.length !== 12)) { err.textContent = t("auth.phoneInvalid"); err.hidden = false; return; } done({ phone: v, channel: wa && !isKzPhone(v) ? "whatsapp" : channel }); };
      dlg.q("[data-ok]").addEventListener("click", () => go("sms"));
      dlg.q("[data-wa]")?.addEventListener("click", () => go("whatsapp"));
      input.addEventListener("keydown", e => { if (e.key === "Enter") go("sms"); });
      setTimeout(() => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }, 50);
    });
  }
  function askCode(phone, resend, channel, other) {
    return new Promise(resolve => {
      const dlg = authDialog('<h3>' + esc(t(channel === "whatsapp" ? "auth.codeTitleWa" : "auth.codeTitle")) + '</h3><p class="muted">' + esc(t(channel === "whatsapp" ? "auth.codeHintWa" : "auth.codeHint", { phone: maskPhone(phone) })) + '</p>' +
        '<input class="auth-input auth-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" aria-label="' + esc(t("auth.codeTitle")) + '">' +
        '<p class="auth-error" hidden></p><div class="auth-actions"><button type="button" class="outline-button" data-x>' + esc(t("auth.cancel")) + '</button><button type="button" class="outline-button" data-again>' + esc(t("auth.resend")) + '</button>' + (other ? '<button type="button" class="outline-button" data-switch>' + esc(t(channel === "whatsapp" ? "auth.otherSms" : "auth.otherWa")) + '</button>' : "") + '</div>');
      const input = dlg.q("input"), err = dlg.q(".auth-error");
      const ctl = typeof AbortController === "function" ? new AbortController() : null;
      const done = v => { if (ctl) ctl.abort(); dlg.close(); resolve(v); };
      input.addEventListener("input", () => { input.value = digitsOf(input.value).slice(0, 6); err.hidden = true; if (input.value.length === 6) done({ code: input.value }); });
      dlg.q("[data-x]").addEventListener("click", () => done(null));
      // "Send again" waits 60 seconds; the same code is sent again, so any SMS that arrives works.
      const again = dlg.q("[data-again]");
      let left = 0, timer = null;
      const tick = () => { if (!dlg.q("[data-again]")) { clearInterval(timer); return; } if (left > 0) { again.disabled = true; again.textContent = t("auth.resendIn", { s: left }); left--; } else { clearInterval(timer); timer = null; again.disabled = false; again.textContent = t("auth.resend"); } };
      const countdown = s => { left = s; if (timer) clearInterval(timer); tick(); timer = setInterval(tick, 1000); };
      countdown(RESEND_S);
      again.addEventListener("click", async () => {
        if (again.disabled) return;
        try { const d = await resend(); err.textContent = t("auth.resentSame"); err.hidden = false; countdown((d && d.resend_after) || RESEND_S); }
        catch (e) { err.textContent = e.message; err.hidden = false; if (e.retryAfter) countdown(e.retryAfter); }
      });
      dlg.q("[data-switch]")?.addEventListener("click", async () => { try { await other(); done({ switchTo: channel === "whatsapp" ? "sms" : "whatsapp" }); } catch (e) { err.textContent = e.message; err.hidden = false; } });
      // Android Chrome: the code from the SMS is read automatically (WebOTP). iPhone: the code appears above the keyboard, one tap.
      if (channel !== "whatsapp" && ctl && "OTPCredential" in window && navigator.credentials) {
        navigator.credentials.get({ otp: { transport: ["sms"] }, signal: ctl.signal }).then(c => { if (c && c.code) { input.value = digitsOf(c.code).slice(0, 6); done({ code: input.value }); } }).catch(() => { /* typed by hand */ });
      }
      setTimeout(() => input.focus(), 50);
    });
  }
  async function ownLogin() {
    const ch = await ownChannels();
    let phone = null, channel = "sms";
    for (;;) {
      const a = await askPhone(ch);
      if (!a) return null;
      phone = a.phone; channel = a.channel;
      try { const d = await ownPost("/v1/auth/sms/request", { phone, channel }); if (d && d.channel) channel = d.channel; break; }
      catch (e) {
        if (channel === "whatsapp" && e.code === "wa_failed") { status(e.message, true); continue; }
        // a code was already sent less than a minute ago: go straight to entering it
        if (e.code === "sms_retry_later") { status(e.message); break; }
        if (e.code === "sms_daily_limit") { status(t(ch.whatsapp ? "error.sms_daily_limit_wa" : "error.sms_daily_limit"), true); continue; }
        throw e;
      }
    }
    for (;;) {
      const send = async ch2 => { const d = await ownPost("/v1/auth/sms/request", { phone, channel: ch2 }); if (d && d.channel && d.channel !== ch2) channel = d.channel; return d; };
      const r = await askCode(phone, () => send(channel), channel, ch.whatsapp ? () => send(channel === "whatsapp" ? "sms" : "whatsapp") : null);
      if (!r) return null;
      if (r.switchTo) { channel = r.switchTo; continue; }
      try { storeSession(await ownPost("/v1/auth/sms/verify", { phone, code: r.code })); return phone; }
      catch (e) { if (e.code !== "invalid_code") throw e; status(e.message, true); }
    }
  }

  // Watermark with the account name and a masked phone: a deterrent against screenshots and a way to trace a leak.
  function applyWatermark() {
    document.querySelector("#wm")?.remove();
    return; // off by the owner's decision: no visible watermark
    if (APP === "admin" || !user) return;
    const nm = String((profile && profile.display_name) || "").split(" ")[0] || "";
    const txt = [nm, user.phone_masked || ""].filter(Boolean).join(" ").replace(/[<>&"']/g, "");
    if (!txt) return;
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='340' height='240'><text x='20' y='110' transform='rotate(-24 170 120)' font-family='sans-serif' font-size='13' fill='%23888' fill-opacity='0.09'>" + txt + "</text></svg>";
    const el = document.createElement("div");
    el.id = "wm"; el.setAttribute("aria-hidden", "true");
    el.style.cssText = "position:fixed;inset:0;z-index:50;pointer-events:none;background-image:url(\"data:image/svg+xml;utf8," + encodeURIComponent(svg).replace(/'/g, "%27") + "\")";
    document.body.appendChild(el);
  }

  // After every sign-in: claim the free month (blogger link), ask new people for their profile and city, then show the app.
  async function afterSignIn(onboard) {
    await claimTrial();
    await claimRefInvite();
    let needProfile = false;
    try { const pr = await api("/v1/me/profile"); needProfile = !pr.city_id; } catch (e) { if (e.status === 404) needProfile = true; }
    if (onboard && needProfile && APP !== "admin") { active = "profile"; try { sessionStorage.setItem("friends.welcome", "1"); } catch { /* none */ } }
    await render(active);
    applyWatermark();
    if (onboard && needProfile && APP !== "admin") status(t("profile.welcome"));
    showTrialNotice();
    await runClockLink();
  }

  async function login() {
    try {
      let normalized = "";
      if (!ownAuth) {
        const phone = prompt(t("auth.phonePrompt"));
        if (!phone || !phone.trim()) return;
        normalized = phone.replace(/[\s()-]/g, "");
        if (!/^\+[1-9]\d{7,14}$/.test(normalized)) { status(t("auth.phoneInvalid"), true); return; }
      }
      if (ownAuth) {
        const ph = await ownLogin();
        if (!ph) return;
        user = await api("/v1/auth/me");
      } else {
      const client = await authClient();
      const { error } = await client.auth.signInWithOtp({ phone: normalized, options: { shouldCreateUser: true } });
      if (error) throw error;
      const code = prompt(t("auth.smsCodePrompt"));
      if (!code || !code.trim()) return;
      const result = await client.auth.verifyOtp({ phone: normalized, token: code.trim(), type: "sms" });
      if (result.error) throw result.error;
      await callback();
      }
      await syncLocaleAfterSignIn();
      await afterSignIn(true);
      status(t("auth.signedIn"));
    } catch (e) {
      status(e.message || t("auth.smsFailed"), true);
    }
  }

  async function callback() {
    if (ownAuth) { if (!token() && getRefresh()) await refresh(); return; }
    if (!supabaseUrl || !supabaseKey) return;
    const client = await authClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (data.session?.access_token) {
      sessionStorage.setItem(KEY, data.session.access_token);
      if (data.session.refresh_token) sessionStorage.setItem(REFRESH, data.session.refresh_token);
      user = data.session.user || null;
    } else {
      sessionStorage.removeItem(KEY);
      sessionStorage.removeItem(REFRESH);
    }
  }

  async function refresh() {
    if (ownAuth) {
      const rt = getRefresh();
      if (!rt) return false;
      try { storeSession(await ownPost("/v1/auth/refresh", { refresh_token: rt })); return true; }
      catch (e) { if (e.status === 401) clearTokens(); return false; }
    }
    try {
      const client = await authClient();
      const { data, error } = await client.auth.refreshSession();
      if (error || !data.session?.access_token) return false;
      sessionStorage.setItem(KEY, data.session.access_token);
      if (data.session.refresh_token) sessionStorage.setItem(REFRESH, data.session.refresh_token);
      return true;
    } catch {
      return false;
    }
  }

  async function api(path, options = {}, retry = true) {
    const h = new Headers(options.headers || {});
    if (token()) h.set("authorization", "Bearer " + token());
    if (options.body && !(options.body instanceof FormData) && !h.has("content-type")) h.set("content-type", "application/json");
    h.set("accept-language", I18N.getLocale());
    let r;
    try {
      r = await fetch(apiBase + path, { ...options, headers: h });
    } catch {
      const e = Error(t("error.network"));
      e.status = 0;
      throw e;
    }
    if (r.status === 401 && retry && await refresh()) return api(path, options, false);
    const ct = r.headers.get("content-type") || "";
    const d = ct.includes("application/json") ? await r.json() : await r.text();
    if (!r.ok) {
      const c = d && d.error;
      const e = Error(I18N.apiError(c, r.status));
      e.status = r.status;
      e.code = c;
      e.data = d;
      throw e;
    }
    return d;
  }

  // Language: the local choice is applied immediately; signed-in members also
  // store it on the server so notifications arrive in the same language.
  async function saveLocaleToServer(locale) {
    if (!token()) return;
    try { await api("/v1/me/preferences", { method: "PUT", body: JSON.stringify({ locale }) }); } catch { /* non-blocking */ }
  }

  async function syncLocaleAfterSignIn() {
    if (!token()) return;
    if (I18N.hasSavedChoice()) { await saveLocaleToServer(I18N.getLocale()); return; }
    try {
      const prefs = await api("/v1/me/preferences");
      if (prefs && I18N.LOCALES.includes(prefs.locale)) I18N.setLocale(prefs.locale, { persist: false });
    } catch { /* keep the detected locale */ }
  }

  document.addEventListener("click", e => {
    const option = e.target.closest("[data-locale-option]");
    if (!option) return;
    e.preventDefault();
    const locale = option.getAttribute("data-locale-option");
    if (I18N.setLocale(locale)) saveLocaleToServer(locale);
  });

  let candidateToken = null;
  I18N.onChange(() => { if (candidateToken) candidateTest(candidateToken); else render(active); });

  function authBar() {
    const el = document.querySelector(".topbar-right");
    if (!el) return;
    const chatBtn = token() && APP !== "admin" && !(APP === "pilot" && pilotMode() === "admin") ? '<button type="button" class="icon-button topbar-chat" data-view="messages" aria-label="' + esc(t("nav.messages")) + '">' + ic("chat") + "<span class=\"topbar-chat-label\">" + esc(t("nav.messages")) + '</span><span class="nav-badge" id="msg-badge" hidden></span></button>' : "";
    el.classList.toggle("signed-in", !!token());
    el.innerHTML = chatBtn + themeButton() + I18N.switcherHtml() + (token()
      ? '<span class="status-dot" aria-hidden="true"></span><span id="user-label">' + esc(user?.email || t("auth.signedInLabel")) + '</span><button class="outline-button" id="logout-button">' + esc(t("auth.logout")) + "</button>"
      : (ownAuth ? "" : '<span>' + esc(t("auth.required")) + '</span><button class="primary-button" id="login-button">' + esc(t("auth.login")) + "</button>"));
    document.querySelector("#login-button")?.addEventListener("click", login);
    document.querySelector("#logout-button")?.addEventListener("click", logout);
  }

  function wireCrmLink() {
    const a = document.querySelector("[data-crm-link]");
    if (a && crmUrl) { a.setAttribute("href", safeUrl(crmUrl)); a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener noreferrer"); }
  }
  wireCrmLink();


  // Mobile bottom bar: four primary sections plus "Menu", which opens a sheet
  // with every other section (like Kaspi / Facebook). Desktop keeps the sidebar.
  const menuSheet = document.querySelector("#menu-sheet");
  function openMenu() {
    if (!menuSheet) return;
    const items = [...document.querySelectorAll(".sidebar nav .nav-item:not([data-primary]):not(.nav-more):not([hidden])")];
    menuSheet.innerHTML = '<div class="menu-sheet-head"><h2 id="menu-sheet-title">' + esc(t("nav.menuTitle")) + '</h2><button type="button" class="outline-button" data-close-menu>' + esc(t("common.close")) + "</button></div>";
    const list = document.createElement("div");
    list.className = "menu-sheet-list";
    items.forEach(it => {
      const c = it.cloneNode(true);
      c.removeAttribute("data-primary");
      c.classList.toggle("active", c.dataset.view === active);
      list.appendChild(c);
    });
    menuSheet.appendChild(list);
    const lang = document.createElement("div");
    lang.className = "menu-sheet-lang";
    lang.innerHTML = I18N.switcherHtml() + themeButton() + (token() ? ' <button type="button" class="outline-button" id="menu-logout">' + esc(t("auth.logout")) + "</button>" : "");
    menuSheet.appendChild(lang);
    lang.querySelector("#menu-logout")?.addEventListener("click", () => { closeMenu(); logout(); });
    if (APP === "pilot") { const mode = document.createElement("div"); mode.className = "menu-sheet-lang"; mode.innerHTML = pilotModeCard(); menuSheet.appendChild(mode); wirePilotMode(); }
    if (typeof menuSheet.showModal === "function") menuSheet.showModal(); else menuSheet.setAttribute("open", "");
    I18N.applyStatic(menuSheet);
  }
  function closeMenu() { if (menuSheet && menuSheet.open) { if (typeof menuSheet.close === "function") menuSheet.close(); else menuSheet.removeAttribute("open"); } }
  document.addEventListener("click", e => {
    if (e.target.closest(".nav-more")) { e.preventDefault(); openMenu(); return; }
    if (!menuSheet || !menuSheet.open) return;
    if (e.target === menuSheet || e.target.closest("[data-close-menu]") || e.target.closest("#menu-sheet [data-view], #menu-sheet [data-crm-link]")) closeMenu();
  });
  function syncMoreButton() {
    const primary = isPrimary(navBlock(active));
    document.querySelectorAll(".nav-more").forEach(more => {
      more.classList.toggle("active", !primary);
      if (!primary) more.setAttribute("aria-current", "page"); else more.removeAttribute("aria-current");
    });
  }
  // Which bottom-bar block a screen belongs to, and the sub-sections shown as tabs inside a block.
  const BLOCK_ICONS = { events: ic("calendar"), learn: ic("learn"), business: ic("business"), experts: ic("star"), discounts: ic("percent") };
  const BLOCK_OF = { events: "overview", experts: "overview", members: "overview", member: "overview", announcements: "overview", polls: "overview",
    "my-card": "me", course: "learn", lesson: "learn", certificate: "learn", tests: "learn", test: "learn", deal: "business", deals: "business", partner: "card", discounts: "card",
    notifications: "messages", chat: "messages", host: "overview", blogger: "me", "partner-apply": "me", books: "learn", professions: "learn", templates: "learn", recordings: "learn", profile: "account", settings: "me", trust: "account", membership: "account", team: "account", companies: "account", checkin: "me", services: "me" };
  const BLOCK_TABS = { overview: ["overview", "events", "experts", "members", "announcements"], learn: ["learn", "professions", "books", "templates", "tests", "recordings"], business: ["business", "deals"], account: ["profile", "companies", "trust", "membership", "team"], card: ["card", "partner", "discounts"], messages: ["messages", "notifications"] };
  const isPrimary = v => !!document.querySelector('.sidebar nav [data-primary][data-view="' + v + '"]');
  // Bottom-bar button that lights up for a screen: its block, or "Сервисы" for everything else.
  const navBlock = v => { const b = BLOCK_OF[v] || v; return isPrimary(b) ? b : isPrimary("me") ? "me" : isPrimary("services") ? "services" : b; };
  // ---------- «Назад» как в Kaspi: всегда в одном месте — слева вверху, на всех внутренних экранах ----------
  const PARENT = { course: "learn", lesson: "course", certificate: "course", test: "tests", member: "members", deal: "deals", chat: "messages", host: "events", profile: "me", companies: "me", trust: "me", membership: "me", team: "me" };
  const ROOT_ADMIN = "admin-stats";
  const isRoot = v => isPrimary(v) || v === ROOT_ADMIN || (APP === "admin" && v !== "chat");
  const parentOf = v => PARENT[v] || (BLOCK_OF[v] && BLOCK_OF[v] !== v ? BLOCK_OF[v] : (APP === "admin" || (APP === "pilot" && pilotMode() === "admin") ? ROOT_ADMIN : "overview"));
  let navStack = [];
  function goBack() {
    if (navStack.length) { history.back(); return; }
    render(parentOf(active), { back: true });
  }
  window.addEventListener("popstate", () => { if (navStack.length) render(navStack.pop(), { back: true }); });
  function syncBackButton() {
    const bar = document.querySelector(".topbar");
    if (!bar) return;
    let btn = bar.querySelector(".topbar-back");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button"; btn.className = "topbar-back";
      btn.addEventListener("click", goBack);
      bar.insertBefore(btn, bar.firstChild);
    }
    btn.innerHTML = ic("back") + "<span>" + esc(t("nav.back")) + "</span>";
    btn.setAttribute("aria-label", t("nav.back"));
    const show = !!token() && !isRoot(active);
    btn.hidden = !show;
    bar.classList.toggle("has-back", show);
  }
  function blockTabs() {
    const block = BLOCK_OF[active] || active;
    const tabs = BLOCK_TABS[block];
    if (!tabs || !content.firstChild) return;
    const row = document.createElement("div");
    row.className = "chip-tabs block-tabs";
    row.setAttribute("role", "navigation");
    row.setAttribute("aria-label", t("nav." + block));
    row.innerHTML = tabs.map(v => '<button type="button" class="chip-tab' + (v === active ? " active" : "") + '" data-view="' + v + '"' + (v === active ? ' aria-current="page"' : "") + ">" + esc(t("nav." + v)) + "</button>").join("");
    content.insertBefore(row, content.firstChild);
  }

  // The phone stays signed in after the first SMS code (session kept on the device and refreshed automatically).
  // «Выйти на всех устройствах» ends every session of this account, e.g. after a lost phone.
  async function logout(everywhere) {
    if (ownAuth) { try { await ownPost("/v1/auth/logout", { refresh_token: getRefresh() || "", everywhere: everywhere === true }); } catch { /* best effort */ } }
    else try { const client = await authClient(); await client.auth.signOut(everywhere === true ? { scope: "global" } : undefined); } catch { /* sign-out is best effort */ }
    clearTokens();
    user = null;
    profile = null;
    roles = null;
    render();
  }

  function setHeading(view) {
    const key = VIEW_KEYS[view] || "overview";
    title.textContent = t("view." + key + ".title");
    subtitle.textContent = t("view." + key + ".subtitle");
  }

  // Install as an app from the website (PWA): shown only in a regular browser tab.
  let deferredInstall = null;
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredInstall = e; document.querySelectorAll("[data-install-now]").forEach(b => { b.hidden = false; }); });
  window.addEventListener("appinstalled", () => { deferredInstall = null; document.querySelectorAll(".install-card").forEach(el => el.remove()); });
  function isInstalled() {
    try { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; } catch { return false; }
  }
  function installDismissed() { try { return localStorage.getItem("friends.install.dismissed") === "1"; } catch { return false; } }
  function installCard() {
    if (isInstalled() || installDismissed()) return "";
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent || "");
    return '<aside class="install-card" aria-labelledby="install-title"><div><h3 id="install-title">' + esc(t("install.title")) + "</h3><p>" + esc(t(ios ? "install.ios" : "install.android")) + '</p></div><div class="install-actions"><button type="button" class="primary-button" data-install-now' + (deferredInstall ? "" : " hidden") + ">" + esc(t("install.button")) + '</button><button type="button" class="text-button" data-install-dismiss>' + esc(t("install.dismiss")) + "</button></div></aside>";
  }
  document.addEventListener("click", async e => {
    if (e.target.closest("[data-install-dismiss]")) {
      try { localStorage.setItem("friends.install.dismissed", "1"); } catch { /* storage may be blocked */ }
      e.target.closest(".install-card")?.remove();
    } else if (e.target.closest("[data-install-now]") && deferredInstall) {
      deferredInstall.prompt();
      try { await deferredInstall.userChoice; } catch { /* ignore */ }
      deferredInstall = null;
    }
  });

  async function expertInviteBanner() {
    let tok = null;
    try { tok = sessionStorage.getItem("friends.expertInvite"); } catch { /* none */ }
    if (!tok) return;
    let d;
    try { d = await api("/v1/public/expert-invites/" + encodeURIComponent(tok)); } catch (x) { status(x.message, true); return; }
    const box = document.createElement("div");
    box.className = "card-cta partner-cta";
    box.innerHTML = "<div><strong>" + esc(t("partners.inviteTitle", { cat: t("expertCategory." + d.category) })) + "</strong><p>" + esc(t("partners.inviteText", { months: d.free_months })) + "</p></div>";
    content.prepend(box);
  }
  // ---------- Blogger links: ?ref=CODE&utm_* → free trial month after sign-in (first touch wins) ----------
  const INVITE_KEY = "friends.invite", TRIAL_KEY = "friends.trialClaimed";
  const SITE_URL = "https://friendscommunity.kz";
  // One working WhatsApp number for the whole team: a first message from the member opens a free 24-hour conversation window.
  const WA_URL = "https://wa.me/77010999592?text=" + encodeURIComponent("Здравствуйте! Я зарегистрировался(ась) в Friends.");
  function readInvite() { try { return JSON.parse(store.get(INVITE_KEY) || "null"); } catch { return null; } }
  const REFINV_KEY = "friends.refInv";
  function captureRefInvite() {
    const code = (new URLSearchParams(location.search).get("inv") || "").trim().toLowerCase();
    if (/^[a-z0-9]{4,20}$/.test(code) && !store.get(REFINV_KEY)) store.set(REFINV_KEY, code);
  }
  async function claimRefInvite() {
    const code = store.get(REFINV_KEY);
    if (!code) return;
    try { await api("/v1/me/invite/claim", { method: "POST", body: JSON.stringify({ code }) }); } catch { /* try again next time unless invalid */ }
    store.set(REFINV_KEY, "");
  }
  function captureInvite() {
    captureRefInvite();
    const q = new URLSearchParams(location.search);
    const ref = (q.get("ref") || q.get("b") || "").trim().toLowerCase() || null;
    const inv = { ref, utm_source: q.get("utm_source"), utm_medium: q.get("utm_medium"), utm_campaign: q.get("utm_campaign") };
    if (!inv.ref && !inv.utm_source) return;
    // an explicit newer link replaces an older stored one (the person opened this blogger's link last)
    store.set(INVITE_KEY, JSON.stringify(inv));
  }
  async function inviteBanner() {
    const inv = readInvite();
    if (!inv || !inv.ref || APP === "admin") return;
    let d;
    try { d = await api("/v1/public/partners/" + encodeURIComponent(inv.ref)); } catch { return; }
    if (document.querySelector(".trial-cta")) return;
    const box = document.createElement("div");
    box.className = "card-cta partner-cta trial-cta";
    box.innerHTML = "<div><strong>" + ic("gift", "ic-inline") + " " + esc(t("trial.invitedTitle", { name: d.name })) + "</strong><p>" + esc(t("trial.invitedText", { days: d.trial_days })) + "</p></div>";
    content.prepend(box);
  }
  let trialNotice = null;
  function showTrialNotice() {
    if (!trialNotice || document.querySelector(".trial-cta")) return;
    const box = document.createElement("div");
    box.className = "card-cta partner-cta trial-cta";
    box.innerHTML = "<div><strong>" + ic("gift", "ic-inline") + " " + esc(trialNotice.invited_by ? t("trial.invitedTitle", { name: trialNotice.invited_by }) : t("trial.freeTitle")) + "</strong><p>" + esc(t("trial.started", { date: day(trialNotice.trial_until) })) + "</p></div>";
    content.prepend(box);
  }
  async function claimTrial() {
    if (APP === "admin" || store.get(TRIAL_KEY)) return;
    const inv = readInvite() || {};
    try {
      const r = await api("/v1/me/trial", { method: "POST", body: JSON.stringify({ ref: inv.ref || null, utm_source: inv.utm_source || null, utm_medium: inv.utm_medium || null, utm_campaign: inv.utm_campaign || null }) });
      store.set(TRIAL_KEY, "1"); store.set(INVITE_KEY, "");
      if (r.trial_until) { status(t("trial.started", { date: day(r.trial_until) })); trialNotice = r; }
    } catch (x) { if (x.status === 409) { store.set(TRIAL_KEY, "1"); store.set(INVITE_KEY, ""); } }
  }

  function signedOut() {
    authBar();
    setHeading("overview");
    setTimeout(() => { expertInviteBanner(); inviteBanner(); }, 0);
    content.innerHTML = '<div class="empty-panel login-panel"><div class="brand-mark" aria-hidden="true">f</div><p class="eyebrow">' + esc(t("login.eyebrow")) + "</p><h2>" + esc(t("login.title")) + "</h2><p>" + esc(t("login.text")) +
      '</p><div class="login-actions"><button class="primary-button" id="login-main">' + esc(t("login.sms")) + '</button>' +
      '</div>' + (ownAuth ? "" : '<div class="demo-note">' + esc(t("login.note")) + "</div>") + "</div>" + installCard();
    document.querySelector("#login-main").addEventListener("click", login);
  }

  const field = (label, name, value = "", type = "text", attrs = "") =>
    '<label class="field"><span>' + esc(label) + '</span><input name="' + esc(name) + '" type="' + type + '" value="' + esc(value) + '" ' + attrs + "></label>";
  const area = (label, name, value = "") =>
    '<label class="field"><span>' + esc(label) + '</span><textarea name="' + name + '" rows="4">' + esc(value) + "</textarea></label>";
  const option = (value, labelText, selected) => '<option value="' + esc(value) + '"' + (selected ? " selected" : "") + ">" + esc(labelText) + "</option>";
  function panel(h, desc, body) {
    return '<div class="section-heading"><div><h2>' + esc(h) + '</h2><p class="muted">' + esc(desc || "") + '</p></div></div><div class="empty-panel">' + body + "</div>";
  }

  async function overview() {
    let p = null, n = { items: [], unread_count: 0 }, inv = { items: [] };
    try { p = await api("/v1/me/profile"); } catch (e) { if (e.status !== 404) throw e; }
    profile = p;
    try { n = await api("/v1/me/notifications?limit=5"); } catch { /* optional widget */ }
    try { inv = await api("/v1/me/invoices?limit=5"); } catch { /* optional widget */ }
    let bdays = [], news = [];
    try { bdays = (await api("/v1/birthdays?days=7")).items || []; } catch { /* optional widget */ }
    try { news = (await api("/v1/announcements?kind=news&limit=3")).items || []; } catch { /* optional widget */ }
    let fbPending = [];
    try { fbPending = (await api("/v1/me/feedback-pending")).items || []; } catch { /* optional widget */ }
    let pulseHtml = "";
    try {
      const [ck, pl] = await Promise.all([api("/v1/me/checkin"), api("/v1/polls")]);
      if (ck.eligible && !ck.current) pulseHtml += '<div class="card-cta"><div><strong>' + esc(t("checkin.ctaTitle", { month: monthName(ck.period) })) + "</strong><p>" + esc(t("checkin.ctaText")) + '</p></div><button type="button" class="primary-button" data-view="checkin">' + esc(t("checkin.open")) + "</button></div>";
      const open = (pl.items || []).filter(x => !x.answered);
      if (open.length) pulseHtml += '<div class="card-cta"><div><strong>' + esc(t("polls.ctaTitle")) + "</strong><p>" + esc(open[0].question) + '</p></div><button type="button" class="primary-button" data-view="polls">' + esc(t("polls.answer")) + "</button></div>";
    } catch { /* optional widget */ }
    const fbHtml = pulseHtml + fbPending.map(ev => '<div class="card-cta"><div><strong>' + esc(t("feedback.askTitle", { title: ev.title })) + "</strong><p>" + esc(t("feedback.askText")) + '</p></div><button type="button" class="primary-button" data-feedback-event="' + esc(ev.id) + '" data-title="' + esc(ev.title) + '">' + esc(t("feedback.rate")) + "</button></div>").join("");
    const bdayHtml = bdays.length ? '<section class="empty-panel birthday-panel" aria-labelledby="bday-title"><h2 id="bday-title">' + esc(t("birthdays.title")) + "</h2>" +
      bdays.map(b => '<div class="list-row"><div class="member-avatar" aria-hidden="true">' + (b.is_today ? ic("cake") : esc((b.display_name || "?").slice(0, 1))) + "</div><div><strong>" + esc(b.is_today ? t("birthdays.today", { name: b.display_name }) : b.display_name) + "</strong><p>" +
        esc(b.is_today ? t("birthdays.wish") : t("birthdays.inDays", { date: pad2(b.day) + "." + pad2(b.month), days: b.in_days })) + "</p></div></div>").join("") + "</section>" : "";
    const newsHtml = news.length ? '<div class="section-heading"><div><h2>' + esc(t("announcements.newsTitle")) + '</h2></div><button class="text-button" data-view="announcements">' + esc(t("announcements.all")) + '</button></div><div class="empty-panel">' +
      news.map(a => '<div class="list-row"><div><strong>' + (a.pinned ? ic("pin", "ic-inline") + " " : "") + esc(a.title) + "</strong><p>" + esc(a.body) + "</p><small>" + esc(date(a.created_at)) + "</small></div></div>").join("") + "</div>" : "";
    const due = (inv.items || []).find(i => i.status !== "paid");
    const recent = (n.items || []).map(x => '<div class="list-row"><div><strong>' + esc(x.title) + "</strong><p>" + esc(x.body) + "</p><small>" + esc(date(x.created_at)) + '</small></div><span class="pill">' + esc(x.read_at ? t("status.read") : t("status.new")) + "</span></div>").join("")
      || '<p class="muted">' + esc(t("notifications.empty")) + "</p>";
    content.innerHTML =
      '<div class="block-tiles">' + ["events", "learn", "business", "experts", "discounts"].map(v => '<button type="button" class="block-tile" data-view="' + v + '"><span class="block-ic" aria-hidden="true">' + BLOCK_ICONS[v] + "</span><strong>" + esc(t("blocks." + v + ".title")) + "</strong><small>" + esc(t("blocks." + v + ".text")) + "</small></button>").join("") + "</div>" +
      '<div class="stats-grid">' +
      '<article class="stat-card"><span class="stat-icon blue" aria-hidden="true">◎</span><p>' + esc(t("overview.profile")) + '</p><strong class="active-text">' + esc(p ? t("overview.profileDone") : t("overview.profileTodo")) + "</strong><small>" + esc(t("overview.profileHint")) + "</small></article>" +
      '<article class="stat-card"><span class="stat-icon violet" aria-hidden="true">' + ic("bell") + '</span><p>' + esc(t("overview.notifications")) + "</p><strong>" + Number(n.unread_count || 0) + "</strong><small>" + esc(t("overview.unread")) + "</small></article>" +
      '<article class="stat-card"><span class="stat-icon green" aria-hidden="true">◇</span><p>' + esc(t("overview.invoicesDue")) + "</p><strong>" + esc(due ? money(due.amount_kzt) : t("common.none")) + "</strong><small>" + esc(due ? due.invoice_number : t("overview.noUnpaid")) + "</small></article>" +
      "</div>" + fbHtml + bdayHtml + newsHtml + installCard() +
      '<div class="section-heading"><div><h2>' + esc(t("overview.hello", { name: p?.display_name || user?.email || t("overview.participant") })) + '</h2><p class="muted">' + esc(t("overview.helloText")) + '</p></div><button class="text-button" data-view="profile">' + esc(t("overview.myProfile")) + "</button></div>" +
      '<div class="section-heading"><div><h2>' + esc(t("overview.recent")) + '</h2></div><button class="text-button" data-view="notifications">' + esc(t("overview.allNotifications")) + "</button></div>" +
      '<div class="empty-panel">' + recent + "</div>" +
      '<div class="section-heading"><div><h2>' + esc(t("overview.eventsTitle")) + '</h2><p class="muted">' + esc(t("overview.eventsText")) + '</p></div><button class="text-button" data-view="events">' + esc(t("overview.allEvents")) + "</button></div>";
  }

  // Two-step confirmation, then server-side deletion and local sign-out.
  async function deleteAccount() {
    if (!confirm(t("account.confirm"))) return;
    const word = t("account.confirmWord");
    const typed = prompt(t("account.confirmWordPrompt", { word }));
    if (typed === null) return;
    if (typed.trim().toUpperCase() !== word.toUpperCase()) { status(t("account.wrongWord"), true); return; }
    try {
      await api("/v1/me/account", { method: "DELETE" });
    } catch (e) {
      status(e.message, true);
      return;
    }
    if (!ownAuth) try { const client = await authClient(); await client.auth.signOut(); } catch { /* auth user may already be gone */ }
    clearTokens();
    user = null;
    profile = null;
    signedOut();
    status(t("account.deleted"));
  }

  // Free video room (Jitsi Meet): the link is created in one tap, opens in the browser/app, no account needed.
  const newVideoRoom = () => { const a = new Uint8Array(8); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.floor(Math.random() * 256); }); return "https://meet.jit.si/Friends-" + Array.from(a, b => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join(""); };
  function wireVideoRoom(scope) {
    scope.querySelectorAll("[data-video-room]").forEach(b => b.addEventListener("click", () => {
      const f = b.closest("form"); const i = f && f.querySelector('input[name="online_url"]');
      if (i) { i.value = newVideoRoom(); i.dispatchEvent(new Event("input", { bubbles: true })); status(t("video.created")); }
    }));
  }

  // The contract is shown in full; "Agree" turns on only after the text is scrolled to the end.
  async function readOffer() {
    let html = "";
    try { const r = await fetch("/offer.html", { cache: "no-store" }); if (r.ok) { const d = new DOMParser().parseFromString(await r.text(), "text/html"); const m = d.querySelector("#offer-text"); html = m ? m.innerHTML : ""; } } catch { /* offline */ }
    return new Promise(resolve => {
      const dlg = authDialog('<h3>' + esc(t("offer.title")) + '</h3><div class="offer-scroll" tabindex="0">' + (html || '<p>' + esc(t("offer.loadFailed")) + ' <a href="https://friendscommunity.kz/offer" target="_blank" rel="noopener noreferrer">friendscommunity.kz/offer</a></p>') + '</div><p class="muted offer-hint">' + esc(t("offer.scrollHint")) + '</p><div class="auth-actions"><button type="button" class="outline-button" data-x>' + esc(t("auth.cancel")) + '</button><button type="button" class="primary-button" data-ok disabled>' + esc(t("offer.agree")) + "</button></div>");
      dlg.root.querySelector(".auth-card").classList.add("offer-card");
      const sc = dlg.q(".offer-scroll"), ok = dlg.q("[data-ok]");
      const check = () => { if (html && sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 12) { ok.disabled = false; dlg.q(".offer-hint").hidden = true; } };
      sc.addEventListener("scroll", check); setTimeout(check, 100);
      dlg.q("[data-x]").addEventListener("click", () => { dlg.close(); resolve(false); });
      ok.addEventListener("click", () => { dlg.close(); resolve(true); });
    });
  }

  async function profileView() {
    let p = profile;
    try { if (!p) p = await api("/v1/me/profile"); } catch (e) { if (e.status !== 404) throw e; }
    p = p || { display_name: user?.email?.split("@")[0] || "", headline: "", bio: "", avatar_url: "", visibility: "members", city_id: null };
    const needsConsent = !p.consent_accepted_at;
    const needsOffer = p.offer_acceptance_required !== false;
    let offerAgreed = !needsOffer;
    const cities = (await api("/v1/cities").catch(() => ({ items: [] }))).items;
    const cityName = c => (I18N.getLocale() === "kk" && c.name_kk) || (I18N.getLocale() === "en" && c.name_en) || c.name;
    content.innerHTML = panel(t("profile.section"), t("profile.sectionText"),
      '<form id="profile-form" class="app-form">' +
      field(t("profile.name"), "display_name", p.display_name, "text", 'required maxlength="120" autocomplete="name"') +
      field(t("profile.headline"), "headline", p.headline || "", "text", 'maxlength="180"') +
      area(t("profile.bio"), "bio", p.bio || "") +
      field(t("profile.avatar"), "avatar_url", p.avatar_url || "", "url") +
      '<label class="field"><span>' + esc(t("profile.visibility")) + '</span><select name="visibility">' +
      ["members", "public", "private"].map(v => option(v, t("visibility." + v), p.visibility === v)).join("") +
      '</select></label>' +
      '<fieldset class="field kinds"><legend>' + esc(t("profile.kinds")) + "</legend>" + ["entrepreneur", "expert", "starter"].map(k => '<label class="consent-field"><input type="checkbox" name="kind" value="' + k + '"' + ((p.member_kinds || []).includes(k) ? " checked" : "") + "> <span>" + esc(t("kind." + k)) + "</span></label>").join("") + "<small>" + esc(t("profile.kindsHint")) + "</small></fieldset>" +
      '<label class="field"><span>' + esc(t("profile.gender")) + '</span><select name="gender">' + option("", t("gender.none"), !p.gender) + option("male", t("gender.male"), p.gender === "male") + option("female", t("gender.female"), p.gender === "female") + "</select></label>" +
      '<label class="field"><span>' + esc(t("profile.city")) + '</span><select name="city_id"' + (cities.length ? " required" : "") + '><option value="">' + esc(t("profile.cityPick")) + "</option>" + cities.map(c => option(c.id, cityName(c), p.city_id === c.id)).join("") + "</select></label>" +
      field(t("profile.birthDate"), "birth_date", p.birth_date || "", "date", 'max="2019-12-31"') +
      '<label class="consent-field"><input type="checkbox" name="birthday_visible" value="yes"' + (p.birthday_visible ? " checked" : "") + "> <span>" + esc(t("profile.birthdayVisible")) + "</span></label>" +
      (needsConsent
        ? '<label class="consent-field"><input type="checkbox" name="consent_accepted" value="yes" required> <span>' + esc(t("consent.label")) + " " +
          (privacyPolicyUrl ? '<a href="' + esc(safeUrl(privacyPolicyUrl)) + '" target="_blank" rel="noopener noreferrer">' + esc(t("consent.link")) + "</a>" : esc(t("consent.link"))) + "</span></label>"
        : "") +
      (needsOffer
        ? '<div class="consent-field offer-box"><button type="button" class="outline-button" id="offer-open">' + esc(t(p.offer_accepted_at ? "offer.openUpdated" : "offer.open")) + '</button><span id="offer-state" class="muted">' + esc(t("offer.notAccepted")) + "</span></div>"
        : "") +
      '<button class="primary-button">' + esc(t("profile.save")) + "</button></form>") +
      '<div id="wa-box"></div><div id="nudge-box"></div><section class="danger-zone" aria-labelledby="delete-account-title"><h2 id="delete-account-title">' + esc(t("account.section")) + '</h2><p class="muted">' + esc(t("account.sectionText")) +
      '</p><button type="button" class="danger-button" id="delete-account">' + esc(t("account.delete")) + "</button></section>";
    document.querySelector("#delete-account").addEventListener("click", deleteAccount);
    const offerBtn = document.querySelector("#offer-open");
    if (offerBtn) offerBtn.addEventListener("click", async () => { if (await readOffer()) { offerAgreed = true; document.querySelector("#offer-state").textContent = t("offer.accepted"); offerBtn.hidden = true; } });
    whatsappBox().catch(() => { /* optional section */ });
    nudgeBox().catch(() => { /* optional section */ });
    document.querySelector("#profile-form").addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      if (needsConsent && f.get("consent_accepted") !== "yes") { status(t("consent.required"), true); return; }
      if (needsOffer && !offerAgreed) { status(t("offer.required"), true); return; }
      try {
        profile = await api("/v1/me/profile", {
          method: "PUT",
          body: JSON.stringify({
            display_name: String(f.get("display_name")).trim(),
            headline: String(f.get("headline") || "").trim() || null,
            bio: String(f.get("bio") || "").trim() || null,
            avatar_url: String(f.get("avatar_url") || "").trim() || null,
            city_id: String(f.get("city_id") || "") || p.city_id || null,
            visibility: String(f.get("visibility")),
            gender: String(f.get("gender") || "") || null,
            member_kinds: f.getAll("kind").map(String),
            birth_date: String(f.get("birth_date") || "") || null,
            birthday_visible: f.get("birthday_visible") === "yes" && !!f.get("birth_date"),
            ...(needsConsent ? { consent_accepted: true } : {}),
            ...(needsOffer ? { offer_accepted: true } : {})
          })
        });
        if (needsConsent || needsOffer) await profileView();
        status(t("profile.saved"));
      } catch (x) {
        status(x.message, true);
      }
    });
  }

  async function members() {
    content.innerHTML = panel(t("members.section"), t("members.sectionText"),
      '<form id="search-form" class="search-form" role="search"><input name="q" maxlength="100" placeholder="' + esc(t("members.placeholder")) + '" aria-label="' + esc(t("members.searchLabel")) + '"><button class="primary-button">' + esc(t("members.search")) +
      '</button></form><div id="results" class="data-list" aria-live="polite">' + esc(t("common.loadingShort")) + "</div>");
    const load = async q => {
      const target = document.querySelector("#results");
      target.textContent = t("common.loadingShort");
      try {
        const d = await api("/v1/members?limit=50" + (q ? "&q=" + encodeURIComponent(q) : ""));
        target.innerHTML = d.items.length
          ? d.items.map(m => '<button type="button" class="member-result member-open" data-member="' + esc(m.user_id) + '"><div class="member-avatar" aria-hidden="true">' + esc((m.display_name || "?").slice(0, 1)) + '</div><div class="member-copy"><strong>' + esc(m.display_name) + "</strong><span>" + esc(m.headline || t("members.defaultHeadline")) + (m.city_name ? " · " + esc(m.city_name) : "") + "</span>" +
              ((m.reviews_count || (m.badges || []).length) ? '<span class="member-trust">' + (m.reviews_count ? stars(m.rating) + " (" + m.reviews_count + ")" : "") + (m.badges || []).map(b => ' <span class="mini-badge" title="' + esc(t("trust.badge." + b)) + '">' + ({ tax_clear: ic("receipt", "ic-inline"), credit_history: ic("bank", "ic-inline"), company: ic("building", "ic-inline") }[b] || "✓") + '<span class="sr-only">' + esc(t("trust.badge." + b)) + "</span></span>").join("") + "</span>" : "") + "</div></button>").join("")
          : '<p class="muted">' + esc(t("members.empty")) + "</p>";
        target.querySelectorAll("[data-member]").forEach(b => b.addEventListener("click", () => { memberId = b.dataset.member; render("member"); }));
      } catch (e) {
        target.textContent = e.message;
      }
    };
    document.querySelector("#search-form").addEventListener("submit", e => { e.preventDefault(); load(String(new FormData(e.currentTarget).get("q") || "").trim()); });
    await load("");
  }

  async function companies() {
    content.innerHTML = panel(t("companies.section"), t("companies.sectionText"),
      '<form id="company-form" class="app-form">' + field(t("companies.name"), "name", "", "text", 'required maxlength="160" autocomplete="organization"') + area(t("companies.description"), "description", "") + field(t("companies.website"), "website_url", "", "url") +
      '<button class="primary-button">' + esc(t("companies.add")) + '</button></form><div id="company-list" class="data-list">' + esc(t("common.loadingShort")) + "</div>");
    const load = async () => {
      const d = await api("/v1/companies");
      document.querySelector("#company-list").innerHTML = d.items.length
        ? d.items.map(c => '<div class="list-row"><div><strong>' + esc(c.name) + "</strong><p>" + esc(c.description || t("companies.noDescription")) + "</p>" + (c.website_url ? '<a href="' + esc(safeUrl(c.website_url)) + '" target="_blank" rel="noopener noreferrer">' + esc(t("companies.site")) + "</a>" : "") + '</div><span class="pill">' + esc(I18N.label("companyRole", c.role)) + "</span></div>").join("")
        : '<p class="muted">' + esc(t("companies.empty")) + "</p>";
    };
    document.querySelector("#company-form").addEventListener("submit", async e => {
      e.preventDefault();
      const form = e.currentTarget;
      const f = new FormData(form);
      try {
        await api("/v1/companies", { method: "POST", body: JSON.stringify({ name: String(f.get("name")).trim(), description: String(f.get("description") || "").trim() || null, website_url: String(f.get("website_url") || "").trim() || null, city_id: null }) });
        form.reset();
        await load();
        status(t("companies.added"));
      } catch (x) {
        status(x.message, true);
      }
    });
    try { await load(); } catch (e) { document.querySelector("#company-list").textContent = e.message; }
  }

  let focusEvent = null;
  async function events() {
    const d = await api("/v1/events?limit=50");
    const cards = (d.items || []).map(x => {
      const registered = x.registration_status === "registered";
      const count = Number(x.registered_count || 0);
      return '<article class="invoice-card"><div class="invoice-top"><div><span class="pill">' + esc(I18N.label("eventType", x.event_type, "events.defaultType")) + "</span><h3>" + esc(x.title) + "</h3><small>" + esc(date(x.starts_at)) + '</small></div><span class="pill">' + esc(I18N.label("registration", x.registration_status, "events.notRegistered")) + "</span></div>" +
        (x.topic ? '<p><strong>' + esc(t("meeting.topic")) + ":</strong> " + esc(x.topic) + "</p>" : "") +
        (x.speaker_name ? '<p><strong>' + esc(t("meeting.speaker")) + ":</strong> " + esc(x.speaker_name) + (x.speaker_bio ? " · " + esc(x.speaker_bio) : "") + "</p>" : "") +
        "<p>" + esc(x.description || "") + '</p><p class="muted">' + esc(x.location_name || "") + (x.address ? " · " + esc(x.address) : "") + "</p>" +
        '<p class="muted">' + esc(x.capacity ? t("events.registeredCountCapacity", { count, capacity: Number(x.capacity) }) : t("events.registeredCount", { count })) + "</p>" +
        '<div class="receipt-actions">' + (x.online_url ? '<a class="primary-button" href="' + esc(safeUrl(x.online_url)) + '" target="_blank" rel="noopener noreferrer">' + esc(t("meeting.join")) + "</a>" : "") +
        (APP === "admin" ? "" : '<button type="button" class="outline-button" data-event-chat="' + esc(x.id) + '">' + esc(t("meeting.chat")) + "</button>") +
        '<button type="button" class="outline-button" data-event-share="' + esc(x.id) + '">' + esc(t("meeting.share")) + "</button></div>" +
        '<div class="receipt-actions">' + (registered ? '<button class="outline-button" data-cancel-event="' + esc(x.id) + '">' + esc(t("events.cancel")) + "</button>" : '<button class="primary-button" data-register-event="' + esc(x.id) + '">' + esc(t("events.register")) + "</button>" +
          (x.registration_status === "declined" ? "" : '<button class="outline-button" data-decline-event="' + esc(x.id) + '">' + esc(t("events.decline")) + "</button>")) + "</div>" +
        "</article>";
    }).join("");
    const hostCta = APP === "admin" ? "" : '<div class="card-cta"><div><strong>' + esc(t("host.ctaTitle")) + "</strong><p>" + esc(t("host.ctaText")) + '</p></div><button type="button" class="primary-button" data-view="host">' + esc(t("host.ctaBtn")) + '</button></div><p class="center-link"><button type="button" class="text-button" data-view="recordings">' + esc(t("recordings.link")) + "</button></p>";
    const week = '<section class="week-card"><h3>' + esc(t("week.title")) + '</h3><ul class="week-list">' + ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map(k => '<li><strong>' + esc(t("week.d." + k)) + '</strong><span>' + esc(t("week.t." + k)) + "</span></li>").join("") + "</ul></section>";
    content.innerHTML = week + hostCta + panel(t("events.section"), t("events.sectionText"), cards || '<p class="muted">' + esc(t("events.empty")) + "</p>");
    content.querySelectorAll("[data-event-chat]").forEach(b => b.addEventListener("click", async () => {
      try { const r = await api("/v1/events/" + encodeURIComponent(b.dataset.eventChat) + "/chat", { method: "POST", body: "{}" }); chatRoom = r.room_id; render("chat"); } catch (e) { status(e.message, true); }
    }));
    content.querySelectorAll("[data-event-share]").forEach(b => b.addEventListener("click", async () => {
      const url = SITE_URL + "/live/?event=" + encodeURIComponent(b.dataset.eventShare);
      try { if (navigator.share) await navigator.share({ url, title: t("meeting.shareTitle") }); else { await navigator.clipboard.writeText(url); status(t("tests.copied")); } } catch { /* cancelled */ }
    }));
    if (focusEvent) { const el = content.querySelector('[data-event-share="' + focusEvent + '"]'); if (el) el.closest("article").scrollIntoView({ block: "start" }); focusEvent = null; }
    content.querySelectorAll("[data-register-event]").forEach(b => b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        await api("/v1/events/" + encodeURIComponent(b.dataset.registerEvent) + "/register", { method: "POST", body: JSON.stringify({}) });
        await events();
        status(t("events.registeredOk"));
      } catch (e) {
        status(e.message, true);
        b.disabled = false;
      }
    }));
    content.querySelectorAll("[data-decline-event]").forEach(b => b.addEventListener("click", async () => {
      try { await api("/v1/events/" + encodeURIComponent(b.dataset.declineEvent) + "/decline", { method: "POST", body: JSON.stringify({}) }); await events(); status(t("events.declinedOk")); } catch (e) { status(e.message, true); }
    }));
    content.querySelectorAll("[data-cancel-event]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm(t("events.cancelConfirm"))) return;
      try {
        await api("/v1/events/" + encodeURIComponent(b.dataset.cancelEvent) + "/cancel-registration", { method: "POST", body: JSON.stringify({}) });
        await events();
        status(t("events.cancelled"));
      } catch (e) {
        status(e.message, true);
      }
    }));
  }

  // ---------- Residents host events: calendar of free dates, request, my events, recordings ----------
  const pad2h = n => String(n).padStart(2, "0");
  const HOST_DURATIONS = [30, 45, 60, 90, 120, 180, 240];
  const localKey = d => d.getFullYear() + "-" + pad2h(d.getMonth() + 1) + "-" + pad2h(d.getDate());
  const hhmm = d => pad2h(d.getHours()) + ":" + pad2h(d.getMinutes());
  let hostMonth = null, hostPick = null, hostKind = "masterclass";
  const WEEKDAY_KEY = { 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat", 7: "sun" };
  async function host() {
    let slots, mine;
    try { [slots, mine] = await Promise.all([api("/v1/me/event-slots"), api("/v1/me/event-proposals")]); } catch (e) {
      if (e.status === 403) { content.innerHTML = panel(t("host.title"), t("host.needMembership"), ""); return; }
      throw e;
    }
    const rules = slots.rules, loc = I18N.getLocale() === "en" ? "en-GB" : I18N.getLocale() === "kk" ? "kk-KZ" : "ru-RU";
    const busy = {};
    slots.items.forEach(x => { const k = localKey(new Date(x.starts_at)); (busy[k] = busy[k] || []).push(x); });
    const now = Date.now(), minAt = now + rules.min_lead_hours * 3600e3, maxAt = now + rules.max_ahead_days * 86400e3;
    if (!hostMonth) hostMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const monthName = () => hostMonth.toLocaleDateString(loc, { month: "long", year: "numeric" });
    const dow = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(loc, { weekday: "short" }));
    const kinds = slots.kinds || [];
    const kindInfo = () => kinds.find(k => k.kind === hostKind) || null;
    const kindDow = () => { const k = kindInfo(); return k ? (k.weekday % 7) : null; };
    const dayOff = d => d.getTime() + 86399e3 < minAt || d.getTime() > maxAt || (kindDow() != null && d.getDay() !== kindDow());
    const kindFormats = () => { const k = kindInfo(); return k && k.formats ? k.formats : ["online", "offline"]; };
    const syncFormat = () => {
      const f = content.querySelector("#host-form"); if (!f) return;
      const allowed = kindFormats();
      f.querySelectorAll('[name="format"]').forEach(r => { r.disabled = !allowed.includes(r.value); r.closest("label").hidden = !allowed.includes(r.value); });
      if (!allowed.includes(f.format.value)) { const r = f.querySelector('[name="format"][value="' + allowed[0] + '"]'); r.checked = true; }
      content.querySelector("#host-offline").hidden = f.format.value !== "offline";
    };
    const kindBar = () => kinds.length ? '<fieldset class="kind-pick"><legend>' + esc(t("host.kindTitle")) + '</legend><div class="chip-row" role="group">' + kinds.map(k => '<button type="button" class="chip' + (k.kind === hostKind ? " active" : "") + '" aria-pressed="' + (k.kind === hostKind) + '" data-kind="' + esc(k.kind) + '">' + esc(t("host.kind." + k.kind)) + "</button>").join("") + '</div><p class="muted">' + esc(t("host.kindHint", { day: t("week.d." + WEEKDAY_KEY[(kindInfo() || { weekday: 3 }).weekday]) })) + "</p></fieldset>" : "";
    function calendar() {
      const first = new Date(hostMonth), lead = (first.getDay() + 6) % 7, cells = [];
      for (let i = 0; i < lead; i++) cells.push('<span class="cal-cell empty"></span>');
      const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
      for (let n = 1; n <= days; n++) {
        const d = new Date(first.getFullYear(), first.getMonth(), n), k = localKey(d), b = busy[k] || [], off = dayOff(d);
        cells.push('<button type="button" class="cal-cell ' + (off ? "off" : b.length ? "busy" : "free") + (k === hostPick ? " sel" : "") + '" data-day="' + k + '"' + (off ? " disabled" : "") + ' aria-label="' + esc(d.toLocaleDateString(loc, { day: "numeric", month: "long" }) + (b.length ? ", " + t("host.busyCount", { n: b.length }) : "")) + '"><span>' + n + "</span>" + (b.length ? "<i>" + b.length + "</i>" : "") + "</button>");
      }
      return kindBar() + '<div class="cal-head"><button type="button" class="outline-button" data-cal="-1" aria-label="' + esc(t("host.prevMonth")) + '">&lsaquo;</button><strong>' + esc(monthName()) + '</strong><button type="button" class="outline-button" data-cal="1" aria-label="' + esc(t("host.nextMonth")) + '">&rsaquo;</button></div>' +
        '<div class="cal-grid">' + dow.map(x => '<span class="cal-dow">' + esc(x) + "</span>").join("") + cells.join("") + "</div>";
    }
    function dayInfo() {
      if (!hostPick) return '<p class="muted">' + esc(t("host.pickDay")) + "</p>";
      const b = busy[hostPick] || [];
      return "<strong>" + esc(new Date(hostPick + "T12:00").toLocaleDateString(loc, { weekday: "long", day: "numeric", month: "long" })) + "</strong>" + (b.length ? '<ul class="plain-list">' + b.map(x => "<li>" + esc(hhmm(new Date(x.starts_at)) + "–" + hhmm(new Date(x.ends_at))) + " · " + esc(x.title || t("host.busyAnon")) + (x.mine ? ' <span class="pill">' + esc(t("host.mine")) + "</span>" : "") + "</li>").join("") + "</ul>" : '<p class="muted">' + esc(t("host.dayFree")) + "</p>");
    }
    const statusPill = x => '<span class="pill' + (x.status === "rejected" || x.status === "cancelled" ? " warn-pill" : "") + '">' + esc(t("host.status." + x.status)) + "</span>";
    const mineCard = x => {
      const ended = new Date(x.ends_at) < new Date(), live = (x.status === "pending" || x.status === "approved") && !ended;
      return '<article class="invoice-card"><div class="invoice-top"><div><span class="pill">' + esc(t("host.format." + x.format)) + "</span><h3>" + esc(x.title) + "</h3><small>" + esc(date(x.starts_at)) + " · " + esc(x.is_free ? t("host.free") : money(x.price_kzt)) + "</small></div>" + statusPill(x) + "</div>" +
        (x.review_note ? '<p class="muted">' + esc(x.review_note) + "</p>" : "") +
        (live && x.format === "online" ? '<form class="search-form" data-link-form="' + esc(x.id) + '"><input name="online_url" type="url" inputmode="url" value="' + esc(x.online_url || "") + '" placeholder="https://" aria-label="' + esc(t("host.link")) + '"><button type="button" class="outline-button" data-video-room>' + esc(t("video.create")) + '</button><button class="outline-button">' + esc(t("host.linkSave")) + "</button></form>" : "") +
        (live ? '<div class="receipt-actions"><button type="button" class="outline-button" data-prop-cancel="' + esc(x.id) + '">' + esc(t("host.cancel")) + "</button></div>" : "") +
        (x.status === "approved" && ended ? '<form class="app-form" data-rec-form="' + esc(x.id) + '"><h4>' + esc(t("host.recTitle")) + '</h4><label class="field"><span>' + esc(t("host.recUrl")) + '</span><input name="recording_url" type="url" inputmode="url" required placeholder="https://" value="' + esc(x.recording_url || "") + '"></label>' +
          '<label class="field"><span>' + esc(t("host.recWhere")) + '</span><select name="publish_to">' + ["none", "portfolio", "library"].map(v => option(v, t("host.rec." + v), v === x.publish_to)).join("") + "</select></label>" +
          (x.library_status !== "none" ? '<p class="muted">' + esc(t("host.lib." + x.library_status)) + "</p>" : "") + '<button class="primary-button">' + esc(t("host.recSave")) + "</button></form>" : "") + "</article>";
    };
    const form = '<form id="host-form" class="app-form">' + field(t("host.fTitle"), "title", "", "text", 'required minlength="3" maxlength="180"') + field(t("host.fTopic"), "topic", "", "text", 'maxlength="120"') + area(t("host.fDesc"), "description", "") +
      '<fieldset class="rating-pick"><legend>' + esc(t("host.fFormat")) + '</legend><label><input type="radio" name="format" value="online" checked> <span>' + esc(t("host.format.online")) + '</span></label><label><input type="radio" name="format" value="offline"> <span>' + esc(t("host.format.offline")) + "</span></label></fieldset>" +
      '<div id="host-offline" hidden>' + field(t("host.fLocation"), "location_name", "", "text", 'maxlength="200"') + field(t("host.fAddress"), "address", "", "text", 'maxlength="300"') + "</div>" +
      '<div class="form-grid">' + field(t("host.fDate"), "date", hostPick || "", "date", "required") + field(t("host.fTime"), "time", "10:00", "time", "required") +
      '<label class="field"><span>' + esc(t("host.fDuration")) + '</span><select name="duration_min">' + HOST_DURATIONS.map(v => option(v, t("host.minutes", { n: v }), v === 90)).join("") + "</select></label>" + field(t("host.fCapacity"), "capacity", "", "number", 'min="2" max="1000"') + "</div>" +
      '<fieldset class="rating-pick"><legend>' + esc(t("host.fPrice")) + '</legend><label><input type="radio" name="paid" value="0" checked> <span>' + esc(t("host.free")) + '</span></label><label><input type="radio" name="paid" value="1"> <span>' + esc(t("host.paid")) + "</span></label></fieldset>" +
      '<div id="host-price" hidden>' + field(t("host.fPriceKzt"), "price_kzt", "", "number", 'min="1" step="500"') + "</div>" +
      field(t("host.fSpeaker"), "speaker_name", "", "text", 'maxlength="160"') + field(t("host.fSpeakerBio"), "speaker_bio", "", "text", 'maxlength="600"') +
      '<p class="muted">' + esc(t("host.rules", { days: Math.round(rules.min_lead_hours / 24), max: rules.max_active })) + '</p><button class="primary-button">' + esc(t("host.submit")) + "</button></form>";
    content.innerHTML = panel(t("host.title"), t("host.text"), '<div id="host-cal"></div><div id="host-day" class="day-info"></div>') + panel(t("host.formTitle"), t("host.formText"), form) +
      panel(t("host.myTitle"), t("host.myText"), mine.items.length ? mine.items.map(mineCard).join("") : '<p class="muted">' + esc(t("host.myEmpty")) + "</p>");
    const draw = () => { content.querySelector("#host-cal").innerHTML = calendar(); content.querySelector("#host-day").innerHTML = dayInfo(); syncFormat(); };
    draw();
    content.querySelector("#host-cal").addEventListener("click", e => {
      const nav = e.target.closest("[data-cal]"), dayBtn = e.target.closest("[data-day]"), kindBtn = e.target.closest("[data-kind]");
      if (kindBtn) { hostKind = kindBtn.dataset.kind; if (hostPick && new Date(hostPick + "T12:00").getDay() !== kindDow()) { hostPick = null; content.querySelector('#host-form [name="date"]').value = ""; } draw(); }
      if (nav) { hostMonth = new Date(hostMonth.getFullYear(), hostMonth.getMonth() + Number(nav.dataset.cal), 1); draw(); }
      if (dayBtn) { hostPick = dayBtn.dataset.day; content.querySelector('#host-form [name="date"]').value = hostPick; draw(); }
    });
    const f = content.querySelector("#host-form");
    f.date.addEventListener("change", () => { hostPick = f.date.value || null; draw(); });
    f.querySelectorAll('[name="format"]').forEach(r => r.addEventListener("change", () => { content.querySelector("#host-offline").hidden = f.format.value !== "offline"; }));
    f.querySelectorAll('[name="paid"]').forEach(r => r.addEventListener("change", () => { content.querySelector("#host-price").hidden = f.paid.value !== "1"; }));
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const v = new FormData(f), starts = new Date(String(v.get("date")) + "T" + String(v.get("time"))), mins = Number(v.get("duration_min")), ends = new Date(starts.getTime() + mins * 60000);
      if ((busy[localKey(starts)] || []).some(x => starts < new Date(x.ends_at) && new Date(x.starts_at) < ends)) { status(I18N.apiError("slot_taken", 409), true); return; }
      const paid = v.get("paid") === "1", num = k => (v.get(k) ? Number(v.get(k)) : null), str = k => String(v.get(k) || "").trim() || null;
      try {
        await api("/v1/me/event-proposals", { method: "POST", body: JSON.stringify({ title: String(v.get("title")).trim(), topic: str("topic"), description: str("description"), format: String(v.get("format")), location_name: str("location_name"), address: str("address"),
          starts_at: starts.toISOString(), duration_min: mins, is_free: !paid, price_kzt: paid ? num("price_kzt") : null, capacity: num("capacity"), speaker_name: str("speaker_name"), speaker_bio: str("speaker_bio"), kind: kinds.length ? hostKind : null }) });
        hostPick = null; status(t("host.sent")); await host();
      } catch (x) { status(x.message, true); }
    });
    content.querySelectorAll("[data-prop-cancel]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm(t("host.cancelConfirm"))) return;
      try { await api("/v1/me/event-proposals/" + encodeURIComponent(b.dataset.propCancel) + "/cancel", { method: "POST", body: "{}" }); status(t("host.cancelled")); await host(); } catch (x) { status(x.message, true); }
    }));
    wireVideoRoom(content);
    content.querySelectorAll("[data-link-form]").forEach(fm => fm.addEventListener("submit", async e => {
      e.preventDefault();
      try { await api("/v1/me/event-proposals/" + encodeURIComponent(fm.dataset.linkForm) + "/link", { method: "POST", body: JSON.stringify({ online_url: fm.online_url.value.trim() }) }); status(t("host.linkSaved")); } catch (x) { status(x.message, true); }
    }));
    content.querySelectorAll("[data-rec-form]").forEach(fm => fm.addEventListener("submit", async e => {
      e.preventDefault();
      try { await api("/v1/me/event-proposals/" + encodeURIComponent(fm.dataset.recForm) + "/recording", { method: "POST", body: JSON.stringify({ recording_url: fm.recording_url.value.trim(), publish_to: fm.publish_to.value }) }); status(t("host.recSaved")); await host(); } catch (x) { status(x.message, true); }
    }));
  }

  async function recordings() {
    const d = await api("/v1/library/recordings");
    const card = x => '<article class="invoice-card"><div class="invoice-top"><div><span class="pill">' + esc(x.topic || t("recordings.defaultTopic")) + "</span><h3>" + esc(x.title) + "</h3><small>" + esc(t("recordings.by", { name: x.host_name })) + " · " + esc(day(x.starts_at)) + "</small></div></div>" +
      (x.description ? '<p class="muted">' + esc(x.description) + "</p>" : "") + '<div class="receipt-actions"><a class="primary-button" href="' + esc(safeUrl(x.recording_url)) + '" target="_blank" rel="noopener noreferrer">' + esc(t("recordings.watch")) + "</a></div></article>";
    content.innerHTML = '<div class="card-cta"><div><strong>' + esc(t("host.ctaTitle")) + "</strong><p>" + esc(t("host.ctaText")) + '</p></div><button type="button" class="primary-button" data-view="host">' + esc(t("host.ctaBtn")) + "</button></div>" +
      panel(t("recordings.title"), t("recordings.text"), d.items.length ? d.items.map(card).join("") : '<p class="muted">' + esc(t("recordings.empty")) + "</p>");
  }

  async function adminProposals() {
    let d;
    try { d = await api("/v1/admin/event-proposals"); } catch (e) { if (e.status === 403) { content.innerHTML = panel(t("adminProp.title"), t("adminProp.noAccess"), ""); return; } throw e; }
    const nowMs = Date.now(), pending = d.items.filter(x => x.status === "pending"), libs = d.items.filter(x => x.library_status === "requested"), upcoming = d.items.filter(x => x.status === "approved" && new Date(x.ends_at).getTime() > nowMs);
    const head = x => '<div class="invoice-top"><div><span class="pill">' + esc(t("host.format." + x.format)) + "</span><h3>" + esc(x.title) + "</h3><small>" + esc(x.host_name) + " · " + esc(date(x.starts_at)) + " · " + esc(x.is_free ? t("host.free") : money(x.price_kzt)) + "</small></div></div>";
    const pendCard = x => '<article class="invoice-card">' + head(x) + (x.topic ? "<p><strong>" + esc(x.topic) + "</strong></p>" : "") + (x.description ? "<p>" + esc(x.description) + "</p>" : "") +
      (x.speaker_name ? '<p class="muted">' + esc(t("adminProp.speaker", { name: x.speaker_name })) + "</p>" : "") + (x.format === "offline" ? '<p class="muted">' + esc((x.location_name || "") + (x.address ? ", " + x.address : "")) + "</p>" : "") +
      '<div class="receipt-actions"><button type="button" class="primary-button" data-prop-approve="' + esc(x.id) + '">' + esc(t("adminProp.approve")) + '</button><button type="button" class="outline-button" data-prop-reject="' + esc(x.id) + '">' + esc(t("adminProp.reject")) + "</button></div></article>";
    const libCard = x => '<article class="invoice-card">' + head(x) + '<p><a href="' + esc(safeUrl(x.recording_url)) + '" target="_blank" rel="noopener noreferrer">' + esc(t("recordings.watch")) + '</a></p><div class="receipt-actions"><button type="button" class="primary-button" data-lib="' + esc(x.id) + '" data-ok="1">' + esc(t("adminProp.libApprove")) + '</button><button type="button" class="outline-button" data-lib="' + esc(x.id) + '" data-ok="0">' + esc(t("adminProp.libReject")) + "</button></div></article>";
    const upCard = x => '<div class="list-row"><div><strong>' + esc(x.title) + "</strong><p>" + esc(x.host_name) + " · " + esc(date(x.starts_at)) + "</p></div></div>";
    content.innerHTML = panel(t("adminProp.title"), t("adminProp.text"), pending.length ? pending.map(pendCard).join("") : '<p class="muted">' + esc(t("adminProp.noPending")) + "</p>") +
      panel(t("adminProp.libTitle"), t("adminProp.libText"), libs.length ? libs.map(libCard).join("") : '<p class="muted">' + esc(t("adminProp.noLib")) + "</p>") +
      panel(t("adminProp.upTitle"), t("adminProp.upText"), upcoming.length ? upcoming.map(upCard).join("") : '<p class="muted">' + esc(t("adminProp.noUp")) + "</p>");
    content.querySelectorAll("[data-prop-approve]").forEach(b => b.addEventListener("click", async () => {
      try { await api("/v1/admin/event-proposals/" + encodeURIComponent(b.dataset.propApprove) + "/approve", { method: "POST", body: "{}" }); status(t("adminProp.approved")); await adminProposals(); } catch (x) { status(x.message, true); }
    }));
    content.querySelectorAll("[data-prop-reject]").forEach(b => b.addEventListener("click", async () => {
      const note = prompt(t("adminProp.rejectPrompt"));
      if (!note || !note.trim()) return;
      try { await api("/v1/admin/event-proposals/" + encodeURIComponent(b.dataset.propReject) + "/reject", { method: "POST", body: JSON.stringify({ note: note.trim() }) }); status(t("adminProp.rejected")); await adminProposals(); } catch (x) { status(x.message, true); }
    }));
    content.querySelectorAll("[data-lib]").forEach(b => b.addEventListener("click", async () => {
      try { await api("/v1/admin/event-proposals/" + encodeURIComponent(b.dataset.lib) + "/library", { method: "POST", body: JSON.stringify({ approved: b.dataset.ok === "1" }) }); status(t("adminProp.libDone")); await adminProposals(); } catch (x) { status(x.message, true); }
    }));
  }

  async function eventsAdmin() {
    const types = ["breakfast", "masterclass", "business_tour", "mastermind", "networking", "sports", "trip", "workshop", "charity", "other"];
    const body = '<form id="event-form" class="app-form">' +
      field(t("eventsAdmin.title"), "title", "", "text", 'required maxlength="180"') +
      field(t("meeting.topic"), "topic", "", "text", 'maxlength="200"') +
      field(t("meeting.speaker"), "speaker_name", "", "text", 'maxlength="160"') +
      area(t("eventsAdmin.description"), "description", "") +
      '<label class="field"><span>' + esc(t("eventsAdmin.type")) + '</span><select name="event_type">' + types.map(v => option(v, t("eventType." + v), false)).join("") + "</select></label>" +
      field(t("eventsAdmin.startsAt"), "starts_at", "", "datetime-local", "required") +
      field(t("eventsAdmin.endsAt"), "ends_at", "", "datetime-local") +
      field(t("eventsAdmin.location"), "location_name") +
      field(t("eventsAdmin.address"), "address") +
      field(t("eventsAdmin.online"), "online_url", "", "url") + '<button type="button" class="outline-button" data-video-room>' + esc(t("video.create")) + "</button>" +
      field(t("eventsAdmin.capacity"), "capacity", "", "number", 'min="1" step="1"') +
      '<label class="field"><span>' + esc(t("eventsAdmin.access")) + '</span><select name="visibility">' + option("members", t("eventsAdmin.accessMembers"), true) + option("public", t("eventsAdmin.accessPublic"), false) + "</select></label>" +
      '<label class="field"><span>' + esc(t("eventsAdmin.statusOnCreate")) + '</span><select name="status">' + option("draft", t("eventStatus.draft"), true) + option("published", t("eventsAdmin.publishNow"), false) + "</select></label>" +
      '<button class="primary-button">' + esc(t("eventsAdmin.create")) + '</button></form><div id="admin-event-list" class="data-list">' + esc(t("eventsAdmin.loading")) + "</div>";
    content.innerHTML = panel(t("eventsAdmin.section"), t("eventsAdmin.sectionText"), body);
    const load = async () => {
      const d = await api("/v1/admin/events");
      const target = document.querySelector("#admin-event-list");
      target.innerHTML = d.items.length
        ? d.items.map(x => '<article class="invoice-card"><div class="invoice-top"><div><h3>' + esc(x.title) + "</h3><small>" + esc(date(x.starts_at)) + '</small></div><span class="pill">' + esc(I18N.label("eventStatus", x.status)) + '</span></div><p class="muted">' + esc(t("eventsAdmin.registrations", { count: Number(x.registered_count || 0) })) + '</p><div class="receipt-actions">' +
          (x.status === "published" && new Date(x.starts_at) > new Date() ? '<button class="primary-button" data-invite-event="' + esc(x.id) + '">' + esc(t("invite.send")) + '</button><button class="outline-button" data-rsvp-event="' + esc(x.id) + '">' + esc(t("invite.rsvp")) + "</button>" : "") +
          (x.status !== "published" ? '<button class="primary-button" data-publish="' + esc(x.id) + '">' + esc(t("eventsAdmin.publish")) + "</button>" : '<button class="outline-button" data-cancel-publish="' + esc(x.id) + '">' + esc(t("eventsAdmin.unpublish")) + "</button>") + "</div></article>").join("")
        : '<p class="muted">' + esc(t("eventsAdmin.empty")) + "</p>";
      target.querySelectorAll("[data-publish]").forEach(b => b.addEventListener("click", () => setEventStatus(b.dataset.publish, "published")));
      target.querySelectorAll("[data-invite-event]").forEach(b => b.addEventListener("click", async () => {
        try { const r = await api("/v1/admin/events/" + encodeURIComponent(b.dataset.inviteEvent) + "/invite", { method: "POST", body: JSON.stringify({}) }); status(t("invite.sent", { n: r.sent, wa: r.whatsapp })); } catch (e) { status(e.message, true); }
      }));
      target.querySelectorAll("[data-rsvp-event]").forEach(b => b.addEventListener("click", async () => {
        try {
          const r = await api("/v1/admin/events/" + encodeURIComponent(b.dataset.rsvpEvent) + "/rsvp");
          const box = document.createElement("div");
          box.className = "demo-note";
          box.innerHTML = "<strong>" + esc(t("invite.summary", { invited: r.invited, going: r.going, declined: r.declined })) + "</strong>" +
            (r.going_names.length ? "<p>" + esc(t("invite.goingList")) + ": " + esc(r.going_names.join(", ")) + "</p>" : "") + (r.declined_names.length ? "<p>" + esc(t("invite.declinedList")) + ": " + esc(r.declined_names.join(", ")) + "</p>" : "");
          b.closest("article").querySelector(".demo-note")?.remove();
          b.closest("article").appendChild(box);
        } catch (e) { status(e.message, true); }
      }));
      target.querySelectorAll("[data-cancel-publish]").forEach(b => b.addEventListener("click", () => setEventStatus(b.dataset.cancelPublish, "cancelled")));
    };
    async function setEventStatus(id, statusValue) {
      try {
        await api("/v1/admin/events/" + encodeURIComponent(id) + "/status", { method: "PATCH", body: JSON.stringify({ status: statusValue }) });
        status(t("eventsAdmin.statusUpdated"));
        await load();
      } catch (e) {
        status(e.message, true);
      }
    }
    wireVideoRoom(content);
    document.querySelector("#event-form").addEventListener("submit", async e => {
      e.preventDefault();
      const form = e.currentTarget;
      const f = new FormData(form), starts = String(f.get("starts_at") || ""), ends = String(f.get("ends_at") || "");
      const cap = String(f.get("capacity") || "").trim();
      if (!starts) { status(t("eventsAdmin.startsRequired"), true); return; }
      try {
        await api("/v1/admin/events", {
          method: "POST",
          body: JSON.stringify({
            title: String(f.get("title")).trim(),
            description: String(f.get("description") || "").trim() || null,
            event_type: String(f.get("event_type")),
            starts_at: new Date(starts).toISOString(),
            ends_at: ends ? new Date(ends).toISOString() : null,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Almaty",
            location_name: String(f.get("location_name") || "").trim() || null,
            address: String(f.get("address") || "").trim() || null,
            online_url: String(f.get("online_url") || "").trim() || null,
            topic: String(f.get("topic") || "").trim() || null,
            speaker_name: String(f.get("speaker_name") || "").trim() || null,
            capacity: cap ? Number(cap) : null,
            visibility: String(f.get("visibility")),
            status: String(f.get("status"))
          })
        });
        form.reset();
        status(t("eventsAdmin.created"));
        await load();
      } catch (x) {
        status(x.message, true);
      }
    });
    try { await load(); } catch (e) { content.innerHTML = panel(t("view.eventsAdmin.title"), t("eventsAdmin.noAccess"), '<p class="muted">' + esc(e.message) + "</p>"); }
  }

  async function notifications() {
    const d = await api("/v1/me/notifications?limit=100");
    content.innerHTML = panel(t("notifications.section"), t("notifications.sectionText"), d.items.length
      ? d.items.map(n => '<div class="list-row"><div><strong>' + esc(n.title) + "</strong><p>" + esc(n.body) + "</p><small>" + esc(date(n.created_at)) + "</small>" + (n.action_url ? (IN_APP_LINKS[n.action_url] ? '<p><button type="button" class="text-button" data-view="' + IN_APP_LINKS[n.action_url] + '">' + esc(t("notifications.open")) + "</button></p>" : '<p><a href="' + esc(safeUrl(n.action_url)) + '">' + esc(t("notifications.open")) + "</a></p>") : "") + "</div>" +
        (!n.read_at ? '<button class="outline-button" data-read="' + esc(n.id) + '">' + esc(t("notifications.markRead")) + "</button>" : '<span class="pill">' + esc(t("status.read")) + "</span>") + "</div>").join("")
      : '<p class="muted">' + esc(t("notifications.empty")) + "</p>");
    content.querySelectorAll("[data-read]").forEach(b => b.addEventListener("click", async () => {
      try { await api("/v1/me/notifications/" + encodeURIComponent(b.dataset.read) + "/read", { method: "PATCH" }); await notifications(); } catch (e) { status(e.message, true); }
    }));
  }

  function referralProgress(d) {
    if (!d || !d.rule) return "";
    const need = d.rule.per_bonus, have = d.towards_next || 0;
    const dots = Array.from({ length: need }, (_, i) => '<span class="ref-dot' + (i < have ? " done" : "") + '" aria-hidden="true">' + (i < have ? "✓" : i + 1) + "</span>").join("");
    return '<section class="ref-progress" aria-label="' + esc(t("referral.progressLabel", { have, need })) + '"><div><strong>' + esc(t("referral.promo", { need, months: d.rule.months })) + "</strong><p>" + esc(t("referral.progress", { have, need })) + '</p></div><div class="ref-dots">' + dots + "</div></section>" +
      (d.bonuses || []).map(b => '<p class="demo-note">' + ic("gift", "ic-inline") + ' ' + esc(b.status === "applied" ? t("referral.bonusApplied", { months: b.months, date: day(b.membership_until) }) : t("referral.bonusEarned", { months: b.months })) + "</p>").join("") +
      ((d.items || []).length ? '<ul class="ref-list">' + d.items.map(i => "<li><span>" + esc(i.name) + '</span><span class="pill">' + esc(I18N.label("referralStatus", i.status)) + "</span></li>").join("") + "</ul>" : "");
  }
  async function membershipWithInvite() {
    await membership();
    const [mine, inv] = await Promise.all([api("/v1/me/referrals").catch(() => null), api("/v1/me/invite").catch(() => null)]);
    const box = document.createElement("div");
    const link = inv ? inv.link : "";
    box.innerHTML = panel(t("referral.title"), t("referral.textOnline"), referralProgress(mine) + (link
      ? '<div class="copy-row"><input readonly value="' + esc(link) + '" aria-label="' + esc(t("referral.myLink")) + '"><button type="button" class="outline-button" id="ref-copy">' + esc(t("adminPartners.copy")) + '</button></div><div class="receipt-actions"><button type="button" class="primary-button" id="ref-share">' + esc(t("referral.share")) + "</button></div>" : ""));
    content.appendChild(box);
    const copy = box.querySelector("#ref-copy"), share = box.querySelector("#ref-share");
    if (copy) copy.addEventListener("click", async () => { try { await navigator.clipboard.writeText(link); status(t("tests.copied")); } catch { /* manual copy */ } });
    if (share) share.addEventListener("click", async () => {
      try { if (navigator.share) await navigator.share({ url: link, title: "Friends", text: t("referral.shareText") }); else { await navigator.clipboard.writeText(link); status(t("tests.copied")); } } catch { /* cancelled */ }
    });
  }

  async function membership() {
    const d = await api("/v1/me/invoices?limit=100");
    const rows = d.items.map(i => '<article class="invoice-card"><div class="invoice-top"><div><span class="pill">' + esc(I18N.label("invoiceStatus", i.status)) + "</span><h3>" + esc(i.invoice_number || t("membership.invoice")) + "</h3><small>" + esc(I18N.label("invoicePurpose", i.purpose, "membership.purposeDefault")) + "</small></div><strong>" + esc(money(i.amount_kzt)) + "</strong></div>" +
      '<p class="muted">' + esc(t("membership.dates", { created: date(i.created_at), due: date(i.due_at) })) + "</p>" +
      ((i.receipt_submissions || []).map(r => '<p class="muted">' + esc(t("membership.receipt", { status: I18N.label("receiptStatus", r.status) })) + (r.review_note ? " — " + esc(r.review_note) : "") + "</p>").join("")) +
      (i.status !== "paid" ? '<div class="receipt-actions">' + (i.payment_url ? '<a class="outline-button" href="' + esc(safeUrl(i.payment_url)) + '" target="_blank" rel="noopener noreferrer">' + esc(t("membership.payKaspi")) + "</a>" : "") +
        '<form class="receipt-form" data-invoice="' + esc(i.id) + '"><label class="field"><span>' + esc(t("membership.amount")) + '</span><input name="amount" type="number" min="1" step="1" value="' + esc(i.amount_kzt) + '" required></label><label class="field"><span>' + esc(t("membership.receiptFile")) +
        '</span><input name="receipt" type="file" accept="image/jpeg,image/png,application/pdf" required></label><button class="primary-button">' + esc(t("membership.sendReceipt")) + "</button></form></div>" : "") + "</article>").join("");
    content.innerHTML = panel(t("membership.section"), t("membership.sectionText"), rows || '<p class="muted">' + esc(t("membership.empty")) + "</p>");
    content.querySelectorAll(".receipt-form").forEach(form => form.addEventListener("submit", async e => {
      e.preventDefault();
      const f = form.elements.receipt.files[0], amount = Number(form.elements.amount.value);
      if (!f || f.size > 10485760 || !["image/jpeg", "image/png", "application/pdf"].includes(f.type)) { status(t("membership.fileInvalid"), true); return; }
      const b = form.querySelector("button");
      b.disabled = true;
      try {
        const intent = await api("/v1/me/invoices/" + encodeURIComponent(form.dataset.invoice) + "/receipt-upload-url", { method: "POST", body: JSON.stringify({ content_type: f.type }) });
        const up = await fetch(intent.upload_url, { method: "PUT", headers: { "content-type": f.type, "x-upsert": "false" }, body: f });
        if (!up.ok) throw Error(t("membership.uploadFailed"));
        await api("/v1/me/invoices/" + encodeURIComponent(form.dataset.invoice) + "/receipts", { method: "POST", body: JSON.stringify({ intent_id: intent.intent_id, claimed_amount_kzt: amount }) });
        await membership();
        status(t("membership.sent"));
      } catch (x) {
        status(x.message, true);
        b.disabled = false;
      }
    }));
  }

  async function admin() {
    const d = await api("/v1/admin/payment-receipts?status=pending&limit=100");
    const rows = d.items.map(r => '<article class="invoice-card"><div class="invoice-top"><div><span class="pill">' + esc(t("admin.pending")) + "</span><h3>" + esc(r.invoice_number) + "</h3><small>" + esc(r.member_email || t("admin.member")) + "</small></div><strong>" + esc(money(r.claimed_amount_kzt)) + "</strong></div>" +
      '<p class="muted">' + esc(t("admin.invoiceAmount", { amount: money(r.invoice_amount_kzt) })) + " · " + esc(date(r.created_at)) + "</p>" +
      '<div class="receipt-actions"><button class="primary-button" data-approve="' + esc(r.id) + '">' + esc(t("admin.approve")) + '</button><button class="outline-button" data-reject="' + esc(r.id) + '">' + esc(t("admin.reject")) + '</button><button class="outline-button" data-view-receipt="' + esc(r.id) + '">' + esc(t("admin.open")) + "</button></div></article>").join("");
    content.innerHTML = panel(t("admin.section"), t("admin.sectionText"), rows || '<p class="muted">' + esc(t("admin.empty")) + "</p>") + '<div class="demo-note">' + esc(t("admin.note")) + "</div>";
    content.querySelectorAll("[data-approve]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm(t("admin.approveConfirm"))) return;
      try { await api("/v1/admin/payment-receipts/" + encodeURIComponent(b.dataset.approve) + "/approve", { method: "POST", body: JSON.stringify({}) }); await admin(); status(t("admin.approved")); } catch (e) { status(e.message, true); }
    }));
    content.querySelectorAll("[data-reject]").forEach(b => b.addEventListener("click", async () => {
      const note = prompt(t("admin.rejectPrompt"));
      if (!note?.trim()) return;
      try { await api("/v1/admin/payment-receipts/" + encodeURIComponent(b.dataset.reject) + "/reject", { method: "POST", body: JSON.stringify({ review_note: note.trim() }) }); await admin(); status(t("admin.rejected")); } catch (e) { status(e.message, true); }
    }));
    content.querySelectorAll("[data-view-receipt]").forEach(b => b.addEventListener("click", async () => {
      const tab = window.open("about:blank", "_blank");
      if (!tab) { status(t("admin.popups"), true); return; }
      tab.opener = null;
      try { const r = await api("/v1/admin/payment-receipts/" + encodeURIComponent(b.dataset.viewReceipt) + "/download-url"); tab.location.href = r.download_url; } catch (e) { tab.close(); status(e.message, true); }
    }));
  }


  const EXPERT_CATEGORIES = ["law", "accounting", "finance", "marketing", "smm", "sales", "it", "ai", "hr", "design", "production", "construction", "realestate", "logistics", "horeca", "retail", "education", "coaching", "photo_video", "events", "other"];

  function expertCard(x, adminMode) {
    const rows = [
      x.services ? '<p><strong>' + esc(t("experts.services")) + ":</strong> " + esc(x.services) + "</p>" : "",
      x.description ? "<p>" + esc(x.description) + "</p>" : "",
      x.price_info ? '<p class="muted">' + esc(t("experts.price")) + ": " + esc(x.price_info) + "</p>" : "",
      x.resident_offer ? '<p class="expert-offer">' + esc(t("experts.offer")) + ": " + esc(x.resident_offer) + "</p>" : "",
      x.contact ? '<p class="muted">' + esc(t("experts.contact")) + ": " + esc(x.contact) + "</p>" : ""
    ].join("");
    return '<article class="invoice-card expert-card"><div class="invoice-top"><div><span class="pill">' + esc(I18N.label("expertCategory", x.category)) + "</span><h3>" + esc(x.title) + "</h3><small>" + esc(x.display_name || t("admin.member")) +
      (adminMode && x.member_email ? " · " + esc(x.member_email) : "") + "</small></div></div>" + rows +
      (adminMode ? '<div class="receipt-actions"><button class="primary-button" data-expert-approve="' + esc(x.id) + '">' + esc(t("adminExperts.approve")) + '</button><button class="outline-button" data-expert-reject="' + esc(x.id) + '">' + esc(t("adminExperts.reject")) + "</button></div>" : "") +
      "</article>";
  }

  const partnerBadge = x => x && x.partner ? '<span class="trust-badge partner-badge"><span aria-hidden="true">★</span> ' + esc(t("partners.badge")) + "</span>" : "";

  async function experts() {
    const catOptions = '<option value="">' + esc(t("experts.allCategories")) + "</option>" + EXPERT_CATEGORIES.map(c => option(c, t("expertCategory." + c), false)).join("");
    content.innerHTML = panel(t("experts.section"), t("experts.sectionText"),
      '<form id="expert-search" class="search-form" role="search"><input name="q" maxlength="100" placeholder="' + esc(t("experts.placeholder")) + '" aria-label="' + esc(t("experts.searchLabel")) + '"><select name="category" aria-label="' + esc(t("experts.categoryLabel")) + '">' + catOptions +
      '</select><button class="primary-button">' + esc(t("members.search")) + '</button></form><div id="expert-results" class="data-list" aria-live="polite">' + esc(t("common.loadingShort")) + "</div>") +
      '<div id="my-expert"></div>';
    const load = async () => {
      const f = new FormData(document.querySelector("#expert-search"));
      const params = new URLSearchParams({ limit: "50" });
      const q = String(f.get("q") || "").trim(), cat = String(f.get("category") || "");
      if (q) params.set("q", q);
      if (cat) params.set("category", cat);
      const target = document.querySelector("#expert-results");
      target.textContent = t("common.loadingShort");
      try {
        const d = await api("/v1/experts?" + params.toString());
        target.innerHTML = d.items.length ? d.items.map(x => expertCard(x, false).replace("</h3>", "</h3>" + partnerBadge(x))).join("") : '<p class="muted">' + esc(t("experts.empty")) + "</p>";
      } catch (e) { target.textContent = e.message; }
    };
    document.querySelector("#expert-search").addEventListener("submit", e => { e.preventDefault(); load(); });
    await load();
    await myExpertForm();
  }

  async function myExpertForm() {
    const host = document.querySelector("#my-expert");
    if (!host) return;
    let own = null;
    try { own = await api("/v1/me/expert"); } catch (e) { if (e.status !== 404) { host.innerHTML = '<p class="muted">' + esc(e.message) + "</p>"; return; } }
    const v = own || { category: "other", title: "", description: "", services: "", price_info: "", contact: "", resident_offer: "" };
    const statusLine = own ? '<p class="expert-status ' + esc(own.status) + '">' + esc(t("expertStatus." + own.status)) + (own.review_note ? " — " + esc(own.review_note) : "") + "</p>" : "";
    host.innerHTML = panel(t(own ? "experts.myCard" : "experts.become"), t("experts.becomeText"),
      statusLine + '<form id="expert-form" class="app-form">' +
      '<label class="field"><span>' + esc(t("experts.category")) + '</span><select name="category">' + EXPERT_CATEGORIES.map(c => option(c, t("expertCategory." + c), v.category === c)).join("") + "</select></label>" +
      field(t("experts.title"), "title", v.title, "text", 'required minlength="2" maxlength="160"') +
      area(t("experts.servicesField"), "services", v.services || "") +
      area(t("experts.description"), "description", v.description || "") +
      field(t("experts.priceField"), "price_info", v.price_info || "", "text", 'maxlength="300"') +
      field(t("experts.offerField"), "resident_offer", v.resident_offer || "", "text", 'maxlength="500"') +
      field(t("experts.contactField"), "contact", v.contact || "", "text", 'maxlength="300"') +
      '<p class="muted">' + esc(t("experts.moderationNote")) + '</p><button class="primary-button">' + esc(t(own ? "experts.update" : "experts.submit")) + "</button></form>");
    document.querySelector("#expert-form").addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const val = k => String(f.get(k) || "").trim() || null;
      try {
        await api("/v1/me/expert", { method: "PUT", body: JSON.stringify({ category: String(f.get("category")), title: String(f.get("title") || "").trim(), services: val("services"), description: val("description"), price_info: val("price_info"), resident_offer: val("resident_offer"), contact: val("contact") }) });
        await myExpertForm();
        status(t("experts.saved"));
      } catch (x) { status(x.message, true); }
    });
  }

  async function adminExperts() {
    const [d, inv] = await Promise.all([api("/v1/admin/experts?status=pending&limit=100"), api("/v1/admin/expert-invites").catch(() => null)]);
    content.innerHTML = (inv ? panel(t("partners.title"), t("partners.text", { slots: inv.slots, partners: inv.partners }),
        '<form id="partner-form" class="app-form"><label class="field"><span>' + esc(t("experts.category")) + '</span><select name="category">' + EXPERT_CATEGORIES.map(c2 => option(c2, t("expertCategory." + c2), false)).join("") + "</select></label>" +
        field(t("partners.note"), "note", "", "text", 'maxlength="200"') + field(t("partners.months"), "free_months", "6", "number", 'min="1" max="24" required') +
        '<button class="primary-button">' + esc(t("partners.create")) + '</button><div id="partner-link"></div></form>' +
        (inv.items.length ? '<div class="table-scroll"><table class="data-table"><thead><tr><th>' + esc(t("experts.category")) + "</th><th>" + esc(t("partners.note")) + "</th><th>" + esc(t("partners.state")) + "</th><th></th></tr></thead><tbody>" +
          inv.items.map(i => "<tr><td>" + esc(t("expertCategory." + i.category)) + "</td><td>" + esc(i.note || "") + "</td><td>" + esc(i.used_at ? t("partners.used", { name: i.used_by_name || "—" }) + (i.card_status ? " · " + t("expertStatus." + i.card_status) : "") : new Date(i.expires_at) < new Date() ? t("partners.expired") : t("partners.waiting")) + "</td><td>" +
            (i.used_at ? "" : '<button type="button" class="text-button" data-partner-del="' + esc(i.id) + '">' + esc(t("tests.deleteInvite")) + "</button>") + "</td></tr>").join("") + "</tbody></table></div>" : "")) : "") +
      panel(t("adminExperts.section"), t("adminExperts.sectionText"), d.items.length ? d.items.map(x => expertCard(x, true)).join("") : '<p class="muted">' + esc(t("adminExperts.empty")) + "</p>");
    document.querySelector("#partner-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      try {
        const r = await api("/v1/admin/expert-invites", { method: "POST", body: JSON.stringify({ category: String(f.get("category")), note: String(f.get("note") || "").trim() || undefined, free_months: Number(f.get("free_months")) || 6 }) });
        const base = location.origin + location.pathname.replace(/admin(\.html)?$/, "");
        const url = base + "?expert=" + encodeURIComponent(r.token);
        const msg = t("partners.message", { cat: t("expertCategory." + f.get("category")), months: f.get("free_months"), url });
        document.querySelector("#partner-link").innerHTML = '<label class="field"><span>' + esc(t("tests.linkReady")) + '</span><input readonly id="partner-url" value="' + esc(url) + '"></label><div class="receipt-actions"><a class="primary-button" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text=' + encodeURIComponent(msg) + '">WhatsApp</a></div>';
      } catch (x) { status(x.message, true); }
    });
    content.querySelectorAll("[data-partner-del]").forEach(b => b.addEventListener("click", async () => { try { await api("/v1/admin/expert-invites/" + b.dataset.partnerDel, { method: "DELETE" }); await adminExperts(); } catch (x) { status(x.message, true); } }));
    content.querySelectorAll("[data-expert-approve]").forEach(b => b.addEventListener("click", async () => {
      try { await api("/v1/admin/experts/" + encodeURIComponent(b.dataset.expertApprove) + "/approve", { method: "POST", body: JSON.stringify({}) }); await adminExperts(); status(t("adminExperts.approved")); } catch (e) { status(e.message, true); }
    }));
    content.querySelectorAll("[data-expert-reject]").forEach(b => b.addEventListener("click", async () => {
      const note = prompt(t("adminExperts.rejectPrompt"));
      if (!note?.trim()) return;
      try { await api("/v1/admin/experts/" + encodeURIComponent(b.dataset.expertReject) + "/reject", { method: "POST", body: JSON.stringify({ review_note: note.trim() }) }); await adminExperts(); status(t("adminExperts.rejected")); } catch (e) { status(e.message, true); }
    }));
  }

  function noAdminAccess() {
    setHeading("overview");
    content.innerHTML = '<div class="empty-panel"><h2>' + esc(t("adminApp.noAccessTitle")) + "</h2><p>" + esc(t("adminApp.noAccessText")) + '</p><a class="primary-button" href="./">' + esc(t("adminApp.toResident")) + "</a></div>";
  }

  async function loadRoles() {
    if (roles) return roles;
    try { roles = (await api("/v1/me/roles")).roles || []; } catch { roles = []; }
    return roles;
  }
  const isStaff = r => r.some(x => ["admin", "moderator", "billing_admin", "sales", "marketing", "accountant"].includes(x));


  // ---------- Learning ----------
  let learnCourse = null, learnLesson = null;

  // Minimal, safe Markdown: escape first, then ## headings, -/1. lists, **bold**.
  function md(text) {
    const lines = String(text || "").split(/\r?\n/);
    let html = "", list = null;
    const inline = s => esc(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    const close = () => { if (list) { html += "</" + list + ">"; list = null; } };
    let para = [];
    const flush = () => { if (para.length) { html += "<p>" + inline(para.join(" ")) + "</p>"; para = []; } };
    let table = null;
    const closeTable = () => {
      if (!table) return;
      const [head, ...rows] = table;
      html += '<div class="table-scroll"><table class="data-table lesson-table"><thead><tr>' + head.map(h => "<th>" + inline(h) + "</th>").join("") + "</tr></thead><tbody>" +
        rows.map(r => "<tr>" + head.map((_, k) => "<td>" + inline(r[k] || "") + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>";
      table = null;
    };
    for (const raw of lines) {
      const line = raw.trim();
      if (/^\|.*\|$/.test(line)) {
        flush(); close();
        if (/^\|[\s:|-]+\|$/.test(line)) continue;
        (table = table || []).push(line.slice(1, -1).split("|").map(x => x.trim()));
        continue;
      }
      closeTable();
      if (!line) { flush(); close(); continue; }
      let m;
      if ((m = line.match(/^##\s+(.*)$/))) { flush(); close(); html += "<h3>" + inline(m[1]) + "</h3>"; }
      else if ((m = line.match(/^[-•]\s+(.*)$/))) { flush(); if (list !== "ul") { close(); html += "<ul>"; list = "ul"; } html += "<li>" + inline(m[1]) + "</li>"; }
      else if ((m = line.match(/^\d+[.)]\s+(.*)$/))) { flush(); if (list !== "ol") { close(); html += "<ol>"; list = "ol"; } html += "<li>" + inline(m[1]) + "</li>"; }
      else { close(); para.push(line); }
    }
    flush(); close(); closeTable();
    return html;
  }

  function progressBar(done, total) {
    const pct = total ? Math.round(done / total * 100) : 0;
    return '<div class="learn-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="' + esc(t("learn.progress", { done, total })) + '"><span style="width:' + pct + '%"></span></div><small>' + esc(t("learn.progress", { done, total })) + "</small>";
  }

  function joinForm() {
    return '<form id="join-form" class="search-form"><input name="code" required minlength="6" maxlength="32" autocomplete="one-time-code" placeholder="' + esc(t("learn.codePlaceholder")) + '" aria-label="' + esc(t("learn.codeLabel")) + '"><button class="primary-button">' + esc(t("learn.join")) + "</button></form>";
  }
  function wireJoin(after) {
    const f = document.querySelector("#join-form");
    if (!f) return;
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const code = String(new FormData(f).get("code") || "").trim();
      const send = async accept => {
        const r = await api("/v1/team/join", { method: "POST", body: JSON.stringify(accept ? { code, accept_terms: true } : { code }) });
        status(t("learn.joined", { name: r.employer_name || t("admin.member") }));
        await after();
      };
      try { await send(false); }
      catch (x) {
        if (x.code !== "terms_acknowledgment_required" || !x.data?.terms) { status(x.message, true); return; }
        const tm = x.data.terms;
        const box = document.createElement("div");
        box.className = "demo-note terms-box";
        box.innerHTML = "<h3>" + esc(t("learn.termsTitle")) + "</h3><p>" + esc(t("learn.termsText", { name: tm.employer_name || t("admin.member"), value: tm.training_value_kzt ? money(tm.training_value_kzt) : "—", months: tm.retention_months || "—" })) +
          '</p><label class="consent-field"><input type="checkbox" id="terms-ack"> <span>' + esc(t("learn.termsAck")) + '</span></label><button type="button" class="primary-button" id="terms-accept">' + esc(t("learn.join")) + "</button>";
        f.after(box);
        box.querySelector("#terms-accept").addEventListener("click", async () => {
          if (!box.querySelector("#terms-ack").checked) { status(t("learn.termsRequired"), true); return; }
          try { await send(true); } catch (y) { status(y.message, true); }
        });
      }
    });
  }

  // Course cover illustration: category colour, emoji and a pattern seeded by the slug (no image files needed).
  const COVER = { sales: ["#1468d8", "#4fa3ff", "briefcase"], marketing: ["#c2306b", "#ff7aa8", "megaphone"], finance: ["#127a4a", "#3fd08a", "bank"], management: ["#6b3fd1", "#a98bff", "users"],
    growth: ["#b45a00", "#ffb04f", "trend"], ai: ["#0b6c8a", "#3cd2f0", "spark"], legal: ["#41506b", "#9fb0cf", "scale"], books: ["#3d2f8f", "#8c7ae6", "book"], other: ["#7a4b14", "#e3a35b", "store"] };
  // ---------- Professions: learning paths made of courses, books and templates ----------
  let profOpen = null;
  async function professions() {
    let list = [], tpl = [];
    try { list = await (await fetch("professions.json", { cache: "no-cache" })).json(); } catch { list = []; }
    try { tpl = await (await fetch("templates/manifest.json", { cache: "no-cache" })).json(); } catch { tpl = []; }
    const access = await api("/v1/learn/access");
    const d = await api("/v1/learn/courses");
    const bySlug = Object.fromEntries(d.items.map(c => [c.slug, c]));
    const lang = ["kk", "en"].includes(I18N.getLocale()) ? I18N.getLocale() : "ru";
    const L = o => (o && (o[lang] || o.ru)) || "";
    const stats = p => {
      const cs = p.courses.map(slug => bySlug[slug]).filter(Boolean);
      const total = cs.reduce((a, c) => a + c.lesson_count, 0), done = cs.reduce((a, c) => a + c.completed_count, 0);
      return { cs, total, done, pct: total ? Math.round(done / total * 100) : 0, finished: cs.length > 0 && cs.every(c => c.lesson_count && c.completed_count >= c.lesson_count) };
    };
    if (profOpen) {
      const p = list.find(x => x.id === profOpen);
      if (p) {
        const st = stats(p);
        const steps = st.cs.map((c, i) => '<li class="lesson-row"><button type="button" class="lesson-link" data-prof-course="' + esc(c.slug) + '"><span class="lesson-num' + (c.lesson_count && c.completed_count >= c.lesson_count ? " done" : "") + '" aria-hidden="true">' + (c.lesson_count && c.completed_count >= c.lesson_count ? "✓" : i + 1) + "</span><span><strong>" + esc(c.title) + "</strong><small>" + esc(t("learn.meta", { lessons: c.lesson_count, minutes: c.duration_min })) + (c.locked ? " · " + esc(t("prof.locked")) : "") + "</small></span></button></li>").join("");
        const books = p.books.map(b => bySlug[b]).filter(Boolean).map(c => '<button type="button" class="chip-tab" data-prof-course="' + esc(c.slug) + '">' + esc(c.title.split(" — ")[0]) + "</button>").join("");
        const tpls = p.templates.map(f => tpl.find(x => x.file === "templates/" + f + ".xlsx" || x.file === "templates/" + f + ".docx")).filter(Boolean).map(x => '<a class="chip-tab" href="' + esc(x.file) + '" download>' + esc(x.title) + "</a>").join("");
        content.innerHTML = '<button type="button" class="text-button" id="prof-back">← ' + esc(t("prof.all")) + "</button>" +
          panel(L(p.title), L(p.desc), progressBar(st.done, st.total) + (st.finished ? '<p class="demo-note">' + esc(t("prof.finished")) + "</p>" : "") + '<h3>' + esc(t("prof.steps")) + '</h3><ol class="lesson-list">' + steps + "</ol>" +
            (books ? "<h3>" + esc(t("prof.books")) + '</h3><div class="chip-tabs">' + books + "</div>" : "") + (tpls ? "<h3>" + esc(t("prof.templates")) + '</h3><div class="chip-tabs">' + tpls + "</div>" : ""));
        content.querySelector("#prof-back").addEventListener("click", () => { profOpen = null; render("professions"); });
        content.querySelectorAll("[data-prof-course]").forEach(b => b.addEventListener("click", () => { learnCourse = b.dataset.profCourse; render("course"); }));
        return;
      }
    }
    const cards = list.map(p => { const st = stats(p); return '<article class="invoice-card course-card">' + artBanner(({ marketer: "marketing", targetologist: "marketing", smm: "marketing", "sales-manager": "sales", "head-of-sales": "sales", ai: "ai", finance: "finance", hr: "management", manager: "management", entrepreneur: "growth" })[p.id] || "professions") + '<div class="invoice-top"><div><span class="pill">' + ic(p.icon || "star", "ic-inline") + " " + esc(t("prof.pill")) + "</span><h3>" + esc(L(p.title)) + "</h3><small>" + esc(t("prof.meta", { courses: st.cs.length, books: p.books.length })) + "</small></div></div><p>" + esc(L(p.desc)) + "</p>" + progressBar(st.done, st.total) +
      '<div class="receipt-actions"><button class="primary-button" data-prof="' + esc(p.id) + '">' + esc(t(st.done ? (st.finished ? "learn.review" : "learn.continue") : "learn.start")) + "</button></div></article>"; }).join("");
    content.innerHTML = artBanner("professions", "hero") + panel(t("prof.title"), t("prof.text"), '<div class="course-grid">' + (cards || '<p class="muted">' + esc(t("learn.empty")) + "</p>") + "</div>");
    content.querySelectorAll("[data-prof]").forEach(b => b.addEventListener("click", () => { profOpen = b.dataset.prof; render("professions"); }));
  }

  // Real book covers (small copies kept next to the app); books without one keep the drawn cover.
  let coverManifest = null;
  async function loadCovers() {
    if (!coverManifest) { try { coverManifest = await (await fetch("covers/manifest.json", { cache: "no-cache" })).json(); } catch { coverManifest = {}; } }
    return coverManifest;
  }
  // Illustrated banners per category (art/<name>.jpg); a drawn gradient stays as the fallback.
  const ART = new Set(["sales", "marketing", "finance", "management", "growth", "ai", "legal", "other", "books", "professions"]);
  const artBanner = (name, cls) => ART.has(name) ? '<div class="course-cover art ' + (cls || "") + '" aria-hidden="true"><img src="art/' + name + '.jpg" alt="" loading="lazy" decoding="async"></div>' : "";
  function courseCover(c) {
    if (c.category === "books" && coverManifest && coverManifest[c.slug]) return '<div class="book-cover" aria-hidden="true"><img src="' + esc(coverManifest[c.slug]) + '" alt="" loading="lazy" decoding="async"></div>';
    const art = artBanner(c.category in COVER ? c.category : "other"); if (art) return art;
    const [a, b, icon] = COVER[c.category] || COVER.other;
    let h = 0; for (const ch of String(c.slug)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const shapes = Array.from({ length: 6 }, (_, k) => { const x = (h >> (k * 3)) % 300, y = (h >> (k * 2 + 1)) % 120, r = 14 + ((h >> k) % 40); return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="#fff" opacity="' + (0.06 + (k % 3) * 0.04).toFixed(2) + '"/>'; }).join("");
    return '<div class="course-cover" aria-hidden="true"><svg viewBox="0 0 300 120" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g' + h + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient></defs><rect width="300" height="120" fill="url(#g' + h + ')"/>' + shapes + '</svg><span class="course-cover-icon">' + ic(icon) + "</span></div>";
  }
  let learnFilter = "all", learnQuery = "", catalogScope = "courses";
  const scoped = items => items.filter(c => catalogScope === "books" ? c.category === "books" : c.category !== "books");
  const switchCatalog = scope => { if (catalogScope !== scope) { catalogScope = scope; learnFilter = "all"; learnQuery = ""; } };
  const testsTeaser = () => typeof RENDERERS !== "undefined" && RENDERERS.tests ? '<div class="card-cta tests-cta"><div><strong>' + esc(t("tests.teaserTitle")) + "</strong><p>" + esc(t("tests.teaserText")) + '</p></div><button type="button" class="primary-button" data-view="tests">' + esc(t("tests.open")) + "</button></div>" : "";
  function catalogTools(items) {
    const cats = ["all", ...Object.keys(COVER).filter(k => items.some(c => c.category === k))];
    const ph = t(catalogScope === "books" ? "books.search" : "learn.search");
    if (catalogScope === "books") return '<div class="learn-tools"><input type="search" id="learn-search" placeholder="' + esc(ph) + '" aria-label="' + esc(ph) + '" value="' + esc(learnQuery) + '"></div>';
    return '<div class="learn-tools"><input type="search" id="learn-search" placeholder="' + esc(ph) + '" aria-label="' + esc(ph) + '" value="' + esc(learnQuery) + '"><div class="chip-row" role="group" aria-label="' + esc(t("learn.categories")) + '">' +
      cats.map(k => '<button type="button" class="chip' + (k === learnFilter ? " active" : "") + '" aria-pressed="' + (k === learnFilter) + '" data-learn-cat="' + k + '">' + esc(k === "all" ? t("learn.all", { n: items.length }) : I18N.label("courseCategory", k) + " · " + items.filter(c => c.category === k).length) + "</button>").join("") + "</div></div>";
  }
  function wireCatalog(rerender) {
    content.querySelectorAll("[data-learn-cat]").forEach(b => b.addEventListener("click", () => { learnFilter = b.dataset.learnCat; rerender(); }));
    const s = document.querySelector("#learn-search");
    if (s) s.addEventListener("input", () => { learnQuery = s.value; const pos = s.selectionStart; rerender(); const n = document.querySelector("#learn-search"); n.focus(); n.setSelectionRange(pos, pos); });
  }
  const catalogMatch = c => (learnFilter === "all" || c.category === learnFilter) && (!learnQuery.trim() || (c.title + " " + (c.description || "")).toLowerCase().includes(learnQuery.trim().toLowerCase()));

  async function learn() {
    const access = await api("/v1/learn/access");
    if (!access.access) return learnGuest(access);
    const d = await api("/v1/learn/courses");
    d.items = await sortVoicedFirst(scoped(d.items));
    const via = access.via === "employer" ? '<p class="demo-note">' + esc(t("learn.viaEmployer", { name: access.employer_name || t("admin.member") })) + "</p>" : "";
    const draw = () => {
    const list = d.items.filter(catalogMatch);
    const cards = list.map(c => '<article class="invoice-card course-card">' + courseCover(c) + '<div class="invoice-top"><div><span class="pill">' + esc(I18N.label("courseCategory", c.category)) + "</span>" + (I18N.getLocale() === "kk" && !c.translated ? ' <span class="pill muted-pill">' + esc(t("learn.ruOnly")) + "</span>" : "") + "<h3>" + esc(c.title) + '</h3><small>' +
      esc(t("learn.meta", { lessons: c.lesson_count, minutes: c.duration_min })) + "</small></div></div><p>" + esc(c.description || "") + "</p>" + progressBar(c.completed_count, c.lesson_count) +
      '<div class="receipt-actions"><button class="primary-button" data-course="' + esc(c.slug) + '">' + esc(t(c.completed_count ? (c.completed_count >= c.lesson_count ? "learn.review" : "learn.continue") : "learn.start")) + "</button></div></article>").join("");
    content.innerHTML = via + (catalogScope === "books" ? artBanner("books", "hero") : testsTeaser()) + panel(t(catalogScope === "books" ? "books.section" : "learn.section"), t(catalogScope === "books" ? "books.sectionText" : "learn.sectionText"), catalogTools(d.items) + '<div class="course-grid">' + (cards || '<p class="muted">' + esc(t(d.items.length ? "learn.nothingFound" : "learn.empty")) + "</p>") + "</div>");
    content.querySelectorAll("[data-course]").forEach(b => b.addEventListener("click", () => { learnCourse = b.dataset.course; render("course"); }));
    wireCatalog(draw);
    };
    draw();
  }

  async function course() {
    if (!learnCourse) { active = "learn"; setHeading("learn"); return learn(); }
    const c = await api("/v1/learn/courses/" + encodeURIComponent(learnCourse));
    const items = c.lessons.map((l, i) => '<li class="lesson-row"><button type="button" class="lesson-link" data-lesson="' + esc(l.id) + '"><span class="lesson-num' + (l.completed ? " done" : "") + '" aria-hidden="true">' + (l.completed ? "✓" : i + 1) + '</span><span><strong>' + esc(l.title) + "</strong><small>" +
      esc(t("learn.minutes", { minutes: l.duration_min })) + (l.completed ? " · " + esc(t("learn.done")) : "") + "</small></span></button></li>").join("");
    content.innerHTML =
      panel(c.title, c.description || "", progressBar(c.completed_count, c.lesson_count) + '<ol class="lesson-list">' + items + "</ol>");
    if (c.lesson_count && c.completed_count >= c.lesson_count) {
      const box = document.createElement("div");
      box.innerHTML = '<div class="card-cta"><div><strong>' + esc(t("cert.ctaTitle")) + "</strong><p>" + esc(t("cert.ctaText")) + '</p></div><button type="button" class="primary-button" data-view="certificate">' + esc(t("cert.open")) + "</button></div>";
      content.insertBefore(box.firstChild, content.children[1] || null);
    }
    content.querySelectorAll("[data-lesson]").forEach(b => b.addEventListener("click", () => { learnLesson = b.dataset.lesson; render("lesson"); }));
    if (/^book-/.test(String(c.slug))) { await loadCovers(); const cv = coverManifest[c.slug]; if (cv) { const box = document.createElement("div"); box.className = "book-cover big"; box.innerHTML = '<img src="' + esc(cv) + '" alt="' + esc(c.title) + '">'; content.insertBefore(box, content.firstChild); } }
    addBookAudio(c);
  }

  // ---------- Templates: ready-made tables and contract samples for residents ----------
  async function templates() {
    let list = [];
    try { list = await (await fetch("templates/manifest.json", { cache: "no-cache" })).json(); } catch { list = []; }
    const kinds = ["finance", "sales", "legal"];
    const size = b => b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
    const groups = kinds.map(k => {
      const items = list.filter(x => x.cat === k);
      if (!items.length) return "";
      return "<h3>" + esc(t("tpl.cat." + k)) + '</h3><div class="course-grid">' + items.map(x =>
        '<article class="course-card"><h3>' + esc(x.title) + "</h3><p>" + esc(x.desc) + '</p><p class="muted">' + esc(x.type === "xlsx" ? "Excel" : "Word") + " · " + esc(size(x.bytes || 0)) + '</p><a class="primary-button" href="' + esc(x.file) + '" download>' + esc(t("tpl.download")) + "</a></article>").join("") + "</div>";
    }).join("");
    content.innerHTML = panel(t("tpl.title"), t("tpl.text"), (groups || '<p class="muted">' + esc(t("learn.empty")) + "</p>") + '<p class="demo-note">' + esc(t("tpl.legal")) + "</p>");
    // Who downloads what: one count per click, shown to staff as "dl-<file>" in the activity report.
    content.querySelectorAll("a[download]").forEach(a => a.addEventListener("click", () => {
      const slug = "dl-" + String(a.getAttribute("href") || "").replace(/^.*\//, "").replace(/\.[a-z]+$/, "").replace(/[^a-z0-9-]/g, "-").slice(0, 36);
      trackSend({ view: slug, hit: true });
    }));
  }

  // ---------- Mini player docked above the tab bar (like audiobook apps): keeps playing while you browse ----------
  let miniAudio = null, miniBar = null;
  const mmss = sec => { sec = Math.max(0, Math.round(sec || 0)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); };
  function ensureMiniPlayer() {
    if (miniBar) return;
    miniAudio = new Audio(); miniAudio.preload = "metadata";
    miniBar = document.createElement("div");
    miniBar.className = "mini-player"; miniBar.hidden = true; miniBar.setAttribute("role", "region"); miniBar.setAttribute("aria-label", t("player.label"));
    miniBar.innerHTML = '<img class="mp-cover" alt="" hidden><div class="mp-main"><div class="mp-title"></div><div class="mp-row"><input type="range" class="mp-seek" min="0" max="1000" value="0" aria-label="' + esc(t("player.seek")) + '"><span class="mp-time">0:00</span></div></div>' +
      '<button type="button" class="mp-btn" data-mp="back" aria-label="' + esc(t("player.back15")) + '">−15</button><button type="button" class="mp-btn mp-play" data-mp="play" aria-label="' + esc(t("player.play")) + '"></button><button type="button" class="mp-btn" data-mp="fwd" aria-label="' + esc(t("player.fwd15")) + '">+15</button><button type="button" class="mp-btn mp-close" data-mp="close" aria-label="' + esc(t("player.close")) + '">×</button>';
    document.body.appendChild(miniBar);
    const playBtn = miniBar.querySelector('[data-mp="play"]'), seek = miniBar.querySelector(".mp-seek"), time = miniBar.querySelector(".mp-time");
    const paint = () => { playBtn.innerHTML = ic(miniAudio.paused ? "play" : "pause"); playBtn.setAttribute("aria-label", t(miniAudio.paused ? "player.play" : "player.pause")); };
    miniAudio.addEventListener("play", paint); miniAudio.addEventListener("pause", paint); miniAudio.addEventListener("ended", paint);
    miniAudio.addEventListener("timeupdate", () => {
      if (miniAudio.duration) { seek.value = String(Math.round(miniAudio.currentTime / miniAudio.duration * 1000)); time.textContent = "−" + mmss(miniAudio.duration - miniAudio.currentTime); }
    });
    seek.addEventListener("input", () => { if (miniAudio.duration) miniAudio.currentTime = Number(seek.value) / 1000 * miniAudio.duration; });
    miniBar.addEventListener("click", e => {
      const b = e.target.closest("[data-mp]"); if (!b) return;
      if (b.dataset.mp === "play") { miniAudio.paused ? miniAudio.play().catch(() => undefined) : miniAudio.pause(); }
      else if (b.dataset.mp === "back") miniAudio.currentTime = Math.max(0, miniAudio.currentTime - 15);
      else if (b.dataset.mp === "fwd") miniAudio.currentTime = Math.min(miniAudio.duration || 1e9, miniAudio.currentTime + 15);
      else if (b.dataset.mp === "close") { miniAudio.pause(); miniBar.hidden = true; document.body.classList.remove("has-player"); }
    });
    paint();
  }
  function playBook({ file, title, cover }) {
    ensureMiniPlayer();
    if (!miniAudio.src.endsWith(file)) miniAudio.src = file;
    miniBar.querySelector(".mp-title").textContent = title;
    const img = miniBar.querySelector(".mp-cover");
    if (cover) { img.src = cover; img.hidden = false; } else img.hidden = true;
    miniBar.hidden = false; document.body.classList.add("has-player");
    miniAudio.play().catch(() => undefined);
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title, artist: "Friends", artwork: cover ? [{ src: cover, sizes: "240x360", type: "image/jpeg" }] : [] });
        navigator.mediaSession.setActionHandler("play", () => miniAudio.play());
        navigator.mediaSession.setActionHandler("pause", () => miniAudio.pause());
        navigator.mediaSession.setActionHandler("seekbackward", () => { miniAudio.currentTime = Math.max(0, miniAudio.currentTime - 15); });
        navigator.mediaSession.setActionHandler("seekforward", () => { miniAudio.currentTime += 15; });
      } catch { /* optional */ }
    }
  }

  // Short voiced version of a book ("main idea in two minutes"): mp3 files live next to the app, listed in audio/manifest.json.
  let audioManifest = null;
  async function loadAudioManifest() {
    if (!audioManifest) { try { audioManifest = await (await fetch("audio/manifest.json", { cache: "no-cache" })).json(); } catch { audioManifest = {}; } }
    return audioManifest;
  }
  /** Voiced books first, the rest keep their order. */
  async function sortVoicedFirst(items) {
    if (catalogScope !== "books") return items;
    await loadCovers();
    const m = await loadAudioManifest();
    const rank = c => (m[c.slug] ? 0 : 1);
    return items.map((c, i) => [c, i]).sort((x, y) => rank(x[0]) - rank(y[0]) || x[1] - y[1]).map(x => x[0]);
  }
  async function addBookAudio(c) {
    const slug = c.slug || learnCourse;
    if (!/^book-/.test(String(slug))) return;
    const a = (await loadAudioManifest())[slug];
    let r = {};
    try { r = await api("/v1/learn/courses/" + encodeURIComponent(c.id) + "/rating"); } catch { /* rating is optional */ }
    if (a) {
      const box = document.createElement("div");
      box.className = "card-cta book-audio";
      box.innerHTML = "<div><strong>" + esc(t("bookAudio.title")) + "</strong><p>" + esc(t("bookAudio.text", { min: Math.max(1, Math.round((a.seconds || 70) / 60)) })) + '</p><button type="button" class="primary-button" id="book-listen">' + ic("speaker", "ic-inline") + " " + esc(t("player.listen")) + "</button></div>";
      content.insertBefore(box, content.children[1] || null);
      box.querySelector("#book-listen").addEventListener("click", () => playBook({ file: a.file, title: c.title, cover: coverManifest && coverManifest[slug] }));
    }
    // The rating folds down at the bottom of the page: tap the heading to open it.
    const row = (key, mine) => '<div class="chip-tabs book-rate" data-row="' + key + '">' + Array.from({ length: 10 }, (_, i) => '<button type="button" class="chip-tab' + (mine === i + 1 ? " active" : "") + '" data-' + key + '="' + (i + 1) + '" aria-pressed="' + (mine === i + 1) + '">' + (i + 1) + "</button>").join("") + "</div>";
    const rate = document.createElement("details");
    rate.className = "book-rating panel";
    rate.open = !!sessionStorage.getItem("friends.rateOpen");
    rate.innerHTML = "<summary><strong>" + esc(t("bookRate.title")) + "</strong> <span class=\"muted\">" + esc(r.count ? t("bookRate.avg", { avg: r.avg, n: r.count }) : t("bookRate.none")) + "</span></summary>" +
      row("score", r.mine) +
      (a ? "<p><strong>" + esc(t("bookRate.voiceTitle")) + '</strong> <span class="muted">' + esc(r.voice_count ? t("bookRate.avg", { avg: r.voice_avg, n: r.voice_count }) : t("bookRate.none")) + "</span></p>" + row("voice", r.mine_voice) : "");
    content.appendChild(rate);
    const send = async body => { try { await api("/v1/learn/courses/" + encodeURIComponent(c.id) + "/rating", { method: "PUT", body: JSON.stringify(body) }); try { sessionStorage.setItem("friends.rateOpen", "1"); } catch { /* none */ } status(t("bookRate.thanks")); rate.remove(); content.querySelector(".book-audio")?.remove(); await addBookAudio(c); } catch (x) { status(x.message, true); } };
    rate.querySelectorAll("[data-score]").forEach(b => b.addEventListener("click", () => send({ score: Number(b.dataset.score) })));
    rate.querySelectorAll("[data-voice]").forEach(b => b.addEventListener("click", () => send({ voice_score: Number(b.dataset.voice) })));
  }

  // ---------- «Слушать»: reads the lesson aloud with the phone's built-in voice ----------
  const canSpeak = () => "speechSynthesis" in window && typeof SpeechSynthesisUtterance === "function";
  const stopSpeaking = () => { if (canSpeak()) speechSynthesis.cancel(); };
  const plain = text => String(text || "").split(/\r?\n/).filter(l => !/^\|[\s:|-]+\|$/.test(l.trim())).map(l => l.replace(/^#+\s*/, "").replace(/^[-•]\s+/, "").replace(/\*\*/g, "").replace(/\|/g, ", ").trim()).filter(Boolean).join(". ").replace(/\.\s*\./g, ".");
  function speak(text, lang, rate, onEnd) {
    stopSpeaking();
    const voices = speechSynthesis.getVoices();
    const saved = store.get("friends.voice");
    const voice = voices.find(v => v.voiceURI === saved && v.lang && v.lang.toLowerCase().startsWith(lang)) || bestVoice(voices, lang);
    const parts = (text.match(/[^.!?…]+[.!?…]*/g) || [text]).reduce((acc, s) => { const last = acc[acc.length - 1]; if (last && (last + s).length < 220) acc[acc.length - 1] = last + s; else acc.push(s); return acc; }, []);
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p.trim());
      u.lang = voice ? voice.lang : lang === "kk" ? "kk-KZ" : lang === "en" ? "en-US" : "ru-RU";
      if (voice) u.voice = voice;
      u.rate = rate;
      if (i === parts.length - 1) u.onend = onEnd;
      speechSynthesis.speak(u);
    });
  }
  // Device voices: known names tell male from female; better-quality voices first.
  const MALE = /yuri|pavel|dmitr|maxim|aidar|daulet|daniel|alex\b|fred|tom\b|aaron|arthur|google uk english male|\bmale\b|\u043c\u0443\u0436\u0441\u043a/i;
  const FEMALE = /milena|irina|svetlana|dariya|katya|alena|anna|elena|aigul|samantha|karen|moira|tessa|ava|allison|susan|zira|google \u0440\u0443\u0441\u0441\u043a\u0438\u0439|\bfemale\b|\u0436\u0435\u043d\u0441\u043a/i;
  const voiceGender = v => MALE.test(v.name) ? "male" : FEMALE.test(v.name) ? "female" : "";
  const voiceScore = v => (/premium|enhanced|natural|neural|online|\u0443\u043b\u0443\u0447\u0448/i.test(v.name) ? 2 : 0) + (v.localService === false ? 1 : 0);
  const bestVoice = (voices, lang) => voices.filter(v => v.lang && v.lang.toLowerCase().startsWith(lang)).sort((a, b) => voiceScore(b) - voiceScore(a))[0] || null;
  const loadVoices = () => new Promise(res => { const v = canSpeak() ? speechSynthesis.getVoices() : []; if (v.length || !canSpeak()) return res(v); const done = () => res(speechSynthesis.getVoices()); speechSynthesis.addEventListener("voiceschanged", done, { once: true }); setTimeout(done, 1500); });
  function listenBar(getText, lang) {
    if (!canSpeak()) return "";
    return '<div class="listen-bar" role="group" aria-label="' + esc(t("listen.label")) + '"><button type="button" class="outline-button" id="listen-play" data-lang="' + lang + '">' + ic("speaker", "ic-inline") + ' ' + esc(t("listen.play")) + '</button><button type="button" class="chip" id="listen-rate" aria-label="' + esc(t("listen.rate")) + '">1×</button><button type="button" class="text-button" data-view="settings">' + esc(t("voice.change")) + "</button></div>";
  }
  function wireListen(getText) {
    const play = document.querySelector("#listen-play"), rateBtn = document.querySelector("#listen-rate");
    if (!play) return;
    let playing = false, rate = Number(store.get("friends.voiceRate")) || 1;
    rateBtn.textContent = String(rate).replace(".", ",") + "\u00d7";
    const label = () => { play.innerHTML = ic(playing ? "stop" : "speaker", "ic-inline") + " " + esc(t(playing ? "listen.stop" : "listen.play")); play.setAttribute("aria-pressed", String(playing)); };
    play.addEventListener("click", () => {
      if (playing) { stopSpeaking(); playing = false; label(); return; }
      playing = true; label();
      speak(getText(), play.dataset.lang, rate, () => { playing = false; label(); });
    });
    rateBtn.addEventListener("click", () => {
      rate = rate >= 1.5 ? 1 : Math.round((rate + 0.25) * 100) / 100;
      rateBtn.textContent = String(rate).replace(".", ",") + "×";
      store.set("friends.voiceRate", String(rate));
      if (playing) { stopSpeaking(); speak(getText(), play.dataset.lang, rate, () => { playing = false; label(); }); }
    });
  }

  async function lesson() {
    if (!learnLesson) { active = "learn"; setHeading("learn"); return learn(); }
    const l = await api("/v1/learn/lessons/" + encodeURIComponent(learnLesson));
    learnCourse = l.course_slug;
    const takeaways = (l.takeaways || []).length ? '<section class="lesson-box"><h3>' + esc(t("learn.takeaways")) + "</h3><ul>" + l.takeaways.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul></section>" : "";
    const task = l.assignment ? '<section class="lesson-box task-box"><h3>' + esc(t("learn.assignment")) + "</h3><p>" + esc(l.assignment) + "</p></section>" : "";
    const yt = l.video_url && String(l.video_url).match(/^https:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
    const video = yt ? '<figure class="lesson-video"><div class="video-frame"><iframe src="https://www.youtube-nocookie.com/embed/' + yt[1] + '" title="' + esc(t("learn.video") + ": " + l.title) + '" loading="lazy" allow="encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div><figcaption class="muted">' + esc(t("learn.videoNote")) + ' <a href="' + esc(safeUrl(l.video_url)) + '" target="_blank" rel="noopener noreferrer">YouTube ↗</a></figcaption></figure>'
      : l.video_url ? '<p><a href="' + esc(safeUrl(l.video_url)) + '" target="_blank" rel="noopener noreferrer">' + esc(t("learn.video")) + "</a></p>" : "";
    content.innerHTML =
      '<article class="empty-panel lesson-article"><p class="eyebrow">' + esc(l.course_title) + "</p><h2>" + esc(l.title) + '</h2><p class="muted">' + esc(t("learn.minutes", { minutes: l.duration_min })) + "</p>" +
      video + listenBar(null, "ru") + '<div class="lesson-body">' + md(l.body) + '</div><div id="lesson-figure"></div>' + takeaways + task + '<div id="lesson-quiz"></div>' +
      '<div class="lesson-nav">' + (l.prev_lesson_id ? '<button type="button" class="outline-button" data-go-lesson="' + esc(l.prev_lesson_id) + '">' + esc(t("learn.prev")) + "</button>" : "<span></span>") +
      (l.completed ? '<span class="pill">' + esc(t("learn.done")) + "</span>" : '<button type="button" class="primary-button" id="complete-lesson" data-complete-slot>' + esc(t("learn.complete")) + "</button>") +
      (l.next_lesson_id ? '<button type="button" class="outline-button" data-go-lesson="' + esc(l.next_lesson_id) + '">' + esc(t("learn.next")) + "</button>" : "<span></span>") + "</div></article>";
    wireListen(() => l.title + ". " + plain(l.body) + ". " + (l.takeaways || []).join(". "));
    content.querySelectorAll("[data-go-lesson]").forEach(b => b.addEventListener("click", () => { learnLesson = b.dataset.goLesson; render("lesson"); window.scrollTo(0, 0); }));
    let extras = { figure: null, quiz: null };
    try { extras = await api("/v1/learn/lessons/" + encodeURIComponent(l.id) + "/extras"); } catch { /* lesson still readable */ }
    if (extras.figure) document.querySelector("#lesson-figure").innerHTML = renderFigure(extras.figure);
    if ((extras.sources || []).length) document.querySelector("#lesson-figure").insertAdjacentHTML("beforeend", '<section class="lesson-box sources-box"><h3>' + esc(t("learn.sources")) + "</h3><ul>" +
      extras.sources.map(x => '<li><a href="' + esc(safeUrl(x.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(x.title) + "</a></li>").join("") + '</ul><p class="muted">' + esc(t("learn.sourcesNote")) + "</p></section>");
    if (extras.quiz) {
      const slot = document.querySelector("[data-complete-slot]");
      if (slot) slot.outerHTML = '<a class="primary-button" href="#lesson-quiz">' + esc(t("quiz.goTo")) + "</a>";
      lessonQuizView(l, extras);
      return;
    }
    const done = document.querySelector("#complete-lesson");
    if (done) done.addEventListener("click", async () => {
      try {
        await api("/v1/learn/lessons/" + encodeURIComponent(l.id) + "/complete", { method: "POST", body: JSON.stringify({}) });
        if (l.next_lesson_id) { learnLesson = l.next_lesson_id; await render("lesson"); window.scrollTo(0, 0); } else { await render("course"); }
        status(t("learn.completed"));
      } catch (x) { status(x.message, true); }
    });
  }

  async function team() {
    let d;
    try { d = await api("/v1/me/team"); }
    catch (e) { if (e.code === "active_membership_required") { content.innerHTML = panel(t("team.section"), t("team.needMembership"), ""); return; } throw e; }
    const used = d.items.length;
    const rows = d.items.map(s => '<div class="list-row"><div><strong>' + esc(s.employee_name) + "</strong><p>" + esc(s.employee_contact || "") + "</p>" +
      (s.status === "active" && s.total_lessons ? progressBar(s.completed_lessons || 0, s.total_lessons) + (s.last_completed_at ? '<small class="muted"> · ' + esc(t("team.lastActivity", { date: date(s.last_completed_at) })) + "</small>" : "") + (s.quiz_avg_pct != null ? '<small class="muted"> · ' + esc(t("team.quizAvg", { pct: s.quiz_avg_pct })) + "</small>" : "") : "") +
      (s.training_value_kzt || s.retention_months ? '<p class="muted">' + esc(t("team.termsLine", { value: s.training_value_kzt ? money(s.training_value_kzt) : "—", months: s.retention_months || "—" })) + (s.terms_ack_at ? " · " + esc(t("team.termsAcked")) : "") + "</p>" : "") +
      '<small>' + esc(t("seatStatus." + s.status)) + (s.accepted_at ? " · " + esc(date(s.accepted_at)) : "") +
      '</small></div><div class="receipt-actions">' + (s.status === "invited" ? '<button class="outline-button" data-seat-code="' + esc(s.id) + '">' + esc(t("team.newCode")) + "</button>" : "") +
      '<button class="outline-button" data-seat-revoke="' + esc(s.id) + '">' + esc(t("team.revoke")) + "</button></div></div>").join("");
    content.innerHTML = panel(t("team.section"), t("team.sectionText", { limit: d.limit }),
      '<p class="seat-count"><strong>' + esc(t("team.used", { used, limit: d.limit })) + "</strong></p>" +
      (used < d.limit ? '<form id="seat-form" class="app-form">' + field(t("team.name"), "employee_name", "", "text", 'required maxlength="120"') + field(t("team.contact"), "employee_contact", "", "text", 'maxlength="160"') +
        '<fieldset class="terms-fieldset"><legend>' + esc(t("team.termsTitle")) + '</legend><p class="muted">' + esc(t("team.termsHint")) + "</p>" +
        field(t("team.value"), "training_value_kzt", "", "number", 'min="0" step="1000"') + field(t("team.months"), "retention_months", "", "number", 'min="0" max="60"') + "</fieldset>" +
        '<button class="primary-button">' + esc(t("team.invite")) + "</button></form>" : '<p class="muted">' + esc(t("team.full")) + "</p>") +
      '<div id="seat-code"></div><div class="data-list">' + (rows || '<p class="muted">' + esc(t("team.empty")) + "</p>") + "</div>");
    function showCode(name, code) {
      const text = t("team.shareText", { name, code });
      document.querySelector("#seat-code").innerHTML = '<div class="demo-note invite-box"><p>' + esc(t("team.codeOnce")) + '</p><p class="invite-code">' + esc(code) + '</p><p class="muted">' + esc(text) + '</p><button type="button" class="primary-button" id="copy-invite">' + esc(t("team.copy")) + "</button></div>";
      document.querySelector("#copy-invite").addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(text); status(t("team.copied")); } catch { status(t("team.copyFailed"), true); }
      });
    }
    const form = document.querySelector("#seat-form");
    if (form) form.addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(form);
      const name = String(f.get("employee_name") || "").trim();
      try {
        const num = k => { const v = String(f.get(k) || "").trim(); return v ? Number(v) : null; };
        const r = await api("/v1/me/team", { method: "POST", body: JSON.stringify({ employee_name: name, employee_contact: String(f.get("employee_contact") || "").trim() || null, training_value_kzt: num("training_value_kzt"), retention_months: num("retention_months") }) });
        await team();
        showCode(name, r.invite_code);
        status(t("team.invited"));
      } catch (x) { status(x.message, true); }
    });
    content.querySelectorAll("[data-seat-code]").forEach(b => b.addEventListener("click", async () => {
      try { const r = await api("/v1/me/team/" + encodeURIComponent(b.dataset.seatCode) + "/regenerate", { method: "POST", body: JSON.stringify({}) }); const name = b.closest(".list-row").querySelector("strong").textContent; showCode(name, r.invite_code); } catch (x) { status(x.message, true); }
    }));
    content.querySelectorAll("[data-seat-revoke]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm(t("team.revokeConfirm"))) return;
      try { await api("/v1/me/team/" + encodeURIComponent(b.dataset.seatRevoke), { method: "DELETE" }); await team(); status(t("team.revoked")); } catch (x) { status(x.message, true); }
    }));
  }

  async function adminLearn() {
    const d = await api("/v1/admin/courses");
    const cats = ["sales", "marketing", "finance", "management", "growth", "ai", "legal", "other"];
    const rows = d.items.map(c => '<article class="invoice-card"><div class="invoice-top"><div><span class="pill">' + esc(I18N.label("courseCategory", c.category)) + "</span>" + (I18N.getLocale() === "kk" && !c.translated ? ' <span class="pill muted-pill">' + esc(t("learn.ruOnly")) + "</span>" : "") + "<h3>" + esc(c.title) + "</h3><small>" + esc(t("learn.meta", { lessons: c.lesson_count, minutes: c.duration_min })) + " · " + esc(I18N.label("courseStatus", c.status)) +
      '</small></div></div><div class="receipt-actions">' + (c.status === "published" ? '<button class="outline-button" data-course-status="' + esc(c.id) + '" data-to="draft">' + esc(t("adminLearn.unpublish")) + "</button>" : '<button class="primary-button" data-course-status="' + esc(c.id) + '" data-to="published">' + esc(t("adminLearn.publish")) + "</button>") +
      '<button class="outline-button" data-add-lesson="' + esc(c.id) + '" data-title="' + esc(c.title) + '">' + esc(t("adminLearn.addLesson")) + "</button></div></article>").join("");
    content.innerHTML = panel(t("adminLearn.section"), t("adminLearn.sectionText"),
      '<form id="course-form" class="app-form">' + field(t("adminLearn.title"), "title", "", "text", 'required minlength="2" maxlength="200"') + field(t("adminLearn.slug"), "slug", "", "text", 'required pattern="[a-z0-9-]{2,80}"') +
      '<label class="field"><span>' + esc(t("adminLearn.category")) + '</span><select name="category">' + cats.map(c => option(c, t("courseCategory." + c), false)).join("") + "</select></label>" +
      area(t("adminLearn.description"), "description", "") + '<button class="primary-button">' + esc(t("adminLearn.create")) + '</button></form><div id="lesson-editor"></div><div class="data-list">' + (rows || '<p class="muted">' + esc(t("learn.empty")) + "</p>") + "</div>");
    document.querySelector("#course-form").addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      try { await api("/v1/admin/courses", { method: "POST", body: JSON.stringify({ title: String(f.get("title")).trim(), slug: String(f.get("slug")).trim(), category: String(f.get("category")), description: String(f.get("description") || "").trim() || null }) }); await adminLearn(); status(t("adminLearn.created")); } catch (x) { status(x.message, true); }
    });
    content.querySelectorAll("[data-course-status]").forEach(b => b.addEventListener("click", async () => {
      try { await api("/v1/admin/courses/" + encodeURIComponent(b.dataset.courseStatus) + "/status", { method: "PATCH", body: JSON.stringify({ status: b.dataset.to }) }); await adminLearn(); status(t("adminLearn.statusSaved")); } catch (x) { status(x.message, true); }
    }));
    content.querySelectorAll("[data-add-lesson]").forEach(b => b.addEventListener("click", () => {
      const host = document.querySelector("#lesson-editor");
      host.innerHTML = '<form id="lesson-form" class="app-form lesson-editor"><h3>' + esc(t("adminLearn.newLessonFor", { course: b.dataset.title })) + "</h3>" +
        field(t("adminLearn.title"), "title", "", "text", 'required minlength="2" maxlength="200"') + field(t("adminLearn.slug"), "slug", "", "text", 'required pattern="[a-z0-9-]{2,80}"') +
        field(t("adminLearn.minutes"), "duration_min", "7", "number", 'min="1" max="300"') + field(t("adminLearn.video"), "video_url", "", "url") +
        area(t("adminLearn.body"), "body", "") + area(t("adminLearn.assignment"), "assignment", "") + '<p class="muted">' + esc(t("adminLearn.bodyHint")) + '</p><button class="primary-button">' + esc(t("adminLearn.saveLesson")) + "</button></form>";
      host.querySelector("textarea[name=body]").setAttribute("rows", "12");
      host.scrollIntoView({ behavior: "smooth" });
      document.querySelector("#lesson-form").addEventListener("submit", async e => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        try {
          await api("/v1/admin/courses/" + encodeURIComponent(b.dataset.addLesson) + "/lessons", { method: "POST", body: JSON.stringify({ title: String(f.get("title")).trim(), slug: String(f.get("slug")).trim(), duration_min: Number(f.get("duration_min")) || 5, video_url: String(f.get("video_url") || "").trim() || null, body: String(f.get("body") || ""), assignment: String(f.get("assignment") || "").trim() || null }) });
          await adminLearn(); status(t("adminLearn.lessonSaved"));
        } catch (x) { status(x.message, true); }
      });
    }));
  }


  const pad2 = n => String(n).padStart(2, "0");

  // ---------- Announcements ----------
  let annKind = "";
  const ANN_CATS = ["services", "goods", "partnership", "jobs", "realty", "events", "other"];
  function annCard(a, mode) {
    const kindLabel = I18N.label("annKind", a.kind);
    return '<article class="invoice-card ann-card' + (a.pinned ? " pinned" : "") + '"><div class="invoice-top"><div><span class="pill">' + esc(kindLabel) + '</span> <span class="pill">' + esc(I18N.label("annCategory", a.category)) + "</span><h3>" + (a.pinned ? ic("pin", "ic-inline") + " " : "") + esc(a.title) +
      "</h3><small>" + esc(a.author_name || t("announcements.community")) + (mode === "admin" && a.author_email ? " · " + esc(a.author_email) : "") + " · " + esc(date(a.created_at)) + "</small></div></div><p class=\"ann-body\">" + esc(a.body) + "</p>" +
      (a.price_info ? '<p class="muted">' + esc(t("announcements.price")) + ": " + esc(a.price_info) + "</p>" : "") + (a.contact ? '<p class="muted">' + esc(t("announcements.contact")) + ": " + esc(a.contact) + "</p>" : "") +
      (mode === "mine" ? '<p class="expert-status ' + esc(a.status) + '">' + esc(I18N.label("annStatus", a.status)) + (a.review_note ? " — " + esc(a.review_note) : "") + '</p><div class="receipt-actions"><button class="outline-button" data-ann-archive="' + esc(a.id) + '">' + esc(t("announcements.remove")) + "</button></div>" : "") +
      (mode === "admin" ? '<div class="receipt-actions">' + (a.status === "pending" ? '<button class="primary-button" data-ann-act="approve" data-id="' + esc(a.id) + '">' + esc(t("adminExperts.approve")) + '</button><button class="outline-button" data-ann-act="reject" data-id="' + esc(a.id) + '">' + esc(t("adminExperts.reject")) + "</button>" :
        '<button class="outline-button" data-ann-act="' + (a.pinned ? "unpin" : "pin") + '" data-id="' + esc(a.id) + '">' + esc(t(a.pinned ? "announcements.unpin" : "announcements.pin")) + '</button><button class="outline-button" data-ann-act="archive" data-id="' + esc(a.id) + '">' + esc(t("announcements.remove")) + "</button>") + "</div>" : "") +
      "</article>";
  }

  async function announcements() {
    const qs = annKind ? "?kind=" + annKind + "&limit=50" : "?limit=50";
    const [feed, mine] = await Promise.all([api("/v1/announcements" + qs), api("/v1/me/announcements").catch(() => ({ items: [] }))]);
    const tabs = ["", "news", "offer", "request"].map(k => '<button type="button" class="chip-tab' + (annKind === k ? " active" : "") + '" data-ann-kind="' + k + '" aria-pressed="' + (annKind === k) + '">' + esc(k ? I18N.label("annKind", k) : t("announcements.allTab")) + "</button>").join("");
    content.innerHTML = panel(t("announcements.section"), t("announcements.sectionText"),
      '<div class="chip-tabs" role="group" aria-label="' + esc(t("announcements.filter")) + '">' + tabs + '</div><div class="data-list">' + (feed.items.length ? feed.items.map(a => annCard(a, "feed")).join("") : '<p class="muted">' + esc(t("announcements.empty")) + "</p>") + "</div>") +
      panel(t("announcements.create"), t("announcements.createText"),
        '<form id="ann-form" class="app-form"><label class="field"><span>' + esc(t("announcements.kind")) + '</span><select name="kind">' + option("offer", I18N.label("annKind", "offer"), true) + option("request", I18N.label("annKind", "request"), false) + "</select></label>" +
        '<label class="field"><span>' + esc(t("announcements.category")) + '</span><select name="category">' + ANN_CATS.map(c => option(c, I18N.label("annCategory", c), c === "services")).join("") + "</select></label>" +
        field(t("announcements.title"), "title", "", "text", 'required minlength="3" maxlength="160"') + area(t("announcements.body"), "body", "") +
        field(t("announcements.priceField"), "price_info", "", "text", 'maxlength="200"') + field(t("announcements.contactField"), "contact", "", "text", 'maxlength="200"') +
        '<p class="muted">' + esc(t("announcements.moderationNote")) + '</p><button class="primary-button">' + esc(t("announcements.submit")) + "</button></form>") +
      (mine.items.length ? panel(t("announcements.mine"), "", mine.items.map(a => annCard(a, "mine")).join("")) : "");
    content.querySelectorAll("[data-ann-kind]").forEach(b => b.addEventListener("click", () => { annKind = b.dataset.annKind; announcements(); }));
    document.querySelector("#ann-form textarea[name=body]").required = true;
    document.querySelector("#ann-form").addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const v = k => String(f.get(k) || "").trim();
      try {
        await api("/v1/announcements", { method: "POST", body: JSON.stringify({ kind: v("kind"), category: v("category"), title: v("title"), body: v("body"), price_info: v("price_info") || null, contact: v("contact") || null }) });
        await announcements();
        status(t("announcements.sent"));
      } catch (x) { status(x.message, true); }
    });
    content.querySelectorAll("[data-ann-archive]").forEach(b => b.addEventListener("click", async () => {
      try { await api("/v1/me/announcements/" + encodeURIComponent(b.dataset.annArchive), { method: "DELETE" }); await announcements(); status(t("announcements.removed")); } catch (x) { status(x.message, true); }
    }));
  }

  async function adminAnnouncements() {
    const [pending, published] = await Promise.all([api("/v1/admin/announcements?status=pending"), api("/v1/admin/announcements?status=published")]);
    content.innerHTML = panel(t("adminAnn.newsTitle"), t("adminAnn.newsText"),
        '<form id="news-form" class="app-form">' + field(t("announcements.title"), "title", "", "text", 'required minlength="3" maxlength="160"') + area(t("announcements.body"), "body", "") +
        '<label class="consent-field"><input type="checkbox" name="pinned" value="yes"> <span>' + esc(t("adminAnn.pinField")) + '</span></label><button class="primary-button">' + esc(t("adminAnn.publish")) + "</button></form>") +
      panel(t("adminAnn.pendingTitle"), t("adminAnn.pendingText"), pending.items.length ? pending.items.map(a => annCard(a, "admin")).join("") : '<p class="muted">' + esc(t("adminAnn.empty")) + "</p>") +
      panel(t("adminAnn.publishedTitle"), "", published.items.length ? published.items.map(a => annCard(a, "admin")).join("") : '<p class="muted">' + esc(t("announcements.empty")) + "</p>");
    document.querySelector("#news-form textarea[name=body]").required = true;
    document.querySelector("#news-form").addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      try { await api("/v1/admin/announcements", { method: "POST", body: JSON.stringify({ title: String(f.get("title")).trim(), body: String(f.get("body")).trim(), pinned: f.get("pinned") === "yes" }) }); await adminAnnouncements(); status(t("adminAnn.published")); } catch (x) { status(x.message, true); }
    });
    content.querySelectorAll("[data-ann-act]").forEach(b => b.addEventListener("click", async () => {
      let body = {};
      if (b.dataset.annAct === "reject") { const note = prompt(t("adminExperts.rejectPrompt")); if (!note?.trim()) return; body = { review_note: note.trim() }; }
      try { await api("/v1/admin/announcements/" + encodeURIComponent(b.dataset.id) + "/" + b.dataset.annAct, { method: "POST", body: JSON.stringify(body) }); await adminAnnouncements(); status(t("adminAnn.saved")); } catch (x) { status(x.message, true); }
    }));
  }


  // ---------- Member discounts ----------
  const OFFER_CATS = ["food", "beauty", "health", "auto", "services", "retail", "education", "realty", "travel", "other"];
  let discountCat = "";
  const pct = v => (Math.round(Number(v) * 100) / 100).toString().replace(".", ",") + "%";
  const mapLink = o => o.address ? "https://2gis.kz/search/" + encodeURIComponent([o.city, o.address].filter(Boolean).join(", ")) : "";

  function offerCard(o, mode) {
    const link = mapLink(o);
    return '<article class="invoice-card offer-card"><div class="invoice-top"><div><span class="pill">' + esc(I18N.label("offerCategory", o.category)) + "</span><h3>" + esc(o.business_name) + "</h3><small>" + esc(o.title) +
      '</small></div><strong class="offer-pct">−' + esc(pct(o.discount_percent)) + "</strong></div>" + (o.description ? "<p>" + esc(o.description) + "</p>" : "") +
      (o.address ? '<p class="muted">' + esc([o.city, o.address].filter(Boolean).join(", ")) + (link ? ' · <a href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">' + esc(t("discounts.onMap")) + "</a>" : "") + "</p>" : "") +
      (o.contact ? '<p class="muted">' + esc(t("announcements.contact")) + ": " + esc(o.contact) + "</p>" : "") +
      (mode === "mine" ? '<p class="expert-status ' + esc(o.status) + '">' + esc(I18N.label("offerStatus", o.status)) + (o.review_note ? " — " + esc(o.review_note) : "") + "</p>" +
        (o.status === "published" ? '<div class="receipt-actions"><button class="primary-button" data-redeem="' + esc(o.id) + '" data-name="' + esc(o.title) + '">' + esc(t("partner.accept")) + '</button><button class="outline-button" data-offer-hide="' + esc(o.id) + '">' + esc(t("announcements.remove")) + "</button></div>" : "") : "") +
      (mode === "admin" ? '<p class="muted">' + esc(o.owner_email || "") + '</p><div class="receipt-actions"><button class="primary-button" data-offer-act="approve" data-id="' + esc(o.id) + '">' + esc(t("adminExperts.approve")) + '</button><button class="outline-button" data-offer-act="reject" data-id="' + esc(o.id) + '">' + esc(t("adminExperts.reject")) + "</button></div>" : "") +
      "</article>";
  }

  async function discounts() {
    const qs = discountCat ? "?category=" + discountCat : "";
    const d = await api("/v1/discounts" + qs);
    const tabs = [""].concat(OFFER_CATS).map(c => '<button type="button" class="chip-tab' + (discountCat === c ? " active" : "") + '" data-disc-cat="' + c + '" aria-pressed="' + (discountCat === c) + '">' + esc(c ? I18N.label("offerCategory", c) : t("announcements.allTab")) + "</button>").join("");
    content.innerHTML = '<div class="card-cta"><div><strong>' + esc(t("card.ctaTitle")) + "</strong><p>" + esc(t("card.ctaText")) + '</p></div><button type="button" class="primary-button" data-view="card">' + esc(t("card.open")) + "</button></div>" +
      panel(t("discounts.section"), t("discounts.sectionText"), '<div class="chip-tabs" role="group" aria-label="' + esc(t("discounts.filter")) + '">' + tabs + '</div><div class="data-list">' +
        (d.items.length ? d.items.map(o => offerCard(o, "feed")).join("") : '<p class="muted">' + esc(t("discounts.empty")) + "</p>") + "</div>") +
      '<div class="section-heading"><div><h2>' + esc(t("partner.ctaTitle")) + '</h2><p class="muted">' + esc(t("partner.ctaText")) + '</p></div><button class="text-button" data-view="partner">' + esc(t("partner.open")) + "</button></div>";
    content.querySelectorAll("[data-disc-cat]").forEach(b => b.addEventListener("click", () => { discountCat = b.dataset.discCat; discounts(); }));
  }

  let cardTimer = null;
  async function card() {
    clearInterval(cardTimer);
    let c;
    try { c = await api("/v1/me/card-code", { method: "POST", body: JSON.stringify({}) }); }
    catch (e) { if (e.code === "active_membership_required") { content.innerHTML = panel(t("card.title"), t("card.needMembership"), ""); return; } throw e; }
    let svg = "";
    try { const q = window.qrcode(0, "M"); q.addData("FRIENDS:" + c.code); q.make(); svg = q.createSvgTag({ cellSize: 7, margin: 2, scalable: true }); } catch { svg = ""; }
    const hist = await api("/v1/me/discount-history").catch(() => ({ items: [] }));
    content.innerHTML = '<div class="empty-panel member-card"><p class="eyebrow">FRIENDS</p><h2>' + esc(t("card.title")) + '</h2><p class="muted">' + esc(t("card.text")) + '</p><div class="qr-box" role="img" aria-label="' + esc(t("card.qrLabel", { code: c.code })) + '">' + svg +
      '</div><p class="card-code" aria-live="polite">' + esc(c.code.slice(0, 3) + " " + c.code.slice(3)) + '</p><p class="muted" id="card-ttl"></p><button type="button" class="outline-button" id="card-refresh">' + esc(t("card.refresh")) + "</button></div>" +
      (hist.items.length ? panel(t("card.history"), "", hist.items.map(h => '<div class="list-row"><div><strong>' + esc(h.business_name) + "</strong><p>" + esc(money(h.amount_kzt)) + " · −" + esc(pct(h.discount_percent)) + "</p><small>" + esc(date(h.created_at)) + "</small></div></div>").join("")) : "");
    const until = new Date(c.expires_at).getTime();
    const tick = () => {
      const left = Math.max(0, Math.round((until - Date.now()) / 1000));
      const el = document.querySelector("#card-ttl");
      if (!el) { clearInterval(cardTimer); return; }
      el.textContent = left ? t("card.ttl", { time: Math.floor(left / 60) + ":" + pad2(left % 60) }) : t("card.expired");
      if (!left) clearInterval(cardTimer);
    };
    tick(); cardTimer = setInterval(tick, 1000);
    document.querySelector("#card-refresh").addEventListener("click", () => card());
  }

  async function partner() {
    const d = await api("/v1/me/discounts");
    const months = (d.months || []).map(m => '<tr><td>' + esc(m.month) + '</td><td class="num">' + m.count + '</td><td class="num">' + esc(money(m.amount)) + '</td><td class="num">' + esc(money(m.commission)) + "</td></tr>").join("");
    content.innerHTML = panel(t("partner.section"), t("partner.sectionText", { rate: pct((d.commission_rate || 0.02) * 100) }),
        '<div id="redeem-box"></div><div class="data-list">' + (d.items.length ? d.items.map(o => offerCard(o, "mine")).join("") : '<p class="muted">' + esc(t("partner.empty")) + "</p>") + "</div>") +
      (months ? panel(t("partner.stats"), t("partner.statsText"), '<div class="table-scroll"><table class="data-table"><thead><tr><th>' + esc(t("partner.month")) + '</th><th class="num">' + esc(t("partner.count")) + '</th><th class="num">' + esc(t("partner.amount")) + '</th><th class="num">' + esc(t("partner.commission")) + "</th></tr></thead><tbody>" + months + "</tbody></table></div>") : "") +
      panel(t("partner.newTitle"), t("partner.newText"),
        '<form id="offer-form" class="app-form">' + field(t("partner.business"), "business_name", "", "text", 'required minlength="2" maxlength="160"') + field(t("partner.title"), "title", "", "text", 'required minlength="3" maxlength="160"') +
        field(t("partner.percent"), "discount_percent", "", "number", 'required min="1" max="90" step="0.5"') +
        '<label class="field"><span>' + esc(t("announcements.category")) + '</span><select name="category">' + OFFER_CATS.map(c => option(c, I18N.label("offerCategory", c), c === "food")).join("") + "</select></label>" +
        field(t("partner.city"), "city", t("partner.cityDefault"), "text", 'maxlength="80"') + field(t("partner.address"), "address", "", "text", 'maxlength="300"') + area(t("partner.description"), "description", "") +
        field(t("announcements.contactField"), "contact", "", "text", 'maxlength="200"') + '<p class="muted">' + esc(t("partner.terms", { rate: pct((d.commission_rate || 0.02) * 100) })) + '</p><button class="primary-button">' + esc(t("announcements.submit")) + "</button></form>");
    document.querySelector("#offer-form").addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const v = k => String(f.get(k) || "").trim();
      try {
        await api("/v1/me/discounts", { method: "POST", body: JSON.stringify({ business_name: v("business_name"), title: v("title"), discount_percent: Number(v("discount_percent").replace(",", ".")), category: v("category"), city: v("city") || null, address: v("address") || null, description: v("description") || null, contact: v("contact") || null }) });
        await partner(); status(t("partner.sent"));
      } catch (x) { status(x.message, true); }
    });
    content.querySelectorAll("[data-offer-hide]").forEach(b => b.addEventListener("click", async () => {
      try { await api("/v1/me/discounts/" + encodeURIComponent(b.dataset.offerHide), { method: "DELETE" }); await partner(); status(t("announcements.removed")); } catch (x) { status(x.message, true); }
    }));
    content.querySelectorAll("[data-redeem]").forEach(b => b.addEventListener("click", () => redeemForm(b.dataset.redeem, b.dataset.name)));
  }

  function redeemForm(offerId, title) {
    const box = document.querySelector("#redeem-box");
    const canScan = "BarcodeDetector" in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    box.innerHTML = '<form id="redeem-form" class="app-form redeem-form"><h3>' + esc(t("partner.acceptTitle", { title })) + "</h3>" +
      field(t("partner.code"), "code", "", "text", 'required minlength="6" maxlength="16" autocomplete="off" autocapitalize="characters"') +
      (canScan ? '<button type="button" class="outline-button" id="scan-qr">' + esc(t("partner.scan")) + '</button><video id="scan-video" playsinline muted hidden></video>' : "") +
      field(t("partner.purchase"), "amount_kzt", "", "number", 'required min="1" step="1"') + '<button class="primary-button">' + esc(t("partner.record")) + '</button><div id="redeem-result" aria-live="polite"></div></form>';
    box.scrollIntoView({ behavior: "smooth" });
    const form = document.querySelector("#redeem-form");
    if (canScan) document.querySelector("#scan-qr").addEventListener("click", async () => {
      const video = document.querySelector("#scan-video");
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = stream; video.hidden = false; await video.play();
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        const started = Date.now();
        while (Date.now() - started < 30000 && document.body.contains(video)) {
          const codes = await detector.detect(video).catch(() => []);
          const raw = codes.map(x => x.rawValue).find(v => /^FRIENDS:/.test(v || ""));
          if (raw) { form.elements.code.value = raw.slice(8); break; }
          await new Promise(r => setTimeout(r, 250));
        }
      } catch { status(t("partner.scanFailed"), true); }
      finally { if (stream) stream.getTracks().forEach(tr => tr.stop()); video.hidden = true; }
    });
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const code = String(form.elements.code.value || "").replace(/^FRIENDS:/i, "").trim();
      const amount = Number(form.elements.amount_kzt.value);
      try {
        const r = await api("/v1/me/discounts/" + encodeURIComponent(offerId) + "/redeem", { method: "POST", body: JSON.stringify({ code, amount_kzt: amount }) });
        document.querySelector("#redeem-result").innerHTML = '<p class="demo-note">' + esc(t("partner.recorded", { name: r.customer_name || t("admin.member"), amount: money(r.amount_kzt), pct: pct(r.discount_percent), commission: money(r.commission_kzt) })) + "</p>";
        form.elements.code.value = ""; form.elements.amount_kzt.value = "";
        status(t("partner.recordedShort"));
      } catch (x) { status(x.message, true); }
    });
  }

  async function adminDiscounts() {
    const [pending, report] = await Promise.all([api("/v1/admin/discounts?status=pending"), api("/v1/admin/discount-commissions")]);
    const rows = report.items.map(r => "<tr><td>" + esc(r.partner_name || "") + '<br><small class="muted">' + esc(r.partner_email || "") + '</small></td><td class="num">' + r.count + '</td><td class="num">' + esc(money(r.amount)) + '</td><td class="num"><strong>' + esc(money(r.commission)) + "</strong></td></tr>").join("");
    content.innerHTML = panel(t("adminDisc.reportTitle"), t("adminDisc.reportText", { rate: pct((report.commission_rate || 0.02) * 100) }),
        '<p class="seat-count"><strong>' + esc(t("adminDisc.total", { commission: money(report.total.commission), amount: money(report.total.amount), count: report.total.count })) + "</strong></p>" +
        (rows ? '<div class="table-scroll"><table class="data-table"><thead><tr><th>' + esc(t("adminDisc.partner")) + '</th><th class="num">' + esc(t("partner.count")) + '</th><th class="num">' + esc(t("partner.amount")) + '</th><th class="num">' + esc(t("partner.commission")) + "</th></tr></thead><tbody>" + rows + "</tbody></table></div>" : '<p class="muted">' + esc(t("adminDisc.noSales")) + "</p>")) +
      panel(t("adminDisc.pendingTitle"), t("adminDisc.pendingText"), pending.items.length ? pending.items.map(o => offerCard(o, "admin")).join("") : '<p class="muted">' + esc(t("adminDisc.empty")) + "</p>");
    content.querySelectorAll("[data-offer-act]").forEach(b => b.addEventListener("click", async () => {
      let body = {};
      if (b.dataset.offerAct === "reject") { const note = prompt(t("adminExperts.rejectPrompt")); if (!note?.trim()) return; body = { review_note: note.trim() }; }
      try { await api("/v1/admin/discounts/" + encodeURIComponent(b.dataset.id) + "/" + b.dataset.offerAct, { method: "POST", body: JSON.stringify(body) }); await adminDiscounts(); status(t("adminAnn.saved")); } catch (x) { status(x.message, true); }
    }));
  }

  // ---------- WhatsApp, feedback, referrals ----------
  async function nudgeBox() {
    const box = document.querySelector("#nudge-box");
    if (!box) return;
    const r = await api("/v1/me/nudge/settings");
    box.innerHTML = panel(t("nudge.settingsTitle"), t("nudge.settingsText"), '<label class="consent-field"><input type="checkbox" id="nudge-enabled"' + (r.enabled ? " checked" : "") + "> <span>" + esc(t("nudge.settingsLabel")) + "</span></label>");
    box.querySelector("#nudge-enabled").addEventListener("change", async e => {
      try { await api("/v1/me/nudge/settings", { method: "PUT", body: JSON.stringify({ enabled: e.target.checked }) }); status(t("biz.saved")); } catch (x) { status(x.message, true); }
    });
  }

  async function whatsappBox() {
    const w = await api("/v1/me/whatsapp");
    const box = document.querySelector("#wa-box");
    if (!box) return;
    box.innerHTML = panel(t("whatsapp.title"), t("whatsapp.text"),
      '<form id="wa-test" class="app-form"><label class="field"><span>' + esc(t("subs.waTestPhone")) + '</span><input name="phone" type="tel" inputmode="tel" required placeholder="+7 700 000 00 00"></label><button class="outline-button">' + esc(t("subs.waTest")) + '</button></form><div id="wa-test-out" class="demo-note" hidden></div><form id="wa-form" class="app-form">' + field(t("whatsapp.phone"), "phone", w.phone || "", "tel", 'inputmode="tel" autocomplete="tel" placeholder="+7 701 123 45 67" maxlength="20"') +
      '<label class="consent-field"><input type="checkbox" name="opted_in" value="yes"' + (w.opted_in ? " checked" : "") + "> <span>" + esc(t("whatsapp.consent")) + " " +
      (privacyPolicyUrl ? '<a href="' + esc(safeUrl(privacyPolicyUrl)) + '" target="_blank" rel="noopener noreferrer">' + esc(t("consent.link")) + "</a>" : "") + "</span></label>" +
      '<p class="muted">' + esc(w.opted_in ? t("whatsapp.on") : t("whatsapp.off")) + '</p><button class="primary-button">' + esc(t("whatsapp.save")) + "</button></form>");
    document.querySelector("#wa-form").addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const phone = String(f.get("phone") || "").trim();
      const on = f.get("opted_in") === "yes";
      try {
        await api("/v1/me/whatsapp", { method: "PUT", body: JSON.stringify({ phone: phone || null, opted_in: on, consent_version: on ? w.consent_current_version : null }) });
        await whatsappBox();
        status(on ? t("whatsapp.savedOn") : t("whatsapp.savedOff"));
      } catch (x) { status(x.message, true); }
    });
  }

  const referralFields = prefix =>
    field(t("referral.name"), "ref_name", "", "text", 'maxlength="120" ' + (prefix ? "" : "required")) +
    field(t("referral.phone"), "ref_phone", "", "tel", 'inputmode="tel" placeholder="+7 701 123 45 67" maxlength="20" ' + (prefix ? "" : "required")) +
    field(t("referral.note"), "ref_note", "", "text", 'maxlength="500"') +
    '<label class="consent-field"><input type="checkbox" name="ref_consent" value="yes"> <span>' + esc(t("referral.consent")) + "</span></label>";
  // Returns null when no friend was entered, false when the form is incomplete.
  function readReferral(f) {
    const name = String(f.get("ref_name") || "").trim(), phone = String(f.get("ref_phone") || "").trim();
    if (!name && !phone) return null;
    if (!name || !phone) { status(t("referral.incomplete"), true); return false; }
    if (f.get("ref_consent") !== "yes") { status(t("referral.consentRequired"), true); return false; }
    return { name, phone, note: String(f.get("ref_note") || "").trim() || null, consent: true };
  }

  let feedbackEvent = null;
  async function feedback() {
    if (!feedbackEvent) { const p = (await api("/v1/me/feedback-pending")).items || []; feedbackEvent = p[0] || null; }
    if (!feedbackEvent) { content.innerHTML = panel(t("feedback.doneTitle"), t("feedback.none"), ""); return; }
    const ev = feedbackEvent;
    const stars = [1, 2, 3, 4, 5].map(n => '<label class="rate-option"><input type="radio" name="rating" value="' + n + '" required><span aria-hidden="true">★</span><span class="sr-only">' + esc(t("feedback.stars", { n })) + "</span></label>").join("");
    const renew = ["yes", "maybe", "no"].map(v => '<label class="consent-field"><input type="radio" name="renew_intent" value="' + v + '" required> <span>' + esc(t("feedback.renew." + v)) + "</span></label>").join("");
    content.innerHTML = panel(t("feedback.formTitle", { title: ev.title }), t("feedback.formText"),
      '<form id="fb-form" class="app-form"><fieldset class="rate-group"><legend>' + esc(t("feedback.rating")) + "</legend>" + stars + "</fieldset>" +
      area(t("feedback.liked"), "liked", "") + area(t("feedback.disliked"), "disliked", "") +
      '<fieldset class="plain-fieldset"><legend>' + esc(t("feedback.renewQuestion")) + "</legend>" + renew + "</fieldset>" +
      '<fieldset class="plain-fieldset"><legend>' + esc(t("feedback.referQuestion")) + '</legend><p class="muted">' + esc(t("feedback.referText")) + "</p>" + referralFields("fb") + "</fieldset>" +
      '<button class="primary-button">' + esc(t("feedback.send")) + "</button></form>");
    document.querySelector("#fb-form").addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const referral = readReferral(f);
      if (referral === false) return;
      try {
        await api("/v1/events/" + encodeURIComponent(ev.id) + "/feedback", { method: "POST", body: JSON.stringify({
          rating: Number(f.get("rating")), liked: String(f.get("liked") || "").trim() || null, disliked: String(f.get("disliked") || "").trim() || null,
          renew_intent: String(f.get("renew_intent")), referral }) });
        feedbackEvent = null;
        content.innerHTML = panel(t("feedback.doneTitle"), t("feedback.doneText"), '<button type="button" class="primary-button" data-view="overview">' + esc(t("feedback.back")) + "</button>");
        status(t("feedback.sent"));
      } catch (x) { status(x.message, true); }
    });
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-feedback-event]");
    if (!b) return;
    feedbackEvent = { id: b.dataset.feedbackEvent, title: b.dataset.title };
    render("feedback");
  });

  // ---------- Friends staff: statistics, feedback, referrals, team ----------
  const statTile = (label, value, hint) => '<article class="kpi-card"><p>' + esc(label) + "</p><strong>" + esc(String(value)) + "</strong>" + (hint ? "<small>" + esc(hint) + "</small>" : "") + "</article>";
  async function adminStats() {
    const s = await api("/v1/admin/stats");
    let html = "";
    if (s.members) html += panel(t("stats.members"), t("stats.membersText"), '<div class="kpi-grid">' + statTile(t("stats.active"), s.members.active) + statTile(t("stats.newMonth"), s.members.new_this_month) + statTile(t("stats.expiring"), s.members.expiring_30d, t("stats.days30")) + statTile(t("stats.whatsappOn"), s.members.whatsapp_opted_in) + "</div>");
    if (s.sales) {
      const ri = s.sales.renew_intent || {}, rf = s.sales.referrals || {};
      const rows = s.sales.expiring.map(x => "<tr><td>" + esc(x.name || "") + '</td><td>' + esc(date(x.ends_at)) + "</td><td>" + esc(x.renew_intent ? t("feedback.renewShort." + x.renew_intent) : "—") + "</td><td>" + (x.whatsapp ? '<a href="https://wa.me/' + esc(x.whatsapp.replace("+", "")) + '" target="_blank" rel="noopener noreferrer">' + esc(x.whatsapp) + "</a>" : "—") + "</td></tr>").join("");
      html += panel(t("stats.sales"), t("stats.salesText"), '<div class="kpi-grid">' + statTile(t("stats.renewYes"), ri.yes || 0) + statTile(t("stats.renewMaybe"), ri.maybe || 0) + statTile(t("stats.renewNo"), ri.no || 0) + statTile(t("stats.referralsNew"), rf.new || 0, t("stats.referralsHint", { joined: rf.joined || 0 })) + "</div>" +
        (rows ? '<h3>' + esc(t("stats.expiringList")) + '</h3><div class="table-scroll"><table class="data-table"><thead><tr><th>' + esc(t("stats.member")) + "</th><th>" + esc(t("stats.until")) + "</th><th>" + esc(t("stats.intent")) + "</th><th>WhatsApp</th></tr></thead><tbody>" + rows + "</tbody></table></div>" : '<p class="muted">' + esc(t("stats.noExpiring")) + "</p>"));
    }
    if (s.marketing) {
      const m = s.marketing;
      html += panel(t("stats.marketing"), t("stats.marketingText"), '<div class="kpi-grid">' + statTile(t("stats.events90"), m.events) + statTile(t("stats.registrations"), m.registrations) + statTile(t("stats.avgRating"), m.avg_rating == null ? "—" : String(m.avg_rating).replace(".", ","), t("stats.feedbackCount", { n: m.feedback_count })) +
        statTile(t("stats.announcements30"), m.announcements_30d) + statTile(t("stats.discounts"), m.discounts_published) + statTile(t("stats.experts"), m.experts_published) + statTile(t("stats.learners30"), m.learners_30d) + "</div>");
    }
    if (s.accounting) {
      const a = s.accounting;
      html += panel(t("stats.accounting"), t("stats.accountingText"), '<div class="kpi-grid">' + statTile(t("stats.paidMonth"), money(a.paid_this_month), t("stats.count", { n: a.paid_count })) + statTile(t("stats.outstanding"), money(a.outstanding), t("stats.overdue", { n: a.overdue_count })) +
        statTile(t("stats.receipts"), a.pending_receipts) + statTile(t("stats.commissionMonth"), money(a.discount_commission_this_month), t("stats.count", { n: a.discount_purchases })) + "</div>");
    }
    if (s.whatsapp) html += '<p class="muted">' + esc(s.whatsapp.configured ? t("stats.waConfigured", { pending: s.whatsapp.pending, sent: s.whatsapp.sent_30d }) : t("stats.waNotConfigured", { pending: s.whatsapp.pending })) + "</p>";
    content.innerHTML = html;
  }

  async function adminFeedback(eventId) {
    if (typeof eventId === "string") {
      const d = await api("/v1/admin/feedback?event_id=" + encodeURIComponent(eventId));
      content.innerHTML = '<button type="button" class="text-button" data-view="admin-feedback">← ' + esc(t("adminFb.back")) + "</button>" +
        panel(t("adminFb.comments"), "", d.items.length ? d.items.map(f => '<div class="list-row"><div><strong>' + esc(f.member_name || "") + " · " + "★".repeat(f.rating) + "</strong>" +
          (f.liked ? "<p>＋ " + esc(f.liked) + "</p>" : "") + (f.disliked ? "<p>－ " + esc(f.disliked) + "</p>" : "") + "<small>" + esc(t("feedback.renewShort." + f.renew_intent)) + " · " + esc(date(f.created_at)) + "</small></div></div>").join("") : '<p class="muted">' + esc(t("adminFb.empty")) + "</p>");
      return;
    }
    const d = await api("/v1/admin/feedback");
    content.innerHTML = panel(t("adminFb.title"), t("adminFb.text"), d.items.length ? '<div class="table-scroll"><table class="data-table"><thead><tr><th>' + esc(t("adminFb.event")) + '</th><th class="num">' + esc(t("adminFb.responses")) + '</th><th class="num">' + esc(t("stats.avgRating")) + '</th><th class="num">' + esc(t("stats.renewYes")) + '</th><th class="num">' + esc(t("stats.renewMaybe")) + '</th><th class="num">' + esc(t("stats.renewNo")) + "</th></tr></thead><tbody>" +
      d.items.map(e => '<tr><td><button type="button" class="text-button" data-fb-event="' + esc(e.id) + '">' + esc(e.title) + "</button><br><small class=\"muted\">" + esc(date(e.starts_at)) + '</small></td><td class="num">' + e.responses + " / " + e.registered + '</td><td class="num">' + (e.avg_rating == null ? "—" : esc(String(e.avg_rating).replace(".", ","))) + '</td><td class="num">' + e.renew_yes + '</td><td class="num">' + e.renew_maybe + '</td><td class="num">' + e.renew_no + "</td></tr>").join("") + "</tbody></table></div>" : '<p class="muted">' + esc(t("adminFb.noEvents")) + "</p>");
    content.querySelectorAll("[data-fb-event]").forEach(b => b.addEventListener("click", () => adminFeedback(b.dataset.fbEvent).catch(x => status(x.message, true))));
  }

  const REF_STATUSES = ["new", "contacted", "joined", "paid", "declined"];
  async function adminReferrals() {
    const [d, bon] = await Promise.all([api("/v1/admin/referrals"), api("/v1/admin/referral-bonuses").catch(() => null)]);
    const bonusPanel = bon ? panel(t("adminRef.bonusTitle"), t("adminRef.bonusText", { need: bon.rule.per_bonus, months: bon.rule.months }), bon.items.length ? bon.items.map(b => '<article class="invoice-card"><div class="invoice-top"><div><h3>' + ic("gift", "ic-inline") + ' ' + esc(b.member_name || "") + "</h3><small>" + esc(t("adminRef.brought", { names: (b.brought || []).join(", ") })) + '</small></div><span class="pill">' + esc(t("adminRef.bonus." + b.status)) + "</span></div>" +
      '<p class="muted">' + esc(b.status === "applied" ? t("adminRef.appliedUntil", { date: day(b.membership_until) }) : t("adminRef.currentUntil", { date: b.current_until ? day(b.current_until) : "—", months: b.months })) + "</p>" +
      (b.status === "earned" ? '<div class="receipt-actions"><button type="button" class="primary-button" data-bonus="' + esc(b.id) + '">' + esc(t("adminRef.apply", { months: b.months })) + "</button></div>" : "") + "</article>").join("") : '<p class="muted">' + esc(t("adminRef.noBonuses")) + "</p>") : "";
    content.innerHTML = bonusPanel + panel(t("adminRef.title"), t("adminRef.text"), d.items.length ? d.items.map(l => '<article class="invoice-card"><div class="invoice-top"><div><h3>' + esc(l.name) + '</h3><small><a href="tel:' + esc(l.phone) + '">' + esc(l.phone) + '</a> · <a href="https://wa.me/' + esc(l.phone.replace("+", "")) + '" target="_blank" rel="noopener noreferrer">WhatsApp</a></small></div><span class="pill">' + esc(I18N.label("referralStatus", l.status)) + "</span></div>" +
      "<p>" + esc(t("adminRef.from", { name: l.referrer_name || "" })) + (l.event_title ? " · " + esc(l.event_title) : "") + "</p>" + (l.note ? '<p class="muted">' + esc(l.note) + "</p>" : "") +
      '<label class="field"><span>' + esc(t("adminRef.status")) + '</span><select data-ref-status="' + esc(l.id) + '">' + REF_STATUSES.map(st => option(st, I18N.label("referralStatus", st), st === l.status)).join("") + "</select></label></article>").join("") : '<p class="muted">' + esc(t("adminRef.empty")) + "</p>");
    content.querySelectorAll("[data-ref-status]").forEach(sel => sel.addEventListener("change", async () => {
      try { const r = await api("/v1/admin/referrals/" + encodeURIComponent(sel.dataset.refStatus) + "/status", { method: "POST", body: JSON.stringify({ status: sel.value }) }); status(t(r.bonuses_created ? "adminRef.bonusCreated" : "adminAnn.saved")); if (r.bonuses_created) await adminReferrals(); } catch (x) { status(x.message, true); }
    }));
    content.querySelectorAll("[data-bonus]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm(t("adminRef.applyConfirm"))) return;
      try { const r = await api("/v1/admin/referral-bonuses/" + encodeURIComponent(b.dataset.bonus) + "/apply", { method: "POST", body: "{}" }); status(t("adminRef.appliedUntil", { date: day(r.membership_until) })); await adminReferrals(); } catch (x) { status(x.message, true); }
    }));
  }


  // ---------- Bloggers (promo partners): links, free month, funnel, bonuses ----------
  // Phone sign-ups: who came, from which blogger, with what access. CSV opens in Excel / Google Sheets.
  async function adminBans() {
    let d;
    try { d = await api("/v1/admin/bans"); } catch (e) { if (e.status === 403) { content.innerHTML = panel(t("bans.title"), t("bans.noAccess"), ""); return; } throw e; }
    const rows = d.items.map(r => "<tr><td>" + esc(r.phone) + "</td><td>" + esc(r.name || "") + "</td><td>" + esc(r.reason || "") + "</td><td>" + esc(date(r.created_at)) + '</td><td><button type="button" class="text-button" data-unban="' + esc(r.phone) + '">' + esc(t("bans.unban")) + "</button></td></tr>").join("");
    content.innerHTML = panel(t("bans.title"), t("bans.text"),
      '<form id="ban-form" class="app-form">' + field(t("signups.phone"), "phone", "", "tel", 'required inputmode="tel" placeholder="+7 701 123 45 67"') + field(t("bans.reason"), "reason", "", "text", 'maxlength="500"') + '<button class="primary-button">' + esc(t("bans.add")) + "</button></form>" +
      '<div class="table-scroll"><table class="data-table"><thead><tr><th>' + esc(t("signups.phone")) + "</th><th>" + esc(t("signups.name")) + "</th><th>" + esc(t("bans.reason")) + "</th><th>" + esc(t("signups.joined")) + "</th><th></th></tr></thead><tbody>" + (rows || '<tr><td colspan="5">' + esc(t("bans.empty")) + "</td></tr>") + "</tbody></table></div>");
    content.querySelector("#ban-form").addEventListener("submit", async e => {
      e.preventDefault(); const f = new FormData(e.currentTarget);
      try { await api("/v1/admin/bans", { method: "POST", body: JSON.stringify({ phone: String(f.get("phone")).replace(/[\s()-]/g, ""), reason: String(f.get("reason") || "").trim() || null }) }); status(t("bans.added")); await adminBans(); } catch (x) { status(x.message, true); }
    });
    content.querySelectorAll("[data-unban]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm(t("bans.unbanConfirm", { phone: b.dataset.unban }))) return;
      try { await api("/v1/admin/bans/" + encodeURIComponent(b.dataset.unban), { method: "DELETE" }); await adminBans(); } catch (x) { status(x.message, true); }
    }));
  }

  async function adminActivity() {
    const days = Number((content.querySelector("#act-days") || {}).value || 30);
    const inactive = Number((content.querySelector("#act-inactive") || {}).value || 0);
    let d;
    try { d = await api("/v1/admin/activity?days=" + days + (inactive ? "&inactive=" + inactive : "")); } catch (e) { if (e.status === 403) { content.innerHTML = panel(t("act.title"), t("act.noAccess"), ""); return; } throw e; }
    const books = await api("/v1/admin/book-ratings").then(x => x.items).catch(() => []);
    const k = d.kpi;
    const kpi = [["act.dau", k.dau], ["act.wau", k.wau], ["act.mau", k.mau], ["act.total", k.total]].map(([l, v]) => '<div class="kpi"><strong>' + esc(String(v)) + "</strong><span>" + esc(t(l)) + "</span></div>").join("");
    const vrows = d.views.map(v => "<tr><td>" + esc(v.view) + "</td><td>" + v.people + "</td><td>" + v.hits + "</td><td>" + v.minutes + "</td></tr>").join("");
    const prows = d.people.map(p => "<tr><td>" + esc(p.name || "—") + "</td><td>" + esc(p.city || "") + "</td><td>" + esc(p.phone || "") + "</td><td>" + (p.last_seen ? esc(date(p.last_seen)) : esc(t("act.never"))) + "</td><td>" + p.active_days + "</td><td>" + p.minutes + "</td><td>" + esc(p.top_views || "") + "</td><td>" + esc((p.kinds || []).map(k => t("kind." + k)).join(", ")) + "</td><td>" + esc(p.membership || "") + "</td></tr>").join("");
    const sel = (id, opts, cur) => '<select id="' + id + '">' + opts.map(([v, l]) => '<option value="' + v + '"' + (Number(v) === cur ? " selected" : "") + ">" + esc(l) + "</option>").join("") + "</select>";
    content.innerHTML = panel(t("act.title"), t("act.text"),
      '<div class="kpi-row">' + kpi + "</div>" +
      '<div class="app-form"><label>' + esc(t("act.period")) + sel("act-days", [[7, "7"], [30, "30"], [90, "90"]], days) + "</label><label>" + esc(t("act.filter")) + sel("act-inactive", [[0, t("act.all")], [7, t("act.inactive", { n: 7 })], [14, t("act.inactive", { n: 14 })], [30, t("act.inactive", { n: 30 })]], inactive) + "</label></div>" +
      "<h3>" + esc(t("act.sections")) + '</h3><div class="table-scroll"><table class="data-table"><thead><tr><th>' + esc(t("act.view")) + "</th><th>" + esc(t("act.people")) + "</th><th>" + esc(t("act.opens")) + "</th><th>" + esc(t("act.minutes")) + "</th></tr></thead><tbody>" + (vrows || '<tr><td colspan="4">' + esc(t("act.empty")) + "</td></tr>") + "</tbody></table></div>" +
      "<h3>" + esc(t("bookRate.admin")) + '</h3><div class="table-scroll"><table class="data-table"><thead><tr><th>' + esc(t("bookRate.book")) + "</th><th>" + esc(t("bookRate.score")) + "</th><th>" + esc(t("bookRate.votes")) + "</th><th>" + esc(t("bookRate.voiceCol")) + "</th></tr></thead><tbody>" + (books.filter(b => b.count || b.voice_count).map(b => "<tr><td>" + esc(b.title) + "</td><td>" + (b.avg == null ? "—" : b.avg) + "</td><td>" + b.count + "</td><td>" + (b.voice_avg == null ? "—" : b.voice_avg + " (" + b.voice_count + ")") + "</td></tr>").join("") || '<tr><td colspan="4">' + esc(t("act.empty")) + "</td></tr>") + "</tbody></table></div>" +
      "<h3>" + esc(t("act.persons")) + '</h3><div class="table-scroll"><table class="data-table"><thead><tr><th>' + esc(t("signups.name")) + "</th><th>" + esc(t("act.city")) + "</th><th>" + esc(t("signups.phone")) + "</th><th>" + esc(t("act.last")) + "</th><th>" + esc(t("act.days")) + "</th><th>" + esc(t("act.minutes")) + "</th><th>" + esc(t("act.top")) + "</th><th>" + esc(t("profile.kinds")) + "</th><th>" + esc(t("act.member")) + "</th></tr></thead><tbody>" + (prows || '<tr><td colspan="9">' + esc(t("act.empty")) + "</td></tr>") + "</tbody></table></div>");
    content.querySelectorAll("#act-days, #act-inactive").forEach(el => el.addEventListener("change", () => adminActivity()));
  }

  // ---------- Subscriptions: who pays, who does not, who has free access; «Лица Friends» ----------
  let subSegment = "", subQuery = "";
  async function adminSubscriptions() {
    let d, faces = { granted: [], waiting: [] };
    try { d = await api("/v1/admin/subscriptions?" + (subSegment ? "segment=" + subSegment + "&" : "") + (subQuery ? "q=" + encodeURIComponent(subQuery) : "")); }
    catch (e) { if (e.status === 403) { content.innerHTML = panel(t("subs.title"), t("signups.noAccess"), ""); return; } throw e; }
    try { faces = await api("/v1/admin/friend-faces"); } catch { /* optional */ }
    const SEGS = ["friend", "paid_active", "trial_active", "no_payment", "paid_expired", "trial_expired", "expired", "none"];
    const chips = '<div class="chip-tabs">' + '<button type="button" class="chip-tab' + (subSegment ? "" : " active") + '" data-seg="">' + esc(t("subs.all")) + "</button>" + SEGS.map(k => '<button type="button" class="chip-tab' + (subSegment === k ? " active" : "") + '" data-seg="' + k + '">' + esc(t("subs.seg." + k)) + " · " + (d.counts[k] || 0) + "</button>").join("") + "</div>";
    const rows = d.items.map(r => "<tr><td>" + esc(r.name || "—") + "<br><small class=\"muted\">" + esc(r.phone || "") + "</small></td><td>" + esc(t("subs.seg." + r.segment)) + "</td><td>" + (r.ends_at ? esc(day(r.ends_at)) + (r.days_left != null ? "<br><small class=\"muted\">" + esc(t("subs.daysLeft", { n: r.days_left })) + "</small>" : "") : (r.segment === "friend" ? esc(t("subs.forever")) : "—")) + '</td><td class="num">' + r.paid_count + "</td><td>" + (r.last_paid_at ? esc(day(r.last_paid_at)) : "—") + "</td><td>" + esc(r.partner || "") + "</td></tr>").join("");
    const faceList = faces.granted.map(f => "<li>" + esc(f.name || f.phone || "") + ' <small class="muted">' + esc(f.phone || "") + '</small> <button type="button" class="text-button" data-face-del="' + esc(f.phone || "") + '">' + esc(t("subs.faceRemove")) + "</button></li>").join("") +
      faces.waiting.map(f => "<li>" + esc(f.name || f.phone) + ' <small class="muted">' + esc(f.phone) + " · " + esc(t("subs.faceWaiting")) + '</small> <button type="button" class="text-button" data-face-del="' + esc(f.phone) + '">' + esc(t("subs.faceRemove")) + "</button></li>").join("");
    content.innerHTML = panel(t("subs.title"), t("subs.text"), chips +
      '<div class="learn-tools"><input type="search" id="subs-q" placeholder="' + esc(t("subs.search")) + '" value="' + esc(subQuery) + '"></div>' +
      '<div class="table-scroll"><table class="data-table"><thead><tr><th>' + esc(t("signups.name")) + "</th><th>" + esc(t("subs.status")) + "</th><th>" + esc(t("subs.until")) + '</th><th class="num">' + esc(t("subs.paid")) + "</th><th>" + esc(t("subs.lastPaid")) + "</th><th>" + esc(t("signups.source")) + "</th></tr></thead><tbody>" + (rows || '<tr><td colspan="6">' + esc(t("act.empty")) + "</td></tr>") + "</tbody></table></div>") +
      panel(t("subs.facesTitle"), t("subs.facesText"), '<ul class="plain-list">' + (faceList || "<li class=\"muted\">" + esc(t("act.empty")) + "</li>") + "</ul>" +
        '<form id="face-form" class="app-form">' + field(t("signups.phone"), "phone", "", "tel", 'required inputmode="tel" placeholder="+7 701 123 45 67"') + field(t("signups.name"), "name", "", "text", 'maxlength="120"') + '<button class="primary-button">' + esc(t("subs.faceAdd")) + "</button></form>") +
      panel(t("subs.codeTitle"), t("subs.codeText"), '<form id="code-form" class="app-form">' + field(t("signups.phone"), "phone", "", "tel", 'required inputmode="tel" placeholder="+375 29 123 45 67"') + '<button class="primary-button">' + esc(t("subs.codeGo")) + '</button></form><div id="code-out" class="demo-note" hidden></div><div class="receipt-actions"><button type="button" class="outline-button" id="sms-check">' + esc(t("subs.smsCheck")) + '</button></div><div id="sms-out" class="demo-note" hidden></div>') +
      panel(t("subs.waTitle"), t("subs.waText"), '<p class="muted" id="wa-state">' + esc(t("subs.waChecking")) + '</p><form id="wa-form" class="app-form"><label class="field"><span>' + esc(t("subs.waKey")) + '</span><input name="key" type="password" autocomplete="off" required maxlength="300" placeholder="bk_us1_..."></label><button class="primary-button">' + esc(t("subs.waSave")) + "</button></form>");
    content.querySelectorAll("[data-seg]").forEach(b => b.addEventListener("click", () => { subSegment = b.dataset.seg; adminSubscriptions(); }));
    const q = content.querySelector("#subs-q"); q.addEventListener("keydown", e => { if (e.key === "Enter") { subQuery = q.value.trim(); adminSubscriptions(); } });
    api("/v1/admin/bird-key").then(r => { content.querySelector("#wa-state").textContent = r.set ? t("subs.waOn", { last4: r.last4 }) : t("subs.waOff"); }).catch(() => { const el = content.querySelector("#wa-state"); if (el) el.textContent = t("subs.waOff"); });
    content.querySelector("#wa-test").addEventListener("submit", async e => {
      e.preventDefault(); const out = content.querySelector("#wa-test-out");
      try {
        const r = await api("/v1/admin/wa-test", { method: "POST", body: JSON.stringify({ phone: String(new FormData(e.currentTarget).get("phone")).replace(/[\s()-]/g, "") }) });
        out.hidden = false; out.style.whiteSpace = "pre-wrap";
        out.textContent = !r.configured ? t("subs.waOff") : r.error ? "Bird: " + r.error : "Bird HTTP " + r.status + "\n" + JSON.stringify(r.body, null, 1).slice(0, 700);
      } catch (x) { status(x.message, true); }
    });
    content.querySelector("#wa-form").addEventListener("submit", async e => {
      e.preventDefault(); const f = e.currentTarget;
      try { await api("/v1/admin/bird-key", { method: "PUT", body: JSON.stringify({ key: String(new FormData(f).get("key")).trim() }) }); f.reset(); status(t("subs.waSaved")); adminSubscriptions(); }
      catch (x) { status(x.message, true); }
    });
    content.querySelector("#sms-check").addEventListener("click", async () => {
      const out = content.querySelector("#sms-out");
      try {
        const r = await api("/v1/admin/sms-status");
        const bal = r.balance ? t("subs.smsBalance", { amount: r.balance.amount || "?", currency: r.balance.currency || "" }) : (r.balance_error ? t("subs.smsBalanceErr", { err: r.balance_error }) : t("subs.smsNoBalance", { provider: r.provider }));
        const fails = (r.failures || []).length ? (r.failures || []).map(f => new Date(f.created_at).toLocaleString() + " " + f.phone_masked + " " + f.reason).join("\n") : t("subs.smsNoFails");
        out.hidden = false; out.style.whiteSpace = "pre-line"; out.textContent = bal + "\n" + t("subs.smsLast") + "\n" + fails;
      } catch (x) { status(x.message, true); }
    });
    content.querySelector("#code-form").addEventListener("submit", async e => {
      e.preventDefault(); const f = new FormData(e.currentTarget); const out = content.querySelector("#code-out");
      try {
        const r = await api("/v1/admin/login-code", { method: "POST", body: JSON.stringify({ phone: String(f.get("phone")).replace(/[\s()-]/g, "") }) });
        out.hidden = false; out.textContent = t("subs.codeResult", { phone: r.phone, code: r.code, min: Math.round(r.expires_in / 60) });
      } catch (x) { status(x.message, true); }
    });
    content.querySelector("#face-form").addEventListener("submit", async e => {
      e.preventDefault(); const f = new FormData(e.currentTarget);
      try { const r = await api("/v1/admin/friend-faces", { method: "POST", body: JSON.stringify({ phone: String(f.get("phone")).replace(/[\s()-]/g, ""), name: String(f.get("name") || "").trim() || undefined }) }); status(t(r.granted ? "subs.faceGranted" : "subs.faceQueued")); await adminSubscriptions(); } catch (x) { status(x.message, true); }
    });
    content.querySelectorAll("[data-face-del]").forEach(b => b.addEventListener("click", async () => { if (!confirm(t("subs.faceConfirm"))) return; try { await api("/v1/admin/friend-faces/" + encodeURIComponent(b.dataset.faceDel), { method: "DELETE" }); await adminSubscriptions(); } catch (x) { status(x.message, true); } }));
  }

  async function adminSignups() {
    let d;
    const qv = (content.querySelector("#signups-q") || {}).value || "";
    try { d = await api("/v1/admin/signups?limit=1000" + (qv ? "&q=" + encodeURIComponent(qv) : "")); } catch (e) { if (e.status === 403) { content.innerHTML = panel(t("signups.title"), t("signups.noAccess"), ""); return; } throw e; }
    const dt = v => v ? date(v) : "";
    const access = r => r.membership_status === "active" ? (r.plan_code === "trial" ? t("signups.trial", { until: day(r.trial_until) }) : t("signups.member")) : t("signups.none");
    const rows = d.items.map(r => "<tr><td>" + esc(r.phone) + "</td><td>" + esc(r.display_name || "") + "</td><td>" + esc(r.city || "") + "</td><td>" + esc(r.partner_name || r.utm_source || "") + "</td><td>" + esc(access(r)) + "</td><td>" + esc(dt(r.created_at)) + "</td><td>" + esc(dt(r.last_login_at)) + "</td></tr>").join("");
    content.innerHTML = panel(t("signups.title"), t("signups.text", { n: d.total }),
      '<form id="signups-form" class="inline-form"><input id="signups-q" type="search" value="' + esc(qv) + '" placeholder="' + esc(t("signups.search")) + '"><button class="outline-button">' + esc(t("signups.find")) + '</button><button type="button" class="primary-button" id="signups-csv">' + esc(t("signups.csv")) + "</button></form>" +
      '<div class="table-scroll"><table class="data-table"><thead><tr><th>' + esc(t("signups.phone")) + "</th><th>" + esc(t("signups.name")) + "</th><th>" + esc(t("profile.city")) + "</th><th>" + esc(t("signups.source")) + "</th><th>" + esc(t("signups.access")) + "</th><th>" + esc(t("signups.joined")) + "</th><th>" + esc(t("signups.last")) + "</th><th></th></tr></thead><tbody>" + (rows || '<tr><td colspan="8">' + esc(t("signups.empty")) + "</td></tr>") + "</tbody></table></div>");
    content.querySelector("#signups-form").addEventListener("submit", e => { e.preventDefault(); adminSignups(); });
    content.querySelectorAll("[data-ban-phone]").forEach(b => b.addEventListener("click", async () => {
      const why = prompt(t("bans.reasonPrompt", { phone: b.dataset.banPhone }));
      if (why === null) return;
      try { await api("/v1/admin/bans", { method: "POST", body: JSON.stringify({ phone: b.dataset.banPhone, reason: why.trim() || null }) }); status(t("bans.added")); } catch (x) { status(x.message, true); }
    }));
    content.querySelector("#signups-csv").addEventListener("click", () => {
      const q = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
      const lines = [["phone", "name", "city", "source", "access", "joined", "last_login"].map(q).join(",")].concat(d.items.map(r => [r.phone, r.display_name, r.city, r.partner_name || r.utm_source, access(r), r.created_at, r.last_login_at].map(q).join(",")));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
      a.download = "friends-signups.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
  }

  const parseTiers = v => { const a = String(v || "").split(",").map(x => x.trim()).filter(Boolean).map(Number); return a.length && a.every(n => Number.isFinite(n) && n >= 0 && n <= 100) ? a.slice(0, 5) : null; };
  async function adminPartners(openId) {
    let d;
    try { d = await api("/v1/admin/partners"); } catch (e) { if (e.status === 403) { content.innerHTML = panel(t("adminPartners.title"), t("adminPartners.noAccess"), ""); return; } throw e; }
    const canPay = (await loadRoles()).some(r => r === "admin" || r === "accountant");
    const link = p => SITE_URL + "/?ref=" + encodeURIComponent(p.code);
    const sum = k => d.items.reduce((a, p) => a + Number(p[k] || 0), 0);
    const kpi = (label, v) => '<div class="stat-card"><p>' + esc(label) + "</p><strong>" + esc(String(v)) + "</strong></div>";
    const totals = '<div class="stats-grid">' + kpi(t("adminPartners.signups"), sum("signups")) + kpi(t("adminPartners.paidUsers"), sum("paid_users")) + kpi(t("adminPartners.revenue"), money(sum("revenue_kzt"))) + kpi(t("adminPartners.bonusDue"), money(sum("bonus_due_kzt"))) + "</div>";
    const card = p => '<article class="invoice-card"><div class="invoice-top"><div><h3>' + esc(p.name) + "</h3><small>" + esc(p.contact || "") + '</small></div><span class="pill">' + esc(t("adminPartners.status." + p.status)) + "</span></div>" +
      '<div class="copy-row"><input readonly value="' + esc(link(p)) + '" aria-label="' + esc(t("adminPartners.link")) + '"><button type="button" class="outline-button" data-copy-link="' + esc(link(p)) + '">' + esc(t("adminPartners.copy")) + "</button></div>" +
      '<p class="muted">' + esc(Number(p.first_bonus_pct) === 0 && (!Array.isArray(p.renewal_tiers) || !p.renewal_tiers.length) && Number(p.renewal_bonus_pct || 0) === 0 ? t("adminPartners.termsOwn", { days: p.trial_days }) : Array.isArray(p.renewal_tiers) && p.renewal_tiers.length ? t("adminPartners.termsTiers", { days: p.trial_days, first: Number(p.first_bonus_pct), tiers: p.renewal_tiers.map(Number).join("% → ") + "%" }) : t("adminPartners.terms", { days: p.trial_days, first: Number(p.first_bonus_pct), renewal: Number(p.renewal_bonus_pct), months: p.renewal_months })) + (Number(p.fixed_bonus_kzt) ? " · " + esc(t("adminPartners.fixed", { sum: money(p.fixed_bonus_kzt) })) : "") + "</p>" +
      '<div class="table-scroll"><table class="data-table"><thead><tr><th class="num">' + esc(t("adminPartners.visits30")) + '</th><th class="num">' + esc(t("adminPartners.signups")) + '</th><th class="num">' + esc(t("adminPartners.trials")) + '</th><th class="num">' + esc(t("adminPartners.paidUsers")) + '</th><th class="num">' + esc(t("adminPartners.revenue")) + '</th><th class="num">' + esc(t("adminPartners.bonusDue")) + '</th><th class="num">' + esc(t("adminPartners.bonusPaid")) + "</th></tr></thead><tbody><tr>" +
      '<td class="num">' + p.visits_30d + '</td><td class="num">' + p.signups + '</td><td class="num">' + p.trials_active + '</td><td class="num">' + p.paid_users + '</td><td class="num">' + esc(money(p.revenue_kzt)) + '</td><td class="num"><strong>' + esc(money(p.bonus_due_kzt)) + '</strong></td><td class="num">' + esc(money(p.bonus_paid_kzt)) + "</td></tr></tbody></table></div>" +
      '<div class="receipt-actions">' + (canPay && Number(p.bonus_due_kzt) > 0 ? '<button type="button" class="primary-button" data-payout="' + esc(p.id) + '" data-sum="' + esc(money(p.bonus_due_kzt)) + '">' + esc(t("adminPartners.payout", { sum: money(p.bonus_due_kzt) })) + "</button>" : "") +
      '<button type="button" class="outline-button" data-partner-open="' + esc(p.id) + '">' + esc(t("adminPartners.details")) + "</button>" +
      '<button type="button" class="outline-button" data-partner-edit="' + esc(p.id) + '">' + esc(t("adminPartners.edit")) + "</button>" +
      '<button type="button" class="text-button" data-partner-toggle="' + esc(p.id) + '" data-next="' + (p.status === "active" ? "paused" : "active") + '">' + esc(t(p.status === "active" ? "adminPartners.pause" : "adminPartners.resume")) + "</button></div>" +
      '<div data-partner-edit-box="' + esc(p.id) + '"></div><div data-partner-details="' + esc(p.id) + '"></div></article>';
    const form = '<form id="partner-form" class="app-form">' + field(t("adminPartners.name"), "name", "", "text", 'required minlength="2" maxlength="120"') +
      field(t("adminPartners.code"), "code", "", "text", 'required pattern="[A-Za-z0-9][A-Za-z0-9_\\-]{1,39}" placeholder="assel" autocapitalize="none" autocorrect="off" spellcheck="false"') +
      field(t("adminPartners.contact"), "contact", "", "text", 'maxlength="200"') +
      '<div class="form-grid">' + field(t("adminPartners.trialDays"), "trial_days", "30", "number", 'min="0" max="90"') + field(t("adminPartners.firstPct"), "first_bonus_pct", "40", "number", 'min="0" max="100" step="0.5"') + "</div>" +
      field(t("adminPartners.tiers"), "tiers", "20,10", "text", 'placeholder="20,10" maxlength="40"') + '<p class="muted">' + esc(t("adminPartners.tiersHint")) + "</p>" +
      field(t("adminPartners.ownerPhone"), "owner_phone", "", "tel", 'placeholder="+7 701 123 45 67" inputmode="tel"') + '<p class="muted">' + esc(t("adminPartners.ownerHint")) + "</p>" +
      '<button class="primary-button">' + esc(t("adminPartners.add")) + "</button></form>";
    content.innerHTML = panel(t("adminPartners.title"), t("adminPartners.text"), totals) +
      panel(t("adminPartners.listTitle"), t("adminPartners.listText"), d.items.length ? d.items.map(card).join("") : '<p class="muted">' + esc(t("adminPartners.empty")) + "</p>") +
      panel(t("adminPartners.addTitle"), t("adminPartners.addText"), form);
    // The code field accepts a pasted link too: only the last part is kept (friendscommunity.kz/assel -> assel).
    const codeInput = document.querySelector('#partner-form [name="code"]');
    if (codeInput) codeInput.addEventListener("input", () => {
      const v = codeInput.value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
      const cleaned = (v.includes("/") ? v.split("/").pop() : v).replace(/[^a-z0-9_-]/g, "");
      if (cleaned !== codeInput.value) codeInput.value = cleaned;
    });
    document.querySelector("#partner-form").addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const num = k => Number(f.get(k) || 0);
      try {
        await api("/v1/admin/partners", { method: "POST", body: JSON.stringify({ name: String(f.get("name")).trim(), code: String(f.get("code")).trim().toLowerCase(), contact: String(f.get("contact") || "").trim() || null,
          trial_days: num("trial_days"), first_bonus_pct: num("first_bonus_pct"), renewal_bonus_pct: (parseTiers(f.get("tiers")) || [20])[0], renewal_months: 12, fixed_bonus_kzt: 0,
          renewal_tiers: parseTiers(f.get("tiers")), ...(String(f.get("owner_phone") || "").trim() ? { owner_phone: String(f.get("owner_phone")).replace(/[ ()-]/g, "") } : {}) }) });
        status(t("adminPartners.added")); await adminPartners();
      } catch (x) { status(x.code === "code_taken" ? t("adminPartners.codeTaken") : x.code === "owner_not_signed_in" ? t("adminPartners.ownerNotSignedIn") : x.message, true); }
    });
    content.querySelectorAll("[data-copy-link]").forEach(b => b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(b.dataset.copyLink); status(t("tests.copied")); } catch { b.previousElementSibling.select(); } }));
    content.querySelectorAll("[data-payout]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm(t("adminPartners.payoutConfirm", { sum: b.dataset.sum }))) return;
      try { const r = await api("/v1/admin/partners/" + encodeURIComponent(b.dataset.payout) + "/payout", { method: "POST", body: "{}" }); status(t("adminPartners.paidOut", { sum: money(r.total_kzt) })); await adminPartners(); } catch (x) { status(x.message, true); }
    }));
    content.querySelectorAll("[data-partner-toggle]").forEach(b => b.addEventListener("click", async () => {
      try { await api("/v1/admin/partners/" + encodeURIComponent(b.dataset.partnerToggle), { method: "PATCH", body: JSON.stringify({ status: b.dataset.next }) }); await adminPartners(); } catch (x) { status(x.message, true); }
    }));
    const openDetails = async id => {
      const box = content.querySelector('[data-partner-details="' + CSS.escape(id) + '"]');
      if (!box) return;
      if (box.innerHTML) { box.innerHTML = ""; return; }
      try {
        const x = await api("/v1/admin/partners/" + encodeURIComponent(id) + "/commissions");
        box.innerHTML = "<h4>" + esc(t("adminPartners.people")) + "</h4>" + (x.people.length ? '<div class="table-scroll"><table class="data-table"><thead><tr><th>' + esc(t("adminPartners.member")) + "</th><th>" + esc(t("adminPartners.joined")) + "</th><th>" + esc(t("adminPartners.state")) + "</th><th>" + esc(t("adminPartners.source")) + "</th></tr></thead><tbody>" +
          x.people.map(m => "<tr><td>" + esc(m.member_name) + "</td><td>" + esc(day(m.created_at)) + "</td><td>" + esc(m.first_paid_at ? t("adminPartners.statePaid", { date: day(m.first_paid_at) }) : (m.trial_until && new Date(m.trial_until) > new Date() ? t("adminPartners.stateTrial", { date: day(m.trial_until) }) : t("adminPartners.stateLapsed"))) + "</td><td>" + esc([m.utm_source, m.utm_campaign].filter(Boolean).join(" / ") || "—") + "</td></tr>").join("") + "</tbody></table></div>" : '<p class="muted">' + esc(t("adminPartners.noPeople")) + "</p>") +
          "<h4>" + esc(t("adminPartners.bonuses")) + "</h4>" + (x.commissions.length ? '<div class="table-scroll"><table class="data-table"><thead><tr><th>' + esc(t("adminPartners.member")) + "</th><th>" + esc(t("adminPartners.kind")) + '</th><th class="num">' + esc(t("adminPartners.payment")) + '</th><th class="num">' + esc(t("adminPartners.bonus")) + "</th><th>" + esc(t("adminPartners.state")) + "</th></tr></thead><tbody>" +
          x.commissions.map(c => "<tr><td>" + esc(c.member_name) + "<br><small class=\"muted\">" + esc(day(c.created_at)) + "</small></td><td>" + esc(t("adminPartners.kind." + c.kind)) + '</td><td class="num">' + esc(money(c.payment_kzt)) + '</td><td class="num">' + esc(money(c.bonus_kzt)) + "</td><td>" + esc(t("adminPartners.cstatus." + c.status)) + (c.paid_at ? " " + esc(day(c.paid_at)) : "") + "</td></tr>").join("") + "</tbody></table></div>" : '<p class="muted">' + esc(t("adminPartners.noBonuses")) + "</p>");
      } catch (x) { status(x.message, true); }
    };
    content.querySelectorAll("[data-partner-open]").forEach(b => b.addEventListener("click", () => openDetails(b.dataset.partnerOpen)));
    content.querySelectorAll("[data-partner-edit]").forEach(b => b.addEventListener("click", () => {
      const id = b.dataset.partnerEdit, p = d.items.find(x => x.id === id), box = content.querySelector('[data-partner-edit-box="' + CSS.escape(id) + '"]');
      if (!p || !box) return;
      if (box.innerHTML) { box.innerHTML = ""; return; }
      box.innerHTML = '<form class="app-form" data-edit-form="' + esc(id) + '"><div class="form-grid">' +
        field(t("adminPartners.trialDays"), "trial_days", p.trial_days, "number", 'min="0" max="90"') + field(t("adminPartners.firstPct"), "first_bonus_pct", Number(p.first_bonus_pct), "number", 'min="0" max="100" step="0.5"') + "</div>" +
        field(t("adminPartners.tiers"), "tiers", (p.renewal_tiers || []).join(","), "text", 'placeholder="20,10"') +
        field(t("adminPartners.ownerPhone"), "owner_phone", p.owner_phone || "", "tel", 'placeholder="+7 701 123 45 67"') +
        '<button class="primary-button">' + esc(t("adminPartners.save")) + "</button></form>";
      box.querySelector("form").addEventListener("submit", async e => {
        e.preventDefault();
        const f = new FormData(e.currentTarget), num = k => Number(f.get(k) || 0), ph = String(f.get("owner_phone") || "").replace(/[ ()-]/g, "");
        try {
          await api("/v1/admin/partners/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify({ trial_days: num("trial_days"), first_bonus_pct: num("first_bonus_pct"), ...(parseTiers(f.get("tiers")) ? { renewal_bonus_pct: parseTiers(f.get("tiers"))[0] } : {}), renewal_tiers: parseTiers(f.get("tiers")), owner_phone: ph || null }) });
          status(t("adminPartners.saved")); await adminPartners();
        } catch (x) { status(x.code === "owner_not_signed_in" ? t("adminPartners.ownerNotSignedIn") : x.message, true); }
      });
    }));
    if (openId) openDetails(openId);
  }

  async function adminStaff() {
    let d;
    try { d = await api("/v1/admin/staff"); } catch (e) { if (e.status === 403) { content.innerHTML = panel(t("adminStaff.title"), t("adminStaff.onlyAdmin"), ""); return; } throw e; }
    content.innerHTML = panel(t("adminStaff.title"), t("adminStaff.text"),
      (d.items.map(u => '<div class="list-row"><div><strong>' + esc(u.name || u.email || "") + "</strong><p>" + esc(u.email || "") + '</p><div class="chip-tabs">' +
        u.roles.map(r => '<span class="pill">' + esc(I18N.label("staffRole", r)) + (d.grantable.includes(r) ? ' <button type="button" class="link-button" data-revoke="' + esc(u.user_id) + '" data-role="' + esc(r) + '" aria-label="' + esc(t("adminStaff.revoke", { role: I18N.label("staffRole", r) })) + '">×</button>' : "") + "</span>").join(" ") + "</div></div></div>").join("") || '<p class="muted">' + esc(t("adminStaff.empty")) + "</p>")) +
      panel(t("adminStaff.addTitle"), t("adminStaff.addText"), '<form id="staff-form" class="app-form">' + field(t("adminStaff.email"), "email", "", "email", 'required autocomplete="off"') +
        '<label class="field"><span>' + esc(t("adminStaff.role")) + '</span><select name="role">' + d.grantable.map(r => option(r, I18N.label("staffRole", r), r === "sales")).join("") + "</select></label>" +
        '<button class="primary-button">' + esc(t("adminStaff.add")) + "</button></form>");
    document.querySelector("#staff-form").addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      try { await api("/v1/admin/staff", { method: "POST", body: JSON.stringify({ email: String(f.get("email")).trim(), role: String(f.get("role")) }) }); await adminStaff(); status(t("adminStaff.added")); } catch (x) { status(x.message, true); }
    });
    content.querySelectorAll("[data-revoke]").forEach(b => b.addEventListener("click", async () => {
      try { await api("/v1/admin/staff/" + encodeURIComponent(b.dataset.revoke) + "/" + encodeURIComponent(b.dataset.role), { method: "DELETE" }); await adminStaff(); status(t("adminStaff.revoked")); } catch (x) { status(x.message, true); }
    }));
  }

  // ---------- My business (resident's own CRM) ----------
  const BIZ_ROLES = ["manager", "accountant", "sales", "marketing", "staff"];
  const SALE_CHANNELS = ["cash", "kaspi", "card", "transfer", "other"];
  const EXPENSE_CATS = ["goods", "payroll", "rent", "marketing", "taxes", "utilities", "other"];
  const BIZ_CAN = {
    money: r => r !== "staff", expenses: r => ["owner", "manager", "accountant"].includes(r), assign: r => r === "owner" || r === "manager",
    team: r => r === "owner" || r === "manager", feedback: r => r === "owner" || r === "manager", salesForOthers: r => ["owner", "manager", "accountant", "sales"].includes(r)
  };
  let bizList = null, bizWs = null, bizTab = "report", bizReportDay = null;
  const dayLabel = d => d ? String(d).slice(0, 10).split("-").reverse().join(".") : "—";
  const almatyDay = (offset = 0) => new Date(Date.now() + 5 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
  const bizBase = () => "/v1/biz/" + encodeURIComponent(bizWs.id);

  async function business() {
    bizList = (await api("/v1/biz")).items || [];
    if (!bizList.length) { bizWs = null; return bizStart(); }
    if (!bizWs || !bizList.some(w => w.id === bizWs.id)) bizWs = bizList[0];
    else bizWs = bizList.find(w => w.id === bizWs.id);
    const r = bizWs.role;
    const mgr = ["owner", "manager", "accountant"].includes(r);
    const tabs = [["report", BIZ_CAN.money(r)], ["clock", true], ["sales", true], ["expenses", BIZ_CAN.expenses(r)], ["money", mgr], ["calendar", mgr], ["pnl", mgr], ["balance", mgr], ["payroll", true], ["timesheet", mgr], ["tasks", true], ["finance", BIZ_CAN.expenses(r)], ["team", true], ["feedback", true]].filter(x => x[1]).map(x => x[0]);
    if (!tabs.includes(bizTab)) bizTab = tabs[0];
    const picker = bizList.length > 1 ? '<label class="field biz-picker"><span>' + esc(t("biz.workspace")) + '</span><select id="biz-ws">' + bizList.map(w => option(w.id, w.name, w.id === bizWs.id)).join("") + "</select></label>" : "";
    content.innerHTML = '<div class="biz-head"><div><p class="eyebrow">' + esc(I18N.label("bizRole", r)) + "</p><h2>" + esc(bizWs.name) + "</h2></div>" + picker + "</div>" +
      '<div class="chip-tabs biz-tabs" role="tablist" aria-label="' + esc(t("biz.sections")) + '">' + tabs.map(x => '<button type="button" role="tab" class="chip-tab' + (x === bizTab ? " active" : "") + '" aria-selected="' + (x === bizTab) + '" data-biz-tab="' + x + '">' + esc(t("biz.tab." + x)) + "</button>").join("") + '</div><div id="biz-body"><div class="loading-panel">' + esc(t("common.loading")) + "</div></div>";
    content.querySelectorAll("[data-biz-tab]").forEach(b => b.addEventListener("click", () => { bizTab = b.dataset.bizTab; business().catch(x => status(x.message, true)); }));
    const sel = document.querySelector("#biz-ws");
    if (sel) sel.addEventListener("change", () => { bizWs = bizList.find(w => w.id === sel.value); business().catch(x => status(x.message, true)); });
    await ({ report: bizReport, clock: bizClock, sales: bizSales, expenses: bizExpenses, money: bizMoney, calendar: bizCalendar, pnl: bizPnl, balance: bizBalance, payroll: bizPayroll, timesheet: bizTimesheet, tasks: bizTasks, finance: bizFinance, team: bizTeam, feedback: bizFeedback })[bizTab]();
  }
  const bizBody = html => { document.querySelector("#biz-body").innerHTML = html; return document.querySelector("#biz-body"); };

  function bizStart() {
    content.innerHTML = panel(t("biz.startTitle"), t("biz.startText"),
        '<ul class="biz-features">' + ["report", "team", "tasks", "feedback"].map(k => "<li>" + esc(t("biz.feature." + k)) + "</li>").join("") + "</ul>" +
        '<form id="biz-create" class="app-form">' + field(t("biz.name"), "name", "", "text", 'required minlength="2" maxlength="160"') + '<button class="primary-button">' + esc(t("biz.create")) + "</button></form>") +
      panel(t("biz.joinTitle"), t("biz.joinText"), '<form id="biz-join" class="app-form">' + field(t("biz.code"), "code", "", "text", 'required minlength="6" maxlength="20" autocomplete="off" autocapitalize="characters"') + '<button class="outline-button">' + esc(t("biz.join")) + "</button></form>");
    document.querySelector("#biz-create").addEventListener("submit", async e => {
      e.preventDefault();
      const name = String(new FormData(e.currentTarget).get("name") || "").trim();
      try { const w = await api("/v1/biz", { method: "POST", body: JSON.stringify({ name }) }); bizWs = w; bizTab = "team"; await business(); status(t("biz.created")); } catch (x) { status(x.message, true); }
    });
    document.querySelector("#biz-join").addEventListener("submit", async e => {
      e.preventDefault();
      const code = String(new FormData(e.currentTarget).get("code") || "").trim();
      try { const j = await api("/v1/biz/join", { method: "POST", body: JSON.stringify({ code }) }); bizWs = { id: j.workspace_id }; bizTab = "tasks"; await business(); status(t("biz.joined")); } catch (x) { status(x.message, true); }
    });
  }

  function insightText(i) {
    const p = Object.assign({}, i.params);
    for (const k of ["revenue", "profit", "value", "expenses"]) if (k in p) p[k] = money(p[k]);
    return t("insight." + i.type, p);
  }
  async function bizReport() {
    const day = bizReportDay || almatyDay(-1);
    const r = await api(bizBase() + "/report?day=" + day);
    const wow = r.sameWeekdayRevenue > 0 ? Math.round((r.revenue - r.sameWeekdayRevenue) / r.sameWeekdayRevenue * 100) : null;
    const max = Math.max(1, ...r.series.map(x => x.revenue));
    const people = r.byResponsible.filter(x => x.member_id);
    const body = bizBody(
      '<form id="rep-day" class="inline-form"><label class="field"><span>' + esc(t("biz.reportDay")) + '</span><input type="date" name="day" value="' + esc(day) + '" max="' + esc(almatyDay(0)) + '"></label></form>' +
      '<div class="kpi-grid">' + statTile(t("biz.revenue"), money(r.revenue), wow === null ? t("biz.noCompare") : t("biz.vsWeek", { change: (wow > 0 ? "+" : "") + wow + "%" })) +
        statTile(t("biz.orders"), r.orders || "—", r.orders ? t("biz.avgCheck", { value: money(Math.round(r.revenue / r.orders)) }) : "") +
        (BIZ_CAN.expenses(r.role) ? statTile(t("biz.expensesDay"), money(r.expensesDay), t("biz.monthProfit", { value: money(r.revenueMonth - r.expensesMonth) })) : statTile(t("biz.revenueMonth"), money(r.revenueMonth))) +
        statTile(t("biz.tasksOpen"), r.tasks.open, t("biz.tasksOverdue", { n: r.tasks.overdue })) + "</div>" +
      '<section class="empty-panel"><h2>' + esc(t("biz.analysis")) + '</h2><ul class="insights">' + (r.insights.length ? r.insights.map(i => '<li class="insight ' + esc(i.severity) + '">' + esc(insightText(i)) + "</li>").join("") : "<li>" + esc(t("biz.allGood")) + "</li>") + "</ul></section>" +
      (people.length ? panel(t("biz.byPeople"), t("biz.byPeopleText"), '<div class="table-scroll"><table class="data-table"><thead><tr><th>' + esc(t("biz.person")) + '</th><th class="num">' + esc(t("biz.revenue")) + '</th><th class="num">' + esc(t("biz.avg7")) + "</th></tr></thead><tbody>" +
        people.map(x => "<tr><td>" + esc(x.name) + '</td><td class="num">' + esc(money(x.revenue)) + '</td><td class="num">' + esc(money(x.avg7)) + "</td></tr>").join("") + "</tbody></table></div>") : "") +
      (Object.keys(r.byChannel).length ? panel(t("biz.byChannel"), "", Object.entries(r.byChannel).map(([c, v]) => '<div class="list-row"><div><strong>' + esc(I18N.label("saleChannel", c)) + "</strong></div><span>" + esc(money(v)) + "</span></div>").join("")) : "") +
      panel(t("biz.series"), t("biz.seriesText"), '<ol class="bars">' + r.series.map(x => '<li><span class="bar-label">' + esc(dayLabel(x.day).slice(0, 5)) + '</span><span class="bar-track"><span class="bar" style="width:' + Math.round(x.revenue / max * 100) + '%"></span></span><span class="bar-value">' + esc(money(x.revenue)) + "</span></li>").join("") + "</ol>"));
    body.querySelector("#rep-day input").addEventListener("change", e => { bizReportDay = e.target.value || null; bizReport().catch(x => status(x.message, true)); });
  }

  async function bizMembers() { return api(bizBase() + "/members"); }
  async function bizSales() {
    const r = bizWs.role;
    const [d, team] = await Promise.all([api(bizBase() + "/sales"), BIZ_CAN.salesForOthers(r) ? bizMembers() : Promise.resolve(null)]);
    const people = team ? team.items.filter(m => m.status === "active") : [];
    const body = bizBody(panel(t("biz.addSale"), t(BIZ_CAN.salesForOthers(r) ? "biz.addSaleText" : "biz.addSaleOwn"),
        '<form id="sale-form" class="app-form">' + field(t("biz.day"), "day", almatyDay(0), "date", 'required max="' + esc(almatyDay(0)) + '"') +
        field(t("biz.amount"), "amount_kzt", "", "number", 'required min="1" step="1" inputmode="numeric"') + field(t("biz.ordersField"), "orders", "", "number", 'min="0" step="1" inputmode="numeric"') +
        '<label class="field"><span>' + esc(t("biz.channel")) + '</span><select name="channel">' + SALE_CHANNELS.map(c => option(c, I18N.label("saleChannel", c), c === "kaspi")).join("") + "</select></label>" +
        (people.length ? '<label class="field"><span>' + esc(t("biz.responsible")) + '</span><select name="responsible_member_id">' + people.map(m => option(m.id, m.display_name + (m.position ? " · " + m.position : ""), m.id === team.me.member_id)).join("") + "</select></label>" : "") +
        field(t("biz.note"), "note", "", "text", 'maxlength="300"') + '<button class="primary-button">' + esc(t("biz.save")) + "</button></form>") +
      panel(t("biz.salesList"), t("biz.last14"), d.items.length ? '<div class="table-scroll"><table class="data-table"><thead><tr><th>' + esc(t("biz.day")) + "</th><th>" + esc(t("biz.responsible")) + "</th><th>" + esc(t("biz.channel")) + '</th><th class="num">' + esc(t("biz.amount")) + "</th><th></th></tr></thead><tbody>" +
        d.items.map(x => "<tr><td>" + esc(dayLabel(x.day)) + "</td><td>" + esc(x.responsible_name || "—") + "</td><td>" + esc(I18N.label("saleChannel", x.channel)) + '</td><td class="num">' + esc(money(x.amount_kzt)) + (x.orders ? '<br><small class="muted">' + esc(t("biz.ordersN", { n: x.orders })) + "</small>" : "") + '</td><td><button type="button" class="link-button" data-del-sale="' + esc(x.id) + '" aria-label="' + esc(t("biz.delete")) + '">×</button></td></tr>').join("") + "</tbody></table></div>" : '<p class="muted">' + esc(t("biz.noSales")) + "</p>"));
    body.querySelector("#sale-form").addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const payload = { day: String(f.get("day")), amount_kzt: Math.round(Number(f.get("amount_kzt"))), orders: f.get("orders") ? Number(f.get("orders")) : null, channel: String(f.get("channel")), note: String(f.get("note") || "").trim() || null };
      if (f.get("responsible_member_id")) payload.responsible_member_id = String(f.get("responsible_member_id"));
      try { await api(bizBase() + "/sales", { method: "POST", body: JSON.stringify(payload) }); await bizSales(); status(t("biz.saved")); } catch (x) { status(x.message, true); }
    });
    body.querySelectorAll("[data-del-sale]").forEach(b => b.addEventListener("click", async () => {
      try { await api(bizBase() + "/sales/" + encodeURIComponent(b.dataset.delSale), { method: "DELETE" }); await bizSales(); status(t("biz.deleted")); } catch (x) { status(x.message, true); }
    }));
  }

  async function bizExpenses() {
    const d = await api(bizBase() + "/expenses");
    const body = bizBody(panel(t("biz.addExpense"), t("biz.addExpenseText"),
        '<form id="exp-form" class="app-form">' + field(t("biz.day"), "day", almatyDay(0), "date", 'required') + field(t("biz.amount"), "amount_kzt", "", "number", 'required min="1" step="1" inputmode="numeric"') +
        '<label class="field"><span>' + esc(t("biz.category")) + '</span><select name="category">' + EXPENSE_CATS.map(c => option(c, I18N.label("expenseCategory", c), c === "goods")).join("") + "</select></label>" +
        field(t("biz.note"), "note", "", "text", 'maxlength="300"') + '<button class="primary-button">' + esc(t("biz.save")) + "</button></form>") +
      panel(t("biz.expensesList"), t("biz.last14"), d.items.length ? '<div class="table-scroll"><table class="data-table"><thead><tr><th>' + esc(t("biz.day")) + "</th><th>" + esc(t("biz.category")) + '</th><th class="num">' + esc(t("biz.amount")) + "</th><th></th></tr></thead><tbody>" +
        d.items.map(x => "<tr><td>" + esc(dayLabel(x.day)) + "</td><td>" + esc(I18N.label("expenseCategory", x.category)) + (x.note ? '<br><small class="muted">' + esc(x.note) + "</small>" : "") + '</td><td class="num">' + esc(money(x.amount_kzt)) + '</td><td><button type="button" class="link-button" data-del-exp="' + esc(x.id) + '" aria-label="' + esc(t("biz.delete")) + '">×</button></td></tr>').join("") + "</tbody></table></div>" : '<p class="muted">' + esc(t("biz.noExpenses")) + "</p>"));
    body.querySelector("#exp-form").addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      try { await api(bizBase() + "/expenses", { method: "POST", body: JSON.stringify({ day: String(f.get("day")), amount_kzt: Math.round(Number(f.get("amount_kzt"))), category: String(f.get("category")), note: String(f.get("note") || "").trim() || null }) }); await bizExpenses(); status(t("biz.saved")); } catch (x) { status(x.message, true); }
    });
    body.querySelectorAll("[data-del-exp]").forEach(b => b.addEventListener("click", async () => {
      try { await api(bizBase() + "/expenses/" + encodeURIComponent(b.dataset.delExp), { method: "DELETE" }); await bizExpenses(); status(t("biz.deleted")); } catch (x) { status(x.message, true); }
    }));
  }

  async function bizTasks() {
    const d = await api(bizBase() + "/tasks");
    const [team, stats] = d.can_assign ? await Promise.all([bizMembers(), api(bizBase() + "/tasks/stats")]) : [null, null];
    const people = team ? team.items.filter(m => m.status !== "removed") : [];
    const card = x => {
      const mineTask = x.assignee_member_id === d.me;
      const canAct = mineTask || d.can_assign;
      const open = x.status === "todo" || x.status === "in_progress";
      return '<article class="invoice-card task-card' + (x.overdue ? " overdue" : "") + '"><div class="invoice-top"><div><h3>' + esc(x.title) + "</h3><small>" + esc(t("biz.taskFor", { name: x.assignee_name || "—" })) + (x.due_at ? " · " + esc(t("biz.due", { date: date(x.due_at) })) : "") + '</small></div><span class="pill">' + esc(x.overdue ? t("biz.overdue") : I18N.label("taskStatus", x.status)) + "</span></div>" +
        (x.description ? "<p>" + esc(x.description) + "</p>" : "") + (x.report ? '<p class="demo-note"><strong>' + esc(t("biz.report")) + ":</strong> " + esc(x.report) + "</p>" : "") +
        (canAct && open ? '<div class="receipt-actions">' + (x.status === "todo" ? '<button type="button" class="outline-button" data-task="' + esc(x.id) + '" data-to="in_progress">' + esc(t("biz.start")) + "</button>" : "") +
          '<button type="button" class="primary-button" data-task-done="' + esc(x.id) + '">' + esc(t("biz.complete")) + "</button>" + (d.can_assign ? '<button type="button" class="outline-button" data-task="' + esc(x.id) + '" data-to="cancelled">' + esc(t("biz.cancel")) + "</button>" : "") + "</div>" +
          '<form class="app-form done-form" data-done-form="' + esc(x.id) + '" hidden><label class="field"><span>' + esc(t("biz.reportField")) + '</span><textarea name="report" rows="3" required maxlength="2000"></textarea></label><button class="primary-button">' + esc(t("biz.sendReport")) + "</button></form>" : "") + "</article>";
    };
    const open = d.items.filter(x => x.status === "todo" || x.status === "in_progress"), closed = d.items.filter(x => !(x.status === "todo" || x.status === "in_progress"));
    const body = bizBody(
      panel(t(d.can_assign ? "biz.newTask" : "biz.newOwnTask"), t(d.can_assign ? "biz.newTaskText" : "biz.newOwnTaskText"), '<form id="task-form" class="app-form">' + field(t("biz.taskTitle"), "title", "", "text", 'required minlength="2" maxlength="200"') + area(t("biz.taskDesc"), "description", "") +
        (people.length ? '<label class="field"><span>' + esc(t("biz.assignee")) + '</span><select name="assignee_member_id">' + people.map(m => option(m.id, m.display_name + (m.position ? " · " + m.position : ""), false)).join("") + "</select></label>" : "") +
        field(t("biz.dueField"), "due", "", "datetime-local", "") + '<button class="primary-button">' + esc(t(d.can_assign ? "biz.handOff" : "biz.save")) + "</button></form>") +
      (stats ? panel(t("biz.control"), t("biz.controlText"), '<div class="table-scroll"><table class="data-table"><thead><tr><th>' + esc(t("biz.person")) + '</th><th class="num">' + esc(t("biz.open")) + '</th><th class="num">' + esc(t("biz.overdue")) + '</th><th class="num">' + esc(t("biz.done30")) + '</th><th class="num">' + esc(t("biz.onTime")) + "</th></tr></thead><tbody>" +
        stats.items.map(x => "<tr><td>" + esc(x.name) + '</td><td class="num">' + x.open + '</td><td class="num">' + (x.overdue ? "<strong>" + x.overdue + "</strong>" : "0") + '</td><td class="num">' + x.done_30d + '</td><td class="num">' + (x.done_30d ? Math.round(x.on_time_30d / x.done_30d * 100) + "%" : "—") + "</td></tr>").join("") + "</tbody></table></div>") : "") +
      panel(t("biz.openTasks"), "", open.length ? open.map(card).join("") : '<p class="muted">' + esc(t("biz.noTasks")) + "</p>") +
      (closed.length ? panel(t("biz.closedTasks"), "", closed.slice(0, 30).map(card).join("")) : ""));
    body.querySelector("#task-form").addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const due = String(f.get("due") || "");
      const payload = { title: String(f.get("title")).trim(), description: String(f.get("description") || "").trim() || null, due_at: due ? new Date(due).toISOString() : null };
      if (f.get("assignee_member_id")) payload.assignee_member_id = String(f.get("assignee_member_id"));
      try { await api(bizBase() + "/tasks", { method: "POST", body: JSON.stringify(payload) }); await bizTasks(); status(t(d.can_assign ? "biz.taskHanded" : "biz.saved")); } catch (x) { status(x.message, true); }
    });
    body.querySelectorAll("[data-task]").forEach(b => b.addEventListener("click", async () => {
      try { await api(bizBase() + "/tasks/" + encodeURIComponent(b.dataset.task), { method: "PATCH", body: JSON.stringify({ status: b.dataset.to }) }); await bizTasks(); status(t("biz.saved")); } catch (x) { status(x.message, true); }
    }));
    body.querySelectorAll("[data-task-done]").forEach(b => b.addEventListener("click", () => { const f = body.querySelector('[data-done-form="' + b.dataset.taskDone + '"]'); f.hidden = false; f.querySelector("textarea").focus(); }));
    body.querySelectorAll("[data-done-form]").forEach(form => form.addEventListener("submit", async e => {
      e.preventDefault();
      const report = String(new FormData(form).get("report") || "").trim();
      try { await api(bizBase() + "/tasks/" + encodeURIComponent(form.dataset.doneForm), { method: "PATCH", body: JSON.stringify({ status: "done", report }) }); await bizTasks(); status(t("biz.taskDone")); } catch (x) { status(x.message, true); }
    }));
  }

  // ---------- Приход/уход, зарплата и ОПИУ ----------
  const bizMonth = () => almatyDay().slice(0, 7);
  let bizPayMonth = null;
  const timeOf = v => v ? new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Almaty" }) : "—";

  // ---------- Time clock protection: rotating office QR + radius, scanned with the phone camera ----------
  function getPosition() {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
    });
  }
  async function clockWithCode(ws, code, action) {
    const pos = await getPosition();
    await api("/v1/biz/" + encodeURIComponent(ws) + "/attendance/" + action, { method: "POST", body: JSON.stringify({ qr: code, ...(pos || {}) }) });
    status(t(action === "check-in" ? "clock.inDone" : "clock.outDone"));
  }
  const CLOCK_KEY = "friends.clock";
  function captureClockLink() {
    const v = (new URLSearchParams(location.search).get("clock") || "").trim().toLowerCase();
    if (!/^[0-9a-f-]{36}\.[0-9a-f]{12}$/.test(v)) return;
    try { sessionStorage.setItem(CLOCK_KEY, v); } catch { /* one page only */ }
    try { history.replaceState(null, "", location.pathname); } catch { /* none */ }
  }
  /** Opened from the office QR: mark arrival, or leaving if already at work today. */
  async function runClockLink() {
    let raw = null;
    try { raw = sessionStorage.getItem(CLOCK_KEY); sessionStorage.removeItem(CLOCK_KEY); } catch { /* none */ }
    const m = raw && /^([0-9a-f-]{36})\.([0-9a-f]{12})$/.exec(raw);
    if (!m) return;
    bizWs = { id: m[1] }; bizTab = "clock";
    let msg = "", bad = false;
    try {
      const d = await api("/v1/biz/" + m[1] + "/attendance");
      if (d.today && d.today.check_out_at) msg = t("clock.alreadyDone");
      else { await clockWithCode(m[1], m[2], d.today ? "check-out" : "check-in"); }
    } catch (x) { msg = x.message; bad = true; }
    await render("business");
    if (msg) status(msg, bad);
  }
  async function clockGuardPanel() {
    let c;
    try { c = await api(bizBase() + "/clock"); } catch { return ""; }
    const canEdit = ["owner", "manager"].includes(bizWs.role);
    return panel(t("clock.guardTitle"), t("clock.guardText"),
      '<div class="clock-guard"><label class="consent-field"><input type="checkbox" id="clock-req"' + (c.qr_required ? " checked" : "") + (canEdit ? "" : " disabled") + "> <span>" + esc(t("clock.require")) + "</span></label>" +
      '<p class="muted">' + esc(c.lat != null ? t("clock.placeSet", { r: c.radius_m }) : t("clock.placeNone")) + "</p>" +
      '<div class="actions-row"><button type="button" class="primary-button" id="clock-show">' + esc(t("clock.showQr")) + "</button>" +
      (canEdit ? '<button type="button" class="outline-button" id="clock-place">' + esc(t("clock.setPlace")) + "</button>" + (c.lat != null ? '<button type="button" class="text-button" id="clock-noplace">' + esc(t("clock.clearPlace")) + "</button>" : "") : "") + "</div></div>");
  }
  function wireClockGuard(root) {
    const patch = body => api(bizBase() + "/clock", { method: "PATCH", body: JSON.stringify(body) });
    const req = root.querySelector("#clock-req");
    if (req) req.addEventListener("change", async () => { try { await patch({ qr_required: req.checked }); status(t("clock.saved")); } catch (x) { status(x.message, true); } });
    const place = root.querySelector("#clock-place");
    if (place) place.addEventListener("click", async () => {
      const pos = await getPosition();
      if (!pos) { status(t("clock.noGeo"), true); return; }
      if (!confirm(t("clock.placeConfirm"))) return;
      try { await patch({ lat: pos.lat, lng: pos.lng }); status(t("clock.saved")); await bizClock(); } catch (x) { status(x.message, true); }
    });
    const noPlace = root.querySelector("#clock-noplace");
    if (noPlace) noPlace.addEventListener("click", async () => { try { await patch({ lat: null, lng: null }); await bizClock(); } catch (x) { status(x.message, true); } });
    const show = root.querySelector("#clock-show");
    if (show) show.addEventListener("click", () => showClockScreen());
  }
  /** Full-screen QR for the office tablet or the manager's phone. Refreshes itself; a photo of it stops working in about a minute. */
  function showClockScreen() {
    const wsId = bizWs.id;
    const box = document.createElement("div");
    box.className = "clock-screen";
    box.innerHTML = '<div class="clock-screen-card"><h2>' + esc(bizWs.name) + '</h2><div id="cs-qr"></div><p class="clock-code" id="cs-code"></p><p>' + esc(t("clock.screenHint")) + '</p><button type="button" class="outline-button" id="cs-close">' + esc(t("clock.close")) + "</button></div>";
    document.body.appendChild(box);
    let timer = null, wake = null;
    const stop = () => { clearInterval(timer); if (wake) { try { wake.release(); } catch { /* none */ } } box.remove(); };
    box.querySelector("#cs-close").addEventListener("click", stop);
    const tick = async () => {
      try {
        const c = await api("/v1/biz/" + encodeURIComponent(wsId) + "/clock");
        const url = location.origin + location.pathname + "?clock=" + wsId + "." + c.code;
        const q = window.qrcode(0, "M"); q.addData(url); q.make();
        box.querySelector("#cs-qr").innerHTML = q.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
        box.querySelector("#cs-code").textContent = c.code;
      } catch (x) { box.querySelector("#cs-code").textContent = x.message; }
    };
    tick(); timer = setInterval(tick, 15000);
    try { if (navigator.wakeLock) navigator.wakeLock.request("screen").then(l => { wake = l; }).catch(() => undefined); } catch { /* none */ }
  }

  async function bizClock() {
    const d = await api(bizBase() + "/attendance");
    const tdy = d.today;
    const mgr = ["owner", "manager", "accountant"].includes(bizWs.role);
    const big = !tdy ? '<button type="button" class="primary-button clock-btn" data-clock="check-in">' + esc(t("clock.in")) + "</button>"
      : !tdy.check_out_at ? '<p class="clock-state">' + esc(t("clock.since", { time: timeOf(tdy.check_in_at) })) + (tdy.late_minutes ? ' <span class="pill warn-pill">' + esc(t("clock.late", { n: tdy.late_minutes })) + "</span>" : "") + '</p><button type="button" class="outline-button clock-btn" data-clock="check-out">' + esc(t("clock.out")) + "</button>"
      : '<p class="clock-state">' + esc(t("clock.done", { from: timeOf(tdy.check_in_at), to: timeOf(tdy.check_out_at) })) + "</p>";
    const qrBox = d.qr_required && !(tdy && tdy.check_out_at)
      ? '<form class="app-form clock-qr" id="clock-code-form"><p class="muted">' + esc(t("clock.qrHint")) + "</p>" + field(t("clock.codeLabel"), "code", "", "text", 'maxlength="12" autocomplete="off" autocapitalize="off" inputmode="text" pattern="[0-9a-fA-F]{12}" required') +
        '<button class="primary-button">' + esc(t(tdy ? "clock.out" : "clock.in")) + "</button></form>" : "";
    const rows = d.items.map(a => "<tr><td>" + esc(dayLabel(a.day)) + "</td>" + (mgr ? "<td>" + esc(a.display_name) + "</td>" : "") + "<td>" + esc(timeOf(a.check_in_at)) + "</td><td>" + esc(timeOf(a.check_out_at)) + '</td><td class="num">' + (a.late_minutes ? '<span class="warn-text">' + a.late_minutes + "</span>" : "0") + "</td></tr>").join("");
    const guard = mgr ? await clockGuardPanel() : "";
    const body = bizBody(panel(t("clock.title"), t("clock.text"), '<div class="clock-box">' + (d.qr_required ? (tdy && tdy.check_out_at ? big : (tdy ? '<p class="clock-state">' + esc(t("clock.since", { time: timeOf(tdy.check_in_at) })) + "</p>" : "") + qrBox) : big) + "</div>") + guard +
      panel(t(mgr ? "clock.journalAll" : "clock.journalMine"), "", rows ? '<div class="table-scroll"><table class="data-table"><thead><tr><th>' + esc(t("clock.day")) + "</th>" + (mgr ? "<th>" + esc(t("clock.who")) + "</th>" : "") + "<th>" + esc(t("clock.inCol")) + "</th><th>" + esc(t("clock.outCol")) + '</th><th class="num">' + esc(t("clock.lateCol")) + "</th></tr></thead><tbody>" + rows + "</tbody></table></div>" : '<p class="muted">' + esc(t("clock.empty")) + "</p>"));
    wireClockGuard(body);
    const codeForm = body.querySelector("#clock-code-form");
    if (codeForm) codeForm.addEventListener("submit", async e => {
      e.preventDefault();
      const code = String(new FormData(codeForm).get("code") || "").trim().toLowerCase();
      try { await clockWithCode(bizWs.id, code, tdy && !tdy.check_out_at ? "check-out" : "check-in"); await bizClock(); } catch (x) { status(x.message, true); }
    });
    body.querySelectorAll("[data-clock]").forEach(b => b.addEventListener("click", async () => { try { await api(bizBase() + "/attendance/" + b.dataset.clock, { method: "POST", body: "{}" }); status(t(b.dataset.clock === "check-in" ? "clock.inDone" : "clock.outDone")); await bizClock(); } catch (x) { status(x.message, true); } }));
  }

  async function bizPayroll() {
    const month = bizPayMonth || bizMonth();
    const d = await api(bizBase() + "/payroll?month=" + month);
    const row = p => '<article class="invoice-card pay-card"><div class="invoice-top"><div><h3>' + esc(p.name) + "</h3><small>" + esc(p.position || "") + (p.shift_start ? " · " + esc(t("pay.shiftFrom", { time: p.shift_start })) : "") + "</small></div><strong>" + esc(money(p.to_pay)) + "</strong></div>" +
      '<div class="table-scroll"><table class="data-table pay-table"><tbody>' +
      [[t("pay.fixed"), p.pay_fixed_kzt], [t("pay.shifts", { n: p.shifts, rate: money(p.pay_per_shift_kzt) }), p.shifts * p.pay_per_shift_kzt], [t("pay.percent", { pct: p.pay_percent, sales: money(p.own_sales_kzt) }), p.percent_part], [t("pay.bonus"), p.bonus_kzt], [t("pay.fine"), -p.fine_kzt], [t("pay.accrued"), p.accrued], [t("pay.advance"), -p.advance_kzt]]
        .filter(([, v]) => v).map(([k, v]) => "<tr><th>" + esc(k) + '</th><td class="num">' + esc(money(v)) + "</td></tr>").join("") +
      '<tr class="total"><th>' + esc(t("pay.toPay")) + '</th><td class="num">' + esc(money(p.to_pay)) + "</td></tr></tbody></table></div>" +
      (p.late_days ? '<p class="muted">' + esc(t("pay.lateInfo", { days: p.late_days, min: p.late_minutes })) + "</p>" : "") +
      (!p.configured ? '<p class="demo-note">' + esc(t("pay.notConfigured")) + "</p>" : "") +
      (d.can_manage ? '<details class="pay-setup"><summary>' + esc(t("pay.setup")) + '</summary><form class="app-form" data-pay="' + esc(p.member_id) + '">' + field(t("pay.fShift"), "shift_start", p.shift_start || "", "time", "") + field(t("pay.fFixed"), "pay_fixed_kzt", p.pay_fixed_kzt || "", "number", 'min="0" step="1000"') + field(t("pay.fPerShift"), "pay_per_shift_kzt", p.pay_per_shift_kzt || "", "number", 'min="0" step="500"') + field(t("pay.fPercent"), "pay_percent", p.pay_percent || "", "number", 'min="0" max="100" step="0.5"') + '<button class="outline-button">' + esc(t("biz.save")) + "</button></form>" +
        '<form class="inline-form" data-adj="' + esc(p.member_id) + '"><label class="field"><span>' + esc(t("pay.adjKind")) + '</span><select name="kind">' + option("bonus", t("pay.bonus"), true) + option("fine", t("pay.fine"), false) + option("advance", t("pay.advance"), false) + "</select></label>" + field(t("pay.adjAmount"), "amount_kzt", "", "number", 'min="1" step="1" required') + field(t("pay.adjNote"), "note", "", "text", 'maxlength="300"') + '<button class="outline-button">' + esc(t("pay.adjAdd")) + "</button></form></details>" : "") + "</article>";
    const body = bizBody('<div class="biz-month"><label class="field"><span>' + esc(t("pay.month")) + '</span><input type="month" id="pay-month" value="' + esc(month) + '"></label></div>' +
      (d.can_manage ? '<div class="kpi-grid">' + statTile(t("pay.totalAccrued"), money(d.total_accrued)) + statTile(t("pay.totalToPay"), money(d.total_to_pay)) + "</div>" : "") +
      panel(t(d.can_manage ? "pay.title" : "pay.mine"), t("pay.text"), d.items.map(row).join("") || '<p class="muted">' + esc(t("pay.empty")) + "</p>") +
      (d.can_manage && ["owner", "accountant"].includes(bizWs.role) ? '<div class="card-cta"><div><strong>' + esc(t("pay.postTitle")) + "</strong><p>" + esc(d.posted ? t("pay.posted", { sum: money(d.posted.total_kzt) }) : t("pay.postText")) + '</p></div><button type="button" class="primary-button" id="pay-post">' + esc(t(d.posted ? "pay.repost" : "pay.post")) + "</button></div>" : ""));
    body.querySelector("#pay-month").addEventListener("change", e => { bizPayMonth = e.target.value || null; bizPayroll(); });
    body.querySelectorAll("[data-pay]").forEach(f => f.addEventListener("submit", async e => {
      e.preventDefault();
      const v = new FormData(f), num = k => { const x = String(v.get(k) || "").trim(); return x === "" ? null : Number(x); };
      try { await api(bizBase() + "/members/" + f.dataset.pay + "/pay", { method: "PATCH", body: JSON.stringify({ shift_start: String(v.get("shift_start") || "") || null, pay_fixed_kzt: num("pay_fixed_kzt"), pay_per_shift_kzt: num("pay_per_shift_kzt"), pay_percent: num("pay_percent") }) }); status(t("biz.saved")); await bizPayroll(); } catch (x) { status(x.message, true); }
    }));
    body.querySelectorAll("[data-adj]").forEach(f => f.addEventListener("submit", async e => {
      e.preventDefault();
      const v = new FormData(f);
      try { await api(bizBase() + "/payroll/adjustments", { method: "POST", body: JSON.stringify({ member_id: f.dataset.adj, month, kind: String(v.get("kind")), amount_kzt: Number(v.get("amount_kzt")), note: String(v.get("note") || "").trim() || undefined }) }); status(t("biz.saved")); await bizPayroll(); } catch (x) { status(x.message, true); }
    }));
    body.querySelector("#pay-post")?.addEventListener("click", async () => { try { const r = await api(bizBase() + "/payroll/post", { method: "POST", body: JSON.stringify({ month }) }); status(t("pay.posted", { sum: money(r.total_kzt) })); await bizPayroll(); } catch (x) { status(x.message, true); } });
  }

  async function bizPnl() {
    const month = bizPayMonth || bizMonth();
    const d = await api(bizBase() + "/pnl?month=" + month);
    const c = d.current, p = d.previous;
    const delta = (a, b) => b ? ' <small class="' + (a >= b ? "good-text" : "warn-text") + '">' + (a >= b ? "▲" : "▼") + " " + Math.abs(Math.round((a - b) / Math.abs(b) * 100)) + "%</small>" : "";
    const line = (label, a, b, cls = "") => '<tr class="' + cls + '"><th>' + esc(label) + '</th><td class="num">' + esc(money(a)) + delta(a, b) + '</td><td class="num muted">' + esc(money(b)) + "</td></tr>";
    const body = bizBody('<div class="biz-month"><label class="field"><span>' + esc(t("pay.month")) + '</span><input type="month" id="pnl-month" value="' + esc(month) + '"></label></div>' +
      '<div class="kpi-grid">' + statTile(t("pnl.revenue"), money(c.revenue)) + statTile(t("pnl.net"), money(c.net_profit), c.net_margin != null ? t("pnl.margin", { pct: String(c.net_margin).replace(".", ",") }) : "") + "</div>" +
      panel(t("pnl.title"), t("pnl.text"), '<div class="table-scroll"><table class="data-table pnl-table"><thead><tr><th></th><th class="num">' + esc(t("pnl.this")) + '</th><th class="num">' + esc(t("pnl.prev")) + "</th></tr></thead><tbody>" +
        line(t("pnl.revenue"), c.revenue, p.revenue, "strong") + line(t("pnl.cogs"), -c.cogs, -p.cogs) + line(t("pnl.gross"), c.gross_profit, p.gross_profit, "strong") +
        line(t("pnl.payroll") + (c.payroll_estimated ? " *" : ""), -c.opex.payroll, -p.opex.payroll) + line(t("pnl.rent"), -c.opex.rent, -p.opex.rent) + line(t("pnl.marketing"), -c.opex.marketing, -p.opex.marketing) + line(t("pnl.utilities"), -c.opex.utilities, -p.opex.utilities) + line(t("pnl.other"), -c.opex.other, -p.opex.other) +
        line(t("pnl.operating"), c.operating_profit, p.operating_profit, "strong") + line(t("pnl.taxes"), -c.taxes, -p.taxes) + line(t("pnl.net"), c.net_profit, p.net_profit, "total") + "</tbody></table></div>" +
        (c.payroll_estimated ? '<p class="muted">' + esc(t("pnl.estimated")) + "</p>" : "") + '<p class="muted">' + esc(t("pnl.howto")) + "</p>"));
    body.querySelector("#pnl-month").addEventListener("change", e => { bizPayMonth = e.target.value || null; bizPnl(); });
  }

  // ---------- Деньги: счета, ДДС, импорт выписки, баланс, табель ----------
  const MONEY_IN = ["sales", "other_income", "loan_in", "owner_in"];
  const MONEY_OUT = ["goods", "payroll", "rent", "marketing", "taxes", "utilities", "other", "loan_out", "owner_out", "capex"];
  const MONEY_KINDS = ["cash", "bank", "kaspi", "card", "other"];
  const catLabel = c => t("money.cat." + c);
  const catOptions = (dir, sel) => (dir === "in" ? MONEY_IN : MONEY_OUT).map(c => option(c, catLabel(c), c === sel)).join("");
  const signed = (dir, v) => (dir === "in" ? "+" : dir === "out" ? "−" : "") + money(v);
  async function readStatement(file) {
    const buf = await file.arrayBuffer();
    try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch { return new TextDecoder("windows-1251").decode(buf); }
  }

  async function bizMoney() {
    const month = bizPayMonth || bizMonth();
    const [acc, dds, ops] = await Promise.all([api(bizBase() + "/money/accounts"), api(bizBase() + "/money/dds?month=" + month), api(bizBase() + "/money/ops?month=" + month)]);
    const accounts = acc.items.filter(a => !a.archived);
    const accOpts = sel => accounts.map(a => option(a.id, a.name, a.id === sel)).join("");
    const accountsHtml = accounts.map(a => '<div class="list-row"><div><strong>' + esc(a.name) + "</strong><p>" + esc(t("money.kind." + a.kind)) + (a.iban ? " · " + esc(a.iban) : "") + '</p></div><strong class="num">' + esc(money(a.balance_kzt)) + "</strong></div>").join("");
    const accountForm = '<details class="pay-setup"' + (accounts.length ? "" : " open") + "><summary>" + esc(t("money.addAccount")) + '</summary><form id="acc-form" class="app-form">' + field(t("money.accName"), "name", "", "text", 'required maxlength="80"') +
      '<label class="field"><span>' + esc(t("money.accKind")) + '</span><select name="kind">' + MONEY_KINDS.map(k => option(k, t("money.kind." + k), k === "bank")).join("") + "</select></label>" +
      field(t("money.iban"), "iban", "", "text", 'maxlength="20" pattern="[Kk][Zz][0-9A-Za-z]{18}" placeholder="KZ…"') + field(t("money.opening"), "opening_balance_kzt", "", "number", 'step="1"') + '<button class="outline-button">' + esc(t("biz.save")) + "</button></form></details>";
    if (!accounts.length) {
      const body = bizBody(panel(t("money.startTitle"), t("money.startText"), accountForm));
      return bindAccountForm(body);
    }
    const opForm = '<form id="op-form" class="app-form">' +
      '<label class="field"><span>' + esc(t("money.direction")) + '</span><select name="direction" id="op-dir">' + ["in", "out", "transfer"].map(d => option(d, t("money.dir." + d), d === "out")).join("") + "</select></label>" +
      '<label class="field"><span>' + esc(t("money.account")) + '</span><select name="account_id">' + accOpts() + "</select></label>" +
      '<label class="field" id="op-to" hidden><span>' + esc(t("money.toAccount")) + '</span><select name="to_account_id">' + accOpts(accounts[1]?.id) + "</select></label>" +
      '<label class="field" id="op-cat"><span>' + esc(t("money.category")) + '</span><select name="category">' + catOptions("out", "other") + "</select></label>" +
      field(t("money.day"), "day", almatyDay(), "date", "required") + field(t("money.amount"), "amount_kzt", "", "number", 'min="1" step="1" required') +
      field(t("money.counterparty"), "counterparty", "", "text", 'maxlength="200"') + field(t("money.description"), "description", "", "text", 'maxlength="500"') +
      '<button class="primary-button">' + esc(t("money.addOp")) + "</button></form>";
    const importForm = '<form id="imp-form" class="app-form"><label class="field"><span>' + esc(t("money.account")) + '</span><select name="account_id">' + accOpts(accounts.find(a => a.kind !== "cash")?.id) + "</select></label>" +
      '<label class="field"><span>' + esc(t("money.file")) + '</span><input type="file" name="file" accept=".csv,.txt,.tsv,text/csv,text/plain" required></label>' +
      '<button class="outline-button">' + esc(t("money.parse")) + '</button></form><div id="imp-preview"></div>';
    const act = dds.activities;
    const catRows = ["operating", "investing", "financing"].map(a => {
      const items = dds.categories.filter(c => c.activity === a);
      return '<tr class="strong"><th>' + esc(t("money.act." + a)) + '</th><td class="num">' + esc(money(act[a])) + "</td></tr>" + items.map(c => "<tr><th>" + esc(catLabel(c.category)) + '</th><td class="num">' + esc(signed(c.direction, c.amount)) + "</td></tr>").join("");
    }).join("");
    const accRows = dds.accounts.map(a => "<tr><th>" + esc(a.name) + '</th><td class="num">' + esc(money(a.opening)) + '</td><td class="num">' + esc(money(a.inflow)) + '</td><td class="num">' + esc(money(a.outflow)) + '</td><td class="num">' + esc(money(a.closing)) + "</td></tr>").join("");
    const opRows = ops.items.map(o => "<tr><td>" + esc(dayLabel(o.day)) + "</td><td>" + esc(o.account_name) + (o.to_account_name ? " → " + esc(o.to_account_name) : "") + "</td><td>" +
      (o.direction === "transfer" ? esc(t("money.cat.transfer")) : '<select class="mini-select" data-op-cat="' + esc(o.id) + '" aria-label="' + esc(t("money.category")) + '">' + catOptions(o.direction, o.category) + "</select>") + "</td><td>" + esc([o.counterparty, o.description].filter(Boolean).join(" — ")) +
      '</td><td class="num ' + (o.direction === "in" ? "good-text" : o.direction === "out" ? "warn-text" : "") + '">' + esc(signed(o.direction, o.amount_kzt)) + '</td><td><button type="button" class="link-button" data-op-del="' + esc(o.id) + '" aria-label="' + esc(t("money.delete")) + '">✕</button></td></tr>').join("");
    const body = bizBody('<div class="biz-month"><label class="field"><span>' + esc(t("pay.month")) + '</span><input type="month" id="money-month" value="' + esc(month) + '"></label></div>' +
      '<div class="kpi-grid">' + statTile(t("money.openingK"), money(dds.opening)) + statTile(t("money.inflow"), money(dds.inflow)) + statTile(t("money.outflow"), money(dds.outflow)) + statTile(t("money.closing"), money(dds.closing), t("money.net", { sum: money(dds.net) })) + "</div>" +
      panel(t("money.accounts"), t("money.accountsText"), accountsHtml + accountForm) +
      panel(t("money.opTitle"), t("money.opText"), opForm) +
      panel(t("money.importTitle"), t("money.importText"), importForm) +
      panel(t("money.ddsTitle"), t("money.ddsText"), '<div class="table-scroll"><table class="data-table pnl-table"><tbody>' + catRows + '<tr class="total"><th>' + esc(t("money.netFlow")) + '</th><td class="num">' + esc(money(dds.net)) + "</td></tr></tbody></table></div>" +
        '<div class="table-scroll"><table class="data-table"><thead><tr><th>' + esc(t("money.account")) + '</th><th class="num">' + esc(t("money.openingK")) + '</th><th class="num">' + esc(t("money.inflow")) + '</th><th class="num">' + esc(t("money.outflow")) + '</th><th class="num">' + esc(t("money.closing")) + "</th></tr></thead><tbody>" + accRows + "</tbody></table></div>") +
      panel(t("money.opsTitle"), t("money.opsText"), opRows ? '<div class="table-scroll"><table class="data-table ops-table"><thead><tr><th>' + esc(t("money.day")) + "</th><th>" + esc(t("money.account")) + "</th><th>" + esc(t("money.category")) + "</th><th>" + esc(t("money.counterparty")) + '</th><th class="num">' + esc(t("money.amount")) + "</th><th></th></tr></thead><tbody>" + opRows + "</tbody></table></div>" : '<p class="muted">' + esc(t("money.noOps")) + "</p>"));
    bindAccountForm(body);
    body.querySelector("#money-month").addEventListener("change", e => { bizPayMonth = e.target.value || null; bizMoney(); });
    const dir = body.querySelector("#op-dir"), catSel = body.querySelector('#op-form [name="category"]');
    dir.addEventListener("change", () => { body.querySelector("#op-to").hidden = dir.value !== "transfer"; body.querySelector("#op-cat").hidden = dir.value === "transfer"; if (dir.value !== "transfer") catSel.innerHTML = catOptions(dir.value, dir.value === "in" ? "sales" : "other"); });
    body.querySelector("#op-form").addEventListener("submit", async e => {
      e.preventDefault();
      const v = new FormData(e.currentTarget), d = String(v.get("direction"));
      const payload = { account_id: String(v.get("account_id")), day: String(v.get("day")), direction: d, amount_kzt: Number(v.get("amount_kzt")), counterparty: String(v.get("counterparty") || "").trim() || null, description: String(v.get("description") || "").trim() || null };
      if (d === "transfer") payload.to_account_id = String(v.get("to_account_id")); else payload.category = String(v.get("category"));
      try { await api(bizBase() + "/money/ops", { method: "POST", body: JSON.stringify(payload) }); status(t("money.saved")); await bizMoney(); } catch (x) { status(x.message, true); }
    });
    body.querySelectorAll("[data-op-cat]").forEach(s => s.addEventListener("change", async () => { try { await api(bizBase() + "/money/ops/" + s.dataset.opCat, { method: "PATCH", body: JSON.stringify({ category: s.value }) }); status(t("money.saved")); await bizMoney(); } catch (x) { status(x.message, true); } }));
    body.querySelectorAll("[data-op-del]").forEach(b => b.addEventListener("click", async () => { if (!confirm(t("money.confirmDelete"))) return; try { await api(bizBase() + "/money/ops/" + b.dataset.opDel, { method: "DELETE" }); status(t("money.deleted")); await bizMoney(); } catch (x) { status(x.message, true); } }));
    body.querySelector("#imp-form").addEventListener("submit", async e => {
      e.preventDefault();
      const v = new FormData(e.currentTarget), file = v.get("file"), accountId = String(v.get("account_id"));
      if (!file || !file.size) return;
      if (/\.xlsx?$/i.test(file.name)) return status(t("money.xlsxHint"), true);
      let p;
      try { p = await api(bizBase() + "/money/import/preview", { method: "POST", body: JSON.stringify({ account_id: accountId, text: await readStatement(file) }) }); } catch (x) { return status(x.message, true); }
      const fresh = p.rows.filter(r => !r.duplicate).length;
      const box = body.querySelector("#imp-preview");
      box.innerHTML = '<p class="muted">' + esc(t("money.previewInfo", { n: p.rows.length, fresh, dup: p.rows.length - fresh, skipped: p.skipped })) + "</p>" +
        '<div class="table-scroll"><table class="data-table ops-table"><thead><tr><th></th><th>' + esc(t("money.day")) + "</th><th>" + esc(t("money.counterparty")) + "</th><th>" + esc(t("money.category")) + '</th><th class="num">' + esc(t("money.amount")) + "</th></tr></thead><tbody>" +
        p.rows.map((r, i) => '<tr class="' + (r.duplicate ? "muted" : "") + '"><td><input type="checkbox" data-imp-on="' + i + '"' + (r.duplicate ? " disabled" : " checked") + ' aria-label="' + esc(t("money.include")) + '"></td><td>' + esc(dayLabel(r.day)) + "</td><td>" + esc([r.counterparty, r.description].filter(Boolean).join(" — ")) + (r.duplicate ? ' <span class="pill">' + esc(t("money.duplicate")) + "</span>" : "") +
          '</td><td><select class="mini-select" data-imp-cat="' + i + '" aria-label="' + esc(t("money.category")) + '">' + catOptions(r.direction, r.category) + '</select></td><td class="num ' + (r.direction === "in" ? "good-text" : "warn-text") + '">' + esc(signed(r.direction, r.amount_kzt)) + "</td></tr>").join("") +
        '</tbody></table></div><button type="button" class="primary-button" id="imp-commit"' + (fresh ? "" : " disabled") + ">" + esc(t("money.commit", { n: fresh })) + "</button>";
      box.querySelector("#imp-commit").addEventListener("click", async () => {
        const rows = p.rows.map((r, i) => box.querySelector('[data-imp-on="' + i + '"]').checked ? { day: r.day, direction: r.direction, amount_kzt: r.amount_kzt, category: box.querySelector('[data-imp-cat="' + i + '"]').value, counterparty: r.counterparty, description: r.description, external_id: r.external_id } : null).filter(Boolean);
        if (!rows.length) return;
        try { const res = await api(bizBase() + "/money/import/commit", { method: "POST", body: JSON.stringify({ account_id: accountId, rows }) }); status(t("money.imported", { n: res.created })); await bizMoney(); } catch (x) { status(x.message, true); }
      });
    });
  }
  // ---------- Платёжный календарь: what comes in and goes out, and whether money runs short ----------
  async function bizCalendar() {
    const [d, acc] = await Promise.all([api(bizBase() + "/money/calendar?days=60"), api(bizBase() + "/money/accounts")]);
    const accounts = acc.items.filter(a => !a.archived);
    const accOpts = accounts.map(a => option(a.id, a.name + " · " + money(a.balance_kzt), false)).join("");
    const gap = d.gap ? '<div class="card-cta warn-cta"><div><strong>' + esc(t("cal.gapTitle", { date: dayLabel(d.gap.day) })) + "</strong><p>" + esc(t("cal.gapText", { sum: money(-d.gap.balance) })) + "</p></div></div>"
      : '<p class="demo-note">' + esc(t("cal.noGap", { sum: money(d.min.balance), date: dayLabel(d.min.day) })) + "</p>";
    const seenPay = new Set();
    const item = o => '<div class="cal-item"><div><strong>' + esc(o.counterparty || catLabel(o.category)) + "</strong><small>" + esc(catLabel(o.category)) + (o.description && o.description !== catLabel(o.category) ? " · " + esc(o.description) : "") + (o.repeat === "monthly" ? " · " + esc(t("cal.monthly")) : "") + (o.overdue ? ' <span class="pill warn-pill">' + esc(t("cal.overdue", { date: dayLabel(o.due_day) })) + "</span>" : "") +
      '</small></div><span class="num ' + (o.direction === "in" ? "good-text" : "warn-text") + '">' + esc(signed(o.direction, o.amount)) + "</span>" +
      (accounts.length && !seenPay.has(o.id) && seenPay.add(o.id) ? '<button type="button" class="outline-button" data-cal-pay="' + esc(o.id) + '">' + esc(t(o.direction === "in" ? "cal.received" : "cal.paid")) + "</button>" : "") +
      '<button type="button" class="link-button" data-cal-del="' + esc(o.id) + '" aria-label="' + esc(t("money.delete")) + '">✕</button></div>';
    const daysHtml = d.days.map(g => '<section class="cal-day"><div class="cal-day-head"><strong>' + esc(dayLabel(g.day)) + '</strong><span class="' + (g.balance < 0 ? "warn-text" : "muted") + '">' + esc(t("cal.balanceAfter", { sum: money(g.balance) })) + "</span></div>" + g.items.map(item).join("") + "</section>").join("");
    const form = '<form id="cal-form" class="app-form"><label class="field"><span>' + esc(t("money.direction")) + '</span><select name="direction" id="cal-dir">' + option("out", t("cal.dirOut"), true) + option("in", t("cal.dirIn"), false) + "</select></label>" +
      '<label class="field"><span>' + esc(t("money.category")) + '</span><select name="category">' + catOptions("out", "rent") + "</select></label>" +
      field(t("money.amount"), "amount_kzt", "", "number", 'min="1" step="1" required') + field(t("cal.dueDay"), "due_day", almatyDay(), "date", "required") +
      field(t("money.counterparty"), "counterparty", "", "text", 'maxlength="200"') + field(t("money.description"), "description", "", "text", 'maxlength="500"') +
      '<label class="consent-field"><input type="checkbox" name="monthly"> <span>' + esc(t("cal.repeatMonthly")) + '</span></label><button class="primary-button">' + esc(t("cal.add")) + "</button></form>";
    const body = bizBody('<div class="kpi-grid">' + statTile(t("cal.cashNow"), money(d.cash)) + statTile(t("cal.inflow"), money(d.inflow)) + statTile(t("cal.outflow"), money(d.outflow)) + statTile(t("cal.closing"), money(d.closing), t("cal.horizon", { date: dayLabel(d.horizon_end) })) + "</div>" + gap +
      panel(t("cal.title"), t("cal.text"), daysHtml || '<p class="muted">' + esc(t("cal.empty")) + "</p>") + panel(t("cal.addTitle"), t("cal.addText"), form) +
      '<dialog class="nudge-dialog" id="cal-pay-dlg"><form method="dialog" class="app-form" id="cal-pay-form"><h2>' + esc(t("cal.payTitle")) + '</h2><label class="field"><span>' + esc(t("money.account")) + '</span><select name="account_id">' + accOpts + "</select></label>" + field(t("money.day"), "day", almatyDay(), "date", "required") + field(t("cal.actualAmount"), "amount_kzt", "", "number", 'min="1" step="1"') +
      '<div class="nudge-actions"><button class="primary-button" value="ok">' + esc(t("cal.confirm")) + '</button><button type="button" class="text-button" id="cal-pay-cancel">' + esc(t("common.close")) + "</button></div></form></dialog>");
    const dir = body.querySelector("#cal-dir"), catSel = body.querySelector('#cal-form [name="category"]');
    dir.addEventListener("change", () => { catSel.innerHTML = catOptions(dir.value, dir.value === "in" ? "sales" : "rent"); });
    body.querySelector("#cal-form").addEventListener("submit", async e => {
      e.preventDefault();
      const v = new FormData(e.currentTarget);
      try { await api(bizBase() + "/money/calendar", { method: "POST", body: JSON.stringify({ direction: String(v.get("direction")), category: String(v.get("category")), amount_kzt: Number(v.get("amount_kzt")), due_day: String(v.get("due_day")), counterparty: String(v.get("counterparty") || "").trim() || null, description: String(v.get("description") || "").trim() || null, repeat: v.get("monthly") ? "monthly" : "none" }) }); status(t("money.saved")); await bizCalendar(); } catch (x) { status(x.message, true); }
    });
    body.querySelectorAll("[data-cal-del]").forEach(b => b.addEventListener("click", async () => { if (!confirm(t("cal.confirmDelete"))) return; try { await api(bizBase() + "/money/calendar/" + b.dataset.calDel, { method: "DELETE" }); await bizCalendar(); } catch (x) { status(x.message, true); } }));
    const dlg = body.querySelector("#cal-pay-dlg");
    let payId = null;
    body.querySelector("#cal-pay-cancel").addEventListener("click", () => dlg.close());
    body.querySelectorAll("[data-cal-pay]").forEach(b => b.addEventListener("click", () => { payId = b.dataset.calPay; if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", ""); }));
    body.querySelector("#cal-pay-form").addEventListener("submit", async e => {
      e.preventDefault();
      const v = new FormData(e.currentTarget), amt = String(v.get("amount_kzt") || "").trim();
      dlg.close();
      try { const r = await api(bizBase() + "/money/calendar/" + payId + "/pay", { method: "POST", body: JSON.stringify(Object.assign({ account_id: String(v.get("account_id")), day: String(v.get("day")) }, amt ? { amount_kzt: Number(amt) } : {})) }); status(r.next_due ? t("cal.paidNext", { date: dayLabel(r.next_due) }) : t("cal.paidDone")); await bizCalendar(); } catch (x) { status(x.message, true); }
    });
  }
  function bindAccountForm(body) {
    body.querySelector("#acc-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      const v = new FormData(e.currentTarget), iban = String(v.get("iban") || "").trim().toUpperCase();
      try { await api(bizBase() + "/money/accounts", { method: "POST", body: JSON.stringify({ name: String(v.get("name")).trim(), kind: String(v.get("kind")), iban: iban || null, opening_balance_kzt: Math.round(Number(v.get("opening_balance_kzt") || 0)) }) }); status(t("money.saved")); await bizMoney(); } catch (x) { status(x.message, true); }
    });
  }

  async function bizBalance() {
    const d = await api(bizBase() + "/money/balance");
    const KINDS = { asset: ["inventory", "receivable", "fixed_asset", "prepaid", "other"], liability: ["loan", "payable", "tax_payable", "other"] };
    const line = (label, v, cls = "") => '<tr class="' + cls + '"><th>' + label + '</th><td class="num">' + esc(money(v)) + "</td></tr>";
    const item = i => line(esc(i.name) + ' <small class="muted">' + esc(t("bal.kind." + i.kind)) + '</small> <button type="button" class="link-button" data-bal-del="' + esc(i.id) + '" aria-label="' + esc(t("money.delete")) + '">✕</button>', i.amount_kzt);
    const assets = d.accounts.map(a => line(esc(a.name), a.balance)).join("") + (d.deals_receivable ? line(esc(t("bal.dealsReceivable")), d.deals_receivable) : "") + d.items.filter(i => i.side === "asset").map(item).join("");
    const liab = (d.deals_payable ? line(esc(t("bal.dealsPayable")), d.deals_payable) : "") + d.items.filter(i => i.side === "liability").map(item).join("");
    const form = side => '<form class="inline-form" data-bal-form="' + side + '"><label class="field"><span>' + esc(t("bal.kind")) + '</span><select name="kind">' + KINDS[side].map(k => option(k, t("bal.kind." + k), false)).join("") + "</select></label>" +
      field(t("bal.name"), "name", "", "text", 'required maxlength="120"') + field(t("money.amount"), "amount_kzt", "", "number", 'min="0" step="1" required') + '<button class="outline-button">' + esc(t("bal.add")) + "</button></form>";
    const body = bizBody('<div class="kpi-grid">' + statTile(t("bal.assets"), money(d.assets)) + statTile(t("bal.liabilities"), money(d.liabilities)) + statTile(t("bal.equity"), money(d.equity)) + "</div>" +
      panel(t("bal.assets"), t("bal.assetsText"), '<div class="table-scroll"><table class="data-table pnl-table"><tbody>' + assets + line(esc(t("bal.assetsTotal")), d.assets, "total") + "</tbody></table></div>" + form("asset")) +
      panel(t("bal.liabilities"), t("bal.liabText"), '<div class="table-scroll"><table class="data-table pnl-table"><tbody>' + liab + line(esc(t("bal.liabTotal")), d.liabilities, "total") + line(esc(t("bal.equity")), d.equity, "strong") + "</tbody></table></div>" + form("liability")) +
      '<p class="muted">' + esc(t("bal.note")) + "</p>");
    body.querySelectorAll("[data-bal-form]").forEach(f => f.addEventListener("submit", async e => {
      e.preventDefault();
      const v = new FormData(f);
      try { await api(bizBase() + "/money/balance-items", { method: "POST", body: JSON.stringify({ side: f.dataset.balForm, kind: String(v.get("kind")), name: String(v.get("name")).trim(), amount_kzt: Math.round(Number(v.get("amount_kzt"))) }) }); status(t("money.saved")); await bizBalance(); } catch (x) { status(x.message, true); }
    }));
    body.querySelectorAll("[data-bal-del]").forEach(b => b.addEventListener("click", async () => { try { await api(bizBase() + "/money/balance-items/" + b.dataset.balDel, { method: "DELETE" }); await bizBalance(); } catch (x) { status(x.message, true); } }));
  }

  async function bizTimesheet() {
    const month = bizPayMonth || bizMonth();
    const [att, mem] = await Promise.all([api(bizBase() + "/attendance?month=" + month), bizMembers()]);
    const [y, m] = month.split("-").map(Number), days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const people = mem.items.filter(p => p.status === "active");
    const byKey = new Map(att.items.map(a => [a.member_id + "|" + a.day, a]));
    const head = "<tr><th>" + esc(t("clock.who")) + "</th>" + Array.from({ length: days }, (_, i) => '<th class="ts-day">' + (i + 1) + "</th>").join("") + '<th class="num">' + esc(t("ts.shifts")) + '</th><th class="num">' + esc(t("ts.late")) + "</th></tr>";
    const rows = people.map(p => {
      let shifts = 0, late = 0;
      const cells = Array.from({ length: days }, (_, i) => {
        const a = byKey.get(p.id + "|" + month + "-" + String(i + 1).padStart(2, "0"));
        if (!a) return '<td class="ts-cell"></td>';
        shifts++; if (a.late_minutes) late++;
        return '<td class="ts-cell ' + (a.late_minutes ? "ts-late" : "ts-ok") + '" title="' + esc(timeOf(a.check_in_at) + "–" + timeOf(a.check_out_at) + (a.late_minutes ? " · " + t("clock.late", { n: a.late_minutes }) : "")) + '">' + (a.late_minutes ? "!" : "✓") + "</td>";
      }).join("");
      return "<tr><th>" + esc(p.display_name) + "</th>" + cells + '<td class="num">' + shifts + '</td><td class="num">' + (late ? '<span class="warn-text">' + late + "</span>" : "0") + "</td></tr>";
    }).join("");
    const body = bizBody('<div class="biz-month"><label class="field"><span>' + esc(t("pay.month")) + '</span><input type="month" id="ts-month" value="' + esc(month) + '"></label></div>' +
      panel(t("ts.title"), t("ts.text"), '<div class="table-scroll"><table class="data-table ts-table"><thead>' + head + "</thead><tbody>" + rows + "</tbody></table></div>" + '<p class="muted">' + esc(t("ts.legend")) + "</p>"));
    body.querySelector("#ts-month").addEventListener("change", e => { bizPayMonth = e.target.value || null; bizTimesheet(); });
  }

  async function bizTeam() {
    const d = await bizMembers();
    const r = d.me.role;
    const body = bizBody(panel(t("biz.teamTitle"), t("biz.teamText", { n: d.items.length, limit: d.limit }), d.items.map(m => '<div class="list-row"><div><strong>' + esc(m.display_name) + "</strong><p>" + esc(I18N.label("bizRole", m.role)) + (m.position ? " · " + esc(m.position) : "") + "</p><small>" + esc(m.status === "invited" ? t("biz.invited") : t("biz.active")) + "</small></div>" +
        (BIZ_CAN.team(r) && m.role !== "owner" && !(r !== "owner" && m.role === "manager") ? '<button type="button" class="outline-button" data-remove-member="' + esc(m.id) + '">' + esc(t("biz.remove")) + "</button>" : "") + "</div>").join("")) +
      (BIZ_CAN.team(r) ? panel(t("biz.addMember"), t("biz.addMemberText"), '<form id="member-form" class="app-form">' + field(t("biz.memberName"), "display_name", "", "text", 'required maxlength="120"') + field(t("biz.position"), "position", "", "text", 'maxlength="120"') +
        '<label class="field"><span>' + esc(t("biz.role")) + '</span><select name="role">' + BIZ_ROLES.filter(x => r === "owner" || x !== "manager").map(x => option(x, I18N.label("bizRole", x), x === "staff")).join("") + "</select></label>" +
        '<button class="primary-button">' + esc(t("biz.invite")) + '</button></form><div id="invite-result" aria-live="polite"></div>') : ""));
    const form = body.querySelector("#member-form");
    if (form) form.addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(form);
      try {
        const m = await api(bizBase() + "/members", { method: "POST", body: JSON.stringify({ display_name: String(f.get("display_name")).trim(), position: String(f.get("position") || "").trim() || null, role: String(f.get("role")) }) });
        await bizTeam();
        document.querySelector("#invite-result").innerHTML = '<div class="demo-note"><strong>' + esc(t("biz.inviteCode", { name: m.display_name })) + '</strong><p class="card-code">' + esc(m.invite_code) + "</p><p>" + esc(t("biz.inviteHowTo")) + "</p></div>";
        status(t("biz.inviteCreated"));
      } catch (x) { status(x.message, true); }
    });
    body.querySelectorAll("[data-remove-member]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm(t("biz.removeConfirm"))) return;
      try { await api(bizBase() + "/members/" + encodeURIComponent(b.dataset.removeMember), { method: "PATCH", body: JSON.stringify({ remove: true }) }); await bizTeam(); status(t("biz.removed")); } catch (x) { status(x.message, true); }
    }));
  }

  const FB_STATUSES = ["new", "accepted", "done", "rejected"];
  async function bizFeedback() {
    const d = await api(bizBase() + "/feedback");
    const body = bizBody(panel(t("biz.fbTitle"), t("biz.fbText"), '<form id="bfb-form" class="app-form"><label class="field"><span>' + esc(t("biz.fbKind")) + '</span><select name="kind">' + ["suggestion", "plus", "minus"].map(k => option(k, I18N.label("staffFeedback", k), k === "suggestion")).join("") + "</select></label>" +
        area(t("biz.fbBody"), "body", "") + '<label class="consent-field"><input type="checkbox" name="anonymous" value="yes"> <span>' + esc(t("biz.fbAnonymous")) + '</span></label><button class="primary-button">' + esc(t("biz.fbSend")) + "</button></form>") +
      panel(t(d.can_manage ? "biz.fbAll" : "biz.fbMine"), d.can_manage ? t("biz.fbAllText") : "", d.items.length ? d.items.map(f => '<article class="invoice-card"><div class="invoice-top"><div><span class="pill">' + esc(I18N.label("staffFeedback", f.kind)) + "</span><p>" + esc(f.body) + "</p><small>" + esc(f.anonymous ? t("biz.fbAnon") : (f.author_name || "")) + " · " + esc(date(f.created_at)) + '</small></div><span class="pill">' + esc(I18N.label("staffFeedbackStatus", f.status)) + "</span></div>" +
        (f.response ? '<p class="demo-note"><strong>' + esc(t("biz.fbResponse")) + ":</strong> " + esc(f.response) + "</p>" : "") +
        (d.can_manage ? '<form class="inline-form" data-fb-manage="' + esc(f.id) + '"><label class="field"><span>' + esc(t("biz.fbStatus")) + '</span><select name="status">' + FB_STATUSES.map(st => option(st, I18N.label("staffFeedbackStatus", st), st === f.status)).join("") + '</select></label><label class="field"><span>' + esc(t("biz.fbReply")) + '</span><input name="response" maxlength="1000"></label><button class="outline-button">' + esc(t("biz.save")) + "</button></form>" : "") + "</article>").join("") : '<p class="muted">' + esc(t("biz.fbEmpty")) + "</p>"));
    body.querySelector("#bfb-form").addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      try { await api(bizBase() + "/feedback", { method: "POST", body: JSON.stringify({ kind: String(f.get("kind")), body: String(f.get("body") || "").trim(), anonymous: f.get("anonymous") === "yes" }) }); await bizFeedback(); status(t("biz.fbSent")); } catch (x) { status(x.message, true); }
    });
    body.querySelectorAll("[data-fb-manage]").forEach(form => form.addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(form);
      try { await api(bizBase() + "/feedback/" + encodeURIComponent(form.dataset.fbManage), { method: "PATCH", body: JSON.stringify({ status: String(f.get("status")), response: String(f.get("response") || "").trim() || null }) }); await bizFeedback(); status(t("biz.saved")); } catch (x) { status(x.message, true); }
    }));
  }

  const monthLabel = m => { const [y, mo] = String(m).split("-"); return t("month." + Number(mo)) + " " + y; };
  async function bizFinance() {
    const book = (await api(bizBase() + "/ledger?months=12")).months;
    const max = Math.max(1, ...book.map(x => Math.max(x.revenue, x.expenses)));
    let html = panel(t("fin.bookTitle"), t("fin.bookText"), '<div class="table-scroll"><table class="data-table"><thead><tr><th>' + esc(t("fin.month")) + '</th><th class="num">' + esc(t("biz.revenue")) + '</th><th class="num">' + esc(t("fin.expenses")) + '</th><th class="num">' + esc(t("fin.profit")) + '</th><th class="num">' + esc(t("fin.margin")) + "</th></tr></thead><tbody>" +
      book.map(x => "<tr><td>" + esc(monthLabel(x.month)) + '</td><td class="num">' + esc(money(x.revenue)) + '</td><td class="num">' + esc(money(x.expenses)) + '</td><td class="num' + (x.profit < 0 ? " negative" : "") + '"><strong>' + esc(money(x.profit)) + '</strong></td><td class="num">' + (x.revenue > 0 ? Math.round(x.profit / x.revenue * 100) + "%" : "—") + "</td></tr>").join("") + "</tbody></table></div>" +
      '<ol class="bars fin-bars">' + book.slice().reverse().map(x => '<li><span class="bar-label">' + esc(String(x.month).slice(5) + "." + String(x.month).slice(2, 4)) + '</span><span class="bar-track"><span class="bar" style="width:' + Math.round(x.revenue / max * 100) + '%"></span><span class="bar bar-exp" style="width:' + Math.round(x.expenses / max * 100) + '%"></span></span><span class="bar-value">' + esc(money(x.profit)) + "</span></li>").join("") + "</ol>" +
      '<p class="muted">' + esc(t("fin.legend")) + "</p>");
    if (bizWs.role === "owner") {
      const f = await api(bizBase() + "/financing");
      const mtr = f.metrics;
      html += panel(t("fin.loansTitle"), t("fin.loansText"),
        '<div class="kpi-grid">' + statTile(t("fin.avgRevenue"), money(mtr.avg_monthly_revenue), t("fin.last3")) + statTile(t("fin.avgProfit"), money(mtr.avg_monthly_profit), t("fin.last3")) + statTile(t("fin.history"), t("fin.historyN", { n: mtr.history_months })) + "</div>" +
        (f.offers.length ? f.offers.map(o => '<article class="invoice-card loan-card' + (o.eligible ? " eligible" : "") + '"><div class="invoice-top"><div><span class="pill">' + esc(o.eligible ? t("fin.eligible") : t("fin.notYet")) + "</span><h3>" + esc(o.bank_name) + " · " + esc(o.product_name) + "</h3><small>" +
          esc([o.rate_from != null ? t("fin.rateFrom", { rate: String(o.rate_from).replace(".", ",") }) : "", o.amount_max ? t("fin.upTo", { amount: money(o.amount_max) }) : "", o.term_months_max ? t("fin.termUpTo", { n: o.term_months_max }) : ""].filter(Boolean).join(" · ")) + "</small></div></div>" +
          (o.description ? "<p>" + esc(o.description) + "</p>" : "") + '<p class="muted">' + esc(t("fin.requirements", { revenue: money(o.min_monthly_revenue), months: o.min_history_months })) + (o.require_profit ? " " + esc(t("fin.needProfit")) : "") + "</p>" +
          (f.applications.some(a => a.offer_id === o.id && ["new", "sent", "approved"].includes(a.status)) ? '<p class="demo-note">' + esc(t("fin.pending")) + "</p>" :
          o.eligible ? '<button type="button" class="primary-button" data-loan-apply="' + esc(o.id) + '">' + esc(t("fin.apply")) + '</button><form class="app-form loan-form" data-loan-form="' + esc(o.id) + '" hidden>' +
            field(t("fin.amount"), "amount", "", "number", 'required step="1" ' + (o.amount_min ? 'min="' + o.amount_min + '" ' : 'min="1" ') + (o.amount_max ? 'max="' + o.amount_max + '"' : "")) + field(t("fin.term"), "term", "", "number", 'required min="1" step="1" ' + (o.term_months_max ? 'max="' + o.term_months_max + '"' : 'max="360"')) +
            field(t("fin.purpose"), "purpose", "", "text", 'maxlength="500"') + field(t("fin.phone"), "phone", "", "tel", 'inputmode="tel" placeholder="+7 701 123 45 67" maxlength="20"') +
            '<label class="consent-field"><input type="checkbox" name="consent" value="yes" required> <span>' + esc(t("fin.consent", { bank: o.bank_name })) + '</span></label><button class="primary-button">' + esc(t("fin.send")) + "</button></form>"
            : '<p class="muted">' + esc(o.reasons.map(r => t("fin.reason." + r)).join(" ")) + "</p>") + "</article>").join("") : '<p class="muted">' + esc(t("fin.noOffers")) + "</p>") +
        '<p class="muted fin-disclaimer">' + esc(t("fin.disclaimer")) + "</p>") +
        (f.applications.length ? panel(t("fin.myApps"), "", f.applications.map(a => '<div class="list-row"><div><strong>' + esc(a.bank_name) + " · " + esc(a.product_name) + "</strong><p>" + esc(money(a.amount_requested)) + " · " + esc(t("fin.months", { n: a.term_months })) + (a.amount_issued ? " · " + esc(t("fin.issued", { amount: money(a.amount_issued) })) : "") + "</p>" + (a.bank_note ? "<small>" + esc(a.bank_note) + "</small>" : "") + '</div><span class="pill">' + esc(I18N.label("loanStatus", a.status)) + "</span>" +
          (a.status === "new" || a.status === "sent" ? '<button type="button" class="outline-button" data-loan-cancel="' + esc(a.id) + '">' + esc(t("biz.cancel")) + "</button>" : "") + "</div>").join("")) : "");
      const body = bizBody(html);
      body.querySelectorAll("[data-loan-apply]").forEach(b => b.addEventListener("click", () => { const fm = body.querySelector('[data-loan-form="' + b.dataset.loanApply + '"]'); fm.hidden = false; b.hidden = true; fm.querySelector("input").focus(); }));
      body.querySelectorAll("[data-loan-form]").forEach(form => form.addEventListener("submit", async e => {
        e.preventDefault();
        const d = new FormData(form);
        try {
          await api(bizBase() + "/financing/applications", { method: "POST", body: JSON.stringify({ offer_id: form.dataset.loanForm, amount_requested: Math.round(Number(d.get("amount"))), term_months: Number(d.get("term")), purpose: String(d.get("purpose") || "").trim() || null, contact_phone: String(d.get("phone") || "").trim() || null, consent_version: f.consent_current_version }) });
          await bizFinance(); status(t("fin.sent"));
        } catch (x) { status(x.message, true); }
      }));
      body.querySelectorAll("[data-loan-cancel]").forEach(b => b.addEventListener("click", async () => {
        try { await api(bizBase() + "/financing/applications/" + encodeURIComponent(b.dataset.loanCancel) + "/cancel", { method: "POST", body: "{}" }); await bizFinance(); status(t("biz.saved")); } catch (x) { status(x.message, true); }
      }));
    } else bizBody(html);
  }

  const LOAN_STATUSES = ["new", "sent", "approved", "rejected", "issued", "cancelled"];
  async function adminLoans() {
    const [offers, apps] = await Promise.all([api("/v1/admin/loan-offers"), api("/v1/admin/loan-applications")]);
    const tot = apps.totals;
    content.innerHTML = '<div class="kpi-grid">' + statTile(t("adminLoans.issuedCount"), tot.issued_count) + statTile(t("adminLoans.issuedAmount"), money(tot.issued_amount)) + statTile(t("adminLoans.commission"), money(tot.commission)) + statTile(t("adminLoans.commissionMonth"), money(tot.commission_this_month)) + "</div>" +
      panel(t("adminLoans.appsTitle"), t("adminLoans.appsText"), apps.items.length ? apps.items.map(a => '<article class="invoice-card"><div class="invoice-top"><div><h3>' + esc(a.company_name) + "</h3><small>" + esc(a.applicant_name || "") + (a.contact_phone ? ' · <a href="tel:' + esc(a.contact_phone) + '">' + esc(a.contact_phone) + "</a>" : "") + "</small></div>" + '<span class="pill">' + esc(I18N.label("loanStatus", a.status)) + "</span></div>" +
        "<p><strong>" + esc(a.bank_name) + " · " + esc(a.product_name) + "</strong> — " + esc(money(a.amount_requested)) + ", " + esc(t("fin.months", { n: a.term_months })) + (a.purpose ? " · " + esc(a.purpose) : "") + "</p>" +
        '<p class="muted">' + esc(t("adminLoans.snapshot", { revenue: money(a.snapshot.metrics.avg_monthly_revenue), profit: money(a.snapshot.metrics.avg_monthly_profit), months: a.snapshot.metrics.history_months })) + "</p>" +
        (a.status === "issued" ? '<p class="demo-note">' + esc(t("adminLoans.issuedLine", { amount: money(a.amount_issued), commission: money(a.commission_kzt), rate: String(Math.round(a.commission_rate * 10000) / 100).replace(".", ",") })) + "</p>" : "") +
        '<form class="inline-form" data-loan-status="' + esc(a.id) + '"><label class="field"><span>' + esc(t("adminLoans.status")) + '</span><select name="status">' + LOAN_STATUSES.map(st => option(st, I18N.label("loanStatus", st), st === a.status)).join("") + '</select></label>' +
        '<label class="field"><span>' + esc(t("adminLoans.amountIssued")) + '</span><input name="amount_issued" type="number" min="1" step="1" value="' + esc(a.amount_issued || "") + '"></label><label class="field"><span>' + esc(t("adminLoans.note")) + '</span><input name="bank_note" maxlength="1000"></label><button class="outline-button">' + esc(t("biz.save")) + "</button></form></article>").join("") : '<p class="muted">' + esc(t("adminLoans.noApps")) + "</p>") +
      panel(t("adminLoans.offersTitle"), t("adminLoans.offersText"), offers.items.map(o => '<div class="list-row"><div><strong>' + esc(o.bank_name) + " · " + esc(o.product_name) + "</strong><p>" + esc(t("fin.requirements", { revenue: money(o.min_monthly_revenue), months: o.min_history_months })) + "</p><small>" + esc(t("adminLoans.commissionRate", { rate: String(Math.round(o.commission_rate * 10000) / 100).replace(".", ",") })) + " · " + esc(o.status === "active" ? t("adminLoans.active") : t("adminLoans.hidden")) + '</small></div><button type="button" class="outline-button" data-offer-toggle="' + esc(o.id) + '" data-to="' + (o.status === "active" ? "hidden" : "active") + '">' + esc(o.status === "active" ? t("adminLoans.hide") : t("adminLoans.show")) + "</button></div>").join("") +
        '<form id="loan-offer-form" class="app-form"><h3>' + esc(t("adminLoans.newOffer")) + "</h3>" + field(t("adminLoans.bank"), "bank_name", "", "text", 'required minlength="2" maxlength="120"') + field(t("adminLoans.product"), "product_name", "", "text", 'required minlength="2" maxlength="160"') + area(t("adminLoans.description"), "description", "") +
        field(t("adminLoans.rate"), "rate_from", "", "number", 'min="0" max="100" step="0.1"') + field(t("adminLoans.amountMin"), "amount_min", "", "number", 'min="1" step="1"') + field(t("adminLoans.amountMax"), "amount_max", "", "number", 'min="1" step="1"') + field(t("adminLoans.termMax"), "term_months_max", "", "number", 'min="1" max="360" step="1"') +
        field(t("adminLoans.minRevenue"), "min_monthly_revenue", "0", "number", 'min="0" step="1" required') + field(t("adminLoans.minHistory"), "min_history_months", "3", "number", 'min="0" max="60" step="1" required') +
        '<label class="consent-field"><input type="checkbox" name="require_profit" value="yes"> <span>' + esc(t("adminLoans.requireProfit")) + "</span></label>" + field(t("adminLoans.commissionField"), "commission_pct", "", "number", 'min="0" max="20" step="0.01" required') +
        '<button class="primary-button">' + esc(t("adminLoans.add")) + "</button></form>");
    const num = (f, k) => f.get(k) === "" || f.get(k) == null ? null : Number(f.get(k));
    document.querySelector("#loan-offer-form").addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      try {
        await api("/v1/admin/loan-offers", { method: "POST", body: JSON.stringify({ bank_name: String(f.get("bank_name")).trim(), product_name: String(f.get("product_name")).trim(), description: String(f.get("description") || "").trim() || null,
          rate_from: num(f, "rate_from"), amount_min: num(f, "amount_min"), amount_max: num(f, "amount_max"), term_months_max: num(f, "term_months_max"), min_monthly_revenue: num(f, "min_monthly_revenue") || 0, min_history_months: num(f, "min_history_months") || 0,
          require_profit: f.get("require_profit") === "yes", commission_rate: Math.round((num(f, "commission_pct") || 0) * 100) / 10000 }) });
        await adminLoans(); status(t("adminLoans.added"));
      } catch (x) { status(x.message, true); }
    });
    content.querySelectorAll("[data-offer-toggle]").forEach(b => b.addEventListener("click", async () => {
      try { await api("/v1/admin/loan-offers/" + encodeURIComponent(b.dataset.offerToggle), { method: "PATCH", body: JSON.stringify({ status: b.dataset.to }) }); await adminLoans(); status(t("biz.saved")); } catch (x) { status(x.message, true); }
    }));
    content.querySelectorAll("[data-loan-status]").forEach(form => form.addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(form);
      try { await api("/v1/admin/loan-applications/" + encodeURIComponent(form.dataset.loanStatus), { method: "PATCH", body: JSON.stringify({ status: String(f.get("status")), amount_issued: f.get("amount_issued") ? Number(f.get("amount_issued")) : null, bank_note: String(f.get("bank_note") || "").trim() || null }) }); await adminLoans(); status(t("biz.saved")); } catch (x) { status(x.message, true); }
    }));
  }

  // ---------- Learning for non-members: catalog with locks and the AI academy ----------
  async function learnGuest(access) {
    const [d, prods] = await Promise.all([api("/v1/learn/courses"), api("/v1/learn/products").catch(() => ({ items: [] }))]);
    d.items = await sortVoicedFirst(scoped(d.items));
    const owned = new Set(access.tracks || []);
    const offer = (prods.items || []).map(pr => {
      const o = pr.my_order;
      const state = owned.has(pr.track) ? '<p class="demo-note">' + esc(t("academy.owned")) + "</p>"
        : o && o.status === "pending" ? '<div class="demo-note"><strong>' + esc(t("academy.orderTitle", { number: o.order_number, amount: money(o.amount_kzt) })) + "</strong><p>" + esc(prods.payment_instructions) + "</p>" +
            (o.marked_paid_at ? "<p><strong>" + esc(t("academy.checking")) + "</strong></p>" : '<form class="inline-form" data-order-paid="' + esc(o.id) + '"><label class="field"><span>' + esc(t("academy.payerNote")) + '</span><input name="note" maxlength="300"></label><button class="primary-button">' + esc(t("academy.iPaid")) + "</button></form>") + "</div>"
        : '<button type="button" class="primary-button" data-buy="' + esc(pr.slug) + '">' + esc(t("academy.buy", { price: money(pr.price_kzt) })) + "</button>";
      return '<section class="academy-card"><p class="eyebrow">' + esc(t("academy.eyebrow")) + "</p><h2>" + esc(pr.title) + "</h2><p>" + esc(pr.description || "") + '</p><p class="academy-meta">' + esc(t("academy.meta", { courses: pr.course_count, lessons: pr.lesson_count })) + "</p>" + state + "</section>";
    }).join("");
    const draw = () => {
    const list = d.items.filter(catalogMatch);
    const cards = list.map(c => '<article class="invoice-card course-card' + (c.locked ? " locked" : "") + '">' + courseCover(c) + '<div class="invoice-top"><div><span class="pill">' + esc(I18N.label("courseCategory", c.category)) + "</span>" + (I18N.getLocale() === "kk" && !c.translated ? ' <span class="pill muted-pill">' + esc(t("learn.ruOnly")) + "</span>" : "") + (c.is_free ? ' <span class="pill free-pill">' + esc(t("academy.free")) + "</span>" : "") + "<h3>" + (c.locked ? ic("lock", "ic-inline") + " " : "") + esc(c.title) + '</h3><small>' +
      esc(t("learn.meta", { lessons: c.lesson_count, minutes: c.duration_min })) + "</small></div></div><p>" + esc(c.description || "") + "</p>" +
      (c.locked ? '<p class="muted">' + esc(t(c.track ? "academy.lockedTrack" : "academy.lockedMembers")) + "</p>" : progressBar(c.completed_count, c.lesson_count) + '<div class="receipt-actions"><button class="primary-button" data-course="' + esc(c.slug) + '">' + esc(t(c.completed_count ? "learn.continue" : "learn.start")) + "</button></div>") + "</article>").join("");
    content.innerHTML = offer + '<div class="card-cta"><div><strong>' + esc(t("academy.membersTitle")) + "</strong><p>" + esc(t("academy.membersText")) + '</p></div><button type="button" class="primary-button" data-view="membership">' + esc(t("academy.membersCta")) + "</button></div>" +
      (catalogScope === "books" ? artBanner("books", "hero") : testsTeaser()) + panel(t(catalogScope === "books" ? "books.section" : "learn.section"), t(catalogScope === "books" ? "books.sectionText" : "academy.catalogText"), catalogTools(d.items) + '<div class="course-grid">' + (cards || '<p class="muted">' + esc(t(d.items.length ? "learn.nothingFound" : "learn.empty")) + "</p>") + "</div>") +
      panel(t("learn.noAccessTitle"), t("learn.noAccessText"), joinForm());
    wireJoin(learn);
    wireCatalog(draw);
    content.querySelectorAll("[data-course]").forEach(b => b.addEventListener("click", () => { learnCourse = b.dataset.course; render("course"); }));
    content.querySelectorAll("[data-buy]").forEach(b => b.addEventListener("click", async () => {
      try { await api("/v1/learn/products/" + encodeURIComponent(b.dataset.buy) + "/orders", { method: "POST", body: JSON.stringify({}) }); await learn(); status(t("academy.ordered")); } catch (x) { status(x.message, true); }
    }));
    content.querySelectorAll("[data-order-paid]").forEach(form => form.addEventListener("submit", async e => {
      e.preventDefault();
      const note = String(new FormData(form).get("note") || "").trim() || null;
      try { await api("/v1/learn/orders/" + encodeURIComponent(form.dataset.orderPaid) + "/paid", { method: "POST", body: JSON.stringify({ note }) }); await learn(); status(t("academy.paidSent")); } catch (x) { status(x.message, true); }
    }));    };
    draw();
  }

  async function adminLearningOrders() {
    const d = await api("/v1/admin/learning-orders");
    const isAdmin = (await loadRoles()).includes("admin");
    content.innerHTML = '<div class="kpi-grid">' + statTile(t("adminOrders.paid"), d.totals.paid_count, money(d.totals.paid_amount)) + statTile(t("adminOrders.pending"), d.totals.pending_count) + "</div>" +
      panel(t("adminOrders.productsTitle"), t("adminOrders.productsText"), d.products.map(pr => '<form class="inline-form" data-product="' + esc(pr.slug) + '"><strong>' + esc(pr.title) + "</strong>" +
        '<label class="field"><span>' + esc(t("adminOrders.price")) + '</span><input name="price" type="number" min="1000" step="1000" value="' + esc(pr.price_kzt) + '"' + (isAdmin ? "" : " disabled") + "></label>" + (isAdmin ? '<button class="outline-button">' + esc(t("biz.save")) + "</button>" : "") + "</form>").join("")) +
      panel(t("adminOrders.title"), t("adminOrders.text"), d.items.length ? d.items.map(o => '<article class="invoice-card' + (o.status === "pending" && o.marked_paid_at ? " task-card overdue" : "") + '"><div class="invoice-top"><div><h3>' + esc(o.order_number) + " · " + esc(money(o.amount_kzt)) + "</h3><small>" + esc(o.buyer_name || "") + (o.buyer_email && o.buyer_email !== o.buyer_name ? " · " + esc(o.buyer_email) : "") + " · " + esc(o.product_title) + '</small></div><span class="pill">' + esc(I18N.label("orderStatus", o.status)) + "</span></div>" +
        (o.marked_paid_at ? "<p>" + esc(t("adminOrders.markedPaid", { date: date(o.marked_paid_at) })) + (o.payer_note ? " — " + esc(o.payer_note) : "") + "</p>" : "") +
        (o.buyer_is_member ? "" : '<p class="muted">' + esc(t("adminOrders.notMember")) + "</p>") +
        (o.status === "pending" ? '<div class="receipt-actions"><button class="primary-button" data-order-act="confirm" data-id="' + esc(o.id) + '">' + esc(t("adminOrders.confirm")) + '</button><button class="outline-button" data-order-act="cancel" data-id="' + esc(o.id) + '">' + esc(t("adminOrders.cancel")) + "</button></div>" : "") + "</article>").join("") : '<p class="muted">' + esc(t("adminOrders.empty")) + "</p>");
    content.querySelectorAll("[data-product]").forEach(form => form.addEventListener("submit", async e => {
      e.preventDefault();
      try { await api("/v1/admin/learning-products/" + encodeURIComponent(form.dataset.product), { method: "PATCH", body: JSON.stringify({ price_kzt: Number(new FormData(form).get("price")) }) }); await adminLearningOrders(); status(t("biz.saved")); } catch (x) { status(x.message, true); }
    }));
    content.querySelectorAll("[data-order-act]").forEach(b => b.addEventListener("click", async () => {
      try { await api("/v1/admin/learning-orders/" + encodeURIComponent(b.dataset.id) + "/" + b.dataset.orderAct, { method: "POST", body: JSON.stringify({}) }); await adminLearningOrders(); status(t(b.dataset.orderAct === "confirm" ? "adminOrders.confirmed" : "adminOrders.cancelled")); } catch (x) { status(x.message, true); }
    }));
  }

  // ---------- Lesson figures (charts and posters instead of video) ----------
  // Funnel stages: blues dark enough for white labels (contrast ≥ 4.5:1).
  const FUNNEL_BLUES = ["#0b3d82", "#0f4fa8", "#1258b8", "#1462cc", "#1468d8", "#1b6fd6"];
  const FIG_COLORS = ["#1877f2", "#e8710a", "#2e9e5b", "#9b51e0", "#d93f5c", "#0aa5b8", "#8a6d00"];
  const figNum = (v, unit) => unit === "₸" ? money(v) : (unit === "%" ? String(v).replace(".", ",") + "%" : Number(v).toLocaleString(I18N.getLocale() === "en" ? "en-US" : "ru-RU"));
  function renderFigure(f) {
    const items = Array.isArray(f.items) ? f.items : [];
    const summary = items.map(i => i.label + (i.value != null ? ": " + (typeof i.value === "number" ? figNum(i.value, f.unit) : i.value) : "")).join("; ");
    let body = "";
    if (f.type === "bars" || f.type === "funnel") {
      const max = Math.max(1, ...items.map(i => Number(i.value) || 0));
      body = '<div class="fig-rows fig-rows-' + f.type + '" role="img" aria-label="' + esc(f.title + ". " + summary) + '"><div aria-hidden="true">' + items.map((i, k) => {
        const w = Math.max(3, Math.round((Number(i.value) || 0) / max * 100));
        const conv = f.type === "funnel" && k > 0 && items[k - 1].value ? " · " + Math.round(i.value / items[k - 1].value * 100) + "%" : "";
        const color = f.type === "funnel" ? FUNNEL_BLUES[Math.min(k, FUNNEL_BLUES.length - 1)] : FIG_COLORS[k % FIG_COLORS.length];
        return '<div class="fig-row"><div class="fig-row-label">' + esc(i.label) + '</div><div class="fig-row-track"><span class="fig-row-bar" style="width:' + w + "%;background:" + color + '"></span></div><div class="fig-row-value">' + esc(figNum(i.value, f.unit) + conv) + "</div></div>";
      }).join("") + "</div></div>";
    } else if (f.type === "pie") {
      const total = items.reduce((a, i) => a + (Number(i.value) || 0), 0) || 1;
      let a0 = -Math.PI / 2;
      const arcs = items.map((i, k) => {
        const a1 = a0 + (Number(i.value) || 0) / total * Math.PI * 2;
        const large = a1 - a0 > Math.PI ? 1 : 0, r = 80, cx = 100, cy = 100;
        const d = "M" + (cx + r * Math.cos(a0)).toFixed(2) + " " + (cy + r * Math.sin(a0)).toFixed(2) + " A" + r + " " + r + " 0 " + large + " 1 " + (cx + r * Math.cos(a1 - 0.0001)).toFixed(2) + " " + (cy + r * Math.sin(a1 - 0.0001)).toFixed(2);
        a0 = a1;
        return '<path d="' + d + '" fill="none" stroke="' + FIG_COLORS[k % FIG_COLORS.length] + '" stroke-width="34"></path>';
      }).join("");
      body = '<div class="fig-pie"><svg class="fig-donut" viewBox="0 0 200 200" role="img" aria-label="' + esc(f.title + ". " + summary) + '">' + arcs + "</svg><ul class=\"fig-legend\">" +
        items.map((i, k) => '<li><span class="fig-dot" style="background:' + FIG_COLORS[k % FIG_COLORS.length] + '" aria-hidden="true"></span>' + esc(i.label) + " — <strong>" + Math.round((Number(i.value) || 0) / total * 100) + "%</strong></li>").join("") + "</ul></div>";
    } else if (f.type === "steps") {
      body = '<ol class="fig-steps">' + items.map(i => '<li><strong>' + esc(i.label) + "</strong>" + (i.text ? "<span>" + esc(i.text) + "</span>" : "") + "</li>").join("") + "</ol>";
    } else if (f.type === "compare") {
      const col = (side, cls) => '<div class="fig-col ' + cls + '"><h4>' + esc(side.title || "") + "</h4><ul>" + (side.points || []).map(x => "<li>" + esc(x) + "</li>").join("") + "</ul></div>";
      body = '<div class="fig-compare">' + col(f.left || {}, "left") + col(f.right || {}, "right") + "</div>";
    } else if (f.type === "table") {
      const cols = Array.isArray(f.columns) ? f.columns : [], rows = Array.isArray(f.rows) ? f.rows : [];
      body = '<div class="table-scroll"><table class="data-table fig-table"><thead><tr>' + cols.map(h => '<th scope="col">' + esc(h) + "</th>").join("") + "</tr></thead><tbody>" +
        rows.map(r => "<tr>" + r.map((v, k) => (k ? "<td>" : '<th scope="row">') + esc(v) + (k ? "</td>" : "</th>")).join("") + "</tr>").join("") + "</tbody></table></div>";
    } else if (f.type === "mistakes") {
      body = '<ul class="fig-mistakes">' + items.map(i => '<li><div class="fig-wrong"><span aria-hidden="true">✕</span><span class="sr-only">' + esc(t("fig.wrong")) + ": </span>" + esc(i.label) + '</div><div class="fig-right"><span aria-hidden="true">✓</span><span class="sr-only">' + esc(t("fig.right")) + ": </span>" + esc(i.text) + "</div></li>").join("") + "</ul>";
    } else if (f.type === "kpi") {
      body = '<div class="fig-kpis">' + items.map((i, k) => '<div class="fig-kpi" style="border-top-color:' + FIG_COLORS[k % FIG_COLORS.length] + '"><strong>' + esc(String(i.value)) + "</strong><span>" + esc(i.label) + "</span></div>").join("") + "</div>";
    } else return "";
    return '<figure class="lesson-figure fig-' + esc(f.type) + '"><figcaption class="fig-title">' + esc(f.title) + "</figcaption>" + body + (f.caption ? '<p class="muted fig-caption">' + esc(f.caption) + "</p>" : "") + "</figure>";
  }

  // ---------- Lesson test ----------
  function lessonQuizView(l, ex) {
    const box = document.querySelector("#lesson-quiz");
    const best = ex.best;
    box.innerHTML = '<section class="lesson-box quiz-box" aria-labelledby="quiz-title"><h3 id="quiz-title">' + esc(t("quiz.title")) + '</h3><p class="muted">' + esc(t("quiz.rules", { need: ex.pass_mark, total: ex.quiz.length })) + "</p>" +
      (best ? '<p class="demo-note">' + esc(t(best.passed ? "quiz.bestPassed" : "quiz.bestFailed", { correct: best.correct, total: best.total })) + "</p>" : "") +
      '<form id="quiz-form" class="app-form">' + ex.quiz.map((q, i) => '<fieldset class="quiz-q" data-q="' + i + '"><legend>' + (i + 1) + ". " + esc(q.question) + "</legend>" +
        q.options.map((o, k) => '<label class="quiz-option"><input type="radio" name="q' + i + '" value="' + k + '" required> <span>' + esc(o) + "</span></label>").join("") + '<p class="quiz-explain" hidden></p></fieldset>').join("") +
      '<button class="primary-button">' + esc(t("quiz.submit")) + '</button></form><div id="quiz-result" aria-live="polite"></div></section>';
    const form = box.querySelector("#quiz-form");
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(form);
      const answers = ex.quiz.map((_, i) => Number(f.get("q" + i)));
      try {
        const r = await api("/v1/learn/lessons/" + encodeURIComponent(l.id) + "/quiz", { method: "POST", body: JSON.stringify({ answers }) });
        r.results.forEach((res, i) => {
          const fs = form.querySelector('[data-q="' + i + '"]');
          fs.classList.toggle("right", res.correct); fs.classList.toggle("wrong", !res.correct);
          fs.querySelectorAll(".quiz-option").forEach((lab, k) => lab.classList.toggle("is-correct", k === res.correct_option));
          const ex2 = fs.querySelector(".quiz-explain");
          ex2.hidden = false;
          ex2.textContent = (res.correct ? "✓ " + t("quiz.right") : "✗ " + t("quiz.wrong", { answer: ex.quiz[i].options[res.correct_option] })) + (res.explanation ? " " + res.explanation : "");
        });
        const out = box.querySelector("#quiz-result");
        out.innerHTML = '<p class="demo-note quiz-score ' + (r.passed ? "passed" : "failed") + '"><strong>' + esc(t(r.passed ? "quiz.passed" : "quiz.failed", { correct: r.correct, total: r.total, need: r.pass_mark })) + "</strong></p>" +
          (r.passed ? (l.next_lesson_id ? '<button type="button" class="primary-button" data-go-lesson="' + esc(l.next_lesson_id) + '">' + esc(t("learn.next")) + "</button>" : '<button type="button" class="primary-button" id="quiz-to-course">' + esc(t("quiz.toCourse")) + "</button>")
            : '<button type="button" class="outline-button" id="quiz-retry">' + esc(t("quiz.retry")) + "</button>");
        out.querySelector("[data-go-lesson]")?.addEventListener("click", ev => { learnLesson = ev.currentTarget.dataset.goLesson; render("lesson"); window.scrollTo(0, 0); });
        out.querySelector("#quiz-to-course")?.addEventListener("click", () => render("course"));
        out.querySelector("#quiz-retry")?.addEventListener("click", () => { lessonQuizView(l, ex); document.querySelector("#quiz-title").scrollIntoView(); });
        status(t(r.passed ? "quiz.passedShort" : "quiz.failedShort"));
      } catch (x) { status(x.message, true); }
    });
  }

  // ---------- Course certificate ----------
  async function certificate() {
    if (!learnCourse) { active = "learn"; setHeading("learn"); return learn(); }
    let c;
    try { c = await api("/v1/learn/courses/" + encodeURIComponent(learnCourse) + "/certificate"); }
    catch (e) { if (e.code === "course_not_completed") { content.innerHTML = panel(t("cert.notYetTitle"), t("cert.notYet", { done: e.data?.done ?? 0, total: e.data?.total ?? 0 }), '<button type="button" class="primary-button" data-view="course">' + esc(t("cert.back")) + "</button>"); return; } throw e; }
    const day = new Date(c.completed_at || Date.now()).toLocaleDateString(I18N.getLocale() === "en" ? "en-GB" : (I18N.getLocale() === "kk" ? "kk-KZ" : "ru-RU"), { day: "numeric", month: "long", year: "numeric" });
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 560" class="cert-svg" role="img" aria-label="' + esc(t("cert.aria", { name: c.name, course: c.course_title })) + '">' +
      '<rect width="800" height="560" rx="24" fill="#ffffff"/><rect x="18" y="18" width="764" height="524" rx="16" fill="none" stroke="#1877f2" stroke-width="4"/>' +
      '<rect x="18" y="18" width="764" height="92" rx="16" fill="#1877f2"/><text x="400" y="76" text-anchor="middle" font-family="system-ui,Segoe UI,Arial" font-size="40" font-weight="700" fill="#fff">friends.</text>' +
      '<text x="400" y="170" text-anchor="middle" font-family="system-ui,Segoe UI,Arial" font-size="18" letter-spacing="4" fill="#65676b">' + esc(t("cert.heading").toUpperCase()) + "</text>" +
      '<text x="400" y="240" text-anchor="middle" font-family="system-ui,Segoe UI,Arial" font-size="40" font-weight="700" fill="#050505">' + esc(c.name) + "</text>" +
      '<text x="400" y="290" text-anchor="middle" font-family="system-ui,Segoe UI,Arial" font-size="18" fill="#65676b">' + esc(t("cert.completed")) + "</text>" +
      '<text x="400" y="336" text-anchor="middle" font-family="system-ui,Segoe UI,Arial" font-size="28" font-weight="700" fill="#1468d8">«' + esc(c.course_title) + "»</text>" +
      (c.score_pct != null ? '<text x="400" y="384" text-anchor="middle" font-family="system-ui,Segoe UI,Arial" font-size="18" fill="#050505">' + esc(t("cert.score", { pct: c.score_pct })) + "</text>" : "") +
      '<line x1="120" y1="456" x2="330" y2="456" stroke="#ced0d4"/><text x="225" y="482" text-anchor="middle" font-family="system-ui,Segoe UI,Arial" font-size="16" fill="#65676b">' + esc(day) + "</text>" +
      '<line x1="470" y1="456" x2="680" y2="456" stroke="#ced0d4"/><text x="575" y="482" text-anchor="middle" font-family="system-ui,Segoe UI,Arial" font-size="16" fill="#65676b">№ ' + esc(c.certificate_no) + "</text>" +
      '<text x="400" y="526" text-anchor="middle" font-family="system-ui,Segoe UI,Arial" font-size="13" fill="#65676b">' + esc(t("cert.footer")) + "</text></svg>";
    content.innerHTML = '<div class="cert-wrap">' + svg + '</div><div class="receipt-actions"><button type="button" class="primary-button" id="cert-download">' + esc(t("cert.download")) + "</button></div>";
    document.querySelector("#cert-download").addEventListener("click", async () => {
      const filename = "friends-certificate-" + c.certificate_no + ".svg";
      // Inside the Claude viewer files are saved through its downloads permission.
      try {
        const dl = window.claude && window.claude.use ? await window.claude.use("downloads") : null;
        if (dl) { await dl.save({ filename, data: new Blob([svg], { type: "image/svg+xml" }) }); return; }
      } catch (e) { if (e && e.code && e.code !== "unavailable") { status(t("cert.downloadFailed"), true); return; } }
      try {
        const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } catch { status(t("cert.downloadFailed"), true); }
    });
  }

  // ---------- Member pulse: monthly check-in, questions from Friends ----------
  const IN_APP_LINKS = { "/checkin": "checkin", "/polls": "polls", "/events": "events", "/business": "business", "/membership": "membership" };
  const HELP_TOPICS = ["sales", "marketing", "finance", "staff", "legal", "it", "other"];
  const monthName = period => { const [y, m] = String(period).split("-"); return t("month." + Number(m)).toLowerCase() + " " + y; };

  async function checkin() {
    const d = await api("/v1/me/checkin");
    if (!d.eligible) { content.innerHTML = panel(t("checkin.title", { month: monthName(d.period) }), t("checkin.needMembership"), ""); return; }
    const c = d.current || {};
    const radio = (name, value, label, checked) => '<label class="choice-card"><input type="radio" name="' + name + '" value="' + value + '" required' + (checked ? " checked" : "") + "> <span>" + esc(label) + "</span></label>";
    content.innerHTML = panel(t("checkin.title", { month: monthName(d.period) }), t(d.current ? "checkin.editText" : "checkin.text"),
      '<form id="checkin-form" class="app-form">' +
      '<fieldset class="plain-fieldset"><legend>' + esc(t("checkin.mood")) + '</legend><div class="choice-row">' + ["growing", "stable", "hard"].map(v => radio("business_mood", v, t("checkin.moodOpt." + v), c.business_mood === v)).join("") + "</div></fieldset>" +
      '<fieldset class="plain-fieldset"><legend>' + esc(t("checkin.helpQuestion")) + '</legend><div class="choice-row wrap">' + HELP_TOPICS.map(v => '<label class="choice-card"><input type="checkbox" name="help_topics" value="' + v + '"' + ((c.help_topics || []).includes(v) ? " checked" : "") + "> <span>" + esc(I18N.label("helpTopic", v)) + "</span></label>").join("") + "</div>" +
      area(t("checkin.helpText"), "help_text", c.help_text || "") + "</fieldset>" +
      '<fieldset class="plain-fieldset"><legend>' + esc(t("checkin.recommend")) + '</legend><div class="nps-scale">' + Array.from({ length: 11 }, (_, i) => '<label class="nps-option"><input type="radio" name="recommend_score" value="' + i + '" required' + (c.recommend_score === i ? " checked" : "") + '><span>' + i + "</span></label>").join("") +
      '</div><div class="nps-legend"><span>' + esc(t("checkin.npsLow")) + "</span><span>" + esc(t("checkin.npsHigh")) + "</span></div></fieldset>" +
      '<fieldset class="plain-fieldset"><legend>' + esc(t("feedback.renewQuestion")) + '</legend><div class="choice-row">' + ["yes", "maybe", "no"].map(v => radio("renew_intent", v, t("feedback.renew." + v), c.renew_intent === v)).join("") + "</div></fieldset>" +
      area(t("checkin.comment"), "comment", c.comment || "") + '<button class="primary-button">' + esc(t(d.current ? "checkin.update" : "checkin.send")) + "</button></form>" +
      (c.help_status && c.help_status !== "none" ? '<p class="demo-note">' + esc(t("checkin.helpStatus." + c.help_status)) + (c.help_note ? " " + esc(c.help_note) : "") + "</p>" : ""));
    document.querySelector("#checkin-form").addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      try {
        await api("/v1/me/checkin", { method: "POST", body: JSON.stringify({ business_mood: String(f.get("business_mood")), recommend_score: Number(f.get("recommend_score")), renew_intent: String(f.get("renew_intent")),
          help_topics: f.getAll("help_topics").map(String), help_text: String(f.get("help_text") || "").trim() || null, comment: String(f.get("comment") || "").trim() || null }) });
        content.innerHTML = panel(t("checkin.thanksTitle"), t(f.getAll("help_topics").length || String(f.get("help_text") || "").trim() ? "checkin.thanksHelp" : "checkin.thanks"), '<button type="button" class="primary-button" data-view="overview">' + esc(t("feedback.back")) + "</button>");
        status(t("checkin.sent"));
      } catch (x) { status(x.message, true); }
    });
  }

  async function polls() {
    const d = await api("/v1/polls");
    content.innerHTML = panel(t("polls.title"), t("polls.text"), d.items.length ? d.items.map(pl => '<form class="app-form poll-card" data-poll="' + esc(pl.id) + '"><h3>' + esc(pl.question) + "</h3>" +
      (pl.options ? pl.options.map((o, i) => '<label class="quiz-option"><input type="radio" name="option" value="' + i + '" required' + (pl.my_option === i ? " checked" : "") + "> <span>" + esc(o) + "</span></label>").join("")
        : '<label class="field"><span>' + esc(t("polls.yourAnswer")) + '</span><textarea name="text" rows="3" required maxlength="1000">' + esc(pl.my_text || "") + "</textarea></label>") +
      (pl.answered ? '<p class="muted">' + esc(t("polls.answered")) + "</p>" : "") + '<button class="primary-button">' + esc(t(pl.answered ? "polls.change" : "polls.send")) + "</button></form>").join("") : '<p class="muted">' + esc(t("polls.empty")) + "</p>");
    content.querySelectorAll("[data-poll]").forEach(form => form.addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(form);
      const body = f.has("option") ? { option_index: Number(f.get("option")) } : { answer_text: String(f.get("text") || "").trim() };
      try { await api("/v1/polls/" + encodeURIComponent(form.dataset.poll) + "/answer", { method: "POST", body: JSON.stringify(body) }); await polls(); status(t("polls.thanks")); } catch (x) { status(x.message, true); }
    }));
  }

  async function adminPulse() {
    const d = await api("/v1/admin/pulse" + (pulsePeriod ? "?period=" + pulsePeriod : ""));
    const nps = d.nps.score == null ? "—" : (d.nps.score > 0 ? "+" : "") + d.nps.score;
    const help = d.items.filter(x => x.help_status !== "none");
    const row = x => '<article class="invoice-card' + (x.help_status === "new" ? " task-card overdue" : "") + '"><div class="invoice-top"><div><h3>' + esc(x.name) + "</h3><small>" + esc(t("checkin.moodOpt." + x.business_mood)) + " · " + esc(t("pulse.scoreShort", { n: x.recommend_score })) + " · " + esc(t("feedback.renewShort." + x.renew_intent)) +
      (x.whatsapp ? ' · <a href="https://wa.me/' + esc(x.whatsapp.replace("+", "")) + '" target="_blank" rel="noopener noreferrer">WhatsApp</a>' : "") + '</small></div><span class="pill">' + esc(I18N.label("helpStatus", x.help_status)) + "</span></div>" +
      ((x.help_topics || []).length ? "<p><strong>" + esc(t("pulse.helpWith")) + ":</strong> " + esc(x.help_topics.map(v => I18N.label("helpTopic", v)).join(", ")) + "</p>" : "") + (x.help_text ? "<p>" + esc(x.help_text) + "</p>" : "") + (x.comment ? '<p class="muted">' + esc(x.comment) + "</p>" : "") +
      (x.help_status !== "none" ? '<form class="inline-form" data-help="' + esc(x.id) + '"><label class="field"><span>' + esc(t("adminRef.status")) + '</span><select name="help_status">' + ["new", "in_progress", "done"].map(v => option(v, I18N.label("helpStatus", v), v === x.help_status)).join("") + '</select></label><label class="field"><span>' + esc(t("pulse.note")) + '</span><input name="help_note" maxlength="1000" value="' + esc(x.help_note || "") + '"></label><button class="outline-button">' + esc(t("biz.save")) + "</button></form>" : "") + "</article>";
    content.innerHTML = '<form id="pulse-period" class="inline-form"><label class="field"><span>' + esc(t("pulse.month")) + '</span><input type="month" name="period" value="' + esc(d.period) + '"></label><button type="button" class="outline-button" id="pulse-send">' + esc(t("pulse.sendNow")) + "</button></form>" +
      '<div class="kpi-grid">' + statTile(t("pulse.responses"), d.responses + " / " + d.active_members, t("pulse.responsesHint")) + statTile(t("pulse.nps"), nps, t("pulse.npsHint", { p: d.nps.promoters, d: d.nps.detractors })) +
        statTile(t("stats.renewYes"), d.renew.yes, t("pulse.renewHint", { maybe: d.renew.maybe, no: d.renew.no })) + statTile(t("pulse.hard"), d.mood.hard, t("pulse.moodHint", { growing: d.mood.growing, stable: d.mood.stable })) + statTile(t("pulse.helpOpen"), d.help_open) + "</div>" +
      (d.trend.length ? panel(t("pulse.trend"), "", '<div class="table-scroll"><table class="data-table"><thead><tr><th>' + esc(t("pulse.month")) + '</th><th class="num">' + esc(t("pulse.responses")) + '</th><th class="num">' + esc(t("pulse.nps")) + "</th></tr></thead><tbody>" +
        d.trend.map(x => "<tr><td>" + esc(monthName(x.period)) + '</td><td class="num">' + x.responses + '</td><td class="num">' + (x.nps == null ? "—" : (x.nps > 0 ? "+" : "") + x.nps) + "</td></tr>").join("") + "</tbody></table></div>") : "") +
      panel(t("pulse.helpTitle"), t("pulse.helpText"), help.length ? help.map(row).join("") : '<p class="muted">' + esc(t("pulse.noHelp")) + "</p>") +
      panel(t("pulse.allTitle"), "", d.items.filter(x => x.help_status === "none").map(row).join("") || '<p class="muted">' + esc(t("pulse.noAnswers")) + "</p>");
    document.querySelector("#pulse-period input").addEventListener("change", e => { pulsePeriod = e.target.value || null; adminPulse().catch(x => status(x.message, true)); });
    document.querySelector("#pulse-send").addEventListener("click", async () => {
      try { const r = await api("/v1/admin/pulse/send", { method: "POST", body: JSON.stringify({}) }); status(t("pulse.sent", { n: r.sent, wa: r.whatsapp })); } catch (x) { status(x.message, true); }
    });
    content.querySelectorAll("[data-help]").forEach(form => form.addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(form);
      try { await api("/v1/admin/checkins/" + encodeURIComponent(form.dataset.help) + "/help", { method: "PATCH", body: JSON.stringify({ help_status: String(f.get("help_status")), help_note: String(f.get("help_note") || "").trim() || null }) }); await adminPulse(); status(t("biz.saved")); } catch (x) { status(x.message, true); }
    }));
  }
  let pulsePeriod = null;

  async function adminPolls() {
    const d = await api("/v1/admin/polls");
    content.innerHTML = panel(t("adminPolls.newTitle"), t("adminPolls.newText"), '<form id="poll-form" class="app-form">' + field(t("adminPolls.question"), "question", "", "text", 'required minlength="5" maxlength="300"') +
        '<label class="field"><span>' + esc(t("adminPolls.options")) + '</span><textarea name="options" rows="4" placeholder="' + esc(t("adminPolls.optionsHint")) + '"></textarea></label><button class="primary-button">' + esc(t("adminPolls.send")) + "</button></form>") +
      panel(t("adminPolls.results"), t("adminPolls.resultsText", { n: d.active_members }), d.items.length ? d.items.map(pl => {
        const total = Math.max(1, pl.responses);
        return '<article class="invoice-card"><div class="invoice-top"><div><h3>' + esc(pl.question) + "</h3><small>" + esc(t("adminPolls.responses", { n: pl.responses })) + " · " + esc(date(pl.created_at)) + '</small></div><span class="pill">' + esc(pl.status === "open" ? t("adminPolls.open") : t("adminPolls.closed")) + "</span></div>" +
          (pl.options ? '<div class="fig-rows"><div>' + pl.options.map((o, i) => '<div class="fig-row"><div class="fig-row-label">' + esc(o) + '</div><div class="fig-row-track"><span class="fig-row-bar" style="width:' + Math.round(pl.counts[i] / total * 100) + '%;background:#1877f2"></span></div><div class="fig-row-value">' + pl.counts[i] + "</div></div>").join("") + "</div></div>" : "") +
          (pl.texts.length ? '<ul class="poll-texts">' + pl.texts.map(x => "<li><strong>" + esc(x.name) + ":</strong> " + esc(x.text) + "</li>").join("") + "</ul>" : "") +
          (pl.status === "open" ? '<button type="button" class="outline-button" data-poll-close="' + esc(pl.id) + '">' + esc(t("adminPolls.close")) + "</button>" : "") + "</article>";
      }).join("") : '<p class="muted">' + esc(t("adminPolls.empty")) + "</p>");
    document.querySelector("#poll-form").addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const options = String(f.get("options") || "").split("\n").map(x => x.trim()).filter(Boolean);
      if (options.length === 1 || options.length > 6) { status(t("adminPolls.optionsInvalid"), true); return; }
      try { const r = await api("/v1/admin/polls", { method: "POST", body: JSON.stringify({ question: String(f.get("question")).trim(), options: options.length ? options : null }) }); await adminPolls(); status(t("adminPolls.sent", { n: r.sent, wa: r.whatsapp })); } catch (x) { status(x.message, true); }
    });
    content.querySelectorAll("[data-poll-close]").forEach(b => b.addEventListener("click", async () => {
      try { await api("/v1/admin/polls/" + encodeURIComponent(b.dataset.pollClose) + "/close", { method: "POST", body: JSON.stringify({}) }); await adminPolls(); status(t("biz.saved")); } catch (x) { status(x.message, true); }
    }));
  }

  // ---------- Сервисы: every section as a tile grid (Kaspi-style) ----------
  // ---------- Профиль: everything personal in one place (5th bottom tab) ----------
  const ME_GROUPS = [
    ["me.groupAccount", [["my-card", "star", "card.myTitle"], ["profile", "user", "nav.account"]]],
    ["me.groupCommunity", [["notifications", "bell"], ["checkin", "pen"], ["polls", "help"]]],
    ["me.groupApp", [["settings", "gear"]]]
  ];
  // Blogger cabinet: own funnel and bonus. Opens from the "me" page when a partner is linked to this account.
  // Anyone can become a partner in one step: name and surname, the phone they signed in with is their identity.
  async function partnerApply() {
    try { const have = await api("/v1/me/partner"); if (have && have.partner) { active = "blogger"; return blogger(); } } catch { /* not a partner yet */ }
    content.innerHTML = panel(t("partnerApply.title"), t("partnerApply.text"),
      '<form id="apply-form" class="app-form">' + field(t("partnerApply.first"), "first_name", profile?.display_name ? String(profile.display_name).split(" ")[0] : "", "text", 'required maxlength="40" autocomplete="given-name"') +
      field(t("partnerApply.last"), "last_name", profile?.display_name ? String(profile.display_name).split(" ").slice(1).join(" ") : "", "text", 'required maxlength="40" autocomplete="family-name"') +
      '<button class="primary-button">' + esc(t("partnerApply.go")) + "</button></form>");
    content.querySelector("#apply-form").addEventListener("submit", async e => {
      e.preventDefault(); const f = new FormData(e.currentTarget);
      try { await api("/v1/me/partner/apply", { method: "POST", body: JSON.stringify({ first_name: String(f.get("first_name")).trim(), last_name: String(f.get("last_name")).trim() }) }); status(t("partnerApply.done")); await render("blogger"); }
      catch (x) { status(x.code === "invalid_name" ? t("partnerApply.badName") : x.message, true); }
    });
  }

  async function blogger() {
    let d;
    try { d = await api("/v1/me/partner"); } catch (e) { content.innerHTML = panel(t("blogger.title"), t("blogger.none"), ""); return; }
    const p = d.partner, kpi = (label, v) => '<div class="stat-card"><p>' + esc(label) + "</p><strong>" + esc(String(v)) + "</strong></div>";
    const link = SITE_URL + "/" + encodeURIComponent(p.code), linkKk = SITE_URL + "/kk/?ref=" + encodeURIComponent(p.code);
    const st = s => t("blogger.status." + s);
    const rows = d.items.map(r => "<tr><td>" + esc(r.first_name || "") + "</td><td>" + esc(r.phone_masked) + "</td><td>" + esc(st(r.status)) + (r.status === "trial" ? " " + esc(day(r.trial_until)) : "") + "</td><td>" + esc(day(r.created_at)) + "</td><td class=\"num\">" + (Number(r.bonus_kzt) ? esc(money(r.bonus_kzt)) : "") + "</td></tr>").join("");
    content.innerHTML = panel(t("blogger.title"), t("blogger.text", { name: p.name }),
      '<div class="stats-grid">' + kpi(t("blogger.visits"), p.visits_30d) + kpi(t("blogger.signups"), p.signups) + kpi(t("blogger.trials"), p.trials_active) + kpi(t("blogger.paid"), p.paid_users) + "</div>" +
      '<div class="stats-grid">' + kpi(t("blogger.due"), money(p.bonus_due_kzt)) + kpi(t("blogger.paidOut"), money(p.bonus_paid_kzt)) + "</div>" +
      '<p class="muted">' + esc(Array.isArray(p.renewal_tiers) && p.renewal_tiers.length ? t("blogger.termsTiers", { days: p.trial_days, first: Number(p.first_bonus_pct), tiers: p.renewal_tiers.map(Number).join("% → ") + "%" }) : t("blogger.terms", { days: p.trial_days, first: Number(p.first_bonus_pct), renewal: Number(p.renewal_bonus_pct), months: p.renewal_months })) + "</p>" +
      '<div class="copy-row"><input readonly value="' + esc(link) + '" aria-label="' + esc(t("blogger.linkRu")) + '"><button type="button" class="outline-button" data-copy-link="' + esc(link) + '">' + esc(t("adminPartners.copy")) + "</button></div>" +
      '<div class="copy-row"><input readonly value="' + esc(linkKk) + '" aria-label="' + esc(t("blogger.linkKk")) + '"><button type="button" class="outline-button" data-copy-link="' + esc(linkKk) + '">' + esc(t("adminPartners.copy")) + "</button></div>" +
      '<div class="table-scroll"><table class="data-table"><thead><tr><th>' + esc(t("blogger.name")) + "</th><th>" + esc(t("blogger.phone")) + "</th><th>" + esc(t("blogger.state")) + "</th><th>" + esc(t("blogger.date")) + '</th><th class="num">' + esc(t("blogger.bonus")) + "</th></tr></thead><tbody>" + (rows || '<tr><td colspan="5">' + esc(t("blogger.empty")) + "</td></tr>") + "</tbody></table></div>");
    content.querySelectorAll("[data-copy-link]").forEach(b => b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(b.dataset.copyLink); status(t("tests.copied")); } catch { /* manual copy */ } }));
  }

  async function me() {
    const mem = await api("/v1/me/membership").catch(() => ({ membership: null }));
    const m = mem.membership;
    const hasPartner = APP === "admin" ? false : await api("/v1/me/partner").then(() => true, () => false);
    const listed = new Set(ME_GROUPS.flatMap(g => g[1].map(x => x[0])).concat(["overview", "business", "card", "learn", "me", "services", "events", "experts", "members", "announcements", "tests", "deals", "discounts", "partner"]));
    const extra = [...document.querySelectorAll(".sidebar nav .nav-item[data-view]:not([hidden]), .sidebar nav a[data-crm-link]")].filter(el => !listed.has(el.dataset.view) && !(APP === "pilot" && el.hasAttribute("data-admin-item")));
    const row = (view, icon, label) => '<button type="button" class="me-row" data-view="' + view + '"><span class="me-ic">' + ic(icon) + "</span><span>" + esc(t(label || "nav." + view)) + '</span><span class="me-go">' + ic("chevron") + "</span></button>";
    const name = profile?.display_name || user?.email || "";
    const sub = !m ? t("settings.subNone") : m.active ? (m.ends_at ? t("me.subUntil", { date: day(m.ends_at) }) : t("settings.subActive")) : t("settings.subExpired", { date: m.ends_at ? day(m.ends_at) : "—" });
    content.innerHTML = '<section class="me-head"><div class="member-avatar big" aria-hidden="true">' + esc((name || "?").slice(0, 1).toUpperCase()) + '</div><div><h2>' + esc(name) + '</h2><p class="muted">' + esc(user?.email || "") + '</p><span class="pill">' + esc(sub) + "</span></div></section>" +
      (APP === "pilot" ? pilotModeCard() : "") +
      (APP === "admin" ? "" : '<section class="me-group"><div class="me-list"><a class="me-row" href="' + esc(WA_URL) + '" target="_blank" rel="noopener noreferrer"><span class="me-ic">' + ic("chat") + "</span><span>" + esc(t("wa.writeUs")) + '</span><span class="me-go">›</span></a></div></section>') +
      (hasPartner ? '<section class="me-group"><div class="me-list"><button type="button" class="me-row" data-view="blogger"><span class="me-ic">' + ic("megaphone") + "</span><span>" + esc(t("blogger.title")) + '</span><span class="me-go">›</span></button></div></section>' : (APP === "admin" ? "" : '<section class="me-group"><div class="me-list"><button type="button" class="me-row" data-view="partner-apply"><span class="me-ic">' + ic("megaphone") + "</span><span>" + esc(t("partnerApply.tile")) + '</span><span class="me-go">›</span></button></div></section>')) +
      ME_GROUPS.map(([title, list]) => '<section class="me-group"><h3>' + esc(t(title)) + '</h3><div class="me-list">' + list.map(([v, i, l]) => row(v, i, l)).join("") + "</div></section>").join("") +
      (extra.length ? '<section class="me-group"><h3>' + esc(t("services.more")) + '</h3><div class="me-list" id="me-extra"></div></section>' : "") +
      '<div class="receipt-actions"><button type="button" class="outline-button" id="me-logout">' + ic("logout", "ic-inline") + " " + esc(t("auth.logout")) + "</button></div>";
    const box = document.querySelector("#me-extra");
    extra.forEach(el => {
      const c2 = el.cloneNode(true);
      c2.className = "me-row";
      c2.removeAttribute("data-primary");
      const icn = c2.querySelector("span[aria-hidden]");
      if (icn) icn.className = "me-ic";
      box.appendChild(c2);
    });
    I18N.applyStatic(content);
    document.querySelector("#me-logout").addEventListener("click", logout);
    wirePilotMode();
  }
  const services = me;

  // ---------- Demo / pilot: switch between the resident app and the admin app ----------
  const pilotMode = () => store.get("friends.pilotMode") === "admin" ? "admin" : "resident";
  function pilotModeCard() {
    return '<section class="mode-card"><p class="eyebrow">' + esc(t("mode.title")) + '</p><p class="muted">' + esc(t("mode.text")) + '</p><div class="seg" role="group" aria-label="' + esc(t("mode.title")) + '">' +
      ["resident", "admin"].map(x => '<button type="button" class="seg-btn' + (pilotMode() === x ? " active" : "") + '" data-pilot-mode="' + x + '" aria-pressed="' + (pilotMode() === x) + '">' + esc(t("mode." + x)) + "</button>").join("") + "</div></section>";
  }
  function wirePilotMode() {
    document.querySelectorAll("[data-pilot-mode]").forEach(b => b.addEventListener("click", () => { closeMenu(); store.set("friends.pilotMode", b.dataset.pilotMode); applyPilotMode(); render(b.dataset.pilotMode === "admin" ? "admin-stats" : "me"); }));
  }
  const ADMIN_PRIMARY = ["admin-stats", "admin-referrals", "admin", "events-admin"];
  function applyPilotMode() {
    if (APP !== "pilot") return;
    const admin = pilotMode() === "admin";
    document.body.dataset.mode = pilotMode();
    const nav = document.querySelector(".sidebar nav");
    if (!nav) return;
    nav.querySelectorAll(".nav-item[data-view]").forEach(b => {
      const isAdmin = b.hasAttribute("data-admin-item") || ADMIN_VIEWS.includes(b.dataset.view);
      b.hidden = admin ? !isAdmin : isAdmin;
      if (!b.dataset.primaryHome) b.dataset.primaryHome = b.hasAttribute("data-primary") ? "1" : "0";
      const primary = admin ? ADMIN_PRIMARY.includes(b.dataset.view) : b.dataset.primaryHome === "1";
      if (primary) b.setAttribute("data-primary", ""); else b.removeAttribute("data-primary");
    });
    let more = nav.querySelector(".nav-more");
    if (admin && !more) {
      more = document.createElement("button");
      more.type = "button"; more.className = "nav-item nav-more";
      more.innerHTML = '<span aria-hidden="true">' + ic("grid") + '</span> <span>' + esc(t("nav.more")) + "</span>";
      nav.appendChild(more);
    }
    if (more) more.hidden = !admin;
  }
  applyPilotMode();

  // ---------- Сообщения: group chats by direction + notifications ----------
  let chatRoom = null, chatTimer = null, chatLastId = null;
  async function refreshMessageBadge() {
    const badge = document.querySelector("#msg-badge");
    if (!badge) return;
    try {
      const [c2, n] = await Promise.all([api("/v1/chats").catch(() => ({ unread_total: 0 })), api("/v1/me/notifications?limit=1").catch(() => ({ unread_count: 0 }))]);
      const total = (c2.unread_total || 0) + (n.unread_count || 0);
      badge.hidden = !total;
      badge.textContent = total > 99 ? "99+" : String(total);
      badge.setAttribute("aria-label", t("messages.unread", { n: total }));
    } catch { /* badge is optional */ }
  }
  async function messages() {
    const d = await api("/v1/chats");
    const q = d.quota || {};
    const row = r => '<button type="button" class="chat-row" data-chat="' + esc(r.id) + '"><span class="chat-avatar" aria-hidden="true">' + esc((r.name || "?").slice(0, 1)) + '</span><span class="chat-main"><strong>' + esc(r.name) + "</strong><small>" +
      esc(r.last_message && r.last_message.body ? (r.last_message.author ? r.last_message.author + ": " : "") + r.last_message.body : (r.description || t("messages.noMessages"))) + "</small></span>" +
      (r.unread ? '<span class="chat-unread">' + r.unread + "</span>" : !r.joined && r.can_join ? '<span class="pill">' + esc(t("messages.open")) + "</span>" : "") + "</button>";
    const pinned = d.items.filter(r => r.room_type === "main");
    const rest = d.items.filter(r => r.room_type !== "main");
    const groups = [["news", r => r.room_type === "advertising"], ["city", r => r.room_type === "city"], ["sports", r => r.room_type === "sports"], ["topic", r => !["advertising", "city", "sports"].includes(r.room_type)]];
    const quota = q.limit == null ? (q.plan === "premium" ? '<p class="demo-note">' + esc(t("messages.quotaPremium")) + "</p>" : "")
      : '<p class="demo-note">' + esc(t("messages.quota", { used: q.used, limit: q.limit })) + (q.limit < 3 ? " " + esc(t("messages.quotaUpgradeTrial")) : " " + esc(t("messages.quotaUpgrade"))) + "</p>";
    content.innerHTML = quota + (pinned.length ? '<div class="chat-list chat-pinned">' + pinned.map(row).join("") + "</div>" : "") +
      groups.map(([k, f]) => { const mine = rest.filter(f).filter(r => r.joined), open = rest.filter(f).filter(r => !r.joined);
        return mine.length || open.length ? panel(t("messages.group." + k), "", '<div class="chat-list">' + mine.concat(open).map(row).join("") + "</div>") : ""; }).join("") +
      (d.items.length ? "" : panel(t("nav.messages"), t("messages.empty"), ""));
    content.querySelectorAll("[data-chat]").forEach(b => b.addEventListener("click", () => { chatRoom = b.dataset.chat; render("chat"); }));
  }
  const linkify = text => esc(text).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g, u => '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + "</a>");
  const fileSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
  const attachHtml = a => {
    const url = esc((apiBase || "") + a.url);
    if (a.kind === "image") return '<a class="msg-img" href="' + url + '" target="_blank" rel="noopener noreferrer"><img src="' + url + '" alt="' + esc(a.name) + '" loading="lazy"></a>';
    if (a.kind === "video") return '<video class="msg-video" controls preload="metadata" playsinline src="' + url + '"></video>';
    return '<a class="msg-file" href="' + url + '" target="_blank" rel="noopener noreferrer">' + ic("file", "ic-inline") + '<span><strong>' + esc(a.name) + "</strong><small>" + esc(fileSize(a.size)) + "</small></span></a>";
  };
  const bubble = m => '<div class="msg' + (m.mine ? " mine" : "") + '" data-msg="' + esc(m.id) + '">' + (m.mine ? "" : '<strong class="msg-author">' + esc(m.author) + "</strong>") +
    (m.deleted ? '<em class="muted">' + esc(t("messages.deleted")) + "</em>" : (m.attachments || []).map(attachHtml).join("") + (m.body ? "<p>" + linkify(m.body) + "</p>" : "")) + '<small>' + esc(new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })) + "</small></div>";
  const EMOJI = "😀 😁 😂 🤣 😊 😍 😘 😎 🤔 😅 😉 🙏 👍 👏 🙌 💪 🔥 ✨ 🎉 ❤️ 💯 ✅ 👌 🤝 🚀 💡 📈 💰 ☕ 🌟 😢 😮 🙈 🤷 👋 🎯 📌 📎 🏆 🎁".split(" ");
  /** Photos are shrunk on the phone before upload (max 1600 px), everything else goes as it is. */
  async function prepareUpload(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || !window.createImageBitmap) return file;
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise(res => c.toBlob(res, "image/jpeg", 0.82));
      return blob ? new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
    } catch { return file; }
  }
  async function chat() {
    if (!chatRoom) { active = "messages"; setHeading("messages"); return messages(); }
    const d = await api("/v1/chats/" + encodeURIComponent(chatRoom) + "/messages");
    const r = d.room;
    chatLastId = d.items.length ? d.items.at(-1).id : null;
    content.innerHTML = '<div class="chat-head"><h2>' + esc(r.name) + "</h2>" + (r.description ? '<p class="muted">' + esc(r.description) + "</p>" : "") + "</div>" +
      '<div class="chat-log" id="chat-log" role="log" aria-live="polite" aria-label="' + esc(r.name) + '">' + (d.items.length ? d.items.map(bubble).join("") : '<p class="muted">' + esc(t("messages.first")) + "</p>") + "</div>" +
      (r.can_post ? '<div id="chat-pending" class="chat-pending" hidden></div><div id="emoji-panel" class="emoji-panel" hidden>' + EMOJI.map(e => '<button type="button" data-emoji="' + e + '">' + e + "</button>").join("") + '</div><form id="chat-form" class="chat-form"><input type="file" id="chat-file" hidden multiple accept="image/*,video/mp4,video/quicktime,application/pdf,.docx,.xlsx,.pptx"><button type="button" class="icon-button" id="chat-attach" aria-label="' + esc(t("chat.attach")) + '">' + ic("attach") + '</button><button type="button" class="icon-button" id="chat-emoji" aria-label="' + esc(t("chat.emoji")) + '">' + ic("smile") + '</button><label class="sr-only" for="chat-input">' + esc(t("messages.write")) + '</label><textarea id="chat-input" name="body" rows="1" maxlength="2000" placeholder="' + esc(t("messages.write")) + '"></textarea><button class="primary-button">' + esc(t("messages.send")) + "</button></form>"
        : r.can_join ? '<button type="button" class="primary-button" id="chat-join">' + esc(t("messages.join")) + "</button>"
        : '<p class="muted chat-readonly">' + esc(t(r.status === "active" ? "messages.readOnlyPolicy" : "messages.readOnly")) + "</p>");
    const log = document.querySelector("#chat-log");
    log.scrollTop = log.scrollHeight;
    document.querySelector("#chat-join")?.addEventListener("click", async () => {
      try { await api("/v1/chats/" + encodeURIComponent(chatRoom) + "/join", { method: "POST", body: "{}" }); await chat(); status(t("messages.joined")); } catch (x) { status(x.message, true); }
    });
    const form = document.querySelector("#chat-form");
    if (form) {
      const input = form.querySelector("textarea");
      input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
      const pending = []; // files chosen but not yet sent
      const pendingBox = document.querySelector("#chat-pending"), emojiBox = document.querySelector("#emoji-panel"), fileInput = document.querySelector("#chat-file");
      const drawPending = () => { pendingBox.hidden = !pending.length; pendingBox.innerHTML = pending.map((f, i) => '<span class="pending-chip">' + esc(f.name) + ' <button type="button" data-rm="' + i + '" aria-label="' + esc(t("chat.remove")) + '">×</button></span>').join(""); pendingBox.querySelectorAll("[data-rm]").forEach(b => b.addEventListener("click", () => { pending.splice(Number(b.dataset.rm), 1); drawPending(); })); };
      document.querySelector("#chat-attach").addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", () => { for (const f of fileInput.files) { if (f.size > 40 * 1048576) { status(t("chat.tooLarge"), true); continue; } if (pending.length < 5) pending.push(f); } fileInput.value = ""; drawPending(); });
      document.querySelector("#chat-emoji").addEventListener("click", () => { emojiBox.hidden = !emojiBox.hidden; });
      emojiBox.addEventListener("click", e => { const b = e.target.closest("[data-emoji]"); if (!b) return; const p = input.selectionStart ?? input.value.length; input.value = input.value.slice(0, p) + b.dataset.emoji + input.value.slice(input.selectionEnd ?? p); input.focus(); input.setSelectionRange(p + b.dataset.emoji.length, p + b.dataset.emoji.length); });
      form.addEventListener("submit", async e => {
        e.preventDefault();
        const body = input.value.trim();
        if (!body && !pending.length) return;
        const send = form.querySelector(".primary-button"); send.disabled = true;
        try {
          const ids = [];
          for (const f of pending) {
            const small = await prepareUpload(f);
            const fd = new FormData(); fd.append("file", small, small.name);
            const up = await api("/v1/chats/" + encodeURIComponent(chatRoom) + "/upload", { method: "POST", body: fd });
            ids.push(up.id);
          }
          await api("/v1/chats/" + encodeURIComponent(chatRoom) + "/messages", { method: "POST", body: JSON.stringify({ body, ...(ids.length ? { attachments: ids } : {}) }) });
          input.value = ""; pending.length = 0; drawPending(); emojiBox.hidden = true; await pollChat(); input.focus();
        } catch (x) { status(x.message, true); } finally { send.disabled = false; }
      });
    }
    clearInterval(chatTimer);
    chatTimer = setInterval(() => { if (active === "chat") pollChat().catch(() => {}); else clearInterval(chatTimer); }, 4000);
  }
  async function pollChat() {
    const log = document.querySelector("#chat-log");
    if (!log || !chatRoom) return;
    const d = await api("/v1/chats/" + encodeURIComponent(chatRoom) + "/messages" + (chatLastId ? "?after_id=" + encodeURIComponent(chatLastId) : ""));
    if (!d.items.length) return;
    if (!chatLastId) log.innerHTML = "";
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    log.insertAdjacentHTML("beforeend", d.items.filter(m => !log.querySelector('[data-msg="' + m.id + '"]')).map(bubble).join(""));
    chatLastId = d.items.at(-1).id;
    if (atBottom) log.scrollTop = log.scrollHeight;
  }

  async function adminChats() {
    const d = await api("/v1/admin/chats");
    content.innerHTML = panel(t("adminChats.newTitle"), t("adminChats.newText"), '<form id="room-form" class="app-form">' + field(t("adminChats.name"), "name", "", "text", 'required minlength="2" maxlength="80"') + field(t("adminChats.description"), "description", "", "text", 'maxlength="300"') +
        '<label class="field"><span>' + esc(t("adminChats.visibility")) + '</span><select name="visibility">' + option("all_members", t("adminChats.vis.all_members"), true) + option("invite_only", t("adminChats.vis.invite_only"), false) + "</select></label>" +
        '<label class="field"><span>' + esc(t("adminChats.posting")) + '</span><select name="posting_policy">' + option("members", t("adminChats.post.members"), true) + option("moderators_only", t("adminChats.post.moderators_only"), false) + "</select></label>" +
        '<button class="primary-button">' + esc(t("adminChats.create")) + "</button></form>") +
      panel(t("adminChats.listTitle"), "", d.items.length ? d.items.map(r => '<article class="invoice-card"><div class="invoice-top"><div><h3>' + esc(r.name) + "</h3><small>" + esc(t("adminChats.vis." + r.visibility)) + " · " + esc(t("adminChats.post." + r.posting_policy)) + " · " + esc(t("adminChats.stats", { members: r.member_count, msgs: r.messages_7d })) + '</small></div><span class="pill">' + esc(t("adminChats.status." + r.status)) + "</span></div>" +
        '<form class="inline-form" data-room-member="' + esc(r.id) + '"><label class="field"><span>' + esc(t("adminChats.addEmail")) + '</span><input name="email" type="email" required></label><label class="field"><span>' + esc(t("adminStaff.role")) + '</span><select name="role">' + option("member", t("adminChats.role.member"), true) + option("moderator", t("adminChats.role.moderator"), false) + '</select></label><button class="outline-button">' + esc(t("adminChats.add")) + "</button></form>" +
        '<div class="receipt-actions">' + (r.status !== "archived" ? '<button type="button" class="outline-button" data-room-status="archived" data-id="' + esc(r.id) + '">' + esc(t("adminChats.archive")) + "</button>" : '<button type="button" class="outline-button" data-room-status="active" data-id="' + esc(r.id) + '">' + esc(t("adminChats.restore")) + "</button>") + "</div></article>").join("") : '<p class="muted">' + esc(t("adminChats.empty")) + "</p>");
    document.querySelector("#room-form").addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      try { await api("/v1/admin/chats", { method: "POST", body: JSON.stringify({ name: String(f.get("name")).trim(), description: String(f.get("description") || "").trim() || null, visibility: String(f.get("visibility")), posting_policy: String(f.get("posting_policy")) }) }); await adminChats(); status(t("adminChats.created")); } catch (x) { status(x.message, true); }
    });
    content.querySelectorAll("[data-room-member]").forEach(form => form.addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(form);
      try { await api("/v1/admin/chats/" + encodeURIComponent(form.dataset.roomMember) + "/members", { method: "POST", body: JSON.stringify({ email: String(f.get("email")).trim(), role: String(f.get("role")) }) }); form.reset(); status(t("adminChats.added")); } catch (x) { status(x.message, true); }
    }));
    content.querySelectorAll("[data-room-status]").forEach(b => b.addEventListener("click", async () => {
      try { await api("/v1/admin/chats/" + encodeURIComponent(b.dataset.id), { method: "PATCH", body: JSON.stringify({ status: b.dataset.roomStatus }) }); await adminChats(); status(t("biz.saved")); } catch (x) { status(x.message, true); }
    }));
  }

  // ---------- Тесты: self-assessments and hiring tests (content in ru/kk/en) ----------
  const tx = o => (o && (o[I18N.getLocale()] || o.ru)) || "";
  let testSlug = null, testResult = null;
  const LIKERT = [1, 2, 3, 4, 5];
  function resultHtml(r, opts = {}) {
    const bar = s => '<div class="fig-row"><div class="fig-row-label">' + esc(tx(s.title)) + (r.top.includes(s.id) && s.band === "high" ? ' <span class="pill top-pill">' + esc(t("tests.top")) + "</span>" : "") + '</div><div class="fig-row-track"><span class="fig-row-bar" style="width:' + Math.max(3, s.score) + "%;background:" + (s.band === "high" ? "#2e9e5b" : s.band === "low" ? "#d93f5c" : "#1877f2") + '"></span></div><div class="fig-row-value">' + s.score + (s.total != null ? "% · " + s.correct + "/" + s.total : "%") + "</div></div>";
    const sorted = [...r.scales].sort((a, b) => b.score - a.score);
    return (r.overall != null ? '<div class="kpi-grid">' + statTile(t("tests.overall"), r.overall + "%") + "</div>" : "") +
      '<figure class="lesson-figure"><figcaption class="fig-title">' + esc(t("tests.profile")) + '</figcaption><div class="fig-rows" role="img" aria-label="' + esc(sorted.map(s => tx(s.title) + " " + s.score + "%").join("; ")) + '"><div aria-hidden="true">' + sorted.map(bar).join("") + "</div></div></figure>" +
      '<div class="test-scales">' + sorted.map(s => '<section class="lesson-box' + (r.top.includes(s.id) && s.band === "high" ? " top-scale" : "") + '"><h3>' + esc(tx(s.title)) + " · " + s.score + "%</h3><p>" + esc(tx(s.text)) + "</p></section>").join("") + "</div>" +
      (opts.review && r.review ? '<details class="lesson-box"><summary>' + esc(t("tests.review")) + "</summary><ol>" + r.review.map(q => "<li><p>" + esc(tx(q.text)) + "</p><p class=\"" + (q.answer === q.correct ? "good-text" : "warn-text") + '">' + esc(t("tests.answered")) + ": " + esc(tx(q.options[q.answer])) + (q.answer === q.correct ? " ✓" : " ✕ · " + esc(t("tests.correctIs")) + ": " + esc(tx(q.options[q.correct]))) + "</p>" + (q.explanation ? '<p class="muted">' + esc(tx(q.explanation)) + "</p>" : "") + "</li>").join("") + "</ol></details>" : "") +
      '<p class="muted test-disclaimer">' + esc(tx(r.disclaimer)) + "</p>";
  }
  function runnerHtml(test, extraTop = "") {
    const q = (it, i) => {
      const legend = '<legend><span class="test-num">' + (i + 1) + "/" + test.items.length + "</span> " + esc(tx(it.text)) + "</legend>";
      const opts = test.kind === "likert"
        ? '<div class="likert">' + LIKERT.map(v => '<label class="likert-opt"><input type="radio" name="a' + i + '" value="' + v + '" required><span>' + esc(t("tests.likert" + v)) + "</span></label>").join("") + "</div>"
        : it.options.map((o, k) => '<label class="quiz-option"><input type="radio" name="a' + i + '" value="' + k + '" required> <span>' + esc(tx(o)) + "</span></label>").join("");
      return '<fieldset class="quiz-q test-q">' + legend + opts + "</fieldset>";
    };
    return '<section class="lesson-box"><p class="eyebrow">' + esc(t(test.audience === "hiring" ? "tests.hiring" : "tests.self")) + "</p><h2>" + esc(tx(test.title)) + "</h2><p>" + esc(tx(test.description)) + '</p><p class="muted">' + esc(t("tests.meta", { n: test.item_count, minutes: test.minutes })) + "</p>" +
      (test.kind === "choice" ? '<p class="demo-note">' + esc(t("tests.choiceHint")) + "</p>" : "") + "</section>" + extraTop +
      '<form id="test-form" class="app-form test-form"><div class="test-progress learn-progress" aria-hidden="true"><span id="test-bar" style="width:0%"></span></div><small id="test-count" aria-live="polite">' + esc(t("tests.progress", { done: 0, total: test.items.length })) + "</small>" +
      test.items.map(q).join("") + '<div id="test-extra"></div><button class="primary-button">' + esc(t("tests.finish")) + '</button><p class="muted test-disclaimer">' + esc(tx(test.disclaimer)) + "</p></form>";
  }
  function wireRunner(test, onSubmit) {
    const form = document.querySelector("#test-form");
    const update = () => {
      const done = test.items.filter((_, i) => form.querySelector('input[name="a' + i + '"]:checked')).length;
      document.querySelector("#test-bar").style.width = Math.round(done / test.items.length * 100) + "%";
      document.querySelector("#test-count").textContent = t("tests.progress", { done, total: test.items.length });
    };
    form.addEventListener("change", update);
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(form);
      const answers = test.items.map((_, i) => Number(f.get("a" + i)));
      const btn = form.querySelector("button.primary-button");
      btn.disabled = true;
      try { await onSubmit(answers, f); } catch (x) { status(x.message, true); btn.disabled = false; }
    });
  }

  async function tests() {
    const [d, inv] = await Promise.all([api("/v1/tests"), api("/v1/tests/invites").catch(() => ({ items: [] }))]);
    const card = x => '<article class="invoice-card test-card"><div class="invoice-top"><div><span class="pill">' + esc(t("tests.meta", { n: x.item_count, minutes: x.minutes })) + "</span><h3>" + esc(tx(x.title)) + "</h3></div></div><p>" + esc(tx(x.description)) + "</p>" +
      (x.last ? '<p class="demo-note">' + esc(t("tests.lastAt", { date: date(x.last.created_at) })) + (x.last.overall != null ? " · " + x.last.overall + "%" : "") + "</p>" : "") +
      '<div class="receipt-actions"><button type="button" class="' + (x.audience === "hiring" ? "outline-button" : "primary-button") + '" data-test="' + esc(x.slug) + '">' + esc(t(x.audience === "hiring" ? "tests.tryYourself" : x.last ? "tests.retake" : "tests.start")) + "</button>" +
      (x.audience === "hiring" ? '<button type="button" class="primary-button" data-invite="' + esc(x.slug) + '">' + esc(t("tests.sendCandidate")) + "</button>" : "") + "</div></article>";
    const self = d.items.filter(x => x.audience === "self"), hiring = d.items.filter(x => x.audience === "hiring");
    const invRow = i => '<article class="invoice-card"><div class="invoice-top"><div><h3>' + esc(i.candidate_name) + (i.position ? " · " + esc(i.position) : "") + "</h3><small>" + esc(tx(i.test_title)) + " · " + esc(date(i.created_at)) + '</small></div><span class="pill">' + esc(t("tests.status." + i.status)) + "</span></div>" +
      (i.result ? '<details><summary>' + esc(t("tests.showResult")) + (i.result.overall != null ? " · " + i.result.overall + "%" : "") + "</summary>" + resultHtml(i.result, { review: true }) + "</details>" : "") +
      '<div class="receipt-actions"><button type="button" class="text-button" data-invite-del="' + esc(i.id) + '">' + esc(t("tests.deleteInvite")) + "</button></div></article>";
    content.innerHTML = panel(t("tests.selfTitle"), t("tests.selfText"), '<div class="course-grid">' + self.map(card).join("") + "</div>") +
      panel(t("tests.hiringTitle"), t("tests.hiringText"), '<div class="course-grid">' + hiring.map(card).join("") + "</div>" + '<div id="invite-box"></div>') +
      (inv.items.length ? panel(t("tests.invitesTitle"), t("tests.invitesText"), inv.items.map(invRow).join("")) : "") +
      panel(t("tests.moreTitle"), t("tests.moreText"), '<ul class="tests-more">' + ["mbti", "gallup", "disc", "belbin", "eq", "iq", "motivation", "leadership", "stress", "values"].map(k => "<li>" + esc(t("tests.more." + k)) + "</li>").join("") + "</ul>");
    content.querySelectorAll("[data-test]").forEach(b => b.addEventListener("click", () => { testSlug = b.dataset.test; testResult = null; render("test"); }));
    content.querySelectorAll("[data-invite]").forEach(b => b.addEventListener("click", () => {
      const x = d.items.find(y => y.slug === b.dataset.invite);
      const box = document.querySelector("#invite-box");
      box.innerHTML = '<form id="invite-form" class="app-form lesson-box"><h3>' + esc(t("tests.inviteTitle", { test: tx(x.title) })) + "</h3>" + field(t("tests.candidate"), "candidate_name", "", "text", 'required maxlength="120"') + field(t("tests.position"), "position", "", "text", 'maxlength="120"') +
        '<button class="primary-button">' + esc(t("tests.createLink")) + '</button><div id="invite-link"></div></form>';
      box.scrollIntoView({ block: "nearest" });
      box.querySelector("[name=candidate_name]").focus();
      box.querySelector("#invite-form").addEventListener("submit", async e => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        try {
          const r = await api("/v1/tests/" + encodeURIComponent(x.slug) + "/invites", { method: "POST", body: JSON.stringify({ candidate_name: String(f.get("candidate_name")).trim(), position: String(f.get("position") || "").trim() || undefined }) });
          const url = location.origin + location.pathname + "?test=" + encodeURIComponent(r.token);
          const msg = t("tests.inviteMessage", { name: String(f.get("candidate_name")).trim(), url });
          document.querySelector("#invite-link").innerHTML = '<label class="field"><span>' + esc(t("tests.linkReady")) + '</span><input readonly value="' + esc(url) + '" id="invite-url"></label><div class="receipt-actions"><button type="button" class="outline-button" id="copy-invite">' + esc(t("tests.copy")) + '</button><a class="primary-button" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text=' + encodeURIComponent(msg) + '">WhatsApp</a></div>';
          document.querySelector("#copy-invite").addEventListener("click", async () => { try { await navigator.clipboard.writeText(url); status(t("tests.copied")); } catch { document.querySelector("#invite-url").select(); } });
        } catch (x2) { status(x2.message, true); }
      });
    }));
    content.querySelectorAll("[data-invite-del]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm(t("tests.deleteConfirm"))) return;
      try { await api("/v1/tests/invites/" + encodeURIComponent(b.dataset.inviteDel), { method: "DELETE" }); await tests(); } catch (x) { status(x.message, true); }
    }));
  }

  async function test() {
    if (!testSlug) { active = "tests"; setHeading("tests"); return tests(); }
    const back = "";
    if (testResult) {
      content.innerHTML = back + '<section class="lesson-box"><p class="eyebrow">' + esc(t("tests.result")) + "</p><h2>" + esc(tx(testResult.test.title)) + "</h2></section>" + resultHtml(testResult, { review: true }) +
        '<div class="receipt-actions"><button type="button" class="outline-button" id="test-again">' + esc(t("tests.retake")) + "</button></div>";
      document.querySelector("#test-again").addEventListener("click", () => { testResult = null; render("test"); });
      return;
    }
    const tdef = await api("/v1/tests/" + encodeURIComponent(testSlug));
    content.innerHTML = back + runnerHtml(tdef);
    wireRunner(tdef, async answers => {
      testResult = await api("/v1/tests/" + encodeURIComponent(testSlug) + "/submit", { method: "POST", body: JSON.stringify({ answers, locale: I18N.getLocale() }) });
      await render("test");
      window.scrollTo(0, 0);
    });
  }

  // Candidate opens ?test=TOKEN without an account.
  async function candidateTest(tokenValue) {
    setHeading("tests");
    const bar = document.querySelector(".topbar-right");
    if (bar) bar.innerHTML = I18N.switcherHtml() + themeButton();
    let d;
    try { d = await api("/v1/public/test-invites/" + encodeURIComponent(tokenValue)); }
    catch (x) { content.innerHTML = '<div class="empty-panel"><h2>' + esc(t("tests.candidateUnavailable")) + "</h2><p>" + esc(x.message) + "</p></div>"; return; }
    const hello = '<div class="demo-note">' + esc(t("tests.candidateHello", { name: d.candidate_name, sender: d.sender || "Friends" })) + "</div>";
    content.innerHTML = runnerHtml(d.test, hello);
    document.querySelector("#test-extra").innerHTML = '<label class="consent-field"><input type="checkbox" name="consent" required> <span>' + esc(t("tests.candidateConsent", { sender: d.sender || "Friends" })) + "</span></label>";
    wireRunner(d.test, async (answers, f) => {
      await api("/v1/public/test-invites/" + encodeURIComponent(tokenValue), { method: "POST", body: JSON.stringify({ answers, consent: f.get("consent") === "on", locale: I18N.getLocale() }) });
      content.innerHTML = '<div class="empty-panel"><div class="brand-mark" aria-hidden="true">✓</div><h2>' + esc(t("tests.candidateDone")) + "</h2><p>" + esc(t("tests.candidateDoneText")) + "</p></div>";
      window.scrollTo(0, 0);
    });
  }

  // ---------- Карточка дня: one helpful pop-up a day ----------
  let nudgeChecked = false;
  const MOODS = ["face1", "face2", "face3", "face4", "face5"];
  const NUDGE_GO = { event_soon: "events", missed_events: "events", poll_open: "polls", crm_sales: "business", jobs_new: "announcements", course_continue: "course", test_try: "test",
    crm_start: "business", crm_team: "business", learn_start: "learn", ai_try: "learn", chats_join: "messages", discounts_try: "discounts", whatsapp_connect: "profile" };
  // The «карточка дня» never greets a person at the door: it waits until they have spent
  // NUDGE_AFTER_MS of visible time in the app, and until they are not typing or in another dialog.
  const NUDGE_AFTER_MS = typeof window.FRIENDS_NUDGE_AFTER_MS === "number" ? window.FRIENDS_NUDGE_AFTER_MS : 7 * 60 * 1000;
  function waitActiveTime(ms) {
    return new Promise(res => {
      let spent = 0, last = Date.now();
      const tick = () => {
        const now = Date.now();
        if (document.visibilityState === "visible" && !document.querySelector("#demo-welcome")) spent += now - last;
        last = now;
        const busy = document.querySelector("dialog[open], #demo-welcome") || (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName));
        if (spent >= ms && !busy && token()) { clearInterval(timer); res(); }
      };
      const timer = setInterval(tick, Math.min(1000, Math.max(100, ms / 4)));
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") last = Date.now(); });
    });
  }
  async function maybeNudge() {
    if (nudgeChecked) return;
    nudgeChecked = true;
    await waitActiveTime(NUDGE_AFTER_MS);
    let r;
    try { r = await api("/v1/me/nudge/today", { method: "POST", body: "{}" }); } catch { return; }
    const n = r && r.nudge;
    if (!n) return;
    const d = n.data || {};
    const when = d.starts_at ? date(d.starts_at) : "";
    const icon = ic({ event_soon: "calendar", missed_events: "wave", poll_open: "help", crm_sales: "business", course_continue: "learn", test_try: "test", jobs_new: "briefcase", mood: d.winter ? "coffee" : "sun", crm_start: "trend", crm_team: "users", learn_start: "learn", ai_try: "spark", chats_join: "chat", discounts_try: "percent", whatsapp_connect: "phone" }[n.kind]);
    const title = t("nudge." + n.kind + ".title" + (n.kind === "mood" && d.winter ? "Winter" : ""), { title: d.title || "", when, name: d.name || "", count: d.count || 0 });
    const text = t("nudge." + n.kind + ".text" + (n.kind === "mood" && d.winter ? "Winter" : ""), { title: d.title || d.question || "", when, name: d.name || "", count: d.count || 0, done: d.done || 0, total: d.total || 0 });
    const dlg = document.createElement("dialog");
    dlg.className = "nudge-dialog";
    dlg.setAttribute("aria-labelledby", "nudge-title");
    dlg.innerHTML = '<div class="nudge-icon" aria-hidden="true">' + icon + '</div><p class="eyebrow">' + esc(t("nudge.eyebrow")) + '</p><h2 id="nudge-title">' + esc(title) + "</h2><p>" + esc(text) + "</p>" +
      (n.kind === "mood" ? '<div class="mood-row" role="group" aria-label="' + esc(t("nudge.moodLabel")) + '">' + MOODS.map((e, i) => '<button type="button" class="mood-btn" data-mood="' + (i + 1) + '" aria-label="' + esc(t("nudge.mood" + (i + 1))) + '">' + ic(e, "ic-mood") + "<small>" + esc(t("nudge.mood" + (i + 1))) + "</small></button>").join("") + '</div><div id="mood-reply" aria-live="polite"></div>'
        : '<div class="nudge-actions"><button type="button" class="primary-button" id="nudge-go">' + esc(t("nudge." + n.kind + ".cta")) + "</button></div>") +
      '<div class="nudge-foot"><button type="button" class="text-button" id="nudge-later">' + esc(t("nudge.later")) + '</button><button type="button" class="text-button" id="nudge-off">' + esc(t("nudge.off")) + "</button></div>";
    document.body.appendChild(dlg);
    const close = () => { if (dlg.open && typeof dlg.close === "function") dlg.close(); dlg.remove(); };
    const act = action => api("/v1/me/nudge/action", { method: "POST", body: JSON.stringify({ action }) }).catch(() => {});
    dlg.addEventListener("cancel", () => { act("later"); });
    dlg.addEventListener("close", () => dlg.remove());
    dlg.querySelector("#nudge-later").addEventListener("click", () => { act("later"); close(); });
    dlg.querySelector("#nudge-off").addEventListener("click", async () => {
      try { await api("/v1/me/nudge/settings", { method: "PUT", body: JSON.stringify({ enabled: false }) }); status(t("nudge.offDone")); } catch (x) { status(x.message, true); }
      close();
    });
    const go = dlg.querySelector("#nudge-go");
    if (go) go.addEventListener("click", () => {
      act("done");
      close();
      if (n.kind === "course_continue") learnCourse = n.ref;
      if (n.kind === "test_try") { testSlug = n.ref; testResult = null; }
      if (n.kind === "ai_try") learnFilter = "ai";
      render(NUDGE_GO[n.kind]);
    });
    dlg.querySelectorAll("[data-mood]").forEach(b => b.addEventListener("click", async () => {
      const mood = Number(b.dataset.mood);
      dlg.querySelectorAll("[data-mood]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      let res = { support: mood <= 2 };
      try { res = await api("/v1/me/mood", { method: "POST", body: JSON.stringify({ mood }) }); } catch { /* still show the reply */ }
      const box = dlg.querySelector("#mood-reply");
      box.innerHTML = '<p class="demo-note">' + esc(t(res.support ? "nudge.moodLow" : mood === 3 ? "nudge.moodMid" : "nudge.moodHigh")) + "</p>" +
        (res.support ? '<div class="nudge-actions"><button type="button" class="primary-button" data-nudge-view="checkin">' + esc(t("nudge.askHelp")) + '</button><button type="button" class="outline-button" data-nudge-view="messages">' + esc(t("nudge.talk")) + "</button></div>"
          : '<div class="nudge-actions"><button type="button" class="primary-button" id="nudge-thanks">' + esc(t("nudge.thanks")) + "</button></div>");
      box.querySelectorAll("[data-nudge-view]").forEach(x => x.addEventListener("click", () => { close(); render(x.dataset.nudgeView); }));
      box.querySelector("#nudge-thanks")?.addEventListener("click", close);
      box.querySelector("button")?.focus();
    }));
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  }

  // ---------- Настройки ----------
  async function settings() {
    const [mem, nud] = await Promise.all([api("/v1/me/membership").catch(() => ({ membership: null })), api("/v1/me/nudge/settings").catch(() => ({ enabled: true }))]);
    const m = mem.membership;
    const themeOpt = (id, sw) => '<button type="button" class="theme-card' + (themeChoice() === id ? " active" : "") + '" data-set-theme="' + id + '" aria-pressed="' + (themeChoice() === id) + '"><span class="theme-swatch" style="background:' + sw[0] + '"><i style="background:' + sw[1] + '"></i><i style="background:' + sw[2] + '"></i></span><span>' + esc(t("settings.theme." + id)) + "</span></button>";
    const accent = store.get("friends.accent") || "blue";
    const accentOpt = (id, col) => '<button type="button" class="accent-dot' + (accent === id ? " active" : "") + '" data-set-accent="' + id + '" aria-pressed="' + (accent === id) + '" aria-label="' + esc(t("settings.accent." + id)) + '" title="' + esc(t("settings.accent." + id)) + '" style="background:' + col + '"></button>';
    const subText = !m ? t("settings.subNone") : m.active ? (m.ends_at ? t("settings.subUntil", { date: day(m.ends_at), days: m.days_left }) : t("settings.subActive")) : t("settings.subExpired", { date: m.ends_at ? day(m.ends_at) : "—" });
    const warn = m && m.active && m.days_left != null && m.days_left <= 30;
    content.innerHTML =
      panel(t("settings.language"), t("settings.languageText"), I18N.switcherHtml()) +
      panel(t("settings.look"), t("settings.lookText"), '<div class="theme-row">' + themeOpt("dark", ["#18191a", "#242526", "#4599ff"]) + themeOpt("navy", ["#0b1220", "#131c2e", "#4599ff"]) + themeOpt("light", ["#f0f2f5", "#ffffff", "#1468d8"]) + "</div>" +
        '<p class="muted settings-sub">' + esc(t("settings.accent")) + '</p><div class="accent-row">' + accentOpt("blue", "#1877f2") + accentOpt("teal", "#0f9b8e") + accentOpt("violet", "#7c3aed") + accentOpt("green", "#16a34a") + "</div>") +
      (canSpeak() ? panel(t("voice.title"), t("voice.text"), '<div id="voice-box" class="loading-panel">' + esc(t("common.loading")) + "</div>") : "") +
      panel(t("settings.subscription"), "", '<div class="sub-box' + (warn ? " warn" : "") + '"><strong>' + esc(subText) + "</strong>" + (m && m.days_left != null && m.active ? '<div class="learn-progress" aria-hidden="true"><span style="width:' + Math.max(3, Math.min(100, Math.round(m.days_left / 365 * 100))) + '%"></span></div>' : "") + '</div><div class="receipt-actions"><button type="button" class="primary-button" data-view="membership">' + esc(t(warn || (m && !m.active) ? "settings.renew" : "settings.invoices")) + "</button></div>") +
      panel(t("settings.notifications"), "", '<label class="consent-field"><input type="checkbox" id="set-nudge"' + (nud.enabled ? " checked" : "") + "> <span>" + esc(t("nudge.settingsLabel")) + '</span></label><div class="receipt-actions"><button type="button" class="outline-button" data-view="profile">' + esc(t("settings.whatsapp")) + "</button></div>") +
      panel(t("settings.account"), t("settings.remembered"), '<div class="receipt-actions"><button type="button" class="outline-button" data-view="profile">' + esc(t("settings.profile")) + '</button><button type="button" class="outline-button" id="logout-all">' + esc(t("settings.logoutAll")) + "</button>" +
        (privacyPolicyUrl ? '<a class="outline-button" href="' + esc(safeUrl(privacyPolicyUrl)) + '" target="_blank" rel="noopener noreferrer">' + esc(t("consent.link")) + "</a>" : "") + "</div>");
    voiceSettings();
    document.querySelector("#logout-all")?.addEventListener("click", () => { if (confirm(t("settings.logoutAllConfirm"))) logout(true); });
    content.querySelectorAll("[data-set-theme]").forEach(b => b.addEventListener("click", () => { store.set(THEME_KEY, b.dataset.setTheme); applyTheme(b.dataset.setTheme); settings(); }));
    content.querySelectorAll("[data-set-accent]").forEach(b => b.addEventListener("click", () => { store.set("friends.accent", b.dataset.setAccent); applyTheme(themeChoice()); settings(); }));
    document.querySelector("#set-nudge").addEventListener("change", async e => {
      try { await api("/v1/me/nudge/settings", { method: "PUT", body: JSON.stringify({ enabled: e.target.checked }) }); status(t("biz.saved")); } catch (x) { status(x.message, true); }
    });
  }

  async function voiceSettings() {
    const box = document.querySelector("#voice-box");
    if (!box) return;
    const lang = ["kk", "en"].includes(I18N.getLocale()) ? I18N.getLocale() : "ru";
    const all = await loadVoices();
    let list = all.filter(v => v.lang && v.lang.toLowerCase().startsWith(lang));
    if (lang === "kk" && !list.length) list = all.filter(v => v.lang && v.lang.toLowerCase().startsWith("ru"));
    list.sort((a, b) => voiceScore(b) - voiceScore(a) || a.name.localeCompare(b.name));
    if (!document.contains(box)) return;
    if (!list.length) { box.className = ""; box.innerHTML = '<p class="muted">' + esc(t("voice.none")) + "</p>"; return; }
    const cur = store.get("friends.voice") || (bestVoice(list, list[0].lang.slice(0, 2).toLowerCase()) || list[0]).voiceURI;
    const label = v => v.name.replace(/^(Microsoft|Google|Apple)\s+/, "").replace(/\s*-\s*.*$/, "") + (voiceGender(v) ? " \u00b7 " + t("voice." + voiceGender(v)) : "") + (voiceScore(v) >= 2 ? " \u00b7 " + t("voice.hq") : "");
    box.className = "";
    box.innerHTML = '<div class="voice-list" role="radiogroup" aria-label="' + esc(t("voice.title")) + '">' + list.map((v, i) => '<label class="voice-row"><input type="radio" name="voice" value="' + i + '"' + (v.voiceURI === cur ? " checked" : "") + "> <span>" + esc(label(v)) + '</span><button type="button" class="text-button" data-voice-try="' + i + '">' + ic("speaker", "ic-inline") + " " + esc(t("voice.try")) + "</button></label>").join("") + "</div>" +
      '<p class="muted">' + esc(t("voice.more")) + "</p>";
    box.querySelectorAll('input[name="voice"]').forEach(r => r.addEventListener("change", () => { store.set("friends.voice", list[Number(r.value)].voiceURI); status(t("biz.saved")); }));
    box.querySelectorAll("[data-voice-try]").forEach(b => b.addEventListener("click", () => {
      const v = list[Number(b.dataset.voiceTry)];
      stopSpeaking();
      const u = new SpeechSynthesisUtterance(t("voice.sample"));
      u.voice = v; u.lang = v.lang; u.rate = Number(store.get("friends.voiceRate")) || 1;
      speechSynthesis.speak(u);
    }));
  }

  // ---------- Рейтинг и доверие ----------
  const stars = r => r == null ? "" : '<span class="stars" aria-label="' + esc(t("trust.ratingLabel", { r: String(r).replace(".", ",") })) + '"><span aria-hidden="true">' + "★".repeat(Math.round(r)) + "☆".repeat(5 - Math.round(r)) + "</span> " + String(r).replace(".", ",") + "</span>";
  const badgeHtml = k => '<span class="trust-badge badge-' + esc(k) + '"><span aria-hidden="true">' + ({ tax_clear: ic("receipt", "ic-inline"), credit_history: ic("bank", "ic-inline"), company: ic("building", "ic-inline") }[k] || "✓") + "</span> " + esc(t("trust.badge." + k)) + "</span>";
  function trustSummary(c) {
    return '<div class="trust-summary">' + (c.reviews_count ? stars(c.rating) + ' <span class="muted">' + esc(t("trust.reviewsCount", { n: c.reviews_count })) + "</span>" : '<span class="muted">' + esc(t("trust.noReviews")) + "</span>") +
      '<div class="trust-badges">' + (c.badges || []).map(b => badgeHtml(b.kind || b)).join("") + "</div>" +
      '<div class="trust-facts"><span>' + esc(t("trust.years", { n: c.member_years || 0 })) + "</span><span>" + esc(t("trust.events", { n: c.events_year || 0 })) + "</span><span>" + esc(t("trust.lessons", { n: c.lessons_done || 0 })) + "</span></div></div>";
  }
  function reviewList(c, canReply) {
    return (c.reviews || []).length ? c.reviews.map(r => '<article class="review"><div class="review-top"><strong>' + esc(r.reviewer) + "</strong>" + stars(r.rating) + "</div><p>" + esc(r.body) + '</p><small class="muted">' + esc(day(r.created_at)) + "</small>" +
      (r.reply ? '<p class="review-reply"><strong>' + esc(t("trust.reply")) + ":</strong> " + esc(r.reply) + "</p>" : canReply ? '<form class="inline-form" data-reply="' + esc(r.id) + '"><label class="field"><span>' + esc(t("trust.replyLabel")) + '</span><input name="reply" maxlength="1000" required></label><button class="outline-button">' + esc(t("trust.replySend")) + "</button></form>" : "") + "</article>").join("")
      : '<p class="muted">' + esc(t("trust.noReviews")) + "</p>";
  }
  let memberId = null;
  async function member() {
    if (!memberId) { active = "members"; setHeading("members"); return members(); }
    const c = await api("/v1/members/" + encodeURIComponent(memberId) + "/trust");
    const mine = c.my_review;
    let cardHtml = "";
    try { cardHtml = cardView(await api("/v1/members/" + encodeURIComponent(memberId) + "/card")); } catch { /* the old header below is the fallback */ }
    content.innerHTML = (cardHtml ? cardHtml + "<!--c-->" : "") + (cardHtml ? "" :
      '<section class="lesson-box member-head"><div class="member-avatar big" aria-hidden="true">' + esc((c.display_name || "?").slice(0, 1)) + "</div><div><h2>" + esc(c.display_name) + "</h2><p class=\"muted\">" + esc([c.headline, c.city_name].filter(Boolean).join(" · ")) + "</p></div></section>") +
      panel(t("trust.title"), t("trust.text"), trustSummary(c)) +
      panel(t("trust.reviews"), "", reviewList(c, false)) +
      '<div class="receipt-actions member-deal"><button type="button" class="primary-button" id="propose-deal">' + ic("deal", "ic-inline") + ' ' + esc(t("deals.proposeTo")) + "</button></div>" +
      panel(t("trust.leaveTitle"), t("trust.leaveText"), mine && mine.status !== "rejected" ? '<p class="demo-note">' + esc(t(mine.status === "pending" ? "trust.minePending" : "trust.mineDone")) + "</p>" :
        '<form id="review-form" class="app-form"><fieldset class="rating-pick"><legend>' + esc(t("trust.yourRating")) + "</legend>" + [5, 4, 3, 2, 1].map(n => '<label><input type="radio" name="rating" value="' + n + '" required> <span>' + "★".repeat(n) + "</span></label>").join("") + "</fieldset>" +
        area(t("trust.reviewText"), "body") + '<button class="primary-button">' + esc(t("trust.send")) + "</button></form>");
    document.querySelector("#propose-deal")?.addEventListener("click", () => { dealId = null; dealDraftFor = { id: c.user_id, name: c.display_name }; render("deal"); });
    const f = document.querySelector("#review-form");
    if (f) {
      f.querySelector("textarea").setAttribute("minlength", "10");
      f.querySelector("textarea").setAttribute("maxlength", "1000");
      f.querySelector("textarea").required = true;
      f.addEventListener("submit", async e => {
        e.preventDefault();
        const d = new FormData(f);
        try { await api("/v1/members/" + encodeURIComponent(memberId) + "/reviews", { method: "POST", body: JSON.stringify({ rating: Number(d.get("rating")), body: String(d.get("body")).trim() }) }); status(t("trust.sent")); await member(); } catch (x) { status(x.message, true); }
      });
    }
  }
  // ---- Resident business card (profile page) ----
  const CARD_LINKS = ["map2gis", "whatsapp", "instagram", "tiktok", "telegram", "youtube", "website", "menu", "booking"];
  const CARD_SOCIALS = ["instagram", "youtube", "tiktok", "telegram", "website"];
  const CARD_REV = ["lt10", "10_50", "50_100", "100_500", "gt500"];
  const safeHref = u => /^https?:\/\//i.test(String(u || "")) ? esc(u) : "#";
  function cardView(d) {
    const p = d.person || {}, c = d.card || {}, biz = d.businesses || [];
    const stats = [];
    if (c.years_in_business != null) stats.push([String(c.years_in_business), t("card.statYears")]);
    if (c.branches != null) stats.push([String(c.branches), t("card.statBranches")]);
    if (c.employees != null) stats.push([String(c.employees), t("card.statStaff")]);
    if (c.revenue_range) stats.push([t("card.rev." + c.revenue_range), t("card.statRevenue")]);
    const since = p.member_since ? new Date(p.member_since).getFullYear() : "";
    const social = CARD_SOCIALS.filter(k => c.socials && c.socials[k]).map(k => '<a class="cv-chip" href="' + safeHref(c.socials[k]) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(t("card.link." + k)) + "</a>").join("");
    return '<article class="cv"><div class="cv-cover" aria-hidden="true"></div><div class="cv-top">' +
      '<div class="cv-av" aria-hidden="true">' + esc(String(p.display_name || "?").slice(0, 1).toUpperCase()) + '</div>' +
      '<div class="cv-badges">' + (p.badges && p.badges.face ? '<span class="cv-badge gold">★ ' + esc(t("card.badgeFace")) + "</span>" : "") + "</div>" +
      "<h2>" + esc(p.display_name || "") + '</h2><p class="cv-role">' + esc(p.headline || "") + '</p><p class="cv-city">' + esc([p.city_name, since ? t("card.since", { year: since }) : ""].filter(Boolean).join(" · ")) + "</p></div>" +
      (stats.length ? '<div class="cv-stats">' + stats.map(s => '<div><b>' + esc(s[0]) + "</b><span>" + esc(s[1]) + "</span></div>").join("") + "</div>" : "") +
      (c.about ? '<section class="cv-box"><h3>' + esc(t("card.about")) + "</h3><p>" + esc(c.about) + "</p>" + ((c.tags || []).length ? '<div class="cv-tags">' + c.tags.map(x => "<span>" + esc(x) + "</span>").join("") + "</div>" : "") + "</section>" : "") +
      (c.seeking || c.offering ? '<section class="cv-box"><h3>' + esc(t("card.seekOffer")) + '</h3><div class="cv-two">' +
        (c.seeking ? '<div class="cv-seek"><b>' + esc(t("card.seeking")) + "</b>" + esc(c.seeking) + "</div>" : "") +
        (c.offering ? '<div class="cv-offer"><b>' + esc(t("card.offering")) + "</b>" + esc(c.offering) + "</div>" : "") + "</div></section>" : "") +
      (biz.length ? '<section class="cv-box"><h3>' + esc(t("card.businesses")) + "</h3>" + biz.map(b =>
        '<div class="cv-biz"><div class="cv-biz-head"><div class="cv-logo" aria-hidden="true">' + esc(String(b.name || "?").slice(0, 1).toUpperCase()) + "</div><div><strong>" + esc(b.name) + '</strong><small>' + esc([b.kind, b.city].filter(Boolean).join(" · ")) + "</small></div></div>" +
        (b.description ? "<p>" + esc(b.description) + "</p>" : "") +
        ((b.links || []).length ? '<div class="cv-links">' + b.links.map(l => '<a class="cv-chip ' + esc(l.type) + '" href="' + safeHref(l.url) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(t("card.link." + l.type)) + "</a>").join("") + "</div>" : "") +
        (b.offer_text ? '<div class="cv-deal"><b>' + esc(t("card.forResidents")) + "</b> " + esc(b.offer_text) + "</div>" : "") + "</div>").join("") + "</section>" : "") +
      (social ? '<section class="cv-box"><h3>' + esc(t("card.socials")) + '</h3><div class="cv-links">' + social + "</div></section>" : "") + "</article>";
  }
  async function myCard() {
    const d = await api("/v1/me/card");
    const c = d.card || {}, so = c.socials || {};
    const n = v => v == null ? "" : String(v);
    const bizForm = b => {
      const links = Object.fromEntries((b.links || []).map(l => [l.type, l.url]));
      return '<details class="cv-edit"' + (b._open ? " open" : "") + "><summary>" + esc(b.name) + '</summary><form class="app-form" data-biz="' + esc(b.id) + '">' +
        field(t("card.bizName"), "name", b.name, "text", 'required maxlength="80"') + field(t("card.bizKind"), "kind", n(b.kind), "text", 'maxlength="60"') + field(t("card.bizCity"), "city", n(b.city), "text", 'maxlength="60"') +
        area(t("card.bizDesc"), "description", n(b.description)) + field(t("card.bizOffer"), "offer_text", n(b.offer_text), "text", 'maxlength="120"') +
        "<h4>" + esc(t("card.bizLinks")) + "</h4>" + CARD_LINKS.map(k => field(t("card.link." + k), "link_" + k, n(links[k]), "text", 'maxlength="300" placeholder="' + esc(t("card.linkHint")) + '"')).join("") +
        '<div class="receipt-actions"><button class="primary-button">' + esc(t("card.save")) + '</button><button type="button" class="outline-button" data-biz-del="' + esc(b.id) + '">' + esc(t("card.bizDelete")) + "</button></div></form></details>";
    };
    content.innerHTML = '<p class="muted">' + esc(t("card.previewHint")) + "</p>" + cardView(d) +
      panel(t("card.editTitle"), t("card.editText"),
        '<form id="card-form" class="app-form"><div class="app-grid">' +
        field(t("card.statYears"), "years_in_business", n(c.years_in_business), "number", 'min="0" max="80"') + field(t("card.statBranches"), "branches", n(c.branches), "number", 'min="0" max="500"') + field(t("card.statStaff"), "employees", n(c.employees), "number", 'min="0" max="100000"') + "</div>" +
        '<label class="field"><span>' + esc(t("card.statRevenue")) + '</span><select name="revenue_range">' + option("", t("card.rev.none"), !c.revenue_range) + CARD_REV.map(r => option(r, t("card.rev." + r), c.revenue_range === r)).join("") + "</select></label>" +
        '<label class="check"><input type="checkbox" name="revenue_visible"' + (c.revenue_visible ? " checked" : "") + "> " + esc(t("card.revShow")) + "</label>" +
        area(t("card.about"), "about", n(c.about)) + area(t("card.seeking"), "seeking", n(c.seeking)) + area(t("card.offering"), "offering", n(c.offering)) +
        field(t("card.tags"), "tags", (c.tags || []).join(", "), "text", 'maxlength="250"') +
        "<h4>" + esc(t("card.socials")) + "</h4>" + CARD_SOCIALS.map(k => field(t("card.link." + k), "soc_" + k, n(so[k]), "text", 'maxlength="300" placeholder="' + esc(t("card.linkHint")) + '"')).join("") +
        '<button class="primary-button">' + esc(t("card.save")) + "</button></form>") +
      panel(t("card.businesses"), t("card.bizText"), (d.businesses || []).map(bizForm).join("") + '<button type="button" class="outline-button" id="biz-add">' + esc(t("card.bizAdd")) + "</button>");
    const form = document.querySelector("#card-form");
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(form);
      const body = { years_in_business: f.get("years_in_business") || null, branches: f.get("branches") || null, employees: f.get("employees") || null, revenue_range: f.get("revenue_range") || null,
        revenue_visible: form.elements.revenue_visible.checked, about: f.get("about"), seeking: f.get("seeking"), offering: f.get("offering"),
        tags: String(f.get("tags") || "").split(",").map(x => x.trim()).filter(Boolean), socials: Object.fromEntries(CARD_SOCIALS.map(k => [k, f.get("soc_" + k)])) };
      try { await api("/v1/me/card", { method: "PUT", body: JSON.stringify(body) }); status(t("card.saved")); await myCard(); } catch (x) { status(x.message, true); }
    });
    document.querySelectorAll("form[data-biz]").forEach(bf => bf.addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(bf);
      const body = { name: String(f.get("name")).trim(), kind: f.get("kind"), city: f.get("city"), description: f.get("description"), offer_text: f.get("offer_text"), links: CARD_LINKS.map(k => ({ type: k, url: f.get("link_" + k) })).filter(l => String(l.url || "").trim()) };
      try { await api("/v1/me/businesses/" + encodeURIComponent(bf.dataset.biz), { method: "PUT", body: JSON.stringify(body) }); status(t("card.saved")); await myCard(); } catch (x) { status(x.message, true); }
    }));
    document.querySelectorAll("[data-biz-del]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm(t("card.bizDeleteAsk"))) return;
      try { await api("/v1/me/businesses/" + encodeURIComponent(b.dataset.bizDel), { method: "DELETE" }); status(t("card.saved")); await myCard(); } catch (x) { status(x.message, true); }
    }));
    document.querySelector("#biz-add")?.addEventListener("click", async () => {
      try { await api("/v1/me/businesses", { method: "POST", body: JSON.stringify({ name: t("card.bizNew") }) }); await myCard(); document.querySelector(".cv-edit:last-of-type")?.setAttribute("open", ""); } catch (x) { status(x.message, true); }
    });
  }
  async function trust() {
    const c = await api("/v1/me/trust");
    const req = c.verification_requests || [];
    const state = k => { const r = req.find(x => x.kind === k); return r ? r.status : null; };
    const vbox = k => {
      const st = state(k), badge = (c.badges || []).find(b => b.kind === k);
      return '<article class="invoice-card"><div class="invoice-top"><div><h3>' + badgeHtml(k) + "</h3><small>" + esc(t("trust.verify." + k)) + "</small></div>" + (badge ? '<span class="pill">' + esc(t("trust.validUntil", { date: day(badge.valid_until) })) + "</span>" : st === "pending" ? '<span class="pill">' + esc(t("trust.pending")) + "</span>" : "") + "</div>" +
        (badge ? '<div class="receipt-actions"><button type="button" class="text-button" data-revoke="' + k + '">' + esc(t("trust.revoke")) + "</button></div>"
          : st === "pending" ? "" : '<form class="app-form" data-verify="' + k + '">' + (k !== "credit_history" ? field(t("trust.bin"), "bin", "", "text", 'inputmode="numeric" pattern="[0-9]{12}" maxlength="12" required') : "") +
            '<label class="consent-field"><input type="checkbox" name="consent" required> <span>' + esc(t("trust.consent." + k)) + '</span></label><button class="outline-button">' + esc(t("trust.request")) + "</button></form>") + "</article>";
    };
    content.innerHTML = panel(t("trust.myTitle"), t("trust.myText"), trustSummary(c) + (c.reviews_pending_about_me ? '<p class="demo-note">' + esc(t("trust.pendingAboutMe", { n: c.reviews_pending_about_me })) + "</p>" : "")) +
      panel(t("trust.verifyTitle"), t("trust.verifyText"), ["tax_clear", "credit_history", "company"].map(vbox).join("")) +
      panel(t("trust.reviews"), "", reviewList(c, true));
    content.querySelectorAll("[data-verify]").forEach(form => form.addEventListener("submit", async e => {
      e.preventDefault();
      const d = new FormData(form);
      const body = { kind: form.dataset.verify, consent: d.get("consent") === "on" };
      if (d.get("bin")) body.bin = String(d.get("bin")).trim();
      try { await api("/v1/me/verifications", { method: "POST", body: JSON.stringify(body) }); status(t("trust.requested")); await trust(); } catch (x) { status(x.message, true); }
    }));
    content.querySelectorAll("[data-revoke]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm(t("trust.revokeConfirm"))) return;
      try { await api("/v1/me/verifications/" + encodeURIComponent(b.dataset.revoke), { method: "DELETE" }); await trust(); } catch (x) { status(x.message, true); }
    }));
    content.querySelectorAll("[data-reply]").forEach(form => form.addEventListener("submit", async e => {
      e.preventDefault();
      try { await api("/v1/me/reviews/" + encodeURIComponent(form.dataset.reply) + "/reply", { method: "POST", body: JSON.stringify({ reply: String(new FormData(form).get("reply")).trim() }) }); await trust(); } catch (x) { status(x.message, true); }
    }));
  }
  async function adminTrust() {
    const d = await api("/v1/admin/trust");
    content.innerHTML = panel(t("adminTrust.reviewsTitle"), t("adminTrust.reviewsText"), d.reviews.length ? d.reviews.map(r => '<article class="invoice-card"><div class="invoice-top"><div><h3>' + esc(r.reviewer) + " → " + esc(r.subject) + "</h3><small>" + esc(date(r.created_at)) + "</small></div>" + stars(r.rating) + "</div><p>" + esc(r.body) + '</p><div class="receipt-actions"><button class="primary-button" data-rev="publish" data-id="' + esc(r.id) + '">' + esc(t("adminTrust.publish")) + '</button><button class="outline-button" data-rev="reject" data-id="' + esc(r.id) + '">' + esc(t("adminTrust.reject")) + "</button></div></article>").join("") : '<p class="muted">' + esc(t("adminTrust.empty")) + "</p>") +
      panel(t("adminTrust.verTitle"), t("adminTrust.verText"), d.verifications.length ? d.verifications.map(v => '<article class="invoice-card"><div class="invoice-top"><div><h3>' + badgeHtml(v.kind) + "</h3><small>" + esc(v.member) + " · " + esc(v.email || "") + (v.bin ? " · " + esc(t("trust.binShort")) + " " + esc(v.bin) : "") + "</small></div><small>" + esc(t("adminTrust.consentAt", { date: date(v.consent_at) })) + "</small></div>" + (v.member_note ? "<p>" + esc(v.member_note) + "</p>" : "") + '<p class="muted">' + esc(t("adminTrust.how." + v.kind)) + '</p><div class="receipt-actions"><button class="primary-button" data-ver="approve" data-id="' + esc(v.id) + '">' + esc(t("adminTrust.approve", { days: d.valid_days[v.kind] })) + '</button><button class="outline-button" data-ver="reject" data-id="' + esc(v.id) + '">' + esc(t("adminTrust.reject")) + "</button></div></article>").join("") : '<p class="muted">' + esc(t("adminTrust.empty")) + "</p>");
    content.querySelectorAll("[data-rev]").forEach(b => b.addEventListener("click", async () => { try { await api("/v1/admin/reviews/" + b.dataset.id + "/" + b.dataset.rev, { method: "POST", body: "{}" }); await adminTrust(); status(t("biz.saved")); } catch (x) { status(x.message, true); } }));
    content.querySelectorAll("[data-ver]").forEach(b => b.addEventListener("click", async () => { try { await api("/v1/admin/verifications/" + b.dataset.id + "/" + b.dataset.ver, { method: "POST", body: "{}" }); await adminTrust(); status(t("biz.saved")); } catch (x) { status(x.message, true); } }));
  }

  // ---------- Сделки Friends: договор, оплата, претензия, медиация, взыскание ----------
  let dealId = null, dealDraftFor = null;
  const PARTY_KEY = "friends.dealParty";
  const savedParty = () => { try { return JSON.parse(store.get(PARTY_KEY) || "null") || {}; } catch { return {}; } };
  const partyFields = p => field(t("deals.pName"), "p_name", p.name || "", "text", 'required minlength="2" maxlength="200"') + field(t("deals.pBin"), "p_bin", p.bin || "", "text", 'required inputmode="numeric" pattern="[0-9]{12}" maxlength="12"') +
    field(t("deals.pAddress"), "p_address", p.address || "", "text", 'required minlength="5" maxlength="300"') + field(t("deals.pSigner"), "p_signer", p.signer || "", "text", 'required minlength="3" maxlength="200"') +
    field(t("deals.pIban"), "p_iban", p.iban || "", "text", 'pattern="KZ[0-9A-Z]{18}" maxlength="20"') + field(t("deals.pBank"), "p_bank", p.bank || "", "text", 'maxlength="200"');
  const readParty = f => { const p = { name: String(f.get("p_name")).trim(), bin: String(f.get("p_bin")).trim(), address: String(f.get("p_address")).trim(), signer: String(f.get("p_signer")).trim() };
    const iban = String(f.get("p_iban") || "").trim().toUpperCase(), bank = String(f.get("p_bank") || "").trim(); if (iban) p.iban = iban; if (bank) p.bank = bank; store.set(PARTY_KEY, JSON.stringify(p)); return p; };
  const saveText = (name, text) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
  const docBox = (title, text, file) => '<section class="lesson-box doc-box"><h3>' + esc(title) + '</h3><pre class="doc-text">' + esc(text) + '</pre><div class="receipt-actions"><button type="button" class="outline-button" data-copy-doc>' + esc(t("tests.copy")) + '</button><button type="button" class="outline-button" data-save-doc="' + esc(file) + '">' + esc(t("deals.download")) + "</button></div></section>";
  function wireDocs(root) {
    root.querySelectorAll("[data-copy-doc]").forEach(b => b.addEventListener("click", async () => { const txt = b.closest(".doc-box").querySelector("pre").textContent; try { await navigator.clipboard.writeText(txt); status(t("tests.copied")); } catch { status(t("deals.copyFail"), true); } }));
    root.querySelectorAll("[data-save-doc]").forEach(b => b.addEventListener("click", () => saveText(b.dataset.saveDoc, b.closest(".doc-box").querySelector("pre").textContent)));
  }
  const dealStatus = d => d.overdue ? t("deals.overdueDays", { n: d.days_overdue }) : I18N.label("dealStatus", d.status);

  async function deals() {
    const d = await api("/v1/deals");
    const card = x => '<button type="button" class="deal-row' + (x.overdue ? " overdue" : "") + '" data-deal="' + esc(x.id) + '"><span class="deal-main"><strong>' + esc(x.title) + "</strong><small>" + esc(x.number) + " · " + esc(t(x.role === "seller" ? "deals.withBuyer" : "deals.withSeller", { name: x.role === "seller" ? x.buyer_name : x.seller_name })) + " · " + esc(t("deals.dueShort", { date: day(x.due_date) })) + '</small></span><span class="deal-side"><strong>' + esc(money(x.amount_kzt)) + '</strong><span class="pill' + (x.overdue ? " warn-pill" : "") + '">' + esc(dealStatus(x)) + "</span></span></button>";
    content.innerHTML = '<div class="kpi-grid">' + statTile(t("deals.earned"), money(d.earned_in_club_kzt)) + statTile(t("deals.count"), d.items.length) + statTile(t("deals.overdueToMe"), d.overdue_to_me) + "</div>" +
      '<div class="card-cta"><div><strong>' + esc(t("deals.ctaTitle")) + "</strong><p>" + esc(t("deals.ctaText")) + '</p></div><button type="button" class="primary-button" id="deal-new">' + esc(t("deals.new")) + "</button></div>" +
      panel(t("deals.listTitle"), t("deals.listText"), d.items.length ? '<div class="deal-list">' + d.items.map(card).join("") + "</div>" : '<p class="muted">' + esc(t("deals.empty")) + "</p>");
    document.querySelector("#deal-new").addEventListener("click", () => { dealId = null; dealDraftFor = null; render("deal"); });
    content.querySelectorAll("[data-deal]").forEach(b => b.addEventListener("click", () => { dealId = b.dataset.deal; render("deal"); }));
  }

  async function dealNewForm() {
    const p = savedParty();
    const cp = dealDraftFor;
    content.innerHTML =
      panel(t("deals.newTitle"), t("deals.newText"), '<form id="deal-form" class="app-form">' +
        '<div class="field"><span>' + esc(t("deals.counterparty")) + "</span>" + (cp ? '<p class="pill-line"><strong>' + esc(cp.name) + '</strong> <button type="button" class="text-button" id="cp-change">' + esc(t("deals.change")) + "</button></p>" :
          '<div class="search-form"><input id="cp-q" placeholder="' + esc(t("deals.cpSearch")) + '" aria-label="' + esc(t("deals.cpSearch")) + '"><button type="button" class="outline-button" id="cp-find">' + esc(t("members.search")) + '</button></div><div id="cp-results" class="data-list"></div>') + "</div>" +
        '<fieldset class="rating-pick"><legend>' + esc(t("deals.myRole")) + '</legend><label><input type="radio" name="my_role" value="seller" checked> <span>' + esc(t("deals.roleSeller")) + '</span></label><label><input type="radio" name="my_role" value="buyer"> <span>' + esc(t("deals.roleBuyer")) + "</span></label></fieldset>" +
        '<label class="field"><span>' + esc(t("deals.kind")) + '</span><select name="kind">' + option("services", t("deals.kindServices"), true) + option("supply", t("deals.kindSupply"), false) + "</select></label>" +
        field(t("deals.title"), "title", "", "text", 'required minlength="3" maxlength="200"') + area(t("deals.description"), "description", "") +
        field(t("deals.amount"), "amount_kzt", "", "number", 'required min="1" step="1"') + field(t("deals.due"), "due_date", "", "date", "required") +
        '<h3>' + esc(t("deals.myRequisites")) + "</h3>" + partyFields(p) +
        '<p class="muted">' + esc(t("deals.draftNote")) + '</p><button class="primary-button">' + esc(t("deals.send")) + "</button></form>");
    document.querySelector("#cp-change")?.addEventListener("click", () => { dealDraftFor = null; dealNewForm(); });
    const find = async () => {
      const q = document.querySelector("#cp-q").value.trim();
      const box = document.querySelector("#cp-results");
      if (q.length < 2) return;
      try { const r = await api("/v1/members?limit=10&q=" + encodeURIComponent(q)); box.innerHTML = r.items.map(m => '<button type="button" class="member-result member-open" data-cp="' + esc(m.user_id) + '" data-cp-name="' + esc(m.display_name) + '"><div class="member-copy"><strong>' + esc(m.display_name) + "</strong><span>" + esc(m.headline || "") + "</span></div></button>").join("") || '<p class="muted">' + esc(t("members.empty")) + "</p>";
        box.querySelectorAll("[data-cp]").forEach(b => b.addEventListener("click", () => { dealDraftFor = { id: b.dataset.cp, name: b.dataset.cpName }; dealNewForm(); })); } catch (x) { status(x.message, true); }
    };
    document.querySelector("#cp-find")?.addEventListener("click", find);
    document.querySelector("#deal-form").addEventListener("submit", async e => {
      e.preventDefault();
      if (!dealDraftFor) { status(t("deals.pickCounterparty"), true); return; }
      const f = new FormData(e.currentTarget);
      const body = { counterparty_user_id: dealDraftFor.id, my_role: String(f.get("my_role")), kind: String(f.get("kind")), title: String(f.get("title")).trim(), amount_kzt: Number(f.get("amount_kzt")), due_date: String(f.get("due_date")), my_party: readParty(f) };
      const desc = String(f.get("description") || "").trim(); if (desc) body.description = desc;
      try { const r = await api("/v1/deals", { method: "POST", body: JSON.stringify(body) }); dealId = r.id; status(t("deals.sent")); render("deal"); } catch (x) { status(x.message, true); }
    });
  }

  async function deal() {
    if (!dealId) return dealNewForm();
    const d = await api("/v1/deals/" + encodeURIComponent(dealId));
    const mine = d.role, other = mine === "seller" ? d.buyer_name : d.seller_name;
    const myAccepted = mine === "seller" ? d.seller_accepted_at : d.buyer_accepted_at;
    const act = (a, label, cls = "outline-button") => '<button type="button" class="' + cls + '" data-act="' + a + '">' + esc(label) + "</button>";
    let actions = "";
    if (d.status === "proposed" && !myAccepted) actions = '<form id="accept-form" class="app-form"><h3>' + esc(t("deals.acceptTitle")) + '</h3><p class="muted">' + esc(t("deals.acceptText")) + "</p>" + partyFields(savedParty()) + '<div class="receipt-actions"><button class="primary-button">' + esc(t("deals.accept")) + "</button>" + act("decline", t("deals.decline")) + "</div></form>";
    else if (d.status === "proposed") actions = '<p class="demo-note">' + esc(t("deals.waitingOther", { name: other })) + "</p>" + act("cancel", t("deals.cancel"));
    else {
      if (mine === "seller" && d.status === "accepted") actions += act("delivered", t(d.kind === "services" ? "deals.markDone" : "deals.markShipped"), "primary-button");
      if (mine === "buyer" && ["accepted", "delivered"].includes(d.status)) actions += act("report-payment", t("deals.reportPayment"), "primary-button");
      if (mine === "seller" && ["accepted", "delivered", "payment_reported", "mediation", "enforcement"].includes(d.status)) actions += act("confirm-payment", t("deals.confirmPayment"), d.status === "payment_reported" ? "primary-button" : "outline-button");
      if (mine === "seller" && d.overdue) actions += act("claim", t("deals.claim"));
      if (["accepted", "delivered", "payment_reported"].includes(d.status) && (d.overdue || mine === "buyer")) actions += act("mediation", t("deals.mediation"));
      if (mine === "seller" && (d.overdue || d.status === "mediation")) actions += act("enforcement", t("deals.enforcement"));
      if (mine === "seller" && ["paid", "mediation", "enforcement"].includes(d.status)) actions += act("close", t("deals.close"));
    }
    const steps = ["proposed", "accepted", "delivered", "paid"].map((s2, i) => { const order = { proposed: 0, accepted: 1, delivered: 2, payment_reported: 2, paid: 3, closed: 3, mediation: 2, enforcement: 2 }[d.status] ?? 0; return '<li class="' + (i <= order ? "done" : "") + '">' + esc(I18N.label("dealStatus", s2)) + "</li>"; }).join("");
    content.innerHTML =
      '<section class="lesson-box"><p class="eyebrow">' + esc(d.number) + '</p><h2>' + esc(d.title) + '</h2><p><strong>' + esc(money(d.amount_kzt)) + "</strong> · " + esc(t("deals.dueShort", { date: day(d.due_date) })) + ' · <span class="pill' + (d.overdue ? " warn-pill" : "") + '">' + esc(dealStatus(d)) + "</span></p>" +
        "<p>" + esc(t(mine === "seller" ? "deals.youSeller" : mine === "buyer" ? "deals.youBuyer" : "deals.youStaff", { seller: d.seller_name, buyer: d.buyer_name })) + "</p>" + (d.description ? '<p class="muted">' + esc(d.description) + "</p>" : "") + '<ol class="deal-steps">' + steps + "</ol></section>" +
      (d.overdue && mine === "seller" ? '<div class="demo-note warn-note">' + esc(t("deals.overdueHelp", { n: d.days_overdue })) + "</div>" : "") +
      (actions ? '<section class="lesson-box"><div class="receipt-actions deal-actions">' + actions + "</div></section>" : "") + '<div id="deal-extra"></div>' +
      docBox(t("deals.contract"), d.contract, "dogovor-" + d.number + ".txt") +
      '<section class="lesson-box"><h3>' + esc(t("deals.history")) + '</h3><ol class="deal-log">' + d.events.map(e => "<li><strong>" + esc(I18N.label("dealEvent", e.kind)) + "</strong> · " + esc(e.actor) + " · " + esc(date(e.created_at)) + (e.note ? "<br><span class=\"muted\">" + esc(e.note) + "</span>" : "") + "</li>").join("") + "</ol></section>";
    wireDocs(content);
    const accept = document.querySelector("#accept-form");
    if (accept) accept.addEventListener("submit", async e => { e.preventDefault(); try { await api("/v1/deals/" + encodeURIComponent(d.id) + "/accept", { method: "POST", body: JSON.stringify({ party: readParty(new FormData(accept)) }) }); status(t("deals.accepted")); await deal(); } catch (x) { status(x.message, true); } });
    content.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", async () => {
      const a = b.dataset.act;
      let note;
      if (a === "mediation") { note = prompt(t("deals.mediationPrompt")); if (note === null) return; }
      if (["decline", "cancel", "confirm-payment", "enforcement"].includes(a) && !confirm(t("deals.confirm." + a))) return;
      try {
        const r = await api("/v1/deals/" + encodeURIComponent(d.id) + "/" + a, { method: "POST", body: JSON.stringify(note ? { note } : {}) });
        if (a === "claim") { await deal(); document.querySelector("#deal-extra").innerHTML = docBox(t("deals.claimTitle"), r.claim, "pretenziya-" + d.number + ".txt"); wireDocs(document.querySelector("#deal-extra")); document.querySelector("#deal-extra").scrollIntoView(); return; }
        if (a === "enforcement") { await deal(); const g = r.guide; document.querySelector("#deal-extra").innerHTML = '<section class="lesson-box"><h3>' + esc(t("deals.guideTitle")) + "</h3><h4>" + esc(t("deals.guideDocs")) + "</h4><ul>" + g.documents.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul>" + g.steps.map(s2 => "<h4>" + esc(s2.title) + "</h4><p>" + esc(s2.text) + "</p>").join("") + '<p class="muted">' + esc(g.disclaimer) + '</p><div class="receipt-actions"><button type="button" class="outline-button" data-view="experts">' + esc(t("deals.findLawyer")) + "</button></div></section>"; document.querySelector("#deal-extra").scrollIntoView(); return; }
        status(t("biz.saved")); await deal();
      } catch (x) { status(x.message, true); }
    }));
  }

  async function adminDeals() {
    const d = await api("/v1/admin/deals");
    content.innerHTML = '<div class="kpi-grid">' + statTile(t("adminDeals.total"), d.deals_total) + statTile(t("adminDeals.paid"), money(d.paid_in_club_kzt)) + "</div>" +
      panel(t("adminDeals.title"), t("adminDeals.text"), d.items.length ? d.items.map(x => '<article class="invoice-card"><div class="invoice-top"><div><h3>' + esc(x.number) + " · " + esc(x.title) + "</h3><small>" + esc(x.seller_name) + " → " + esc(x.buyer_name) + " · " + esc(money(x.amount_kzt)) + '</small></div><span class="pill' + (x.overdue ? " warn-pill" : "") + '">' + esc(dealStatus(x)) + "</span></div>" + (x.mediation_note ? "<p>" + esc(x.mediation_note) + "</p>" : "") + '<div class="receipt-actions"><button type="button" class="outline-button" data-deal="' + esc(x.id) + '">' + esc(t("adminDeals.open")) + "</button></div></article>").join("") : '<p class="muted">' + esc(t("adminDeals.empty")) + "</p>");
    content.querySelectorAll("[data-deal]").forEach(b => b.addEventListener("click", () => { dealId = b.dataset.deal; render("deal"); }));
  }

  const RENDERERS = { "my-card": myCard, "admin-bans": adminBans, "admin-activity": adminActivity, "admin-subscriptions": adminSubscriptions, blogger, overview, profile: profileView, members, companies, events, "events-admin": eventsAdmin, notifications, admin, experts, "admin-experts": adminExperts, learn: () => { switchCatalog("courses"); return learn(); }, books: () => { switchCatalog("books"); return learn(); }, course, lesson, team, "admin-learn": adminLearn, announcements, "admin-announcements": adminAnnouncements, discounts, card, partner, "admin-discounts": adminDiscounts, membership: membershipWithInvite, feedback, "admin-stats": adminStats, "admin-feedback": adminFeedback, "admin-referrals": adminReferrals, "admin-staff": adminStaff, business, "admin-loans": adminLoans, certificate, checkin, polls, "admin-pulse": adminPulse, "admin-polls": adminPolls, "admin-learning-orders": adminLearningOrders, services: me, me, messages, chat, "admin-chats": adminChats, tests, test, settings, member, trust, "admin-trust": adminTrust, deals, deal, "admin-deals": adminDeals, "admin-partners": () => adminPartners(), "admin-proposals": adminProposals, "partner-apply": partnerApply, host, recordings, templates, professions };

  function allowed(view) {
    if (!RENDERERS[view]) return false;
    if (APP === "pilot") return pilotMode() === "admin" ? !RESIDENT_ONLY.includes(view) || view === "me" : !ADMIN_VIEWS.includes(view);
    if (APP === "resident" && ADMIN_VIEWS.includes(view)) return false;
    if (APP === "admin" && RESIDENT_ONLY.includes(view)) return false;
    return true;
  }

  // Screens render one after another: a slow screen can't finish after a
  // newer tap and overwrite it. Renderers never call render() themselves.
  let renderQueue = Promise.resolve();
  function render(view = active, opts = {}) {
    if (view !== active && token()) {
      if (opts.back) { /* history already moved */ }
      else if (opts.tab) { navStack = []; try { history.replaceState({ v: view }, ""); } catch { /* sandboxed frame */ } }
      else { navStack.push(active); if (navStack.length > 50) navStack.shift(); try { history.pushState({ v: view }, ""); } catch { /* sandboxed frame */ } }
    }
    const run = renderQueue.then(() => renderNow(view));
    renderQueue = run.catch(() => undefined);
    return run;
  }
  async function renderNow(view) {
    if (typeof cardTimer !== "undefined") clearInterval(cardTimer);
    if (typeof chatTimer !== "undefined") clearInterval(chatTimer);
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    active = allowed(view) ? view : (APP === "admin" || (APP === "pilot" && pilotMode() === "admin") ? "admin-stats" : "overview");
    I18N.applyStatic();
    if (!token()) { signedOut(); return; }
    authBar();
    if (APP === "admin" && !isStaff(await loadRoles())) { noAdminAccess(); return; }
    const navActive = navBlock(active);
    document.querySelectorAll(".nav-item").forEach(b => {
      const on = b.dataset.view === navActive;
      b.classList.toggle("active", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    syncMoreButton();
    syncBackButton();
    setHeading(active);
    status("");
    content.innerHTML = '<div class="loading-panel">' + esc(t("common.loading")) + "</div>";
    try {
      await RENDERERS[active]();
      trackView(active);
      blockTabs();
      refreshMessageBadge();
      maybeNudge();
    } catch (e) {
      if (e.status === 401) { clearTokens(); signedOut(); status(t("auth.sessionExpired"), true); return; }
      content.innerHTML = '<div class="empty-panel"><h2>' + esc(t("render.errorTitle")) + "</h2><p>" + esc(e.message) + '</p><button class="primary-button" id="retry">' + esc(t("render.retry")) + "</button></div>";
      document.querySelector("#retry").addEventListener("click", () => render(active));
    }
  }

  // Usage stats for the team: which section is open and for how long. No content, never blocks the UI.
  let trackedView = "";
  function trackSend(body) {
    if (!token() || APP === "admin" || (APP === "pilot" && pilotMode() === "admin")) return;
    api("/v1/me/activity", { method: "POST", body: JSON.stringify(body) }).catch(() => undefined);
  }
  function trackView(view) {
    if (ADMIN_VIEWS.includes(view)) { trackedView = ""; return; }
    trackedView = view;
    trackSend({ view, hit: true });
  }
  setInterval(() => { if (trackedView && !document.hidden && token()) trackSend({ view: trackedView, seconds: 30 }); }, 30000);

  document.addEventListener("click", e => {
    const b = e.target.closest("[data-view]");
    if (b) { e.preventDefault(); render(b.dataset.view, { tab: !!b.closest(".sidebar nav") && b.hasAttribute("data-primary") }); }
    const crm = e.target.closest("[data-crm-link]");
    if (crm && !crmUrl) { e.preventDefault(); status(t("adminApp.crmMissing"), true); }
  });

  async function boot() {
    I18N.applyStatic();
    captureInvite();
    captureClockLink();
    const evParam = new URLSearchParams(location.search).get("event");
    if (evParam && /^[0-9a-f-]{36}$/i.test(evParam)) { focusEvent = evParam; active = "events"; }
    const expertToken = new URLSearchParams(location.search).get("expert");
    if (expertToken) { try { sessionStorage.setItem("friends.expertInvite", expertToken); } catch { /* single page */ } history.replaceState(null, "", location.pathname); }
    candidateToken = new URLSearchParams(location.search).get("test");
    if (candidateToken) { document.body.classList.add("candidate-mode"); return candidateTest(candidateToken); }
    authBar();
    try { await callback(); } catch (e) { signedOut(); status(e.message || t("auth.error"), true); return; }
    if (!token()) { signedOut(); return; }
    try {
      user = await api("/v1/auth/me");
      await syncLocaleAfterSignIn();
      let pendingExpert = null;
      try { pendingExpert = sessionStorage.getItem("friends.expertInvite"); } catch { /* none */ }
      if (pendingExpert) {
        try { sessionStorage.removeItem("friends.expertInvite"); } catch { /* none */ }
        try { const acc = await api("/v1/expert-invites/" + encodeURIComponent(pendingExpert) + "/accept", { method: "POST", body: "{}" }); active = "experts"; nudgeChecked = true; status(t("partners.accepted", { months: acc.free_months })); } catch (x) { status(x.message, true); }
      }
      await afterSignIn();
    } catch (e) {
      clearTokens();
      signedOut();
      status(e.message, true);
    }
  }

  boot();
})();
