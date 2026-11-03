import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import {
  runInTransaction,
  createWithDbTransaction,
  withSavepoint,
} from "../src/services/db/transaction.js";
import { deleteCompanyHard } from "../src/services/tenant/companyDelete.js";
import pipelineRouter, { initPipelineRouter } from "../src/routes/pipeline.routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * A pg Pool stand-in. Every statement is logged with the connection it ran on; `respond(sql, params)`
 * decides the result (throw to fail the statement). `pool.query` gets its own id per call, like a
 * real pool handing out whichever connection is free.
 */
function fakePool(respond = () => ({ rows: [] })) {
  const log = [];
  let nextId = 0;
  const released = [];
  const run = (conn, sql, params) => {
    log.push({ conn, sql: String(sql).trim(), params });
    return Promise.resolve().then(() => respond(String(sql), params) ?? { rows: [] });
  };
  return {
    log,
    released,
    query(sql, params) {
      return run(`pool-${++nextId}`, sql, params);
    },
    async connect() {
      const conn = `client-${++nextId}`;
      return {
        query: (sql, params) => run(conn, sql, params),
        release: () => released.push(conn),
      };
    },
  };
}

const sqls = (log) => log.map((e) => e.sql.split(/\s+/).slice(0, 3).join(" "));

describe("runInTransaction", () => {
  it("sends BEGIN, every statement and COMMIT down the same client, then releases it", async () => {
    const pool = fakePool(() => ({ rows: [{ n: 1 }] }));
    const out = await runInTransaction(pool, async (q) => {
      await q("SELECT 1 FOR UPDATE");
      await q("UPDATE t SET x = 1", [1]);
      return "done";
    });
    assert.equal(out, "done");
    assert.deepEqual(sqls(pool.log), ["BEGIN", "SELECT 1 FOR", "UPDATE t SET", "COMMIT"]);
    assert.equal(new Set(pool.log.map((e) => e.conn)).size, 1);
    assert.match(pool.log[0].conn, /^client-/);
    assert.deepEqual(pool.released, [pool.log[0].conn]);
  });

  it("rolls back and releases when the callback throws", async () => {
    const pool = fakePool();
    await assert.rejects(
      runInTransaction(pool, async (q) => {
        await q("INSERT INTO t VALUES (1)");
        throw new Error("boom");
      }),
      /boom/
    );
    assert.deepEqual(sqls(pool.log), ["BEGIN", "INSERT INTO t", "ROLLBACK"]);
    assert.equal(pool.released.length, 1);
  });

  it("rolls back and releases when a statement fails", async () => {
    const pool = fakePool((sql) => {
      if (sql.startsWith("UPDATE")) throw new Error("deadlock detected");
    });
    await assert.rejects(runInTransaction(pool, (q) => q("UPDATE t SET x = 1")), /deadlock/);
    assert.deepEqual(sqls(pool.log), ["BEGIN", "UPDATE t SET", "ROLLBACK"]);
    assert.equal(pool.released.length, 1);
  });

  it("still releases, and keeps the original error, when ROLLBACK itself fails", async () => {
    const pool = fakePool((sql) => {
      if (sql === "ROLLBACK") throw new Error("connection lost");
    });
    await assert.rejects(
      runInTransaction(pool, async () => {
        throw new Error("original");
      }),
      /original/
    );
    assert.equal(pool.released.length, 1);
  });

  it("releases when COMMIT fails", async () => {
    const pool = fakePool((sql) => {
      if (sql === "COMMIT") throw new Error("serialization failure");
    });
    await assert.rejects(runInTransaction(pool, async () => "x"), /serialization/);
    assert.deepEqual(sqls(pool.log), ["BEGIN", "COMMIT", "ROLLBACK"]);
    assert.equal(pool.released.length, 1);
  });

  it("gives two overlapping transactions separate clients", async () => {
    const pool = fakePool();
    await Promise.all([
      runInTransaction(pool, (q) => q("SELECT a")),
      runInTransaction(pool, (q) => q("SELECT b")),
    ]);
    const connOf = (s) => pool.log.find((e) => e.sql === s).conn;
    assert.notEqual(connOf("SELECT a"), connOf("SELECT b"));
    assert.equal(pool.released.length, 2);
  });
});

