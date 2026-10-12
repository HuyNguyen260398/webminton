import type { TournamentView } from "../../lib/use-tournament";
import { pageSections } from "./sections";

// The page is long and fills in as the giải runs. This bar stays at the top
// and lists only the sections that are on the page right now.
export function SiteNav({ view }: { view: TournamentView }) {
  const on = pageSections(view);
  const items: Array<[label: string, href: string, shown: boolean]> = [
    ["TRANG CHỦ", "#thong-bao", true],
    ["THỂ LỆ THI ĐẤU", "#the-le", true],
    ["NHÀ TÀI TRỢ", "#nha-tai-tro", true],
    ["DANH SÁCH VĐV", "#van-dong-vien", on.athletes],
    ["HAI ĐỘI", "#hai-doi", on.twoTeams],
    ["BẢNG ĐẤU", "#bang-dau", on.duel !== null],
    ["VUA SMASH", "#vua-smash", on.smash],
    ["ĐĂNG KÝ THI ĐẤU", "#dang-ky", on.registration],
    // Straight to the draw itself, which is a page of its own.
    ["BỐC THĂM CHIA ĐỘI", "/boc-tham/", on.teamDraw],
  ];
  return (
    <nav className="site-nav" aria-label="Các mục trên trang">
      <ul>
        {items
          .filter(([, , shown]) => shown)
          .map(([label, href]) => (
            <li key={href}>
              <a href={href}>{label}</a>
            </li>
          ))}
      </ul>
    </nav>
  );
}
