/**
 * Provision Market Command Center in Superset:
 *  - Farm Postgres database connection
 *  - Virtual datasets from production/superset/market/sql
 *  - Charts + pack dashboards (Overview, Supply, Demand, Scouts, Sales, Acquisition, Recruitment)
 *  - Embedding enabled for farm.cleva.rw
 *
 * Usage (on Hetzner, with Superset attached to clevafarm network):
 *   SUPERSET_URL=https://bi.clevacredit.com \
 *   SUPERSET_USERNAME=admin SUPERSET_PASSWORD=… \
 *   SUPERSET_FARM_SQLALCHEMY_URI='postgresql+psycopg2://clevafarm:PASS@farm-postgres:5432/clevafarm' \
 *   node scripts/provisionMarketSuperset.js
 *
 * Or set SUPERSET_FARM_DATABASE_ID if the DB already exists.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.resolve(__dirname, "../../production/superset/market/sql");

const EMBED_ORIGINS = (
  process.env.SUPERSET_EMBED_ORIGINS ||
  "https://farm.cleva.rw,https://pos.cleva.rw,https://erp.clevacredit.com,https://cig.cleva.rw"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const MARKET_CSS = `
/* Cleva Market embed — matches Farm Trends shell */
.dashboard-header,
.header-controls,
.dashboard-component-header .header-title,
.filter-bar__collapse-button,
.dashboard-filter-bar {
  display: none !important;
}
.dashboard {
  background: transparent !important;
}
.grid-content,
.dashboard-content {
  background: transparent !important;
  margin: 0 !important;
  padding: 0 0 8px 0 !important;
}
.dashboard-markdown .markdown-content {
  font-family: "DM Sans", system-ui, sans-serif !important;
  color: #334155 !important;
}
.dashboard-component-chart {
  box-shadow: none !important;
  border-radius: 10px !important;
  overflow: hidden;
}
.chart-slice {
  background: #ffffff !important;
}
.ant-tabs-nav { margin-bottom: 8px !important; }
.ant-tabs-tab {
  font-family: "DM Sans", system-ui, sans-serif !important;
  font-weight: 600 !important;
}
.ant-tabs-tab-active .ant-tabs-tab-btn { color: #1d9e75 !important; }
.ant-tabs-ink-bar { background: #1d9e75 !important; }
`;

const DATASETS = [
  { key: "overview_kpis", table_name: "Market — Overview KPIs", file: "overview_kpis.sql" },
  { key: "gmv_weekly", table_name: "Market — GMV Weekly", file: "gmv_weekly.sql" },
  { key: "region_liquidity", table_name: "Market — Region Liquidity", file: "region_liquidity.sql" },
  { key: "supply_funnel", table_name: "Market — Supply Funnel", file: "supply_funnel.sql" },
  { key: "demand_funnel", table_name: "Market — Demand Funnel", file: "demand_funnel.sql" },
  { key: "scout_leaderboard", table_name: "Market — Scout Leaderboard", file: "scout_leaderboard.sql" },
  { key: "sales_channel", table_name: "Market — Sales Channel", file: "sales_channel.sql" },
  { key: "acquisition_weekly", table_name: "Market — Acquisition Weekly", file: "acquisition_weekly.sql" },
  { key: "acquisition_accounts", table_name: "Market — Acquisition Accounts", file: "acquisition_accounts.sql" },
  { key: "recruitment_tiles", table_name: "Market — Recruitment Tiles", file: "recruitment_tiles.sql" },
  { key: "recruitment_pipeline", table_name: "Market — Recruitment Pipeline", file: "recruitment_pipeline.sql" },
  { key: "recruitment_sources", table_name: "Market — Recruitment Sources", file: "recruitment_sources.sql" },
  { key: "recruitment_scouts", table_name: "Market — Recruitment Scouts", file: "recruitment_scouts.sql" },
  { key: "recruitment_weekly", table_name: "Market — Recruitment Weekly", file: "recruitment_weekly.sql" },
  { key: "recruitment_queue", table_name: "Market — Recruitment Queue", file: "recruitment_queue.sql" },
  { key: "recruitment_stage_counts", table_name: "Market — Recruitment Stage Counts", file: "recruitment_stage_counts.sql" },
  { key: "recruitment_wait", table_name: "Market — Recruitment Wait", file: "recruitment_wait.sql" },
  { key: "recruitment_worklist", table_name: "Market — Recruitment Work List", file: "recruitment_worklist.sql" },
  { key: "recruitment_interview_results", table_name: "Market — Recruitment Interview Results", file: "recruitment_interview_results.sql" },
  { key: "recruitment_interviewers", table_name: "Market — Recruitment Interviewers", file: "recruitment_interviewers.sql" },
  { key: "recruitment_birds", table_name: "Market — Recruitment Birds", file: "recruitment_birds.sql" },
  { key: "recruitment_handoff", table_name: "Market — Recruitment Handoff", file: "recruitment_handoff.sql" },
];

function trimBase(url) {
  return String(url || "").replace(/\/+$/, "");
}

function sqlMetric(label, expression, optionName) {
  return {
    expressionType: "SQL",
    sqlExpression: expression,
    label,
    hasCustomLabel: true,
    optionName: optionName || `metric_${label.replace(/\W+/g, "_").toLowerCase()}`,
  };
}

function simpleMetric(column, aggregate, label) {
  return {
    expressionType: "SIMPLE",
    column: { column_name: column },
    aggregate,
    label,
    hasCustomLabel: true,
  };
}

async function login(base) {
  const existing = String(process.env.SUPERSET_ACCESS_TOKEN || "").trim();
  if (existing) return { accessToken: existing, csrf: "", cookies: "" };
  const username = String(process.env.SUPERSET_USERNAME || "").trim();
  const password = String(process.env.SUPERSET_PASSWORD || "").trim();
  if (!username || !password) {
    throw new Error("Set SUPERSET_ACCESS_TOKEN or SUPERSET_USERNAME + SUPERSET_PASSWORD");
  }
  const res = await fetch(`${base}/api/v1/security/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, provider: "db", refresh: true }),
  });
  const body = await res.json().catch(() => ({}));
  const accessToken = body?.access_token;
  if (!res.ok || !accessToken) throw new Error(body?.message || "Superset login failed");

  const csrfRes = await fetch(`${base}/api/v1/security/csrf_token/`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  const csrfBody = await csrfRes.json().catch(() => ({}));
  const csrf = csrfBody?.result || csrfBody?.csrf_token || "";
  const cookies = [csrfRes.headers.getSetCookie?.() || [], String(csrfRes.headers.get("set-cookie") || "")]
    .flat()
    .filter(Boolean)
    .map((c) => String(c).split(";")[0])
    .join("; ");

  return { accessToken, csrf, cookies };
}

