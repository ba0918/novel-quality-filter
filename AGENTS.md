# Novel Quality Filter

カクヨム・なろうのランキングから低品質作品をスコアリングでフィルタリングする Chrome 拡張（Manifest
V3）。 「AI 検出」ではなく「低品質駄文の検出」。品質が低い作品を弾く。個人利用。

## 技術スタック

| 項目                | 選定                                              |
| ------------------- | ------------------------------------------------- |
| ランタイム          | Deno                                              |
| バンドラ            | esbuild + esbuild-deno-loader                     |
| UI（popup/options） | Preact                                            |
| 形態素解析          | lindera-wasm-ipadic-web（IPADIC 辞書同梱の WASM） |
| テスト              | deno test（ユニット・統合）+ Playwright（E2E）    |
| ストレージ          | IndexedDB + 薄いラッパー                          |

選定の経緯は `.agents/artifacts/decisions/` に記録してある。

## 品質ゲート

`deno task check` で lint + fmt + test を一括実行する。コミット前に通すこと。

## アーキテクチャ

レイヤードアーキテクチャを採用（ba-markdown-viewer と同方式）。

```
src/
├── domain/          # 純粋なドメインロジック（ブラウザ API 非依存）
│   ├── scoring/     #   スコア計算、重み付け、正規化
│   ├── analyzer/    #   文長SD、段落分析、区切り検出、TTR、修飾語密度
│   └── tokenizer/   #   lindera-wasm のラッパー（初期化・キャッシュ管理）
├── services/        # ドメインオブジェクトのオーケストレーション
├── messaging/       # レイヤー間通信（Chrome 拡張メッセージング）
├── background/      # Service Worker（バックグラウンドスコアリング）
├── content/         # カクヨム/なろう用 content script + DOM 注入
├── settings/        # Popup UI（閾値、ブロックリスト管理）
├── ui-components/   # スコアバッジ、ブロックボタン等
└── shared/          # 型定義、ストレージラッパー、定数
```

### レイヤー間通信ルール

**レイヤー間のやり取りは必ず messaging を経由する。直接 import による越境禁止。**

- content / background / settings は互いを直接 import しない
- レイヤーをまたぐ通信は全て `messaging/` 層の型付きメッセージを通す
- domain / shared は全レイヤーから import 可（内側への依存のみ許可）

```
content ──messaging──▶ background ◀──messaging── settings
              │               │
              ▼               ▼
           domain          domain
              │               │
              ▼               ▼
           shared           shared
```

## コーディング規約

- Deno の標準フォーマッタ・リンターに従う
- `deno fmt` / `deno lint` の設定は deno.json に集約
- テストファイルは `*_test.ts` の命名規則

## 注意事項

- カクヨム/なろうへの過剰リクエストを避ける（rate limiting 必須）
- WASM バイナリ（17MB）は Chrome 拡張にバンドルされる。ビルド出力のサイズに注意
- lindera-wasm を Chrome 拡張で使うには CSP に `wasm-unsafe-eval` が必要
