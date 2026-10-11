"use client";
import { useEffect, useRef, useState } from "react";
import type { TournamentDocument } from "../../../../packages/domain/src/schema";
import { SELF_DRAW_TEAM_IDS } from "../../../../packages/domain/src/team-draw";
import { Card, Section } from "../landing/primitives";
import { TeamPreview } from "./TeamPreview";

type Phase =
  | { step: "pick" }
  | { step: "rolling" }
  | { step: "done"; name: string; teamId: string }
  | { step: "failed"; message: string };

// Long enough to read which team came up, short enough not to sit waiting.
const HOME_AFTER_SECONDS = 6;

// The roll itself happens in the Lambda, which is the only place that knows
// each athlete's trình độ. This page sends a name and is told a team.
async function roll(athleteId: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch("/api/team-draw", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ athleteId }),
      cache: "no-store",
    });
  } catch {
    throw new Error("Mất kết nối — kiểm tra mạng rồi bốc lại.");
  }
  const data = (await res.json().catch(() => null)) as {
    teamId?: string;
    message?: string;
  } | null;
  if (!res.ok || !data?.teamId)
    throw new Error(data?.message ?? "Ống thăm bị kẹt. Thử lại sau ít phút.");
  return data.teamId;
}

export function TeamDrawPortal({
  t,
  onDrawn,
}: {
  t: TournamentDocument;
  onDrawn: () => void;
}) {
  const [athleteId, setAthleteId] = useState("");
  const [phase, setPhase] = useState<Phase>({ step: "pick" });
  const dialog = useRef<HTMLDialogElement>(null);

  const open = t.draw.status === "open";
  const active = t.athletes.filter((a) => a.active);
  const waiting = active.filter((a) => a.teamId === null);
  const chosen = waiting.find((a) => a.id === athleteId);
  const drawn = active.length - waiting.length;

  // Someone else may have rolled for this name while the page sat open.
  useEffect(() => {
    if (athleteId && !chosen && phase.step === "pick") setAthleteId("");
  }, [athleteId, chosen, phase.step]);

  // After a successful roll the page shows the team, counts down, and goes
  // back to the landing page, where the two rosters are.
  const [secondsLeft, setSecondsLeft] = useState(HOME_AFTER_SECONDS);
  const done = phase.step === "done";
  useEffect(() => {
    if (!done) return;
    setSecondsLeft(HOME_AFTER_SECONDS);
    const id = setInterval(() => setSecondsLeft((n) => n - 1), 1000);
    return () => clearInterval(id);
  }, [done]);
  useEffect(() => {
    if (done && secondsLeft <= 0) location.assign("/");
  }, [done, secondsLeft]);

  async function confirm() {
    dialog.current?.close();
    if (!chosen) return;
    setPhase({ step: "rolling" });
    try {
      const teamId = await roll(chosen.id);
      setPhase({ step: "done", name: chosen.name, teamId });
    } catch (e) {
      setPhase({
        step: "failed",
        message: e instanceof Error ? e.message : "Thử lại sau ít phút.",
      });
    }
    setAthleteId("");
    onDrawn();
  }

  const team =
    phase.step === "done" ? t.teams.find((x) => x.id === phase.teamId) : null;

  return (
    <Section id="boc-tham-chia-doi" title="BỐC THĂM CHIA ĐỘI">
      <p className="team-draw__intro">
        Hai đội, mười bốn người, một ống thăm. Chọn đúng tên mình, bấm một
        phát, đội nào ra thì về đội đó — không xin đổi, không bốc lại, không
        hối lộ BTC.
      </p>

      {phase.step === "done" && team && (
        <div
          className="team-draw__result"
          style={{ background: team.color }}
          role="status"
        >
          <span>{phase.name} về</span>
          <strong>{team.name.toLocaleUpperCase("vi-VN")}</strong>
          <span>Chúc mừng, hoặc chia buồn — tuỳ đồng đội là ai.</span>
          <span className="team-draw__countdown">
            Tự về trang giải sau {Math.max(secondsLeft, 0)} giây…{" "}
            <a href="/">Về ngay</a>
          </span>
        </div>
      )}
      {phase.step === "failed" && (
        <p role="alert" className="error">
          {phase.message}
        </p>
      )}

      {!open ? (
        <Card title={drawn > 0 ? "ĐÃ ĐÓNG ỐNG THĂM" : "CHƯA MỞ ỐNG THĂM"}>
          <p>
            {drawn > 0
              ? "BTC đã đóng bốc thăm. Đội hình xem ngay bên dưới."
              : "BTC chưa mở bốc thăm. Khi nào mở sẽ hú trong nhóm — đừng bấm F5 mỏi tay."}
          </p>
        </Card>
      ) : waiting.length === 0 ? (
        <Card title="AI CŨNG CÓ ĐỘI RỒI">
          <p>Cả hội đã bốc xong. Giờ thì lo mà tập giao cầu đi.</p>
        </Card>
      ) : (
        <Card title="BẠN LÀ AI?" className="team-draw__form">
          <label className="team-draw__field">
            <span>Chọn tên của bạn</span>
            <select
              value={athleteId}
              disabled={phase.step === "rolling"}
              onChange={(e) => {
                setAthleteId(e.target.value);
                setPhase({ step: "pick" });
              }}
            >
              <option value="">— chọn tên —</option>
              {waiting.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="team-draw__cta"
            disabled={!chosen || phase.step === "rolling"}
            onClick={() => dialog.current?.showModal()}
          >
            {phase.step === "rolling" ? "ĐANG LẮC ỐNG THĂM…" : "BỐC THĂM"}
          </button>
          <p className="team-draw__note">
            Còn {waiting.length} người chưa bốc. Tên ai bốc rồi sẽ biến khỏi
            danh sách.
          </p>
        </Card>
      )}

      <dialog
        ref={dialog}
        className="team-draw__dialog"
        aria-labelledby="team-draw-confirm"
      >
        <h3 id="team-draw-confirm">KHOAN ĐÃ!</h3>
        <p>
          Bạn chắc chắn mình là <b>{chosen?.name}</b> chứ?
        </p>
        <p>
          Bốc rồi là xong, không bốc lại được. Bốc hộ người khác là mang tội
          với cả hội.
        </p>
        <div className="team-draw__dialog-actions">
          <button type="button" className="team-draw__cta" onClick={confirm}>
            ĐÚNG LÀ TÔI — BỐC!
          </button>
          <button
            type="button"
            className="team-draw__back"
            // The safe choice takes the focus, so a stray Enter rolls nothing.
            autoFocus
            onClick={() => dialog.current?.close()}
          >
            Chọn lại tên
          </button>
        </div>
      </dialog>

      {drawn > 0 && (
        <div className="team-draw__teams">
          <TeamPreview t={t} teamIds={SELF_DRAW_TEAM_IDS} />
        </div>
      )}

      <p className="team-draw__home">
        <a href="/">← Về trang giải</a>
      </p>
    </Section>
  );
}
