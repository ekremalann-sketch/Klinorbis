export const COORDINATION_STATES:Record<string,string>={assessment:"Uygunluk değerlendiriliyor",approval_pending:"Plan onayı bekliyor",approved:"Bilgilendirme bekliyor",notified:"Hasta bilgilendirildi",completed:"Süreç tamamlandı"};
export type Plan={state:string;providerAlias:string;availability:string;plannedAt:string;alternative:string;contactChannel:string;notificationStatus:string;requestedBy:string;approvedBy:string|null;history:string};
export function coordinationTransition(current:Plan,action:string,body:Record<string,unknown>,actor:{email:string;role:string},now=new Date()):Plan{
 const next={...current};const note=String(body.note||"").trim().slice(0,1500);if(!note)throw Error("İşlem gerekçesi / bilgilendirme sonucu gerekli.");
 if(current.state==="completed")throw Error("Tamamlanmış koordinasyon değiştirilemez.");
 if(action==="plan"){
 if(!["assessment","approval_pending"].includes(current.state))throw Error("Onaylı planı değiştirmek için yeniden planlama açın.");
 next.providerAlias=String(body.providerAlias||"").trim().slice(0,80);next.availability=String(body.availability||"");next.plannedAt=String(body.plannedAt||"");if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(next.plannedAt))next.plannedAt+="+03:00";next.alternative=String(body.alternative||"").trim().slice(0,600);next.contactChannel=String(body.contactChannel||"");
 if(!["available","unavailable","unconfirmed"].includes(next.availability))throw Error("Doktor uygunluğu seçin.");
 if(!["Telefon","SMS","WhatsApp","Portal","E-posta"].includes(next.contactChannel))throw Error("Bilgilendirme kanalı seçin.");
 if(next.availability==="unconfirmed")throw Error("Doktor uygunluğu teyit edilmeden plan onaya gönderilemez.");
 if(!next.providerAlias||!next.plannedAt||!Number.isFinite(Date.parse(next.plannedAt))||Date.parse(next.plannedAt)<=now.getTime())throw Error("Doktor / sorumlu takma adı ve gelecekteki plan zamanı gerekli.");
 if(next.availability==="unavailable"&&!next.alternative)throw Error("Doktor yoksa alternatif doktor, birim veya yeniden planlama gerekçesi gerekli.");
 next.state="approval_pending";next.requestedBy=actor.email;next.approvedBy=null;next.notificationStatus="pending";
 }else if(action==="approve"||action==="reject"){
 if(current.state!=="approval_pending")throw Error("Bekleyen plan onayı yok.");
 if(!["operations_manager","unit_manager","clinician"].includes(actor.role))throw Error("Planı yetkili yönetici veya klinisyen onaylamalı.");
 if(actor.email===current.requestedBy)throw Error("Planı hazırlayan kişi kendi planını onaylayamaz.");
 next.state=action==="approve"?"approved":"assessment";next.approvedBy=action==="approve"?actor.email:null;
 }else if(action==="notify"){
 if(!["approved","notified"].includes(current.state))throw Error("Hasta bilgilendirmesi öncesinde plan onayı gerekir.");
 const outcome=String(body.outcome||"");if(!["recorded","failed"].includes(outcome))throw Error("Gerçek iletişim sonucu seçin.");
 next.notificationStatus=outcome;next.state=outcome==="recorded"?"notified":"approved";
 }else if(action==="replan"){
 next.state="assessment";next.approvedBy=null;next.notificationStatus="pending";
 }else if(action==="complete"){
 if(current.state!=="notified"||current.notificationStatus!=="recorded")throw Error("Hasta bilgilendirmesi kaydedilmeden süreç kapatılamaz.");next.state="completed";
 }else throw Error("Geçersiz koordinasyon işlemi.");
 next.history=JSON.stringify([...JSON.parse(current.history),{at:now.toISOString(),actor:actor.email,action,note}]);return next;
}
