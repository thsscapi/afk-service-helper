# Cloudflare hosting

## Retired into HT Timer — 28 November 2026

The public Worker redirects to httimer.sparrowtools.net. API routes return 410;
the old Sheets importer is not publicly reachable. /sw.js unregisters old service
workers without deleting browser local storage. Old source is retained for rollback.
Do not re-enable the asset bypass: run_worker_first must remain true.
Death/Res/TL levels, labels, body status and the event log now live in HT Timer.

Production hosting moved from Vercel to Cloudflare Workers on 18 November 2026.
Use the custom domain configured in wrangler.jsonc.
The Vercel project was retired; GitHub pushes no longer deploy automatically.

From this repository:

```sh
node prepare-cloudflare.mjs
npx wrangler@4.159.0 deploy
```

The Sparrow Tools private traffic collector remains enabled. Vercel Web Analytics
is not used on Cloudflare hosting. Browser local storage is unchanged because the
custom domain is unchanged. Do not upload secrets or server code into the asset directory.
## Security headers

Keep the generated `_headers` file (and `security-headers.js` where present).
After builds or inline-script changes, run `node scripts/generate-security-headers.mjs`
from the parent Boss Timer App workspace before deploying. This updates CSP hashes,
static headers and Worker response policies. Do not enable unsafe-eval or broadly
allow inline scripts to bypass a policy error. Vite preserves public/_headers.

