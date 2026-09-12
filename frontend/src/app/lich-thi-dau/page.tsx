'use client';
import { useState } from 'react';
import { useTournament } from '../../lib/use-tournament';
import { useAdmin } from '../../lib/use-admin';
import { GroupSchedule } from '../../features/matches/GroupSchedule';
import { Standings } from '../../features/matches/Standings';
import { PlacementBracket } from '../../features/matches/PlacementBracket';
import { MatchEditor } from '../../features/matches/MatchEditor';
import { CourtSchedule } from '../../features/matches/CourtSchedule';

export default function Page() {
  const [tab, setTab] = useState<'schedule'|'standings'|'bracket'>('schedule');
  const publicData = useTournament(); const admin = useAdmin(); const data = publicData.data;
  const view = data && (tab === 'schedule' ? <GroupSchedule tournament={data} /> : tab === 'standings' ? <Standings tournament={data} /> : <PlacementBracket tournament={data} />);
  return <main id="main" className="container page"><div className="page-heading"><span className="kicker">18 trận vòng bảng · 6 trận tranh hạng</span><h1>Lịch thi đấu</h1><p>Tỷ số hợp lệ: 21–0 đến 21–19, deuce đến 25–23.</p></div><div className="tabs" role="tablist" aria-label="Nội dung lịch thi đấu">{([['schedule','Lịch vòng bảng'],['standings','Bảng xếp hạng'],['bracket','Sơ đồ tranh hạng']] as const).map(([id,label]) => <button key={id} type="button" role="tab" aria-selected={tab===id} className={tab===id ? '' : 'secondary'} onClick={()=>setTab(id)}>{label}</button>)}</div>{publicData.error ? <p role="alert" className="error">{publicData.error}</p> : view ?? <p role="status">Đang tải lịch thi đấu…</p>}{admin.signedIn && admin.data && <><CourtSchedule tournament={admin.data} /><MatchEditor tournament={admin.data} run={admin.run} busy={admin.busy} /></>}{admin.error && <p role="alert" className="error">{admin.error}</p>}</main>;
}
