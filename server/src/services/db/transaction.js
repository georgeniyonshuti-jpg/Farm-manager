/**
 * Real transactions on a pg Pool.
 *
 * `pool.query("BEGIN")` followed by more `pool.query` calls is not a transaction: each call may
 * run on a different connection, so FOR UPDATE locks nothing and COMMIT/ROLLBACK hit whichever
 * connection happens to be free. Everything inside one transaction must go through one client.
 */

/**
 * Check out one client, BEGIN, run `fn(q)` with `q(sql, params)` bound to that client, then
 * COMMIT (or ROLLBACK if `fn` throws). The client is always released.
 * @template T
 * @param {{ connect: () => Promise<{ query: Function, release: Function }> }} pool
 * @param {(q: (sql: string, params?: unknown[]) => Promise<any>) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function runInTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const q = (sql, params = []) => client.query(sql, params);
    const out = await fn(q);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* already aborted */
    }
    throw err;
  } finally {
    client.release();
  }
}

/** `withDbTransaction(fn)` bound to a pool (or a getter for one), for passing through router deps. */
export function createWithDbTransaction(poolOrGetter) {
  return async function withDbTransaction(fn) {
    const pool = typeof poolOrGetter === "function" ? poolOrGetter() : poolOrGetter;
    if (!pool?.connect) throw new Error("Database pool not configured");
    return runInTransaction(pool, fn);
  };
}

let savepointSeq = 0;

/**
 * Run `fn()` inside a SAVEPOINT on the transaction behind `q`. In Postgres one failed statement
 * aborts the whole transaction, so a statement whose error is caught and tolerated (a table or
 * column from a migration that may not be applied yet) has to be wrapped in one. On error the
 * savepoint is rolled back and the error rethrown, leaving the outer transaction usable.
 * @template T
 * @param {(sql: string, params?: unknown[]) => Promise<any>} q
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withSavepoint(q, fn) {
  savepointSeq = (savepointSeq + 1) % 1_000_000;
  const name = `sp_${savepointSeq}`;
  await q(`SAVEPOINT ${name}`);
  try {
    const out = await fn();
    await q(`RELEASE SAVEPOINT ${name}`);
    return out;
  } catch (err) {
    await q(`ROLLBACK TO SAVEPOINT ${name}`);
    throw err;
  }
}
