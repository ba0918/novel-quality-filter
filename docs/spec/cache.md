# キャッシュ仕様

## 概要

スコアリング結果を IndexedDB に保存し、同じ作品の重複 fetch を防止する。
キャッシュは無期限。手動での全消し・個別再スコアに対応する。

## IndexedDB スキーマ

- DB名: `novel-quality-filter`
- バージョン: 1

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
