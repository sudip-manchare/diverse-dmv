import "server-only";
import postgres from "postgres";
import { ApiError } from "./http";
let client: ReturnType<typeof postgres> | undefined;
type Sql = ReturnType<typeof postgres>;
export type Transaction = postgres.TransactionSql<{}>;
export function getSql(): Sql {
  if (!process.env.DATABASE_URL)
    throw new ApiError(
      503,
      "DEPENDENCY_UNAVAILABLE",
      "The database is unavailable right now. Try again.",
    );
  return (client ??= postgres(process.env.DATABASE_URL, {
    max: Math.min(Number(process.env.DB_POOL_MAX) || 5, 10),
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
    transform: { undefined: null },
  }));
}
