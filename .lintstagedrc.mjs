const quote = (files) => files.map((file) => `"${file.replace(/"/g, '\\"')}"`).join(" ");

const normalize = (file) => file.replaceAll("\\", "/");

export default {
  "apps/client/**/*.{js,jsx,ts,tsx,mjs,cjs}": () => [
    "pnpm --filter ./apps/client lint:fix",
  ],
  "apps/server/**/*.{js,jsx,ts,tsx,mjs,cjs}": () => [
    "pnpm --filter ./apps/server lint:fix",
  ],
  "*.{js,mjs,cjs}": (files) => {
    const rootJsFiles = files.filter(
      (file) =>
        !file.startsWith("apps/client/") &&
        !file.startsWith("apps/server/"),
    );

    if (rootJsFiles.length === 0) {
      return [];
    }

    return [`pnpm exec eslint --fix --max-warnings=0 ${quote(rootJsFiles)}`];
  },
  "**/*.{json,md,yml,yaml,css,scss,html}": (files) => {
    const safeFiles = files.filter((file) => {
      const normalized = normalize(file);
      // Helm templates use Go templating syntax and are not valid plain YAML for Prettier.
      return !normalized.includes("deploy/helm/ofeed/templates/");
    });

    if (safeFiles.length === 0) {
      return [];
    }

    return [`pnpm exec prettier --write --ignore-unknown ${quote(safeFiles)}`];
  },
};
