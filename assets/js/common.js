var F=document.getElementById("f"),$=function(i){return document.getElementById(i)};
var Q=new URLSearchParams(location.search);
$("dev").style.display=SB.api?"none":"block";
function g(n){var e=F.elements[n];return e?String(e.value||"").trim():""}
function bad(n,m){var e=$("e-"+n);if(e){e.textContent=m||"";e.parentNode.classList.toggle("bad",!!m)}return !m}
function run(rules){var first=null;rules.forEach(function(r){var ok=r[1](g(r[0]));bad(r[0],ok?"":r[2]);if(!ok&&!first)first=r[0]});if(first){var el=$("e-"+first);if(el)el.parentNode.scrollIntoView({block:"center"})}return !first}
var isMob=function(v){return /^[6-9]\d{9}$/.test(v)};
var isPin=function(v){return /^[1-9]\d{5}$/.test(v)};
var has=function(v){return v.length>0};
var isNum=function(v){return /^\d+(\.\d+)?$/.test(v)&&+v>0};
[].forEach.call(document.querySelectorAll("[data-d]"),function(e){e.addEventListener("input",function(){var v=e.value.replace(/\D/g,"");var m=+e.getAttribute("maxlength")||99;e.value=v.slice(0,m)})});
var K="sb_"+SB.page;
function save(){try{var o={};[].forEach.call(F.elements,function(e){if(!e.name||/^(otp|photos|cons)/.test(e.name))return;if(e.type==="radio"){if(e.checked)o[e.name]=e.value}else o[e.name]=e.value});sessionStorage.setItem(K,JSON.stringify(o))}catch(x){}}
function load(){try{var o=JSON.parse(sessionStorage.getItem(K)||"{}");Object.keys(o).forEach(function(n){var e=F.elements[n];if(!e)return;if(e.length&&e[0]&&e[0].type==="radio"){[].forEach.call(e,function(r){r.checked=r.value===o[n]})}else if(e.type!=="file")e.value=o[n]})}catch(x){}}
load();
F.addEventListener("input",save);F.addEventListener("change",save);
function ref(p){return p+"-"+Date.now().toString(36).toUpperCase().slice(-6)}
function finish(p,list,srvRef){
 $("f").style.display="none";$("ok").style.display="block";$("ref").textContent=srvRef||p.ref||"";
 $("sum").innerHTML=list.map(function(r){return "<li><span>"+r[0]+"</span><span></span></li>"}).join("");
 var s=$("sum").children;list.forEach(function(r,i){s[i].lastChild.textContent=r[1]});
 try{sessionStorage.removeItem(K)}catch(x){}window.scrollTo(0,0)}

/* ---------- Form API client ----------
   Link: <form URL>?encrypted_token=<token>   (made by ADAM, 1 hour, tied to one form kind)
   Every call sends the token in the X-Form-Token header. JSON only. */
var KINDS={register:"register",enquiry:"lead",stock:"stock"};
var FORM_KIND=KINDS[SB.page]||SB.page;
var FORM_TOKEN=Q.get("encrypted_token")||"";
var FORM_CTX={};              /* filled from /v1/token/decrypt (+ /v1/member) */

function apiError(status,j){
 var m=j&&(j.detail||j.message);if(Array.isArray(m))m=m.map(function(x){return x&&x.msg||x}).join(". ");
 if(status===401)return "This link has no login. Please open it again from WhatsApp.";
 if(status===400)return "This link is not valid for this form. Please open the right link from WhatsApp.";
 if(status===410)return "This link has expired. Please ask for a new one on WhatsApp.";
 if(status===422)return "Some details are not valid"+(m&&typeof m==="string"?": "+m:"")+". Please check and try again.";
 return "Could not connect. Please check your internet and try again."}
function showErr(msg,status,stage){var ne=$("neterr");ne.textContent=msg;ne.style.display="block";ne.scrollIntoView({block:"center"});
 sbEvent("form_error",{error_status:String(status||0),error_stage:stage||"submit"})}
/* GA4 events (analytics.js). Only form type + status, never personal data. */
var CONVERSION={register:"sign_up",lead:"generate_lead",stock:"add_stock"};
function sbEvent(name,params){if(typeof sbTrack!=="function")return;params=params||{};params.form_kind=FORM_KIND;sbTrack(name,params)}

