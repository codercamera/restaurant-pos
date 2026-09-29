"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useLang } from "@/lib/i18n/client";
import { MAX_IMAGES_PER_DISH } from "@/lib/menu-images";
import { deleteImage, setPrimaryImage } from "./actions";
import type { ImageRaw } from "./MenuAdmin";

const MAX_SIDE = 1000; // px, longest edge
const QUALITY = 0.82;

/** Shrinks a photo to a JPEG of at most MAX_SIDE px so uploads stay small (about 60–200 KB). */
async function compress(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // PNGs with transparency become white, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", QUALITY));
}

/** Up to 4 photos for a dish; one is the main "sample" photo shown on the order screen. */
export function DishPhotos({ itemId, images }: { itemId: string; images: ImageRaw[] }) {
  const { t } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const room = MAX_IMAGES_PER_DISH - images.length;

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      for (const file of Array.from(files).slice(0, room)) {
        let blob: Blob;
        try {
          blob = await compress(file);
        } catch {
          setError(t("Couldn't read that photo. Try a JPEG or PNG."));
          break;
        }
        const body = new FormData();
        body.append("file", blob, "photo.jpg");
        const res = await fetch(`/api/menu-items/${itemId}/images`, { method: "POST", body });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(data?.error ?? t("Something went wrong"));
          break;
        }
      }
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
      router.refresh();
    }
  };

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error ?? t("Something went wrong"));
      else router.refresh();
    });

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 flex w-full items-baseline justify-between text-sm font-bold text-muted-2">
        <span>{t("Photos")}</span>
        <span className="font-mono text-xs">{images.length}/{MAX_IMAGES_PER_DISH}</span>
      </legend>
      <div className="grid grid-cols-4 gap-2">
        {images.map((im) => (
          <div key={im.id} className="flex flex-col gap-1.5">
            <div className={`relative aspect-square rounded-[10px] overflow-hidden bg-ground-2 ${im.is_primary ? "ring-2 ring-accent ring-offset-2 ring-offset-panel" : "border border-line"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/menu-images/${im.id}`} alt="" className="size-full object-cover" loading="lazy" />
              {im.is_primary && <span className="absolute left-1 top-1 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">{t("Main photo")}</span>}
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={pending || im.is_primary}
                onClick={() => act(() => setPrimaryImage(im.id))}
                aria-label={t("Use as main photo")}
                title={t("Use as main photo")}
                className="h-9 grow rounded-lg border border-line flex items-center justify-center disabled:opacity-40"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill={im.is_primary ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
                  <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" />
                </svg>
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => confirm(t("Delete this photo?")) && act(() => deleteImage(im.id))}
                aria-label={t("Delete photo")}
                title={t("Delete photo")}
                className="h-9 grow rounded-lg border border-line flex items-center justify-center text-accent-text disabled:opacity-40"
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          </div>
        ))}
        {room > 0 && (
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
              className="aspect-square rounded-[10px] border-2 border-dashed border-line-2 text-muted-2 flex flex-col items-center justify-center gap-1 text-xs font-semibold disabled:opacity-50"
            >
              <Icon name="plus" size={20} stroke={2} />
              {busy ? t("Uploading…") : t("Add")}
            </button>
          </div>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} onChange={(e) => upload(e.target.files)} />
      <p className="text-xs text-muted">{t("Up to {n} photos. The star marks the main photo shown on the order screen.", { n: MAX_IMAGES_PER_DISH })}</p>
      {error && <p role="alert" className="rounded-[10px] bg-accent-soft px-3 py-2 text-sm font-semibold text-accent-text">{error}</p>}
    </fieldset>
  );
}
