/**
 * 現行 UI に対するスモークテスト
 *
 * 地形は npm の maplibre-gl-gsi-terrain で読み込むため、標高タイルの取得と
 * 標高値の表示までを確かめ、ライブラリの差し替えで地形が壊れていないことを保証する。
 */

import { test, expect, type Page } from '@playwright/test'

const DEM_TILE_HOST = 'tiles.gsj.jp'

// UI のイベント登録は地図の初期化後に行われるため、初期化の最後に出るログを待つ
// （HTML に最初から書かれている「準備完了」の行と区別するため本文で探す）
const gotoReady = async (page: Page) => {
	await page.goto('/')
	await expect(
		page
			.locator('.log-entry', { hasText: 'フライトプランとリアルタイムログ機能が利用可能です' })
			.first()
	).toBeAttached({
		timeout: 60_000,
	})
}

// PC では操作パネルは閉じた状態で始まる。アプリは開閉状態を localStorage から復元するので、
// 開いた状態を事前に入れておく
const openControlsOnLoad = async (page: Page) => {
	await page.addInitScript(() => window.localStorage.setItem('controlsVisible', 'true'))
}

const collectPageErrors = (page: Page): string[] => {
	const errors: string[] = []
	page.on('pageerror', e => errors.push(e.message))
	return errors
}

test.describe('PC', () => {
	test.use({ viewport: { width: 1440, height: 900 } })
	// ヘッドレス環境の WebGL はソフトウェア描画で、初期化と飛行の描画に時間がかかる
	test.describe.configure({ timeout: 90_000 })

	test('起動して地図と操作パネルが表示される', async ({ page }) => {
		const errors = collectPageErrors(page)
		await openControlsOnLoad(page)
		await gotoReady(page)

		await expect(page).toHaveTitle(/ドローン飛行シミュレーター/)
		await expect(page.locator('#map')).toBeVisible()
		await expect(page.locator('#controls')).toHaveClass(/visible/)
		await expect(page.locator('#startFlightPlan')).toBeVisible()
		await expect(page.locator('#flightPlanSelect')).toBeVisible()
		expect(errors).toEqual([])
	})

	test('標高タイルを取得し、ウェイポイントの地表標高を表示する', async ({ page }) => {
		const demStatuses: number[] = []
		page.on('response', res => {
			if (res.url().includes(DEM_TILE_HOST)) demStatuses.push(res.status())
		})
		await page.goto('/')

		await expect.poll(() => demStatuses.length, { timeout: 30_000 }).toBeGreaterThan(0)
		expect(demStatuses.every(s => s === 200)).toBe(true)

		// 初期プランの離陸地点は東京タワー付近。地形が読めていれば地表標高は 0 を超える
		const firstGround = page.locator('.plan-ground').first()
		await expect
			.poll(async () => Number.parseFloat((await firstGround.textContent()) ?? ''), {
				timeout: 30_000,
			})
			.toBeGreaterThan(1)
	})

	test('フライトプランを開始・一時停止・再開できる', async ({ page }) => {
		await openControlsOnLoad(page)
		await gotoReady(page)
		// 開始直後に各フェーズのログが続くため、最新行ではなくログ全体から探す
		// 飛行中はヘッドレスの WebGL 描画で操作可能判定が詰まりやすいため、クリックはイベントで送る
		const logEntry = (text: string) => page.locator('.log-entry', { hasText: text }).first()

		await page.locator('#startFlightPlan').dispatchEvent('click')
		await expect(logEntry('を開始します')).toBeAttached()
		// 開始と一時停止は同じ位置に一方だけ出る
		await expect(page.locator('#startFlightPlan')).toBeHidden()
		await expect(page.locator('#pauseFlightPlan')).toBeVisible()

		await page.locator('#pauseFlightPlan').dispatchEvent('click')
		await expect(logEntry('一時停止')).toBeAttached()
		await expect(page.locator('#pauseFlightPlan')).toBeHidden()
		await expect(page.locator('#startFlightPlan')).toBeVisible()

		await page.locator('#startFlightPlan').dispatchEvent('click')
		// 1 フェーズ目で止めた場合は先頭からの開始として記録されるため、どちらの文言も受け入れる
		await expect(
			page.locator('.log-entry', { hasText: /を開始します|から再開します/ })
		).toHaveCount(2)
	})

	test('プリセットのフライトプランを切り替えられる', async ({ page }) => {
		await openControlsOnLoad(page)
		await gotoReady(page)
		await page.locator('#flightPlanSelect').selectOption('mt-fuji')
		await expect(page.locator('.log-entry-latest')).toContainText('富士山')
	})

	test('ヘルプを開閉できる', async ({ page }) => {
		await openControlsOnLoad(page)
		await gotoReady(page)
		const overlay = page.locator('#helpModalOverlay')

		await page.locator('#helpButton').click()
		await expect(overlay).toHaveClass(/visible/)
		await overlay.click({ position: { x: 5, y: 5 } })
		await expect(overlay).not.toHaveClass(/visible/)
	})
})

test.describe('スマートフォン', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

	test('モバイル用の画面で起動する', async ({ page }) => {
		const errors = collectPageErrors(page)
		await page.goto('/')

		await expect(page.locator('#map')).toBeVisible()
		await expect(page.getByRole('button', { name: /開始/ }).first()).toBeVisible()
		expect(errors).toEqual([])
	})
})
