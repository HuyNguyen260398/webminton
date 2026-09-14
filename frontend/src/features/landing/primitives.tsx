import type { CSSProperties, ReactNode } from "react";

const rot = (deg: number) => ({ "--rot": `${deg}deg` }) as CSSProperties;

// One line in a red slab, as on the posters' THỂ LỆ THI ĐẤU and NHÀ TÀI TRỢ.
export function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="section">
      <div className="container">
        <Slab as="h2" tone="red" rotate={-1.5} className="section-title">
          {title}
        </Slab>
        {children}
      </div>
    </section>
  );
}

export function Slab({
  as: Tag = "span",
  tone,
  rotate = 0,
  className,
  children,
}: {
  as?: "span" | "h2";
  tone: "red" | "black" | "yellow";
  rotate?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      className={`slab slab--${tone} rot${className ? ` ${className}` : ""}`}
      style={rot(rotate)}
    >
      {children}
    </Tag>
  );
}

export function Card({
  title,
  dashed = false,
  className,
  children,
}: {
  title?: string;
  dashed?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`card${dashed ? " card--dashed" : ""}${className ? ` ${className}` : ""}`}
    >
      {title && <h3>{title}</h3>}
      {children}
    </div>
  );
}

export function Pill({
  tone,
  children,
}: {
  tone: "red" | "green" | "yellow" | "outline";
  children: ReactNode;
}) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}

export function NumberDisc({
  n,
  tone,
}: {
  n: number;
  tone: "black" | "red" | "green";
}) {
  return (
    <span className={`disc disc--${tone}`} aria-hidden="true">
      {n}
    </span>
  );
}

export function PhotoFrame({
  src,
  alt,
  caption,
  rotate,
}: {
  src: string;
  alt: string;
  caption: string;
  rotate: number;
}) {
  return (
    <figure className="photo-frame rot" style={rot(rotate)}>
      <img src={src} alt={alt} width={1200} height={1000} loading="lazy" />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
