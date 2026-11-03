import { defineConfig } from 'vite'
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
	root: './app',
	base: '/',
	publicDir: false,
	server: {
		fs: {
			allow: ['..'],
		},
	},
	esbuild: {
		target: 'esnext',
		supported: {
			'class-field': true,
			'class-static-field': true,
		},
	},
	optimizeDeps: {
		include: ['maplibre-gl'],
		esbuildOptions: {
			target: 'esnext',
			supported: {
				'class-field': true,
				'class-static-field': true,
			},
		},
	},
	build: {
		outDir: '../dist',
		emptyOutDir: true,
		target: 'esnext',
		rollupOptions: {
			input: {
				index: 'app/index.html',
			},
		},
	},
	plugins: [
		{
			name: 'copy-data-folder',
			writeBundle() {
				const sourceDir = join(__dirname, 'app', 'data')
				const targetDir = join(__dirname, 'dist', 'data')

				// ターゲットディレクトリを作成
				mkdirSync(targetDir, { recursive: true })

				// dataフォルダの内容をコピー
				const files = readdirSync(sourceDir)
				files.forEach((file: string) => {
					const sourcePath = join(sourceDir, file)
					const targetPath = join(targetDir, file)
					if (statSync(sourcePath).isFile()) {
						copyFileSync(sourcePath, targetPath)
					}
				})
			},
		},
	],
})
