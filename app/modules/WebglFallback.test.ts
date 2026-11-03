import { afterEach, describe, expect, test, vi } from 'vitest'
import {
	FALLBACK_ID,
	HIGHLIGHTS,
	removeWebglFallback,
	renderWebglFallback,
	VALUE_PROPOSITION,
} from './WebglFallback'
import { bootApp, watchContextLoss } from './boot-flow'
import type { WebglFailure } from './webgl-support'

const IPHONE =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1'
const CHROME_MAC =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36'
const media = { video: '/v.mp4', poster: '/p.jpg', captions: '/c.vtt' }
const failure = (kind: WebglFailure['kind'], embedded = false): WebglFailure => ({
	kind,
	detail: 'disabled by enterprise policy or commandline switch',
	embedded,
})

afterEach(() => {
	document.body.innerHTML = ''
	delete document.documentElement.dataset.webgl
	vi.useRealTimers()
	vi.restoreAllMocks()
})

describe('renderWebglFallback', () => {
	test('プロダクトの説明・デモ動画・字幕・操作ボタンを出す', () => {
		const root = renderWebglFallback({
			failure: failure('disabled'),
			media,
			userAgent: CHROME_MAC,
			reducedMotion: true,
		})
		expect(root.id).toBe(FALLBACK_ID)
		expect(document.documentElement.dataset.webgl).toBe('unavailable')
		expect(root.querySelector('h1')?.textContent).toBe(VALUE_PROPOSITION)
		expect(root.querySelectorAll('.wgf-highlights li')).toHaveLength(HIGHLIGHTS.length)

		const video = root.querySelector('video')!
		expect(video.getAttribute('playsinline')).toBe('')
		expect(video.muted).toBe(true)
		expect(video.controls).toBe(true)
		expect(video.preload).toBe('none')
		expect(video.getAttribute('poster')).toBe('/p.jpg')
		expect(video.querySelector('source')?.getAttribute('type')).toBe('video/mp4')
		const track = video.querySelector('track')!
		expect(track.getAttribute('kind')).toBe('captions')
		expect(track.getAttribute('srclang')).toBe('ja')

		expect(root.querySelector('button[data-action="retry"]')?.textContent).toContain('もう一度試す')
		const repo = root.querySelector<HTMLAnchorElement>('a[href*="github.com"]')!
		expect(repo.rel).toContain('noopener')
	})

	test('利用者向けの文面にエラーの JSON を出さない', () => {
		const root = renderWebglFallback({
			failure: { ...failure('disabled'), detail: '{"statusMessage":"x"}' },
			media,
			userAgent: CHROME_MAC,
			reducedMotion: true,
		})
		const visible = Array.from(root.querySelectorAll('p, li, h1, h2, h3'))
			.map(n => n.textContent)
			.join('\n')
		expect(visible).not.toContain('{')
		// 詳細は閉じた「技術的な情報」の中だけ
		expect(root.querySelector('details code')?.textContent).toContain('{"statusMessage":"x"}')
	})

	test('Chrome では設定画面と chrome://gpu を案内する', () => {
		const root = renderWebglFallback({
			failure: failure('creation-failed'),
			media,
			userAgent: CHROME_MAC,
			reducedMotion: true,
		})
		const codes = Array.from(root.querySelectorAll('.wgf-help code')).map(c => c.textContent)
		expect(codes).toContain('chrome://settings/system')
		expect(codes).toContain('chrome://gpu')
	})

	test('埋め込み表示のときだけ「新しいタブで開く」を出す', () => {
		const top = renderWebglFallback({
			failure: failure('creation-failed'),
			media,
			userAgent: CHROME_MAC,
			reducedMotion: true,
		})
		expect(top.textContent).not.toContain('新しいタブで開く')
		const embedded = renderWebglFallback({
			failure: failure('creation-failed', true),
			media,
			userAgent: CHROME_MAC,
			reducedMotion: true,
		})
		expect(embedded.textContent).toContain('このページを新しいタブで開く')
		// 描き直しても 1 つだけ
		expect(document.querySelectorAll(`#${FALLBACK_ID}`)).toHaveLength(1)
	})

	test('ネットワークの失敗では GPU 設定の手順を出さない', () => {
		const root = renderWebglFallback({
			failure: failure('load-failed'),
			media,
			userAgent: CHROME_MAC,
			reducedMotion: true,
		})
		expect(root.textContent).not.toContain('chrome://settings/system')
		expect(root.textContent).toContain('拡張機能')
	})

	test.each(['load-failed', 'unknown', 'context-lost', 'blocked'] as const)(
		'%s では端末のせいにせず、ハードウェアアクセラレーションの手順も出さない',
		kind => {
			const root = renderWebglFallback({
				failure: failure(kind),
				media,
				userAgent: CHROME_MAC,
				reducedMotion: true,
			})
			expect(root.querySelector('.wgf-status-title')?.textContent).not.toContain('この環境では')
			expect(root.textContent).not.toContain('chrome://settings/system')
			expect(root.textContent).not.toContain('有効にしても安全です')
			expect(root.querySelectorAll('.wgf-steps li').length).toBeGreaterThan(0)
		}
	)

	test('Apple 端末ではロックダウンモードの解除を「安全」と言わず、信頼できるサイトに限る', () => {
		const root = renderWebglFallback({
			failure: failure('api-missing'),
			media,
			userAgent: IPHONE,
			maxTouchPoints: 5,
			reducedMotion: true,
		})
		expect(root.textContent).toContain('ロックダウンモード')
		expect(root.textContent).not.toContain('安全です')
		expect(root.textContent).toContain('信頼できるサイトだけ')
	})

	test('removeWebglFallback で案内を外し、アプリ本体を見せ直す', () => {
		renderWebglFallback({
			failure: failure('context-lost'),
			media,
			userAgent: CHROME_MAC,
			reducedMotion: true,
		})
		removeWebglFallback()
		expect(document.getElementById(FALLBACK_ID)).toBeNull()
		expect(document.documentElement.dataset.webgl).toBeUndefined()
	})

	test('WebGL 2 が無く Mapbox GL を選んでいるときは切り替えボタンを出す', () => {
		const onSwitch = vi.fn()
		const root = renderWebglFallback({
			failure: failure('webgl2-required'),
			media,
			userAgent: CHROME_MAC,
			reducedMotion: true,
			onSwitchToMaplibre: onSwitch,
		})
		const btn = Array.from(root.querySelectorAll('button')).find(b =>
			b.textContent?.includes('MapLibre GL に切り替えて')
		)!
		btn.click()
		expect(onSwitch).toHaveBeenCalledOnce()
	})

	test('「もう一度試す」で onRetry を呼ぶ', () => {
		const onRetry = vi.fn()
		const root = renderWebglFallback({
			failure: failure('disabled'),
			media,
			userAgent: CHROME_MAC,
			reducedMotion: true,
			onRetry,
		})
		root.querySelector<HTMLButtonElement>('button[data-action="retry"]')!.click()
		expect(onRetry).toHaveBeenCalledOnce()
	})

	test('動きを減らす設定では自動再生しない', () => {
		const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
		const root = renderWebglFallback({
			failure: failure('disabled'),
			media,
			userAgent: CHROME_MAC,
			reducedMotion: true,
		})
		expect(play).not.toHaveBeenCalled()
		expect(root.querySelector('video')!.loop).toBe(false)
	})

	test('動きを減らす設定でなければ、見える位置に来たときに再生する', () => {
		const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
		let callback: IntersectionObserverCallback = () => {}
		const observe = vi.fn()
		vi.stubGlobal(
			'IntersectionObserver',
			class {
				constructor(cb: IntersectionObserverCallback) {
					callback = cb
				}
				observe = observe
				disconnect() {}
			}
		)
		renderWebglFallback({
			failure: failure('disabled'),
			media,
			userAgent: CHROME_MAC,
			reducedMotion: false,
		})
		expect(observe).toHaveBeenCalledOnce()
		expect(play).not.toHaveBeenCalled()
		callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
		expect(play).toHaveBeenCalledOnce()
		vi.unstubAllGlobals()
	})
})