describe("createWithDbTransaction", () => {
  it("refuses when there is no pool instead of faking a transaction", async () => {
    const withTx = createWithDbTransaction(() => null);
    await assert.rejects(withTx(async () => {}), /pool not configured/);
  });

  it("reads the pool lazily", async () => {
    let pool = null;
    const withTx = createWithDbTransaction(() => pool);
    pool = fakePool();
    await withTx((q) => q("SELECT 1"));
    assert.deepEqual(sqls(pool.log), ["BEGIN", "SELECT 1", "COMMIT"]);
  });
});

describe("withSavepoint", () => {
  it("rolls back to the savepoint on error so the outer transaction can go on", async () => {
    const pool = fakePool((sql) => {
      if (sql.includes("missing_table")) throw new Error('relation "missing_table" does not exist');
    });
    await runInTransaction(pool, async (q) => {
      await withSavepoint(q, () => q("DELETE FROM missing_table")).catch(() => {});
      await q("DELETE FROM users");
    });
    const flow = pool.log.map((e) => e.sql.replace(/sp_\d+/, "sp"));
    assert.deepEqual(flow, [
      "BEGIN",
      "SAVEPOINT sp",
      "DELETE FROM missing_table",
      "ROLLBACK TO SAVEPOINT sp",
      "DELETE FROM users",
      "COMMIT",
    ]);
  });

  it("releases the savepoint on success", async () => {
    const pool = fakePool();
    await runInTransaction(pool, (q) => withSavepoint(q, () => q("SELECT 1")));
    assert.deepEqual(
      pool.log.map((e) => e.sql.replace(/sp_\d+/, "sp")),
      ["BEGIN", "SAVEPOINT sp", "SELECT 1", "RELEASE SAVEPOINT sp", "COMMIT"]
    );
  });
});

describe("deleteCompanyHard", () => {
  const COMPANY = "11111111-1111-4111-8111-111111111111";
  const lookup = async () => ({ rows: [{ id: COMPANY, slug: "acme" }] });

  it("runs every delete on one client and commits", async () => {
    const pool = fakePool((sql) => {
      if (/DELETE FROM market_media/.test(sql)) throw new Error("relation does not exist");
    });
    await deleteCompanyHard(lookup, COMPANY, {
      confirmSlug: "acme",
      withTransaction: (fn) => runInTransaction(pool, fn),
    });
    assert.equal(new Set(pool.log.map((e) => e.conn)).size, 1);
    assert.equal(pool.log[0].sql, "BEGIN");
    assert.equal(pool.log.at(-1).sql, "COMMIT");
    assert.ok(pool.log.some((e) => /^ROLLBACK TO SAVEPOINT/.test(e.sql)), "missing table is tolerated");
    assert.ok(pool.log.some((e) => /DELETE FROM companies/.test(e.sql)));
    assert.equal(pool.released.length, 1);
  });

  it("rolls back when a required delete fails", async () => {
    const pool = fakePool((sql) => {
      if (/DELETE FROM users/.test(sql)) throw new Error("fk violation");
    });
    await assert.rejects(
      deleteCompanyHard(lookup, COMPANY, {
        confirmSlug: "acme",
        withTransaction: (fn) => runInTransaction(pool, fn),
      }),
      /fk violation/
    );
    assert.equal(pool.log.at(-1).sql, "ROLLBACK");
    assert.ok(!pool.log.some((e) => e.sql === "COMMIT"));
    assert.equal(pool.released.length, 1);
  });

  it("will not run without a transaction", async () => {
    await assert.rejects(deleteCompanyHard(lookup, COMPANY, { confirmSlug: "acme" }), /withTransaction/);
  });
});

