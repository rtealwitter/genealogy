# Live genealogy API

This small Cloudflare Worker makes browser name searches and advisor imports possible. The static website remains on GitHub Pages. No MGP credentials are needed.

Deployed API: **https://genealogy-api.rtealwitter.workers.dev**.

`GET /search?q=Albert%20Einstein` returns `{ candidates: [{ id, name, detail }], truncated, fetchedAt }`. IDs are numeric strings; at most 100 candidates are returned. Select a candidate rather than assuming the first substring match is correct.

`GET /person?id=53269` returns `{ person, advisorNames, fetchedAt }`. The person follows the website's dataset schema; advisor IDs have an `mgp-` prefix. `GET /health` reports availability without contacting MGP.

Historical MGP relationships labeled Tutor, Teacher, Mentor, or Supervisor are included, with the original relationship label preserved in the person's note. This avoids presenting an older tutoring relationship as a modern doctoral advisorship.

Doctoral advisor and Adviser spellings are also recognized, including records with several degrees. If a person link before the student section is not accounted for by a recognized advisor relationship, parsing stops with an error instead of silently dropping that ancestor.

One global SQLite Durable Object shares the cache and persists the crawl clock across deployments/restarts. **Every** upstream request, including search-session redirects, is at least 10 seconds after the previous request. Fresh searches can take 10–30 seconds. Busy uncached requests return HTTP 429 and `Retry-After`; clients should wait, show progress, and retry. Cached person records last 90 days, searches 7 days; cache storage is capped at 10,000 entries. Cookies are kept only for the current search. Parser/source failures return HTTP 502 rather than invented data.

Only fixed paths at `https://www.mathgenealogy.org/` are fetched, with manual same-origin redirect validation, input bounds, a timeout, and an HTML size check. Browser CORS allows the personal website, GitHub Pages, and localhost ports 8000/8765. CORS is browser access control, not authentication; the global throttle also bounds upstream requests from non-browser clients. No secrets are stored in the worker or repository.

To develop or redeploy, install Node 20.19+ and run in this directory:

```sh
npm ci
npm test
npm run dev
# Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in your environment.
npm run deploy
```

Wrangler creates the SQLite Durable Object namespace on the first deploy. Update the frontend API base URL after deploying to another account. The token needs Workers Scripts edit and the ability to provision the Durable Object binding. Cloudflare account plan quotas apply; this deployment does not change the account's plan.
