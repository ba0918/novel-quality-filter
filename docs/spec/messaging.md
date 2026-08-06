# メッセージング仕様

## 概要

Chrome 拡張のレイヤー間通信（content ↔ background ↔ popup）を型安全に行うための messaging
層の仕様。`chrome.runtime.sendMessage` / `chrome.runtime.onMessage` をラップし、
メッセージ型による静的ディスパッチを提供する。

## 設計原則

- レイヤー間の直接 import を禁止し、すべてメッセージ経由（AGENTS.md 準拠）
- メッセージ型は discriminated union（`type` フィールドで判別）
- 応答は `sendResponse` コールバック経由（Chrome runtime messaging の制約）

## メッセージ型

### content → background

| type           | 用途               | ペイロード          | 応答                  |
| -------------- | ------------------ | ------------------- | --------------------- |
| `SCORE_WORK`   | スコアリング要求   | `workId`, `workUrl` | `ScoreResultResponse` |
| `RESCORE_WORK` | 再スコアリング要求 | `workId`, `workUrl` | `ScoreResultResponse` |

### popup → background

| type          | 用途             | ペイロード | 応答                   |
| ------------- | ---------------- | ---------- | ---------------------- |
| `CLEAR_CACHE` | キャッシュ全消し | なし       | `{ success: boolean }` |

### 応答型

```typescript
interface ScoreResultResponse {
  workId: string;
  result: ScoreResult | null;
  fromCache: boolean;
  error?: string;
}
```

## フロー

```
content script                    background (service worker)
     │                                    │
     │── SCORE_WORK {workId, workUrl} ──▶│
     │                                    ├─ cache check
     │                                    ├─ miss → fetch queue に追加
     │                                    ├─ fetch → analyze → score
     │                                    ├─ cache 保存
     │◀── ScoreResultResponse ───────────│
     │                                    │
     │── RESCORE_WORK {workId, workUrl} ─▶│
     │                                    ├─ cache 削除
     │                                    ├─ fetch queue に追加（優先度同等）
     │                                    ├─ fetch → analyze → score
     │                                    ├─ cache 保存
     │◀── ScoreResultResponse ───────────│
```

## エラーハンドリング

- fetch 失敗: `result: null`, `error` にメッセージを格納
- WASM 未初期化: `result: null`, `error: "Tokenizer not initialized"`
- 不明なメッセージ type: 無視（他の拡張やシステムメッセージとの共存）

## 非同期応答

Chrome runtime messaging で非同期応答を返すには、`onMessage` リスナーが `true` を
返す必要がある。messaging 層のハンドラーはこれを内部的に処理する。
