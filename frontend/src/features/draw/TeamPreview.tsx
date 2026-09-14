import type { TournamentDocument } from "../../../../packages/domain/src/schema";
import { Card } from "../landing/primitives";

export function TeamPreview({ t }: { t: TournamentDocument }) {
  return (
    <div className="team-grid">
      {t.teams.map((team) => {
        const members = t.athletes.filter((a) => a.teamId === team.id);
        return (
          <Card key={team.id}>
            <h4 className="team-grid__name">
              <span
                className="team-grid__swatch"
                style={{ background: team.color }}
                aria-hidden="true"
              />
              {team.name}
            </h4>
            <ul className="team-grid__list">
              {members.map((a) => (
                <li key={a.id}>{a.name}</li>
              ))}
            </ul>
            <p className="muted" style={{ marginBottom: 0 }}>
              {members.length} VĐV
            </p>
          </Card>
        );
      })}
    </div>
  );
}
