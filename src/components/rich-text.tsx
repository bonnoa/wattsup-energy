import { parseRichText, type Span } from "@/domain/instance-texts";

// Texte de l'administrateur mis en forme (paragraphes, listes, gras) : rendu par React à
// partir de parseRichText, donc jamais de HTML injecté.

function Line({ spans }: { spans: Span[] }) {
  return spans.map((s, i) =>
    s.bold ? (
      <strong key={i} className="font-semibold text-ink">
        {s.text}
      </strong>
    ) : (
      <span key={i}>{s.text}</span>
    ),
  );
}

export function RichText({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2.5 text-[13px] leading-relaxed text-ink-soft">
      {parseRichText(text).map((b, i) =>
        b.type === "p" ? (
          <p key={i} className="text-pretty">
            {b.lines.map((l, j) => (
              <span key={j} className="block">
                <Line spans={l} />
              </span>
            ))}
          </p>
        ) : (
          <ul key={i} className="flex list-disc flex-col gap-1.5 pl-5 text-pretty">
            {b.items.map((item, j) => (
              <li key={j}>
                <Line spans={item} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
