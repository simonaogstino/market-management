import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: "inherit", shell: true, env: process.env });
}

console.log("Market Management — production start\n");

run("node scripts/check-env.mjs");
run("npm run db:push");
run("npm run db:seed");
run("npm run start -w @market/web");
