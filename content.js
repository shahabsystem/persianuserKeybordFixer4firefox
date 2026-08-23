(() => {
"use strict";

const DEFAULTS = {enabled:true, autoReplace:false, shortcut:"Alt+Shift+K", customWords:{}};
let settings = {...DEFAULTS};
let composing = false;
let timer = null;
let lastValue = "";
let suggestion = null;
let customInputGuard = false;

// Windows Persian keyboard layout. Values are deliberately kept explicit
// so the extension remains deterministic and offline.
const EN_TO_FA = {
 q:"ض", w:"ص", e:"ث", r:"ق", t:"ف", y:"غ", u:"ع", i:"ه", o:"خ", p:"ح",
 "[":"ج", "]":"چ", a:"ش", s:"س", d:"ی", f:"ب", g:"ل", h:"ا", j:"ت", k:"ن",
 l:"م", ";":"ک", "'":"گ", z:"ظ", x:"ط", c:"ز", v:"ر", b:"ذ", n:"د", m:"پ",
 ",":"و", ".":".", "/":"/", "`":"پ"
};
const FA_TO_EN = {};
for (const [k,v] of Object.entries(EN_TO_FA)) FA_TO_EN[v]=k;
Object.assign(FA_TO_EN, {"آ":"G","ژ":"C","ء":"X","ؤ":"C","ي":"D","ى":"D"});

const COMMON_FA = new Set(("سلام خوبی من تو شما این آن که را به از برای با در و یا اگر ولی اما هم خیلی ممنون لطفا لطفاً برنامه فایل متن کیبورد فارسی انگلیسی است هست هستم می شود شد کرد کردم دارم دارد دارید کن کنم کند امروز فردا چه چرا کجا چطور یک دو سه چهار پنج نه بله دوست خانه کار وقت روز شب صبح ظهر الان بعد قبل برایش خودش خودم ایمیل شماره نام کاربر رمز عبور سایت صفحه لینک دانلود خرید قیمت").split(/\s+/));
const COMMON_EN = new Set(("the and you your this that is are was were for with from hello test please thanks thank what how why not can will have has about github firefox google email phone name user password website page link download buy price home work time day night morning").split(/\s+/));

function chars(text, re){return [...text].filter(c=>re.test(c)).length;}
function words(text){return text.toLowerCase().match(/[a-z\u0600-\u06ff]+/g)||[];}
function convert(text,map){return [...text].map(c=>map[c.toLowerCase()] ?? c).join("");}
function commonScore(text,set){let n=0; for(const w of words(text)) if(set.has(w)) n++; return n;}

function suspicious(text){
  if (!text || text.trim().length < 2) return null;
  const compact=text.trim();
  if (/https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b(?:npm|git|ssh|ftp)\b/i.test(compact)) return null;

  const fa=chars(compact,/[\u0600-\u06ff]/), en=chars(compact,/[A-Za-z]/);
  if(fa+en<3) return null;

  const toFa=convert(compact,EN_TO_FA);
  const toEn=convert(compact,FA_TO_EN);

  const origFa = commonScore(compact,COMMON_FA)*5 + fa/(fa+en)*3;
  const origEn = commonScore(compact,COMMON_EN)*5 + en/(fa+en)*3;
  const candFa = commonScore(toFa,COMMON_FA)*5 + chars(toFa,/[\u0600-\u06ff]/)/Math.max(1,chars(toFa,/[\u0600-\u06ff]|[A-Za-z]/))*3;
  const candEn = commonScore(toEn,COMMON_EN)*5 + chars(toEn,/[A-Za-z]/)/Math.max(1,chars(toEn,/[\u0600-\u06ff]|[A-Za-z]/))*3;

  // Also reward plausible Persian/English character distribution.
  const faRatio=chars(toFa,/[\u0600-\u06ff]/)/Math.max(1,chars(toFa,/[\u0600-\u06ff]|[A-Za-z]/));
  const enRatio=chars(toEn,/[A-Za-z]/)/Math.max(1,chars(toEn,/[\u0600-\u06ff]|[A-Za-z]/));

  if(en>=3 && faRatio>=.60 && candFa>=origEn+1.5)
    return {text:toFa, direction:"en-fa", confidence:Math.min(1,(candFa-origEn)/8)};
  if(fa>=3 && enRatio>=.60 && candEn>=origFa+1.5)
    return {text:toEn, direction:"fa-en", confidence:Math.min(1,(candEn-origFa)/8)};
  return null;
}

function customReplacement(text){
  const map=settings.customWords || {};
  if(!map || !Object.keys(map).length) return null;
  let changed=false;
  // Longest trigger first prevents short triggers from consuming longer ones.
  const keys=Object.keys(map).filter(Boolean).sort((a,b)=>b.length-a.length);
  let out=text;
  for(const key of keys){
    if(!Object.prototype.hasOwnProperty.call(map,key)) continue;
    const value=String(map[key]);
    if(!value) continue;
    // Word/phrase boundary for Latin; Persian has no reliable JS \b.
    // Use Unicode-aware-ish negative letter checks for both scripts.
    const esc=key.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    const re=new RegExp(`(^|[^A-Za-z\\u0600-\\u06FF])(${esc})(?=$|[^A-Za-z\\u0600-\\u06FF])`,"giu");
    const next=out.replace(re,(m,prefix)=>{changed=true; return prefix+value;});
    out=next;
  }
  return changed?out:null;
}

function isEditable(el){
  if(!el) return false;
  if(el.tagName==="TEXTAREA") return true;
  if(el.tagName==="INPUT") return ["text","search","url","email","tel"].includes((el.type||"text").toLowerCase());
  return el.isContentEditable===true;
}
function valueOf(el){return (el.tagName==="INPUT"||el.tagName==="TEXTAREA")?el.value:(el.innerText||"");}
function emit(el,text){
  if(el.tagName==="INPUT"||el.tagName==="TEXTAREA"){
    const proto=el.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    const setter=Object.getOwnPropertyDescriptor(proto,"value")?.set;
    if(setter) setter.call(el,text); else el.value=text;
    el.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"insertText",data:text}));
    el.dispatchEvent(new Event("change",{bubbles:true}));
  }else{
    el.focus();
    document.execCommand("selectAll",false);
    document.execCommand("insertText",false,text);
    el.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"insertText",data:text}));
  }
}
function replaceSelection(el,text){
  if(el.tagName==="INPUT"||el.tagName==="TEXTAREA"){
    const s=el.selectionStart??0,e=el.selectionEnd??s;
    el.setRangeText(text,s,e,"end");
    el.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"insertText",data:text}));
  }else document.execCommand("insertText",false,text);
}
function selected(){const s=window.getSelection();return s&&s.rangeCount?s.toString():"";}

