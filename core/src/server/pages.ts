// Türkçe ekranlar: yatak panosu, temizlik kuyruğu, entegrasyon merkezi. Sunucu iskeleti üretir, veriyi küçük betik
// /api üzerinden alır. Bağlantı kesilirse ekran "güncel değil" uyarısı gösterir; eski veriyi yeni gibi göstermez.
import type { Principal } from "./auth.ts";

type Page = "yatak" | "temizlik" | "entegrasyon";
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const CSS = `
:root{--ink:#14202e;--muted:#5b6878;--line:#dde3ea;--bg:#f5f7fa;--card:#fff;--navy:#16324f;--ok:#0b6b4f;--okbg:#e3f5ee;--warn:#8a5300;--warnbg:#fff3df;--bad:#a12a1d;--badbg:#fdecea;--info:#174a7c;--infobg:#e8f1fb}
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg)}
header{background:var(--navy);color:#fff;padding:10px 20px;display:flex;align-items:center;gap:18px;flex-wrap:wrap}
header b{letter-spacing:.06em}header nav{display:flex;gap:4px;flex-wrap:wrap}header a{color:#dbe7f3;text-decoration:none;padding:6px 10px;border-radius:8px}
header a[aria-current]{background:#ffffff22;color:#fff;font-weight:600}header .who{margin-left:auto;font-size:13px;color:#c9d7e6}
main{max-width:1240px;margin:0 auto;padding:18px 20px 40px}h1{font-size:21px;margin:0 0 4px}.lead{color:var(--muted);margin:0 0 14px}
.status{display:flex;gap:10px;align-items:center;font-size:13px;color:var(--muted);margin-bottom:12px}.status .stale{color:var(--bad);font-weight:600}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}
.kpis div{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px}.kpis b{display:block;font-size:22px}.kpis span{color:var(--muted);font-size:13px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top;font-size:14px}th{background:#eef2f6;font-weight:600;font-size:13px}
tr:last-child td{border-bottom:0}.pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12.5px;font-weight:600;white-space:nowrap}
.ok{background:var(--okbg);color:var(--ok)}.warn{background:var(--warnbg);color:var(--warn)}.bad{background:var(--badbg);color:var(--bad)}.info{background:var(--infobg);color:var(--info)}.mut{background:#eef2f6;color:#3d4a5a}
button,select,input{font:inherit}button{border:1px solid var(--line);background:#fff;border-radius:8px;padding:5px 10px;cursor:pointer;font-weight:600;font-size:13px}
button.primary{background:var(--navy);border-color:var(--navy);color:#fff}button.danger{border-color:#e9b3ad;color:var(--bad)}button:disabled{opacity:.55;cursor:not-allowed}
.actions{display:flex;gap:6px;flex-wrap:wrap}.msg{min-height:22px;margin:6px 0;font-weight:600}.msg.err{color:var(--bad)}.msg.okm{color:var(--ok)}
.filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.filters button[aria-pressed=true]{background:var(--navy);color:#fff;border-color:var(--navy)}
section.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:14px 0}section.card h2{font-size:16px;margin:0 0 8px}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end}.row label{display:flex;flex-direction:column;gap:3px;font-size:13px;font-weight:600}
.row input,.row select,textarea{border:1px solid var(--line);border-radius:8px;padding:6px 8px;min-height:34px}small.note{color:var(--muted)}
dialog.ask{border:1px solid var(--line);border-radius:14px;padding:18px;max-width:min(440px,calc(100vw - 32px));width:100%}dialog.ask::backdrop{background:#0b1a2a88}
dialog.ask h2{margin:0 0 8px;font-size:18px}dialog.ask label{display:flex;flex-direction:column;gap:4px;margin:10px 0;font-weight:600;font-size:14px}dialog.ask em{font-style:normal;font-weight:400;color:var(--muted);font-size:12px}
dialog.ask input,dialog.ask select{min-height:44px;border:1px solid var(--line);border-radius:8px;padding:8px}.ask-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}.ask-actions button{min-height:44px;padding:8px 16px}.ask-err{color:var(--bad);min-height:1em;margin:4px 0}
:focus-visible{outline:3px solid #2b7bd6;outline-offset:2px}
@media (max-width:720px){th:not(:first-child):not(:nth-child(2)):not(:last-child),td:not(:first-child):not(:nth-child(2)):not(:last-child){display:none}header .who{margin-left:0}.actions{flex-direction:column}}
`;

