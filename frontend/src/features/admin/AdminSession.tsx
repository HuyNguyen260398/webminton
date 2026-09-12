'use client';
import {beginLogin} from '../../lib/auth';
import {useState} from 'react';
export function AdminLogin(){const [error,setError]=useState('');return <div className="card" style={{maxWidth:560}}><span className="kicker">Dành cho ban tổ chức</span><h2>ĐIỀU HÀNH GIẢI ĐẤU</h2><p>Đăng nhập để bốc thăm, cập nhật lịch và kết quả, quản lý thu chi.</p><button onClick={()=>void beginLogin().catch(e=>setError(e.message))}>Đăng nhập BTC</button>{error&&<p className="error" role="alert">{error}</p>}<p className="muted">Tài khoản do người vận hành cấp. Không có đăng ký tài khoản công khai.</p></div>}
