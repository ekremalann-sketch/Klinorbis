"use client";

import { useState } from "react";
import Link from "next/link";

const views = {
  overview: { label: "Overview", title: "Today's operations", cards: [["Open requests","24","8% fewer than yesterday"],["SLA risk","3","Human approval needed"],["Active calls","7","2 at handover"],["Capacity","82%","12 beds available"]] },
  requests: { label: "Requests", title: "Prioritised requests", cards: [["New","11","Last 30 minutes"],["In progress","9","Owner assigned"],["Awaiting approval","3","Manager decision"],["Completed","41","Today"]] },
  capacity: { label: "Capacity", title: "Units and resources", cards: [["Critical care","91%","Critical threshold"],["Ward beds","78%","Normal"],["Operating rooms","6/8","2 rooms available"],["Transport vehicles","3/4","1 on assignment"]] },
} as const;
const queue = [
  ["KLB-24018","Emergency → Cardiology","High","04:12"],
  ["KLB-24017","Critical care bed request","Critical","02:38"],
  ["KLB-24016","Imaging appointment coordination","Normal","11:05"],
  ["KLB-24015","Transport team assignment","High","07:44"],
];

export default function EnglishDemo(){
  const [view,setView]=useState<keyof typeof views>("overview");
  const [priority,setPriority]=useState<"All"|"High"|"Critical">("All");
  const [approvals,setApprovals]=useState(false);
  const next=priority==="All"?"High":priority==="High"?"Critical":"All";
  const rows=queue.filter(item=>priority==="All"||item[2]===priority);
  return <main className="demo-shell" lang="en">
    <aside className="demo-sidebar">
      <Link className="demo-brand" href="/en"><span>K</span><b>KLINORBIS</b></Link><small>OPERATIONS CONTROL TOWER</small>
      <nav aria-label="Demo sections">{Object.entries(views).map(([key,item])=><button key={key} type="button" aria-current={view===key?"page":undefined} className={view===key?"active":""} onClick={()=>setView(key as keyof typeof views)}>{item.label}</button>)}</nav>
      <div className="demo-trust"><i/> SYNTHETIC DEMO DATA<small>No real patient information</small></div>
      <Link className="demo-back" href="/en">← Back to product</Link><Link className="demo-back" href="/demo" hrefLang="tr">Türkçe demo</Link>
    </aside>
    <section className="demo-main">
      <header className="demo-topbar"><div><span>Control centre · Example scenario</span><h1>{views[view].title}</h1></div><div className="demo-status">Synthetic data</div></header>
      <div className="demo-kpis">{views[view].cards.map(([label,value,note])=><article key={label}><small>{label}</small><strong>{value}</strong><span>{note}</span></article>)}</div>
      <div className="demo-grid">
        <article className="demo-panel demo-wide"><header><div><small>EXAMPLE WORKFLOW</small><h2>Priority operations queue</h2></div><button type="button" aria-label={`Priority filter: ${priority}. Next: ${next}`} onClick={()=>setPriority(next)}>Priority: {priority}</button></header>
          <div className="demo-table" aria-live="polite"><div className="demo-row demo-head"><span>Reference</span><span>Flow</span><span>Priority</span><span>Time</span></div>{rows.map(([ref,flow,p,time])=><div className="demo-row" key={ref}><b>{ref}</b><span>{flow}</span><em className={p==="Critical"?"critical":p==="High"?"high":"normal"}>{p}</em><time>{time}</time></div>)}</div>
        </article>
        <article className="demo-panel"><small>CAPACITY SIGNAL</small><h2>Unit occupancy</h2>{[["Emergency",88],["Critical care",91],["Cardiology",74],["Imaging",63]].map(([n,v])=><div className="capacity" key={String(n)}><span>{n}<b>{v}%</b></span><div><i style={{width:`${v}%`}}/></div></div>)}</article>
        <article className="demo-panel"><small>HUMAN APPROVAL</small><h2>Controlled automation</h2><div className="approval"><span>Example transfer plan</span><b>3 decisions pending</b><p>Critical routing does not proceed without an authorised human decision.</p><button type="button" aria-expanded={approvals} aria-controls="en-demo-approvals" onClick={()=>setApprovals(!approvals)}>{approvals?"Close decision queue":"Review decision queue"}</button><div id="en-demo-approvals" hidden={!approvals} className="demo-approvals" aria-live="polite"><p><b>KLB-24017</b> · Critical care bed request · Clinical team approval pending.</p><p><b>KLB-24018</b> · Emergency transfer · Unit lead approval pending.</p><p><b>KLB-24015</b> · Transport coordination · Operations manager approval pending.</p><small>This demo does not change records. Only authorised staff can make real approvals.</small></div></div></article>
      </div><footer className="demo-footer">KLINORBIS product demo · Generated data only · No clinical decisions.</footer>
    </section>
  </main>;
}