const COMMON = `
const H={"content-type":"application/json","x-kb-request":"1"};
const $=(s)=>document.querySelector(s);
const e=(s)=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let lastOk=null;
function stamp(ok){const el=$("#stamp");if(ok){lastOk=new Date();el.innerHTML="Son güncelleme: "+lastOk.toLocaleTimeString("tr-TR");}else{el.innerHTML='<span class="stale">Bağlantı yok — gösterilen bilgiler '+(lastOk?lastOk.toLocaleTimeString("tr-TR")+" itibarıyladır":"alınamadı")+", güncel değildir.</span>";}}
function say(t,ok){const m=$("#msg");m.textContent=t;m.className="msg "+(ok?"okm":"err");}
async function get(u){const r=await fetch(u,{cache:"no-store"});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Bilgi alınamadı.");return d;}
async function post(u,b){const r=await fetch(u,{method:"POST",headers:H,body:JSON.stringify(b||{})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"İşlem tamamlanamadı.");return d;}
// Erişilebilir form penceresi (tarayıcı prompt kutusu yerine). Esc veya Vazgeç → null; zorunlu alanlar tarayıcıda da denetlenir.
function ask(o){return new Promise((res)=>{const d=document.createElement("dialog");d.className="ask";d.setAttribute("aria-labelledby","ask-t");
d.innerHTML='<form method="dialog" novalidate><h2 id="ask-t">'+e(o.title)+'</h2>'+(o.text?'<p>'+e(o.text)+'</p>':'')+o.fields.map((f,i)=>'<label>'+e(f.label)+' <em>'+(f.required?'zorunlu':'isteğe bağlı')+'</em>'+(f.options?'<select name="f'+i+'">'+f.options.map((x)=>'<option value="'+e(x[0])+'"'+(x[0]===f.value?' selected':'')+'>'+e(x[1])+'</option>').join("")+'</select>':'<input name="f'+i+'"'+(f.type?' type="'+f.type+'"':'')+(f.type==="number"?' min="'+f.min+'" max="'+f.max+'"':' maxlength="'+(f.maxlen||200)+'"')+(f.minlength?' minlength="'+f.minlength+'"':'')+(f.required?' required':'')+' value="'+e(f.value||"")+'">')+(f.hint?'<small class="note">'+e(f.hint)+'</small>':'')+'</label>').join("")+'<p class="ask-err" role="alert"></p><div class="ask-actions"><button type="button" data-x="cancel">Vazgeç</button><button class="primary" type="submit">'+e(o.ok||"Kaydet")+'</button></div></form>';
document.body.appendChild(d);const form=d.querySelector("form");let done=false;
d.querySelector('[data-x=cancel]').addEventListener("click",()=>d.close());
form.addEventListener("submit",(ev)=>{ev.preventDefault();if(!form.checkValidity()){d.querySelector(".ask-err").textContent="Zorunlu alanları kurallara uygun doldurun.";form.reportValidity();return;}done=true;d.close();});
d.addEventListener("close",()=>{const v=o.fields.map((f,i)=>form.elements["f"+i].value.trim());d.remove();res(done?v:null);});
d.showModal();const first=d.querySelector("input,select");if(first)first.focus();});}
async function act(u,b,okText){try{await post(u,b);say(okText,true);await load();}catch(x){say(x.message,false);}}
`;

