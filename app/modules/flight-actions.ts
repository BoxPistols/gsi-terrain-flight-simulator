/**
 * フライトプラン操作ボタンの表示状態
 *
 * 開始と一時停止は同時に押せる意味がないため、同じ位置（主操作の枠）に
 * どちらか一方だけを出す。途中で止めたプランは「再開」と表示し、
 * 先頭から始まるのか続きから始まるのかを押す前に分かるようにする。
 */

export interface FlightActionInput {
	active: boolean
	/** 次に実行するフェーズ（0 始まり） */
	phaseIndex: number
	totalPhases: number
}

export type PrimaryFlightAction =
	| { kind: 'pause'; label: '一時停止' }
	| { kind: 'start'; label: '開始' | '再開' }

export const primaryFlightAction = (s: FlightActionInput): PrimaryFlightAction => {
	if (s.active) return { kind: 'pause', label: '一時停止' }
	const midway = s.phaseIndex > 0 && s.phaseIndex < s.totalPhases
	return { kind: 'start', label: midway ? '再開' : '開始' }
}

/** 開始ボタンと一時停止ボタンの一方だけを表示し、開始側のラベルを更新する */
export const applyPrimaryFlightAction = (
	startBtn: HTMLElement | null,
	pauseBtn: HTMLElement | null,
	s: FlightActionInput
): void => {
	const action = primaryFlightAction(s)
	if (startBtn) {
		startBtn.hidden = action.kind !== 'start'
		const label = startBtn.querySelector('[data-label]')
		if (label && action.kind === 'start') label.textContent = action.label
	}
	if (pauseBtn) pauseBtn.hidden = action.kind !== 'pause'
}
