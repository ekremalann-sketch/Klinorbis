import { aliasLooksLikeName, NAME_MASK, redactForDisplay, redactPII } from "./privacy";
import type { RequestActor } from "./security";
const hidden=new Set(["patientAlias","subject","summary","message","detail","decisionDetail","outcome","note","notes","reason","absenceReason","body","payload","payloadJson","resultJson","result","history","messages","openingMessage","alternative","contactAddress","phone","email","notificationText","text","contact","address","providerAlias","staffLabel","displayLabel"]);
// Tüm roller için: serbest metin alanlarında olası hasta adları maskelenir (kimlik/iletişim maskesine ek olarak).
const freeText=new Set(["subject","summary","message","detail","decisionDetail","outcome","note","notes","reason","absenceReason","body","openingMessage","alternative","notificationText","text","history","lastError"]);
export function displayView<T>(value:T):T {
 const walk=(item:unknown,key=""):unknown=>{
  if(item instanceof Date)return item;
  if(Array.isArray(item))return item.map(v=>walk(v,key==="messages"?"":key));
  if(item&&typeof item==="object")return Object.fromEntries(Object.entries(item).map(([k,v])=>[k,walk(v,k)]));
  if(typeof item!=="string")return item;
  if(key==="patientAlias")return aliasLooksLikeName(item)?NAME_MASK:item;
  return freeText.has(key)?redactForDisplay(item):item;
 };
 return walk(value) as T;
}
export function oversightView<T>(actor:RequestActor,value:T):T {
 if(!["privacy_officer","security_officer"].includes(actor.role))return displayView(value);
 const walk=(item:unknown,key=""):unknown=>{
  if(hidden.has(key))return Array.isArray(item)?[]:item===null?null:typeof item==="object"?{}:"[GÖZETİM: İÇERİK GİZLİ]";
  if(item instanceof Date)return item;
  if(Array.isArray(item))return item.map(v=>walk(v));
  if(item&&typeof item==="object")return Object.fromEntries(Object.entries(item).map(([k,v])=>[k,walk(v,k)]));
  return typeof item==="string"?redactPII(item).maskedText:item;
 };
 return walk(value) as T;
}
