import { createFileRoute } from "@tanstack/react-router";

const SNIPPET = `(function(){
  try {
    var s = document.currentScript || (function(){
      var all = document.getElementsByTagName('script');
      for (var i=all.length-1;i>=0;i--){ if ((all[i].src||'').indexOf('/api/public/mkt/tracker.js')>-1) return all[i]; }
      return null;
    })();
    var KEY = (s && s.getAttribute('data-site-key')) || window.MKT_SITE_KEY;
    if (!KEY) { console.warn('[mkt] site key missing'); return; }
    var ORIGIN = (s && s.getAttribute('data-tracker-origin')) ||
                 (s && s.src ? (new URL(s.src)).origin : '') ||
                 'https://swus-erp.lovable.app';
    var ENDPOINT = (s && s.getAttribute('data-endpoint')) || (ORIGIN + '/api/public/mkt/track');
    if (!/^https?:/.test(ENDPOINT)) ENDPOINT = ORIGIN + ENDPOINT;

    function uuid(){return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);return v.toString(16);});}
    function getCookie(n){var m=document.cookie.match('(?:^|; )'+n+'=([^;]*)');return m?decodeURIComponent(m[1]):null;}
    function setLS(k,v){try{localStorage.setItem(k,v);}catch(e){}}
    function getLS(k){try{return localStorage.getItem(k);}catch(e){return null;}}
    function sid(){var v=getLS('_mkt_sid');if(!v){v=uuid();setLS('_mkt_sid',v);}return v;}

    var qs = new URLSearchParams(location.search);
    var fbclid = qs.get('fbclid') || getLS('_mkt_fbclid');
    if (qs.get('fbclid')) setLS('_mkt_fbclid', fbclid);
    var utm = {};
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','utm_id'].forEach(function(k){
      var v = qs.get(k); if (v) { utm[k]=v; setLS('_mkt_'+k, v); } else { var cached=getLS('_mkt_'+k); if(cached) utm[k]=cached; }
    });
    var device = /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop';

    function send(eventName, extra){
      var payload = Object.assign({
        landing_page: location.href,
        referrer: document.referrer || null,
        device_type: device,
        fbclid: fbclid || null,
        fbp: getCookie('_fbp'),
        fbc: getCookie('_fbc')
      }, utm, extra || {});
      var body = JSON.stringify({ site_key: KEY, session_id: sid(), event: eventName, payload: payload });
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
        } else {
          fetch(ENDPOINT, { method:'POST', headers:{'content-type':'application/json'}, body: body, keepalive: true });
        }
      } catch(e) { console.warn('[mkt]', e); }
    }

    window.mktTrack = send;
    window.mktIdentify = function(info){ send('identify', info||{}); };

    send('page_view');

    // Auto-capture mobile from common form fields on submit
    document.addEventListener('submit', function(ev){
      try {
        var form = ev.target; if (!form || !form.querySelectorAll) return;
        var inputs = form.querySelectorAll('input');
        var mobile = null, email = null;
        for (var i=0;i<inputs.length;i++){
          var el = inputs[i]; var n=(el.name||'').toLowerCase(); var t=(el.type||'').toLowerCase();
          if (!mobile && (n.indexOf('phone')>-1||n.indexOf('mobile')>-1||n.indexOf('mob')>-1||t==='tel')) mobile = el.value;
          if (!email && (t==='email'||n.indexOf('email')>-1)) email = el.value;
        }
        if (mobile || email) send('lead', { mobile: mobile, email: email });
      } catch(e){}
    }, true);
  } catch(e) { console.warn('[mkt] init failed', e); }
})();`;

export const Route = createFileRoute("/api/public/mkt/tracker.js")({
  server: {
    handlers: {
      GET: async () =>
        new Response(SNIPPET, {
          status: 200,
          headers: {
            "content-type": "application/javascript; charset=utf-8",
            "cache-control": "public, max-age=300",
            "access-control-allow-origin": "*",
          },
        }),
    },
  },
});