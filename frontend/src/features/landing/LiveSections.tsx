import type { TournamentView } from "../../lib/use-tournament";
import {
  DuelMatchList,
  DuelScoreboard,
  SmashLeaders,
} from "../duel/DuelBoard";
import { SELF_DRAW_TEAM_IDS } from "../../../../packages/domain/src/team-draw";
import { Section } from "./primitives";
import { pageSections } from "./sections";
import { AthleteTable } from "../athletes/AthleteTable";
import { TeamPreview } from "../draw/TeamPreview";
import { GroupSchedule } from "../matches/GroupSchedule";
import { Standings } from "../matches/Standings";
import { PlacementBracket } from "../matches/PlacementBracket";
import { FinanceDashboard } from "../finance/FinanceDashboard";

// BẢNG ĐẤU and SMASH OF THE DAY. They sit among the live sections until the
// organiser starts the giải, and at the top of the page from then on: each
// of the two places asks for them and only the right one gets them.
export function DuelSections({
  view,
  top,
}: {
  view: TournamentView;
  top: boolean;
}) {
  const on = pageSections(view);
  const { duel } = on;
  if (!duel || on.started !== top) return null;
  return (
    <>
      <Section id="bang-dau" title="BẢNG ĐẤU">
        <DuelScoreboard t={view.t} results={duel} />
        <DuelMatchList t={view.t} />
      </Section>
      {on.smash && (
        <Section id="vua-smash" title="SMASH OF THE DAY">
          <SmashLeaders t={view.t} results={duel} />
        </Section>
      )}
    </>
  );
}

// Every section hides itself when its data is empty, so the shipped file
// renders the posters alone and the page fills in as the tournament runs.
export function LiveSections({ view }: { view: TournamentView }) {
  const { t, derived } = view;
  const on = pageSections(view);

  return (
    <>
      {on.athletes && (
        <Section id="van-dong-vien" title="DANH SÁCH VĐV">
          <AthleteTable t={t} />
        </Section>
      )}
      {on.fourTeams && (
        <Section id="boc-tham" title="BỐN ĐỘI">
          <TeamPreview t={t} />
        </Section>
      )}
      {on.twoTeams && (
        <Section id="hai-doi" title="HAI ĐỘI">
          <TeamPreview t={t} teamIds={SELF_DRAW_TEAM_IDS} />
        </Section>
      )}
      <DuelSections view={view} top={false} />
      {on.schedule && (
        <Section id="lich-thi-dau" title="LỊCH THI ĐẤU">
          <GroupSchedule t={t} derived={derived} />
          <PlacementBracket t={t} derived={derived} />
        </Section>
      )}
      {on.standings && (
        <Section id="bang-xep-hang" title="BẢNG XẾP HẠNG">
          <Standings t={t} derived={derived} />
        </Section>
      )}
      {on.finance && (
        <Section id="thu-chi" title="THU CHI">
          <FinanceDashboard t={t} />
        </Section>
      )}
    </>
  );
}
