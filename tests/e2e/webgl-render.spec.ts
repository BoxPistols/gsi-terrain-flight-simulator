/**
 * WebGL が使える環境では、これまでどおり地図を描く
 *
 * GPU の無い CI でも確かめられるよう、ソフトウェア描画（SwiftShader）を明示して起動する。
 */

import { test, expect } from '@playwright/test'
import sharp from 'sharp'

test.use({
	launchOptions: {
		args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
	},
	viewport: { width: 1280, height: 800 },
})
test.describe.configure({ timeout: 90_000 })

test('案内は出さずに、空中写真の地図を描く', async ({ page }) => {
	const errors: string[] = []
	page.on('pageerror', e => errors.push(e.message))

	await page.goto('/')
	const canvas = page.locator('#map canvas.maplibregl-canvas')
	await expect(canvas).toBeVisible({ timeout: 30_000 })
	await expect(page.locator('#webgl-fallback')).toHaveCount(0)

	// MapLibre 5 では描画バッファが保持されず canvas から画素を読めないので、画面の撮影で確かめる。
	// 空中写真が描けていれば平均輝度は黒（0）から大きく離れる
	await expect
		.poll(
			async () => {
				const png = await canvas.screenshot()
				const { channels } = await sharp(png).stats()
				return (channels[0].mean + channels[1].mean + channels[2].mean) / 3
			},
			{ timeout: 60_000 }
		)
		.toBeGreaterThan(40)
	expect(errors).toEqual([])
})
