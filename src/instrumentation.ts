// Exécuté une fois au démarrage du serveur Next (T11) : applique les migrations en
// production. RUN_MIGRATIONS=off pour le désactiver. L'import est gardé par
// NEXT_RUNTIME pour que le bundle edge n'embarque pas de modules Node.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { onServerStart } = await import("./server/boot");
    await onServerStart();
  }
}
