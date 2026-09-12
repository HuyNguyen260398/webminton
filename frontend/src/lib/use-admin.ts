'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {accessToken,finishLogin,logout} from './auth';
import {getAdminTournament,sendCommand,type CommandInput} from './admin-api';
import type {TournamentDocument} from '../../../packages/domain/src/schema';
export function useAdmin(){
 const [data,setData]=useState<TournamentDocument|null>(null),[etag,setEtag]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[signedIn,setSignedIn]=useState(false);
 const pending=useRef<{serialized:string;id:string}|null>(null);
 const refresh=useCallback(async()=>{setSignedIn(!!accessToken());if(!accessToken()){setData(null);return;}try{const r=await getAdminTournament();setData(r.document);setEtag(r.etag);setError('');}catch(e){setError((e as Error).message);}},[]);
 useEffect(()=>{void finishLogin().then(refresh).catch(e=>setError(e.message));},[refresh]);
 const run=async(input:CommandInput)=>{if(busy)return false;setBusy(true);setError('');setNotice('');const serialized=JSON.stringify(input);if(pending.current?.serialized!==serialized)pending.current={serialized,id:crypto.randomUUID()};try{const r=await sendCommand({...input,requestId:pending.current!.id},etag);setData(r.document);setEtag(r.etag);pending.current=null;setNotice('Đã lưu thay đổi.');return true;}catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}};
 return {data,etag,error,notice,busy,signedIn,refresh,run,logout:()=>{logout();setData(null);setSignedIn(false);setEtag('');pending.current=null;}};
}
