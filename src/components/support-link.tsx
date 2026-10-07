// Soutien au projet (Buy Me a Coffee), en bas de la boîte à idées et du formulaire de contact.
// Bouton reproduit en CSS plutôt que l'image du CDN de Buy Me a Coffee : la page ne charge
// rien d'un tiers (SPEC §12), seul un clic mène à la page de soutien.

const SUPPORT_URL = "https://www.buymeacoffee.com/kraftpunk";

export function SupportLink() {
  return (
    <div className="flex flex-col items-center gap-2.5 pt-2 text-center">
      <p className="text-[13px] text-muted text-pretty">
        WattsUp vous rend service ? Vous pouvez soutenir son développement.
      </p>
      <a
        href={SUPPORT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-[52px] items-center gap-2.5 rounded-[10px] border border-[#E6C800] bg-[#FFDD00] px-5 text-[17px] font-semibold text-[#16181a] no-underline shadow-[0_1px_2px_rgba(0,0,0,0.12)] hover:bg-[#FFE433]"
      >
        <span aria-hidden className="text-[22px] leading-none">
          ☕
        </span>
        Buy me a coffee
        <span className="sr-only">(nouvel onglet)</span>
      </a>
    </div>
  );
}
