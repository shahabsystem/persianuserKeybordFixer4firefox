const DEFAULTS={enabled:true,autoReplace:false,shortcut:"Alt+Shift+K",customWords:{}};
const $=id=>document.getElementById(id);
let data={...DEFAULTS};

async function load(){
  data={...DEFAULTS,...await browser.storage.local.get(DEFAULTS)};
  $("enabled").checked=!!data.enabled;
  $("autoReplace").checked=!!data.autoReplace;
  $("shortcut").value=data.shortcut||"";
  renderWords();
}
async function save(patch){
  data={...data,...patch};
  await browser.storage.local.set(patch);
  await browser.runtime.sendMessage({type:"SETTINGS_CHANGED"});
}
$("enabled").onchange=e=>save({enabled:e.target.checked});
$("autoReplace").onchange=e=>save({autoReplace:e.target.checked});

$("shortcut").onkeydown=async e=>{
  e.preventDefault();
  if(["Control","Alt","Shift","Meta"].includes(e.key))return;
  const p=[];
  if(e.ctrlKey)p.push("Ctrl"); if(e.altKey)p.push("Alt"); if(e.shiftKey)p.push("Shift"); if(e.metaKey)p.push("Meta");
  let k=e.key===" "?"Space":(e.key.length===1?e.key.toUpperCase():e.key);
  if(!p.length){$("shortcutStatus").textContent="حداقل یک Ctrl/Alt/Shift/Meta لازم است.";return;}
  p.push(k);
  const v=p.join("+"); $("shortcut").value=v; $("shortcutStatus").textContent="ذخیره شد";
  await save({shortcut:v});
};
$("clearShortcut").onclick=()=>{ $("shortcut").value=""; $("shortcutStatus").textContent="پاک شد"; save({shortcut:""}); };

function renderWords(){
  const body=$("wordList"); body.textContent="";
  const entries=Object.entries(data.customWords||{}).sort((a,b)=>a[0].localeCompare(b[0],"fa"));
  if(!entries.length){body.innerHTML='<tr><td colspan="3" class="empty">هنوز کلمه‌ای تعریف نشده است.</td></tr>';return;}
  for(const [k,v] of entries){
    const tr=document.createElement("tr");
    const a=document.createElement("td");a.textContent=k;
    const b=document.createElement("td");b.textContent=v;
    const c=document.createElement("td");
    const edit=document.createElement("button");edit.textContent="ویرایش";edit.onclick=()=>{ $("trigger").value=k;$("replacement").value=v;$("trigger").focus(); };
    const del=document.createElement("button");del.textContent="حذف";del.onclick=async()=>{const n={...data.customWords};delete n[k];await save({customWords:n});renderWords();};
    c.append(edit,del);tr.append(a,b,c);body.append(tr);
  }
}
$("addWord").onclick=async()=>{
  const k=$("trigger").value.trim(),v=$("replacement").value;
  if(!k){$("trigger").focus();return;}
  const n={...data.customWords,[k]:v};
  await save({customWords:n});$("trigger").value="";$("replacement").value="";renderWords();
};

$("testFix").onclick=()=>{
  const text=$("testBox").value;
  const r=detectForTest(text);
  $("testResult").textContent=r?`نتیجه پیشنهادی: ${r.text} — اطمینان: ${Math.round(r.confidence*100)}٪`:"مورد مشکوکی برای اصلاح پیدا نشد.";
};
$("testCustom").onclick=()=>{
  const r=customForTest($("testBox").value);
  $("testResult").textContent=r?`نتیجه کلمات سفارشی: ${r}`:"کلمه سفارشی قابل جایگزینی پیدا نشد.";
};
$("clearTest").onclick=()=>{$("testBox").value="";$("testResult").textContent="";};

