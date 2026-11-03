import { describe, expect, test, vi } from 'vitest'
import {
	causeText,
	detectBrowser,
	detectPlatform,
	diagnoseWebglFailure,
	failureFromInitError,
	guideFor,
	isEmbedded,
	isModuleLoadError,
	isSettingsIssue,
	meetsRequirement,
	parseMapInitError,
	probeWebgl,
	type ProbeEnv,
} from './webgl-support'

const UA = {
	chromeMac:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
	edgeWin:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36 Edg/156.0.0.0',
	firefoxWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
	safariMac:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15',
	iphoneChrome:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/156.0 Mobile/15E148 Safari/604.1',
	android:
		'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36',
}

/**
 * getContext を差し替えた偽の canvas。
 * 実ブラウザと同じく、失敗するときは getContext の中で webglcontextcreationerror を同期的に発火する。
 */
function fakeEnv(opts: {
	webgl2?: boolean
	webgl1?: boolean
	statusMessage?: string
	apiPresent?: boolean
	throws?: boolean
}): ProbeEnv & { loseContext: ReturnType<typeof vi.fn>; created: number } {
	const loseContext = vi.fn()
	const env = {
		loseContext,
		created: 0,
		apiPresent: opts.apiPresent ?? true,
		createCanvas: () => {
			env.created++
			const target = new EventTarget()
			return {
				addEventListener: target.addEventListener.bind(target),
				removeEventListener: target.removeEventListener.bind(target),
				getContext: ((type: string) => {
					if (opts.throws) throw new Error('boom')
					const ok = type === 'webgl2' ? opts.webgl2 : opts.webgl1
					if (ok) return { getExtension: () => ({ loseContext }) }
					const ev = new Event('webglcontextcreationerror') as Event & { statusMessage?: string }
					ev.statusMessage = opts.statusMessage ?? ''
					target.dispatchEvent(ev)
					return null
				}) as HTMLCanvasElement['getContext'],
			}
		},
	}
	return env
}

describe('probeWebgl', () => {
	test('WebGL 2 が使えれば context を手放して true を返す', () => {
		const env = fakeEnv({ webgl2: true, webgl1: true })
		const probe = probeWebgl(env)
		expect(probe).toMatchObject({ webgl2: true, webgl1: true, statusMessage: '' })
		expect(env.loseContext).toHaveBeenCalledTimes(1)
		expect(env.created).toBe(1)
	})

	test('WebGL 2 が無いときは別の canvas で WebGL 1 を確かめる', () => {
		const env = fakeEnv({ webgl2: false, webgl1: true })
		const probe = probeWebgl(env)
		expect(probe).toMatchObject({ webgl2: false, webgl1: true })
		expect(env.created).toBe(2)
	})

	test('どちらも無いときはブラウザの statusMessage を拾う', () => {
		const probe = probeWebgl(
			fakeEnv({ statusMessage: 'disabled by enterprise policy or commandline switch' })
		)
		expect(probe).toEqual({
			webgl2: false,
			webgl1: false,
			apiPresent: true,
			statusMessage: 'disabled by enterprise policy or commandline switch',
		})
	})

	test('getContext が例外を投げても落ちない', () => {
		const probe = probeWebgl(fakeEnv({ throws: true }))
		expect(probe.webgl2).toBe(false)
		expect(probe.webgl1).toBe(false)
	})
})

describe('meetsRequirement', () => {
	const base = { apiPresent: true, statusMessage: '' }
	test('MapLibre は WebGL 1 だけでも動く', () => {
		expect(meetsRequirement({ ...base, webgl2: false, webgl1: true }, 'webgl')).toBe(true)
	})
	test('Mapbox GL は WebGL 2 が要る', () => {
		expect(meetsRequirement({ ...base, webgl2: false, webgl1: true }, 'webgl2')).toBe(false)
		expect(meetsRequirement({ ...base, webgl2: true, webgl1: true }, 'webgl2')).toBe(true)
	})
})

describe('diagnoseWebglFailure', () => {
	const none = { webgl2: false, webgl1: false }
	test.each([
		[false, '', 'api-missing'],
		[true, 'disabled by enterprise policy or commandline switch', 'disabled'],
		[true, 'Web page caused context loss and was blocked', 'blocked'],
		// CSP などの「was blocked」はブラウザの一時停止ではない
		[
			true,
			'Refused to load the script because it was blocked by Content Security Policy',
			'creation-failed',
		],
		[true, 'Could not create a WebGL context', 'creation-failed'],
		[true, '', 'creation-failed'],
	] as const)('apiPresent=%s, "%s" → %s', (apiPresent, statusMessage, kind) => {
		expect(diagnoseWebglFailure({ ...none, apiPresent, statusMessage }, 'webgl', false).kind).toBe(
			kind
		)
	})

	test('WebGL 1 はあるが Mapbox GL を選んでいる場合は切り替えで直る種類として分ける', () => {
		const failure = diagnoseWebglFailure(
			{ webgl2: false, webgl1: true, apiPresent: true, statusMessage: '' },
			'webgl2',
			false
		)
		expect(failure.kind).toBe('webgl2-required')
	})

	test('埋め込みかどうかは見立てとは別に持つ', () => {
		const failure = diagnoseWebglFailure(
			{ ...none, apiPresent: true, statusMessage: '' },
			'webgl',
			true
		)
		expect(failure).toEqual({ kind: 'creation-failed', detail: '', embedded: true })
	})
})

