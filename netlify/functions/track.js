// Receives site actions and forwards them to Klaviyo's server-side Create Event endpoint.
const L = require("./_lib");

exports.handler = L.wrap("track", "POST", async ({ cfg, body, out, log }) => {
  const email = String(body.email || "").trim().toLowerCase();
  if (!L.validEmail(email)) return out(400, { ok: false, error: "invalid_email" });
  const base = { cfg, email };
  const url = cfg.siteUrl ? cfg.siteUrl + "/#cart" : undefined;
  let ev;

  switch (body.action) {
    case "viewed_product": {
      const m = L.MENU.meals[body.mealId];
      if (!m) return out(400, { ok: false, error: "unknown_meal" });
      ev = L.eventBody(cfg, { ...base, metric: "Viewed Product", value: m.price,
        props: { ProductID: body.mealId, ProductName: m.name, Price: m.price } });
      break;
    }
    case "added_to_cart":
    case "started_checkout": {
      const p = L.priceLines(body.cart);
      if (!p) return out(400, { ok: false, error: "invalid_cart" });
      const added = L.MENU.meals[body.mealId];
      ev = L.eventBody(cfg, { ...base, metric: body.action === "added_to_cart" ? "Added to Cart" : "Started Checkout",
        value: p.subtotal,
        props: { ItemNames: p.lines.map((l) => l.ProductName), Items: p.lines, ItemCount: p.lines.length, CheckoutURL: url,
          ...(body.action === "added_to_cart" && added ? { AddedItemProductName: added.name, AddedItemPrice: added.price } : {}) } });
      break;
    }
    case "placed_order": {
      // Real orders need verified payment, which this project does not have yet. Refuse rather than fake it.
      if (cfg.env === "production") return out(501, { ok: false, error: "production_orders_need_verified_payment" });
      const ref = String(body.orderRef || "");
      if (!/^CH-TEST-[A-Z0-9]{8}$/.test(ref)) return out(400, { ok: false, error: "invalid_test_order_ref" });
      const p = L.priceLines(body.items);
      if (!p) return out(400, { ok: false, error: "invalid_items" });
      const parts = L.clean(body.name).split(/\s+/).filter(Boolean);
      ev = L.eventBody(cfg, { ...base, metric: "Placed Order", uniqueId: ref, value: p.subtotal + L.MENU.delivery,
        first: parts[0], last: parts.slice(1).join(" ") || undefined,
        props: { OrderId: ref, Items: p.lines, ItemNames: p.lines.map((l) => l.ProductName), ItemCount: p.lines.length,
          Subtotal: p.subtotal, DeliveryFee: L.MENU.delivery } });
      break;
    }
    default: return out(400, { ok: false, error: "unknown_action" });
  }

  const r = await L.klaviyo(cfg, "/api/events", { method: "POST", body: ev });
  log({ action: body.action, to: L.mask(email), status: r.status, reqId: r.requestId, codes: L.errCodes(r) });
  // 202 means Klaviyo accepted the request. It does not prove the event was ingested; use klaviyo-test to check.
  if (r.status === 202) return out(200, { ok: true, accepted: true });
  return out(502, { ok: false, error: "klaviyo_rejected", status: r.status });
});
