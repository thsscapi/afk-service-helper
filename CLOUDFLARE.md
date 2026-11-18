# Cloudflare hosting

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

