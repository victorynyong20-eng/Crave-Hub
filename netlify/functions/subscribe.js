// Newsletter signup through Klaviyo's Bulk Subscribe Profiles endpoint. Requires explicit consent.
const L = require("./_lib");

exports.handler = L.wrap("subscribe", "POST", async ({ cfg, body, out, log }) => {
  const email = String(body.email || "").trim().toLowerCase();
  if (!L.validEmail(email)) return out(400, { ok: false, error: "invalid_email" });
  if (body.consent !== true) return out(400, { ok: false, error: "consent_required" });
  if (!cfg.listId) return out(503, { ok: false, error: "klaviyo_list_not_configured" });

  const r = await L.klaviyo(cfg, "/api/profile-subscription-bulk-create-jobs", { method: "POST", body: { data: {
    type: "profile-subscription-bulk-create-job",
    attributes: {
      custom_source: "Crave Hub website newsletter" + (cfg.env === "demo" ? " (demo)" : ""),
     profiles: { data: [{
  type: "profile",
  attributes: {
    email,
    subscriptions: {
      email: {
        marketing: {
          consent: "SUBSCRIBED"
        }
      }
    }
  }
}] },
    relationships: { list: { data: { type: "list", id: cfg.listId } } },
  } } });

  log({ action: "subscribe", to: L.mask(email), status: r.status, reqId: r.requestId, codes: L.errCodes(r) });
  if (r.status === 202) return out(200, { ok: true, accepted: true });
  return out(502, { ok: false, error: "klaviyo_rejected", status: r.status });
});
