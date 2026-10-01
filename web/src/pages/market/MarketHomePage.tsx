import { PublicMarketBoard } from "../../components/public/PublicMarketBoard";
import { useAuth } from "../../auth/AuthContext";
import { canBrowseMarket } from "../../auth/permissions";

export function MarketHomePage() {
  const { user } = useAuth();
  const allowed = canBrowseMarket(user);

  if (!allowed) {
    return (
      <div className="store-wrap store-app-head">
        <p className="text-sm text-[var(--store-muted)]">Buyer account required.</p>
      </div>
    );
  }

  return <PublicMarketBoard variant="app" />;
}
