import { button, Card } from "@/components/ui";
import { restartOnboardingAction } from "@/server/actions/onboarding";

/** Relancer le parcours de bienvenue (profil, commune, contrat, Home Assistant, historique). */
export function OnboardingCard() {
  return (
    <Card
      icon="check"
      title="Parcours de bienvenue"
      description="Reprenez pas à pas la configuration : profil, commune, contrat, Home Assistant, historique."
    >
      <form action={restartOnboardingAction}>
        <button type="submit" className={button.secondary}>
          Relancer le parcours
        </button>
      </form>
    </Card>
  );
}
