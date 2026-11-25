/* Shared settings for every page.
   api : Form API base URL (no trailing slash), e.g. "https://forms-api.example.com".
         Empty = demo mode (no network calls, preview data only).
   Endpoints used (see CHANGELOG): POST /v1/token/decrypt, GET /v1/member,
   POST /v1/register, POST /v1/lead, POST /v1/stock. Auth: header X-Form-Token = ?encrypted_token= from the link.
   gaId: GA4 measurement ID (analytics.js). */
var SB_CONFIG = {
  // api: "https://stagingevolveapi.stainlessbazaar.com",
  api: "https://d315dphukdscum.cloudfront.net" /* LOCAL TEST ONLY: ADAM form_api. Do not commit. */,
  gaId: "G-Q782SD58XK" /* Google Analytics 4 measurement ID; empty = analytics off */,
  // gaId: "" /* Google Analytics 4 measurement ID; empty = analytics off */,
};
