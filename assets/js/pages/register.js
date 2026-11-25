var gst = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
  geo = null;
function setMobile(v) {
  v = String(v || "").replace(/\D/g, "").slice(-10);
  var mo = F.elements.mobile;
  if (isMob(v)) {
    mo.value = v;
    mo.readOnly = true;
    $("h-mobile").textContent = "From your WhatsApp. This is your login number.";
  } else $("h-mobile").textContent = "Enter your WhatsApp number.";
}
setMobile("");
/* decrypt the register token: returns {kind:"register", mobile} (no member yet) */
loadContext(function (ctx) {
  setMobile(ctx.mobile);
});
function dmsg(t, b) {
  var m = $("dmsg");
  m.textContent = t;
  m.style.color = b ? "var(--er)" : "var(--mu)";
}
function pinLookup(pin) {
  fetch("https://api.postalpincode.in/pincode/" + pin)
    .then(function (r) {
      return r.json();
    })
    .then(function (j) {
      var o = j && j[0] && j[0].PostOffice && j[0].PostOffice[0];
      if (o) {
        F.elements.city.value = o.District || "";
        F.elements.state.value = o.State || "";
        save();
      }
    })
    .catch(function () {});
}
$("pincode").addEventListener("input", function () {
  if (/^\d{6}$/.test(this.value)) pinLookup(this.value);
});
$("det").onclick = function () {
  var b = this;
  if (!navigator.geolocation) {
    dmsg("This phone cannot share its location. Type your pincode below.", 1);
    return;
  }
  b.disabled = true;
  dmsg("Finding your location...");
  navigator.geolocation.getCurrentPosition(
    function (p) {
      geo = { lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5) };
      fetch(
        "https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=" +
          geo.lat +
          "&lon=" +
          geo.lng,
      )
        .then(function (r) {
          return r.json();
        })
        .then(function (j) {
          var a = j.address || {},
            pc = String(a.postcode || "")
              .replace(/\D/g, "")
              .slice(0, 6);
          if (pc.length === 6) {
            F.elements.pincode.value = pc;
            F.elements.city.value = a.city || a.town || a.village || a.state_district || "";
            F.elements.state.value = a.state || "";
            bad("pincode", "");
            dmsg("Location found. Please check the pincode.");
            save();
            if (!F.elements.city.value) pinLookup(pc);
          } else dmsg("Could not read a pincode from your location. Type it below.", 1);
          b.disabled = false;
        })
        .catch(function () {
          dmsg("Could not look up your address. Type your pincode below.", 1);
          b.disabled = false;
        });
    },
    function () {
      dmsg("Location is off or blocked. Type your pincode below.", 1);
      b.disabled = false;
    },
    { timeout: 12000, maximumAge: 600000 },
  );
};
F.addEventListener("submit", function (ev) {
  ev.preventDefault();
  var ok = run([
    ["btype", has, "Choose your business type."],
    ["intent", has, "Choose one."],
    ["company", has, "Enter your company name."],
    ["name", has, "Enter your name."],
    ["pincode", isPin, "Enter a 6-digit pincode."],
    ["mobile", isMob, "Enter a valid 10-digit mobile number."],
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
  ]);
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
    ["Mobile", "+91" + g("mobile")],
    ["Pincode", p.pincode + (p.city ? " (" + p.city + ")" : "")],
  ], p);
});
