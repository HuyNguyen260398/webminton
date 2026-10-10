import type { ReactNode } from "react";
import type { ReadyAdmin } from "../../lib/use-admin";

export interface AdminTab {
  id: string;
  label: string;
  render: (admin: ReadyAdmin) => ReactNode;
}

// Order here is the order on screen. The first entry is the default tab.
export const TABS: AdminTab[] = [];
