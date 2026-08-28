import "dotenv/config";
import type { Knex } from "knex";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required.");
}

const config: Knex.Config = {
  client: "pg",

  connection: connectionString,

  migrations: {
    directory: "./src/db/migrations",
  },
};

export default config;