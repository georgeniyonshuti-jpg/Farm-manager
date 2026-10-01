import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../../auth/AuthContext";
import { useCompanyNav } from "../../../hooks/useCompanyNav";
import { useToast } from "../../../components/Toast";
import { ErrorState, SkeletonList } from "../../../components/LoadingSkeleton";
import {
  Button,
  DataTable,
  type DataColumn,
  SegmentedControl,
  StatusPill,
  TableToolbar,
} from "../../../components/ui";
import {
  fetchOpsCommissions,
  fetchWeighQueue,
  markCommissionPaid,
  voidCommission,
  type WeighQueueLot,
} from "../../../api/pipeline.api";
import { formatRwf } from "../../../lib/formatRwf";
import { sellingWeekLabel, visitBeforeLabel } from "../../../lib/sellingWeek";
import { DEMO_COMMISSIONS, DEMO_WEIGH, isMarketDemoEligibleError } from "./demoMarketData";
import { useMarketDemoFlag } from "./useMarketDemoFlag";

type Panel = "weigh" | "pay";

type Props = {
  panel: string;
  onPanelChange: (panel: string) => void;
};

type OpsCommission = Awaited<ReturnType<typeof fetchOpsCommissions>>["commissions"][number];

export function ScoutsPanel({ panel, onPanelChange }: Props) {
  const active: Panel = panel === "pay" ? "pay" : "weigh";

  return (
    <div className="space-y-stack">
      <SegmentedControl
        size="sm"
        value={active}
        onChange={(v) => onPanelChange(v)}
        options={[
          { value: "weigh", label: "Weigh" },
          { value: "pay", label: "Pay" },
        ]}
      />
      {active === "weigh" ? <WeighSubpanel /> : <PaySubpanel />}
    </div>
  );
}

function WeighSubpanel() {
  const { token, user } = useAuth();
  const { companyHref } = useCompanyNav();
  const navigate = useNavigate();
  const [apiFailed, setApiFailed] = useState(false);
  const demo = useMarketDemoFlag(apiFailed);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lots, setLots] = useState<WeighQueueLot[]>([]);
  const [dueThisWeek, setDueThisWeek] = useState(0);
  const [visitFeeRwf, setVisitFeeRwf] = useState(5000);

  const reload = useCallback(async () => {
    if (!token && !demo) return;
    setLoading(true);
    setError(null);
    try {
      if (demo) {
        setLots(DEMO_WEIGH);
        setDueThisWeek(DEMO_WEIGH.length);
        setVisitFeeRwf(5000);
        setApiFailed(false);
        return;
      }
      const res = await fetchWeighQueue(
        token,
        Boolean(user && (user.role === "superuser" || user.role === "sales_coordinator"))
      );
      setApiFailed(false);
      setLots(res.lots);
      setDueThisWeek(res.dueThisWeek);
      setVisitFeeRwf(res.visitFeeRwf);
    } catch (e) {
      if (isMarketDemoEligibleError(e)) {
        setApiFailed(true);
        return;
      }
      setError(e instanceof Error ? e.message : "Could not load weigh queue");
    } finally {
      setLoading(false);
    }
  }, [token, user, demo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const columns: DataColumn<WeighQueueLot>[] = useMemo(
    () => [
      {
        key: "farm",
        header: "Lot",
        sortable: true,
        render: (row) => (
          <div>
            <p className="font-semibold">
              {row.district || row.farmLabel || "Farm"} · {row.birdCount} birds
            </p>
            <p className="type-caption text-[var(--text-muted)]">
              {row.sellingWeekLabel || sellingWeekLabel(row.readyFrom, row.readyTo)}
            </p>
          </div>
        ),
      },
      {
        key: "due",
        header: "Visit by",
        render: (row) => visitBeforeLabel(row.readyFrom),
      },
      {
        key: "phase",
        header: "Status",
        badge: true,
        render: (row) => (
          <StatusPill tone={row.listingPhase === "visit_due" ? "warning" : "neutral"}>
            {row.listingPhase === "visit_due" ? "Due" : "Booked"}
          </StatusPill>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        className: "tbl-actions",
        render: (row) => (
          <Link
            to={companyHref(`/farm/pipeline/weigh/${row.id}`)}
            className="text-sm font-medium text-[var(--accent)] hover:underline"
          >
            Open
          </Link>
        ),
      },
    ],
    [companyHref]
  );

  if (loading) return <SkeletonList rows={3} />;
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;

  return (
    <div className="table-block">
      <DataTable
        flush
        columns={columns}
        rows={lots}
        rowKey={(r) => r.id}
        emptyTitle="No weigh visits due"
        toolbar={
          <TableToolbar
            meta={`${dueThisWeek} due this week · ${lots.length} on book · ${formatRwf(visitFeeRwf)} visit`}
            actions={
              lots[0] ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => navigate(companyHref(`/farm/pipeline/weigh/${lots[0].id}`))}
                >
                  Open next
                </Button>
              ) : null
            }
          />
        }
      />
    </div>
  );
}

