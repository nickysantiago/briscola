import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	kit: {
		// Single prerendered page served by nginx — no SSR, no fallback needed.
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: undefined,
			strict: true
		})
	}
};
