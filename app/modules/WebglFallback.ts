/**
 * 3D 地図を出せない環境で、地図の代わりに見せる画面。
 *
 * 初めて訪れた人が「何のアプリで、どう動くのか」を地図なしでも掴めるよう、録画したデモと要点を先に置き、
 * 直し方はその下にまとめる。アプリ本体（地図・操作パネル）は地図が無いと動かないため、表示中は隠す。
 */

import {
	causeText,
	detectBrowser,
	detectPlatform,
	guideFor,
	isSettingsIssue,
	recoveryGuide,
	safetyNote,
	statusTitle,
	type Guide,
	type Line,
	type WebglFailure,
} from './webgl-support'

export const FALLBACK_ID = 'webgl-fallback'

export const VALUE_PROPOSITION = '日本の地形を空から眺める 3D フライトシミュレーター（技術デモ）'

/** README と実装で確かめられることだけを書く */
export const HIGHLIGHTS: readonly string[] = [
	'国土地理院のシームレス空中写真と産総研のシームレス標高タイルを重ね、MapLibre GL JS で地形を立体表示',
	'ウェイポイントで飛行ルートを組んで再生。各地点の地表標高を地形から読み取り、対地高度と海抜高度を並べて編集',
	'CSV・GeoJSON の読み込みと書き出し、KML でのルート書き出しに対応',
]

export const REPO_URL = 'https://github.com/BoxPistols/gsi-terrain-flight-simulator#readme'
export const PORTFOLIO_URL = 'https://asagiri-design.carrd.co/'

export type DemoMedia = { video: string; poster: string; captions: string }

export type FallbackOptions = {
	failure: WebglFailure
	media: DemoMedia
	doc?: Document
	userAgent?: string
	maxTouchPoints?: number
	reducedMotion?: boolean
	onRetry?: () => void
	/** webgl2-required のときに MapLibre GL へ切り替える */
	onSwitchToMaplibre?: () => void
}

const SVG_NS = 'http://www.w3.org/2000/svg'

function icon(doc: Document, paths: string[], size = 20): SVGSVGElement {
	const svg = doc.createElementNS(SVG_NS, 'svg')
	svg.setAttribute('viewBox', '0 0 16 16')
	svg.setAttribute('width', String(size))
	svg.setAttribute('height', String(size))
	svg.setAttribute('fill', 'none')
	svg.setAttribute('stroke', 'currentColor')
	svg.setAttribute('stroke-width', '1.5')
	svg.setAttribute('stroke-linecap', 'round')
	svg.setAttribute('stroke-linejoin', 'round')
	svg.setAttribute('aria-hidden', 'true')
	svg.setAttribute('focusable', 'false')
	for (const d of paths) {
		const p = doc.createElementNS(SVG_NS, 'path')
		p.setAttribute('d', d)
		svg.appendChild(p)
	}
	return svg
}

// 立方体に斜線で「3D が使えない」
const CUBE_OFF = [
	'M8 1.8 13.5 4.8v6.4L8 14.2 2.5 11.2V4.8Z',
	'M2.5 4.8 8 7.8l5.5-3M8 7.8v6.4',
	'M1.5 1.5l13 13',
]
const CHECK = ['m3.5 8.2 3 3 6-6.4']
const RELOAD = ['M13.2 6.5A5.3 5.3 0 1 0 13 10', 'M13.5 2.8v3.9H9.6']
const EXTERNAL = [
	'M9.5 2.5h4v4',
	'M13.5 2.5 7.5 8.5',
	'M12 9.5v3.5a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-8a.5.5 0 0 1 .5-.5H7',
]

function el<K extends keyof HTMLElementTagNameMap>(
	doc: Document,
	tag: K,
	className?: string,
	text?: string
): HTMLElementTagNameMap[K] {
	const node = doc.createElement(tag)
	if (className) node.className = className
	if (text !== undefined) node.textContent = text
	return node
}

function renderLine(doc: Document, parent: HTMLElement, line: Line) {
	for (const seg of line) {
		if (typeof seg === 'string') parent.appendChild(doc.createTextNode(seg))
		else parent.appendChild(el(doc, 'code', undefined, seg.code))
	}
}

function linkButton(doc: Document, href: string, label: string, newTab = true): HTMLAnchorElement {
	const a = el(doc, 'a', 'wgf-btn wgf-btn-secondary')
	a.href = href
	if (newTab) {
		a.target = '_blank'
		a.rel = 'noopener noreferrer'
	}
	a.appendChild(doc.createTextNode(label))
	const ext = icon(doc, EXTERNAL, 16)
	a.appendChild(ext)
	if (newTab) a.appendChild(el(doc, 'span', 'wgf-visually-hidden', '（新しいタブで開きます）'))
	return a
}

