import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		include: ['src/**/*.{test,spec}.{js,ts,tsx}', 'app/**/*.{test,spec}.{js,ts,tsx}'],
		environment: 'happy-dom',
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			include: ['src/**/*', 'app/modules/**/*'],
			exclude: ['src/**/*.{test,spec}.*', 'app/**/*.{test,spec}.*'],
		},
	},
})
