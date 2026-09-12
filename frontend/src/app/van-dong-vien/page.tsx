'use client';
import {useTournament} from '../../lib/use-tournament';
import {AthleteTable} from '../../features/athletes/AthleteTable';
export default function Page(){const {data,error,refresh}=useTournament();return <main id="main" className="container page"><div className="page-heading"><span className="kicker">Những người cùng lên sân</span><h1>Vận động viên</h1><p>Danh sách đăng ký do ban tổ chức cập nhật.</p></div>{error&&<p role="alert" className="error">{error}<button onClick={()=>void refresh()}>Thử lại</button></p>}{data?<AthleteTable t={data}/>:!error&&<p role="status">Đang tải danh sách…</p>}</main>}
