// Protected test tool. Step 1 sends a test event; step 2 reads it back from Klaviyo so you can see whether it was really ingested.
// Needs TEST_TOKEN to be set. Remove TEST_TOKEN to disable it. Needs events:read and profiles:read scopes for step 2.
const L = require("./_lib");

exports.handler = L.wrap("klaviyo-test", "GET", async ({ cfg, event, out, log }) => {
  const q = event.queryStringParameters || {};
  const tok = process.env.TEST_TOKEN;
  if (!tok) return out(404, { ok: false, error: "disabled" });
  const a = Buffer.from(String(q.token || "")), b = Buffer.from(tok);
  if (a.length !== b.length || !L.crypto.timingSafeEqual(a, b)) return out(401, { ok: false, error: "bad_token" });
  const email = String(q.email || "").trim().toLowerCase();
  if (!L.validEmail(email)) return out(400, { ok: false, error: "invalid_email" });

  if (q.step === "send") {
    const testId = "TEST-" + L.crypto.randomUUID();
    const r = await L.klaviyo(cfg, "/api/events", { method: "POST", body: L.eventBody(cfg, { cfg, email, metric: "Crave Hub Test Event", props: { test_id: testId } }) });
    log({ action: "test_send", to: L.mask(email), status: r.status, reqId: r.requestId, codes: L.errCodes(r) });
    return out(r.status === 202 ? 200 : 502, { ok: r.status === 202, accepted: r.status === 202, klaviyoStatus: r.status, testId,
      warning: L.PLACEHOLDER.test(email) ? "Placeholder domains may be filtered by Klaviyo. Use a real inbox." : undefined,
      next: "Wait about 30 seconds, then call step=check with this testId. 'accepted' does not prove ingestion." });
  }

  if (q.step === "check") {
    const testId = String(q.testId || "");
    if (!/^TEST-[0-9a-f-]{36}$/.test(testId)) return out(400, { ok: false, error: "invalid_test_id" });
    const f = (s) => encodeURIComponent(s);
    const p = await L.klaviyo(cfg, "/api/profiles?filter=" + f('equals(email,"' + email + '")'));
    const pid = p.data && p.data.data && p.data.data[0] && p.data.data[0].id;
    if (!pid) return out(200, { ok: true, profileFound: false, eventFound: false, note: "No profile yet. Wait and retry, or check the email address and key scopes." });
    const e = await L.klaviyo(cfg, "/api/events?filter=" + f('equals(profile_id,"' + pid + '")') + "&sort=-datetime&page%5Bsize%5D=20");
    const found = ((e.data && e.data.data) || []).some((x) => x.attributes && x.attributes.event_properties && x.attributes.event_properties.test_id === testId);
    log({ action: "test_check", to: L.mask(email), profileStatus: p.status, eventsStatus: e.status, found });
    return out(200, { ok: true, profileFound: true, eventFound: found, note: found ? "Klaviyo ingested the event." : "Not found yet. Retry in a minute, then see troubleshooting." });
  }
  return out(400, { ok: false, error: "step_must_be_send_or_check" });
});
