import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/drizzle/schema";

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set.");
  }
  return drizzle(neon(url), { schema });
}

type Db = ReturnType<typeof createDb>;

let cached: Db | undefined;

/** Returns the shared Drizzle client. It reads DATABASE_URL on first use, not at import time. */
export function getDb(): Db {
  cached ??= createDb();
  return cached;
}

/** Lazy proxy of getDb(). The build does not need DATABASE_URL. */
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export { schema };
