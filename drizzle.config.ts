import { defineConfig } from "drizzle-kit";
import { resolve } from "path";

export default defineConfig({
  schema: "./src/backend/db/schema.ts",
  out: "./src/backend/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: resolve(process.env.LPGL_DB_PATH ?? "./data/launcher.db"),
  },
});