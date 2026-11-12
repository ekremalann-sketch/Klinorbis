'use client';
// K10: Excel'deki yatak listesini yapıştır ya da CSV yükle → önizle → "Listeyi yükle".
import Link from 'next/link';
import {useState} from 'react';
import {parseBedList} from '../../../lib/bed-import';

export default function ImportForm(){
 const [text,setText]=useState(''),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false);
 const preview=text.trim()?parseBedList(text):null;
 async function file(f:File|undefined){if(f)setText(await f.text());}
 async function send(){setBusy(true);setMsg('');try{const r=await fetch('/api/hospital-coordination/import',{method:'POST',headers:{'content-type':'application/json','x-klinorbis-request':'browser'},body:JSON.stringify({text})});const d=await r.json() as {added?:number;skipped?:number;error?:string};if(!r.ok)throw Error(d.error??'Yüklenemedi.');setMsg(`${d.added} yeni yatak eklendi${d.skipped?`, ${d.skipped} yatak zaten vardı`:''}.`);setText('');}catch(e){setMsg(e instanceof Error?e.message:'Yüklenemedi.');}finally{setBusy(false);}}
 return <main className="bi"><style>{`.bi{max-width:900px;margin:auto;padding:24px;font-family:system-ui;color:rgb(18 48 71)}.bi textarea{width:100%;min-height:220px;font-family:ui-monospace,monospace;font-size:.85rem;padding:10px;border:1px solid rgb(190 205 216);border-radius:10px}.bi .go{min-height:48px;padding:0 20px;border:0;border-radius:10px;background:rgb(17 99 160);color:rgb(255 255 255);font-weight:700}.bi .go:disabled{opacity:.5}.bi .bad{color:rgb(176 32 32)}.bi table{border-collapse:collapse;width:100%;font-size:.85rem}.bi td,.bi th{border-bottom:1px solid rgb(225 232 238);padding:4px 6px;text-align:left}`}</style>
  <p><Link href="/yatak">← Yatak panosu</Link></p>
  <h1>Yatak listesini yükle</h1>
  <p>Excel’de şu sütunları seçip kopyalayın ve aşağıya yapıştırın (ya da CSV dosyası seçin): <b>yatak_kodu, kampus, bina, kat, birim, oda</b>. Bulut demo yalnız kurgusal yatak kodu kabul eder (ör. YTK-SIM-101). Var olan yataklar değişmez.</p>
  <p><input type="file" accept=".csv,text/csv,text/plain" onChange={e=>void file(e.target.files?.[0])}/></p>
  <textarea value={text} onChange={e=>setText(e.target.value)} placeholder={'yatak_kodu\tkampus\tbina\tkat\tbirim\toda\nYTK-SIM-101\tKampüs A\tBina 1\tKat 3\tYTK\t301'}/>
  {preview&&(preview.errors.length?<ul className="bad">{preview.errors.slice(0,8).map(e=><li key={e}>{e}</li>)}</ul>:<p>{preview.rows.length} yatak hazır.</p>)}
  {preview&&!preview.errors.length&&preview.rows.length>0&&<table><thead><tr><th>Yatak</th><th>Kampüs</th><th>Bina</th><th>Kat</th><th>Birim</th><th>Oda</th></tr></thead><tbody>{preview.rows.slice(0,10).map(r=><tr key={r.id}><td>{r.id}</td><td>{r.campus}</td><td>{r.building}</td><td>{r.floor}</td><td>{r.unit}</td><td>{r.room}</td></tr>)}</tbody></table>}
  <p><button className="go" disabled={busy||!preview||!!preview.errors.length||!preview.rows.length} onClick={()=>void send()}>{busy?'Yükleniyor…':'Listeyi yükle'}</button></p>
  {msg&&<p role="status">{msg}</p>}
  <p><Link href="/yatak/qr">QR etiketlerini yazdır →</Link></p>
 </main>;
}
