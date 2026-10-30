export type AttentionSource = {tasks:Array<{status:string;priority:string;dueAt?:string|number|Date|null}>;approvals:Array<{status:string}>;calls:Array<{status:string;requiresHuman:boolean}>};
export function attentionItems(source:AttentionSource,at=Date.now()){
 const open=source.tasks.filter(t=>!["completed","cancelled","scheduled"].includes(t.status));
 const urgent=open.filter(t=>t.priority==="Acil").length;
 const overdue=open.filter(t=>t.dueAt&&new Date(t.dueAt).getTime()<at).length;
 return [
  {view:"inbox",label:urgent?"Kritik işler":"İş kutusu",value:open.length,detail:urgent?`${urgent} acil · ${overdue} geciken`:`${overdue} geciken`,critical:urgent>0},
  {view:"approvals",label:"Onay bekleyen",value:source.approvals.filter(a=>a.status==="pending").length,detail:"Yetkili onayı gerekiyor",critical:false},
  {view:"calls",label:"İnsan devri",value:source.calls.filter(c=>c.requiresHuman&&!["completed","cancelled"].includes(c.status)).length,detail:"Görüşmeyi devralın",critical:false},
 ];
}
