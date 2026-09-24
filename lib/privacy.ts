export type RedactionResult={maskedText:string;detected:string[]};

function validTckn(value:string){
 if(!/^[1-9]\d{10}$/.test(value))return false;
 const d=[...value].map(Number);
 return ((d.slice(0,9).reduce((a,n,i)=>a+n*(i%2===0?7:-1),0)%10+10)%10===d[9])&&d.slice(0,10).reduce((a,n)=>a+n,0)%10===d[10];
}

export function redactPII(input:string):RedactionResult{
 let maskedText=input.normalize("NFC"); const detected:string[]=[];
 maskedText=maskedText.replace(/\b[1-9]\d{10}\b/g,v=>{if(!validTckn(v))return v;detected.push("TCKN");return "[TCKN_MASKED]"});
 maskedText=maskedText.replace(/\b(?:\+?90\s?|0)?(?:5\d{2}|[2-4]\d{2})[\s().-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}\b/g,()=>{detected.push("TELEFON");return "[PHONE_MASKED]"});
 maskedText=maskedText.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,()=>{detected.push("E-POSTA");return "[EMAIL_MASKED]"});
 return {maskedText,detected:[...new Set(detected)]};
}

const critical=["göğüs ağrısı","nefes alamıyorum","nefes alamıyor","şiddetli kanama","bilinç kaybı","solunum durması","havale","felç","inme"];
const negations=["yok","değil","olmadı","bulunmuyor"];
export function urgencySignal(text:string){
 const normalized=text.toLocaleLowerCase("tr-TR").normalize("NFC");
 for(const phrase of critical){
  const at=normalized.indexOf(phrase); if(at<0)continue;
  const context=normalized.slice(Math.max(0,at-24),Math.min(normalized.length,at+phrase.length+24));
  if(negations.some(n=>context.includes(`${phrase} ${n}`)))continue;
  return {level:5 as const,isEmergency:true,matched:phrase,category:"ACİL OLASILIK SİNYALİ",recommendedUnit:"Acil Yönlendirme"};
 }
 const high=["yüksek ateş","şiddetli ağrı","durmayan kusma"].find(x=>normalized.includes(x));
 return high?{level:4 as const,isEmergency:false,matched:high,category:"ÖNCELİKLİ İNSAN İNCELEMESİ",recommendedUnit:"Hasta İletişim"}:{level:2 as const,isEmergency:false,matched:null,category:"STANDART TALEP",recommendedUnit:"Hasta İletişim"};
}
