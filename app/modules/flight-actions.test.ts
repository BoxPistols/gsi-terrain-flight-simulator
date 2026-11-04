import { beforeEach, describe, expect, test } from 'vitest'
import { applyPrimaryFlightAction, primaryFlightAction } from './flight-actions'

describe('primaryFlightAction', () => {
	test('飛行中は一時停止', () => {
		expect(primaryFlightAction({ active: true, phaseIndex: 3, totalPhases: 10 })).toEqual({
			kind: 'pause',
			label: '一時停止',
		})
	})

	test('未開始・先頭で停止したときは開始', () => {
		expect(primaryFlightAction({ active: false, phaseIndex: 0, totalPhases: 10 }).label).toBe(
			'開始'
		)
	})

	test('途中で止めたときは再開', () => {
		expect(primaryFlightAction({ active: false, phaseIndex: 4, totalPhases: 10 }).label).toBe(
			'再開'
		)
	})

	test('範囲外のフェーズ（完了後など）は開始', () => {
		expect(primaryFlightAction({ active: false, phaseIndex: 10, totalPhases: 10 }).label).toBe(
			'開始'
		)
	})
})

describe('applyPrimaryFlightAction', () => {
	let start: HTMLButtonElement
	let pause: HTMLButtonElement

	beforeEach(() => {
		document.body.innerHTML =
			'<button id="s"><span data-label>開始</span></button><button id="p">一時停止</button>'
		start = document.getElementById('s') as HTMLButtonElement
		pause = document.getElementById('p') as HTMLButtonElement
	})

	test('待機中は開始だけを表示', () => {
		applyPrimaryFlightAction(start, pause, { active: false, phaseIndex: 0, totalPhases: 5 })
		expect(start.hidden).toBe(false)
		expect(pause.hidden).toBe(true)
	})

	test('飛行中は一時停止だけを表示', () => {
		applyPrimaryFlightAction(start, pause, { active: true, phaseIndex: 1, totalPhases: 5 })
		expect(start.hidden).toBe(true)
		expect(pause.hidden).toBe(false)
	})

	test('途中停止で開始ボタンのラベルが再開になる', () => {
		applyPrimaryFlightAction(start, pause, { active: false, phaseIndex: 2, totalPhases: 5 })
		expect(start.textContent).toBe('再開')
	})

	test('ボタンが無くても例外にならない', () => {
		expect(() =>
			applyPrimaryFlightAction(null, null, { active: false, phaseIndex: 0, totalPhases: 0 })
		).not.toThrow()
	})
})