const SCRIPTS: Record<Page, string> = {
  yatak: `
const OCC={bos:"Boş",dolu:"Dolu"},CLN={temiz:"Temiz",kirli:"Kirli",temizleniyor:"Temizleniyor",kontrol_bekliyor:"Kontrol bekliyor"},BLK={teknik:"Teknik arıza",personel:"Personel yok",izolasyon:"İzolasyon",diger:"Diğer"};
const CNF={kirli_yataga_yatis:"HBYS kirli yatağa yatış bildirdi",bloklu_yataga_yatis:"HBYS engelli yatağa yatış bildirdi"};
let filter="all";
async function load(){try{const d=await get("/api/beds");stamp(true);render(d);}catch(x){stamp(false);say(x.message,false);}}
function render(d){
  const t=d.units.reduce((a,u)=>({total:a.total+u.total,ready:a.ready+u.ready,occ:a.occ+u.occupied,dirty:a.dirty+u.dirty,blk:a.blk+u.blocked,cnf:a.cnf+u.conflicts}),{total:0,ready:0,occ:0,dirty:0,blk:0,cnf:0});
  $("#kpis").innerHTML=[["Hazır yatak",t.ready],["Dolu (HBYS)",t.occ],["Temizlik bekleyen",t.dirty],["Engelli",t.blk],["Çelişki",t.cnf],["Toplam",t.total]].map(([l,v])=>'<div><b>'+v+'</b><span>'+l+'</span></div>').join("");
  const rows=d.beds.filter(b=>filter==="all"||(filter==="ready"&&b.ready)||(filter==="dirty"&&b.cleaning_state!=="temiz")||(filter==="blocked"&&b.block_reason)||(filter==="conflict"&&b.conflict));
  $("#rows").innerHTML=rows.map(b=>{
    const occ='<span class="pill '+(b.occupancy==="dolu"?"info":"mut")+'">'+OCC[b.occupancy]+'</span>';
    const cln='<span class="pill '+(b.cleaning_state==="temiz"?"ok":"warn")+'">'+CLN[b.cleaning_state]+'</span>';
    const blk=b.block_reason?'<span class="pill bad">'+BLK[b.block_reason]+'</span>'+(b.block_note?' <small class="note">'+e(b.block_note)+'</small>':''):'—';
    const res=b.reserved_for&&new Date(b.reserved_until)>new Date()?'<span class="pill info">'+e(b.reserved_for)+' · '+new Date(b.reserved_until).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})+'</span>':'—';
    const ready=b.ready?'<span class="pill ok">Hazır</span>':(b.conflict?'<span class="pill bad">'+CNF[b.conflict]+'</span>':'<span class="pill mut">Hazır değil</span>');
    const a=[];if(!PERMS.has("bed.update"))return '<tr><td><b>'+e(b.unit_name)+'</b><br><small class="note">Oda '+e(b.room_code)+' · Yatak '+e(b.code)+'</small></td><td>'+ready+'</td><td>'+occ+'</td><td>'+cln+'</td><td>'+blk+'</td><td>'+res+'</td><td>—</td></tr>';
    if(!b.block_reason)a.push('<button data-a="block" data-id="'+b.id+'">Engel koy</button>');else a.push('<button data-a="unblock" data-id="'+b.id+'">Engeli kaldır</button>');
    if(b.ready)a.push('<button class="primary" data-a="reserve" data-id="'+b.id+'">Ayır</button>');
    if(b.reserved_for)a.push('<button data-a="release" data-id="'+b.id+'">Ayırmayı kaldır</button>');
    return '<tr><td><b>'+e(b.unit_name)+'</b><br><small class="note">Oda '+e(b.room_code)+' · Yatak '+e(b.code)+'</small></td><td>'+ready+'</td><td>'+occ+'</td><td>'+cln+'</td><td>'+blk+'</td><td>'+res+'</td><td><div class="actions">'+a.join("")+'</div></td></tr>';
  }).join("")||'<tr><td colspan="7">Bu filtrede yatak yok.</td></tr>';
}
document.addEventListener("click",async(ev)=>{
  const f=ev.target.closest("[data-f]");if(f){filter=f.dataset.f;document.querySelectorAll("[data-f]").forEach(x=>x.setAttribute("aria-pressed",String(x===f)));return load();}
  const b=ev.target.closest("button[data-a]");if(!b)return;const id=b.dataset.id,a=b.dataset.a;
  if(a==="block"){const v=await ask({title:"Yatağı engelle",ok:"Engeli kaydet",fields:[{label:"Engel nedeni",required:true,options:Object.entries(BLK),value:"teknik"},{label:"Kısa not",maxlen:200,hint:"Hasta bilgisi yazmayın."}]});if(!v)return;return act("/api/beds/"+id+"/block",{reason:v[0],note:v[1]},"Engel kaydedildi.");}
  if(a==="reserve"){const v=await ask({title:"Yatağı ayır",text:"Yalnız hazır yatak ayrılabilir; aynı anda gelen iki istekten yalnız biri kazanır.",ok:"Yatağı ayır",fields:[{label:"Hasta kısa kodu (P-…) veya akış referansı (AKS-…)",required:true,maxlen:40},{label:"Süre (dakika, 5–240)",type:"number",min:5,max:240,value:"60",required:true}]});if(!v)return;return act("/api/beds/"+id+"/reserve",{forRef:v[0],minutes:Number(v[1])},"Yatak ayrıldı.");}
  return act("/api/beds/"+id+"/"+a,{},a==="unblock"?"Engel kaldırıldı.":"Ayırma kaldırıldı.");
});
load();setInterval(load,30000);`,
  temizlik: `
const ST={queued:["Kuyrukta","mut"],accepted:["Kabul edildi","info"],in_progress:["Temizleniyor","warn"],done:["Kontrol bekliyor","info"]};
async function load(){try{const d=await get("/api/cleaning");stamp(true);render(d.jobs);}catch(x){stamp(false);say(x.message,false);}}
function render(jobs){
  $("#kpis").innerHTML=[["Kuyrukta",jobs.filter(j=>j.status==="queued").length],["Süren",jobs.filter(j=>j.status==="in_progress"||j.status==="accepted").length],["Kontrol bekleyen",jobs.filter(j=>j.status==="done").length],["Yeniden işlem",jobs.filter(j=>j.rework).length],["Süresi geçen",jobs.filter(j=>j.due_at&&new Date(j.due_at)<new Date()).length]].map(([l,v])=>'<div><b>'+v+'</b><span>'+l+'</span></div>').join("");
  $("#rows").innerHTML=jobs.map(j=>{
    const s=ST[j.status]||[j.status,"mut"];const late=j.due_at&&new Date(j.due_at)<new Date();
    const a=[];if(j.status==="queued")a.push('<button data-a="accept" data-id="'+j.id+'">Kabul et</button>');
    if(j.status==="queued"||j.status==="accepted")a.push('<button class="primary" data-a="start" data-id="'+j.id+'">Başla</button>');
    if(j.status==="in_progress")a.push('<button class="primary" data-a="complete" data-id="'+j.id+'">Tamamladım</button>');
    if(j.status==="done"&&!PERMS.has("cleaning.inspect"))a.push('<small class="note">Sorumlu kontrolü bekleniyor</small>');
    if(j.status==="done"&&PERMS.has("cleaning.inspect")){a.push('<button class="primary" data-a="pass" data-id="'+j.id+'">Kontrol: uygun</button>');a.push('<button class="danger" data-a="fail" data-id="'+j.id+'">Kontrol: yeniden temizlensin</button>');}
    if(["queued","accepted","in_progress"].includes(j.status))a.push('<button data-a="cancel" data-id="'+j.id+'">İptal</button>');
    return '<tr><td><b>'+e(j.unit_name)+'</b><br><small class="note">Oda '+e(j.room_code)+' · Yatak '+e(j.bed_code)+'</small></td><td><span class="pill '+s[1]+'">'+s[0]+'</span>'+(j.rework?' <span class="pill bad">Yeniden işlem</span>':'')+'</td><td>'+e({standart:"Standart",izolasyon:"İzolasyon",terminal:"Terminal"}[j.kind]||j.kind)+'</td><td>'+(j.due_at?'<span class="pill '+(late?"bad":"mut")+'">'+new Date(j.due_at).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})+(late?" · gecikti":"")+'</span>':'—')+'</td><td>'+e(j.accepted_by||"—")+(j.done_by?'<br><small class="note">Yapan: '+e(j.done_by)+'</small>':'')+'</td><td><div class="actions">'+a.join("")+'</div></td></tr>';
  }).join("")||'<tr><td colspan="6">Bekleyen temizlik işi yok.</td></tr>';
}
document.addEventListener("click",async(ev)=>{const b=ev.target.closest("button[data-a]");if(!b)return;const id=b.dataset.id,a=b.dataset.a;
  if(a==="pass")return act("/api/cleaning/"+id+"/inspect",{passed:true},"Kontrol tamam: yatak temiz.");
  if(a==="fail")return act("/api/cleaning/"+id+"/inspect",{passed:false},"Yeniden temizlik işi açıldı.");
  if(a==="cancel"){const v=await ask({title:"Temizlik işini iptal et",ok:"İşi iptal et",fields:[{label:"İptal nedeni",required:true,minlength:5,maxlen:200,hint:"En az 5 karakter."}]});if(!v)return;return act("/api/cleaning/"+id+"/cancel",{reason:v[0]},"İş iptal edildi.");}
  if(a==="complete")return act("/api/cleaning/"+id+"/complete",{checklist:["yuzey","carsaf","atik","dezenfeksiyon"]},"Tamamlandı; bağımsız kontrol bekleniyor.");
  return act("/api/cleaning/"+id+"/"+a,{},a==="accept"?"İş kabul edildi.":"Temizlik başladı.");});
load();setInterval(load,20000);`,
  entegrasyon: `
const ST={quarantined:["Karantina","warn"],failed:["Hata","bad"],dead_letter:["Ölü mektup","bad"]};
let meta={units:[],beds:[]};
async function load(){try{const d=await get("/api/integration");stamp(true);meta=d;render(d);}catch(x){stamp(false);say(x.message,false);}}
function render(d){
  const c=d.counts||{};
  $("#kpis").innerHTML=[["İşlenen (7 gün)",c.processed||0],["Karantina",c.quarantined||0],["Hata / ölü mektup",(c.failed||0)+(c.dead_letter||0)],["Çözülen",c.resolved||0],["Son başarılı işlem",d.lastProcessedAt?new Date(d.lastProcessedAt).toLocaleString("tr-TR"):"—"]].map(([l,v])=>'<div><b>'+v+'</b><span>'+l+'</span></div>').join("");
  $("#rows").innerHTML=d.open.map(m=>{const s=ST[m.status]||[m.status,"mut"];
    return '<tr><td><b>'+e(m.message_type)+'</b><br><small class="note">'+e(m.control_id)+'</small></td><td><span class="pill '+s[1]+'">'+s[0]+'</span></td><td>'+e(m.reason_label||m.error_code||"—")+'</td><td>'+(m.event_at?new Date(m.event_at).toLocaleString("tr-TR"):"—")+'</td><td>'+m.attempts+'</td><td><div class="actions">'+(m.status!=="dead_letter"?'<button class="primary" data-a="retry" data-id="'+m.id+'">Yeniden işle</button>':'')+'<button data-a="ignore" data-id="'+m.id+'">Yok say</button></div></td></tr>';}).join("")||'<tr><td colspan="6">Çözülmeyi bekleyen mesaj yok.</td></tr>';
  $("#maps").innerHTML=d.mappings.map(x=>'<tr><td>'+(x.kind==="unit"?"Birim":"Yatak")+'</td><td><code>'+e(x.external_code)+'</code></td><td>'+e(x.unit_name||"")+(x.bed_code?" · "+e(x.bed_code):"")+'</td></tr>').join("")||'<tr><td colspan="3">Henüz eşleme yok; HBYS kodları Klinorbis koduyla aynıysa gerekmez.</td></tr>';
  $("#unit").innerHTML=d.units.map(u=>'<option value="'+u.id+'">'+e(u.name)+' ('+e(u.code)+')</option>').join("");
  $("#bed").innerHTML=d.beds.map(b=>'<option value="'+b.id+'">'+e(b.unit_code)+' · '+e(b.room_code)+' · '+e(b.code)+'</option>').join("");
}
$("#kind").addEventListener("change",()=>{$("#unitw").hidden=$("#kind").value!=="unit";$("#bedw").hidden=$("#kind").value!=="bed";});
$("#mapform").addEventListener("submit",(ev)=>{ev.preventDefault();act("/api/integration/mappings",{kind:$("#kind").value,externalCode:$("#ext").value,unitId:$("#unit").value,bedId:$("#bed").value},"Eşleme eklendi. Karantinadaki ilgili mesajları yeniden işleyebilirsiniz.");});
$("#recform").addEventListener("submit",async(ev)=>{ev.preventDefault();
  const census=$("#census").value.split(/\\n/).map(l=>l.trim()).filter(Boolean).map(l=>{const [visit,unitCode,room,bed]=l.split(/[;,\\t]/).map(s=>s.trim());return {visit,unitCode,room,bed};});
  try{const r=await post("/api/integration/reconcile",{census});say("Mutabakat: "+r.matched+" eşleşti · HBYS'de olup Klinorbis'te olmayan "+r.missingInKlinorbis+" · Klinorbis'te olup HBYS'de olmayan "+r.missingInHbys+" · konum farkı "+r.locationMismatch,true);
    $("#recrows").innerHTML=r.items.map(i=>'<tr><td>'+({missing_in_klinorbis:"HBYS'de var, Klinorbis'te yok",missing_in_hbys:"Klinorbis'te var, HBYS'de yok",location_mismatch:"Konum farkı"}[i.kind])+'</td><td>'+e(i.detail)+'</td></tr>').join("")||'<tr><td colspan="2">Fark yok.</td></tr>';$("#census").value="";}catch(x){say(x.message,false);}});
document.addEventListener("click",async(ev)=>{const b=ev.target.closest("button[data-a]");if(!b)return;const id=b.dataset.id;
  if(b.dataset.a==="retry")return act("/api/integration/messages/"+id+"/retry",{},"Mesaj yeniden işlendi (sonuç tabloda).");
  const v=await ask({title:"Mesajı yok say",text:"Gerekçe denetim kaydına yazılır.",ok:"Yok say",fields:[{label:"Yok sayma gerekçesi",required:true,minlength:10,maxlen:300,hint:"En az 10 karakter."}]});if(!v)return;return act("/api/integration/messages/"+id+"/ignore",{reason:v[0]},"Mesaj yok sayıldı.");});
load();setInterval(load,30000);`,
};