function showSuggestion(el, replacement, selectedText){
  document.getElementById("fkk-suggestion")?.remove();
  const box=document.createElement("div");
  box.id="fkk-suggestion"; box.dir="rtl";
  box.innerHTML=`<div style="font-weight:700;margin-bottom:6px">⌨️ احتمالاً زبان کیبورد اشتباه بوده</div><div style="margin-bottom:8px;word-break:break-word">${escapeHtml(replacement)}</div><button style="padding:6px 10px;cursor:pointer">جایگزین کن</button><button data-no style="padding:6px 10px;margin-right:6px;cursor:pointer">بستن</button>`;
  Object.assign(box.style,{position:"fixed",zIndex:"2147483647",right:"16px",bottom:"16px",maxWidth:"min(620px,calc(100vw - 32px))",padding:"14px 16px",background:"#202124",color:"#fff",borderRadius:"12px",boxShadow:"0 5px 25px rgba(0,0,0,.35)",font:"14px Tahoma,sans-serif"});
  box.querySelector("button").onclick=()=>{selectedText?replaceSelection(el,replacement):emit(el,replacement);box.remove();};
  box.querySelector("[data-no]").onclick=()=>box.remove();
  document.documentElement.appendChild(box);
  setTimeout(()=>box.remove(),10000);
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

function fixNow(){
  if(!settings.enabled) return;
  const el=document.activeElement, sel=selected();
  if(sel.length>=2 && isEditable(el)){
    const r=suspicious(sel);
    if(r) replaceSelection(el,r.text); else notify("متن مشکوکی برای اصلاح پیدا نشد.");
    return;
  }
  if(!isEditable(el)){notify("ابتدا داخل یک کادر متن کلیک کنید.");return;}
  const v=valueOf(el), r=suspicious(v);
  if(r) emit(el,r.text); else notify("متن مشکوکی برای اصلاح پیدا نشد.");
}
function notify(text){browser.runtime.sendMessage({type:"NOTIFY",text}).catch(()=>{});}

function shortcutMatches(e){
  const p=(settings.shortcut||"").split("+").map(x=>x.toUpperCase());
  if(!p.length)return false;
  const k=e.key.length===1?e.key.toUpperCase():e.key.toUpperCase();
  if(!p.includes(k))return false;
  return !!e.ctrlKey===p.includes("CTRL") &&
         !!e.altKey===p.includes("ALT") &&
         !!e.shiftKey===p.includes("SHIFT") &&
         !!e.metaKey===p.includes("META");
}

document.addEventListener("compositionstart",()=>composing=true,true);
document.addEventListener("compositionend",()=>composing=false,true);

document.addEventListener("keydown",e=>{
  if(!settings.enabled||composing)return;
  if(shortcutMatches(e)){e.preventDefault();e.stopPropagation();fixNow();}
},true);

document.addEventListener("input",e=>{
  if(!settings.enabled||composing||customInputGuard)return;
  const el=e.target;
  if(!isEditable(el)||el.tagName==="INPUT"&&el.type==="password")return;
  const v=valueOf(el);
  if(!v||v===lastValue)return;
  lastValue=v;

  // Custom words are evaluated on completed words in automatic mode.
  if(settings.autoReplace && settings.customWords && Object.keys(settings.customWords).length){
    clearTimeout(timer);
    timer=setTimeout(()=>{
      const r=customReplacement(valueOf(el));
      if(r && r!==valueOf(el)){customInputGuard=true;emit(el,r);customInputGuard=false;return;}
    },180);
  }

  // Smart keyboard correction: only after a pause and only with high confidence.
  if(settings.autoReplace){
    clearTimeout(timer);
    timer=setTimeout(()=>{
      const now=valueOf(el), r=suspicious(now);
      if(r && r.confidence>=.55){customInputGuard=true;emit(el,r.text);customInputGuard=false;}
    },700);
  }else{
    clearTimeout(timer);
    timer=setTimeout(()=>{
      const now=valueOf(el), r=suspicious(now);
      if(r && r.confidence>=.45) showSuggestion(el,r.text,"");
    },800);
  }
},true);

browser.runtime.onMessage.addListener(m=>{
  if(m?.type==="SETTINGS") settings={...DEFAULTS,...(m.settings||{})};
  if(m?.type==="FIX_TEXT") fixNow();
});
browser.runtime.sendMessage({type:"GET_SETTINGS"}).then(s=>settings={...DEFAULTS,...(s||{})}).catch(()=>{});
})();