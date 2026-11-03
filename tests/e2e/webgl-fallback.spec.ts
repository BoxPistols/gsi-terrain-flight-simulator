/**
 * WebGL が使えないブラウザで開いたときの表示
 *
 * GPU が切られた会社の端末やリモート環境を、Chromium の起動オプションで再現する。
 * launchOptions はワーカー単位の設定なので、このファイル全体に掛ける。
 */

import { test, expect } from '@playwright/test'

test.use({ launchOptions: { args: ['--disable-webgl', '--disable-3d-apis'] } })

test('地図の代わりに、デモ動画と直し方を出す', async ({ page }) => {
	const errors: string[] = []
	page.on('pageerror', e => errors.push(e.message))

	await page.goto('/')

	const fallback = page.locator('#webgl-fallback')
	await expect(fallback).toBeVisible()
	await expect(page.getByRole('status')).toContainText('この環境では 3D 地図を表示できません')
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		'日本の地形を空から眺める 3D フライトシミュレーター（技術デモ）'
	)

	const video = fallback.locator('video')
	await expect(video).toBeVisible()
	await expect(video).toHaveAttribute('poster', /flight-demo-poster/)
	await expect(video.locator('source')).toHaveAttribute('src', /flight-demo.*\.mp4$/)
	await expect(video.locator('track[kind="captions"]')).toHaveAttribute('src', /\.vtt$/)

	await expect(page.getByRole('button', { name: 'もう一度試す' })).toBeVisible()
	await expect(page.getByRole('link', { name: /GitHub で README を見る/ })).toHaveAttribute(
		'href',
		/github\.com\/BoxPistols\/gsi-terrain-flight-simulator/
	)

	// --disable-webgl は Chrome では「管理ポリシーまたは起動オプション」として報告される
	await expect(fallback).toContainText('管理者のポリシー')
	await expect(fallback).toContainText('chrome://settings/system')

	// 以前は MapLibre の例外（JSON）がそのままトーストに出ていた
	await expect(page.locator('body')).not.toContainText('requestedAttributes')
	await expect(page.locator('#map')).toBeHidden()
	expect(errors).toEqual([])
})

test('WebGL が無い人には地図ライブラリを読み込まない', async ({ page }) => {
	const scripts: number[] = []
	page.on('response', async res => {
		if (res.request().resourceType() === 'script') {
			const body = await res.body().catch(() => Buffer.alloc(0))
			scripts.push(body.length)
		}
	})
	await page.goto('/')
	await expect(page.locator('#webgl-fallback')).toBeVisible()
	// 本体（MapLibre を含む）は 1 MB を超える。起動用の小さなスクリプトだけで済んでいること
	expect(Math.max(...scripts)).toBeLessThan(200_000)
})

test.describe('スマートフォン幅', () => {
	test.use({ viewport: { width: 390, height: 844 } })

	test('横にはみ出さず、ボタンは 44px 以上', async ({ page }) => {
		await page.goto('/')
		await expect(page.locator('#webgl-fallback')).toBeVisible()
		const overflow = await page
			.locator('#webgl-fallback')
			.evaluate(el => el.scrollWidth - el.clientWidth)
		expect(overflow).toBeLessThanOrEqual(0)
		for (const button of await page.locator('#webgl-fallback .wgf-btn').all()) {
			const box = await button.boundingBox()
			expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
		}
	})
})