function buildVideo(doc: Document, media: DemoMedia, reducedMotion: boolean): HTMLElement {
	const figure = el(doc, 'figure', 'wgf-demo')
	const video = el(doc, 'video', 'wgf-video')
	video.controls = true
	video.muted = true
	// muted 属性も付ける。プロパティだけだと iOS Safari の自動再生条件を満たさない
	video.setAttribute('muted', '')
	video.setAttribute('playsinline', '')
	// 地図が出る人には不要なデータなので、見える位置に来るまで取りに行かない
	video.preload = 'none'
	video.setAttribute('poster', media.poster)
	video.width = 1280
	video.height = 720
	video.loop = !reducedMotion
	video.setAttribute('aria-describedby', 'wgf-demo-caption')

	const source = el(doc, 'source')
	source.src = media.video
	source.type = 'video/mp4'
	video.appendChild(source)

	const track = el(doc, 'track')
	track.kind = 'captions'
	track.srclang = 'ja'
	track.label = '日本語'
	track.src = media.captions
	track.default = true
	video.appendChild(track)

	figure.appendChild(video)
	figure.appendChild(
		el(
			doc,
			'figcaption',
			undefined,
			'東京タワー周辺で、フライトプランを再生したときの録画（36 秒・音声なし・2 倍速）'
		)
	).id = 'wgf-demo-caption'
	return figure
}

/**
 * 見える位置に来たら再生する。動きを減らす設定の人には自動で動かさない（再生ボタンで見られる）
 */
export function setupLazyPlayback(
	video: HTMLVideoElement,
	reducedMotion: boolean,
	win: Window = window
): void {
	if (reducedMotion) return
	const Observer = (win as unknown as { IntersectionObserver?: typeof IntersectionObserver })
		.IntersectionObserver
	const play = () => {
		const result = video.play?.()
		// 自動再生が止められている環境では、利用者が再生ボタンを押せば見られるので失敗は無視する
		if (result && typeof result.catch === 'function') result.catch(() => {})
	}
	if (!Observer) {
		play()
		return
	}
	const io = new Observer(entries => {
		if (entries.some(e => e.isIntersecting)) {
			io.disconnect()
			play()
		}
	})
	io.observe(video)
}

function buildSteps(doc: Document, guide: Guide): HTMLElement {
	const steps = el(doc, 'div', 'wgf-block')
	steps.appendChild(el(doc, 'h3', undefined, '直し方'))
	const ol = el(doc, 'ol', 'wgf-steps')
	for (const line of guide.steps) {
		const li = el(doc, 'li')
		renderLine(doc, li, line)
		ol.appendChild(li)
	}
	steps.appendChild(ol)
	if (guide.verify) {
		const p = el(doc, 'p', 'wgf-note')
		p.appendChild(doc.createTextNode('確かめ方: '))
		renderLine(doc, p, guide.verify)
		steps.appendChild(p)
	}
	if (guide.note) {
		const p = el(doc, 'p', 'wgf-note')
		renderLine(doc, p, guide.note)
		steps.appendChild(p)
	}
	return steps
}

/** 案内を外してアプリ本体を見せ直す。context が戻ったとき用 */
export function removeWebglFallback(doc: Document = document): void {
	doc.getElementById(FALLBACK_ID)?.remove()
	delete doc.documentElement.dataset.webgl
}

