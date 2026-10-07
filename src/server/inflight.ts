// Calculs coûteux partagés entre requêtes simultanées identiques (même clé) : la seconde
// attend le résultat de la première au lieu de relancer le calcul. Une requête abandonnée
// par le navigateur (clics rapides Mois / Année) continue côté serveur ; sans ce partage,
// une rafale de clics empilait autant de calculs, et le dernier attendait derrière tous.
// Rien n'est gardé après la fin du calcul : aucune donnée périmée.

const running = new Map<string, Promise<unknown>>();

export function shareInFlight<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const current = running.get(key);
  if (current) return current as Promise<T>;
  const promise = compute().finally(() => running.delete(key));
  running.set(key, promise);
  return promise;
}