async function api(base, auth, method, pathName, body) {
  const headers = {
    Authorization: `Bearer ${auth.accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (auth.csrf && method !== "GET") {
    headers["X-CSRFToken"] = auth.csrf;
    headers.Referer = base;
  }
  if (auth.cookies) headers.Cookie = auth.cookies;

  const res = await fetch(`${base}${pathName}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

async function findDatabaseId(base, token, name) {
  const q = encodeURIComponent(
    JSON.stringify({
      filters: [{ col: "database_name", opr: "eq", value: name }],
      page_size: 5,
    })
  );
  const { ok, json } = await api(base, token, "GET", `/api/v1/database/?q=${q}`);
  if (!ok) return null;
  const row = (json?.result || [])[0];
  return row?.id ?? null;
}

async function ensureDatabase(base, token) {
  const fromEnv = Number(process.env.SUPERSET_FARM_DATABASE_ID);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;

  const name = process.env.SUPERSET_FARM_DATABASE_NAME || "Cleva Farm Postgres";
  const existing = await findDatabaseId(base, token, name);
  if (existing) {
    console.log(`✓ database exists id=${existing} (${name})`);
    return existing;
  }

  const uri = String(process.env.SUPERSET_FARM_SQLALCHEMY_URI || "").trim();
  if (!uri) {
    throw new Error(
      "Set SUPERSET_FARM_DATABASE_ID or SUPERSET_FARM_SQLALCHEMY_URI (postgresql+psycopg2://…@farm-postgres:5432/clevafarm)"
    );
  }

  const { ok, status, json } = await api(base, token, "POST", "/api/v1/database/", {
    database_name: name,
    sqlalchemy_uri: uri,
    expose_in_sqllab: true,
    allow_ctas: false,
    allow_cvas: false,
    allow_dml: false,
    allow_run_async: true,
    extra: JSON.stringify({
      allows_virtual_table_explore: true,
      engine_params: { connect_args: { connect_timeout: 10 } },
    }),
  });
  const id = json?.id ?? json?.result?.id;
  if (!ok || !id) {
    throw new Error(`Create database failed (${status}): ${JSON.stringify(json).slice(0, 400)}`);
  }
  console.log(`✓ database created id=${id} (${name})`);
  return id;
}

async function findDatasetId(base, token, tableName) {
  const q = encodeURIComponent(
    JSON.stringify({
      filters: [{ col: "table_name", opr: "eq", value: tableName }],
      page_size: 5,
    })
  );
  const { ok, json } = await api(base, token, "GET", `/api/v1/dataset/?q=${q}`);
  if (!ok) return null;
  const row = (json?.result || []).find((r) => r.table_name === tableName);
  return row?.id ?? null;
}

async function ensureDataset(base, token, databaseId, ds) {
  const sql = fs.readFileSync(path.join(SQL_DIR, ds.file), "utf8").trim().replace(/;\s*$/, "");
  const existing = await findDatasetId(base, token, ds.table_name);
  if (existing) {
    const { ok, status, json } = await api(base, token, "PUT", `/api/v1/dataset/${existing}`, {
      sql,
      database_id: databaseId,
      schema: process.env.SUPERSET_FARM_SCHEMA || "public",
    });
    if (!ok) {
      console.warn(`  refresh ${ds.table_name} failed (${status}):`, JSON.stringify(json).slice(0, 160));
    } else {
      console.log(`✓ dataset refresh ${ds.table_name} id=${existing}`);
    }
    // refresh columns
    await api(base, token, "PUT", `/api/v1/dataset/${existing}/refresh`, {});
    return existing;
  }

  const { ok, status, json } = await api(base, token, "POST", "/api/v1/dataset/", {
    database: databaseId,
    schema: process.env.SUPERSET_FARM_SCHEMA || "public",
    table_name: ds.table_name,
    sql,
  });
  const id = json?.id ?? json?.result?.id;
  if (!ok || !id) {
    throw new Error(`Dataset ${ds.table_name} failed (${status}): ${JSON.stringify(json).slice(0, 300)}`);
  }
  await api(base, token, "PUT", `/api/v1/dataset/${id}/refresh`, {});
  console.log(`✓ dataset ${ds.table_name} id=${id}`);
  return id;
}

async function findChartId(base, token, sliceName) {
  const q = encodeURIComponent(
    JSON.stringify({
      filters: [{ col: "slice_name", opr: "eq", value: sliceName }],
      page_size: 5,
    })
  );
  const { ok, json } = await api(base, token, "GET", `/api/v1/chart/?q=${q}`);
  if (!ok) return null;
  return (json?.result || [])[0]?.id ?? null;
}

async function upsertChart(base, token, { slice_name, datasource_id, viz_type, params }) {
  const body = {
    slice_name,
    datasource_id,
    datasource_type: "table",
    viz_type,
    params: JSON.stringify({
      ...params,
      datasource: `${datasource_id}__table`,
      viz_type,
      color_scheme: params.color_scheme || "clevaFarm",
    }),
  };
  const existing = await findChartId(base, token, slice_name);
  if (existing) {
    const { ok, status, json } = await api(base, token, "PUT", `/api/v1/chart/${existing}`, body);
    if (!ok) {
      console.warn(`  chart update ${slice_name} (${status}):`, JSON.stringify(json).slice(0, 200));
      return existing;
    }
    console.log(`✓ chart refresh ${slice_name} id=${existing}`);
    return existing;
  }
  const { ok, status, json } = await api(base, token, "POST", "/api/v1/chart/", body);
  const id = json?.id ?? json?.result?.id;
  if (!ok || !id) {
    throw new Error(`Chart ${slice_name} failed (${status}): ${JSON.stringify(json).slice(0, 300)}`);
  }
  console.log(`✓ chart ${slice_name} id=${id}`);
  return id;
}

function heroMarkdown(title, subtitle, gradient = "linear-gradient(135deg,#14532d 0%,#1d9e75 55%,#86efac 100%)") {
  return `<div style="padding:12px 16px;border-radius:12px;background:${gradient};color:#fff;font-family:system-ui,sans-serif"><div style="font-size:16px;font-weight:700;letter-spacing:.02em">${title}</div><div style="opacity:.92;font-size:13px;margin-top:4px;font-weight:500">${subtitle}</div></div>`;
}

function bandMarkdown(title, detail, gradient) {
  return `<div style="padding:10px 14px;border-radius:12px;background:${gradient};color:#fff;font-family:system-ui,sans-serif"><div style="font-size:14px;font-weight:700">${title}</div><div style="opacity:.92;font-size:12px;margin-top:2px">${detail}</div></div>`;
}

function buildPositions(slug, title, hero, chartRows) {
  /** @type {Record<string, unknown>} */
  const pos = {
    DASHBOARD_VERSION: "v2",
    ROOT_ID: { type: "ROOT", id: "ROOT_ID", children: ["GRID_ID"] },
    GRID_ID: { type: "GRID", id: "GRID_ID", children: [], parents: ["ROOT_ID"] },
    HEADER_ID: { id: "HEADER_ID", type: "HEADER", meta: { text: title } },
  };
  const gridChildren = /** @type {string[]} */ (pos.GRID_ID.children);

  const mdId = `${slug}-MD-hero`;
  const row0 = `${slug}-ROW-0`;
  pos[mdId] = {
    type: "MARKDOWN",
    id: mdId,
    children: [],
    parents: [row0],
    meta: { width: 12, height: 8, code: hero },
  };
  pos[row0] = {
    type: "ROW",
    id: row0,
    children: [mdId],
    parents: ["GRID_ID"],
    meta: { background: "BACKGROUND_TRANSPARENT" },
  };
  gridChildren.push(row0);

  chartRows.forEach((row, ri) => {
    const rowId = `${slug}-ROW-${ri + 1}`;
    const childIds = [];
    row.forEach((cell, ci) => {
      if (cell.markdown) {
        const mdId = `${slug}-MD-${ri + 1}-${ci}`;
        pos[mdId] = {
          type: "MARKDOWN",
          id: mdId,
          children: [],
          parents: [rowId],
          meta: { width: cell.width, height: cell.height, code: cell.markdown },
        };
        childIds.push(mdId);
        return;
      }
      const chartNodeId = `CHART-${cell.id}-${slug}-${ri}-${ci}`;
      pos[chartNodeId] = {
        type: "CHART",
        id: chartNodeId,
        children: [],
        parents: [rowId],
        meta: {
          width: cell.width,
          height: cell.height,
          chartId: cell.id,
          sliceName: cell.name,
        },
      };
      childIds.push(chartNodeId);
    });
    pos[rowId] = {
      type: "ROW",
      id: rowId,
      children: childIds,
      parents: ["GRID_ID"],
      meta: { background: "BACKGROUND_TRANSPARENT" },
    };
    gridChildren.push(rowId);
  });

  return pos;
}

async function findDashboardId(base, token, slug) {
  const q = encodeURIComponent(
    JSON.stringify({
      filters: [{ col: "slug", opr: "eq", value: slug }],
      page_size: 5,
    })
  );
  const { ok, json } = await api(base, token, "GET", `/api/v1/dashboard/?q=${q}`);
  if (!ok) return null;
  return (json?.result || [])[0]?.id ?? null;
}

async function enableEmbed(base, token, dashboardId) {
  const { ok, status, json } = await api(
    base,
    token,
    "POST",
    `/api/v1/dashboard/${dashboardId}/embedded`,
    { allowed_domains: EMBED_ORIGINS }
  );
  if (!ok) {
    // some versions use PUT
    const put = await api(base, token, "PUT", `/api/v1/dashboard/${dashboardId}/embedded`, {
      allowed_domains: EMBED_ORIGINS,
    });
    if (!put.ok) {
      console.warn(`  embed enable failed (${status}/${put.status}):`, JSON.stringify(json).slice(0, 200));
      return null;
    }
    return put.json?.result?.uuid || put.json?.uuid || null;
  }
  return json?.result?.uuid || json?.uuid || null;
}

async function getEmbedUuid(base, token, dashboardId) {
  const { ok, json } = await api(base, token, "GET", `/api/v1/dashboard/${dashboardId}/embedded`);
  if (ok) return json?.result?.uuid || json?.uuid || null;
  return null;
}

async function upsertDashboard(base, token, { title, slug, css, positions, chartIds }) {
  const payload = {
    dashboard_title: title,
    slug,
    css,
    published: true,
    position_json: JSON.stringify(positions),
    json_metadata: JSON.stringify({
      color_scheme: "clevaFarm",
      label_colors: {},
      timed_refresh_immune_slices: [],
      expanded_slices: {},
      refresh_frequency: 0,
      default_filters: "{}",
      cross_filters_enabled: true,
    }),
  };

  let id = await findDashboardId(base, token, slug);
  if (id) {
    const { ok, status, json } = await api(base, token, "PUT", `/api/v1/dashboard/${id}`, payload);
    if (!ok) {
      throw new Error(`Dashboard update ${slug} (${status}): ${JSON.stringify(json).slice(0, 300)}`);
    }
    console.log(`✓ dashboard refresh ${slug} id=${id}`);
  } else {
    const { ok, status, json } = await api(base, token, "POST", "/api/v1/dashboard/", payload);
    id = json?.id ?? json?.result?.id;
    if (!ok || !id) {
      throw new Error(`Dashboard create ${slug} (${status}): ${JSON.stringify(json).slice(0, 300)}`);
    }
    console.log(`✓ dashboard ${slug} id=${id}`);
  }

  // attach charts
  for (const chartId of chartIds) {
    await api(base, token, "PUT", `/api/v1/chart/${chartId}`, {
      dashboards: [id],
    }).catch(() => {});
  }

  let uuid = await getEmbedUuid(base, token, id);
  if (!uuid) uuid = await enableEmbed(base, token, id);
  if (!uuid) uuid = await getEmbedUuid(base, token, id);
  if (!uuid) console.warn(`  no embed uuid for ${slug}`);
  else console.log(`  embed uuid=${uuid}`);
  return { id, uuid, slug, title };
}

async function main() {
  const base = trimBase(process.env.SUPERSET_URL || process.env.MARKET_INSIGHTS_SUPERSET_URL);
  if (!base) throw new Error("SUPERSET_URL is required");

  const auth = await login(base);
  const databaseId = await ensureDatabase(base, auth);

  /** @type {Record<string, number>} */
  const dsIds = {};
  for (const ds of DATASETS) {
    dsIds[ds.key] = await ensureDataset(base, auth, databaseId, ds);
  }

  // ── Charts ──────────────────────────────────────────────────────────────
  const kpiDs = dsIds.overview_kpis;
  const gmvDs = dsIds.gmv_weekly;
  const regionDs = dsIds.region_liquidity;
  const supplyDs = dsIds.supply_funnel;
  const demandDs = dsIds.demand_funnel;
  const scoutDs = dsIds.scout_leaderboard;
  const salesDs = dsIds.sales_channel;

  const cGmv = await upsertChart(base, auth, {
    slice_name: "Market — GMV (30d)",
    datasource_id: kpiDs,
    viz_type: "big_number_total",
    params: {
      metric: sqlMetric("GMV", "SUM(gmv_rwf)", "m_gmv"),
      subheader: "RWF · last 30 days",
      y_axis_format: ",.0f",
      header_font_size: 0.4,
      subheader_font_size: 0.15,
      show_trend_line: false,
    },
  });
  const cBirds = await upsertChart(base, auth, {
    slice_name: "Market — Birds sold (30d)",
    datasource_id: kpiDs,
    viz_type: "big_number_total",
    params: {
      metric: sqlMetric("Birds sold", "SUM(birds_sold)", "m_birds"),
      subheader: "Matched / delivered",
      y_axis_format: ",.0f",
      header_font_size: 0.4,
      subheader_font_size: 0.15,
      show_trend_line: false,
    },
  });
  const cListings = await upsertChart(base, auth, {
    slice_name: "Market — Listings live",
    datasource_id: kpiDs,
    viz_type: "big_number_total",
    params: {
      metric: sqlMetric("Listings", "SUM(listings_live)", "m_listings"),
      subheader: "Open + partial lots",
      y_axis_format: ",.0f",
      header_font_size: 0.4,
      subheader_font_size: 0.15,
      show_trend_line: false,
    },
  });
  const cSellers = await upsertChart(base, auth, {
    slice_name: "Market — Active sellers",
    datasource_id: kpiDs,
    viz_type: "big_number_total",
    params: {
      metric: sqlMetric("Sellers", "SUM(active_sellers)", "m_sellers"),
      subheader: "Verified / pending farms",
      y_axis_format: ",.0f",
      header_font_size: 0.4,
      subheader_font_size: 0.15,
      show_trend_line: false,
    },
  });
  const cBuyers = await upsertChart(base, auth, {
    slice_name: "Market — Active buyers",
    datasource_id: kpiDs,
    viz_type: "big_number_total",
    params: {
      metric: sqlMetric("Buyers", "SUM(active_buyers)", "m_buyers"),
      subheader: "Active buyer accounts",
      y_axis_format: ",.0f",
      header_font_size: 0.4,
      subheader_font_size: 0.15,
      show_trend_line: false,
    },
  });
  const cMatches = await upsertChart(base, auth, {
    slice_name: "Market — Matches (30d)",
    datasource_id: kpiDs,
    viz_type: "big_number_total",
    params: {
      metric: sqlMetric("Matches", "SUM(matches_30d)", "m_matches"),
      subheader: "Committed + delivered",
      y_axis_format: ",.0f",
      header_font_size: 0.4,
      subheader_font_size: 0.15,
      show_trend_line: false,
    },
  });

  const cGmvTrend = await upsertChart(base, auth, {
    slice_name: "Market — GMV weekly trend",
    datasource_id: gmvDs,
    viz_type: "echarts_area",
    params: {
      metrics: [simpleMetric("gmv_rwf", "SUM", "GMV")],
      x_axis: "week",
      groupby: [],
      row_limit: 1000,
      y_axis_format: ",.0f",
      opacity: 0.35,
      seriesType: "line",
      markerEnabled: false,
      rich_tooltip: true,
      show_legend: false,
    },
  });
  const cBirdsTrend = await upsertChart(base, auth, {
    slice_name: "Market — Birds weekly trend",
    datasource_id: gmvDs,
    viz_type: "echarts_timeseries_bar",
    params: {
      metrics: [simpleMetric("birds", "SUM", "Birds")],
      x_axis: "week",
      groupby: [],
      row_limit: 1000,
      y_axis_format: ",.0f",
      rich_tooltip: true,
      show_legend: false,
    },
  });
  const cRegion = await upsertChart(base, auth, {
    slice_name: "Market — Liquidity by district",
    datasource_id: regionDs,
    viz_type: "echarts_timeseries_bar",
    params: {
      metrics: [
        simpleMetric("birds_listed", "SUM", "Birds listed"),
        simpleMetric("buyers", "SUM", "Buyers"),
      ],
      x_axis: "district",
      groupby: [],
      row_limit: 20,
      orientation: "horizontal",
      y_axis_format: ",.0f",
      rich_tooltip: true,
      show_legend: true,
      legendOrientation: "top",
    },
  });
  // bar by category (not timeseries) — fallback table if viz rejects
  const cRegionTable = await upsertChart(base, auth, {
    slice_name: "Market — Region liquidity table",
    datasource_id: regionDs,
    viz_type: "table",
    params: {
      query_mode: "raw",
      all_columns: ["district", "listings", "birds_listed", "buyers"],
      row_limit: 50,
      page_length: "25",
      show_cell_bars: true,
      include_search: true,
    },
  });

  const cSupplyFunnel = await upsertChart(base, auth, {
    slice_name: "Market — Supply funnel",
    datasource_id: supplyDs,
    viz_type: "echarts_timeseries_bar",
    params: {
      metrics: [simpleMetric("count", "SUM", "Count")],
      x_axis: "stage",
      groupby: [],
      row_limit: 20,
      y_axis_format: ",.0f",
      rich_tooltip: true,
      show_legend: false,
    },
  });
  const cSupplyTable = await upsertChart(base, auth, {
    slice_name: "Market — Supply funnel table",
    datasource_id: supplyDs,
    viz_type: "table",
    params: {
      query_mode: "raw",
      all_columns: ["stage", "stage_order", "count"],
      row_limit: 20,
      show_cell_bars: true,
    },
  });

  const cDemandFunnel = await upsertChart(base, auth, {
    slice_name: "Market — Demand funnel",
    datasource_id: demandDs,
    viz_type: "echarts_timeseries_bar",
    params: {
      metrics: [simpleMetric("count", "SUM", "Count")],
      x_axis: "stage",
      groupby: [],
      row_limit: 20,
      y_axis_format: ",.0f",
      rich_tooltip: true,
      show_legend: false,
    },
  });
  const cDemandTable = await upsertChart(base, auth, {
    slice_name: "Market — Demand funnel table",
    datasource_id: demandDs,
    viz_type: "table",
    params: {
      query_mode: "raw",
      all_columns: ["stage", "stage_order", "count"],
      row_limit: 20,
      show_cell_bars: true,
    },
  });

  const cScoutTable = await upsertChart(base, auth, {
    slice_name: "Market — Scout leaderboard",
    datasource_id: scoutDs,
    viz_type: "table",
    params: {
      query_mode: "raw",
      all_columns: ["name", "district", "lots", "sellers", "birds", "matches"],
      row_limit: 100,
      page_length: "25",
      show_cell_bars: true,
      include_search: true,
    },
  });
  const cScoutLots = await upsertChart(base, auth, {
    slice_name: "Market — Scout lots",
    datasource_id: scoutDs,
    viz_type: "big_number_total",
    params: {
      metric: sqlMetric("Lots", "SUM(lots)", "m_scout_lots"),
      subheader: "Scouted in 30d",
      y_axis_format: ",.0f",
      header_font_size: 0.4,
      subheader_font_size: 0.15,
      show_trend_line: false,
    },
  });
  const cScoutBirds = await upsertChart(base, auth, {
    slice_name: "Market — Scout birds",
    datasource_id: scoutDs,
    viz_type: "big_number_total",
    params: {
      metric: sqlMetric("Birds", "SUM(birds)", "m_scout_birds"),
      subheader: "Birds scouted",
      y_axis_format: ",.0f",
      header_font_size: 0.4,
      subheader_font_size: 0.15,
      show_trend_line: false,
    },
  });

  const cChannelGmv = await upsertChart(base, auth, {
    slice_name: "Market — Channel GMV",
    datasource_id: salesDs,
    viz_type: "pie",
    params: {
      metric: simpleMetric("gmv_rwf", "SUM", "GMV"),
      groupby: ["channel"],
      row_limit: 10,
      number_format: ",.0f",
      show_legend: true,
      legendOrientation: "bottom",
      label_type: "key_value_percent",
    },
  });
  const cChannelTable = await upsertChart(base, auth, {
    slice_name: "Market — Sales channel table",
    datasource_id: salesDs,
    viz_type: "table",
    params: {
      query_mode: "raw",
      all_columns: ["channel", "matches", "birds", "gmv_rwf"],
      row_limit: 20,
      show_cell_bars: true,
    },
  });
  const cChannelBirds = await upsertChart(base, auth, {
    slice_name: "Market — Channel birds",
    datasource_id: salesDs,
    viz_type: "echarts_timeseries_bar",
    params: {
      metrics: [simpleMetric("birds", "SUM", "Birds")],
      x_axis: "channel",
      groupby: [],
      row_limit: 10,
      y_axis_format: ",.0f",
      show_legend: false,
    },
  });

  // ── Dashboards ──────────────────────────────────────────────────────────
  const overview = await upsertDashboard(base, auth, {
    title: "Cleva Market Command Center — Overview",
    slug: "cleva-market-overview",
    css: MARKET_CSS,
    chartIds: [cGmv, cBirds, cListings, cSellers, cBuyers, cMatches, cGmvTrend, cBirdsTrend, cRegion, cRegionTable],
    positions: buildPositions(
      "mkt-ov",
      "Cleva Market Command Center — Overview",
      heroMarkdown("Market overview", "Liquidity, GMV, and district balance — last 30 days"),
      [
        [
          { id: cGmv, name: "GMV", width: 2, height: 22 },
          { id: cBirds, name: "Birds", width: 2, height: 22 },
          { id: cListings, name: "Listings", width: 2, height: 22 },
          { id: cMatches, name: "Matches", width: 2, height: 22 },
          { id: cSellers, name: "Sellers", width: 2, height: 22 },
          { id: cBuyers, name: "Buyers", width: 2, height: 22 },
        ],
        [
          { id: cGmvTrend, name: "GMV trend", width: 7, height: 44 },
          { id: cBirdsTrend, name: "Birds trend", width: 5, height: 44 },
        ],
        [
          { id: cRegion, name: "District bar", width: 6, height: 48 },
          { id: cRegionTable, name: "District table", width: 6, height: 48 },
        ],
      ]
    ),
  });

  const supply = await upsertDashboard(base, auth, {
    title: "Cleva Market Command Center — Supply",
    slug: "cleva-market-supply",
    css: MARKET_CSS,
    chartIds: [cSupplyFunnel, cSupplyTable, cListings, cSellers],
    positions: buildPositions(
      "mkt-sup",
      "Cleva Market Command Center — Supply",
      heroMarkdown("Supply health", "Reach → signup → onboard → list → first sale"),
      [
        [
          { id: cListings, name: "Listings", width: 3, height: 22 },
          { id: cSellers, name: "Sellers", width: 3, height: 22 },
          { id: cBirds, name: "Birds sold", width: 3, height: 22 },
          { id: cMatches, name: "Matches", width: 3, height: 22 },
        ],
        [
          { id: cSupplyFunnel, name: "Funnel", width: 7, height: 48 },
          { id: cSupplyTable, name: "Funnel table", width: 5, height: 48 },
        ],
      ]
    ),
  });

  const demand = await upsertDashboard(base, auth, {
    title: "Cleva Market Command Center — Demand",
    slug: "cleva-market-demand",
    css: MARKET_CSS,
    chartIds: [cDemandFunnel, cDemandTable, cBuyers, cMatches],
    positions: buildPositions(
      "mkt-dem",
      "Cleva Market Command Center — Demand",
      heroMarkdown("Demand health", "Visits → signup → onboard → demand → paid"),
      [
        [
          { id: cBuyers, name: "Buyers", width: 4, height: 22 },
          { id: cMatches, name: "Matches", width: 4, height: 22 },
          { id: cGmv, name: "GMV", width: 4, height: 22 },
        ],
        [
          { id: cDemandFunnel, name: "Funnel", width: 7, height: 48 },
          { id: cDemandTable, name: "Funnel table", width: 5, height: 48 },
        ],
      ]
    ),
  });

  const scouts = await upsertDashboard(base, auth, {
    title: "Cleva Market Command Center — Scouts",
    slug: "cleva-market-scouts",
    css: MARKET_CSS,
    chartIds: [cScoutLots, cScoutBirds, cScoutTable],
    positions: buildPositions(
      "mkt-sc",
      "Cleva Market Command Center — Scouts",
      heroMarkdown("Scout system", "Expected vs actual coverage — lots, sellers, birds"),
      [
        [
          { id: cScoutLots, name: "Lots", width: 4, height: 22 },
          { id: cScoutBirds, name: "Birds", width: 4, height: 22 },
          { id: cSellers, name: "Sellers", width: 4, height: 22 },
        ],
        [{ id: cScoutTable, name: "Leaderboard", width: 12, height: 56 }],
      ]
    ),
  });

  const sales = await upsertDashboard(base, auth, {
    title: "Cleva Market Command Center — Sales",
    slug: "cleva-market-sales",
    css: MARKET_CSS,
    chartIds: [cChannelGmv, cChannelBirds, cChannelTable, cGmvTrend],
    positions: buildPositions(
      "mkt-sa",
      "Cleva Market Command Center — Sales",
      heroMarkdown("Money & channel", "App vs scout attribution · GMV over 12 weeks"),
      [
        [
          { id: cGmv, name: "GMV", width: 4, height: 22 },
          { id: cBirds, name: "Birds", width: 4, height: 22 },
          { id: cMatches, name: "Matches", width: 4, height: 22 },
        ],
        [
          { id: cChannelGmv, name: "Channel mix", width: 4, height: 44 },
          { id: cChannelBirds, name: "Channel birds", width: 4, height: 44 },
          { id: cChannelTable, name: "Channel table", width: 4, height: 44 },
        ],
        [{ id: cGmvTrend, name: "GMV trend", width: 12, height: 44 }],
      ]
    ),
  });

  const acqWeeklyDs = dsIds.acquisition_weekly;
  const acqAccountsDs = dsIds.acquisition_accounts;
  const cAcqOpens = await upsertChart(base, auth, {
    slice_name: "Market — Acquisition opens by channel",
    datasource_id: acqWeeklyDs,
    viz_type: "echarts_area",
    params: {
      metrics: [simpleMetric("opens", "SUM", "Opens")],
      x_axis: "week",
      groupby: ["source"],
      row_limit: 1000,
      y_axis_format: ",.0f",
      opacity: 0.35,
      seriesType: "line",
      show_legend: true,
      legendOrientation: "top",
      rich_tooltip: true,
    },
  });
  const cAcqAccounts = await upsertChart(base, auth, {
    slice_name: "Market — Acquisition accounts by channel",
    datasource_id: acqAccountsDs,
    viz_type: "echarts_timeseries_bar",
    params: {
      metrics: [simpleMetric("accounts", "SUM", "Accounts")],
      x_axis: "week",
      groupby: ["source"],
      row_limit: 1000,
      y_axis_format: ",.0f",
      show_legend: true,
      legendOrientation: "top",
      rich_tooltip: true,
    },
  });
  const cAcqTable = await upsertChart(base, auth, {
    slice_name: "Market — Acquisition weekly table",
    datasource_id: acqAccountsDs,
    viz_type: "table",
    params: {
      query_mode: "raw",
      all_columns: ["week", "source", "attempts", "accounts", "failed"],
      row_limit: 200,
      page_length: "50",
      show_cell_bars: true,
      include_search: true,
    },
  });
  const acquisition = await upsertDashboard(base, auth, {
    title: "Cleva Market Command Center — Acquisition",
    slug: "cleva-market-acquisition",
    css: MARKET_CSS,
    chartIds: [cAcqOpens, cAcqAccounts, cAcqTable],
    positions: buildPositions(
      "mkt-acq",
      "Cleva Market Command Center — Acquisition",
      heroMarkdown("Acquisition", "Reach and signups by channel · 12 weeks"),
      [
        [
          { id: cAcqOpens, name: "Opens", width: 6, height: 48 },
          { id: cAcqAccounts, name: "Accounts", width: 6, height: 48 },
        ],
        [{ id: cAcqTable, name: "Table", width: 12, height: 48 }],
      ]
    ),
  });

  const tileDs = dsIds.recruitment_tiles;
  const pipeDs = dsIds.recruitment_pipeline;
  const sourceDs = dsIds.recruitment_sources;
  const recScoutDs = dsIds.recruitment_scouts;
  const weekDs = dsIds.recruitment_weekly;
  const cSellersLive = await upsertChart(base, auth, {
    slice_name: "Market — Recruitment sellers live",
    datasource_id: tileDs,
    viz_type: "big_number_total",
    params: {
      metric: sqlMetric("Sellers live", "SUM(sellers_live)", "m_rec_sellers"),
      subheader: "0 means none live yet",
      y_axis_format: ",.0f",
      header_font_size: 0.5,
      subheader_font_size: 0.16,
      show_trend_line: false,
    },
  });
  const cBuyersActive = await upsertChart(base, auth, {
    slice_name: "Market — Recruitment buyers active",
    datasource_id: tileDs,
    viz_type: "big_number_total",
    params: {
      metric: sqlMetric("Buyers active", "SUM(buyers_active)", "m_rec_buyers"),
      subheader: "0 means none active yet",
      y_axis_format: ",.0f",
      header_font_size: 0.5,
      subheader_font_size: 0.16,
      show_trend_line: false,
    },
  });
  const cScoutsProducing = await upsertChart(base, auth, {
    slice_name: "Market — Recruitment scouts producing",
    datasource_id: tileDs,
    viz_type: "big_number_total",
    params: {
      metric: sqlMetric("Scouts producing", "SUM(scouts_producing)", "m_rec_scouts"),
      subheader: "0 means none producing yet",
      y_axis_format: ",.0f",
      header_font_size: 0.5,
      subheader_font_size: 0.16,
      show_trend_line: false,
    },
  });
  const cPassed = await upsertChart(base, auth, {
    slice_name: "Market — Recruitment probation",
    datasource_id: tileDs,
    viz_type: "big_number_total",
    params: {
      metric: sqlMetric("Passed probation", "SUM(passed_probation)", "m_rec_probation"),
      subheader: "0 means none passed yet",
      y_axis_format: ",.0f",
      header_font_size: 0.5,
      subheader_font_size: 0.16,
      show_trend_line: false,
    },
  });
  const cPipeStages = await upsertChart(base, auth, {
    slice_name: "Market — Recruitment pipeline stages",
    datasource_id: pipeDs,
    viz_type: "dist_bar",
    params: {
      metrics: [simpleMetric("people", "SUM", "People")],
      timeseries_limit_metric: simpleMetric("stage_order", "MIN", "Stage order"),
      groupby: ["stage"],
      columns: [],
      row_limit: 20,
      order_desc: false,
      show_legend: false,
      y_axis_format: ",.0f",
      color_scheme: "echarts4Colors",
    },
  });
  const cPipeWait = await upsertChart(base, auth, {
    slice_name: "Market — Recruitment waiting time",
    datasource_id: pipeDs,
    viz_type: "echarts_timeseries_bar",
    params: {
      metrics: [
        simpleMetric("d0", "SUM", "0–2 days"),
        simpleMetric("d3", "SUM", "3–5 days"),
        simpleMetric("d6", "SUM", "6 days or more"),
      ],
      x_axis: "stage",
      groupby: [],
      row_limit: 20,
      y_axis_format: ",.0f",
      show_legend: true,
      legendOrientation: "top",
      rich_tooltip: true,
      color_scheme: "d3Category10",
    },
  });
  const cSourceBars = await upsertChart(base, auth, {
    slice_name: "Market — Recruitment sources",
    datasource_id: sourceDs,
    viz_type: "dist_bar",
    params: {
      metrics: [simpleMetric("live_sellers", "SUM", "Live sellers")],
      timeseries_limit_metric: simpleMetric("channel_order", "MIN", "Channel order"),
      groupby: ["channel"],
      columns: [],
      row_limit: 20,
      order_desc: false,
      show_legend: false,
      y_axis_format: ",.0f",
      color_scheme: "googleCategory10c",
    },
  });
  const cSourceTable = await upsertChart(base, auth, {
    slice_name: "Market — Recruitment source table",
    datasource_id: sourceDs,
    viz_type: "table",
    params: {
      query_mode: "raw",
      all_columns: ["channel", "live_sellers", "accounts", "opens"],
      row_limit: 20,
      show_cell_bars: true,
    },
  });
  const cScoutStatus = await upsertChart(base, auth, {
    slice_name: "Market — Recruitment scout status",
    datasource_id: recScoutDs,
    viz_type: "dist_bar",
    params: {
      metrics: [sqlMetric("Scouts", "COUNT(*)", "m_rec_scout_n")],
      timeseries_limit_metric: simpleMetric("status_order", "MIN", "Status order"),
      groupby: ["status"],
      columns: [],
      row_limit: 10,
      order_desc: false,
      show_legend: false,
      y_axis_format: ",.0f",
      color_scheme: "bnbColors",
    },
  });
  const cRecScoutTable = await upsertChart(base, auth, {
    slice_name: "Market — Recruitment scout table",
    datasource_id: recScoutDs,
    viz_type: "table",
    params: {
      query_mode: "raw",
      all_columns: ["name", "district", "status", "lots", "birds", "unpaid_rwf"],
      row_limit: 100,
      page_length: "25",
      show_cell_bars: true,
      include_search: true,
    },
  });
  const cRecWeekly = await upsertChart(base, auth, {
    slice_name: "Market — Recruitment weekly",
    datasource_id: weekDs,
    viz_type: "echarts_timeseries_bar",
    params: {
      metrics: [
        simpleMetric("sellers_live", "SUM", "Sellers live"),
        simpleMetric("buyers_active", "SUM", "Buyers active"),
        simpleMetric("scouts_producing", "SUM", "Scouts producing"),
        simpleMetric("passed_probation", "SUM", "Passed probation"),
      ],
      x_axis: "week",
      groupby: [],
      row_limit: 12,
      y_axis_format: ",.0f",
      show_legend: true,
      legendOrientation: "top",
      rich_tooltip: true,
      color_scheme: "supersetColors",
    },
  });
  const queueDs = dsIds.recruitment_queue;
  const stageDs = dsIds.recruitment_stage_counts;
  const waitDs = dsIds.recruitment_wait;
  const workDs = dsIds.recruitment_worklist;
  const resultDs = dsIds.recruitment_interview_results;
  const interviewerDs = dsIds.recruitment_interviewers;
  const birdsDs = dsIds.recruitment_birds;
  const handoffDs = dsIds.recruitment_handoff;
  const cQueueStages = await upsertChart(base, auth, {
    slice_name: "Market — Recruitment queue stages",
    datasource_id: stageDs,
    viz_type: "dist_bar",
    params: {
      metrics: [simpleMetric("people", "SUM", "People")],
      timeseries_limit_metric: simpleMetric("stage_order", "MIN", "Stage order"),
      groupby: ["desk_stage"],
      columns: [],
      row_limit: 20,
      order_desc: false,
      show_legend: false,
      y_axis_format: ",.0f",
      color_scheme: "echarts4Colors",
    },
  });
  const cQueueWait = await upsertChart(base, auth, {
    slice_name: "Market — Recruitment queue waiting",
    datasource_id: waitDs,
    viz_type: "echarts_timeseries_bar",
    params: {
      metrics: [
        simpleMetric("d0", "SUM", "0–2 days"),
        simpleMetric("d3", "SUM", "3–5 days"),
        simpleMetric("d6", "SUM", "6 days or more"),
      ],
      x_axis: "desk_stage",
      groupby: [],
      row_limit: 20,
      y_axis_format: ",.0f",
      show_legend: true,
      legendOrientation: "top",
      rich_tooltip: true,
      color_scheme: "d3Category10",
    },
  });
  const cWorkList = await upsertChart(base, auth, {
    slice_name: "Market — Recruitment queue work list",
    datasource_id: workDs,
    viz_type: "table",
    params: {
      query_mode: "raw",
      all_columns: ["contact_name", "owner_name", "days_in_stage"],
      row_limit: 100,
      page_length: "25",
      include_search: true,
      order_desc: true,
    },
  });
  const cResults = await upsertChart(base, auth, {
    slice_name: "Market — Recruitment interview results",
    datasource_id: resultDs,
    viz_type: "dist_bar",
    params: {
      metrics: [simpleMetric("people", "SUM", "People")],
      timeseries_limit_metric: simpleMetric("result_order", "MIN", "Result order"),
      groupby: ["result_label"],
      columns: [],
      row_limit: 20,
      order_desc: false,
      show_legend: false,
      y_axis_format: ",.0f",
      color_scheme: "googleCategory10c",
    },
  });
  const cInterviewsRecorded = await upsertChart(base, auth, {
    slice_name: "Market — Recruitment interviews recorded",
    datasource_id: resultDs,
    viz_type: "big_number_total",
    params: {
      metric: sqlMetric("Result marks", "SUM(people)", "m_rec_interviews"),
      subheader: "0 means no interview has been recorded yet. Bars can overlap.",
      y_axis_format: ",.0f",
      header_font_size: 0.4,
      subheader_font_size: 0.14,
      show_trend_line: false,
    },
  });
  const cInterviewers = await upsertChart(base, auth, {
    slice_name: "Market — Recruitment interviewers",
    datasource_id: interviewerDs,
    viz_type: "table",
    params: {
      query_mode: "raw",
      all_columns: [
        "owner_name",
        "people_assigned",
        "calls_made",
        "reached",
        "no_answer",
        "overdue_next_calls",
        "decisions_this_week",
      ],
      row_limit: 100,
      page_length: "25",
      include_search: true,
      show_cell_bars: true,
    },
  });
  const cStatedBirds = await upsertChart(base, auth, {
    slice_name: "Market — Recruitment stated birds",
    datasource_id: birdsDs,
    viz_type: "dist_bar",
    params: {
      metrics: [simpleMetric("stated_birds", "SUM", "Birds stated")],
      timeseries_limit_metric: simpleMetric("week_order", "MIN", "Week order"),
      groupby: ["ready_label"],
      columns: [],
      row_limit: 20,
      order_desc: false,
      show_legend: false,
      y_axis_format: ",.0f",
      color_scheme: "bnbColors",
    },
  });
  const cNotAsked = await upsertChart(base, auth, {
    slice_name: "Market — Recruitment birds not asked",
    datasource_id: queueDs,
    viz_type: "big_number_total",
    params: {
      metric: sqlMetric(
        "Not asked yet",
        "SUM(CASE WHEN has_stated_birds THEN 0 ELSE 1 END)",
        "m_rec_not_asked"
      ),
      subheader: "Blank is not asked, not zero birds",
      y_axis_format: ",.0f",
      header_font_size: 0.4,
      subheader_font_size: 0.14,
      show_trend_line: false,
    },
  });
  const cHanded = await upsertChart(base, auth, {
    slice_name: "Market — Recruitment handed to scout",
    datasource_id: handoffDs,
    viz_type: "big_number_total",
    params: {
      metric: sqlMetric("Handed to a scout", "SUM(handed)", "m_rec_handed"),
      subheader: "0 means nobody has been handed to a scout yet",
      y_axis_format: ",.0f",
      header_font_size: 0.4,
      subheader_font_size: 0.14,
      show_trend_line: false,
    },
  });
  const cNotHanded = await upsertChart(base, auth, {
    slice_name: "Market — Recruitment not handed",
    datasource_id: handoffDs,
    viz_type: "big_number_total",
    params: {
      metric: sqlMetric("Not handed", "SUM(not_handed)", "m_rec_not_handed"),
      subheader: "KYC or Active, and no flock names a scout",
      y_axis_format: ",.0f",
      header_font_size: 0.4,
      subheader_font_size: 0.14,
      show_trend_line: false,
    },
  });
  const recruitment = await upsertDashboard(base, auth, {
    title: "Cleva Market Command Center — Recruitment",
    slug: "cleva-market-recruitment",
    css: MARKET_CSS,
    chartIds: [
      cSellersLive,
      cBuyersActive,
      cScoutsProducing,
      cPassed,
      cQueueStages,
      cQueueWait,
      cWorkList,
      cResults,
      cInterviewsRecorded,
      cInterviewers,
      cStatedBirds,
      cNotAsked,
      cHanded,
      cNotHanded,
      cSourceBars,
      cSourceTable,
      cScoutStatus,
      cRecScoutTable,
      cRecWeekly,
    ],
    positions: buildPositions(
      "mkt-rec",
      "Cleva Market Command Center — Recruitment",
      heroMarkdown(
        "Recruitment queue",
        "Where interviews stand, who is calling, and the birds people said they will have. Outcome charts fill in once people go live.",
        "linear-gradient(120deg,#14532d 0%,#1d9e75 28%,#2563eb 62%,#f59e0b 100%)"
      ),
      [
        [
          {
            markdown: bandMarkdown(
              "This week",
              "A zero means nobody has gone live, bought, produced, or passed probation yet.",
              "linear-gradient(135deg,#14532d,#1d9e75)"
            ),
            width: 12,
            height: 8,
          },
        ],
        [
          { id: cSellersLive, name: "Sellers live", width: 3, height: 16 },
          { id: cBuyersActive, name: "Buyers active", width: 3, height: 16 },
          { id: cScoutsProducing, name: "Scouts producing", width: 3, height: 16 },
          { id: cPassed, name: "Passed probation", width: 3, height: 16 },
        ],
        [
          {
            markdown: bandMarkdown(
              "Interview queue",
              "Days use the latest call note, or the day the person was added when there is no note. There is no separate stage-change time.",
              "linear-gradient(135deg,#0f766e,#2dd4bf)"
            ),
            width: 12,
            height: 8,
          },
        ],
        [
          { id: cQueueStages, name: "Stages", width: 6, height: 50 },
          { id: cQueueWait, name: "Waiting", width: 6, height: 50 },
        ],
        [
          {
            markdown: bandMarkdown(
              "Needs a call",
              "In Application for 3 or more days, and no call booked. An empty table means nobody is waiting that long.",
              "linear-gradient(135deg,#9a3412,#f59e0b)"
            ),
            width: 12,
            height: 8,
          },
        ],
        [{ id: cWorkList, name: "Work list", width: 12, height: 40 }],
        [
          {
            markdown: bandMarkdown(
              "Interview results",
              "Reached and no answer are call notes. Approved is a yes, or KYC, or Active. Categories can overlap. Zero on every bar means no interview has been recorded yet.",
              "linear-gradient(135deg,#1d4ed8,#38bdf8)"
            ),
            width: 12,
            height: 8,
          },
        ],
        [
          { id: cInterviewsRecorded, name: "Recorded", width: 3, height: 18 },
          { id: cResults, name: "Results", width: 9, height: 48 },
        ],
        [{ id: cInterviewers, name: "Interviewers", width: 12, height: 44 }],
        [
          {
            markdown: bandMarkdown(
              "Birds they said they will have",
              "Flock size when it was answered, otherwise the minimum. Blank answers are not zero. A week with no bar means nobody gave that timing.",
              "linear-gradient(135deg,#6d28d9,#c4b5fd)"
            ),
            width: 12,
            height: 8,
          },
        ],
        [
          { id: cStatedBirds, name: "Birds", width: 8, height: 44 },
          { id: cNotAsked, name: "Not asked", width: 4, height: 18 },
        ],
        [
          {
            markdown: bandMarkdown(
              "Handed to a scout",
              "Only people in KYC or Active. Zero means no recruit has been handed to a scout yet.",
              "linear-gradient(135deg,#9a3412,#fbbf24)"
            ),
            width: 12,
            height: 8,
          },
        ],
        [
          { id: cHanded, name: "Handed", width: 6, height: 16 },
          { id: cNotHanded, name: "Not handed", width: 6, height: 16 },
        ],
        [
          {
            markdown: bandMarkdown(
              "Where live sellers came from",
              "These charts fill in once people go live. Blank opens means that channel has no public-page opens.",
              "linear-gradient(135deg,#1d4ed8,#38bdf8)"
            ),
            width: 12,
            height: 8,
          },
        ],
        [
          { id: cSourceBars, name: "Sources", width: 6, height: 44 },
          { id: cSourceTable, name: "Source table", width: 6, height: 44 },
        ],
        [
          {
            markdown: bandMarkdown(
              "Eight weeks",
              "The same four outcome numbers. They stay at zero until someone goes live.",
              "linear-gradient(135deg,#6d28d9,#f472b6)"
            ),
            width: 12,
            height: 8,
          },
        ],
        [{ id: cRecWeekly, name: "Weekly", width: 12, height: 44 }],
        [
          {
            markdown: bandMarkdown(
              "Scouts this week",
              "Status, lots, and birds. These fill in once a scout verifies a flock.",
              "linear-gradient(135deg,#9a3412,#fbbf24)"
            ),
            width: 12,
            height: 8,
          },
        ],
        [
          { id: cScoutStatus, name: "Status", width: 4, height: 44 },
          { id: cRecScoutTable, name: "Scouts", width: 8, height: 44 },
        ],
      ]
    ),
  });

  const packs = { overview, supply, demand, scouts, sales, acquisition, recruitment };
  const missing = Object.entries(packs).filter(([, d]) => !d.uuid);
  if (missing.length) {
    console.warn("\n⚠ Missing embed UUIDs for:", missing.map(([k]) => k).join(", "));
  }

  console.log("\n=== Wire into farm-api env ===");
  console.log(`SUPERSET_URL=${base}`);
  console.log(`MARKET_INSIGHTS_SUPERSET_URL=${base}`);
  console.log(`MARKET_INSIGHTS_DASHBOARD_UUID=${overview.uuid || ""}`);
  console.log(`MARKET_INSIGHTS_PACK_OVERVIEW=${overview.uuid || ""}`);
  console.log(`MARKET_INSIGHTS_PACK_SUPPLY=${supply.uuid || ""}`);
  console.log(`MARKET_INSIGHTS_PACK_DEMAND=${demand.uuid || ""}`);
  console.log(`MARKET_INSIGHTS_PACK_SCOUTS=${scouts.uuid || ""}`);
  console.log(`MARKET_INSIGHTS_PACK_SALES=${sales.uuid || ""}`);
  console.log(`MARKET_INSIGHTS_PACK_ACQUISITION=${acquisition.uuid || ""}`);
  console.log(`MARKET_INSIGHTS_PACK_RECRUITMENT=${recruitment.uuid || ""}`);
  console.log(
    JSON.stringify(
      {
        databaseId,
        datasets: dsIds,
        packs: Object.fromEntries(
          Object.entries(packs).map(([k, v]) => [k, { id: v.id, uuid: v.uuid, slug: v.slug }])
        ),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
