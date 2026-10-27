import { defineConfig } from 'vite';

// base './': the built game finds its files relative to its page, so it runs from any folder of any host (a GitHub
// Pages project site serves it from /<repo>/, itch.io from a folder of its own), not only from a domain's root.
export default defineConfig({ base: './' });