/* api(method, path, body) -> Promise<{status, j}>; rejects with {status, j} on HTTP error */
function api(method,path,body){
 var h={"X-Form-Token":FORM_TOKEN};if(body)h["Content-Type"]="application/json";
 var ctl=typeof AbortController!=="undefined"?new AbortController():null,tm=setTimeout(function(){if(ctl)ctl.abort()},20000);
 return fetch(SB.api+path,{method:method,headers:h,body:body?JSON.stringify(body):undefined,signal:ctl?ctl.signal:undefined})
 .then(function(r){clearTimeout(tm);return r.json().catch(function(){return {}}).then(function(j){var res={status:r.status,j:j};if(!r.ok)throw res;return res})},
       function(){clearTimeout(tm);throw {status:0,j:null}})}

/* 1) POST /v1/token/decrypt {token, kind}  2) GET /v1/member?kind=  (lead/stock only)
   cb(ctx) on success; on failure shows the error and disables Submit. */
function loadContext(cb){
 if(!SB.api){cb(FORM_CTX);return}
 var stop=function(e){showErr(apiError(e&&e.status,e&&e.j),e&&e.status,"load");$("go").disabled=true};
 if(!FORM_TOKEN){stop({status:401});return}
 api("POST","/v1/token/decrypt",{token:FORM_TOKEN,kind:FORM_KIND}).then(function(r){
  FORM_CTX=r.j||{};
  if(FORM_KIND==="register"){cb(FORM_CTX);return}
  return api("GET","/v1/member?kind="+encodeURIComponent(FORM_KIND)).then(function(m){
   var j=m.j||{};Object.keys(j).forEach(function(k){FORM_CTX[k]=j[k]});cb(FORM_CTX)})
 }).catch(stop)}

/* submit: POST /v1/register | /v1/lead | /v1/stock with a JSON body.
   p: screen data (p.ref = local fallback ref); list: rows for the success screen. */
function send(p,list,body){
 var b=$("go");
 if(b.disabled)return;
 b.disabled=true;$("neterr").style.display="none";
 if(!SB.api){finish(p,list);return}
 api("POST","/v1/"+FORM_KIND,body||p).then(function(r){
  var j=r.j||{};
  sbEvent(CONVERSION[FORM_KIND]||"form_submit",{http_status:String(r.status)});
  finish(p,list,j.ref?String(j.ref):(r.status===202?"Received":""))
 }).catch(function(e){b.disabled=false;showErr(apiError(e&&e.status,e&&e.j),e&&e.status,"submit")})}

/* ---------- Address: pincode autofill, "Detect my location", Evolve city/state check ----------
   Same flow as the Next.js app: postalpincode.in (pincode -> state + district),
   Nominatim (GPS -> pincode + address line), Evolve master lists (state / city names the CRM accepts).
   addrFlow({pin, city, state, line, det, msg}) wires one address block (ids of its inputs).
   addrCheck(o, required) returns validation rules for run(). */
var EVOLVE="https://evolveapi.stainlessbazaar.com",ADDR_MEMO={};
function norm(s){return String(s||"").toLowerCase().replace(/&/g,"and").replace(/[^a-z]/g,"")}
function evolveList(path){
 if(ADDR_MEMO[path])return ADDR_MEMO[path];
 var ck="sb_m"+path;
 try{var c=JSON.parse(sessionStorage.getItem(ck)||"null");if(c)return ADDR_MEMO[path]=Promise.resolve(c)}catch(x){}
 return ADDR_MEMO[path]=fetch(EVOLVE+path).then(function(r){return r.json()}).then(function(j){
  var d=(j&&j.data||[]).filter(function(x){return !x.deleted});if(!d.length)throw 0;
  try{sessionStorage.setItem(ck,JSON.stringify(d))}catch(x){}return d})
 .catch(function(){delete ADDR_MEMO[path];return null})}
var ADDR_LISTS={states:null,cities:{}};
function findState(name){var n=norm(name),l=ADDR_LISTS.states;if(!l||!n)return null;
 return l.filter(function(s){return norm(s.state)===n})[0]||null}
function findCity(st,name){var n=norm(name),l=st&&ADDR_LISTS.cities[st.id];if(!l||!n)return null;
 return l.filter(function(c){return norm(c.city)===n})[0]||null}
function loadStates(){return evolveList("/master/state").then(function(d){if(d)ADDR_LISTS.states=d;return d})}
function loadCities(st){if(!st)return Promise.resolve(null);
 return evolveList("/master/city/"+st.id).then(function(d){if(d)ADDR_LISTS.cities[st.id]=d;return d})}
