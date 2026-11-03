/** One client, one transaction, one statement timeout. A slow query cannot sit on the pool. */

import { STATEMENT_TIMEOUT_MS } from "./command.js";

export { STATEMENT_TIMEOUT_MS };

export async function timedQuery(connect, sql, params = [], ms = STATEMENT_TIMEOUT_MS) {
  const client = await connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('statement_timeout', $1, true)", [String(ms)]);
    const result = await client.query(sql, params);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* The original error is the one that matters. */
    }
    throw err;
  } finally {
    client.release();
  }
}
