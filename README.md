# Novel Quality Filter

カクヨム・なろうのランキング作品を文体の多様性でスコアリングする Chrome 拡張（Manifest V3）。

テンプレート的な文体を検出し、読みたい作品を見つけやすくする。個人利用。

## 機能

- ランキングページの各作品にスコアバッジ（0〜100）を表示
- 閾値以下の作品をグレーアウト表示
- ツールチップで品質指標の詳細を表示（例:「文章の緩急が乏しい」）
- スコアは IndexedDB にキャッシュ、バッジクリックで再計算

## スコアリング

13 の指標で文章の品質を多角的に評価する（うち 4 指標は実測で判別ゼロと確定し weight 0 の廃止扱い）。

### コア指標

| #  | 指標             | 概要                   |
| -- | ---------------- | ---------------------- |
| M1 | 一文一段落比率   | スカスカ文体の検出     |
| M2 | 文長の標準偏差   | 文の長さの均質さ       |
| M3 | 区切りの頻度     | 水平線の過剰使用       |
| M4 | 会話語尾の多様性 | キャラクターの口調分化 |

### 補助指標

| #  | 指標              | 概要                     |
| -- | ----------------- | ------------------------ |
| M5 | 語彙多様性（TTR） | 語彙の豊かさ             |
| M6 | 描写密度の分散    | 描写の解像度のムラ       |
| M7 | 段落長の標準偏差  | 段落構造のバリエーション |
| M8 | 体言止め分布      | 修辞技法の自然さ         |

### 知覚的多様性指標

| #   | 指標                 | 概要                             |
| --- | -------------------- | -------------------------------- |
| M9  | 感情直接表現率       | tell vs show の比率              |
| M10 | 論理接続詞密度       | 評論文的文体の検出               |
| M11 | 段落遷移エントロピー | 展開の構造的多様性               |
| M12 | 文長バースティネス   | 文章の緩急（バラつきのバラつき） |

### 行構造指標

| #   | 指標              | 概要                                   |
| --- | ----------------- | -------------------------------------- |
| M13 | 地の文の平均字/行 | 1 行の情報量の薄さ（行メタデータ派生） |

加算スコア（weight 合計で 100 満点に
rescale）に加え、致命的な欠点を検出するペナルティ乗算方式（min-mult 合成、連続 grade あり）を採用。

## 技術スタック

| 項目        | 選定                            |
| ----------- | ------------------------------- |
| ランタイム  | Deno                            |
| バンドラ    | esbuild + esbuild-deno-loader   |
| UI（popup） | Preact                          |
| 形態素解析  | lindera-wasm-ipadic-web（WASM） |
| テスト      | deno test                       |

## 開発

```bash
# 依存関係のインストール
deno install

# ビルド
deno task build

# 品質ゲート（lint + fmt + test）
deno task check

# 較正データセットの収集・スコアリング（デバッグ用）
deno task cal register <URL または作品ID>...

# 候補の自動収穫 → そのまま register（タグ×更新順一覧から未収集作品を無作為抽出）
deno task cal harvest [--dry-run] [--max N] [タグ...]

# ラベル付けビューア（cal.json を再生成してから配信）
deno task cal list
deno task cal serve
```

### スマホでラベル付けする（cal serve --lan）

同一 LAN のスマホからラベル付けする場合は `--lan` を付けて起動する（既定は localhost 限定。cal.json
は作品由来のメタを含むため、明示 opt-in のときだけ LAN へ公開する）。

```bash
deno task cal serve --lan
# 起動時に表示される http://<LAN IP>:8000/mobile.html をスマホで開く
```

`/mobile.html` はラベル付け専用の軽量ページで、未ラベル作品を境界帯 （スコア 45 近傍 =
判定が最も揺れる帯）から順に 1 件ずつ表示する。 スキップした作品は列の最後尾に回る。

**WSL2 でのハマりどころ（ファイアウォール）**: WSL2 の mirrored ネットワーク モードでは、Hyper-V
ファイアウォールが既定で外部からの着信をブロックするため、 `0.0.0.0` に bind
してもスマホから届かない。Windows 側の管理者 PowerShell で ポート 8000
だけを許可するルールを追加する（GUID は WSL の VMCreatorId 固定値）:

```powershell
New-NetFirewallHyperVRule -DisplayName 'novel-quality-filter cal serve' -Direction Inbound -VMCreatorId '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -Protocol TCP -LocalPorts 8000 -Action Allow
```

使い終わったら削除する:

```powershell
Remove-NetFirewallHyperVRule -DisplayName 'novel-quality-filter cal serve'
```

`Set-NetFirewallHyperVVMSetting -DefaultInboundAction Allow` でも通るが、 WSL
への着信を全開放するため使わないこと。

## Chrome への読み込み

1. `deno task build` でビルド
2. Chrome で `chrome://extensions` を開く
3. 「デベロッパーモード」を有効化
4. 「パッケージ化されていない拡張機能を読み込む」から `dist/` を選択
