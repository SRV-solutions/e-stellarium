import { execSync } from "node:child_process";
import dotenv from "dotenv";

export default function () {
  const env = dotenv.config({ path: ".env.test", quiet: true }).parsed ?? {};
  execSync("npm run migrate", {
    stdio: "inherit",
    env: { ...process.env, ...env, NODE_ENV: "test" },
  });
}