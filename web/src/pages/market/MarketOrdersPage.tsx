import { useCallback, useEffect, useState } from "react";
import { MarketPageHead } from "../../components/layout/MarketAppHeader";
import { useAuth } from "../../auth/AuthContext";
import { isBuyerRole, canAccessPipelineDesk } from "../../auth/permissions";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { FulfillmentCard } from "../../components/market/FulfillmentCard";
import { fetchMyMarketOrders, type FulfillmentJob } from "../../api/pipeline.api";

export function MarketOrdersPage() {
  const { token, user } = useAuth();
  const allowed = isBuyerRole(user) || canAccessPipelineDesk(user);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<FulfillmentJob[]>([]);

  const reload = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchMyMarketOrders(token);
      setOrders(res.orders);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load orders");
    } finally {
      setLoading(false);
    }
  }, [allowed, token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!allowed) {
    return (
      <div className="store-wrap pb-8">
        <MarketPageHead title="Orders" />
        <p className="text-sm text-[var(--store-muted)]">Buyer account required.</p>
      </div>
    );
  }

  return (
    <div className="store-wrap space-y-4 pb-8">
      <MarketPageHead
        title="My orders"
        action={
          <button type="button" className="store-text-link" onClick={() => void reload()}>
            Refresh
          </button>
        }
      />
      {loading ? (
        <SkeletonList rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void reload()} />
      ) : orders.length === 0 ? (
        <EmptyState title="No reservations yet" />
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <FulfillmentCard
              key={o.id}
              job={o}
              viewer={isBuyerRole(user) ? "buyer" : "ops"}
              token={token}
              onChanged={() => void reload()}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