function convert(text,map){return [...text].map(c=>map[c.toLowerCase()]??c).join("")}
const EN_TO_FA={q:"ض",w:"ص",e:"ث",r:"ق",t:"ف",y:"غ",u:"ع",i:"ه",o:"خ",p:"ح","[":"ج","]":"چ",a:"ش",s:"س",d:"ی",f:"ب",g:"ل",h:"ا",j:"ت",k:"ن",l:"م",";":"ک","'":"گ",z:"ظ",x:"ط",c:"ز",v:"ر",b:"ذ",n:"د",m:"پ",",":"و",".":".","/":"/","`":"پ"};
const FA_TO_EN=Object.fromEntries(Object.entries(EN_TO_FA).map(([k,v])=>[v,k]));
function scoreWords(t,set){return (t.toLowerCase().match(/[a-z\u0600-\u06ff]+/g)||[]).filter(x=>set.has(x)).length}
const FA=new Set("سلام خوبی من تو شما این آن که را به از برای با در و یا اگر ولی اما هم خیلی ممنون لطفا لطفاً برنامه فایل متن کیبورد فارسی انگلیسی است هست هستم می شود شد کرد کردم دارم دارد ایمیل شماره نام کاربر".split(/\s+/));
const EN=new Set("the and you your this that is are was for with from hello test please thanks what how why not can will have has about github firefox email phone name user".split(/\s+/));
function detectForTest(t){
 if(!t||t.trim().length<2)return null;
 const fa=[...t].filter(c=>/[\u0600-\u06ff]/.test(c)).length,en=[...t].filter(c=>/[A-Za-z]/.test(c)).length;
 const tf=convert(t,EN_TO_FA),te=convert(t,FA_TO_EN);
 const a=scoreWords(t,FA)*5+fa/Math.max(1,fa+en)*3,b=scoreWords(t,EN)*5+en/Math.max(1,fa+en)*3;
 const c=scoreWords(tf,FA)*5+[...tf].filter(x=>/[\u0600-\u06ff]/.test(x)).length/Math.max(1,[...tf].filter(x=>/[\u0600-\u06ff]|[A-Za-z]/.test(x)).length)*3;
 const d=scoreWords(te,EN)*5+[...te].filter(x=>/[A-Za-z]/.test(x)).length/Math.max(1,[...te].filter(x=>/[\u0600-\u06ff]|[A-Za-z]/.test(x)).length)*3;
 if(en>=3&&c>=b+1.5)return{text:tf,confidence:Math.min(1,(c-b)/8)};
 if(fa>=3&&d>=a+1.5)return{text:te,confidence:Math.min(1,(d-a)/8)};
 return null;
}
function customForTest(t){
 let o=t,changed=false;
 for(const [k,v] of Object.entries(data.customWords||{}).sort((a,b)=>b[0].length-a[0].length)){
  const esc=k.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const re=new RegExp(`(^|[^A-Za-z\\u0600-\\u06FF])(${esc})(?=$|[^A-Za-z\\u0600-\\u06FF])`,"giu");
  const n=o.replace(re,(m,p)=>{changed=true;return p+v});o=n;
 }
 return changed?o:null;
}

$("exportTxt").onclick=()=>{
 const lines=Object.entries(data.customWords||{}).map(([k,v])=>`${k} => ${v}`);
 const blob=new Blob([lines.join("\n")+"\n"],{type:"text/plain;charset=utf-8"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download="farsi-keyboard-fix-custom-words.txt";a.click();URL.revokeObjectURL(url);
};
$("importTxt").onchange=async e=>{
 const file=e.target.files?.[0];if(!file)return;
 const text=await file.text(),n={...data.customWords};
 for(const line of text.split(/\r?\n/)){
  const i=line.indexOf("=>");if(i<0)continue;
  const k=line.slice(0,i).trim(),v=line.slice(i+2);
  if(k)n[k]=v;
 }
 await save({customWords:n});renderWords();e.target.value="";
};
$("clearWords").onclick=async()=>{
 if(!confirm("همه کلمات سفارشی حذف شوند؟"))return;
 await save({customWords:{}});renderWords();
};
load();