const key='webminton.session';
export function accessToken(){if(typeof window==='undefined')return null;try{const s=JSON.parse(sessionStorage.getItem(key)??'null');if(s&&typeof s.accessToken==='string'&&s.expiresAt>Date.now()+5000)return s.accessToken;}catch{}return null;}
export function clearSession(){sessionStorage.removeItem(key);sessionStorage.removeItem('webminton.pkce');}
const base64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export async function beginLogin(){
 const domain=process.env.NEXT_PUBLIC_COGNITO_DOMAIN,clientId=process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;if(!domain||!clientId)throw new Error('Chưa cấu hình đăng nhập. Liên hệ người vận hành.');
 const verifier=base64(crypto.getRandomValues(new Uint8Array(32))),state=base64(crypto.getRandomValues(new Uint8Array(24))),redirectUri=location.origin+'/quan-tri/';
 sessionStorage.setItem('webminton.pkce',JSON.stringify({verifier,state,createdAt:Date.now()}));
 const challenge=base64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
 const url=new URL('/oauth2/authorize',domain);url.search=new URLSearchParams({response_type:'code',client_id:clientId,redirect_uri:redirectUri,scope:'openid tournament/admin',state,code_challenge:challenge,code_challenge_method:'S256'}).toString();location.assign(url);
}
export async function finishLogin(){
 const query=new URLSearchParams(location.search);if(!query.has('code')&&!query.has('error'))return;
 const transaction=JSON.parse(sessionStorage.getItem('webminton.pkce')??'null');sessionStorage.removeItem('webminton.pkce');history.replaceState(null,'','/quan-tri/');
 if(query.has('error')||!transaction||query.get('state')!==transaction.state||Date.now()-transaction.createdAt>600000)throw new Error('Phiên đăng nhập không hợp lệ. Vui lòng thử lại.');
 const domain=process.env.NEXT_PUBLIC_COGNITO_DOMAIN,clientId=process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;if(!domain||!clientId)throw new Error('Chưa cấu hình đăng nhập.');
 const r=await fetch(new URL('/oauth2/token',domain),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:clientId,code:query.get('code')!,redirect_uri:location.origin+'/quan-tri/',code_verifier:transaction.verifier})});
 if(!r.ok)throw new Error('Đăng nhập không thành công.');const t=await r.json();if(typeof t.access_token!=='string'||typeof t.expires_in!=='number')throw new Error('Phiên đăng nhập không hợp lệ.');sessionStorage.setItem(key,JSON.stringify({accessToken:t.access_token,expiresAt:Date.now()+t.expires_in*1000}));
}
export function logout(){clearSession();const domain=process.env.NEXT_PUBLIC_COGNITO_DOMAIN,clientId=process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;if(domain&&clientId){const url=new URL('/logout',domain);url.search=new URLSearchParams({client_id:clientId,logout_uri:location.origin+'/quan-tri/'}).toString();location.assign(url);}}
