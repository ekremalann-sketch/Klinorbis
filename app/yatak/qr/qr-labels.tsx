'use client';
// K10: yatak başı QR etiketleri. QR, temizlik telefon ekranını o yatakla açar (/temizlik?yatak=KOD). Hasta bilgisi yok.
import Link from 'next/link';
import {useEffect,useState} from 'react';
import qrcode from 'qrcode-generator';

type Bed={id:string;campus:string;floor:string;unit:string;room:string};
export function qrSvg(text:string){const q=qrcode(0,'M');q.addData(text);q.make();return q.createSvgTag({cellSize:4,margin:2,scalable:true});}

export default function QrLabels(){
 const [beds,setBeds]=useState<Bed[]|null>(null),[err,setErr]=useState(''),[origin,setOrigin]=useState('');
 useEffect(()=>{fetch('/api/hospital-coordination',{cache:'no-store'}).then(async r=>{const d=await r.json() as {beds?:Bed[];error?:string};if(!r.ok)throw Error(d.error??'Liste alınamadı.');setOrigin(window.location.origin);setBeds(d.beds??[]);}).catch(e=>setErr(String(e.message)));},[]);
 return <main className="qr"><style>{`.qr{padding:16px;font-family:system-ui;color:rgb(18 48 71)}.qr .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}.qr .lbl{border:1px dashed rgb(150 165 180);border-radius:8px;padding:10px;text-align:center;break-inside:avoid}.qr h1{font-size:1.4rem;margin:8px 0}.qr .print{min-height:44px;padding:0 18px;border:0;border-radius:10px;background:rgb(17 99 160);color:rgb(255 255 255);font-weight:700}.qr .lbl span{display:block}.qr .lbl svg{display:block;margin:0 auto;width:140px;height:140px}.qr .lbl b{display:block;font-size:1.05rem}.qr .lbl small{color:rgb(90 107 125)}@media print{.qr .noprint{display:none}.qr{padding:0}}`}</style>
  <div className="noprint"><p><Link href="/yatak">← Yatak panosu</Link></p><h1>QR etiketleri</h1><p>Her etiketi yatağın başına yapıştırın. Temizlik personeli okuttuğunda telefonunda o yatağın işi açılır.</p><p><button className="print" onClick={()=>window.print()}>Yazdır</button></p></div>
  {err&&<p role="alert">{err}</p>}{!beds&&!err&&<p>Yükleniyor…</p>}
  {beds&&<div className="grid">{beds.map(b=><div className="lbl" key={b.id}><span dangerouslySetInnerHTML={{__html:qrSvg(`${origin}/temizlik?yatak=${encodeURIComponent(b.id)}`)}}/><b>{b.id}</b><small>{b.unit} · {b.floor} · Oda {b.room}</small></div>)}</div>}
 </main>;
}