const BODY: Record<Page, string> = {
  yatak: `<h1>Yatak panosu</h1><p class="lead">Doluluk HBYS'den gelir; temizlik, engel ve ayırma ayrı izlenir. "Hazır" yalnız boş, temiz, engelsiz ve ayrılmamış yataktır.</p>
<div class="filters" role="group" aria-label="Filtre"><button data-f="all" aria-pressed="true">Tümü</button><button data-f="ready" aria-pressed="false">Hazır</button><button data-f="dirty" aria-pressed="false">Temizlik bekleyen</button><button data-f="blocked" aria-pressed="false">Engelli</button><button data-f="conflict" aria-pressed="false">Çelişki</button></div>
<table><thead><tr><th>Birim / yatak</th><th>Hazırlık</th><th>Doluluk</th><th>Temizlik</th><th>Engel</th><th>Ayırma</th><th>İşlem</th></tr></thead><tbody id="rows"><tr><td colspan="7">Yükleniyor…</td></tr></tbody></table>`,
  temizlik: `<h1>Temizlik kuyruğu</h1><p class="lead">Taburcu ve nakilde yatak kendiliğinden kirli olur ve iş açılır. Tamamlanan işi, temizliği yapandan farklı bir kişi kontrol eder; uygun değilse yeniden işlem açılır.</p>
<table><thead><tr><th>Birim / yatak</th><th>Durum</th><th>Tür</th><th>Hedef saat</th><th>Kabul eden</th><th>İşlem</th></tr></thead><tbody id="rows"><tr><td colspan="6">Yükleniyor…</td></tr></tbody></table>`,
  entegrasyon: `<h1>Entegrasyon merkezi</h1><p class="lead">HBYS'den gelen mesajlar. Eşlenmeyen kod, eski tarihli olay veya mevcut durumla çelişen mesaj veriyi değiştirmeden karantinaya alınır; burada çözülür. HBYS'ye hiçbir şey yazılmaz.</p>
<table><thead><tr><th>Mesaj</th><th>Durum</th><th>Neden</th><th>Olay zamanı</th><th>Deneme</th><th>İşlem</th></tr></thead><tbody id="rows"><tr><td colspan="6">Yükleniyor…</td></tr></tbody></table>
<section class="card"><h2>Kod eşleme</h2><form id="mapform" class="row"><label>Tür<select id="kind"><option value="unit">Birim</option><option value="bed">Yatak</option></select></label>
<label>HBYS kodu *<input id="ext" required maxlength="60" placeholder="ör. DAHILIYE-4 veya DHL^312^312-A"></label>
<label id="unitw">Klinorbis birimi<select id="unit"></select></label><label id="bedw" hidden>Klinorbis yatağı<select id="bed"></select></label><button class="primary">Eşlemeyi ekle</button></form>
<table style="margin-top:10px"><thead><tr><th>Tür</th><th>HBYS kodu</th><th>Klinorbis</th></tr></thead><tbody id="maps"></tbody></table></section>
<section class="card"><h2>Mutabakat</h2><p class="lead">HBYS'nin anlık yatan hasta listesini yapıştırın (her satır: ziyaret no; birim kodu; oda; yatak). Farklar listelenir, kendiliğinden düzeltilmez. Liste kaydedilmez; ziyaret numaraları yalnız anahtarlı karma olarak karşılaştırılır.</p>
<form id="recform"><textarea id="census" rows="4" style="width:100%" placeholder="V-1001;DHL;312;312-A"></textarea><div class="row" style="margin-top:6px"><button class="primary">Karşılaştır</button></div></form>
<table style="margin-top:10px"><thead><tr><th>Fark</th><th>Ayrıntı</th></tr></thead><tbody id="recrows"></tbody></table></section>`,
};

const NAV: [Page, string][] = [["yatak", "Yatak panosu"], ["temizlik", "Temizlik"], ["entegrasyon", "Entegrasyon merkezi"]];

export function page(name: Page, p: Principal, nonce: string) {
  const nav = NAV.filter(([k]) => k !== "entegrasyon" || p.permissions.has("integration.manage"))
    .map(([k, label]) => `<a href="/${k}"${k === name ? ' aria-current="page"' : ""}>${label}</a>`).join("");
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(NAV.find(([k]) => k === name)![1])} · Klinorbis</title><style>${CSS}</style></head>
<body><header><b>KLINORBIS</b><nav aria-label="Ekranlar">${nav}</nav><span class="who">${esc(p.label)} · ${esc(p.tenantCode)}</span></header>
<main>${BODY[name].replace("</p>", `</p><div class="status"><span id="stamp">Yükleniyor…</span></div><div class="kpis" id="kpis"></div><p id="msg" class="msg" role="status" aria-live="polite"></p>`)}</main>
<script nonce="${nonce}">const PERMS=new Set(${JSON.stringify([...p.permissions]).replace(/</g, "\\u003c")});${COMMON}${SCRIPTS[name]}</script></body></html>`;
}
