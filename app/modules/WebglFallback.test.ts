import { afterEach, describe, expect, test, vi } from 'vitest'
import { FALLBACK_ID, HIGHLIGHTS, renderWebglFallback, VALUE_PROPOSITION } from './WebglFallback'
import { bootApp, watchContextLoss } from './boot-flow'
import type { WebglFailure } from './webgl-support'

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
