// Retour après connexion (`?suite=`) : seulement un chemin de l'application, jamais une
// adresse qui ferait sortir du site (redirection ouverte). Pur.

const BASE = "http://wattsup.invalid";

/** Chemin interne (avec requête et ancre) tiré de `value`, sinon l'accueil. */
export function safeNextPath(value: string | null): string {
  if (!value?.startsWith("/")) return "/";
  // Le navigateur lit `//hôte`, `/\hôte` ou un chemin coupé de tabulations comme une autre
  // origine : on résout comme lui et on refuse tout ce qui change d'origine.
  const url = new URL(value, BASE);
  if (url.origin !== BASE) return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}