describe('bootApp', () => {
	const ok = { webgl2: true, webgl1: true, apiPresent: true, statusMessage: '' }
	const none = { webgl2: false, webgl1: false, apiPresent: true, statusMessage: 'x' }

	test('WebGL が無ければ本体を読み込まずに案内を出す', async () => {
		const loadApp = vi.fn()
		const showFallback = vi.fn()
		const result = await bootApp({
			requirement: 'webgl',
			loadApp,
			showFallback,
			probe: () => none,
			embedded: () => false,
		})
		expect(result).toBe('fallback')
		expect(loadApp).not.toHaveBeenCalled()
		expect(showFallback.mock.calls[0][0].kind).toBe('creation-failed')
	})

	test('WebGL があれば本体を読み込む', async () => {
		const loadApp = vi.fn().mockResolvedValue({})
		const showFallback = vi.fn()
		const result = await bootApp({
			requirement: 'webgl',
			loadApp,
			showFallback,
			probe: () => ok,
			embedded: () => false,
		})
		expect(result).toBe('app')
		expect(showFallback).not.toHaveBeenCalled()
	})

	test('本体の初期化で地図が WebGL を作れなかったときも案内に切り替える', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {})
		const showFallback = vi.fn()
		const err = new Error(
			JSON.stringify({
				statusMessage: 'Web page caused context loss and was blocked',
				message: 'Failed to initialize WebGL',
			})
		)
		const result = await bootApp({
			requirement: 'webgl',
			loadApp: () => Promise.reject(err),
			showFallback,
			probe: () => ok,
			embedded: () => false,
		})
		expect(result).toBe('fallback')
		expect(showFallback.mock.calls[0][0].kind).toBe('blocked')
	})
})

