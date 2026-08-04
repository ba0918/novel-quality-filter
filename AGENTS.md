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

## プロジェクト構造

```
src/           # アプリケーションコード
spike/         # 技術検証用スパイク（Git 管理するが本番コードではない）
dist/          # ビルド出力（Git 管理外）
```

## コーディング規約

- Deno の標準フォーマッタ・リンターに従う
- `deno fmt` / `deno lint` の設定は deno.json に集約
- テストファイルは `*_test.ts` の命名規則

## 注意事項

- カクヨム/なろうへの過剰リクエストを避ける（rate limiting 必須）
- WASM バイナリ（17MB）は Chrome 拡張にバンドルされる。ビルド出力のサイズに注意
- lindera-wasm を Chrome 拡張で使うには CSP に `wasm-unsafe-eval` が必要
