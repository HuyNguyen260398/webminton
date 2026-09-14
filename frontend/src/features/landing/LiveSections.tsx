import type { TournamentView } from "../../lib/use-tournament";
import { Section } from "./primitives";
import { AthleteTable } from "../athletes/AthleteTable";
import { TeamPreview } from "../draw/TeamPreview";
import { GroupSchedule } from "../matches/GroupSchedule";
import { Standings } from "../matches/Standings";
import { PlacementBracket } from "../matches/PlacementBracket";
import { FinanceDashboard } from "../finance/FinanceDashboard";

// Every section hides itself when its data is empty, so the shipped file
// renders the posters alone and the page fills in as the tournament runs.
export function LiveSections({ view }: { view: TournamentView }) {
  const { t, derived } = view;
  const drawn = t.draw.status === "confirmed";
  const played = derived.matches.some((m) => m.winnerTeamId !== null);

  return (
    <>
      {t.athletes.length > 0 && (
        <Section id="van-dong-vien">
          <h2>DANH SÁCH VĐV</h2>
          <AthleteTable t={t} />
        </Section>
      )}
      {drawn && (
        <Section id="boc-tham">
          <h2>BỐN ĐỘI</h2>
          <TeamPreview t={t} />
        </Section>
      )}
      {drawn && derived.matches.length > 0 && (
        <Section id="lich-thi-dau">
          <h2>LỊCH THI ĐẤU</h2>
          <GroupSchedule t={t} derived={derived} />
          <PlacementBracket t={t} derived={derived} />
        </Section>
      )}
      {played && (
        <Section id="bang-xep-hang">
          <h2>BẢNG XẾP HẠNG</h2>
          <Standings t={t} derived={derived} />
        </Section>
      )}
      {t.finance.published && (
        <Section id="thu-chi">
          <h2>THU CHI</h2>
          <FinanceDashboard t={t} />
        </Section>
      )}
    </>
  );
}
