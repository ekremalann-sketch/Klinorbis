"use client";
import {useEffect,useId,useRef,useState} from "react";
import {HOSPITAL_UNITS} from "../../lib/hospital-units";

const frequent=["ACY","RND","CAG","YTK","KRD"];
const ordered=[...HOSPITAL_UNITS].sort((a,b)=>{
 const rank=(code:string)=>frequent.includes(code)?frequent.indexOf(code):frequent.length;
 return rank(a.code)-rank(b.code)||a.name.localeCompare(b.name,"tr");
});
/** Local-only demo picker. Values are existing unit codes, never arbitrary text. */
export default function UnitPicker({value,onChange}:{value:string;onChange:(code:string)=>void}){
 const id=useId();const name=(code:string)=>HOSPITAL_UNITS.find(u=>u.code===code)?.name??"";
 const[text,setText]=useState(name(value));const[query,setQuery]=useState("");const[open,setOpen]=useState(false);const[active,setActive]=useState(0);
 const listRef=useRef<HTMLUListElement>(null);
 useEffect(()=>{const list=listRef.current;const selected=list?.querySelector<HTMLElement>('[aria-selected="true"]');if(list&&selected){if(selected.offsetTop<list.scrollTop)list.scrollTop=selected.offsetTop;else if(selected.offsetTop+selected.offsetHeight>list.scrollTop+list.clientHeight)list.scrollTop=selected.offsetTop+selected.offsetHeight-list.clientHeight}},[open,active,query]);
 const options=ordered.filter(u=>`${u.name} ${u.code}`.toLocaleLowerCase("tr").includes(query.trim().toLocaleLowerCase("tr")));
 function choose(code:string){onChange(code);setText(name(code));setQuery("");setOpen(false);setActive(0)}
 return <div className="demo-unit-picker"><label htmlFor={id}>Kaynak birim</label><p id={`${id}-hint`}>Yazmaya başlayın, örn. kardiyo</p>
  <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-invalid={!value} aria-controls={`${id}-list`} aria-activedescendant={open&&options[active]?`${id}-option-${options[active].code}`:undefined} aria-describedby={`${id}-hint`} autoComplete="off" value={value?name(value):text} required
   onFocus={()=>{setOpen(true);setQuery("");setActive(0)}}
   onChange={e=>{setText(e.target.value);setQuery(e.target.value);setActive(0);setOpen(true);onChange("")}}
   onBlur={()=>setOpen(false)}
   onKeyDown={e=>{if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();setOpen(true);setActive(i=>Math.max(0,Math.min(options.length-1,i+(e.key==="ArrowDown"?1:-1))))}else if(e.key==="Enter"&&open){e.preventDefault();if(options[active])choose(options[active].code)}else if(e.key==="Escape"){setOpen(false)}}}/>
  {open&&<ul ref={listRef} id={`${id}-list`} role="listbox" aria-label="Kaynak birim seçenekleri">{options.map((u,i)=><li key={u.code} id={`${id}-option-${u.code}`} role="option" aria-selected={i===active} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(u.code)}>{u.name}</li>)}{!options.length&&<li role="presentation">Birim bulunamadı; başka bir ad yazın.</li>}</ul>}
 </div>;
}
