/**
 * エントリーポイント。WebGL を確かめてから地図アプリ本体（index.ts）を読み込む。
 * 本体を動的 import にしているので、WebGL が無い人は地図ライブラリ（約 1.5 MB）も取得しない。
 */

import './styles/webgl-fallback.css'
import { bootApp } from './modules/boot-flow'
import { removeWebglFallback, renderWebglFallback } from './modules/WebglFallback'
import { loadProviderConfig, saveProviderConfig } from './map-provider'
import demoVideo from './media/flight-demo.mp4?url'
import demoPoster from './media/flight-demo-poster.jpg?url'
import demoCaptions from './media/flight-demo.ja.vtt?url'

const providerConfig = loadProviderConfig()

void bootApp({
	requirement: providerConfig.provider === 'mapbox' ? 'webgl2' : 'webgl',
	loadApp: () => import('./index'),
	showFallback: failure =>
		renderWebglFallback({
			failure,
			media: { video: demoVideo, poster: demoPoster, captions: demoCaptions },
			onSwitchToMaplibre: () => {
				saveProviderConfig({ ...providerConfig, provider: 'maplibre' })
				window.location.reload()
			},
		}),
	hideFallback: () => removeWebglFallback(),
})
