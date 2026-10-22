export const CAPTURE_PATH = '/product-automation/capture';
export const CAPTURE_MESSAGE = 'aurix-capture';
export const CAPTURE_RECEIVED_MESSAGE = 'aurix-capture-received';

export interface CaptureMessage {
  type: typeof CAPTURE_MESSAGE;
  url: string;
  title: string;
  html: string;
}

// Runs on the supplier page, where the user's own browser has already passed the site's bot checks.
// It strips scripts (keeping JSON-LD product data) and styles, opens the Aurix capture tab, and
// posts the HTML to it until the tab confirms. The session cookie is SameSite=Lax, so posting
// straight to the API from the supplier site would arrive logged out.
// Kept as a plain string: serializing a function would pick up minifier and transpiler output.
export function captureBookmarklet(appOrigin: string) {
  const code = `(function(){
var app=${JSON.stringify(appOrigin)};
if(location.origin===app){alert('Open a supplier product page first, then click Send to Aurix.');return;}
var doc=document.documentElement.cloneNode(true);
doc.querySelectorAll('script:not([type="application/ld+json"]),style,noscript,svg,iframe,link,template').forEach(function(el){el.remove();});
var html='<!doctype html>'+doc.outerHTML;
var data={type:${JSON.stringify(CAPTURE_MESSAGE)},url:location.href,title:document.title,html:html};
var tab=window.open(app+${JSON.stringify(CAPTURE_PATH)},'aurix-capture');
if(!tab){alert('Allow pop-ups for this site, then click Send to Aurix again.');return;}
var done=false,tries=0,timer;
function stop(){done=true;clearInterval(timer);removeEventListener('message',onMessage);}
function onMessage(e){if(e.origin===app&&e.data&&e.data.type===${JSON.stringify(CAPTURE_RECEIVED_MESSAGE)})stop();}
addEventListener('message',onMessage);
timer=setInterval(function(){
if(done)return;
if(tab.closed){stop();navigator.clipboard.writeText(html).then(function(){alert('This site blocked the Aurix tab, so the page source was copied instead. Paste it into Paste page source in the run.');},function(){alert('This site blocked the Aurix tab. Use Paste page source in the run instead.');});return;}
if(++tries>60){stop();alert('The Aurix tab did not respond. Make sure you are logged in to Aurix, then click Send to Aurix again.');return;}
try{tab.postMessage(data,app);}catch(err){}
},500);
})();`;
  return `javascript:${encodeURIComponent(code)}`;
}
