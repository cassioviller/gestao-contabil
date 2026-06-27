// Conexão única com o Postgres, compartilhada pelo app.
// A URL vem da variável de ambiente DATABASE_URL (já provisionada no Replit).

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });
export { schema };
