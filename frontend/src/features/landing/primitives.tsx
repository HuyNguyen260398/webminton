import type { CSSProperties, ReactNode } from "react";

const rot = (deg: number) => ({ "--rot": `${deg}deg` }) as CSSProperties;

export function Section({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="section">
      <div className="container">{children}</div>
    </section>
  );
}

export function Slab({
  tone,
  rotate = 0,
  className,
  children,
}: {
  tone: "red" | "black" | "yellow";
  rotate?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`slab slab--${tone} rot${className ? ` ${className}` : ""}`}
      style={rot(rotate)}
    >
      {children}
    </span>
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
      <img src={src} alt={alt} width={1200} height={900} loading="lazy" />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
