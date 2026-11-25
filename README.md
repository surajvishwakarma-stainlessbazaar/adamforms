# adamforms

Mobile web forms for Stainless Bazaar members, opened from WhatsApp links sent by ADAM (the WhatsApp bot).

| Form | Path | What it does |
|---|---|---|
| Register | `/register/` | New member sign-up |
| Enquiry | `/lead/` | Send a buying enquiry (ask for a price) |
| Stock | `/stock/` | List material for sale |

Plain HTML, CSS and vanilla JavaScript. There is no build step and nothing to install.

## Project structure

```
index.html              Router: /?p=register|lead|stock (aliases: enquiry, sell, signup, ...)
register/index.html     Register form
lead/index.html         Enquiry form
stock/index.html        Stock form
assets/
  css/style.css         Shared styles
  img/logo.webp         Logo
  js/config.js          Settings: API base URL and GA4 ID
  js/analytics.js       Google Analytics 4 loader and sbTrack()
  js/common.js          Shared code: validation, drafts, API client, submit, errors
  js/pages/*.js         Logic for each form
CHANGELOG.md            History of every change
```

Each form loads its scripts in this order: `config.js` → `analytics.js` → an inline `SB = { api, page }` → `common.js` → `pages/<form>.js`.

## How it works

1. ADAM sends a link such as `https://<domain>/lead/?encrypted_token=XXX&utm_source=whatsapp&...`. The token lasts 1 hour and works for one form only.
2. On page load the form calls `POST /v1/token/decrypt`. The Enquiry and Stock forms then call `GET /v1/member` to fill in the member's details.
3. On submit the form sends JSON to `POST /v1/register`, `/v1/lead` or `/v1/stock`.

Every API call sends the token in the `X-Form-Token` header. See [CHANGELOG.md](CHANGELOG.md) for the full list of endpoints, request bodies and UTM links.

## Configuration

Settings live in a `.env` file, which is not committed. `assets/js/config.js` is generated from it.

1. Copy `.env.example` to `.env` and fill in the values.
2. Run `node scripts/build-config.mjs` (Node 18 or later, no install needed).

| Variable | Becomes | Meaning |
|---|---|---|
| `SB_API_URL` | `SB_CONFIG.api` | Form API base URL, no trailing slash. Leave it empty for demo mode, which makes no network calls and shows sample data. |
| `SB_GA_ID` | `SB_CONFIG.gaId` | GA4 measurement ID. Leave it empty to turn analytics off. |

Real environment variables override `.env`, so a CI or hosting build can run `SB_API_URL=... node scripts/build-config.mjs` before deploying.

These values end up in `config.js`, which the browser downloads, so they are not hidden from visitors. Never put a real secret (API keys, passwords) in them. Secrets belong on the Form API server.

## Running locally

Serve the folder with any static web server, for example:

```
npx serve .
```

or

```
python -m http.server 8080
```

Then open `http://localhost:8080/register/`. With `api` set, a form needs a valid `?encrypted_token=` in the URL. Without one it shows "This link has no login".

## Deploying

Upload the folder as it is to any static host (Nginx, S3 + CloudFront, Netlify, GitHub Pages). Point `api` in `config.js` at the production Form API first.

## Privacy

Only the form kind and the HTTP status are sent to Google Analytics. The token, mobile number, name, company and GSTIN are never sent, and `encrypted_token`, `t` and `m` are removed from the URL that GA records.

## Contributing

No change is made without the owner's approval. Record every change in `CHANGELOG.md`, newest first.
