import { Card, Pill, Section } from "./primitives";

// No poster and no data behind this one: what the two teams and the two
// smash titles take home. Fixed copy, so it is always on the page.
const TEAMS = [
  {
    title: "ĐỘI VÔ ĐỊCH",
    medal: "gold",
    body: (
      <>
        Mỗi thành viên của đội một <b>huy chương vàng</b>. Cả đội cùng đeo về
        khoe.
      </>
    ),
  },
  {
    title: "ĐỘI Á QUÂN",
    medal: "silver",
    body: (
      <>
        Mỗi thành viên của đội một <b>huy chương bạc</b>. Về nhì nhưng không ai
        về tay không.
      </>
    ),
  },
] as const;

const TITLES = [
  {
    title: "MÁY ĐÓNG GẠCH",
    tone: "red",
    body: (
      <>
        Ai có <b>nhiều cú smash ăn điểm nhất</b> giải thì ẵm. Mỗi cú một viên
        gạch, đập cho bên kia chỉ kịp đứng nhìn — ai xây cao nhất thì lên ngôi.
      </>
    ),
  },
  {
    title: "VUA PHÁ LƯỚI",
    tone: "yellow",
    body: (
      <>
        Ai có <b>nhiều cú smash rúc lưới nhất</b> giải thì… cũng ẵm. Đập càng
        hăng, lưới càng khổ — danh hiệu không ai chịu nhận là muốn, nhưng kiểu
        gì cũng có người giành được.
      </>
    ),
  },
] as const;

// A medal on its ribbon, drawn the way the posters draw everything: flat
// colour inside a thick ink line.
function Medal({ tone }: { tone: "gold" | "silver" }) {
  return (
    <svg
      className={`prizes__medal prizes__medal--${tone}`}
      viewBox="0 0 56 76"
      aria-hidden="true"
    >
      <g stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round">
        <path className="prizes__ribbon" d="M6 2h16l12 30H18z" />
        <path className="prizes__ribbon" d="M50 2H34L22 32h16z" />
        <circle className="prizes__disc" cx="28" cy="50" r="22" />
        <circle cx="28" cy="50" r="14.5" fill="none" strokeWidth="2" />
        <path
          className="prizes__star"
          strokeWidth="0"
          d="M28 40.5l2.8 6 6.5.7-4.9 4.4 1.4 6.4-5.8-3.3-5.8 3.3 1.4-6.4-4.9-4.4 6.5-.7z"
        />
      </g>
    </svg>
  );
}

// A wrapped box that does not say what is in it.
function GiftBox() {
  return (
    <svg className="prizes__gift" viewBox="0 0 64 70" aria-hidden="true">
      <g stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round">
        <path className="prizes__ribbon" d="M32 18C24 2 8 4 14 14c3 5 12 5 18 4z" />
        <path className="prizes__ribbon" d="M32 18C40 2 56 4 50 14c-3 5-12 5-18 4z" />
        <rect className="prizes__box" x="8" y="30" width="48" height="36" />
        <rect className="prizes__ribbon" x="3" y="18" width="58" height="13" />
        <rect className="prizes__bow" x="26" y="18" width="12" height="13" />
      </g>
      <text className="prizes__mark" x="32" y="59" textAnchor="middle">
        ?
      </text>
    </svg>
  );
}

export function Prizes() {
  return (
    <Section id="giai-thuong" title="GIẢI THƯỞNG">
      <div className="prizes">
        {TEAMS.map((p) => (
          <Card key={p.title} title={p.title} className="prizes__card">
            <Medal tone={p.medal} />
            <p>{p.body}</p>
          </Card>
        ))}
        {TITLES.map((p) => (
          <Card key={p.title} title={p.title} className="prizes__card">
            <GiftBox />
            <p>{p.body}</p>
            <div className="pill-row">
              <Pill tone={p.tone}>Một giải duy nhất</Pill>
            </div>
            <p className="prizes__secret">
              Phần thưởng đang giấu kỹ — bật mí sau giải.
            </p>
          </Card>
        ))}
      </div>
    </Section>
  );
}
