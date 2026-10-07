// Blueprints Home Assistant servis par l'instance : HA retient `source_url` pour proposer
// les mises à jour ; servi par WattsUp, il doit pointer vers WattsUp lui-même. Pur.

/** Remplace la valeur de `source_url` (première occurrence) par `url`. */
export function withSourceUrl(yaml: string, url: string): string {
  return yaml.replace(/^(\s*source_url:\s*).*$/m, `$1${url}`);
}

/** Adresse publique de l'instance d'après la requête (derrière un proxy : en-têtes X-Forwarded). */
export function publicOrigin(requestUrl: string, headers: Headers): string {
  const url = new URL(requestUrl);
  const proto =
    headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.slice(0, -1);
  const host =
    headers.get("x-forwarded-host")?.split(",")[0]?.trim() || headers.get("host") || url.host;
  return `${proto}://${host}`;
}
