import { defineConfig } from 'vitest/config';

// base './': the built game finds its files relative to its page, so it runs from any folder of any host (a GitHub
// Pages project site serves it from /<repo>/, itch.io from a folder of its own), not only from a domain's root.
// Tests: only this checkout's, not the copies of the project that parallel sessions keep in .claude/worktrees.
export default defineConfig({ base: './', test: { exclude: ['**/node_modules/**', '.claude/**'] } });