describe('watchContextLoss', () => {
	// happy-dom の getter を vi.spyOn で差し替えると、元に戻したあと再帰して落ちるので、インスタンスに直接載せて外す
	const stubVisibility = (get: () => DocumentVisibilityState) =>
		Object.defineProperty(document, 'visibilityState', { get, configurable: true })
	afterEach(() => {
		delete (document as unknown as Record<string, unknown>).visibilityState
	})

	test('context が戻らなければ一定時間後に案内を出す', () => {
		vi.useFakeTimers()
		const show = vi.fn()
		const stop = watchContextLoss(document, 1000, false, show)
		const canvas = document.body.appendChild(document.createElement('canvas'))
		canvas.dispatchEvent(new Event('webglcontextlost'))
		vi.advanceTimersByTime(999)
		expect(show).not.toHaveBeenCalled()
		vi.advanceTimersByTime(1)
		expect(show.mock.calls[0][0].kind).toBe('context-lost')
		stop()
	})

	test('ページが隠れている間は時間を数えない', () => {
		vi.useFakeTimers()
		let visibility: DocumentVisibilityState = 'visible'
		stubVisibility(() => visibility)
		const show = vi.fn()
		const stop = watchContextLoss(document, 1000, false, show)
		const canvas = document.body.appendChild(document.createElement('canvas'))
		canvas.dispatchEvent(new Event('webglcontextlost'))
		vi.advanceTimersByTime(600)
		visibility = 'hidden'
		document.dispatchEvent(new Event('visibilitychange'))
		vi.advanceTimersByTime(10_000)
		expect(show).not.toHaveBeenCalled()
		visibility = 'visible'
		document.dispatchEvent(new Event('visibilitychange'))
		vi.advanceTimersByTime(399)
		expect(show).not.toHaveBeenCalled()
		vi.advanceTimersByTime(1)
		expect(show).toHaveBeenCalledTimes(1)
		stop()
	})

	test('隠れている間に失っても、見えるまでは数え始めない', () => {
		vi.useFakeTimers()
		let visibility: DocumentVisibilityState = 'hidden'
		stubVisibility(() => visibility)
		const show = vi.fn()
		const stop = watchContextLoss(document, 1000, false, show)
		const canvas = document.body.appendChild(document.createElement('canvas'))
		canvas.dispatchEvent(new Event('webglcontextlost'))
		vi.advanceTimersByTime(5000)
		expect(show).not.toHaveBeenCalled()
		visibility = 'visible'
		document.dispatchEvent(new Event('visibilitychange'))
		vi.advanceTimersByTime(1000)
		expect(show).toHaveBeenCalledTimes(1)
		stop()
	})

	test('案内を出したあとで戻ったら、案内を外す', () => {
		vi.useFakeTimers()
		const show = vi.fn()
		const hide = vi.fn()
		const stop = watchContextLoss(document, 1000, false, show, hide)
		const canvas = document.body.appendChild(document.createElement('canvas'))
		canvas.dispatchEvent(new Event('webglcontextlost'))
		vi.advanceTimersByTime(1000)
		expect(show).toHaveBeenCalledTimes(1)
		canvas.dispatchEvent(new Event('webglcontextrestored'))
		expect(hide).toHaveBeenCalledTimes(1)
		// もう一度失えば、また数え直す
		canvas.dispatchEvent(new Event('webglcontextlost'))
		vi.advanceTimersByTime(1000)
		expect(show).toHaveBeenCalledTimes(2)
		stop()
	})

	test('時間内に戻れば何もしない', () => {
		vi.useFakeTimers()
		const show = vi.fn()
		const stop = watchContextLoss(document, 1000, false, show)
		const canvas = document.body.appendChild(document.createElement('canvas'))
		canvas.dispatchEvent(new Event('webglcontextlost'))
		vi.advanceTimersByTime(500)
		canvas.dispatchEvent(new Event('webglcontextrestored'))
		vi.advanceTimersByTime(2000)
		expect(show).not.toHaveBeenCalled()
		stop()
	})
})
