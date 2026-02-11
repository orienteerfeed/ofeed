import { execSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const inDocker = existsSync("/.dockerenv");

if (process.env.NODE_ENV === "production") {
  console.error("setup:dev cannot run in production");
  process.exit(1);
}

if (process.env.CI === "true" || process.env.CI === "1") {
  console.error("setup:dev cannot run in CI");
  process.exit(1);
}

if (inDocker) {
  console.error("setup:dev cannot run inside a container");
  process.exit(1);
}

const run = (cmd) => {
  execSync(cmd, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
};

run("pnpm install");

const envFiles = [
  ["apps/server/.env.example", "apps/server/.env"],
  ["apps/client/.env.example", "apps/client/.env"],
];

for (const [src, dest] of envFiles) {
  const srcPath = resolve(root, src);
  const destPath = resolve(root, dest);

  if (!existsSync(destPath)) {
    copyFileSync(srcPath, destPath);
    console.log(`Created ${dest}`);
  }
}

console.log("\nNext steps:");
console.log("1) docker compose -f docker-compose.mysql.yaml up -d mysql");
console.log("2) pnpm db:generate");
console.log("3) pnpm db:migrate");
console.log("4) pnpm dev");
