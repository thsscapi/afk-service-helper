# Sheets importer controls

The Worker limits imports to 5 requests per source and 100 globally per 10 minutes.
Limits persist across restarts. Cached requests still count toward these limits.
Identical import payloads are cached internally for 60 seconds at the Cloudflare
location handling them; browser responses stay no-store. Cache misses at another
location can still reach Google. This cache is not an authentication boundary.

Requests are same-origin POST with a 12 KB body cap. Spreadsheet IDs and cell
ranges are validated by the shared importer. Google responses have 15-second
request timeouts and a 2 MB body cap. Upstream requests go only to the configured
Google Sheets endpoint, never to MapleLegends.

The source identifier is a hash of the Cloudflare-reported IP, retained only in
short-lived rate-limit buckets. Global ceilings intentionally favor safety over
availability if the service is attacked.
