import { Badge } from "@/components/ui";

/** Carte provisoire pour les écrans pas encore construits (référence de tâche). */
export function PlaceholderCard({ task, children }: { task: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-card border border-dashed border-dash bg-surface p-5 text-sm text-muted">
      <Badge>À venir · {task}</Badge>
      {children}
    </div>
  );
}
