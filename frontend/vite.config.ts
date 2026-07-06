import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		// The dev server runs inside a container; the /socket.io proxy points at
		// the backend service on the compose network (see frontend/README.md).
		host: true,
		port: 5173,
		strictPort: true,
		proxy: {
			'/socket.io': {
				target: process.env.BACKEND_URL ?? 'http://backend:3000',
				ws: true
			}
		}
	}
});
