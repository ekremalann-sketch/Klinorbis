#!/usr/bin/env node
// SQL / archive encryption utility. Does not fetch a production backup or run restore.
import {readFile,writeFile} from 'node:fs/promises';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
const [mode,input,output]=process.argv.slice(2);
try{
 if(!['encrypt','decrypt'].includes(mode)||!input||!output||input===output)throw new Error('Kullanım: node scripts/encrypted-backup.mjs encrypt|decrypt giriş çıkış');
 const key=Buffer.from(process.env.BACKUP_ENCRYPTION_KEY||'','base64');if(key.length!==32)throw new Error('BACKUP_ENCRYPTION_KEY ayrı güvenli ortamda 32 bayt base64 anahtar olmalı.');
 const header=Buffer.from('BKUPv1\0'),source=await readFile(input);let result;
 if(mode==='encrypt'){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(header);const content=Buffer.concat([cipher.update(source),cipher.final()]);result=Buffer.concat([header,iv,cipher.getAuthTag(),content]);}
 else{if(source.length<header.length+28||!source.subarray(0,header.length).equals(header))throw new Error('Yedek biçimi geçersiz.');const offset=header.length,decipher=createDecipheriv('aes-256-gcm',key,source.subarray(offset,offset+12));decipher.setAAD(header);decipher.setAuthTag(source.subarray(offset+12,offset+28));result=Buffer.concat([decipher.update(source.subarray(offset+28)),decipher.final()]);}
 await writeFile(output,result,{flag:'wx',mode:0o600});console.log('Dosya oluşturuldu.');
}catch{console.error('Yedek işlemi başarısız. Parametreleri, anahtarı, dosya bütünlüğünü ve hedefin boş olduğunu kontrol edin.');process.exitCode=1;}
