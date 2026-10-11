"use client";
import {useEffect,useRef,useState,type ReactNode} from "react";
export default function ExportMenu({children}:{children:ReactNode}){
 const ref=useRef<HTMLDetailsElement>(null),[open,setOpen]=useState(false);
 useEffect(()=>{if(!open)return;const close=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))ref.current?.removeAttribute("open");};const esc=(e:KeyboardEvent)=>{if(e.key==="Escape"){ref.current?.removeAttribute("open");ref.current?.querySelector("summary")?.focus();}};document.addEventListener("pointerdown",close);document.addEventListener("keydown",esc);return()=>{document.removeEventListener("pointerdown",close);document.removeEventListener("keydown",esc);};},[open]);
 return <details ref={ref} className="compact-actions" onToggle={e=>setOpen(e.currentTarget.open)}><summary aria-label="Dosya işlemlerini göster">İşlemler <span aria-hidden="true">⋯</span></summary><div className="compact-actions-menu" onClick={e=>{if((e.target as Element).closest("button,a"))ref.current?.removeAttribute("open");}}>{children}</div></details>;
}
