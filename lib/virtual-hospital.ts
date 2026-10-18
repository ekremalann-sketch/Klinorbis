import { recommendUnit, HOSPITAL_UNITS } from './hospital-units';
import { playbookOf } from './playbooks';
import { triggerFor } from './playbook-triggers';
import { planAbsence, type Appointment, type Physician, type Proposal } from './patient-access';

export const SIM_LABEL = 'SİMÜLASYON · Kurgusal hastane · Rakamlar varsayımlara dayanır, gerçek pilot sonucu değildir.';
export const SIM_UNITS = [
 ['ACY','Acil'],['YOG','Yoğun Bakım'],['DHL','Dahiliye'],['GCR','Cerrahi'],['AML','Ameliyathane'],
 ['BMD','Biyomedikal'],['BTI','Bilgi İşlem'],['TKH','Teknik Servis'],['CTM','Temizlik'],['ULS','Hasta Nakil'],
 ['ECZ','Eczane'],['LAB','Laboratuvar'],['RAD','Radyoloji'],['CAG','Çağrı Merkezi'],['HIL','Hasta Hizmetleri'],
 ['SIM-BAS','Başhekimlik'],['SIM-IDR','İdari İşler'],['SIM-IK','İK'],['SIM-GUV','Güvenlik'],['SIM-YEM','Yemekhane'],
 ['YTK','Yatak Yönetimi'],['TBR','Taburculuk'],['RND','Randevu Merkezi'],
].map(([code,name])=>({code,name,sim:true as const}));
export const SIM_STAFF = SIM_UNITS.flatMap((unit,i)=>Array.from({length:3+i%3},(_,j)=>({
 id:`S-${String(i*5+j+1).padStart(3,'0')}`, label:`${['Birim Sorumlusu','Hekim','Hemşire','Teknisyen','Çağrı Görevlisi'][j]} S-${String(i*5+j+1).padStart(3,'0')}`,
 role:['unit_manager','clinician','nurse','technician','call_agent'][j], unit:unit.code, shift:['08–16','16–24','24–08'][j%3], sim:true as const,
})));
export type SimSettings = { seed:number; speed:number; durationHours:number; callMinutes:number; actionSeconds:number; integrated:boolean; slaScale:number };
export const DEFAULT_SIM_SETTINGS:SimSettings={seed:1610,speed:60,durationHours:72,callMinutes:3,actionSeconds:15,integrated:false,slaScale:1};
type Step={task:string;unit:string;approval:boolean;clinical:boolean;wait:number;minutes:number;done:boolean;actor?:string};
export type SimEvent={id:string;sim:true;kind:string;title:string;at:number;unit:string;patientAlias:string|null;campus:string;bed:string|null;device:string|null;playbook:string|null;steps:Step[];step:number;activeAt:number;due:number;status:'open'|'done';level:number;startedBy:string;parent?:string;baselineCalls:number;baselineActions:number;actions:number;calls:number;auto:number;finishedAt?:number;proposal?:Proposal[]};
export type SimState={sim:true;label:string;id:string;status:'running'|'stopped'|'completed';cursor:number;lastWall:number;settings:SimSettings;events:SimEvent[];log:{at:number;text:string}[];notifications:{id:string;at:number;unit:string;text:string;sim:true}[];beds:{id:string;campus:string;unit:string;occupied:boolean;sim:true}[];handoffs:number;blockedDuplicates:number;skippedChains:number};
const EPOCH=Date.parse('2026-10-19T08:00:00+03:00');
export function simTime(minute:number){return new Date(EPOCH+minute*60000).toISOString();}
export function simHour(minute:number){return (8+Math.floor(minute/60))%24;}
function random(seed:number,n:number){let x=(seed+Math.imul(n+1,2654435761))|0;x=Math.imul(x^(x>>>16),2246822507);x=Math.imul(x^(x>>>13),3266489909);return ((x^(x>>>16))>>>0)/4294967296;}
export function validateSimSettings(value:unknown):SimSettings{
 const v=(value&&typeof value==='object'?value:{}) as Partial<SimSettings>;
 const number=(k:keyof SimSettings,min:number,max:number)=>{const n=v[k]??DEFAULT_SIM_SETTINGS[k];if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw new Error(`Geçersiz simülasyon ayarı: ${k}`);return n;};
 if(v.integrated!==undefined&&typeof v.integrated!=='boolean')throw new Error('Entegrasyon senaryosu geçersiz.');
 return {seed:Math.floor(number('seed',1,1000000)),speed:number('speed',1,360),durationHours:number('durationHours',24,72),callMinutes:number('callMinutes',0.5,15),actionSeconds:number('actionSeconds',1,120),slaScale:number('slaScale',0.25,4),integrated:v.integrated??false};
}
export function newSimulation(settings:SimSettings,now=Date.now()):SimState{
 return {sim:true,label:SIM_LABEL,id:`SIM-${settings.seed}-${now}`,status:'running',cursor:0,lastWall:now,settings,events:[],log:[{at:0,text:'Kurgusal hastane günü başladı. Dış sisteme hiçbir veri gönderilmez.'}],notifications:[],handoffs:0,blockedDuplicates:0,skippedChains:0,beds:Array.from({length:80},(_,i)=>({id:`YTK-SIM-${String(i+1).padStart(3,'0')}`,campus:i<40?'Örnek Kampüs A':'Örnek Kampüs B',unit:i%4===0?'YOG':i%2?'DHL':'GCR',occupied:random(settings.seed,i)<0.78,sim:true}))};
}
const CATALOG=[
 {kind:'call',title:'Kurgusal randevu çağrısı',unit:'RND',type:'',book:'',calls:3,actions:5},
 {kind:'absence',title:'Hekim yokluğu · 30 kurgusal randevu',unit:'RND',type:'',book:'',calls:30,actions:90},
 {kind:'discharge',title:'Kurgusal taburcu ve yatak temizliği',unit:'TBR',type:'discharge.ordered',book:'',calls:6,actions:12},
 {kind:'device',title:'Kurgusal cihaz arızası',unit:'BMD',type:'device.failure',book:'',calls:5,actions:10},
 {kind:'it',title:'Kurgusal bilgisayar / yazıcı arızası',unit:'BTI',type:'',book:'hbys-kesinti',calls:4,actions:8},
 {kind:'transfer',title:'Kurgusal hasta nakli',unit:'ULS',type:'transfer.ordered',book:'',calls:6,actions:10},
 {kind:'medicine',title:'Kurgusal ilaç talebi',unit:'ECZ',type:'stock.critical',book:'',calls:4,actions:8},
 {kind:'lab',title:'Kurgusal kritik sonuç · hekim incelemesi',unit:'LAB',type:'',book:'',calls:3,actions:6},
 {kind:'icu',title:'Kurgusal yoğun bakım yatağı talebi',unit:'YOG',type:'icu.bed_requested',book:'',calls:7,actions:12},
 {kind:'admission',title:'Kurgusal acilden servise yatış',unit:'ACY',type:'ed.boarding',book:'',calls:6,actions:10},
 {kind:'security',title:'Kurgusal güvenlik olayı',unit:'SIM-GUV',type:'',book:'',calls:4,actions:8},
 {kind:'followup',title:'Taburcu sonrası 48 saat kurgusal arama',unit:'HIL',type:'',book:'taburcu-anket',calls:3,actions:6},
];
function notify(s:SimState,e:SimEvent,text:string){s.notifications.push({id:`${e.id}-${s.cursor}-${s.notifications.length}`,at:s.cursor,unit:e.unit,text,sim:true});}
function addEvent(s:SimState,kind:string,at:number,parent?:string){
 if(s.events.length>=600){if(!s.log.some(x=>x.text.startsWith('Olay sınırı')))s.log.push({at:s.cursor,text:'Olay sınırı: 600 kurgusal kayıt. Mevcut işler tamamlanır; yeni olay üretimi durdu.'});return;}
 const c=CATALOG.find(x=>x.kind===kind)!;
 const duplicate=s.events.some(e=>e.kind===kind&&e.at===at&&e.parent===parent);
 if(duplicate){s.blockedDuplicates++;return;}
 const i=s.events.length+1, patient=['device','it','medicine','security'].includes(kind)?null:`HST-SIM-${String(i).padStart(3,'0')}`;
 const book=c.book||triggerFor(c.type)?.playbook||null, pb=book?playbookOf(book):null;
 const unit=c.unit.startsWith('SIM-')?c.unit:recommendUnit(c.title,c.unit).code;
 const steps:Step[]=pb?pb.steps.map(x=>({task:x.task,unit:x.unitCode,approval:x.approval,clinical:x.clinical,wait:x.waitMinutes,minutes:x.minutes*s.settings.slaScale,done:false})):[{task:kind==='lab'?'Yetkili kurgusal hekim sonucu inceler':'Görevi kabul et ve sonuçlandır',unit,approval:kind==='lab',clinical:kind==='lab',wait:0,minutes:20*s.settings.slaScale,done:false}];
 const e:SimEvent={id:`SIM-E-${String(i).padStart(5,'0')}`,sim:true,kind,title:c.title,at,unit,patientAlias:patient,campus:i%2?'Örnek Kampüs A':'Örnek Kampüs B',bed:patient?s.beds[i%80].id:null,device:kind==='device'?`CIH-SIM-${String(i).padStart(3,'0')}`:null,playbook:book,steps,step:0,activeAt:at+steps[0].wait,due:at+steps[0].wait+steps[0].minutes,status:'open',level:0,startedBy:'S-SIM-BASLATAN',parent,baselineCalls:c.calls,baselineActions:c.actions,actions:1,calls:0,auto:2};
 if(kind==='absence'){
  const physician:Physician={code:'SIM-H01',displayLabel:'Hekim S-01',unitCode:'DHL',facilityCode:'SIM-A',dailyCapacity:40,active:true};
  const peer={...physician,code:'SIM-H02',displayLabel:'Hekim S-02'};
  const day=new Date(EPOCH+at*60000+3*3600000).toISOString().slice(0,10);
  const appointments:Appointment[]=Array.from({length:30},(_,j)=>({reference:`SIM-RDV-${i}-${j+1}`,patientAlias:`HST-SIM-${String(j+1).padStart(3,'0')}`,physicianCode:physician.code,unitCode:'DHL',facilityCode:'SIM-A',startsAt:Date.parse(day+'T09:00:00+03:00')+j*15*60000,status:'scheduled',clinicalPriority:j%10===0,allowOtherPhysician:true,preferredChannel:'sms',consentChannels:['sms','phone']}));
  e.proposal=planAbsence({physician,day,appointments,physicians:[physician,peer],booked:{}});
  e.steps=[{task:'Kurgusal yönetici planı onaylar',unit:'RND',approval:true,clinical:false,wait:0,minutes:30,done:false}];e.auto+=30;
 }
 s.events.push(e);notify(s,e,'Yeni görev · yalnız simülasyon ekranında bildirim');
}
function finish(s:SimState,e:SimEvent){
 e.status='done';e.finishedAt=s.cursor;
 if(e.kind==='absence'){
  const review=e.proposal?.filter(p=>p.option==='clinical_review'||p.option==='callback').length??0;
  e.calls=s.settings.integrated?review:30;
  e.actions+=s.settings.integrated?review*2:30*2+(30-review);
  e.auto+=s.settings.integrated?(30-review)*2:0;
 }
 if(e.kind==='discharge'){addEvent(s,'followup',s.cursor,e.id);const bed=s.beds.find(b=>b.id===e.bed);if(bed)bed.occupied=false;}
 if(e.kind==='admission'||e.kind==='transfer'||e.kind==='icu'){
  const bed=s.beds.find(b=>!b.occupied&&(e.kind!=='icu'||b.unit==='YOG'));if(bed){bed.occupied=true;e.bed=bed.id;}else notify(s,e,'Yatak yok · kurgusal yöneticiye sevk değerlendirmesi');
 }
 const pb=e.playbook?playbookOf(e.playbook):null;
 if(pb?.next.length){s.skippedChains+=pb.next.length;s.log.push({at:s.cursor,text:`${e.id}: ${pb.next.length} bağlı akış koşulsuz açılmadı; ihtiyaç koşulu değerlendirilir.`});}
}
export function advanceSimulation(state:SimState,minutes:number,stopped=false):SimState{
 const s=structuredClone(state);if(stopped||s.status!=='running')return s;
 const end=Math.min(s.cursor+Math.max(0,Math.min(240,Math.floor(minutes))),s.settings.durationHours*60);
 for(;s.cursor<end;s.cursor++){
  const h=simHour(s.cursor),day=Math.floor(s.cursor/1440);
  if(s.cursor===0||s.cursor%1440===60)addEvent(s,'absence',s.cursor);
  if(s.cursor%480===0&&s.cursor>0){s.handoffs++;s.log.push({at:s.cursor,text:'Vardiya devri: açık kurgusal işler yeni vardiyaya aktarıldı.'});for(const e of s.events.filter(x=>x.status==='open')){e.auto++;notify(s,e,'Vardiya devri · görev yeni kurgusal sorumluda');}}
  if(random(s.settings.seed,s.cursor)<(h>=8&&h<11?0.22:h>=11&&h<15?0.18:h<8||h>=22?0.07:0.11)){
   const kinds=h>=8&&h<11?['call','call','device','it','transfer','lab']:h>=11&&h<15?['discharge','discharge','medicine','device','transfer','lab']:h<8||h>=22?['icu','admission','security','device']:['device','it','transfer','medicine','lab'];
   addEvent(s,kinds[Math.floor(random(s.settings.seed+day+31,s.cursor)*kinds.length)],s.cursor);
  }
  for(const e of s.events){
   if(e.status!=='open'||s.cursor<e.activeAt)continue;
   if(s.cursor>e.due&&e.level<2){const level=s.cursor>e.due+30?2:1;if(level>e.level){e.level=level;e.auto++;notify(s,e,level===1?'Süre aşıldı · birim sorumlusuna yükseltildi':'Süre aşıldı · operasyon yöneticisine yükseltildi');}}
   const step=e.steps[e.step];
   // Deterministic work delays include slow cases so escalation is exercised.
   const delay=(e.id.endsWith('7')?65:4+Math.floor(random(s.settings.seed,e.at+e.step)*20));
   if(s.cursor<e.activeAt+delay)continue;
   const staff=SIM_STAFF.find(x=>x.unit===step.unit&&x.role===(step.clinical?'clinician':'unit_manager'));
   step.actor=staff?.label??(step.clinical?'Hekim S-900':'Birim Sorumlusu S-901');step.done=true;e.actions++;e.auto++;
   if(step.approval){s.log.push({at:s.cursor,text:`${e.id}: ${step.actor} kurgusal onay verdi (başlatan kişiden farklı).`});}
   e.step++;
   if(e.step>=e.steps.length)finish(s,e);else{const next=e.steps[e.step];e.activeAt=s.cursor+next.wait;e.due=e.activeAt+next.minutes;e.unit=next.unit;e.level=0;notify(s,e,'Sıradaki birime otomatik görev');}
  }
 }
 if(s.cursor>=s.settings.durationHours*60){s.status='completed';s.log.push({at:s.cursor,text:'Kurgusal pilot süresi tamamlandı. Açık işler raporda korunur.'});}
 s.log=s.log.slice(-600);s.notifications=s.notifications.slice(-600);return s;
}
export function simulationMetrics(s:SimState){
 // Only completed cases enter the comparison; open work is never claimed as saved work.
 const done=s.events.filter(e=>e.status==='done');
 const sum=(key:'baselineCalls'|'baselineActions'|'calls'|'actions'|'auto')=>done.reduce((n,e)=>n+e[key],0);
 const baselineCalls=sum('baselineCalls'),calls=sum('calls'),baselineActions=sum('baselineActions'),actions=sum('actions');
 const baselineMinutes=baselineCalls*s.settings.callMinutes+baselineActions*s.settings.actionSeconds/60;
 const modeledMinutes=calls*s.settings.callMinutes+actions*s.settings.actionSeconds/60;
 return {label:SIM_LABEL,completed:done.length,open:s.events.length-done.length,baselineCalls,calls,baselineActions,actions,automatic:sum('auto'),baselineMinutes,modeledMinutes,savedMinutes:baselineMinutes-modeledMinutes,reduction:baselineMinutes?100*(baselineMinutes-modeledMinutes)/baselineMinutes:0,occupied:s.beds.filter(b=>b.occupied).length,beds:s.beds.length,source:'Kurgusal tamamlanan olaylar + düzenlenebilir süre varsayımları; gerçek personel ölçümü değildir.'};
}