describe('MapLibre の初期化エラーの読み取り', () => {
	// MapLibre 5 が実際に投げる形（--disable-webgl の Chromium で採取）
	const maplibreError = new Error(
		JSON.stringify({
			requestedAttributes: { antialias: false, alpha: true },
			statusMessage: 'disabled by enterprise policy or commandline switch',
			type: 'webglcontextcreationerror',
			message: 'Failed to initialize WebGL',
		})
	)

	test('JSON の中から statusMessage を取り出す', () => {
		expect(parseMapInitError(maplibreError)).toEqual({
			isWebgl: true,
			statusMessage: 'disabled by enterprise policy or commandline switch',
		})
	})

	test('詳細の無い "Failed to initialize WebGL" も WebGL の失敗とみなす', () => {
		expect(parseMapInitError(new Error('Failed to initialize WebGL'))).toEqual({
			isWebgl: true,
			statusMessage: '',
		})
	})

	test('利用者向けの見立てには JSON をそのまま入れない', () => {
		const failure = failureFromInitError(maplibreError, true, false)
		expect(failure.kind).toBe('disabled')
		expect(failure.detail).toBe('disabled by enterprise policy or commandline switch')
	})

	test('スクリプトの取得失敗はネットワークの問題として分ける', () => {
		const err = new TypeError(
			'Failed to fetch dynamically imported module: https://example.com/a.js'
		)
		expect(isModuleLoadError(err)).toBe(true)
		expect(failureFromInitError(err, true, false).kind).toBe('load-failed')
	})

	test('WebGL と関係ない例外は原因不明として扱う', () => {
		expect(failureFromInitError(new Error('x is undefined'), true, false).kind).toBe('unknown')
	})
})

describe('isEmbedded', () => {
	test('トップレベルなら false', () => {
		const win = {} as Window
		Object.assign(win, { self: win, top: win })
		expect(isEmbedded(win)).toBe(false)
	})
	test('親が別のウィンドウなら true', () => {
		const win = { top: {} } as unknown as Window
		Object.assign(win, { self: win })
		expect(isEmbedded(win)).toBe(true)
	})
	test('別オリジンの親で top が読めないときも true', () => {
		const win = {} as Window
		Object.defineProperty(win, 'self', { value: win })
		Object.defineProperty(win, 'top', {
			get() {
				throw new DOMException('cross-origin', 'SecurityError')
			},
		})
		expect(isEmbedded(win)).toBe(true)
	})
})

describe('ブラウザ・OS の判定と案内', () => {
	test.each([
		[UA.chromeMac, 'chrome'],
		[UA.edgeWin, 'edge'],
		[UA.firefoxWin, 'firefox'],
		[UA.safariMac, 'safari'],
		[UA.iphoneChrome, 'chrome'],
	] as const)('%s → %s', (ua, browser) => {
		expect(detectBrowser(ua)).toBe(browser)
	})

	test('iPadOS の Safari（Mac の UA）はタッチ点で iOS と見なす', () => {
		expect(detectPlatform(UA.safariMac, 5)).toBe('ios')
		expect(detectPlatform(UA.safariMac, 0)).toBe('desktop')
		expect(detectPlatform(UA.android)).toBe('android')
	})

	test('Chrome の手順は設定画面と chrome://gpu での確かめ方を含む', () => {
		const guide = guideFor('chrome', 'desktop')
		expect(guide.steps[0]).toEqual([{ code: 'chrome://settings/system' }, ' を開く'])
		expect(guide.verify?.[0]).toEqual({ code: 'chrome://gpu' })
	})

	test('Edge は edge:// の画面を案内する', () => {
		expect(guideFor('edge', 'desktop').steps[0][0]).toEqual({ code: 'edge://settings/system' })
	})

	test('iOS ではブラウザに関係なく端末の設定を案内する', () => {
		expect(guideFor('chrome', 'ios').steps[0][0]).toContain('ロックダウンモード')
	})

	test('GPU 設定の手順を出すのは設定で直る種類だけ', () => {
		expect(isSettingsIssue('creation-failed')).toBe(true)
		expect(isSettingsIssue('load-failed')).toBe(false)
		expect(isSettingsIssue('unknown')).toBe(false)
		expect(isSettingsIssue('webgl2-required')).toBe(false)
	})

	test('どの見立てでも「公開 URL で開く」とは言わない', () => {
		const kinds = [
			'api-missing',
			'disabled',
			'blocked',
			'creation-failed',
			'webgl2-required',
			'context-lost',
			'load-failed',
			'unknown',
		] as const
		for (const kind of kinds) {
			expect(causeText(kind, 'desktop', 'chrome')).not.toMatch(/公開|URL/)
		}
	})
})
