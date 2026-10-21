import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { canAccessPipelineDesk } from "../../auth/permissions";
import { PageHeader } from "../../components/PageHeader";
import { ManagerPage } from "../../components/layout/ManagerPage";
import { DataTable, FacetFilter, PageTabs, StatusPill, TableToolbar, ToolbarSearch, type DataColumn } from "../../components/ui";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import {
  RWANDA_DISTRICTS,
  RWANDA_PROVINCES,
  districtsInProvince,
  isSectorInDistrict,
  provinceForDistrict,
  sectorsInDistrict,
} from "../../lib/rwandaLocations";
import { fetchFlockBook, type FlockBookRow } from "../../api/pipeline.api";
import { flockDeskStatus, flockStatusLabel, placeLabel, type FlockDeskStatus } from "./flockDesk";
import { PricingPanel } from "./ops/PricingPanel";

const STATUS_TONE = {
  needs_review: "warning",
  verified: "success",
  with_scout: "info",
} as const;

export function FlockBook() {
  const { token, user } = useAuth();
  const { navTo } = useCompanyNav();
  const allowed = canAccessPipelineDesk(user);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<FlockBookRow[]>([]);
  const [status, setStatus] = useState<"" | FlockDeskStatus>("");
  const [province, setProvince] = useState("");
  const [district, setDistrict] = useState("");
  const [sector, setSector] = useState("");
  const [q, setQ] = useState("");
  const [showPrice, setShowPrice] = useState(false);

  const reload = useCallback(async () => {
    if (!token || !allowed) return;
    setLoading(true);
    setError(null);
    try {
      const book = await fetchFlockBook(token);
      setRows(book.flocks.filter((flock) => flock.status !== "cancelled" && flockDeskStatus(flock) != null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load flocks");
    } finally {
      setLoading(false);
    }
  }, [allowed, token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const located = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (district && row.district !== district) return false;
      if (!district && province && provinceForDistrict(row.district || "") !== province) return false;
      if (sector && row.sector !== sector) return false;
      if (!query) return true;
      const hay = [row.farmLabel, row.district, row.sector, row.registeredByName, row.assignedScoutName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(query);
    });
  }, [district, province, q, rows, sector]);

  const counts = useMemo(() => {
    const tally = { needs_review: 0, verified: 0, with_scout: 0 };
    for (const row of located) {
      const mark = flockDeskStatus(row);
      if (mark) tally[mark] += 1;
    }
    return tally;
  }, [located]);

  const visible = status ? located.filter((row) => flockDeskStatus(row) === status) : located;
  const narrowed = Boolean(q.trim() || province || district || sector || status);

  const columns = useMemo<DataColumn<FlockBookRow>[]>(
    () => [
      {
        key: "farm",
        header: "Farm",
        render: (row) => <span className="font-medium">{row.farmLabel || "Flock"}</span>,
      },
      {
        key: "birds",
        header: "Birds",
        numeric: true,
        render: (row) => row.birdCount.toLocaleString(),
      },
      {
        key: "place",
        header: "Place",
        render: (row) => placeLabel(row),
      },
      {
        key: "by",
        header: "Registered by",
        render: (row) => row.registeredByName || "—",
      },
      {
        key: "status",
        header: "Status",
        render: (row) => {
          const mark = flockDeskStatus(row);
          if (!mark) return "—";
          return <StatusPill tone={STATUS_TONE[mark]}>{flockStatusLabel(mark)}</StatusPill>;
        },
      },
      {
        key: "scout",
        header: "Scout",
        render: (row) => row.assignedScoutName || "—",
      },
    ],
    []
  );

  if (!allowed) {
    return (
      <ManagerPage>
        <PageHeader title="Flocks" />
        <p className="text-sm text-[var(--text-muted)]">Sales coordinator or superuser access required.</p>
      </ManagerPage>
    );
  }

  return (
    <ManagerPage>
      <PageHeader
        title="Flocks"
        secondaryAction={{
          label: showPrice ? "Close price board" : "Price board",
          onClick: () => setShowPrice((open) => !open),
        }}
        tabs={
          <PageTabs
            aria-label="Flock status"
            value={status}
            onChange={(value) => setStatus(value as "" | FlockDeskStatus)}
            options={[
              { value: "", label: "All", badge: located.length },
              { value: "needs_review", label: "Needs review", badge: counts.needs_review },
              { value: "verified", label: "Verified", badge: counts.verified },
              { value: "with_scout", label: "With a scout", badge: counts.with_scout },
            ]}
          />
        }
      />
      {loading ? <SkeletonList rows={4} /> : null}
      {error ? <ErrorState message={error} onRetry={() => void reload()} /> : null}
      {!loading && !error ? (
        <div className="table-block">
          <DataTable
            flush
            columns={columns}
            rows={visible}
            rowKey={(row) => row.id}
            onRowClick={(row) => navTo(`/farm/pipeline/flocks/${row.id}`)}
            isFiltered={narrowed}
            emptyTitle="No flocks are waiting"
            emptyDescription="New flocks show up here when a seller or scout registers them."
            filteredEmptyTitle="No flocks match"
            filteredEmptyDescription="Try another place or status."
            toolbar={
              <TableToolbar
                search={<ToolbarSearch value={q} placeholder="Farm, place, or person" onChange={(e) => setQ(e.target.value)} />}
                filters={
                  <>
                    <FacetFilter
                      label="Province"
                      value={province}
                      allValue=""
                      allLabel="All provinces"
                      onChange={(next) => {
                        setProvince(next);
                        if (next && district && provinceForDistrict(district) !== next) {
                          setDistrict("");
                          setSector("");
                        }
                      }}
                      options={RWANDA_PROVINCES.map((item) => ({ value: item.name, label: item.name }))}
                    />
                    <FacetFilter
                      label="District"
                      value={district}
                      allValue=""
                      allLabel="All districts"
                      onChange={(next) => {
                        setDistrict(next);
                        if (!isSectorInDistrict(next, sector)) setSector("");
                      }}
                      options={(province ? districtsInProvince(province) : RWANDA_DISTRICTS).map((name) => ({
                        value: name,
                        label: name,
                      }))}
                    />
                    {district ? (
                      <FacetFilter
                        label="Sector"
                        value={sector}
                        allValue=""
                        allLabel="All sectors"
                        onChange={setSector}
                        options={sectorsInDistrict(district).map((name) => ({ value: name, label: name }))}
                      />
                    ) : null}
                  </>
                }
                meta={<span>{visible.length}</span>}
              />
            }
          />
        </div>
      ) : null}
      {showPrice ? (
        <section className="mt-6">
          <PricingPanel />
        </section>
      ) : null}
    </ManagerPage>
  );
}
