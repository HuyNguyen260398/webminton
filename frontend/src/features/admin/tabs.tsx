import type { ReactNode } from "react";
import type { ReadyAdmin } from "../../lib/use-admin";
import { MatchesTab } from "./MatchesTab";
import { DuelTab } from "./DuelTab";
import { TeamsTab } from "./TeamsTab";
import { AthletesTab } from "./AthletesTab";
import { FinanceTab } from "./FinanceTab";
import { InfoTab } from "./InfoTab";
import { HistoryTab } from "./HistoryTab";

export interface AdminTab {
  id: string;
  label: string;
  render: (admin: ReadyAdmin) => ReactNode;
}

// Order here is the order on screen. The first entry is the default tab.
export const TABS: AdminTab[] = [
  {
    id: "tran-dau",
    label: "Trận",
    // A confirmed four-team draw owns the old schedule; otherwise this is
    // the two-team bảng đấu.
    render: (a) =>
      a.view.document.draw.status === "confirmed" ? (
        <MatchesTab admin={a} />
      ) : (
        <DuelTab admin={a} />
      ),
  },
  { id: "doi", label: "Đội", render: (a) => <TeamsTab admin={a} /> },
  { id: "vdv", label: "VĐV", render: (a) => <AthletesTab admin={a} /> },
  { id: "thu-chi", label: "Thu chi", render: (a) => <FinanceTab admin={a} /> },
  { id: "giai", label: "Giải", render: (a) => <InfoTab admin={a} /> },
  { id: "lich-su", label: "Lịch sử", render: (a) => <HistoryTab admin={a} /> },
];