export function renderWebglFallback(options: FallbackOptions): HTMLElement {
	const doc = options.doc ?? document
	const nav = typeof navigator !== 'undefined' ? navigator : undefined
	const ua = options.userAgent ?? nav?.userAgent ?? ''
	const browser = detectBrowser(ua)
	const platform = detectPlatform(ua, options.maxTouchPoints ?? nav?.maxTouchPoints ?? 0)
	const reducedMotion =
		options.reducedMotion ??
		(typeof doc.defaultView?.matchMedia === 'function' &&
			doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches)
	const { failure } = options

	doc.getElementById(FALLBACK_ID)?.remove()

	const root = el(doc, 'main', 'wgf')
	root.id = FALLBACK_ID
	root.setAttribute('aria-labelledby', 'wgf-title')
	root.dataset.kind = failure.kind
	const inner = el(doc, 'div', 'wgf-inner')
	root.appendChild(inner)

	// 状態の知らせ。地図の代わりに何が出ているのかを最初に伝える
	const status = el(doc, 'div', 'wgf-status')
	status.setAttribute('role', 'status')
	status.appendChild(icon(doc, CUBE_OFF, 22))
	const statusText = el(doc, 'div')
	const guide = isSettingsIssue(failure.kind)
		? guideFor(browser, platform)
		: recoveryGuide(failure.kind)
	statusText.appendChild(el(doc, 'p', 'wgf-status-title', statusTitle(failure.kind)))
	statusText.appendChild(
		el(
			doc,
			'p',
			'wgf-status-body',
			guide
				? '代わりに、録画したデモと概要をご覧ください。直し方は下にあります。'
				: '代わりに、録画したデモと概要をご覧ください。'
		)
	)
	status.appendChild(statusText)
	inner.appendChild(status)

	const grid = el(doc, 'div', 'wgf-grid')
	inner.appendChild(grid)

	// プロダクトの紹介
	const product = el(doc, 'section', 'wgf-product')
	product.setAttribute('aria-labelledby', 'wgf-title')
	product.appendChild(el(doc, 'h1', 'wgf-title', VALUE_PROPOSITION)).id = 'wgf-title'
	const demo = buildVideo(doc, options.media, reducedMotion)
	product.appendChild(demo)

	const list = el(doc, 'ul', 'wgf-highlights')
	list.setAttribute('aria-label', '主な機能')
	for (const text of HIGHLIGHTS) {
		const li = el(doc, 'li')
		li.appendChild(icon(doc, CHECK, 18))
		li.appendChild(el(doc, 'span', undefined, text))
		list.appendChild(li)
	}
	product.appendChild(list)

	const actions = el(doc, 'div', 'wgf-actions')
	if (failure.kind === 'webgl2-required' && options.onSwitchToMaplibre) {
		const sw = el(doc, 'button', 'wgf-btn wgf-btn-primary', 'MapLibre GL に切り替えて開き直す')
		sw.type = 'button'
		sw.addEventListener('click', () => options.onSwitchToMaplibre?.())
		actions.appendChild(sw)
	}
	const retry = el(doc, 'button', 'wgf-btn wgf-btn-primary')
	retry.type = 'button'
	retry.dataset.action = 'retry'
	retry.appendChild(icon(doc, RELOAD, 18))
	retry.appendChild(doc.createTextNode('もう一度試す'))
	retry.addEventListener('click', () =>
		(options.onRetry ?? (() => doc.defaultView?.location.reload()))()
	)
	actions.appendChild(retry)
	actions.appendChild(linkButton(doc, REPO_URL, 'GitHub で README を見る'))
	actions.appendChild(linkButton(doc, PORTFOLIO_URL, '制作者のポートフォリオ'))
	product.appendChild(actions)
	grid.appendChild(product)

	// 直し方
	const help = el(doc, 'section', 'wgf-help')
	help.setAttribute('aria-labelledby', 'wgf-help-title')
	help.appendChild(el(doc, 'h2', 'wgf-help-title', '3D 地図を表示するには')).id = 'wgf-help-title'

	const cause = el(doc, 'div', 'wgf-block')
	cause.appendChild(el(doc, 'h3', undefined, '考えられる原因'))
	cause.appendChild(el(doc, 'p', undefined, causeText(failure.kind, platform, browser)))
	help.appendChild(cause)

	// 埋め込み先の制限を疑えるのは、実際に iframe の中にいるときだけ
	if (failure.embedded) {
		const embedded = el(doc, 'div', 'wgf-block')
		embedded.appendChild(el(doc, 'h3', undefined, '埋め込み表示で開いています'))
		embedded.appendChild(
			el(
				doc,
				'p',
				undefined,
				'このページは別のページの中で開かれています。埋め込み先の設定で 3D 表示が止められていることがあるので、単独のタブでも試してください。'
			)
		)
		const href = doc.defaultView?.location.href ?? '/'
		embedded.appendChild(linkButton(doc, href, 'このページを新しいタブで開く'))
		help.appendChild(embedded)
	}

	if (guide) help.appendChild(buildSteps(doc, guide))

	if (isSettingsIssue(failure.kind)) {
		const note = safetyNote(platform, browser)
		const safety = el(doc, 'div', 'wgf-block')
		safety.appendChild(el(doc, 'h3', undefined, note.title))
		safety.appendChild(el(doc, 'p', undefined, note.body))
		help.appendChild(safety)
	}

	const tech = el(doc, 'details', 'wgf-tech')
	tech.appendChild(el(doc, 'summary', undefined, '技術的な情報'))
	tech.appendChild(
		el(
			doc,
			'code',
			undefined,
			[failure.kind, platform, browser, failure.embedded ? 'embedded' : '', failure.detail]
				.filter(Boolean)
				.join(' / ')
		)
	)
	help.appendChild(tech)
	grid.appendChild(help)

	doc.documentElement.dataset.webgl = 'unavailable'
	doc.body.appendChild(root)

	const video = demo.querySelector('video')
	if (video) setupLazyPlayback(video, reducedMotion, doc.defaultView ?? window)
	return root
}
