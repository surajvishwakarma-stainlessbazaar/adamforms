// End-to-end tests for the three forms, run in real Chrome with a mocked Form API.
// Usage (from tests/):  npm install  then  npm test
// Optional: CHROME_PATH=<path to chrome/edge>. Results also go to tests/results.json.
import { chromium } from "playwright-core";
import http from "node:http";
import { readFileSync, existsSync, statSync, writeFileSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = (readFileSync(join(ROOT, "assets/js/config.js"), "utf8").match(/api:\s*"([^"]*)"/) || [])[1] || "";
const CHROME =
  process.env.CHROME_PATH ||
  ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome"].find(existsSync);

// ---------- static server ----------
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".json": "application/json" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let f = join(ROOT, p);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
  if (!f.startsWith(ROOT) || !existsSync(f)) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "Content-Type": TYPES[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const UTM = "utm_source=whatsapp&utm_medium=waba&utm_content=template_a&utm_id=pull_journey";

// ---------- results ----------
const results = [];
let current = "";
function check(name, ok, detail) {
  results.push({ test: current, check: name, ok: !!ok, detail: ok ? undefined : detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + JSON.stringify(detail)}`);
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

// mock: { "POST /v1/token/decrypt": {status, body} | (req)=>({status, body}) | "fail" }
async function open(path, mock = {}) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } });
  const page = await ctx.newPage();
  const calls = [];
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.startsWith(BASE)) return route.continue();
    if (API && url.startsWith(API)) {
      const u = new URL(url);
      const key = `${req.method()} ${u.pathname}`;
      const body = req.postData() ? JSON.parse(req.postData()) : null;
      calls.push({ key, query: u.search, token: req.headers()["x-form-token"], contentType: req.headers()["content-type"], body });
      let m = mock[key];
      if (typeof m === "function") m = m(body, u);
      if (m === "fail") return route.abort("failed");
      if (!m) return route.fulfill({ status: 404, contentType: "application/json", body: '{"detail":"not mocked"}' });
      return route.fulfill({ status: m.status, contentType: "application/json", body: JSON.stringify(m.body ?? {}), headers: { "access-control-allow-origin": "*" } });
    }
    if (url.includes("postalpincode.in"))
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ PostOffice: [{ District: "Pune", State: "Maharashtra" }] }]) });
    if (url.includes("googletagmanager.com")) { calls.push({ key: "GA script", query: new URL(url).search }); return route.fulfill({ status: 200, contentType: "text/javascript", body: "" }); }
    return route.abort();
  });
  await page.goto(BASE + path);
  await page.waitForLoadState("networkidle");
  return { page, ctx, calls, errors, apiCalls: () => calls.filter((c) => c.key !== "GA script") };
}
const gaEvents = (page) =>
  page.evaluate(() => (window.dataLayer || []).map((a) => Array.from(a)).map((a) => [a[0], a[1] instanceof Date ? "date" : a[1], a[2]]));
const text = (page, sel) => page.locator(sel).innerText().catch(() => "");
const visible = (page, sel) => page.locator(sel).isVisible();
const pick = (page, name, value) => page.locator(`input[name="${name}"][value="${value}"]`).check({ force: true });
const fill = (page, name, value) => page.locator(`[name="${name}"]`).fill(value);
const submit = async (page) => { await page.locator("#go").click(); await page.waitForTimeout(300); };

const DECRYPT_REG = { status: 200, body: { kind: "register", mobile: "+919876543210" } };
const DECRYPT_LEAD = { status: 200, body: { member_id: 123, kind: "lead", spec: { form: "Sheets", thickness_mm: "1.5", finish: "2B", quantity_value: 5, quantity_unit: "MT" } } };
const DECRYPT_STOCK = { status: 200, body: { member_id: 123, kind: "stock", spec: {} } };
const MEMBER = { status: 200, body: { member_id: 123, company_name: "Acme Steels", contact_person: "Ravi Kumar", first_name: "Ravi", member_type: "Trader" } };

async function test(name, fn) {
  current = name;
  console.log(`\n${name}`);
  try { await fn(); } catch (e) { check("test ran without crashing", false, String(e).slice(0, 300)); }
}

// ================= ROUTER =================
await test("Router: /?p=enquiry keeps token and UTMs", async () => {
  const t = await open(`/?p=enquiry&encrypted_token=LEADTOK&${UTM}`, { "POST /v1/token/decrypt": DECRYPT_LEAD, "GET /v1/member": MEMBER });
  const u = new URL(t.page.url());
  check("lands on /lead/", u.pathname === "/lead/", u.pathname);
  check("encrypted_token kept", u.searchParams.get("encrypted_token") === "LEADTOK", u.search);
  check("utm_source kept", u.searchParams.get("utm_source") === "whatsapp", u.search);
  check("p removed", !u.searchParams.has("p"), u.search);
  check("GA script loaded once (router skipped)", t.calls.filter((c) => c.key === "GA script").length === 1, t.calls.filter((c) => c.key === "GA script").length);
  await t.ctx.close();
});

// ================= REGISTER =================
await test("Register: happy path (decrypt -> prefill -> submit 202)", async () => {
  const t = await open(`/register/?encrypted_token=REGTOK&utm_campaign=registration&${UTM}`, {
    "POST /v1/token/decrypt": DECRYPT_REG,
    "POST /v1/register": { status: 202, body: { status: "queued" } },
  });
  const p = t.page;
  let c = t.apiCalls();
  check("1st call is POST /v1/token/decrypt", c[0]?.key === "POST /v1/token/decrypt", c.map((x) => x.key));
  check("decrypt sends X-Form-Token header", c[0]?.token === "REGTOK", c[0]?.token);
  check("decrypt body is {token, kind:'register'}", c[0]?.body?.token === "REGTOK" && c[0]?.body?.kind === "register", c[0]?.body);
  check("no GET /v1/member for register", !c.some((x) => x.key === "GET /v1/member"), c.map((x) => x.key));
  check("mobile prefilled from token (+91 stripped)", (await p.inputValue('[name="mobile"]')) === "9876543210", await p.inputValue('[name="mobile"]'));
  check("mobile is read-only", await p.locator('[name="mobile"]').evaluate((e) => e.readOnly), "editable");
  await pick(p, "btype", "Stockist");
  await pick(p, "intent", "Buy");
  await fill(p, "company", "Acme Steels");
  await fill(p, "name", "Ravi Kumar");
  await fill(p, "pincode", "411026");
  await p.waitForTimeout(300);
  check("pincode lookup fills city", (await p.inputValue('[name="city"]')) === "Pune", await p.inputValue('[name="city"]'));
  check("pincode lookup fills state", (await p.inputValue('[name="state"]')) === "Maharashtra", await p.inputValue('[name="state"]'));
  await fill(p, "email", "ravi@acme.in");
  await fill(p, "gstin", "27AAPFU0939F1ZV");
  await p.locator("#cons").check({ force: true });
  await submit(p);
  c = t.apiCalls();
  const post = c.find((x) => x.key === "POST /v1/register");
  check("POST /v1/register sent", !!post, c.map((x) => x.key));
  check("register sends X-Form-Token + JSON", post?.token === "REGTOK" && /json/.test(post?.contentType || ""), post);
  check("register body fields", post && post.body.businessType === "Stockist" && post.body.intent === "Buy" && post.body.company === "Acme Steels" && post.body.customerName === "Ravi Kumar" && post.body.pincode === "411026" && post.body.city === "Pune" && post.body.state === "Maharashtra" && post.body.email === "ravi@acme.in" && post.body.gstin === "27AAPFU0939F1ZV" && post.body.consent === true, post?.body);
  check("mobile NOT sent in body", post && !("mobile" in post.body), post?.body);
  check("success screen shown", await visible(p, "#ok"), "hidden");
  check("ref shows 'Received' for 202", (await text(p, "#ref")) === "Received", await text(p, "#ref"));
  const ev = await gaEvents(p);
  const cfg = ev.find((e) => e[0] === "config");
  check("GA page_location has no token", cfg && !/encrypted_token/.test(cfg[2]?.page_location), cfg?.[2]);
  check("GA page_location keeps UTMs", cfg && /utm_source=whatsapp/.test(cfg[2]?.page_location), cfg?.[2]);
  check("GA sign_up event", ev.some((e) => e[0] === "event" && e[1] === "sign_up" && e[2]?.form_kind === "register" && e[2]?.http_status === "202"), ev);
  check("no personal data in GA", !/9876543210|Ravi|Acme|27AAPFU|REGTOK/.test(JSON.stringify(ev)), "PII found");
  check("no JS errors", t.errors.length === 0, t.errors);
  await t.ctx.close();
});

await test("Register: no token in link", async () => {
  const t = await open(`/register/`, {});
  check("no API call made", t.apiCalls().length === 0, t.apiCalls().map((x) => x.key));
  check("'no login' error shown", /no login/i.test(await text(t.page, "#neterr")), await text(t.page, "#neterr"));
  check("Submit disabled", await t.page.locator("#go").isDisabled(), "enabled");
  const ev = await gaEvents(t.page);
  check("GA form_error 401 at load", ev.some((e) => e[1] === "form_error" && e[2]?.error_status === "401" && e[2]?.error_stage === "load"), ev);
  await t.ctx.close();
});

await test("Register: expired token (410)", async () => {
  const t = await open(`/register/?encrypted_token=OLD`, { "POST /v1/token/decrypt": { status: 410, body: { detail: "expired" } } });
  check("'expired' error shown", /expired/i.test(await text(t.page, "#neterr")), await text(t.page, "#neterr"));
  check("Submit disabled", await t.page.locator("#go").isDisabled(), "enabled");
  await t.ctx.close();
});

await test("Register: validation blocks empty submit", async () => {
  const t = await open(`/register/?encrypted_token=REGTOK`, { "POST /v1/token/decrypt": DECRYPT_REG });
  await submit(t.page);
  check("no POST sent", !t.apiCalls().some((x) => x.key === "POST /v1/register"), t.apiCalls().map((x) => x.key));
  check("business type error shown", /business type/i.test(await text(t.page, "#e-btype")), await text(t.page, "#e-btype"));
  await fill(t.page, "gstin", "27AAPFU0939F1Z");
  await submit(t.page);
  check("bad GSTIN error shown", /GSTIN/i.test(await text(t.page, "#e-gstin")), await text(t.page, "#e-gstin"));
  await t.ctx.close();
});

await test("Register: server 422 with detail list, then retry", async () => {
  let n = 0;
  const t = await open(`/register/?encrypted_token=REGTOK`, {
    "POST /v1/token/decrypt": DECRYPT_REG,
    "POST /v1/register": () => (++n === 1 ? { status: 422, body: { detail: [{ msg: "pincode not serviceable" }] } } : { status: 202, body: { status: "queued" } }),
  });
  const p = t.page;
  await pick(p, "btype", "Trader"); await pick(p, "intent", "Sell");
  await fill(p, "company", "A"); await fill(p, "name", "B"); await fill(p, "pincode", "411026");
  await p.locator("#cons").check({ force: true });
  await submit(p);
  check("422 message includes server detail", /pincode not serviceable/.test(await text(p, "#neterr")), await text(p, "#neterr"));
  check("Submit re-enabled for retry", await p.locator("#go").isEnabled(), "disabled");
  await submit(p);
  check("retry succeeds", await visible(p, "#ok"), "no success screen");
  await t.ctx.close();
});

await test("Register: network failure on submit", async () => {
  const t = await open(`/register/?encrypted_token=REGTOK`, { "POST /v1/token/decrypt": DECRYPT_REG, "POST /v1/register": "fail" });
  const p = t.page;
  await pick(p, "btype", "Trader"); await pick(p, "intent", "Sell");
  await fill(p, "company", "A"); await fill(p, "name", "B"); await fill(p, "pincode", "411026");
  await p.locator("#cons").check({ force: true });
  await submit(p);
  check("'could not connect' shown", /could not connect/i.test(await text(p, "#neterr")), await text(p, "#neterr"));
  const ev = await gaEvents(p);
  check("GA form_error status 0 at submit", ev.some((e) => e[1] === "form_error" && e[2]?.error_status === "0" && e[2]?.error_stage === "submit"), ev);
  await t.ctx.close();
});

// ================= LEAD / STOCK shared =================
async function fillProduct(p, { brand = "8", grade = "88", sub = "304" } = {}) {
  await fill(p, "pname", "SS 304 sheet");
  await pick(p, "brand", brand);
  await pick(p, "grade", grade);
  await p.selectOption('[name="sub"]', sub);
  await fill(p, "days", "7");
  await p.locator('.size [data-k="price"]').first().fill("210");
}

await test("Enquiry: happy path (decrypt -> member -> prefill -> submit 201)", async () => {
  const t = await open(`/lead/?encrypted_token=LEADTOK&utm_campaign=add_enquiry&${UTM}`, {
    "POST /v1/token/decrypt": DECRYPT_LEAD,
    "GET /v1/member": MEMBER,
    "POST /v1/lead": { status: 201, body: { ref: "ENQ-1001", ids: [55] } },
  });
  const p = t.page;
  let c = t.apiCalls();
  check("call order: decrypt then member", c[0]?.key === "POST /v1/token/decrypt" && c[1]?.key === "GET /v1/member", c.map((x) => x.key));
  check("decrypt kind is 'lead'", c[0]?.body?.kind === "lead", c[0]?.body);
  check("member query is ?kind=lead", c[1]?.query === "?kind=lead", c[1]?.query);
  check("member call sends X-Form-Token", c[1]?.token === "LEADTOK", c[1]?.token);
  check("'Sending as' shows member", /Ravi Kumar, Acme Steels/.test(await text(p, "#who")), await text(p, "#who"));
  const catText = await p.locator("#cat").evaluate((s) => s.options[s.selectedIndex].text);
  check("spec prefills category (Sheets -> Sheets/Blanks)", catText === "Sheets/Blanks", catText);
  check("spec prefills thickness 1.5 -> 1.50", (await p.inputValue('.size [data-k="thk"]')) === "1.50", await p.inputValue('.size [data-k="thk"]'));
  check("spec prefills finish 2B", (await p.inputValue('.size [data-k="fin"]')) === "2B", await p.inputValue('.size [data-k="fin"]'));
  check("spec prefills qty 5 MT -> 5000 Kg", (await p.inputValue('.size [data-k="qty"]')) === "5000", await p.inputValue('.size [data-k="qty"]'));
  await fillProduct(p);
  await submit(p);
  c = t.apiCalls();
  const post = c.find((x) => x.key === "POST /v1/lead");
  check("POST /v1/lead sent", !!post, c.map((x) => x.key));
  const b = post?.body || {};
  check("body: names, not IDs", b.categoryName === "Sheets/Blanks" && b.brandName === "Jindal Stainless-India" && b.subGrade === "304" && b.productName === "SS 304 sheet", b);
  check("body: deliveryDays is a number", b.deliveryDays === 7, b.deliveryDays);
  const s = (b.sizes || [])[0] || {};
  check("body: size numbers", s.thicknessMm === 1.5 && s.finish === "2B" && s.unit === "mm" && s.pricePerKg === 210 && s.quantity === 5000 && s.quantityUnit === "Kg" && s.length === null, s);
  check("body: no address when left blank", !("address" in b), b.address);
  check("success ref from server", (await text(p, "#ref")) === "ENQ-1001", await text(p, "#ref"));
  check("GA generate_lead event", (await gaEvents(p)).some((e) => e[1] === "generate_lead" && e[2]?.http_status === "201"), await gaEvents(p));
  check("no JS errors", t.errors.length === 0, t.errors);
  await t.ctx.close();
});

await test("Enquiry: grade is sent to the API", async () => {
  const t = await open(`/lead/?encrypted_token=LEADTOK`, { "POST /v1/token/decrypt": DECRYPT_LEAD, "GET /v1/member": MEMBER, "POST /v1/lead": { status: 201, body: { ref: "X" } } });
  await fillProduct(t.page);
  await submit(t.page);
  const b = t.apiCalls().find((x) => x.key === "POST /v1/lead")?.body || {};
  check("body includes the grade (e.g. '300')", Object.values(b).some((v) => v === "300") || "grade" in b || "gradeName" in b, Object.keys(b));
  await t.ctx.close();
});

await test("Enquiry: multiple sizes and partial address", async () => {
  const t = await open(`/lead/?encrypted_token=LEADTOK`, { "POST /v1/token/decrypt": DECRYPT_LEAD, "GET /v1/member": MEMBER, "POST /v1/lead": { status: 201, body: { ref: "X" } } });
  const p = t.page;
  await fillProduct(p);
  await p.locator("#addsize").click();
  check("2nd size added", (await p.locator(".size").count()) === 2, await p.locator(".size").count());
  for (let i = 0; i < 12; i++) await p.locator("#addsize").click();
  check("max 10 sizes", (await p.locator(".size").count()) === 10, await p.locator(".size").count());
  while ((await p.locator(".size").count()) > 2) await p.locator(".size .rm").last().click();
  const s2 = p.locator(".size").nth(1);
  await s2.locator('[data-k="thk"]').selectOption("2.00");
  await s2.locator('[data-k="fin"]').selectOption("BA");
  await s2.locator('input[value="inch"]').check({ force: true });
  await s2.locator('[data-k="len"]').fill("96");
  await s2.locator('[data-k="price"]').fill("220");
  await s2.locator('[data-k="qty"]').fill("1000");
  await fill(p, "nline", "Plot 9, MIDC");
  await submit(p);
  check("partial address blocked (pincode required)", /pincode/i.test(await text(p, "#e-npin")), await text(p, "#e-npin"));
  await fill(p, "npin", "411026");
  await p.waitForTimeout(300);
  await submit(p);
  const b = t.apiCalls().find((x) => x.key === "POST /v1/lead")?.body || {};
  check("2 sizes sent", (b.sizes || []).length === 2, b.sizes);
  check("2nd size unit inch, length 96", b.sizes?.[1]?.unit === "inch" && b.sizes?.[1]?.length === 96, b.sizes?.[1]);
  check("new address sent with city/state from pincode", b.address?.newAddress?.line === "Plot 9, MIDC" && b.address?.newAddress?.pincode === "411026" && b.address?.newAddress?.city === "Pune", b.address);
  await t.ctx.close();
});

await test("Enquiry: token for another form (400)", async () => {
  const t = await open(`/lead/?encrypted_token=STOCKTOK`, { "POST /v1/token/decrypt": { status: 400, body: { detail: "kind mismatch" } } });
  check("'not valid for this form' shown", /not valid for this form/i.test(await text(t.page, "#neterr")), await text(t.page, "#neterr"));
  check("member not called", !t.apiCalls().some((x) => x.key === "GET /v1/member"), t.apiCalls().map((x) => x.key));
  check("Submit disabled", await t.page.locator("#go").isDisabled(), "enabled");
  await t.ctx.close();
});

await test("Enquiry: member lookup fails (401)", async () => {
  const t = await open(`/lead/?encrypted_token=LEADTOK`, { "POST /v1/token/decrypt": DECRYPT_LEAD, "GET /v1/member": { status: 401, body: {} } });
  check("error shown", (await text(t.page, "#neterr")).length > 0, "no message");
  check("Submit disabled", await t.page.locator("#go").isDisabled(), "enabled");
  await t.ctx.close();
});

await test("Enquiry: double click sends one POST", async () => {
  let n = 0;
  const t = await open(`/lead/?encrypted_token=LEADTOK`, {
    "POST /v1/token/decrypt": DECRYPT_LEAD, "GET /v1/member": MEMBER,
    "POST /v1/lead": () => { n++; return { status: 201, body: { ref: "X" } }; },
  });
  await fillProduct(t.page);
  await t.page.locator("#go").dblclick();
  await t.page.waitForTimeout(500);
  check("only one POST /v1/lead", n === 1, n);
  await t.ctx.close();
});

await test("Stock: happy path (decrypt -> member -> submit 201)", async () => {
  const t = await open(`/stock/?encrypted_token=STOCKTOK&utm_campaign=add_stock&${UTM}`, {
    "POST /v1/token/decrypt": DECRYPT_STOCK, "GET /v1/member": MEMBER,
    "POST /v1/stock": { status: 201, body: { ref: "STK-2001", ids: [77] } },
  });
  const p = t.page;
  let c = t.apiCalls();
  check("decrypt kind is 'stock'", c[0]?.body?.kind === "stock", c[0]?.body);
  check("member query is ?kind=stock", c[1]?.query === "?kind=stock", c[1]?.query);
  check("empty spec leaves category blank", (await p.inputValue("#cat")) === "", await p.inputValue("#cat"));
  await p.selectOption("#cat", { label: "Coils [HR/CR]" });
  await fillProduct(p);
  await p.locator('.size [data-k="thk"]').selectOption("1.00");
  await p.locator('.size [data-k="fin"]').selectOption("2B");
  await p.locator('.size [data-k="qty"]').fill("12000");
  const exp = new Date(Date.now() + 19800000 + 5 * 86400000).toISOString().slice(0, 10);
  await fill(p, "expiry", exp);
  await submit(p);
  c = t.apiCalls();
  const b = c.find((x) => x.key === "POST /v1/stock")?.body;
  check("POST /v1/stock sent", !!b, c.map((x) => x.key));
  check("body category + sizes", b?.categoryName === "Coils [HR/CR]" && b?.sizes?.[0]?.quantity === 12000, b);
  check("body includes the 'listed until' date", b && Object.values(b).includes(exp), b && Object.keys(b));
  check("success ref from server", (await text(p, "#ref")) === "STK-2001", await text(p, "#ref"));
  check("GA add_stock event", (await gaEvents(p)).some((e) => e[1] === "add_stock"), await gaEvents(p));
  check("no JS errors", t.errors.length === 0, t.errors);
  await t.ctx.close();
});

await test("Stock: expiry must be after today", async () => {
  const t = await open(`/stock/?encrypted_token=STOCKTOK`, { "POST /v1/token/decrypt": DECRYPT_STOCK, "GET /v1/member": MEMBER });
  const today = new Date(Date.now() + 19800000).toISOString().slice(0, 10);
  await fill(t.page, "expiry", today);
  await submit(t.page);
  check("expiry error shown", /after today/i.test(await text(t.page, "#e-expiry")), await text(t.page, "#e-expiry"));
  await t.ctx.close();
});

await test("Stock: draft survives a page reload", async () => {
  const t = await open(`/stock/?encrypted_token=STOCKTOK`, { "POST /v1/token/decrypt": DECRYPT_STOCK, "GET /v1/member": MEMBER });
  const p = t.page;
  await p.selectOption("#cat", { label: "Plates" });
  await fill(p, "pname", "Draft product");
  await pick(p, "brand", "8");
  await pick(p, "grade", "88");
  await p.selectOption('[name="sub"]', "304");
  await p.locator('.size [data-k="price"]').fill("199");
  await p.reload();
  await p.waitForLoadState("networkidle");
  check("product name restored", (await p.inputValue('[name="pname"]')) === "Draft product", await p.inputValue('[name="pname"]'));
  const cat = await p.locator("#cat").evaluate((s) => s.selectedIndex > 0 ? s.options[s.selectedIndex].text : "");
  check("category restored", cat === "Plates", cat || "(blank)");
  check("brand restored", await p.locator('input[name="brand"][value="8"]').isChecked().catch(() => false), "not checked");
  check("size price restored", (await p.inputValue('.size [data-k="price"]')) === "199", await p.inputValue('.size [data-k="price"]'));
  await t.ctx.close();
});

await test("Demo mode: no API configured", async () => {
  // Serve the page with SB_CONFIG.api emptied to check demo mode
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const ext = [];
  await page.route("**/assets/js/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: 'var SB_CONFIG={api:"",gaId:""};' }));
  await page.route("**/*", (r) => { if (!r.request().url().startsWith(BASE)) { ext.push(r.request().url()); return r.abort(); } return r.fallback(); });
  await page.goto(BASE + "/lead/");
  await page.waitForLoadState("networkidle");
  check("demo banner visible", await page.locator("#dev").isVisible(), "hidden");
  check("sample addresses shown", (await page.locator('input[name="addr"]').count()) === 3, await page.locator('input[name="addr"]').count());
  check("no external calls", ext.length === 0, ext);
  await ctx.close();
});

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
writeFileSync(join(ROOT, "tests", "results.json"), JSON.stringify({ api: API, ranAt: new Date().toISOString(), total: results.length, failed: failed.length, results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
