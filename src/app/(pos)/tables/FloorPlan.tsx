"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { formatMoney } from "@/lib/money";
import type { DiningTable, TableStatus } from "@/lib/types";
import { saveLayout, setTableStatus, type LayoutTable } from "./actions";

export type TableOrder = {
  id: string;
  tableId: string;
  number: string;
  status: string;
  guests: number | null;
  total: number;
  createdAt: string;
  items: { item_name: string; quantity: number; status: string }[];
};

type Look = { label: string; bg: string; fg: string; border: string; dashed?: boolean };
const LOOKS: Record<string, Look> = {
  available: { label: "Available", bg: "#ffffff", fg: "#1b1a17", border: "#cfc7b7" },
  seated: { label: "Seated", bg: "#dce7f5", fg: "#173e6d", border: "#8fb0d8" },
  ordered: { label: "Ordered", bg: "#f8e6bf", fg: "#5e3d00", border: "#d9b35c" },
  ready: { label: "Food ready", bg: "#e6f0ea", fg: "#1f4e38", border: "#6fbf95" },
  served: { label: "Served", bg: "#9e2f18", fg: "#ffffff", border: "#9e2f18" },
  reserved: { label: "Reserved", bg: "#efeae0", fg: "#1b1a17", border: "#8e887c", dashed: true },
  cleaning: { label: "Needs cleaning", bg: "#f4f1ea", fg: "#5c574e", border: "#b9b1a1", dashed: true },
};
const LEGEND = ["available", "seated", "ordered", "ready", "served", "reserved", "cleaning"];

const FLOOR_W = 960;
const FLOOR_H = 720;
const GRID = 8;
const MIN = 56;

type EditTable = LayoutTable & { key: string };

function deriveStatus(t: DiningTable, o: TableOrder | undefined): string {
  if (o) {
    if (o.items.length === 0) return "seated";
    if (o.status === "ready") return "ready";
    if (o.status === "served") return "served";
    return "ordered";
  }
  if (t.status === "reserved") return "reserved";
  if (t.status === "cleaning") return "cleaning";
  return "available";
}

