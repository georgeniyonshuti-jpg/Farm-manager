import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { canAccessPipelineDesk } from "../../auth/permissions";
import { PageHeader } from "../../components/PageHeader";
import { ManagerPage } from "../../components/layout/ManagerPage";
import { Button, DataTable, FacetFilter, Input, PageTabs, Select, StatusPill, TableToolbar, ToolbarSearch, type DataColumn } from "../../components/ui";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { createRecruitmentContact, fetchRecruitmentQueue, type RecruitmentContact } from "../../api/marketInsights.api";
import {
  RWANDA_DISTRICTS,
  RWANDA_PROVINCES,
  districtsInProvince,
  isSectorInDistrict,
  provinceForDistrict,
  sectorsInDistrict,
} from "../../lib/rwandaLocations";
import { kycWaiting, listingState, PEOPLE_SORTS, PEOPLE_WANTS, RECRUITMENT_STAGES, stageLabel, wantLabel } from "./people/peopleWork";

type Lane = "recruitment" | "active";

export function PeopleBook() {
  const { token, user } = useAuth();
  const { companyHref, navTo } = useCompanyNav();
  const { showToast } = useToast();
  const allowed = canAccessPipelineDesk(user);
  const [lane, setLane] = useState<Lane>("recruitment");
  const [want, setWant] = useState("");
  const [district, setDistrict] = useState("");
  const [owner, setOwner] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [kyc, setKyc] = useState("");
  const [sort, setSort] = useState("newest");
  const [q, setQ] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [activeWant, setActiveWant] = useState("");
  const [activeProvince, setActiveProvince] = useState("");
  const [activeDistrict, setActiveDistrict] = useState("");
  const [activeSector, setActiveSector] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<RecruitmentContact[]>([]);
  const [owners, setOwners] = useState<Array<{ id: string | null; name: string }>>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", phone: "", district: "", want: "sell" });

  const reload = useCallback(async () => {
    if (!token || !allowed) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRecruitmentQueue(
        token,
        lane === "active"
          ? { lane, q: activeSearch, want: activeWant }
          : { lane, want, district, owner, overdue, kyc, sort, q }
      );
      setRows(data.contacts || []);
      setOwners(data.owners || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load people");
    } finally {
      setLoading(false);
    }
  }, [activeSearch, activeWant, allowed, district, kyc, lane, overdue, owner, q, sort, token, want]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const activeColumns = useMemo<DataColumn<RecruitmentContact>[]>(
    () => [
      {
        key: "name",
        header: "Person",
        render: (row) => (
          <span className="inline-flex items-center gap-2 font-medium">
            {row.name || row.phone}
            {row.detailsEditedAt ? <StatusPill tone="warning">Edited</StatusPill> : null}
          </span>
        ),
      },
      {
        key: "type",
        header: "Type",
        render: (row) => wantLabel(row.want),
      },
      {
        key: "district",
        header: "District",
        render: (row) => row.district || "—",
      },
      {
        key: "phone",
        header: "Phone",
        render: (row) => row.phone,
      },
      {
        key: "listing",
        header: "Flocks",
        render: (row) => {
          const state = listingState(row);
          if (!state) return "—";
          const tone = state === "Listed" ? "success" : "warning";
          return <StatusPill tone={tone}>{state}</StatusPill>;
        },
      },
      {
        key: "last",
        header: "Last contact",
        render: (row) => dayLabel(row.lastTouchAt),
      },
      {
        key: "next",
        header: "Next follow-up",
        render: (row) => (
          <span className={row.overdue ? "font-semibold text-[var(--status-warning)]" : undefined}>
            {dayLabel(row.nextCallAt)}
          </span>
        ),
      },
    ],
    []
  );

  const activeRows = useMemo(() => {
    return rows.filter((row) => {
      if (activeDistrict && row.district !== activeDistrict) return false;
      if (!activeDistrict && activeProvince && provinceForDistrict(row.district || "") !== activeProvince) return false;
      if (activeSector && row.sector !== activeSector) return false;
      return true;
    });
  }, [activeDistrict, activeProvince, activeSector, rows]);

  const grouped = useMemo(() => {
    const buckets = new Map<string, RecruitmentContact[]>();
    for (const item of RECRUITMENT_STAGES) buckets.set(item[0], []);
    for (const row of rows) {
      const key = buckets.has(row.stage) ? row.stage : "application";
      buckets.get(key)?.push(row);
    }
    return buckets;
  }, [rows]);

  async function addPerson() {
    if (!token) return;
    try {
      await createRecruitmentContact(token, draft);
      setAdding(false);
      setDraft({ name: "", phone: "", district: "", want: "sell" });
      showToast("success", "Added to Application");
      await reload();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not add this person");
    }
  }

  if (!allowed) {
    return (
      <ManagerPage>
        <PageHeader title="People" />
        <p className="text-sm text-[var(--text-secondary)]">Sales coordinator or superuser access required.</p>
      </ManagerPage>
    );
  }

  return (
    <ManagerPage>
      <PageHeader
        title="People"
        tabs={
          <PageTabs
            value={lane}
            aria-label="People"
            onChange={(value) => setLane(value as Lane)}
            options={[
              { value: "recruitment", label: "Recruitment" },
              { value: "active", label: "Active people" },
            ]}
          />
        }
        action={
          lane === "recruitment" ? (
            <Button size="sm" onClick={() => setAdding((open) => !open)}>
              Add person
            </Button>
          ) : null
        }
      />
      {lane === "recruitment" ? (
      <TableToolbar
        search={<ToolbarSearch value={q} placeholder="Name or phone" onChange={(e) => setQ(e.target.value)} />}
        filters={
          <>
            <FacetFilter
              label="Type"
              value={want}
              allValue=""
              onChange={setWant}
              options={PEOPLE_WANTS.map(([value, label]) => ({ value, label }))}
            />
            <FacetFilter
              label="District"
              value={district}
              allValue=""
              onChange={setDistrict}
              options={RWANDA_DISTRICTS.map((name) => ({ value: name, label: name }))}
            />
            <FacetFilter
              label="Owner"
              value={owner}
              allValue=""
              onChange={setOwner}
              options={[
                { value: "unassigned", label: "Unassigned" },
                ...owners.filter((item) => item.id).map((item) => ({ value: item.id as string, label: item.name })),
              ]}
            />
            <FacetFilter
              label="Calls"
              value={overdue ? "overdue" : ""}
              allValue=""
              onChange={(value) => setOverdue(value === "overdue")}
              options={[{ value: "overdue", label: "Overdue" }]}
            />
            <FacetFilter
              label="KYC"
              value={kyc}
              allValue=""
              onChange={setKyc}
              options={[{ value: "review", label: "Waiting for review" }]}
            />
            <FacetFilter
              label="Sort"
              value={sort}
              allValue="newest"
              allLabel="Newest"
              onChange={setSort}
              options={PEOPLE_SORTS.filter((item) => item[0] !== "newest").map(([value, label]) => ({ value, label }))}
            />
          </>
        }
        meta={<span>{rows.length}</span>}
      />
      ) : null}
      {adding ? (
        <form
          className="mb-4 grid gap-2 rounded-xl border border-[var(--border-color)] p-3 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            void addPerson();
          }}
        >
          <Input required placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <Input required placeholder="Phone" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
          <Select value={draft.district} onChange={(e) => setDraft({ ...draft, district: e.target.value })}>
            <option value="">District</option>
            {RWANDA_DISTRICTS.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </Select>
          <div className="flex gap-2">
            <Select value={draft.want} onChange={(e) => setDraft({ ...draft, want: e.target.value })}>
              {PEOPLE_WANTS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
            <Button type="submit" size="sm">Save</Button>
          </div>
        </form>
      ) : null}
      {loading ? <SkeletonList rows={4} /> : null}
      {error ? <ErrorState message={error} onRetry={() => void reload()} /> : null}
      {lane === "recruitment" && !loading && !error && rows.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--text-secondary)]">Nobody is in this list.</p>
      ) : null}
      {lane === "recruitment" && !loading && !error ? (
        <div className="mt-3 flex gap-3 overflow-x-auto pb-3">
          {RECRUITMENT_STAGES.map(([value, label]) => {
            const people = grouped.get(value) || [];
            return (
              <section key={value} className="flex max-h-[calc(100vh-11rem)] w-72 shrink-0 flex-col rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)]">
                <h2 className="flex items-center justify-between gap-2 border-b border-[var(--border-color)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]">
                  {label}
                  <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-[var(--surface-subtle)] px-2 text-xs">{people.length}</span>
                </h2>
                <ul className="space-y-2 overflow-y-auto p-2">
                  {people.map((row) => (
                    <PersonLink key={row.id} row={row} href={companyHref(`/farm/pipeline/people/${row.id}`)} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : null}
      {lane === "active" && !loading && !error ? (
        <div className="table-block mt-3">
          <DataTable
            flush
            columns={activeColumns}
            rows={activeRows}
            rowKey={(row) => row.id}
            onRowClick={(row) => navTo(`/farm/pipeline/people/${row.id}`)}
            isFiltered={Boolean(activeSearch.trim() || activeWant || activeProvince || activeDistrict || activeSector)}
            emptyTitle="No active people yet"
            emptyDescription="People show up here after their contract, location, mobile money, and ID are approved."
            filteredEmptyTitle="No matching people"
            filteredEmptyDescription="Try another type, place, or name."
            toolbar={
              <TableToolbar
                search={
                  <ToolbarSearch
                    value={activeSearch}
                    placeholder="Name or phone"
                    onChange={(e) => setActiveSearch(e.target.value)}
                  />
                }
                filters={
                  <>
                    <FacetFilter
                      label="Type"
                      value={activeWant}
                      allValue=""
                      allLabel="All types"
                      onChange={setActiveWant}
                      options={PEOPLE_WANTS.map(([value, label]) => ({ value, label }))}
                    />
                    <FacetFilter
                      label="Province"
                      value={activeProvince}
                      allValue=""
                      allLabel="All provinces"
                      onChange={(next) => {
                        setActiveProvince(next);
                        if (next && activeDistrict && provinceForDistrict(activeDistrict) !== next) {
                          setActiveDistrict("");
                          setActiveSector("");
                        }
                      }}
                      options={RWANDA_PROVINCES.map((item) => ({ value: item.name, label: item.name }))}
                    />
                    <FacetFilter
                      label="District"
                      value={activeDistrict}
                      allValue=""
                      allLabel="All districts"
                      onChange={(next) => {
                        setActiveDistrict(next);
                        if (!isSectorInDistrict(next, activeSector)) setActiveSector("");
                      }}
                      options={(activeProvince ? districtsInProvince(activeProvince) : RWANDA_DISTRICTS).map((name) => ({
                        value: name,
                        label: name,
                      }))}
                    />
                    {activeDistrict ? (
                      <FacetFilter
                        label="Sector"
                        value={activeSector}
                        allValue=""
                        allLabel="All sectors"
                        onChange={setActiveSector}
                        options={sectorsInDistrict(activeDistrict).map((name) => ({ value: name, label: name }))}
                      />
                    ) : null}
                  </>
                }
                meta={<span>{activeRows.length}</span>}
              />
            }
          />
        </div>
      ) : null}
    </ManagerPage>
  );
}

function dayLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function PersonLink({ row, href }: { row: RecruitmentContact; href: string }) {
  return (
    <li>
      <Link to={href} className="block rounded-lg border border-[var(--border-color)] bg-[var(--surface-elevated)] px-3 py-2 hover:border-[var(--primary-color)]">
        <p className="flex flex-wrap items-center gap-2 font-semibold text-[var(--text-primary)]">
          <span>{row.name || row.phone}</span>
          {row.detailsEditedAt ? <StatusPill tone="warning">Edited</StatusPill> : null}
        </p>
        <p className="text-sm text-[var(--text-secondary)]">
          {[wantLabel(row.want), row.district || "No district", row.phone, stageLabel(row.stage)].filter(Boolean).join(" · ")}
        </p>
        {row.overdue ? <p className="text-xs font-semibold text-[var(--status-warning)]">Call is overdue</p> : null}
        {kycWaiting(row) ? <p className="text-xs font-semibold text-[var(--status-warning)]">KYC waiting for review</p> : null}
      </Link>
    </li>
  );
}
