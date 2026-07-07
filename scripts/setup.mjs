import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envExample = join(root, ".env.example");
const envFile = join(root, ".env");

function copyEnv() {
  if (!existsSync(envFile)) {
    copyFileSync(envExample, envFile);
    console.log("Created .env from .env.example");
  }

  const envContent = existsSync(envFile)
    ? readFileSync(envFile, "utf8")
    : readFileSync(envExample, "utf8");

  writeFileSync(join(root, "apps", "web", ".env"), envContent);
  writeFileSync(join(root, "packages", "database", ".env"), extractDatabaseUrl(envContent));
  console.log("Synced .env to apps/web and packages/database");
}

function extractDatabaseUrl(content) {
  const match = content.match(/^DATABASE_URL=.*$/m);
  return match ? `${match[0]}\n` : 'DATABASE_URL="file:./dev.db"\n';
}

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: "inherit", shell: true });
}

console.log("Market Management — setup\n");

copyEnv();

run("npm install");
run("npm run db:generate");
run("npm run db:push");
run("npm run db:seed");

console.log("\nSetup complete! Run: npm run dev");
console.log("Then open:");
console.log("  Admin: http://localhost:3000/admin  (admin@store.local / admin123)");
console.log("  POS:   http://localhost:3000/pos     (API key: pos-terminal-1-key)");
