"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

type Mode = "connexion" | "inscription";

const COPY: Record<
  Mode,
  { title: string; submit: string; switchText: string; switchHref: string; switchLabel: string }
> = {
  connexion: {
    title: "Connexion",
    submit: "Se connecter",
    switchText: "Pas encore de compte ?",
    switchHref: "/inscription",
    switchLabel: "Créer un compte",
  },
  inscription: {
    title: "Créer un compte",
    submit: "Créer mon compte",
    switchText: "Déjà inscrit ?",
    switchHref: "/connexion",
    switchLabel: "Se connecter",
  },
};

// Messages d'erreur Better Auth traduits ; les autres retombent sur un message générique.
const ERRORS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Email ou mot de passe incorrect.",
  USER_ALREADY_EXISTS: "Un compte existe déjà avec cet email.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Un compte existe déjà avec cet email.",
  PASSWORD_TOO_SHORT: "Le mot de passe doit faire au moins 10 caractères.",
  INVALID_EMAIL: "Adresse email invalide.",
};

const inputClass =
  "h-11 w-full rounded-[8px] border border-border-strong bg-surface px-3 text-sm outline-none focus:border-ink";

export function AuthForm({ mode }: { mode: Mode }) {
  const copy = COPY[mode];
  const router = useRouter();
  const next = useSearchParams().get("suite") ?? "/";
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const { error } =
      mode === "inscription"
        ? await authClient.signUp.email({ email, password, name: String(form.get("name")) })
        : await authClient.signIn.email({ email, password });
    setPending(false);
    if (error) {
      setError(ERRORS[error.code ?? ""] ?? "Une erreur est survenue. Réessayez.");
      return;
    }
    router.replace(next.startsWith("/") ? next : "/");
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-card border border-border bg-surface p-6"
    >
      <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
      {mode === "inscription" && (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Prénom</span>
          <input name="name" required autoComplete="given-name" className={inputClass} />
        </label>
      )}
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted">Email</span>
        <input name="email" type="email" required autoComplete="email" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted">Mot de passe</span>
        <input
          name="password"
          type="password"
          required
          minLength={10}
          autoComplete={mode === "inscription" ? "new-password" : "current-password"}
          className={inputClass}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-[8px] bg-ink text-sm font-medium text-bg disabled:opacity-60"
      >
        {pending ? "…" : copy.submit}
      </button>
      <p className="text-sm text-muted">
        {copy.switchText} <Link href={copy.switchHref}>{copy.switchLabel}</Link>
      </p>
    </form>
  );
}