describe("pipeline routes use one client per transaction", () => {
  const LOT = "22222222-2222-4222-8222-222222222222";
  const BUYER = "33333333-3333-4333-8333-333333333333";
  let server;
  let base;
  let pool;
  let respond;

  before(async () => {
    pool = fakePool((sql, params) => respond(sql, params));
    initPipelineRouter(
      (sql, params) => pool.query(sql, params),
      () => true,
      () => {},
      createWithDbTransaction(() => pool)
    );
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.authUser = { id: "44444444-4444-4444-8444-444444444444", role: "sales_coordinator" };
      next();
    });
    app.use(pipelineRouter);
    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => new Promise((resolve) => server.close(resolve)));

  const post = (url, body) =>
    fetch(base + url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("POST /matches locks, inserts and refreshes the lot on the same client", async () => {
    pool.log.length = 0;
    pool.released.length = 0;
    respond = (sql) => {
      if (/FROM pipeline_lots WHERE id = \$1::uuid\s+FOR UPDATE/.test(sql)) {
        return { rows: [{ id: LOT, birdCount: 500, status: "open", askPricePerKg: 2500, scoutedBy: null }] };
      }
      if (/FROM pipeline_lots WHERE id/.test(sql)) return { rows: [{ id: LOT, birdCount: 500, status: "open" }] };
      if (/SUM\(birds\)/.test(sql)) return { rows: [{ matched: 0 }] };
      if (/INSERT INTO pipeline_matches/.test(sql)) return { rows: [{ id: "m1", lotId: LOT, birds: 100 }] };
      return { rows: [] };
    };
    const r = await post("/matches", { lotId: LOT, buyerId: BUYER, birds: 100 });
    assert.equal(r.status, 201, await r.clone().text());
    assert.equal((await r.json()).match.id, "m1");

    assert.ok(!pool.log.some((e) => /^(BEGIN|COMMIT|ROLLBACK)$/.test(e.sql) && e.conn.startsWith("pool-")));
    const conn = pool.log.find((e) => e.sql === "BEGIN").conn;
    const inTx = pool.log.filter((e) => e.conn === conn).map((e) => e.sql.split(/\s+/)[0]);
    assert.deepEqual(inTx, ["BEGIN", "SELECT", "SELECT", "INSERT", "SELECT", "SELECT", "COMMIT"]);
    assert.ok(pool.log.every((e) => e.conn === conn), "nothing in the match write leaks to the pool");
    assert.deepEqual(pool.released, [conn]);
  });

  it("POST /matches refuses an over-booking without writing and still releases", async () => {
    pool.log.length = 0;
    pool.released.length = 0;
    respond = (sql) => {
      if (/FOR UPDATE/.test(sql)) return { rows: [{ id: LOT, birdCount: 100, status: "partial" }] };
      if (/SUM\(birds\)/.test(sql)) return { rows: [{ matched: 90 }] };
      return { rows: [] };
    };
    const r = await post("/matches", { lotId: LOT, buyerId: BUYER, birds: 20 });
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /Only 10 birds remaining/);
    assert.ok(!pool.log.some((e) => /^(INSERT|UPDATE)/.test(e.sql)));
    assert.equal(pool.released.length, 1);
  });

  it("POST /matches rolls back and answers 503 when the insert fails", async () => {
    pool.log.length = 0;
    pool.released.length = 0;
    respond = (sql) => {
      if (/FOR UPDATE/.test(sql)) return { rows: [{ id: LOT, birdCount: 100, status: "open" }] };
      if (/SUM\(birds\)/.test(sql)) return { rows: [{ matched: 0 }] };
      if (/INSERT INTO pipeline_matches/.test(sql)) throw new Error("insert failed");
      return { rows: [] };
    };
    const r = await post("/matches", { lotId: LOT, buyerId: BUYER, birds: 20 });
    assert.equal(r.status, 503);
    assert.equal(pool.log.at(-1).sql, "ROLLBACK");
    assert.ok(!pool.log.some((e) => e.sql === "COMMIT"));
    assert.equal(pool.released.length, 1);
  });

  it("POST /market/bookings takes the lot lock on a checked-out client, not the pool", async () => {
    pool.log.length = 0;
    pool.released.length = 0;
    respond = (sql) => {
      if (/FOR UPDATE OF l/.test(sql)) {
        return { rows: [{ id: LOT, birdCount: 100, status: "sold", verificationStatus: "verified" }] };
      }
      return { rows: [] };
    };
    const r = await post("/market/bookings", { lotId: LOT, buyerId: BUYER, birds: 100 });
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /not available/);
    const lock = pool.log.find((e) => /FOR UPDATE OF l/.test(e.sql));
    assert.match(lock.conn, /^client-/);
    const inTx = pool.log.filter((e) => e.conn === lock.conn).map((e) => e.sql.split(/\s+/)[0]);
    assert.equal(inTx[0], "BEGIN");
    assert.ok(["COMMIT", "ROLLBACK"].includes(inTx.at(-1)));
    assert.deepEqual(pool.released, [lock.conn]);
  });
});

describe("no fake transactions left", () => {
  it("no server code sends BEGIN through dbQuery", () => {
    const root = path.resolve(__dirname, "..");
    const files = [path.join(root, "server.js")];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".js")) files.push(p);
      }
    };
    walk(path.join(root, "src"));
    const offenders = files.filter((f) => /dbQuery\(\s*["'`]BEGIN/.test(readFileSync(f, "utf8").replace(/\/\*\*?[\s\S]*?\*\//g, "")));
    assert.deepEqual(offenders, []);
  });
});
