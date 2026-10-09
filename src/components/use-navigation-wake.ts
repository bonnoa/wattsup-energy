import { useEffect, useState } from "react";

// Contournement d'un défaut de React 19.2 (canary embarqué par Next.js 15.5) : une navigation
// côté client se suspend parfois sur une promesse résolue qui ne prévient jamais React. Les
// données sont arrivées, mais la page ne s'affiche qu'au rendu suivant, quel qu'il soit
// (jusqu'à 60 s, le rafraîchissement du statut Home Assistant). Constaté par l'état de la
// racine React : transitions suspendues, aucune relance, rien de planifié.
//
// Tant qu'un lien est en cours de chargement (useLinkStatus), un petit rendu toutes les
// 300 ms suffit à relancer React, qui affiche alors la page sans attendre.

const WAKE_MS = 300;

export function useNavigationWake(pending: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!pending) return;
    const id = setInterval(() => setTick((t) => t + 1), WAKE_MS);
    return () => clearInterval(id);
  }, [pending]);
}
