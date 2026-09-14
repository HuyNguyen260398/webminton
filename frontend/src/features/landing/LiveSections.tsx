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
        <Section id="van-dong-vien" title="DANH SÁCH VĐV">
          <AthleteTable t={t} />
        </Section>
      )}
      {drawn && (
        <Section id="boc-tham" title="BỐN ĐỘI">
          <TeamPreview t={t} />
        </Section>
      )}
      {drawn && derived.matches.length > 0 && (
        <Section id="lich-thi-dau" title="LỊCH THI ĐẤU">
          <GroupSchedule t={t} derived={derived} />
          <PlacementBracket t={t} derived={derived} />
        </Section>
      )}
      {played && (
        <Section id="bang-xep-hang" title="BẢNG XẾP HẠNG">
          <Standings t={t} derived={derived} />
        </Section>
      )}
      {t.finance.published && (
        <Section id="thu-chi" title="THU CHI">
          <FinanceDashboard t={t} />
        </Section>
      )}
    </>
  );
}
