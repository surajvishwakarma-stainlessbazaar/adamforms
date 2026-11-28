var gst = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
/* decrypt the register token (no member yet). The mobile number lives only in the token;
   the Form API reads it from there, so the form neither shows nor sends it. */
loadContext(function () {});
var ADDR = { pin: "pincode", city: "city", state: "state", det: "det", msg: "dmsg" };
addrFlow(ADDR);
addrWarm(ADDR);
F.addEventListener("submit", function (ev) {
  ev.preventDefault();
  var ok = run([].concat([
    ["btype", has, "Choose your business type."],
    ["intent", has, "Choose one."],
    ["company", has, "Enter your company name."],
    ["name", has, "Enter your name."],
    ["pincode", isPin, "Enter a 6-digit pincode."],
    [
      "email",
      function (v) {
        return !v || /^\S+@\S+\.\S+$/.test(v);
      },
      "Enter a valid email or leave it blank.",
    ],
    [
      "gstin",
      function (v) {
        return !v || gst.test(v);
      },
      "This GSTIN does not look right. Check all 15 characters.",
    ],
  ], addrCheck(ADDR, false)));
  if (ok && !F.elements.cons.checked) {
    bad("cons", "Please tick to continue.");
    $("e-cons").scrollIntoView({ block: "center" });
    ok = false;
  } else bad("cons", "");
  if (!ok) return;
  /* POST /v1/register body (spec B3.6). Mobile is not sent: the Form API takes it from the token. */
  var p = {
    businessType: g("btype"),
    intent: g("intent"),
    company: g("company"),
    customerName: g("name"),
    pincode: g("pincode"),
    city: g("city"),
    state: g("state"),
    consent: true,
  };
  if (g("email")) p.email = g("email");
  if (g("gstin")) p.gstin = g("gstin");
  send({ ref: ref("REG") }, [
    ["Company", p.company],
    ["Type", p.businessType],
    ["You want to", p.intent],
    ["Pincode", p.pincode + (p.city ? " (" + p.city + ")" : "")],
  ], p);
});