export function FloorPlan({
  tables,
  orders,
  currency,
  canEdit,
}: {
  tables: DiningTable[];
  orders: TableOrder[];
  currency: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const zonesFromData = useMemo(() => {
    const z = [...new Set(tables.map((t) => t.zone || "Main hall"))];
    return z.length ? z : ["Main hall"];
  }, [tables]);
  const [zone, setZone] = useState(zonesFromData[0]);
  const [sel, setSel] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [layout, setLayout] = useState<EditTable[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [extraZones, setExtraZones] = useState<string[]>([]);
  const [newZone, setNewZone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const drag = useRef<{ key: string; mode: "move" | "resize"; sx: number; sy: number; o: { x: number; y: number; w: number; h: number } } | null>(null);

  const orderByTable = useMemo(() => {
    const m = new Map<string, TableOrder>();
    for (const o of orders) if (!m.has(o.tableId)) m.set(o.tableId, o);
    return m;
  }, [orders]);

  // Keep the floor fresh while viewing (other tablets change orders too)
  useEffect(() => {
    if (edit) return;
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 8000);
    const tick = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [edit, router]);

  const zones = edit ? [...new Set([...zonesFromData, ...extraZones, ...layout.map((l) => l.zone)])] : zonesFromData;
  const curZone = zones.includes(zone) ? zone : zones[0];

  // ---------- Edit mode helpers ----------
  const startEdit = () => {
    setLayout(
      tables.map((t) => ({
        key: t.id,
        id: t.id,
        name: t.name,
        zone: t.zone || "Main hall",
        seats: t.seats,
        shape: t.shape,
        pos_x: t.pos_x ?? 0,
        pos_y: t.pos_y ?? 0,
        width: t.width,
        height: t.height,
      }))
    );
    setDeleted([]);
    setExtraZones([]);
    setSel(null);
    setError(null);
    setEdit(true);
  };

  const snap = (v: number) => Math.round(v / GRID) * GRID;
  const fit = (t: EditTable): EditTable => {
    const width = Math.max(MIN, Math.min(FLOOR_W, t.width));
    const height = t.shape === "round" ? width : Math.max(MIN, Math.min(FLOOR_H, t.height));
    return {
      ...t,
      width,
      height: Math.min(height, FLOOR_H),
      pos_x: Math.max(0, Math.min(FLOOR_W - width, t.pos_x)),
      pos_y: Math.max(0, Math.min(FLOOR_H - Math.min(height, FLOOR_H), t.pos_y)),
    };
  };
  const update = (key: string, patch: Partial<EditTable>) => setLayout((prev) => prev.map((t) => (t.key === key ? fit({ ...t, ...patch }) : t)));

  const nextName = () => {
    const nums = layout.map((t) => parseInt(t.name, 10)).filter((n) => !isNaN(n));
    return String((nums.length ? Math.max(...nums) : 0) + 1);
  };
  const addTable = (round: boolean) => {
    const key = `new-${Date.now()}`;
    const t = fit(
      round
        ? { key, id: null, name: nextName(), zone: curZone, seats: 2, shape: "round", pos_x: 24, pos_y: 24, width: 104, height: 104 }
        : { key, id: null, name: nextName(), zone: curZone, seats: 4, shape: "rect", pos_x: 24, pos_y: 24, width: 192, height: 96 }
    );
    setLayout((prev) => [...prev, t]);
    setSel(key);
  };

  const grab = (t: EditTable, mode: "move" | "resize") => (e: React.PointerEvent) => {
    if (!edit || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    drag.current = { key: t.key, mode, sx: e.clientX, sy: e.clientY, o: { x: t.pos_x, y: t.pos_y, w: t.width, h: t.height } };
    setSel(t.key);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (d.mode === "move") update(d.key, { pos_x: snap(d.o.x + dx), pos_y: snap(d.o.y + dy) });
    else update(d.key, { width: snap(d.o.w + dx), height: snap(d.o.h + dy) });
  };
  const onUp = () => {
    drag.current = null;
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = await saveLayout({
        tables: layout.map(({ key: _k, ...rest }) => rest),
        deletedIds: deleted,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEdit(false);
      setSel(null);
      router.refresh();
    });
  };

  const setStatus = (id: string, status: TableStatus) =>
    startTransition(async () => {
      const res = await setTableStatus(id, status);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });

  // ---------- Render data ----------
  const zoneTables = edit ? layout.filter((t) => t.zone === curZone) : tables.filter((t) => (t.zone || "Main hall") === curZone);
  const counts: Record<string, number> = {};
  tables.forEach((t) => {
    const s = deriveStatus(t, orderByTable.get(t.id));
    counts[s] = (counts[s] ?? 0) + 1;
  });
  const occupied = orders.length;
  const totalSeats = (edit ? layout : tables).reduce((s, t) => s + t.seats, 0);

  const selTable = !edit && sel ? tables.find((t) => t.id === sel) ?? null : null;
  const selOrder = selTable ? orderByTable.get(selTable.id) : undefined;
  const selStatus = selTable ? deriveStatus(selTable, selOrder) : "available";
  const selEdit = edit && sel ? layout.find((t) => t.key === sel) ?? null : null;
  const money = (n: number) => formatMoney(n, currency);
  const mins = (iso: string) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));

  return (
    <div className="flex flex-col lg:flex-row lg:h-screen">
      <main className="grow min-w-0 px-6 pt-5 pb-6 flex flex-col gap-4 lg:overflow-hidden">
        <header className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col gap-0.5">
            <h1 className="font-display text-[28px] font-bold tracking-tight">{edit ? "Edit floor plan" : "Floor plan"}</h1>
            <div className="text-sm text-muted">
              {edit
                ? `${layout.length} tables · ${totalSeats} seats`
                : `${tables.length} tables · ${counts.available ?? 0} available · ${occupied} occupied`}
            </div>
          </div>
          <div className="grow" />
          <div role="tablist" aria-label="Area" className="flex flex-wrap p-1 bg-ground-2 rounded-xl gap-1">
            {zones.map((z) => (
              <button
                key={z}
                type="button"
                role="tab"
                aria-selected={z === curZone}
                onClick={() => {
                  setZone(z);
                  setSel(null);
                }}
                className={`h-10 px-4 rounded-[9px] text-sm font-semibold ${z === curZone ? "bg-white text-ink shadow-sm" : "text-muted-2"}`}
              >
                {z}
              </button>
            ))}
          </div>
          {!edit && canEdit && (
            <button type="button" onClick={startEdit} className="h-12 px-4 rounded-xl border border-ink bg-white text-[15px] font-bold flex items-center gap-2">
              <Icon name="edit" size={18} /> Edit layout
            </button>
          )}
          {edit && (
            <>
              <button type="button" onClick={() => addTable(true)} className="h-12 px-4 rounded-xl border border-line bg-white text-[15px] font-semibold flex items-center gap-2">
                <Icon name="plus" size={16} /> Round table
              </button>
              <button type="button" onClick={() => addTable(false)} className="h-12 px-4 rounded-xl border border-line bg-white text-[15px] font-semibold flex items-center gap-2">
                <Icon name="plus" size={16} /> Long table
              </button>
              <button type="button" onClick={() => setEdit(false)} disabled={pending} className="h-12 px-4 rounded-xl text-[15px] font-semibold text-muted-2">
                Cancel
              </button>
              <button type="button" onClick={save} disabled={pending} className="h-12 px-5 rounded-xl bg-accent text-white text-[15px] font-bold flex items-center gap-2 disabled:opacity-50 hover:bg-accent-dark">
                <Icon name="check" size={18} stroke={2.4} /> {pending ? "Saving…" : "Save layout"}
              </button>
            </>
          )}
        </header>

        {edit ? (
          <div className="flex flex-wrap items-center gap-4 text-[13px] font-semibold text-muted-2 min-h-5">
            <span>Drag a table to move it · drag the dark corner to resize · snaps to {GRID}px</span>
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const z = newZone.trim();
                if (!z) return;
                setExtraZones((p) => [...p, z]);
                setZone(z);
                setNewZone("");
              }}
            >
              <label htmlFor="new-zone" className="sr-only">New area name</label>
              <input id="new-zone" value={newZone} onChange={(e) => setNewZone(e.target.value)} placeholder="New area, e.g. Patio" className="h-9 w-44 rounded-lg border border-line bg-white px-2.5 text-[13px] outline-none focus:border-ink" />
              <button type="submit" className="h-9 px-3 rounded-lg bg-ink text-white text-[13px] font-bold">Add area</button>
            </form>
          </div>
        ) : (
          <div className="flex flex-wrap gap-[18px] text-[13px] font-semibold text-muted-2 min-h-5">
            {LEGEND.filter((k) => k === "available" || counts[k]).map((k) => (
              <span key={k} className="inline-flex items-center gap-2">
                <span className="size-3.5 rounded" style={{ background: LOOKS[k].bg, border: `2px ${LOOKS[k].dashed ? "dashed" : "solid"} ${LOOKS[k].border}` }} />
                {LOOKS[k].label} <span className="font-mono text-ink">{counts[k] ?? 0}</span>
              </span>
            ))}
          </div>
        )}

        {error && <p role="alert" className="rounded-xl bg-accent-soft px-4 py-2.5 text-sm font-semibold text-accent-dark">{error}</p>}

        <div className="grow min-h-0 overflow-auto rounded-[18px]">
          <div
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onClick={(e) => {
              if (e.target === e.currentTarget) setSel(null);
            }}
            className={`relative rounded-[18px] ${edit ? "border-2 border-dashed border-line-2 bg-[#fdfcf9]" : "border border-line bg-white"}`}
            style={{
              width: FLOOR_W + 4,
              height: FLOOR_H + 4,
              backgroundImage: `radial-gradient(${edit ? "#cfc7b7" : "#e4ded2"} 1px, transparent 1px)`,
              backgroundSize: edit ? "16px 16px" : "24px 24px",
            }}
          >
            {zoneTables.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-muted pointer-events-none">
                {edit ? "Add a table from the top bar." : canEdit ? "No tables in this area yet — use Edit layout to add some." : "No tables in this area yet."}
              </div>
            )}
            {edit
              ? (zoneTables as EditTable[]).map((t) => {
                  const on = t.key === sel;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onPointerDown={grab(t, "move")}
                      onClick={() => setSel(t.key)}
                      aria-pressed={on}
                      aria-label={`Table ${t.name}, ${t.seats} seats`}
                      className="absolute flex flex-col items-center justify-center gap-0.5 select-none touch-none cursor-grab active:cursor-grabbing"
                      style={{
                        left: t.pos_x,
                        top: t.pos_y,
                        width: t.width,
                        height: t.height,
                        borderRadius: t.shape === "round" ? 999 : 16,
                        background: on ? "#fff" : "#fbfaf6",
                        border: `2px dashed ${on ? "#b83a20" : "#b9b1a1"}`,
                        zIndex: on ? 2 : 1,
                        boxShadow: on ? "0 6px 18px rgba(27,26,23,.18)" : undefined,
                      }}
                    >
                      <span className="font-display text-xl font-bold pointer-events-none">T{t.name}</span>
                      <span className="text-xs font-semibold pointer-events-none">{t.seats} seats</span>
                      {on && (
                        <span
                          aria-hidden="true"
                          onPointerDown={grab(t, "resize")}
                          className="absolute -right-[9px] -bottom-[9px] size-5 rounded-md bg-ink border-[3px] border-white cursor-nwse-resize touch-none"
                        />
                      )}
                    </button>
                  );
                })
              : (zoneTables as DiningTable[]).map((t) => {
                  const o = orderByTable.get(t.id);
                  const st = deriveStatus(t, o);
                  const look = LOOKS[st];
                  const on = t.id === sel;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSel(t.id)}
                      aria-pressed={on}
                      aria-label={`Table ${t.name}, ${look.label}`}
                      className="absolute flex flex-col items-center justify-center gap-0.5"
                      style={{
                        left: t.pos_x ?? 0,
                        top: t.pos_y ?? 0,
                        width: t.width,
                        height: t.height,
                        borderRadius: t.shape === "round" ? 999 : 16,
                        background: look.bg,
                        color: look.fg,
                        border: `2px ${look.dashed ? "dashed" : "solid"} ${look.border}`,
                        outline: on ? "3px solid #1b1a17" : undefined,
                        outlineOffset: 4,
                      }}
                    >
                      <span className="font-display text-xl font-bold">T{t.name}</span>
                      <span className="text-xs font-semibold">{o ? `${o.guests ?? "–"} · ${mins(o.createdAt)}m` : st === "available" ? `${t.seats} seats` : look.label}</span>
                    </button>
                  );
                })}
          </div>
        </div>
      </main>

      <aside aria-label="Table details" className="w-full lg:w-[380px] shrink-0 bg-panel border-l border-line flex flex-col p-6 gap-[18px] lg:h-screen">
        {!edit && !selTable && <div className="m-auto text-center text-muted text-[15px] leading-relaxed max-w-[260px]">Tap a table to see its order, seat guests or take payment.</div>}

        {!edit && selTable && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-[30px] font-bold">Table {selTable.name}</h2>
              <span
                className="text-[13px] font-bold px-3 py-1.5 rounded-full"
                style={{ background: LOOKS[selStatus].bg, color: LOOKS[selStatus].fg, border: `1px solid ${LOOKS[selStatus].border}` }}
              >
                {LOOKS[selStatus].label}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              <Stat label="Guests" value={selOrder ? `${selOrder.guests ?? "–"}/${selTable.seats}` : `– /${selTable.seats}`} />
              <Stat label="Seated" value={selOrder ? `${mins(selOrder.createdAt)} min` : "—"} />
              <Stat label="Order" value={selOrder ? `#${selOrder.number}` : "—"} />
              <Stat label="Check" value={selOrder ? money(selOrder.total) : "—"} />
            </dl>
            <div className="grow min-h-0 overflow-auto flex flex-col">
              {selOrder && selOrder.items.length > 0 ? (
                <>
                  <div className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted pb-1.5">On the check</div>
                  {selOrder.items.map((i, idx) => (
                    <div key={idx} className="flex gap-3 py-3 border-b border-[#efeae0] text-[15px]">
                      <span className="font-mono text-muted w-7">{i.quantity}×</span>
                      <span className="grow font-semibold">{i.item_name}</span>
                      <span className="text-[13px] font-semibold capitalize text-muted-2">{i.status === "pending" ? "sent" : i.status}</span>
                    </div>
                  ))}
                </>
              ) : (
                <div className="m-auto text-center text-muted text-[15px] leading-relaxed">
                  {selOrder ? "Guests seated. No items yet." : "Table is free. Start an order to seat guests."}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2.5">
              <Link
                href={selOrder ? `/order?order=${selOrder.id}` : `/order?table=${selTable.id}`}
                className="h-14 rounded-xl bg-accent text-white text-base font-bold flex items-center justify-center hover:bg-accent-dark"
              >
                {selOrder ? "Open order" : "Start order"}
              </Link>
              {selOrder ? (
                <Link href={`/checkout/${selOrder.id}`} className="h-12 rounded-xl border border-line text-sm font-semibold flex items-center justify-center">
                  Take payment
                </Link>
              ) : (
                <div className="flex gap-2.5">
                  {(["available", "reserved", "cleaning"] as TableStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={pending || (s === "available" ? selStatus === "available" : selTable.status === s)}
                      onClick={() => setStatus(selTable.id, s)}
                      className="flex-1 h-12 rounded-xl border border-line bg-white text-[13px] font-semibold disabled:opacity-40"
                    >
                      {s === "available" ? "Mark free" : s === "reserved" ? "Reserve" : "Needs cleaning"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {edit && !selEdit && (
          <div className="m-auto text-center text-muted text-[15px] leading-relaxed max-w-[260px]">
            Select a table to change its name, seats, shape, size or position — or add a new one from the top bar.
          </div>
        )}

        {edit && selEdit && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-[26px] font-bold">Edit table</h2>
              <span className="text-[13px] font-bold px-3 py-1.5 rounded-full bg-[#efeae0]">{layout.length} tables</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="t-name" className="text-[13px] font-bold text-muted-2">Table name</label>
              <input
                id="t-name"
                value={selEdit.name}
                maxLength={12}
                onChange={(e) => update(selEdit.key, { name: e.target.value })}
                className="h-12 px-3.5 border border-line-2 rounded-[10px] text-[17px] font-semibold outline-none focus:border-ink"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="text-[13px] font-bold text-muted-2">Shape</div>
              <div className="grid grid-cols-2 gap-2">
                {(["round", "rect"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={selEdit.shape === s}
                    onClick={() =>
                      update(selEdit.key, s === "round" ? { shape: "round", height: selEdit.width } : { shape: "rect", width: Math.max(selEdit.width, 160), height: Math.min(selEdit.height, 104) })
                    }
                    className={`h-12 rounded-[10px] border text-[15px] font-semibold ${selEdit.shape === s ? "bg-ink text-white border-ink" : "bg-white border-line"}`}
                  >
                    {s === "round" ? "Round" : "Rectangle"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2 grow min-h-0 overflow-auto">
              <Stepper label="Seats" value={`${selEdit.seats}`} onDec={() => update(selEdit.key, { seats: Math.max(1, selEdit.seats - 1) })} onInc={() => update(selEdit.key, { seats: Math.min(40, selEdit.seats + 1) })} />
              <Stepper label={selEdit.shape === "round" ? "Diameter" : "Width"} value={`${selEdit.width} px`} onDec={() => update(selEdit.key, { width: selEdit.width - GRID })} onInc={() => update(selEdit.key, { width: selEdit.width + GRID })} />
              {selEdit.shape === "rect" && (
                <Stepper label="Depth" value={`${selEdit.height} px`} onDec={() => update(selEdit.key, { height: selEdit.height - GRID })} onInc={() => update(selEdit.key, { height: selEdit.height + GRID })} />
              )}
              <Stepper label="Position X" value={`${selEdit.pos_x} px`} onDec={() => update(selEdit.key, { pos_x: selEdit.pos_x - GRID })} onInc={() => update(selEdit.key, { pos_x: selEdit.pos_x + GRID })} />
              <Stepper label="Position Y" value={`${selEdit.pos_y} px`} onDec={() => update(selEdit.key, { pos_y: selEdit.pos_y - GRID })} onInc={() => update(selEdit.key, { pos_y: selEdit.pos_y + GRID })} />
              <div className="flex flex-col gap-1.5 pt-1">
                <label htmlFor="t-zone" className="text-[13px] font-bold text-muted-2">Area</label>
                <select
                  id="t-zone"
                  value={selEdit.zone}
                  onChange={(e) => {
                    update(selEdit.key, { zone: e.target.value });
                    setZone(e.target.value);
                  }}
                  className="h-11 rounded-[10px] border border-line bg-white px-3 text-sm font-semibold"
                >
                  {zones.map((z) => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => {
                  const key = `new-${Date.now()}`;
                  setLayout((p) => [...p, fit({ ...selEdit, key, id: null, name: nextName(), pos_x: selEdit.pos_x + 24, pos_y: selEdit.pos_y + 24 })]);
                  setSel(key);
                }}
                className="h-12 rounded-xl border border-line bg-white text-[15px] font-semibold flex items-center justify-center gap-2"
              >
                <Icon name="copy" size={18} /> Duplicate table
              </button>
              {selEdit.id && orderByTable.has(selEdit.id) ? (
                <p className="rounded-xl bg-ground px-3.5 py-3 text-sm text-muted-2 leading-snug">
                  This table has an open order, so it can&apos;t be removed. You can still move or resize it.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (selEdit.id) setDeleted((d) => [...d, selEdit.id!]);
                    setLayout((p) => p.filter((t) => t.key !== selEdit.key));
                    setSel(null);
                  }}
                  className="h-12 rounded-xl border border-[#e8b9a9] bg-[#fbede7] text-accent-dark text-[15px] font-bold flex items-center justify-center gap-2"
                >
                  <Icon name="trash" size={18} /> Delete table
                </button>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3.5 bg-ground rounded-xl flex flex-col gap-1">
      <dt className="text-[13px] text-muted font-semibold">{label}</dt>
      <dd className="font-mono text-xl font-semibold">{value}</dd>
    </div>
  );
}

function Stepper({ label, value, onDec, onInc }: { label: string; value: string; onDec: () => void; onInc: () => void }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grow text-[15px] font-semibold">{label}</span>
      <div className="flex items-center gap-0.5 bg-ground rounded-[10px] p-0.5">
        <button type="button" onClick={onDec} aria-label={`Decrease ${label.toLowerCase()}`} className="size-11 rounded-lg flex items-center justify-center">
          <Icon name="minus" size={16} stroke={2.2} />
        </button>
        <span className="w-[76px] text-center font-mono text-[15px] font-semibold">{value}</span>
        <button type="button" onClick={onInc} aria-label={`Increase ${label.toLowerCase()}`} className="size-11 rounded-lg flex items-center justify-center">
          <Icon name="plus" size={16} stroke={2.2} />
        </button>
      </div>
    </div>
  );
}
