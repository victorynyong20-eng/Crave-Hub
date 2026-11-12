# Crave Hub website + Klaviyo (demo environment)

Demo/test project. No real payments, no real deliveries. Product photos are placeholders until you add your own.

## What is where
- `index.html` the whole website (menu prices and photos are in the `MEALS` list near the top of the script).
- `netlify/functions/menu.json` server-side prices. Keep in sync with `MEALS` in index.html. The server never trusts browser prices.
- `netlify/functions/track.js` product viewed, added to cart, checkout started, test order placed -> Klaviyo Create Event (`POST /api/events`)
- `netlify/functions/subscribe.js` newsletter -> Klaviyo Bulk Subscribe Profiles (`POST /api/profile-subscription-bulk-create-jobs`)
- `netlify/functions/klaviyo-test.js` protected tool that sends a test event and reads it back
- API revision is pinned to `2026-10-15` in `_lib.js`.

## 1. Klaviyo setup (use a separate test account if you can)
1. Create a list called "Crave Hub Newsletter (Demo)". Copy its List ID.
2. Settings > API keys > Create private API key, custom access. Tick only: Events (read, write), Profiles (read, write), Lists (read, write), Subscriptions (write). Copy the key once.
3. Never paste the key in chat, in code or in GitHub.

## 2. Deploy (free)
1. Put this folder in a GitHub repo (the `.gitignore` keeps secrets out).
2. Netlify > Add new site > Import from GitHub > pick the repo > Deploy.
3. Site configuration > Environment variables: add everything in `.env.example` (demo values only). Redeploy.

## 3. Test that events really reach Klaviyo
Replace the capitals. Use a REAL inbox you own, not an example.com address.
1. `https://YOUR-SITE/.netlify/functions/klaviyo-test?step=send&token=YOUR_TEST_TOKEN&email=YOU@REALINBOX.com`
   You get `accepted: true` and a `testId`. Accepted only means Klaviyo received the request.
2. Wait 30 to 60 seconds, then open
   `https://YOUR-SITE/.netlify/functions/klaviyo-test?step=check&token=YOUR_TEST_TOKEN&email=YOU@REALINBOX.com&testId=THE_TEST_ID`
   `eventFound: true` means Klaviyo ingested it.
3. Also confirm by eye: Klaviyo > Profiles > search the email > Activity feed shows "Crave Hub Test Event".
4. Then use the real site: tick the consent box and subscribe, view a meal, add to cart, check out. Each should appear in the profile's activity feed as Viewed Product, Added to Cart, Started Checkout, Placed Order. The site shows what Klaviyo confirmed. Delete TEST_TOKEN when finished.

## If something does not show up
- `klaviyo_not_configured`: key variable missing, or you did not redeploy after adding it.
- `klaviyo_rejected` with status 401/403: wrong key or missing scope. 400: payload problem, see Netlify > Functions > logs (they show status codes, never keys).
- Accepted but not found: wait a few minutes, check the profile by exact email, avoid placeholder domains, check you are in the right Klaviyo account.
- Subscribed but no welcome email: check the list's double opt-in setting, the flow status and the Spam folder.
- Events only fire once the visitor has given an email (newsletter signup or checkout).

## Safety rules built in
Private keys live only in environment variables. Demo and production use different variables, and every demo event carries `test: true`. Order events are accepted only for `CH-TEST-` references and are refused outright in production until verified payments exist. Newsletter signup requires consent. Logs mask emails.

## Run the tests yourself
`node tests/functions.test.js` (fake Klaviyo) and `python3 tests/frontend.test.py` (needs Playwright). These do not contact Klaviyo.
