# キャッシュ仕様

## 概要

スコアリング結果を IndexedDB に保存し、同じ作品の重複 fetch を防止する。
キャッシュは無期限。手動での全消し・個別再スコアに対応する。

## IndexedDB スキーマ

- DB名: `novel-quality-filter`
- バージョン: 2

### ストア: `scores`

| フィールド   | 型                 | 説明                                   |
| ------------ | ------------------ | -------------------------------------- |
| `workId`     | `string`（主キー） | 作品 ID                                |
| `score`      | `number`           | 総合スコア（0-100）                    |
| `metrics`    | `MetricResult[]`   | 各指標の詳細（正規化値、寄与度、理由） |
| `scoredAt`   | `number`           | スコアリング実行時の Unix timestamp    |
| `episodeUrl` | `string`           | 分析対象のエピソード URL               |

主キーは `workId`。なろう対応時に `[domain, workId]` への複合キー化を検討するが、 現時点では workId
のみで十分（カクヨムとなろうで workId が衝突しない）。

### ストア: `scores`（開幕形式判定・再評価対応で追加）

| フィールド           | 型       | 説明                                                                                                                                            |
| -------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `openingType`        | `string` | 開幕話（第1話）の形式判定結果（normal / character-intro / bulletin-board / too-short）。再評価で採点対象が後続話になっても第1話の形式を保持する |
| `sampledCount`       | `number` | 再評価のために取得・調査した話数（1 = 第1話のみ）                                                                                               |
| `targetEpisodeIndex` | `number` | 採点対象の話番号（0 = 第1話）。ツールチップの「N話で再評価」表記はこの値が 1 以上のときのみ表示する                                             |

### ストア: `scores`（行メタデータ追加で追加）

| フィールド     | 型             | 説明                                                                                                                                                                      |
| -------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lineMetadata` | `LineMetadata` | 採点対象本文の行ベース診断メタデータ（6カテゴリの層別カウント）。表示専用で総合スコアには寄与しない（line-metadata.md 参照）。本文抽出に失敗した話では未添付（undefined） |

フィールド追加やスコアリング仕様の変更で保存済みスコアが無効になる場合、スキーマバージョンを更新して
既存キャッシュを一度無効化する（現行スキーマバージョン: 6。v6
は行メタデータ（`lineMetadata`）フィールドの追加と、
本文抽出での数値文字参照デコード追加に伴うスコア変更による。v5
は一文一段落ペナルティの複合条件化に伴うスコア変更で、フィールド追加はない）。キャッシュの有効期限は従来どおり無期限。

## キャッシュフロー

```
スコア要求（workId）
  │
  ├─ IndexedDB.get(workId)
  │   ├─ hit  → 即座に ScoreResultResponse を返却（fromCache: true）
  │   └─ miss → fetch キューに追加
  │               ├─ fetch → analyze → score
  │               ├─ IndexedDB.put(entry)
  │               └─ ScoreResultResponse を返却（fromCache: false）
  │
再スコア要求（workId）
  │
  ├─ IndexedDB.delete(workId)
  └─ fetch キューに追加（以降は miss と同じ）
```

## 操作

| 操作     | 関数                  | 説明                                            |
| -------- | --------------------- | ----------------------------------------------- |
| 取得     | `getScore(workId)`    | キャッシュエントリを返す。miss なら `undefined` |
| 保存     | `putScore(entry)`     | エントリを upsert                               |
| 個別削除 | `deleteScore(workId)` | 指定 workId のエントリを削除                    |
| 全消し   | `clearAll()`          | scores ストアを全クリア                         |

## 設計メモ

- `chrome.storage.local` ではなく IndexedDB を採用する理由:
  構造化データの格納、インデックス検索、容量制限の緩さ
- Service Worker からも content script からも IndexedDB にアクセス可能だが、 本拡張では background
  のみが書き込み、content は messaging 経由で取得する
