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
	/** context を失ってから、戻らないとみなすまでの時間 */
	contextLostGraceMs?: number
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
		deps.showFallback
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
 * イベントは canvas で発火して document まで伝わらないため、capture で拾う。
 */
export function watchContextLoss(
	doc: Document,
	graceMs: number,
	embedded: boolean,
	showFallback: (failure: WebglFailure) => void
): () => void {
	let timer: ReturnType<typeof setTimeout> | null = null
	const onLost = () => {
		if (timer !== null) return
		timer = setTimeout(() => {
			timer = null
			showFallback({ kind: 'context-lost', detail: 'webglcontextlost', embedded })
		}, graceMs)
	}
	const onRestored = () => {
		if (timer !== null) clearTimeout(timer)
		timer = null
	}
	doc.addEventListener('webglcontextlost', onLost, true)
	doc.addEventListener('webglcontextrestored', onRestored, true)
	return () => {
		onRestored()
		doc.removeEventListener('webglcontextlost', onLost, true)
		doc.removeEventListener('webglcontextrestored', onRestored, true)
	}
}
