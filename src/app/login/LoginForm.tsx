"use client";

import { useActionState, useState } from "react";
import { useLang } from "@/lib/i18n/client";
import { createRestaurant, signIn, type AuthState } from "./actions";

const input =
  "h-12 w-full rounded-[10px] border border-line-2 bg-panel px-3.5 text-[16px] font-medium text-ink outline-none focus:border-ink";

function Field({ id, label, ...rest }: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold text-muted-2">{label}</label>
      <input id={id} name={id} className={input} {...rest} />
    </div>
  );
}

export function LoginForm({ notice }: { notice?: string }) {
  const { t } = useLang();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [inState, inAction, inPending] = useActionState<AuthState, FormData>(signIn, {});
  const [upState, upAction, upPending] = useActionState<AuthState, FormData>(createRestaurant, {});
  const state = mode === "in" ? inState : upState;
  const pending = mode === "in" ? inPending : upPending;

  return (
    <form key={mode} action={mode === "in" ? inAction : upAction} className="flex flex-col gap-4">
      {notice && mode === "in" && <p className="rounded-[10px] bg-warn-soft px-3.5 py-2.5 text-sm font-semibold text-warn">{notice}</p>}
      {mode === "up" && (
        <>
          <Field id="company" label={t("Restaurant name")} required autoComplete="organization" />
          <div className="grid grid-cols-2 gap-3">
            <Field id="branch" label={t("Branch")} defaultValue={t("Main branch")} />
            <Field id="full_name" label={t("Your name")} required autoComplete="name" />
          </div>
        </>
      )}
      <Field id="email" label={t("Email")} type="email" required autoComplete="email" />
      <Field
        id="password"
        label={t("Password")}
        type="password"
        required
        minLength={mode === "up" ? 8 : undefined}
        autoComplete={mode === "in" ? "current-password" : "new-password"}
      />
      {mode === "up" && (
        <label className="flex items-start gap-3 rounded-xl bg-ground p-3.5 cursor-pointer">
          <input type="checkbox" name="sample" defaultChecked className="mt-1 size-5 accent-[#b83a20]" />
          <span className="text-[15px] leading-snug">
            <span className="font-bold">{t("Add a sample menu and floor plan")}</span>
            <br />
            <span className="text-muted">{t("16 dishes with options and 14 tables. Edit or delete them any time.")}</span>
          </span>
        </label>
      )}
      {state.error && <p role="alert" className="rounded-[10px] bg-accent-soft px-3.5 py-2.5 text-sm font-semibold text-accent-text">{state.error}</p>}
      <button type="submit" disabled={pending} className="h-14 rounded-xl bg-accent text-white text-base font-bold disabled:opacity-60 hover:bg-accent-dark">
        {pending ? t("Please wait…") : mode === "in" ? t("Sign in") : t("Create restaurant")}
      </button>
      <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="h-11 text-sm font-semibold text-muted-2 underline underline-offset-4">
        {mode === "in" ? t("New restaurant? Create an owner account") : t("Already have an account? Sign in")}
      </button>
    </form>
  );
}
