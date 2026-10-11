"use client";
import {cloneElement,useId,type ReactElement,type FormEvent} from "react";
type Control={id?:string;required?:boolean;onInvalid?:(e:FormEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>void;onInput?:(e:FormEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>void;"aria-required"?:boolean;"aria-invalid"?:boolean;"aria-describedby"?:string};
export default function Field({label,required=false,error,hint,children}:{label:string;required?:boolean;error?:string;hint?:string;children:ReactElement<Control>}){
 const generated=useId(),id=children.props.id||generated;
 return <label htmlFor={id} className="required-field"><span>{label}{required&&<b className="field-star" aria-hidden="true"> *</b>}</span>{cloneElement(children,{id,required,"aria-required":required,"aria-invalid":!!error,"aria-describedby":error?`${id}-error`:hint?`${id}-hint`:children.props["aria-describedby"],onInvalid:e=>{children.props.onInvalid?.(e);e.currentTarget.setCustomValidity(e.currentTarget.validity.valueMissing?`${label} alanını doldurun.`:`${label} için geçerli bir değer girin.`);},onInput:e=>{e.currentTarget.setCustomValidity("");children.props.onInput?.(e);}})}{hint&&<small id={`${id}-hint`}>{hint}</small>}{error&&<small id={`${id}-error`} role="alert">{error}</small>}</label>;
}
