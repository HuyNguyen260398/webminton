"use client";
import { useEffect, useState } from "react";
import type { TournamentDocument } from "../../../../packages/domain/src/schema";
import {
  forgetCode,
  readCode,
  storeCode,
  type RefereeError,
} from "../../lib/referee-api";
import { Card } from "../landing/primitives";
import { CodeGate } from "./CodeGate";
import { MatchList } from "./MatchList";
import { MatchScorer } from "./MatchScorer";

// Which screen: closed, the code, the list, or one match.
export function RefereePortal({
  t,
  reload,
}: {
  t: TournamentDocument;
  reload: () => void;
}) {
  // Storage is read after mount: the page is prerendered without it.
  const [ready, setReady] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    setCode(readCode());
    setReady(true);
  }, []);

  const matches = t.duel?.matches ?? [];
  if (!t.referee?.open || matches.length === 0)
    return (
      <div className="ref-wrap" data-testid="referee-closed">
        <Card title="Trọng tài">
          <p>BTC chưa mở chấm điểm. Khi BTC mở, trang này sẽ tự hiện.</p>
        </Card>
      </div>
    );
  if (!ready) return null;
  if (!code)
    return (
      <CodeGate
        notice={notice}
        onAccepted={(accepted) => {
          storeCode(accepted);
          setNotice(null);
          setCode(accepted);
        }}
      />
    );

  const refused = (e: RefereeError) => {
    // The organiser changed the code: this phone is no longer trusted.
    if (e.code === "REFEREE_CODE") {
      forgetCode();
      setNotice(e.message);
      setSelected(null);
      setCode(null);
    }
    reload();
  };
  const current = matches.find((m) => m.id === selected);
  return current ? (
    <MatchScorer
      key={current.id}
      t={t}
      code={code}
      match={current}
      onBack={() => {
        setSelected(null);
        reload();
      }}
      onRefused={refused}
    />
  ) : (
    <MatchList t={t} onPick={setSelected} />
  );
}
