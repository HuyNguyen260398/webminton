import type {TournamentDocument} from '../../../packages/domain/src/schema';
import type {TournamentCommand} from '../../../packages/domain/src/commands';
import {accessToken,clearSession} from './auth';
export type CommandInput=TournamentCommand extends infer T?T extends {requestId:string}?Omit<T,'requestId'>:never:never;
export async function adminRequest(path:string,init:RequestInit={}){const token=accessToken();if(!token)throw new Error('Vui lòng đăng nhập BTC.');const r=await fetch(`/api/admin/${path}`,{...init,cache:'no-store',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...init.headers}});const body=await r.json();if(!r.ok){if(r.status===401)clearSession();throw new Error(body.message??'Không thể lưu thay đổi.');}return {body,etag:r.headers.get('etag')??''};}
export async function getAdminTournament():Promise<{document:TournamentDocument;etag:string}>{const r=await adminRequest('tournament');return {document:r.body,etag:r.etag};}
export async function sendCommand(command:TournamentCommand,etag:string):Promise<{document:TournamentDocument;etag:string}>{const r=await adminRequest('commands',{method:'POST',headers:{'If-Match':etag},body:JSON.stringify(command)});return {document:r.body.document,etag:r.etag};}
