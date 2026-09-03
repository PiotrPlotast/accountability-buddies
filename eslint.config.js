const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const eslintPluginPrettierRecommended = require("eslint-plugin-prettier/recommended");

module.exports = defineConfig([
  expoConfig,
  eslintPluginPrettierRecommended,
  {
    // `expo lint . --fix` walks the whole tree and rewrites what it finds, so
    // anything here that isn't this repo's own source gets edited behind your
    // back. Agent worktrees are the one that bites: linting from the root used
    // to reformat files inside a parallel checkout, dirtying it and blocking
    // `git worktree remove`. Jest already skips them via
    // `testPathIgnorePatterns` in package.json — keep the two lists in step.
    ignores: ["dist/*", ".claude/worktrees/**", "coverage/**"],
  },
]);
