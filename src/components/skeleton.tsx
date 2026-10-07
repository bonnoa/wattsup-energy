// Squelettes affichés pendant le chargement d'une page (loading.tsx) : l'utilisateur voit
// tout de suite que sa demande est prise en compte. Blocs gris qui pulsent doucement
// (immobiles si le mouvement est réduit).

const block = "animate-pulse rounded-[8px] bg-track";

/** Une carte : titre, deux lignes, puis un bloc de contenu. */
export function SkeletonCard({ tall = false }: { tall?: boolean }) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 sm:p-5">
      <div className={`${block} h-4 w-2/5`} />
      <div className={`${block} h-3 w-4/5`} />
      <div className={`${block} ${tall ? "h-40" : "h-16"} w-full`} />
    </div>
  );
}

/** Une page : titre, sous-titre et quelques cartes. */
export function SkeletonPage() {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-5">
      <span className="sr-only">Chargement…</span>
      <div className="flex flex-col gap-2">
        <div className={`${block} h-8 w-56`} />
        <div className={`${block} h-3.5 w-72 max-w-full`} />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-4">
        <SkeletonCard tall />
        <SkeletonCard tall />
      </div>
      <SkeletonCard />
    </div>
  );
}

/** Le contenu d'une section de Réglages. */
export function SkeletonSection() {
  return (
    <div aria-busy="true" aria-live="polite" className="flex max-w-2xl flex-col gap-4">
      <span className="sr-only">Chargement…</span>
      <SkeletonCard tall />
    </div>
  );
}
