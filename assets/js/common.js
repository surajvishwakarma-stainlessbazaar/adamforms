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
