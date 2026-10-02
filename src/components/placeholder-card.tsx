/** Carte provisoire pour les écrans pas encore construits (référence de tâche). */
export function PlaceholderCard({ task, children }: { task: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-dashed border-[#CFC9BB] bg-surface p-5 text-sm text-muted">
      <span className="font-mono text-[11px] text-subtle">{task}</span>
      {children}
    </div>
  );
}
