# 第三者のソフトウェアとデータ

このリポジトリのコードは [LICENSE](./LICENSE)（All rights reserved）の対象です。次に挙げる第三者のソフトウェアとデータは対象外で、それぞれの作者・提供者の条件に従います。

## npm の依存

| パッケージ | 作者・提供者 | 条件 |
|---|---|---|
| [maplibre-gl-gsi-terrain](https://www.npmjs.com/package/maplibre-gl-gsi-terrain)（`2.3.2` に固定） | [mug-jp/maplibre-gl-gsi-terrain](https://github.com/mug-jp/maplibre-gl-gsi-terrain) の作者（Kanahiro Iguchi ほか） | 上流の作者の条件に従う。上流のリポジトリと npm パッケージにはライセンスの宣言がない（2026-11 時点で確認） |
| [maplibre-gl](https://github.com/maplibre/maplibre-gl-js) | MapLibre contributors | BSD-3-Clause |
| [mapbox-gl](https://github.com/mapbox/mapbox-gl-js) | Mapbox, Inc. | Mapbox の利用条件（`node_modules/mapbox-gl/LICENSE.txt`）。ビルドに含まれる。設定で Mapbox を選んだときだけ使い、その場合は利用者自身のアクセストークンが必要 |

開発用の依存（Vite、Vitest、Playwright、ESLint など）は配布物に含まれず、それぞれのライセンスに従います。

maplibre-gl-gsi-terrain はこのリポジトリにコピーしておらず、npm から取得して使っています。

## 地図・標高データ

アプリは次のタイルをブラウザから直接取得します。出典表示は地図の右下（attribution）に出します。

- [地理院タイル](https://maps.gsi.go.jp/development/ichiran.html)（国土地理院）: 空中写真（シームレス）、標準地図、淡色地図、白地図、色別標高図。利用条件は[国土地理院コンテンツ利用規約](https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html)
- [産総研シームレス標高タイル](https://gbank.gsj.jp/seamless/elev/)（産業技術総合研究所 地質調査総合センター）: `tiles.gsj.jp/tiles/elev/mixed`。地形（raster-dem）に使用
- フォント（glyphs）: `fonts.openmaptiles.org`

## git 履歴について

このリポジトリは BoxPistols/maplibre-gl-gsi-terrain から、シミュレーターのファイルの履歴だけを残して切り出しました。履歴のうち 2025-07-31 より前のコミット（Kanahiro Iguchi、Taro Matsuzawa ほか上流の作者によるもの）は、上流の `example/` などの内容です。これらは上流の作者の著作物で、LICENSE の対象外です。現在のファイルには、上流の作者が書いた行は残っていません（`git blame` で確認）。
