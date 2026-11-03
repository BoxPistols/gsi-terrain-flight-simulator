/**
 * WebGL が使えるかを地図の初期化より前に調べ、使えないときの理由を見立てる。
 *
 * 判定と案内の分け方は BoxPistols/drone-show-simulator（#54 の browser.ts / WebglNotice）を
 * もとに、MapLibre / Mapbox の要件とこのアプリの起動手順に合わせて直したもの。
 */

export type BrowserKind = 'chrome' | 'edge' | 'firefox' | 'safari' | 'opera' | 'samsung' | 'other'
export type PlatformKind = 'ios' | 'android' | 'desktop'

/**
 * 案内をどのブラウザ向けに出すかを UA から決める。
 * Edge・Opera・Samsung Internet の UA にも "Chrome" が入るので、それらを先に見る。
 */
export function detectBrowser(ua: string): BrowserKind {
	if (/Edg(e|A|iOS)?\//.test(ua)) return 'edge'
	if (/OPR\/|OPT\/|Opera\//.test(ua)) return 'opera'
	if (/SamsungBrowser\//.test(ua)) return 'samsung'
	if (/Firefox\/|FxiOS\//.test(ua)) return 'firefox'
	if (/Chrome\/|CriOS\//.test(ua)) return 'chrome'
	if (/Safari\//.test(ua)) return 'safari'
	return 'other'
}

/** iPadOS の Safari は Mac と同じ UA を名乗るので、タッチ点の数で見分ける */
export function detectPlatform(ua: string, maxTouchPoints = 0): PlatformKind {
	if (/iPhone|iPad|iPod/.test(ua)) return 'ios'
	if (/Macintosh/.test(ua) && maxTouchPoints > 1) return 'ios'
	if (/Android/.test(ua)) return 'android'
	return 'desktop'
}

/** 地図エンジンが要る WebGL の版。MapLibre は 2 が無ければ 1 で動くが、Mapbox GL v3 は 2 が必須 */
export type WebglRequirement = 'webgl' | 'webgl2'

export type WebglProbe = {
	webgl2: boolean
	webgl1: boolean
	/** WebGLRenderingContext などの API 自体があるか */
	apiPresent: boolean
	/** ブラウザが webglcontextcreationerror で返した説明（ブラウザにより空） */
	statusMessage: string
}

type ProbeCanvas = Pick<
	HTMLCanvasElement,
	'getContext' | 'addEventListener' | 'removeEventListener'
>

export type ProbeEnv = {
	createCanvas: () => ProbeCanvas
	apiPresent: boolean
}

function defaultProbeEnv(): ProbeEnv {
	const w = window as unknown as Record<string, unknown>
	return {
		createCanvas: () => document.createElement('canvas'),
		apiPresent:
			typeof w.WebGLRenderingContext !== 'undefined' ||
			typeof w.WebGL2RenderingContext !== 'undefined',
	}
}

/**
 * 実際に context を作って確かめる。API の有無だけでは、ハードウェアアクセラレーションが
 * オフの環境や GPU ブロックリストの環境を見分けられないため。
 */
export function probeWebgl(env: ProbeEnv = defaultProbeEnv()): WebglProbe {
	const canvas = env.createCanvas()
	let statusMessage = ''
	const onError = (e: Event) => {
		const msg = (e as WebGLContextEvent).statusMessage
		if (msg && !statusMessage) statusMessage = msg
	}
	canvas.addEventListener('webglcontextcreationerror', onError)

	const tryContext = (type: 'webgl2' | 'webgl'): boolean => {
		try {
			const gl = canvas.getContext(type) as WebGLRenderingContext | null
			if (!gl) return false
			// 調べるためだけの context なので手放す。ブラウザはページあたりの context 数に上限がある
			gl.getExtension?.('WEBGL_lose_context')?.loseContext()
			return true
		} catch {
			return false
		}
	}

	// 1 つの canvas で webgl2 を取ると webgl は取れない（逆も同じ）ので、webgl1 は別の canvas で見る
	const webgl2 = tryContext('webgl2')
	canvas.removeEventListener('webglcontextcreationerror', onError)
	let webgl1 = webgl2
	if (!webgl2) {
		const canvas1 = env.createCanvas()
		canvas1.addEventListener('webglcontextcreationerror', onError)
		try {
			const gl = canvas1.getContext('webgl') as WebGLRenderingContext | null
			webgl1 = !!gl
			gl?.getExtension?.('WEBGL_lose_context')?.loseContext()
		} catch {
			webgl1 = false
		}
		canvas1.removeEventListener('webglcontextcreationerror', onError)
	}

	return { webgl2, webgl1, apiPresent: env.apiPresent, statusMessage }
}

export function meetsRequirement(probe: WebglProbe, requirement: WebglRequirement): boolean {
	return requirement === 'webgl2' ? probe.webgl2 : probe.webgl2 || probe.webgl1
}

/**
 * 3D 地図を出せなかった理由。
 * - api-missing: WebGL の機能そのものが無い（設定・拡張機能・管理ポリシー・ロックダウンモード）
 * - disabled: 管理ポリシーや起動オプション、about:config で明示的に切られている
 * - blocked: GPU の処理が落ちたあと、ブラウザがこのサイトの WebGL を一時的に止めている
 * - creation-failed: 機能はあるが GPU を使えない（ハードウェアアクセラレーションがオフ、ドライバが対応外など）
 * - webgl2-required: WebGL 1 は使えるが、選んでいる地図エンジン（Mapbox GL）が WebGL 2 を要る
 * - context-lost: 表示の途中で GPU の処理が止まり、戻らなかった
 * - load-failed: アプリのスクリプトを取得できなかった（ネットワーク・フィルタ・拡張機能）
 * - unknown: 上のどれとも言えない
 */
export type WebglFailureKind =
	| 'api-missing'
	| 'disabled'
	| 'blocked'
	| 'creation-failed'
	| 'webgl2-required'
	| 'context-lost'
	| 'load-failed'
	| 'unknown'

export type WebglFailure = {
	kind: WebglFailureKind
	/** ブラウザやライブラリが返した説明。画面では「技術的な情報」の中にだけ出す */
	detail: string
	/** iframe の中で開かれているか。埋め込み先の制限を疑ってよいのはこのときだけ */
	embedded: boolean
}

export function diagnoseWebglFailure(
	probe: Pick<WebglProbe, 'apiPresent' | 'statusMessage' | 'webgl1' | 'webgl2'>,
	requirement: WebglRequirement,
	embedded: boolean
): WebglFailure {
	const detail = probe.statusMessage.trim()
	if (requirement === 'webgl2' && !probe.webgl2 && probe.webgl1)
		return { kind: 'webgl2-required', detail, embedded }
	return { kind: classifyStatus(probe.apiPresent, detail), detail, embedded }
}

function classifyStatus(apiPresent: boolean, detail: string): WebglFailureKind {
	if (!apiPresent) return 'api-missing'
	// Chrome: "disabled by enterprise policy or commandline switch"
	if (/enterprise policy|commandline switch|webgl\.disabled/i.test(detail)) return 'disabled'
	// Chrome: "Web page caused context loss and was blocked"。"was blocked" だけだと CSP などの文言にも当たるので前半で見る
	if (/caused context loss/i.test(detail)) return 'blocked'
	return 'creation-failed'
}

/**
 * MapLibre は context を作れないと、詳細を JSON 文字列にした Error を投げる。
 * 利用者にはそのまま見せず、statusMessage だけを取り出して見立てに使う。
 */
export function parseMapInitError(error: unknown): { isWebgl: boolean; statusMessage: string } {
	const message = error instanceof Error ? error.message : String(error ?? '')
	if (message.startsWith('{')) {
		try {
			const parsed = JSON.parse(message) as { statusMessage?: unknown; message?: unknown }
			const inner = typeof parsed.message === 'string' ? parsed.message : ''
			const status = typeof parsed.statusMessage === 'string' ? parsed.statusMessage : ''
			if (/webgl/i.test(inner) || status) return { isWebgl: true, statusMessage: status }
		} catch {
			// JSON でなければ下の文言判定に回す
		}
	}
	return { isWebgl: /webgl/i.test(message), statusMessage: '' }
}

/** 動的 import の取得失敗（ブラウザごとに文言が違う） */
export function isModuleLoadError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error ?? '')
	return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(
		message
	)
}

/** ページ読み込み後に出た理由を、起動時の probe と同じ形にまとめる */
export function failureFromInitError(
	error: unknown,
	apiPresent: boolean,
	embedded: boolean
): WebglFailure {
	if (isModuleLoadError(error)) {
		return { kind: 'load-failed', detail: errorText(error), embedded }
	}
	const { isWebgl, statusMessage } = parseMapInitError(error)
	if (isWebgl) {
		return {
			kind: classifyStatus(apiPresent, statusMessage),
			detail: statusMessage || errorText(error),
			embedded,
		}
	}
	return { kind: 'unknown', detail: errorText(error), embedded }
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error ?? '')
}

/** iframe の中か。別オリジンの親だと window.top へのアクセスが例外になるので、そのときも埋め込みとみなす */
export function isEmbedded(win: Window = window): boolean {
	try {
		return win.self !== win.top
	} catch {
		return true
	}
}

// 日本語の文章は 1 手順 1 行に収める。{ code } は chrome:// などページからリンクできない文字で、
// 選んでコピーできる形で出す
export type Segment = string | { code: string }
export type Line = Segment[]
export type Guide = { steps: Line[]; verify?: Line; note?: Line }

const NAMES: Record<BrowserKind, string> = {
	chrome: 'Chrome',
	edge: 'Edge',
	firefox: 'Firefox',
	safari: 'Safari',
	opera: 'Opera',
	samsung: 'Samsung Internet',
	other: 'ブラウザ',
}

const RESTART_NOTE: Line = ['オンでも出ないときは、ブラウザを完全に終了して開き直してください。']

/** OS とブラウザの組み合わせごとの、3D 表示（ハードウェアアクセラレーション）の戻し方 */
export function guideFor(browser: BrowserKind, platform: PlatformKind): Guide {
	if (platform === 'ios') {
		// iOS のブラウザはすべて中身が Safari なので、設定は端末側
		const name = browser === 'other' ? 'お使いのブラウザ' : NAMES[browser]
		return {
			steps: [
				['「設定」→「プライバシーとセキュリティ」で「ロックダウンモード」を確認'],
				browser === 'safari'
					? ['オンなら、アドレスバー左の「ぁあ」→「Web サイトの設定」で、このサイトだけオフ']
					: [`オンなら、ロックダウンモードの「Web ブラウズを設定」で ${name} を除外`],
				['iOS / iPadOS を最新にして、ブラウザを開き直す'],
			],
		}
	}
	if (platform === 'android') {
		return {
			steps: [
				['Google Play でブラウザを、設定で Android を最新にする'],
				['ブラウザを最近使ったアプリの一覧から閉じて、開き直す'],
				['直らなければ、別の端末かパソコンで見る'],
			],
		}
	}
	switch (browser) {
		case 'chrome':
			return {
				steps: [
					[{ code: 'chrome://settings/system' }, ' を開く'],
					['「グラフィック アクセラレーションが使用可能な場合は使用する」をオン'],
					['横に出る「再起動」を押す'],
				],
				verify: [{ code: 'chrome://gpu' }, ' の「WebGL」が「Hardware accelerated」なら有効です'],
				note: [
					'Brave は ',
					{ code: 'brave://settings/system' },
					' で同じ手順です。',
					...RESTART_NOTE,
				],
			}
		case 'edge':
			return {
				steps: [
					[{ code: 'edge://settings/system' }, ' を開く'],
					['「グラフィック アクセラレーションが使用可能な場合は使用する」をオン'],
					['Edge を再起動する'],
				],
				verify: [{ code: 'edge://gpu' }, ' の「WebGL」が「Hardware accelerated」なら有効です'],
				note: RESTART_NOTE,
			}
		case 'opera':
			return {
				steps: [
					[{ code: 'opera://settings' }, ' を開き、「ハードウェア」で検索'],
					['「ハードウェアアクセラレーションを使用する」をオン'],
					['Opera を再起動する'],
				],
				note: RESTART_NOTE,
			}
		case 'firefox':
			return {
				steps: [
					['「設定」→「一般」→「パフォーマンス」を開く'],
					[
						'「推奨のパフォーマンス設定を使用する」を外し、「ハードウェアアクセラレーションを使用する」をオン',
					],
					['Firefox を再起動する'],
				],
				verify: [{ code: 'about:support' }, ' の「グラフィック」で WebGL の項目を確認できます'],
				note: [
					'まだ出ないときは ',
					{ code: 'about:config' },
					' で ',
					{ code: 'webgl.disabled' },
					' を false に戻す',
				],
			}
		case 'safari':
			return {
				steps: [
					[
						'ロックダウンモードがオンなら、Safari の「設定」→「Web サイト」→「ロックダウンモード」で、このサイトだけオフ',
					],
					['macOS を最新にして、Safari を開き直す'],
				],
			}
		default:
			return {
				steps: [
					['ブラウザの設定を開き、「ハードウェア」で検索'],
					['ハードウェア（グラフィック）アクセラレーションをオン'],
					['ブラウザを再起動する'],
				],
				note: RESTART_NOTE,
			}
	}
}

/** WebGL の設定で直る種類か。ネットワークや原因不明のときに GPU 設定の手順を出すと誤った案内になる */
export function isSettingsIssue(kind: WebglFailureKind): boolean {
	return kind === 'api-missing' || kind === 'disabled' || kind === 'creation-failed'
}

/** 画面上部の状態の知らせ。端末や設定のせいと言えるのは、設定で直る種類のときだけ */
export function statusTitle(kind: WebglFailureKind): string {
	switch (kind) {
		case 'api-missing':
		case 'disabled':
		case 'creation-failed':
			return 'この環境では 3D 地図を表示できません'
		case 'webgl2-required':
			return '選んでいる地図エンジンでは 3D 地図を表示できません'
		case 'blocked':
			return 'ブラウザが 3D 表示を一時的に止めています'
		case 'context-lost':
			return '表示の途中で 3D 地図が止まりました'
		case 'load-failed':
			return 'アプリを読み込めませんでした'
		case 'unknown':
			return '3D 地図を起動できませんでした'
	}
}

/**
 * 設定で直る種類以外の直し方。設定が正しくても起きるものに、ハードウェアアクセラレーションの手順は出さない。
 * webgl2-required は切り替えボタンそのものが直し方なので手順を持たない
 */
export function recoveryGuide(kind: WebglFailureKind): Guide | null {
	switch (kind) {
		case 'blocked':
			return {
				steps: [['ブラウザを完全に終了して、開き直す'], ['このページをもう一度開く']],
				note: ['何度も止まるときは、ブラウザと OS（グラフィックドライバ）を最新にしてください。'],
			}
		case 'context-lost':
			return {
				steps: [
					['3D を使うほかのタブやアプリを閉じる'],
					['「もう一度試す」を押して、ページを読み込み直す'],
				],
				note: ['何度も起きるときは、ブラウザを完全に終了して開き直してください。'],
			}
		case 'load-failed':
			return {
				steps: [
					['インターネットにつながっているか確かめる'],
					['広告ブロックなどの拡張機能を止めて、もう一度試す'],
					['会社のネットワークでは、別の回線（スマートフォンなど）で試す'],
				],
			}
		case 'unknown':
			return {
				steps: [
					['「もう一度試す」を押して、ページを読み込み直す'],
					['直らなければ、時間をおいて開き直す'],
				],
			}
		default:
			return null
	}
}

/**
 * 設定を変える前に読んでほしいこと。Apple 端末の手順はロックダウンモードの解除なので、
 * 守りの機能を弱めることを「安全」とは言わず、解除してよい場面を限る
 */
export function safetyNote(
	platform: PlatformKind,
	browser: BrowserKind
): { title: string; body: string } {
	if (platform === 'ios' || browser === 'safari') {
		return {
			title: 'ロックダウンモードを解除する前に',
			body: 'ロックダウンモードは、標的型の攻撃に備えてブラウザの機能を絞る仕組みです。解除するのは信頼できるサイトだけにしてください。解除しなくても、録画したデモで動きを確認できます。',
		}
	}
	return {
		title: '有効にしても安全です',
		body: 'WebGL は主要なブラウザに標準で入っている機能です。有効にしても、サイトが端末のファイルやほかのタブに触れることはありません。',
	}
}

/** 「なぜ使えないのか」の見立てを 1〜2 文で */
export function causeText(
	kind: WebglFailureKind,
	platform: PlatformKind,
	browser: BrowserKind
): string {
	const apple = platform === 'ios' || browser === 'safari'
	switch (kind) {
		case 'api-missing':
			return apple
				? 'このブラウザでは WebGL が止められています。多くはロックダウンモードが原因です。'
				: 'このブラウザでは WebGL が止められています。ブラウザの設定、拡張機能、管理者の設定などが原因です。'
		case 'disabled':
			return '設定や管理者のポリシーで WebGL が止められています。会社や学校の端末なら管理者にご相談ください。'
		case 'blocked':
			return 'グラフィックの不具合のため、ブラウザが WebGL を一時的に止めています。ブラウザを完全に終了して開き直すと戻ります。'
		case 'creation-failed':
			return platform === 'desktop'
				? 'GPU を使えない状態です。ハードウェアアクセラレーションがオフ、ドライバが対応外、リモート環境などが考えられます。'
				: '端末のグラフィック機能を使えない状態です。ブラウザや OS が古い可能性があります。'
		case 'webgl2-required':
			return '地図エンジンに Mapbox GL を選んでいますが、このブラウザは Mapbox GL が必要とする WebGL 2 を使えません。MapLibre GL なら表示できます。'
		case 'context-lost':
			return '表示の途中でグラフィックの処理が止まり、戻りませんでした。GPU のリセットやメモリ不足で起きます。'
		case 'load-failed':
			return 'アプリの読み込みに失敗しました。ネットワークの切断や、社内のフィルタ・拡張機能による通信の遮断が考えられます。'
		case 'unknown':
			return '起動中に問題が起きました。原因は特定できていません。'
	}
}
