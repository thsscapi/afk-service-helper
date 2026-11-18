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
