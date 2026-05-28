import { WelcomeScreen } from "../components/WelcomeScreen";
import { useOnboardingStatus } from "../hooks/useOnboardingStatus";

export function WelcomePage() {
  const { company, loading } = useOnboardingStatus();
  if (loading) return null;
  return (
    <div className="p-6">
      <WelcomeScreen companyName={company?.name ?? ""} />
    </div>
  );
}
