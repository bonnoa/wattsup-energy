"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { button, Card, Notice } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

const inputClass =
  "h-10 w-full rounded-[8px] border border-border-strong bg-surface px-3 text-[14px] outline-none focus:border-ink";
const labelClass = "flex flex-col gap-1.5 text-xs text-muted";

/** Compte : changement de mot de passe, suppression du compte et de toutes ses données. */
export function AccountCard({ email }: { email: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pending, setPending] = useState(false);

  const changePassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    const { error } = await authClient.changePassword({
      currentPassword: String(form.get("current")),
      newPassword: String(form.get("next")),
      revokeOtherSessions: true,
    });
    setPending(false);
    if (error) {
      setMessage({
        ok: false,
        text:
          error.code === "INVALID_PASSWORD"
            ? "Mot de passe actuel incorrect."
            : error.code === "PASSWORD_TOO_SHORT"
              ? "Le nouveau mot de passe doit faire au moins 10 caractères."
              : "Changement impossible. Réessayez.",
      });
      return;
    }
    (e.target as HTMLFormElement).reset();
    setMessage({ ok: true, text: "Mot de passe changé ; vos autres sessions sont fermées." });
  };

  const deleteAccount = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get("password"));
    setPending(true);
    const { error } = await authClient.deleteUser({ password });
    setPending(false);
    if (error) {
      setMessage({ ok: false, text: "Mot de passe incorrect : le compte n'a pas été supprimé." });
      return;
    }
    router.replace("/connexion");
  };

  return (
    <Card icon="key" title="Compte" description={email}>
      <form onSubmit={changePassword} className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Changer de mot de passe</h3>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-2">
          <label className={labelClass}>
            Mot de passe actuel
            <input
              name="current"
              type="password"
              required
              autoComplete="current-password"
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Nouveau mot de passe
            <input
              name="next"
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              className={inputClass}
            />
          </label>
        </div>
        <button type="submit" disabled={pending} className={`${button.secondary} self-start`}>
          Changer le mot de passe
        </button>
      </form>

      {message && (
        <p role="status" className={`text-sm ${message.ok ? "text-positive" : "text-negative"}`}>
          {message.text}
        </p>
      )}

      {deleting ? (
        <form onSubmit={deleteAccount} className="flex flex-col gap-3">
          <Notice title="Suppression définitive :">
            le compte, le foyer et toutes ses données (énergie, contrats, combustibles, équipements,
            jetons) sont effacés. Cette action ne peut pas être annulée.
          </Notice>
          <label className={labelClass}>
            Confirmez avec votre mot de passe
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className={inputClass}
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className={`${button.primary} bg-negative`}>
              Supprimer mon compte
            </button>
            <button type="button" onClick={() => setDeleting(false)} className={button.secondary}>
              Annuler
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setDeleting(true)}
          className="self-start text-xs text-negative hover:text-ink"
        >
          Supprimer mon compte et mes données…
        </button>
      )}
    </Card>
  );
}
