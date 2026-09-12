'use client';
import {useAdmin} from '../../lib/use-admin';
import {AdminLogin} from '../../features/admin/AdminSession';
import {SettingsForm} from '../../features/admin/SettingsForm';
import {VersionHistory} from '../../features/admin/VersionHistory';
export default function Page(){const a=useAdmin();return <main id="main" className="container page"><div className="page-heading"><span className="kicker">Ban tổ chức CN1416</span><h1>Quản trị giải đấu</h1></div>{a.error&&<div role="alert" className="error">{a.error} <button className="secondary" onClick={()=>void a.refresh()}>Tải lại dữ liệu</button></div>}{a.notice&&<p role="status" className="notice">{a.notice}</p>}{a.signedIn?<><div className="toolbar"><button className="secondary" onClick={a.logout}>Đăng xuất</button><button className="secondary" onClick={()=>void a.refresh()}>Tải lại dữ liệu</button></div>{a.data&&<><SettingsForm t={a.data} run={a.run} busy={a.busy}/><VersionHistory etag={a.etag} refresh={a.refresh}/></>}</>:<AdminLogin/>}</main>}