function PaySubpanel() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [apiFailed, setApiFailed] = useState(false);
  const demo = useMarketDemoFlag(apiFailed);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<OpsCommission[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!token && !demo) return;
    setLoading(true);
    setError(null);
    try {
      if (demo) {
        setRows(DEMO_COMMISSIONS);
        setApiFailed(false);
        return;
      }
      const res = await fetchOpsCommissions(token, "accrued");
      setApiFailed(false);
      setRows(res.commissions);
    } catch (e) {
      if (isMarketDemoEligibleError(e)) {
        setApiFailed(true);
        return;
      }
      setError(e instanceof Error ? e.message : "Could not load commissions");
    } finally {
      setLoading(false);
    }
  }, [token, demo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function pay(id: string, kind: "visit" | "trade") {
    if (demo) {
      showToast("success", "Marked paid (demo)");
      setRows((r) => r.filter((x) => x.id !== id));
      return;
    }
    setBusyId(id);
    try {
      await markCommissionPaid(token, id, undefined, kind);
      showToast("success", "Marked paid");
      await reload();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Pay failed");
    } finally {
      setBusyId(null);
    }
  }

  async function voidRow(id: string, kind: "visit" | "trade") {
    if (demo) {
      showToast("success", "Voided (demo)");
      setRows((r) => r.filter((x) => x.id !== id));
      return;
    }
    setBusyId(id);
    try {
      await voidCommission(token, id, "Voided by ops", kind);
      showToast("success", "Voided");
      await reload();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Void failed");
    } finally {
      setBusyId(null);
    }
  }

  const columns: DataColumn<OpsCommission>[] = useMemo(
    () => [
      {
        key: "scout",
        header: "Scout",
        render: (r) => (
          <div>
            <p className="font-semibold">
              {formatRwf(Number(r.commissionAmountRwf || 0))} · {r.kind === "visit" ? "Visit" : "Trade"}
            </p>
            <p className="type-caption text-[var(--text-muted)]">
              {r.scoutName || "Scout"}
              {r.lotDistrict || r.lotFarmLabel ? ` · ${r.lotDistrict || r.lotFarmLabel}` : ""}
              {r.kind !== "visit" && r.buyerName ? ` · ${r.buyerName}` : ""}
              {r.birds ? ` · ${r.birds} birds` : ""}
            </p>
          </div>
        ),
      },
      {
        key: "status",
        header: "Status",
        badge: true,
        render: (r) => <StatusPill tone="warning">{r.commissionStatus}</StatusPill>,
      },
      {
        key: "actions",
        header: "Actions",
        className: "tbl-actions",
        render: (r) => (
          <div className="flex gap-1.5">
            <Button
              size="xs"
              variant="secondary"
              disabled={busyId === r.id}
              onClick={() => void pay(r.id, r.kind === "visit" ? "visit" : "trade")}
            >
              Mark paid
            </Button>
            <Button
              size="xs"
              variant="ghost"
              disabled={busyId === r.id}
              onClick={() => void voidRow(r.id, r.kind === "visit" ? "visit" : "trade")}
            >
              Void
            </Button>
          </div>
        ),
      },
    ],
    [busyId]
  );

  if (loading) return <SkeletonList rows={3} />;
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;

  return (
    <div className="table-block">
      <DataTable
        flush
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        emptyTitle="No unpaid commissions"
        toolbar={<TableToolbar meta={`${rows.length} unpaid`} />}
      />
    </div>
  );
}
