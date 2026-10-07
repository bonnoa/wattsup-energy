import { HELP_URL } from "@/lib/links";

/** Bas du menu : numéro de version de l'appli · lien « Aide » vers le guide d'utilisation. */
export function VersionLine({ version, className }: { version: string; className: string }) {
  return (
    <p className={`text-center text-[10px] tabular-nums ${className}`}>
      {version}
      <span aria-hidden> · </span>
      <a
        href={HELP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-inherit underline-offset-2 hover:underline"
      >
        Aide<span className="sr-only"> (guide d&apos;utilisation, nouvel onglet)</span>
      </a>
    </p>
  );
}
