import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { SiteNav } from "../src/features/landing/SiteNav";
import { parseTournament } from "../src/lib/use-tournament";
import { createDuelMatches } from "../../packages/domain/src/duel";
import { makeTournament } from "../../packages/domain/src/testing/fixtures";
import type { TournamentDocument } from "../../packages/domain/src/schema";

const FORM = "https://forms.office.com/r/abc";
const links = (t: TournamentDocument) =>
  [...render(<SiteNav view={parseTournament(t)} />).container.querySelectorAll("a")].map(
    (a) => [a.textContent, a.getAttribute("href")],
  );

describe("SiteNav", () => {
  it("links only what is on the page: with no data, the three posters", () => {
    expect(links(makeTournament())).toEqual([
      ["TRANG CHỦ", "#thong-bao"],
      ["THỂ LỆ THI ĐẤU", "#the-le"],
      ["NHÀ TÀI TRỢ", "#nha-tai-tro"],
    ]);
  });

  const underWay = () => {
    const t = makeTournament();
    t.info.registrationFormUrl = FORM;
    t.draw.status = "open";
    for (const [id, teamId] of [
      ["r1", "red"],
      ["r2", "red"],
      ["b1", "blue"],
      ["b2", "blue"],
    ] as const)
      t.athletes.push({ id, name: id, gender: "male", teamId, active: true });
    const matches = createDuelMatches();
    Object.assign(matches[0], {
      pairRed: ["r1", "r2"],
      pairBlue: ["b1", "b2"],
      status: "live",
      smashes: { r1: { hit: 1, net: 0 } },
    });
    t.duel = { matches };
    return t;
  };

  it("puts BẢNG ĐẤU and SMASH OF THE DAY first once the organiser starts the giải", () => {
    const t = underWay();
    t.info.started = true;
    expect(links(t).map(([label]) => label)).toEqual([
      "BẢNG ĐẤU",
      "SMASH OF THE DAY",
      "TRANG CHỦ",
      "THỂ LỆ THI ĐẤU",
      "NHÀ TÀI TRỢ",
      "DANH SÁCH VĐV",
      "HAI ĐỘI",
      "ĐĂNG KÝ THI ĐẤU",
      "BỐC THĂM CHIA ĐỘI",
    ]);
  });

  it("keeps the usual order when started is set but there is no bảng đấu", () => {
    const t = makeTournament();
    t.info.started = true;
    expect(links(t).map(([label]) => label)).toEqual([
      "TRANG CHỦ",
      "THỂ LỆ THI ĐẤU",
      "NHÀ TÀI TRỢ",
    ]);
  });

  it("lists every section, in order, once the giải is under way", () => {
    const t = underWay();
    expect(links(t)).toEqual([
      ["TRANG CHỦ", "#thong-bao"],
      ["THỂ LỆ THI ĐẤU", "#the-le"],
      ["NHÀ TÀI TRỢ", "#nha-tai-tro"],
      ["DANH SÁCH VĐV", "#van-dong-vien"],
      ["HAI ĐỘI", "#hai-doi"],
      ["BẢNG ĐẤU", "#bang-dau"],
      ["SMASH OF THE DAY", "#vua-smash"],
      ["ĐĂNG KÝ THI ĐẤU", "#dang-ky"],
      ["BỐC THĂM CHIA ĐỘI", "/boc-tham/"],
    ]);
  });

  it("drops ĐĂNG KÝ THI ĐẤU when the organiser closes registration", () => {
    const t = makeTournament();
    t.info.registrationFormUrl = FORM;
    t.info.registrationOpen = false;
    expect(links(t).map(([label]) => label)).not.toContain("ĐĂNG KÝ THI ĐẤU");
  });
});
