import type { ReactNode } from "react";
import type { ReadyAdmin } from "../../lib/use-admin";
import { MatchesTab } from "./MatchesTab";

export interface AdminTab {
  id: string;
  label: string;
  render: (admin: ReadyAdmin) => ReactNode;
}

// Order here is the order on screen. The first entry is the default tab.
export const TABS: AdminTab[] = [
  { id: "tran-dau", label: "Trận", render: (a) => <MatchesTab admin={a} /> },
];
