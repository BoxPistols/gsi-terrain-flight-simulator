/**
 * 起動の順番: WebGL を確かめてから地図アプリ本体を読み込む。
 *
 * 本体（index.ts）は読み込んだ時点で地図を作るため、先に読み込むと WebGL が無い環境では
 * MapLibre の例外（JSON 文字列）がそのままエラートーストに出て、画面は黒いままになる。
 */

import {
	diagnoseWebglFailure,
	failureFromInitError,
	isEmbedded,
	meetsRequirement,
	probeWebgl,
	type WebglFailure,
	type WebglProbe,
	type WebglRequirement,
} from './webgl-support'

export type BootDeps = {
	requirement: WebglRequirement
	loadApp: () => Promise<unknown>
	showFallback: (failure: WebglFailure) => void
	probe?: () => WebglProbe
	embedded?: () => boolean
	doc?: Document
	/** context を失ってから、戻らないとみなすまでの時間（ページが見えている間だけ数える） */
	contextLostGraceMs?: number
	/** context が戻ったときに案内を外してアプリを見せ直す */
	hideFallback?: () => void
}

export async function bootApp(deps: BootDeps): Promise<'app' | 'fallback'> {
	const probe = (deps.probe ?? probeWebgl)()
	const embedded = (deps.embedded ?? isEmbedded)()

	if (!meetsRequirement(probe, deps.requirement)) {
		deps.showFallback(diagnoseWebglFailure(probe, deps.requirement, embedded))
		return 'fallback'
	}

	watchContextLoss(
		deps.doc ?? document,
		deps.contextLostGraceMs ?? 5000,
		embedded,
		deps.showFallback,
		deps.hideFallback
	)

	try {
		await deps.loadApp()
		return 'app'
	} catch (error) {
		// probe は通っても、地図側の context 作成だけ失敗することがある（属性の違い・上限など）
		console.error('[boot] 地図アプリの初期化に失敗しました', error)
		deps.showFallback(failureFromInitError(error, probe.apiPresent, embedded))
		return 'fallback'
	}
}

/**
 * MapLibre は context を失うと復帰を待つ。戻ってこなければ黒い画面のまま止まるので、
 * 一定時間たっても webglcontextrestored が来ないときだけ案内に切り替える。
 * 裏のタブではブラウザが GPU を後回しにして復帰が遅れるため、ページが見えている間だけ時間を数える。
 * 案内を出したあとで戻った場合は、地図はそのまま動くので案内を外す。
 * イベントは canvas で発火して document まで伝わらないため、capture で拾う。
 */
export function watchContextLoss(
	doc: Document,
	graceMs: number,
	embedded: boolean,
	showFallback: (failure: WebglFailure) => void,
	hideFallback?: () => void
): () => void {
	const lost = new Set<EventTarget>()
	let timer: ReturnType<typeof setTimeout> | null = null
	let remaining = graceMs
	let startedAt = 0
	let shown = false

	const pause = () => {
		if (timer === null) return
		clearTimeout(timer)
		timer = null
		remaining -= Date.now() - startedAt
	}
	const resume = () => {
		if (timer !== null || shown || lost.size === 0 || doc.visibilityState !== 'visible') return
		startedAt = Date.now()
		timer = setTimeout(
			() => {
				timer = null
				shown = true
				showFallback({ kind: 'context-lost', detail: 'webglcontextlost', embedded })
			},
			Math.max(0, remaining)
		)
	}
	const onLost = (e: Event) => {
		if (e.target) lost.add(e.target)
		resume()
	}
	const onRestored = (e: Event) => {
		if (e.target) lost.delete(e.target)
		if (lost.size > 0) return
		pause()
		remaining = graceMs
		if (shown) {
			shown = false
			hideFallback?.()
		}
	}
	const onVisibility = () => (doc.visibilityState === 'visible' ? resume() : pause())

	doc.addEventListener('webglcontextlost', onLost, true)
	doc.addEventListener('webglcontextrestored', onRestored, true)
	doc.addEventListener('visibilitychange', onVisibility)
	return () => {
		pause()
		doc.removeEventListener('webglcontextlost', onLost, true)
		doc.removeEventListener('webglcontextrestored', onRestored, true)
		doc.removeEventListener('visibilitychange', onVisibility)
	}
}
