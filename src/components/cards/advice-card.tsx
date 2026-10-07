import type { ReactNode } from "react";
import { Card } from "@/components/ui";
import type { Advice } from "@/domain/advice";

// « Quand consommer » (T48) : une ligne par conseil, la plus urgente d'abord (jour rouge).

const DOT: Record<Advice["tone"], string> = {
  warning: "bg-negative",
  positive: "bg-solar",
  info: "bg-hc",
};

export function AdviceCard({ advice, actions }: { advice: Advice[]; actions?: ReactNode }) {
  if (advice.length === 0) return null;
  return (
    <Card
      icon="sun"
      title="Quand consommer"
      actions={actions}
      description="Les heures où votre électricité coûte le moins, d'après vos données et votre contrat."
    >
      <ul className="flex flex-col">
        {advice.map((a) => (
          <li
            key={a.id}
            className="flex gap-3 border-t border-track py-3 first:border-t-0 first:pt-0 last:pb-0"
          >
            <span className={`mt-1.5 size-2 flex-none rounded-full ${DOT[a.tone]}`} aria-hidden />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-semibold">{a.title}</span>
              <span className="text-[13px] text-muted text-pretty">{a.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
