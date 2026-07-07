const required = [
  { key: "DATABASE_URL", hint: 'e.g. file:/app/packages/database/prisma/prod.db' },
  { key: "NEXTAUTH_SECRET", hint: "long random string (32+ chars)" },
  { key: "NEXTAUTH_URL", hint: "https://your-domain.com" },
];

const missing = required.filter(({ key }) => !process.env[key]?.trim());

if (missing.length > 0) {
  console.error("\nMissing required environment variables:\n");
  for (const { key, hint } of missing) {
    console.error(`  ${key}  —  ${hint}`);
  }
  console.error("\nAdd them in GoDaddy Airo → Settings → Secrets, then redeploy.\n");
  process.exit(1);
}
