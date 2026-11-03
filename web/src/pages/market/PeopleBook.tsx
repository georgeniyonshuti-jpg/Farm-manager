import { useCallback, useEffect, useMemo, useState } from "react";
import { usePageActive } from "../../components/layout/PageActiveContext";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { canWorkRecruitment } from "../../auth/permissions";
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
import { cardBadge, CONTACT_STATUSES, contractBadgeLabel, deskPlacement, KYC_STATUSES, listingState, liveSellerWarning, PEOPLE_SORTS, PEOPLE_WANTS, RECRUITMENT_STAGES, wantLabel } from "./people/peopleWork";
import { setBoardRows, useBoardRevision, useMovingIds, useRecruitmentBoard } from "./people/recruitmentBoard";

type Lane = "recruitment" | "active";

export function PeopleBook() {
  const { token, user } = useAuth();
  const { companyHref, navTo } = useCompanyNav();
  const { showToast } = useToast();
  const pageActive = usePageActive();
  const boardRevision = useBoardRevision();
  const movingIds = useMovingIds();
  const rows = useRecruitmentBoard();
  const allowed = canWorkRecruitment(user);
  const recruitmentOnly = user?.role === "sales_officer";
  const [lane, setLane] = useState<Lane>("recruitment");
  const [want, setWant] = useState("");
  const [district, setDistrict] = useState("");
  const [owner, setOwner] = useState("");
  const [calls, setCalls] = useState("");
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
  const [owners, setOwners] = useState<Array<{ id: string | null; name: string }>>([]);
  const [adding, setAdding] = useState(false);
  const [addNotice, setAddNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", phone: "", district: "", want: "sell" });

  const reload = useCallback(async () => {
    if (!token || !allowed) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRecruitmentQueue(
        token,
        recruitmentOnly || lane !== "active"
          ? {
              lane: "recruitment",
              want,
              district,
              owner,
              overdue: calls === "overdue",
              deskStatus: calls && calls !== "overdue" ? calls : "",
              kyc,
              sort,
              q,
            }
          : { lane, q: activeSearch, want: activeWant }
      );
      setBoardRows(data.contacts || []);
      setOwners(data.owners || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load people");
    } finally {
      setLoading(false);
    }
  }, [activeSearch, activeWant, allowed, calls, district, kyc, lane, owner, q, recruitmentOnly, sort, token, want]);

  useEffect(() => {
    if (!pageActive) return;
    void reload();
  }, [pageActive, boardRevision, reload]);

  useEffect(() => {
    if (!pageActive) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, 20000);
    return () => window.clearInterval(id);
  }, [pageActive, reload]);

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
      const key = deskPlacement(row.stage, row.deskStatus).stage;
      buckets.get(buckets.has(key) ? key : "application")?.push(row);
    }
    return buckets;
  }, [rows]);

  async function addPerson() {
    if (!token) return;
    setAddNotice(null);
    try {
      const saved = await createRecruitmentContact(token, draft);
      const note = liveSellerWarning(saved.contact || null);
      setAdding(false);
      setDraft({ name: "", phone: "", district: "", want: "sell" });
      showToast(note ? "info" : "success", note || "Added to Application");
      await reload();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not add this person";
      setAddNotice(message);
      showToast("error", message);
    }
  }

  if (!allowed) {
    return (
      <ManagerPage>
        <PageHeader title="People" />
        <p className="text-sm text-[var(--text-secondary)]">Sales officer, sales coordinator, or superuser access required.</p>
      </ManagerPage>
    );
  }

  return (
    <ManagerPage>
      <PageHeader
        title="People"
        tabs={
          recruitmentOnly ? undefined : (
          <PageTabs
            value={lane}
            aria-label="People"
            onChange={(value) => setLane(value as Lane)}
            options={[
              { value: "recruitment", label: "Recruitment" },
              { value: "active", label: "Active people" },
            ]}
          />
          )
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
              value={calls}
              allValue=""
              onChange={setCalls}
              options={[
                ...CONTACT_STATUSES.map(([value, label]) => ({ value, label })),
                { value: "overdue", label: "Overdue" },
              ]}
            />
            <FacetFilter
              label="KYC"
              value={kyc}
              allValue=""
              onChange={setKyc}
              options={[
                ...KYC_STATUSES.map(([value, label]) => ({ value, label })),
                { value: "review", label: "Waiting for review" },
              ]}
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
          {addNotice ? <p className="sm:col-span-4 text-sm text-[var(--status-warning)]">{addNotice}</p> : null}
        </form>
      ) : null}
      {loading && rows.length === 0 ? <SkeletonList rows={4} /> : null}
      {error ? <ErrorState message={error} onRetry={() => void reload()} /> : null}
      {lane === "recruitment" && !loading && !error && rows.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--text-secondary)]">Nobody is in this list.</p>
      ) : null}
      {lane === "recruitment" && !(loading && rows.length === 0) && !error ? (
        <div className="mt-3 flex gap-4 overflow-x-auto pb-3">
          {RECRUITMENT_STAGES.map(([value, label]) => {
            const people = grouped.get(value) || [];
            const empty = people.length === 0;
            return (
              <section
                key={value}
                className={
                  empty
                    ? "flex w-28 shrink-0 flex-col rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] opacity-70"
                    : "flex max-h-[calc(100vh-11rem)] w-72 shrink-0 flex-col rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)]"
                }
              >
                <h2 className="flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-[var(--text-secondary)]">
                  <span>{label}</span>
                  <span>{people.length}</span>
                </h2>
                {empty ? null : (
                  <ul className="space-y-3 overflow-y-auto p-2">
                    {people.map((row) => (
                      <PersonLink key={row.id} row={row} href={companyHref(`/farm/pipeline/people/${row.id}`)} moving={movingIds.has(row.id)} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : null}
      {lane === "active" && !(loading && rows.length === 0) && !error ? (
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

const ROLE_DOT: Record<string, string> = {
  sell: "bg-[var(--primary-color)]",
  buy: "bg-[var(--status-info)]",
  scout: "bg-[var(--text-muted)]",
};

function PersonLink({ row, href, moving }: { row: RecruitmentContact; href: string; moving?: boolean }) {
  const badge = cardBadge(row);
  const calls = row.stage === "contact" ? Number(row.callCount || 0) : 0;
  const notes = [
    row.stage === "kyc" || row.contractStatus ? contractBadgeLabel(row) : null,
    calls > 0 ? (calls === 1 ? "1 call" : `${calls} calls`) : null,
    row.detailsEditedAt ? "Edited" : null,
    liveSellerWarning(row) ? "Live seller" : null,
  ].filter((note): note is string => Boolean(note));
  return (
    <li>
      <Link
        to={href}
        aria-disabled={moving || undefined}
        tabIndex={moving ? -1 : undefined}
        onClick={moving ? (event) => event.preventDefault() : undefined}
        className={`group block rounded-lg border border-[var(--border-color)] bg-[var(--surface-elevated)] px-3 py-2.5 hover:border-[var(--primary-color)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color)] focus-visible:ring-offset-2 ${moving ? "pointer-events-none opacity-60" : ""}`}
      >
        <p className="truncate font-semibold text-[var(--text-primary)]">{row.name || row.phone}</p>
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ROLE_DOT[row.want] || "bg-[var(--text-muted)]"}`} aria-hidden="true" />
          <span className="truncate">{wantLabel(row.want)} · {row.district || "No district"}</span>
        </p>
        {row.name && row.phone ? (
          <p className="mt-0.5 truncate whitespace-nowrap text-xs text-[var(--text-secondary)]">{row.phone}</p>
        ) : null}
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {notes.map((note) => (
              <span key={note} title={note} aria-label={note} className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--text-muted)]" />
            ))}
            {notes.length > 0 ? (
              <span className="hidden truncate text-xs text-[var(--text-secondary)] group-hover:inline">{notes.join(" · ")}</span>
            ) : null}
          </div>
          {badge ? (
            <StatusPill sentence tone={badge.tone} className="shrink-0">
              {badge.label}
            </StatusPill>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
