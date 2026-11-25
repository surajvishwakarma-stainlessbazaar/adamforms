/* Google Analytics 4 (gtag.js). ID comes from SB_CONFIG.gaId (config.js).
   - UTM params (utm_source, utm_medium, utm_campaign, utm_content, utm_term, utm_id) are read by GA4 from the URL.
   - Private params (encrypted_token, t, m) are REMOVED from the URL GA4 records.
   - sbTrack(event, params) sends a custom event. Never pass personal data (mobile, name, GSTIN, token). */
(function () {
  var cfg = window.SB_CONFIG || {},
    id = cfg.gaId;
  window.sbTrack = function () {};
  if (!id || window.__sbRedirecting) return;

  var s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };

  var PRIVATE = ["encrypted_token", "t", "m"];
  var loc = location.href;
  try {
    var u = new URL(location.href);
    PRIVATE.forEach(function (k) {
      u.searchParams.delete(k);
    });
    loc = u.toString();
  } catch (e) {
    loc = location.origin + location.pathname;
  }

  window.gtag("js", new Date());
  window.gtag("config", id, { page_location: loc });

  window.sbTrack = function (name, params) {
    try {
      window.gtag("event", name, params || {});
    } catch (e) {}
  };
})();