/* pick the Evolve spelling of state + the first city candidate Evolve knows; falls back to the first candidate */
function snapPlace(stateName,cands){
 return loadStates().then(function(){var st=findState(stateName);
  return loadCities(st).then(function(){var c=null;
   for(var i=0;i<cands.length&&!c;i++)c=findCity(st,cands[i]);
   return {state:st?st.state:stateName||"",city:c?c.city:(cands[0]||"")}})})}
function pinPlace(pin){
 return fetch("https://api.postalpincode.in/pincode/"+pin).then(function(r){return r.json()}).then(function(j){
  var po=j&&j[0]&&j[0].PostOffice;if(!po||!po.length)return null;var c=[];
  po.forEach(function(o){[o.District,o.Block,o.Region,o.Division,o.Name].forEach(function(v){v=String(v||"").replace(/\s+/g," ").trim();if(v&&c.indexOf(v)<0)c.push(v)})});
  return snapPlace(po[0].State,c)})}
function addrFlow(o){
 var E=function(k){return F.elements[o[k]]},seq=0;
 var msg=function(t,b){var m=o.msg&&$(o.msg);if(m){m.textContent=t;m.style.color=b?"var(--er)":"var(--mu)"}};
 function fill(pin,extra){var my=++seq;
  return pinPlace(pin).then(function(p){if(my!==seq||E("pin").value!==pin)return;
   if(!p){if(extra&&extra.city){E("city").value=extra.city;E("state").value=extra.state||""}
    else{bad(o.pin,"We could not find this pincode. Check it, or type your city and state.")}save();return}
   E("city").value=p.city;E("state").value=p.state;bad(o.pin,"");bad(o.city,"");bad(o.state,"");save()})
  .catch(function(){})}
 if(SB.api)loadStates(); /* preview mode: no network calls until the member types */
 E("state").addEventListener("change",function(){loadCities(findState(this.value))});
 E("pin").addEventListener("input",function(){if(isPin(this.value))fill(this.value)});
 var d=o.det&&$(o.det);if(!d)return;
 d.onclick=function(){
  if(!navigator.geolocation){msg("This phone cannot share its location. Type your pincode below.",1);return}
  d.disabled=true;msg("Finding your location...");
  navigator.geolocation.getCurrentPosition(function(p){
   var la=+p.coords.latitude.toFixed(5),lo=+p.coords.longitude.toFixed(5);o.geo={lat:la,lng:lo};
   fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=en&lat="+la+"&lon="+lo)
   .then(function(r){return r.json()}).then(function(j){
    var a=j.address||{},pc=String(a.postcode||"").replace(/\D/g,"").slice(0,6);
    if(!isPin(pc)){msg("Could not read a pincode from your location. Type it below.",1);d.disabled=false;return}
    E("pin").value=pc;bad(o.pin,"");
    /* never overwrite an address the member already typed */
    if(o.line&&!E("line").value.trim()){var ln=[a.house_number,a.road,a.neighbourhood||a.suburb].filter(Boolean).join(", ");if(ln)E("line").value=ln.slice(0,200)}
    save();
    return fill(pc,{city:a.city||a.town||a.village||a.state_district||"",state:a.state||""}).then(function(){
     msg("Location found: pincode "+pc+". Change it if this is not the right address.");d.disabled=false})
   }).catch(function(){msg("Could not look up your address. Type your pincode below.",1);d.disabled=false})
  },function(){msg("Location is off or blocked. Type your pincode below.",1);d.disabled=false},
  {timeout:12000,maximumAge:600000})}}
/* rules for run(): city/state must be names Evolve knows (checked only once its lists have loaded) */
function addrCheck(o,required){
 var st=function(){return findState(g(o.state))};
 return [
  [o.state,function(v){if(!v)return !required;return !ADDR_LISTS.states||!!st()},"Enter a valid state name."],
  [o.city,function(v){if(!v)return !required;var s=st();return !s||!ADDR_LISTS.cities[s.id]||!!findCity(s,v)},"Enter a valid city name (check the spelling)."]]}
/* on load, fetch the city list for a restored state so the check works for drafts too */
function addrWarm(o){if(!SB.api)return;loadStates().then(function(){loadCities(findState(g(o.state)))})}
