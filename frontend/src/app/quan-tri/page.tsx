"use client";
import { useEffect, useState } from "react";
import { useAdmin, type ReadyAdmin } from "../../lib/use-admin";
import { formatDate } from "../../lib/format";
import { Card, Pill, Slab } from "../../features/landing/primitives";
import { TABS } from "../../features/admin/tabs";

export default function AdminPage() {
  const admin = useAdmin();
  const [tab, setTab] = useState(TABS[0]?.id ?? "");

  // The hash keeps the tab across the Google redirect and a reload.
  useEffect(() => {
    const fromHash = () => {
      const id = location.hash.slice(1);
      if (TABS.some((t) => t.id === id)) setTab(id);
    };
    fromHash();
    addEventListener("hashchange", fromHash);
    return () => removeEventListener("hashchange", fromHash);
  }, []);

  const { phase, notice, view } = admin;
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <main id="main" className="admin container">
      <h1 className="admin-title">
        <Slab tone="red" rotate={-1.5} className="section-title">
          QUẢN TRỊ GIẢI
        </Slab>
      </h1>

      {notice && (
        <p role="status" className={`notice notice--${notice.tone}`}>
          {notice.text}
        </p>
      )}

      {phase === "loading" && <p role="status">Đang tải…</p>}

      {phase === "signed-out" && (
        <Card title="Đăng nhập">
          <p>Chỉ ban tổ chức mới vào được trang này.</p>
          <div className="row-actions">
            <button type="button" onClick={admin.signIn} disabled={!admin.config}>
              {admin.config?.devLogin ? "Đăng nhập thử" : "Đăng nhập bằng Google"}
            </button>
          </div>
        </Card>
      )}

      {phase === "forbidden" && (
        <Card title="Không có quyền">
          <p role="alert">Tài khoản này không có quyền quản trị.</p>
          <div className="row-actions">
            <button type="button" onClick={admin.signOut}>
              Đăng xuất và đổi tài khoản
            </button>
          </div>
        </Card>
      )}

      {phase === "error" && (
        <div className="row-actions">
          <button type="button" onClick={() => location.reload()}>
            Thử lại
          </button>
        </div>
      )}

      {phase === "ready" && view && (
        <>
          <div className="admin-bar">
            {view.publishedVersion < view.version ? (
              <>
                <Pill tone="red">Chưa công bố</Pill>
                <button
                  type="button"
                  onClick={admin.republish}
                  disabled={admin.busy}
                >
                  Công bố lại
                </button>
              </>
            ) : (
              <Pill tone="green">Đã công bố</Pill>
            )}
            <small>
              Phiên bản {view.version} · cập nhật{" "}
              {formatDate(view.document.updatedAt)}
            </small>
            <span className="spacer" />
            <small>{admin.email}</small>
            <a className="button button--ghost" href="/">
              Xem trang giải
            </a>
            <button
              type="button"
              className="button--ghost"
              onClick={admin.signOut}
            >
              Đăng xuất
            </button>
          </div>

          {TABS.length > 0 && (
            <nav className="admin-tabs" aria-label="Mục quản trị">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-current={t.id === active?.id ? "page" : undefined}
                  onClick={() => {
                    history.replaceState(null, "", `#${t.id}`);
                    setTab(t.id);
                  }}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          )}

          {active ? (
            <section aria-label={active.label}>
              {active.render(admin as ReadyAdmin)}
            </section>
          ) : (
            <Card title="Tổng quan">
              <p>
                {view.document.athletes.length} VĐV ·{" "}
                {view.document.matches.length} trận
              </p>
            </Card>
          )}
        </>
      )}
    </main>
  );
}
