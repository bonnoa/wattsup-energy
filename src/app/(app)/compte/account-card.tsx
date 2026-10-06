"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { button, Card, Notice } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

const inputClass =
  "h-10 w-full rounded-[8px] border border-border-strong bg-surface px-3 text-[14px] outline-none focus:border-ink";
const labelClass = "flex flex-col gap-1.5 text-xs text-muted";

type Message = { ok: boolean; text: string } | null;

function Status({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p role="status" className={`text-sm ${message.ok ? "text-positive" : "text-negative"}`}>
      {message.text}
    </p>
  );
}

/**
 * Adresse email de connexion : saisie deux fois (une faute de frappe empêcherait de se
 * reconnecter). Une adresse déjà prise ne change rien : Better Auth ne le dit pas, pour ne
 * pas révéler qu'elle existe ; on le constate en relisant la session.
 */
function EmailForm({ email }: { email: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [pending, setPending] = useState(false);

  const changeEmail = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const next = String(form.get("email")).trim().toLowerCase();
    if (next !== String(form.get("confirm")).trim().toLowerCase()) {
      setMessage({ ok: false, text: "Les deux adresses ne sont pas identiques." });
      return;
    }
    setPending(true);
    const { error } = await authClient.changeEmail({ newEmail: next });
    const session = error ? null : await authClient.getSession();
    setPending(false);
    if (error) {
      setMessage({
        ok: false,
        text:
          error.message === "Email is the same"
            ? "C'est déjà votre adresse."
            : "Changement impossible. Vérifiez l'adresse et réessayez.",
      });
      return;
    }
    if (session?.data?.user.email !== next) {
      setMessage({ ok: false, text: "Cette adresse est déjà utilisée par un autre compte." });
      return;
    }
    setEditing(false);
    setMessage({ ok: true, text: `Adresse changée : connectez-vous désormais avec ${next}.` });
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="text-sm font-semibold">Adresse email</h3>
          <p className="truncate text-[13px] text-muted">{email}</p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setMessage(null);
            }}
            className={button.secondary}
          >
            Modifier
          </button>
        )}
      </div>
      {editing && (
        <form onSubmit={changeEmail} className="flex flex-col gap-3">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-2">
            <label className={labelClass}>
              Nouvelle adresse
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Confirmez-la
              <input
                name="confirm"
                type="email"
                required
                autoComplete="off"
                className={inputClass}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className={button.primary}>
              Changer d&apos;adresse
            </button>
            <button type="button" onClick={() => setEditing(false)} className={button.secondary}>
              Annuler
            </button>
          </div>
        </form>
      )}
      <Status message={message} />
    </div>
  );
}

/** Identifiants : adresse email de connexion et mot de passe. */
export function AccountCard({ email }: { email: string }) {
  const [message, setMessage] = useState<Message>(null);
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

  return (
    <Card icon="key" title="Identifiants" description="Adresse de connexion et mot de passe.">
      <EmailForm email={email} />
      <form onSubmit={changePassword} className="flex flex-col gap-3 border-t border-track pt-4">
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
      <Status message={message} />
    </Card>
  );
}

/** Suppression du compte et de toutes ses données, confirmée par le mot de passe. */
export function DeleteAccountCard() {
  const router = useRouter();
  const [message, setMessage] = useState<Message>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

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
    <Card
      danger
      icon="trash"
      title="Supprimer le compte"
      description="Le compte, le foyer et toutes ses données : énergie, contrats, combustibles, équipements, jetons."
    >
      {confirming ? (
        <form onSubmit={deleteAccount} className="flex flex-col gap-3">
          <Notice title="Suppression définitive :">cette action ne peut pas être annulée.</Notice>
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
            <button type="button" onClick={() => setConfirming(false)} className={button.secondary}>
              Annuler
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={`${button.primary} self-start bg-negative`}
        >
          Supprimer mon compte…
        </button>
      )}
      <Status message={message} />
    </Card>
  );
}
