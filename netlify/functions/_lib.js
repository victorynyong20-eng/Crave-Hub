// Shared helpers for the Klaviyo functions. Private keys are read from environment variables only.
const crypto = require("crypto");
const MENU = require("./menu.json");

const REVISION = "2026-10-15";           // Klaviyo API revision, pinned on purpose
const API = "https://a.klaviyo.com";
const EMAIL_RE = /^[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]{2,}$/;
const PLACEHOLDER = /@(example\.(com|org|net)|test\.com)$/i;

const validEmail = (e) => typeof e === "string" && e.length <= 254 && EMAIL_RE.test(e);
const mask = (e) => String(e).replace(/^(.).*(@.*)$/, "$1***$2");
const clean = (s, n = 60) => String(s || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);

function config() {
  const env = (process.env.KLAVIYO_ENV || "demo").toLowerCase();
  if (env !== "demo" && env !== "production") return { error: "bad_env" };
  const sfx = env === "demo" ? "DEMO" : "PROD";
  return {
    env,
    key: process.env["KLAVIYO_API_KEY_" + sfx],
    listId: process.env["KLAVIYO_LIST_ID_" + sfx],
    siteUrl: (process.env.SITE_URL || "").replace(/\/$/, ""),
  };
}

async function klaviyo(cfg, path, { method = "GET", body } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(API + path, {
      method,
      signal: ctl.signal,
      headers: {
        Authorization: "Klaviyo-API-Key " + cfg.key,
        revision: REVISION,
        accept: "application/vnd.api+json",
        ...(body ? { "content-type": "application/vnd.api+json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const txt = await res.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch (e) { /* non-JSON body */ }
    return { ok: res.ok, status: res.status, data, requestId: res.headers.get("x-klaviyo-req-id") };
  } finally { clearTimeout(timer); }
}

const errCodes = (r) => ((r.data && r.data.errors) || []).map((e) => e.code).filter(Boolean).slice(0, 5);

// Validates cart lines against OUR menu (never trusts browser prices).
function priceLines(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 10) return null;
  const lines = [];
  for (const it of items) {
    const m = MENU.meals[it && it.id];
    const qty = Number(it && it.qty);
    if (!m || !Number.isInteger(qty) || qty < 1 || qty > 20) return null;
    lines.push({ ProductID: it.id, ProductName: m.name, Quantity: qty, ItemPrice: m.price, RowTotal: m.price * qty });
  }
  return { lines, subtotal: lines.reduce((a, l) => a + l.RowTotal, 0) };
}

function eventBody(cfg, { metric, email, first, last, props, value, uniqueId }) {
  const profile = { email, properties: { crave_hub_environment: cfg.env } };
  if (first) profile.first_name = first;
  if (last) profile.last_name = last;
  const attributes = {
    properties: { environment: cfg.env, test: cfg.env === "demo", source: "crave-hub-website", ...props },
    time: new Date().toISOString(),
    unique_id: uniqueId || crypto.randomUUID(),
    metric: { data: { type: "metric", attributes: { name: metric } } },
    profile: { data: { type: "profile", attributes: profile } },
  };
  if (value != null) { attributes.value = value; attributes.value_currency = MENU.currency; }
  return { data: { type: "event", attributes } };
}

function wrap(name, method, fn) {
  return async (event) => {
    const out = (s, o) => ({ statusCode: s, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(o) });
    if (event.httpMethod !== method) return out(405, { ok: false, error: "method_not_allowed" });
    const allowed = process.env.ALLOWED_ORIGIN, origin = (event.headers || {}).origin;
    if (allowed && origin && origin !== allowed) return out(403, { ok: false, error: "origin_not_allowed" });
    const cfg = config();
    if (cfg.error) return out(500, { ok: false, error: "server_misconfigured" });
    if (!cfg.key) return out(503, { ok: false, error: "klaviyo_not_configured" });
    let body = {};
    if (method === "POST") {
      if ((event.body || "").length > 10000) return out(413, { ok: false, error: "payload_too_large" });
      try { body = JSON.parse(event.body || "{}"); } catch (e) { return out(400, { ok: false, error: "invalid_json" }); }
    }
    const log = (x) => console.log(JSON.stringify({ fn: name, env: cfg.env, ...x }));
    try { return await fn({ cfg, body, event, out, log }); }
    catch (e) { console.error(JSON.stringify({ fn: name, env: cfg.env, error: e.name })); return out(502, { ok: false, error: "upstream_failed" }); }
  };
}

module.exports = { MENU, REVISION, validEmail, mask, clean, config, klaviyo, errCodes, priceLines, eventBody, wrap, PLACEHOLDER, crypto };
