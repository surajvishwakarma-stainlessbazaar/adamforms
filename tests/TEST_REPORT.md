# Form test report

**Date:** 2026-11-25 · **Branch:** `development` · **Browser:** Chrome (headless, 400 px wide, phone size)
**Result:** 80 of 85 checks passed · **3 bugs found** (5 failing checks) · 4 smaller issues from reading the code

## How the tests work

`tests/e2e.mjs` serves the site locally and opens each form the way a member does, from a WhatsApp-style link such as:

```
/lead/?encrypted_token=LEADTOK&utm_source=whatsapp&utm_medium=waba&utm_campaign=add_enquiry&utm_content=template_a&utm_id=pull_journey
```

The Form API (`https://stagingevolveapi.stainlessbazaar.com`) is **mocked**: no real calls are made and no staging data is touched. The pincode service and Google Analytics are mocked too. Every API request the page makes is recorded, with its method, path, `X-Form-Token` header and JSON body, and then checked.

Run again with:

```
cd tests
npm install
npm test
```

Detailed results are written to `tests/results.json`.

## Step-by-step flow checked

| Step | Register | Enquiry (lead) | Stock |
|---|---|---|---|
| 1. Link opened with `?encrypted_token=` | ✅ | ✅ | ✅ |
| 2. `POST /v1/token/decrypt` with `{token, kind}` and `X-Form-Token` | ✅ kind `register` | ✅ kind `lead` | ✅ kind `stock` |
| 3. `GET /v1/member?kind=` | ✅ not called (correct) | ✅ `?kind=lead` | ✅ `?kind=stock` |
| 4. Pre-fill | ✅ mobile from token, `+91` removed, read-only | ✅ "Sending as Ravi Kumar, Acme Steels"; category, thickness, finish and qty (5 MT → 5000 Kg) from the token's spec | ✅ "Sending as"; empty spec leaves the fields blank |
| 5. Member fills in the form; validation | ✅ | ✅ | ✅ (expiry must be after today) |
| 6. Submit: `POST /v1/<kind>` JSON with `X-Form-Token` | ✅ 202, mobile not sent | ✅ 201, names not IDs, numbers typed correctly | ✅ 201, but expiry missing (Bug 2) |
| 7. Success screen and reference | ✅ "Received" | ✅ `ENQ-1001` from server | ✅ `STK-2001` from server |
| 8. GA4 conversion event | ✅ `sign_up` | ✅ `generate_lead` | ✅ `add_stock` |

## All tests

| Test | Result |
|---|---|
| Router: `/?p=enquiry` goes to `/lead/`, keeps the token and UTMs, removes `p`, loads GA only once | ✅ 5/5 |
| Register: happy path (decrypt → pre-fill → pincode lookup → submit 202 → GA, no personal data sent to GA) | ✅ 19/19 |
| Register: link without a token → "no login" message, no API call, Submit disabled, `form_error` 401 | ✅ 4/4 |
| Register: expired token (410) → "expired" message, Submit disabled | ✅ 2/2 |
| Register: empty submit and bad GSTIN are blocked with messages | ✅ 3/3 |
| Register: 422 with the server's detail shown, Submit re-enabled, retry succeeds | ✅ 3/3 |
| Register: network failure → "could not connect", `form_error` status 0 | ✅ 2/2 |
| Enquiry: happy path (decrypt → member → pre-fill from spec → submit 201) | ✅ 17/17 |
| Enquiry: grade is sent to the API | ❌ 0/1 (Bug 1) |
| Enquiry: 2 sizes (one in inches), max 10 sizes, partial address blocked, new address sent | ✅ 6/6 |
| Enquiry: token for another form (400) → message, member not called, Submit disabled | ✅ 3/3 |
| Enquiry: member lookup fails (401) → message, Submit disabled | ✅ 2/2 |
| Enquiry: double click sends only one POST | ✅ 1/1 |
| Stock: happy path (submit 201, ref, `add_stock`) | ✅ 8/9 (Bug 2) |
| Stock: expiry of today is rejected | ✅ 1/1 |
| Stock: draft survives a page reload | ❌ 1/4 (Bug 3) |
| Demo mode (`api` empty): demo banner, sample addresses, no outside calls | ✅ 3/3 |

No JavaScript errors appeared on any page.

## Bugs

### Bug 1: Grade is not sent (Enquiry and Stock)
**Where:** `assets/js/pages/lead.js` and `stock.js`, submit handler (`var body = {...}`)
**What happens:** the member picks Brand → **Grade** (for example "300") → Sub grade ("304"), but the body sends only `brandName` and `subGrade`. The grade itself is never sent, though the success screen shows it ("Make and grade").
**Impact:** low if the API works out the grade from the sub grade. Some sub grades sit under more than one grade family for the same brand, so the API could pick the wrong one.
**Fix:** check the API spec (B3.4). If it accepts a grade, add `gradeName: txt("grade")` to the body.

### Bug 2: Stock "listed until" date is not sent
**Where:** `assets/js/pages/stock.js`, submit handler
**What happens:** the expiry date is required, checked ("Pick a date after today") and shown on the success screen as "Listed until", but it is **not in the `POST /v1/stock` body**.
**Impact:** high. The member thinks the listing ends on the chosen date, but the backend never receives it.
**Fix:** add the date to the body under the field name the API expects, for example `body.expiry = g("expiry")` or `expiryDate`. Confirm the name with the API spec.

### Bug 3: Saved draft loses most fields after a reload (Enquiry and Stock)
**Where:** `assets/js/common.js` `load()` runs before `pages/*.js` builds the dynamic fields
**What happens:** after a reload (or when the phone reopens the tab), only plain fields such as the product name come back. **Category, brand, grade, sub grade and every size field are lost.**
- The category, brand and grade options don't exist yet when the draft is restored.
- Size fields have no `name`, so they are never saved at all.

**Impact:** medium. The member has to redo most of the form, which hurts on WhatsApp's in-app browser, where reloads are common.
**Fix:** call `load()` again at the end of `lead.js` and `stock.js` (after the options and sizes are built), restoring brand → grade → sub grade in that order. Save size rows as an array in the draft.

## Smaller issues (from reading the code, not failing tests)

| # | Issue | Where | Suggestion |
|---|---|---|---|
| 4 | A token spec with unit `tons`, `MT ` (with a space) or `quintal` is treated as Kg, because only `mt`, `ton` and `tonne` convert to Kg | `applySpec()` in lead.js and stock.js | Trim the unit and add `tons` and `quintal` (100 Kg) |
| 5 | Category pre-fill matches by prefix, so a spec of `AOD` always picks "AOD / Induction Flat", never "Patta" | `pickOption()` | Prefer an exact match first, then the prefix |
| 6 | If the decrypt or member call fails because of a weak network, Submit stays disabled and the only fix is reloading the page | `loadContext()` in common.js | Add a "Try again" button for status 0 |
| 7 | `config.js` points at the **staging** API (`stagingevolveapi…`) | `assets/js/config.js` | Switch to the production Form API before going live |

## Not covered

- The real Form API. Every response here is mocked, so the request bodies should also be checked once against staging with a real token.
- The "Use my location" button, which needs GPS permission (the OpenStreetMap lookup).
- Older Android WebViews and iOS Safari. Only Chrome was tested.
