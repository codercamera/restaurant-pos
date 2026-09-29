"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { formatMoney } from "@/lib/money";
import type { Category, MenuItem } from "@/lib/types";
import { deleteCategory, deleteItem, saveCategory, saveItem, setCategoryActive, setItemAvailable } from "./actions";

type Item = MenuItem & { options: string[] };
type Form = { id: string | null; category_id: string; name: string; description: string; price: string };

const field = "h-12 w-full rounded-[10px] border border-line-2 bg-panel px-3.5 text-[15px] font-medium outline-none focus:border-ink";

export function MenuAdmin({ categories, items, currency }: { categories: Category[]; items: Item[]; currency: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cat, setCat] = useState<string | null>(categories[0]?.id ?? null);
  const [newCat, setNewCat] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [msg, setMsg] = useState<{ kind: "error" | "ok"; text: string } | null>(null);

  const current = categories.find((c) => c.id === cat) ?? null;
  const list = items.filter((i) => i.category_id === cat);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText?: string, after?: () => void) =>
    startTransition(async () => {
      setMsg(null);
      const res = await fn();
      if (!res.ok) setMsg({ kind: "error", text: res.error ?? "Something went wrong" });
      else {
        if (okText) setMsg({ kind: "ok", text: okText });
        after?.();
        router.refresh();
      }
    });

  const submitItem = () => {
    if (!form) return;
    run(
      () => saveItem({ id: form.id, category_id: form.category_id, name: form.name, description: form.description, base_price: Number(form.price) }),
      form.id ? "Dish updated" : "Dish added",
      () => setForm(null)
    );
  };

  return (
    <main className="px-6 py-5 flex flex-col gap-5 lg:h-screen">
      <header className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-tight">Menu</h1>
          <div className="text-sm text-muted">{items.length} dishes in {categories.length} categories · changes show on the order screen right away</div>
        </div>
      </header>

      {msg && (
        <p role={msg.kind === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${msg.kind === "error" ? "bg-accent-soft text-accent-text" : "bg-good-soft text-good-dark"}`}>
          {msg.text}
        </p>
      )}

      <div className="grow min-h-0 flex flex-col md:flex-row gap-5">
        <section aria-label="Categories" className="md:w-[300px] shrink-0 rounded-2xl border border-line bg-panel flex flex-col overflow-hidden">
          <div className="grow overflow-auto">
            {categories.map((c) => (
              <div key={c.id} className={`flex items-center gap-2 px-3 min-h-14 border-b border-hair ${c.id === cat ? "bg-ground" : ""}`}>
                {renaming?.id === c.id ? (
                  <form
                    className="grow flex gap-2 py-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(() => saveCategory({ id: c.id, name: renaming.name }), undefined, () => setRenaming(null));
                    }}
                  >
                    <label htmlFor={`rn-${c.id}`} className="sr-only">Category name</label>
                    <input id={`rn-${c.id}`} autoFocus value={renaming.name} onChange={(e) => setRenaming({ id: c.id, name: e.target.value })} className="grow h-10 rounded-lg border border-line-2 px-2.5 text-sm" />
                    <button type="submit" className="h-10 px-3 rounded-lg bg-strong text-on-strong text-sm font-bold">Save</button>
                  </form>
                ) : (
                  <>
                    <button type="button" onClick={() => setCat(c.id)} className={`grow text-left py-3 font-semibold ${c.is_active ? "" : "text-muted line-through"}`}>
                      {c.name} <span className="font-mono text-xs text-muted">{items.filter((i) => i.category_id === c.id).length}</span>
                    </button>
                    <button type="button" aria-label={`Rename ${c.name}`} onClick={() => setRenaming({ id: c.id, name: c.name })} className="size-9 rounded-lg text-muted hover:bg-ground-2 flex items-center justify-center">
                      <Icon name="edit" size={16} />
                    </button>
                  </>
                )}
              </div>
            ))}
            {categories.length === 0 && <div className="p-6 text-center text-muted text-sm">No categories yet.</div>}
          </div>
          <form
            className="flex gap-2 p-3 border-t border-line bg-panel-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => saveCategory({ name: newCat }), "Category added", () => setNewCat(""));
            }}
          >
            <label htmlFor="new-cat" className="sr-only">New category</label>
            <input id="new-cat" value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category" className="grow h-11 rounded-[10px] border border-line-2 bg-panel px-3 text-sm" />
            <button type="submit" disabled={pending || !newCat.trim()} className="h-11 px-3.5 rounded-[10px] bg-strong text-on-strong text-sm font-bold disabled:opacity-40">Add</button>
          </form>
        </section>

        <section aria-label="Dishes" className="grow min-w-0 rounded-2xl border border-line bg-panel flex flex-col overflow-hidden">
          {current ? (
            <>
              <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-line">
                <h2 className="grow font-display text-xl font-bold">{current.name}</h2>
                <button type="button" onClick={() => run(() => setCategoryActive(current.id, !current.is_active))} className="h-10 px-3 rounded-lg border border-line text-sm font-semibold">
                  {current.is_active ? "Hide category" : "Show category"}
                </button>
                {list.length === 0 && (
                  <button type="button" onClick={() => confirm(`Delete ${current.name}?`) && run(() => deleteCategory(current.id), "Category deleted", () => setCat(null))} className="h-10 px-3 rounded-lg border border-line text-sm font-semibold text-accent-text">
                    Delete
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setForm({ id: null, category_id: current.id, name: "", description: "", price: "" })}
                  className="h-10 px-4 rounded-lg bg-accent text-white text-sm font-bold flex items-center gap-1.5 hover:bg-accent-dark"
                >
                  <Icon name="plus" size={16} /> Add dish
                </button>
              </div>
              <div className="grow overflow-auto">
                {list.length === 0 && <div className="p-10 text-center text-muted">No dishes in this category yet.</div>}
                {list.map((i) => (
                  <div key={i.id} className="flex items-center gap-4 px-5 py-3.5 border-b border-hair">
                    <div className="grow min-w-0">
                      <div className={`font-semibold ${i.is_available ? "" : "text-muted"}`}>{i.name}</div>
                      <div className="text-[13px] text-muted truncate">{i.description}</div>
                      {i.options.length > 0 && <div className="text-xs font-semibold text-info mt-0.5">Options: {i.options.join(", ")}</div>}
                    </div>
                    <span className="font-mono font-semibold w-28 text-right">{formatMoney(i.base_price, currency)}</span>
                    <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                      <input type="checkbox" checked={i.is_available} onChange={(e) => run(() => setItemAvailable(i.id, e.target.checked))} className="size-5 accent-[#2f6b4f]" />
                      {i.is_available ? "On sale" : "Sold out"}
                    </label>
                    <button
                      type="button"
                      aria-label={`Edit ${i.name}`}
                      onClick={() => setForm({ id: i.id, category_id: i.category_id, name: i.name, description: i.description ?? "", price: String(i.base_price) })}
                      className="size-10 rounded-lg border border-line flex items-center justify-center"
                    >
                      <Icon name="edit" size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${i.name}`}
                      onClick={() =>
                        confirm(`Delete ${i.name}?`) &&
                        startTransition(async () => {
                          const res = await deleteItem(i.id);
                          if (!res.ok) setMsg({ kind: "error", text: res.error });
                          else {
                            setMsg({ kind: "ok", text: res.data.hidden ? `${i.name} has order history, so it was marked sold out instead of deleted.` : `${i.name} deleted` });
                            router.refresh();
                          }
                        })
                      }
                      className="size-10 rounded-lg border border-line text-accent-text flex items-center justify-center"
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="m-auto p-10 text-center text-muted">Add a category to start building your menu.</div>
          )}
        </section>
      </div>

      {form && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setForm(null)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="dish-title"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              submitItem();
            }}
            className="w-full max-w-[480px] rounded-2xl bg-panel p-6 flex flex-col gap-4"
          >
            <h2 id="dish-title" className="font-display text-2xl font-bold">{form.id ? "Edit dish" : "New dish"}</h2>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="d-name" className="text-sm font-bold text-muted-2">Name</label>
              <input id="d-name" autoFocus required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="d-desc" className="text-sm font-bold text-muted-2">Description</label>
              <input id="d-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={field} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="d-price" className="text-sm font-bold text-muted-2">Price ({currency})</label>
                <input id="d-price" required inputMode="decimal" type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={`${field} font-mono`} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="d-cat" className="text-sm font-bold text-muted-2">Category</label>
                <select id="d-cat" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className={field}>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2.5 pt-2">
              <button type="button" onClick={() => setForm(null)} className="grow h-12 rounded-xl border border-line font-semibold">Cancel</button>
              <button type="submit" disabled={pending} className="grow h-12 rounded-xl bg-accent text-white font-bold disabled:opacity-50 hover:bg-accent-dark">
                {pending ? "Saving…" : "Save dish"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
