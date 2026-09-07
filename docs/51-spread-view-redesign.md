# 見開き表示 再設計（縦積み・横積みの両見開き）

- 状態: Draft（2026-09-07）— §4 の判断を反映済み（下記）。実装は別セッション。

## 0. 確定事項（2026-09-07 ユーザー判断）

1. **上下2段（rows）は縦書きでも正式サポート**。タブレット縦での「新書組」相当（縦書き＋上下2段）。
2. **最大2面**。3面以上は設計に入れない。`visiblePageCount` は 1 or 2 固定でよい。
3. **横向き見開きは設計上あり**。主対象はタブレット（縦横とも）。スマホ横も実寸条件を満たせば可。
4. **ページめくり効果は「見開き単位」**。1回の見開き送り（2ページ）につき `playPageTurnEffect` を1回、見開き全体を単位に演出する。面ごとの個別アニメーションはしない。
5. **`spreadArrangement` に "自動" は置かない**。ユーザーが「横並び / 上下2段」を明示選択。既定値は後日確認（暫定: 横並び）。

- 対象: `paged` モードでの複数ページ同時表示（TXT / EPUB / HTML）
- 関連: 棚卸し `docs/50-code-inventory.md` B-2 / 旧ページャ一本化 `docs/40`（v0.1.226 で measured v2 削除）

---

## 1. 現状

### 設定（2つ、独立）
| 設定キー | ラベル | 有効条件 |
|---|---|---|
| `spreadView` (`pageColumns`) | 見開き表示（2ページ横並び・PC向け・試験中） | `spreadViewEnabled && !isMobileReadingDevice()` |
| `stackedView` (`twoTierView`) | 上下2段表示（2ページ縦並び・タブレット向け・試験中） | `stackedViewEnabled && !isSmallReadingViewport()` |

### 実装
- `getPageGroupArrangement()` → `"single"` / `"spread"` / `"stacked"`
- `getMobileTextPagerVisiblePageCount()` → single は 1、それ以外 2
- `.mobile-text-spread` は CSS grid。
  - `.spread.vertical` … `grid-template-columns: 1fr 1fr; direction: rtl`（右ページ＝先）
  - `.spread.horizontal` … 同 `direction: ltr`
  - `.stacked` … `grid-template-rows: repeat(2, 1fr)`
- `resolvePageColumnFrame` / `resolveSpreadPhysicalSize` でセル寸法を算出。
- ページ送りは `stepCount * getMobileTextPagerVisiblePageCount()`（2ページ単位）。

### 問題点
1. **各ページがセル内で埋まらない**。`--mobile-text-page-width`（＝`resolveVerticalPagePlan` の行数×行送り）がセル幅より小さく、片側に大きな余白（単ページのモバイル幅問題と同根）。
2. **PC/タブレット限定**。ランドスケープのスマホ・折りたたみ端末で使えない（`isMobileReadingDevice()` で一律除外）。
3. **設定が2つに割れている**。「横並び」と「上下2段」がユーザーには別物に見えるが、実体は arrangement 違いだけ。両方 ON にした時の優先順位（spread 優先）も分かりにくい。
4. **書字方向 × arrangement の4象限**が明示的に設計されていない。特に「縦書き＋上下2段」「横書き＋横並び」の意味と用途が曖昧。
5. **"試験中"のまま**で、栞・章ジャンプ・進捗の 2ページ単位丸めの精度が詰められていない。

---

## 2. 目指す形

### 2.1 概念モデル

見開き = 「1 スクリーンに N 面（現状は 2 面）を並べる」。並べ方は **書字方向で自然に決まる**軸を既定にし、ユーザーは「見開きにするか」だけを選ぶ。

ユーザーは「見開きにするか」＋「並べ方（横並び / 上下2段）」を明示選択する。並べ方に "自動" は置かない（確定事項5）。

| 並べ方 | 縦書き | 横書き |
|---|---|---|
| **横並び（columns）** | 和書の見開き。物理右→左（右面が先） | 洋書の見開き。物理左→右（左面が先） |
| **上下2段（rows）** | タブレット縦の「新書組」相当。物理上→下 | 長い横書き行を上下に積む。物理上→下 |

- **設定は1つ「見開き表示」ON/OFF ＋ 「並べ方: 横並び / 上下2段」ラジオ**（見開きON時のみ表示）。
- 面は最大2（確定事項2）。

### 2.2 有効条件

- `paged` モードのみ。
- **画面カテゴリ（スマホ/タブレット）ではなく「並べ軸の実寸」で判定**する。主対象はタブレット（縦横とも）。
  - 横並び: 並べ方向（物理x）に十分な幅。目安 `幅 >= 700px` かつ 1 面あたり最低読める幅を確保できる。
  - 上下2段: 並べ方向（物理y）に十分な高さ。目安 `高さ >= 700px` 等。
- `isMobileReadingDevice()` での一律除外は撤廃。ランドスケープのスマホでも条件を満たせば有効（確定事項3）。
- 条件を満たさない時は単ページに自動フォールバック（設定は保持）。

### 2.3 レイアウト規則（4象限）

`--spread-axis`（並べる物理方向）を軸に統一的に定義する。

| 書字方向 × 並べ方 | grid | 面の進行 | 1面のページ寸法 |
|---|---|---|---|
| 縦書き × 横並び | `columns: 1fr 1fr` | 物理右→左（`direction: rtl`） | 面幅 = セル幅、行数はセル幅で決定、字数はセル高で決定 |
| 縦書き × 上下 | `rows: 1fr 1fr` | 物理上→下 | 面高 = セル高、字数はセル高、行数はセル幅（面ごと） |
| 横書き × 横並び | `columns: 1fr 1fr` | 物理左→右 | 面幅 = セル幅 |
| 横書き × 上下 | `rows: 1fr 1fr` | 物理上→下 | 面高 = セル高 |

**各面は必ずセルいっぱいに広げる**（問題点1の解消）。`resolveVerticalPagePlan` / `resolveHorizontalPagePlan` に「与えられた枠ちょうどに合わせる」モードを追加し、行数量子化の端数はセル内の行間/字間ではなくガター配分で吸収する。単ページのモバイル幅改善（v0.1.222）と同じ方針をセルに適用。

### 2.4 ページャ・状態

- `visiblePageCount` は 1（単ページ）or 2（見開き）固定（確定事項2）。
- ページ送り: 2 ページ単位。**末尾の半端面**（奇数ページで最後が1面）を許容し、
  `buildMobileTextPagerMarkup` の「1ページなら単ページにフォールバック」を「不足分は空白面」に変更（見開きの座組みを崩さない）。
- 栞・章ジャンプ・進捗: 面インデックスではなく**先頭面の原文 Locator**で丸める（既存 `sourceLocator` を流用）。「6-7 / 24」のような面範囲表示は維持。
- 進捗バー（v0.1.224）: 見開き時は先頭面（横並びなら物理右＝縦書き先頭、左＝横書き先頭）の Locator を基準に。
- **ページめくり効果**（確定事項4）: 見開き送り1回につき `playPageTurnEffect` を1回。見開き全体（`.mobile-text-spread`）を演出対象にし、面ごとには animate しない。

### 2.5 設定 UI

現行の2チェックを次へ集約:

```
[ ] 見開き表示
    並べ方:  ( ) 横並び   ( ) 上下2段        ← 見開きON時のみ表示
```

- 設定キー: `spread`（bool）＋ `spreadArrangement`（`"columns"` = 横並び / `"rows"` = 上下2段）。"自動" は無し（確定事項5）。
- 既定値: 後日確認（暫定 `spread: false`, `spreadArrangement: "columns"`）。
- 旧 `spreadView` / `pageColumns` → `spread: true, spreadArrangement: "columns"`
- 旧 `stackedView` / `twoTierView` → `spread: true, spreadArrangement: "rows"`
- 互換: `normalizeSavedSettingsSnapshot` / `buildSettingsPayload` / app.js `DEFAULT_SETTINGS` で旧キーを吸収。

---

## 3. 実装ステップ（別セッション）

1. **設定モデル移行**: `spread`（bool）+ `spreadArrangement`（`columns` / `rows`、"自動"なし）。旧4キーの読み替え。`buildSettingsPayload` / `READER_DEFAULT_SETTINGS` / `normalizeSavedSettingsSnapshot` / app.js `DEFAULT_SETTINGS`。
2. **有効条件を実寸判定に**: `isSpreadEligible(axisPx, crossPx)`。`isMobileReadingDevice()` 依存を除去。
3. **4象限レイアウト**: `.mobile-text-spread` の CSS を `--spread-axis` ベースへ整理。`resolvePageColumnFrame` / `resolveSpreadPhysicalSize` を象限で統一。
4. **面をセルいっぱいに**: ページプラン関数に「枠フィット」モード追加。端数はガター吸収。
5. **半端面の空白化**: `buildMobileTextPagerMarkup` の単ページフォールバックを空白面に。
6. **状態の面丸め**: 栞・章ジャンプ・進捗・進捗バーを先頭面 Locator 基準に統一。
7. **めくり効果を見開き単位に**: `playPageTurnEffect` を見開き送り1回につき1回、`.mobile-text-spread` を対象に。
8. **設定 UI**: チェック1つ＋ラジオ（横並び/上下2段）。ラベルから「試験中」を外す。
9. **検証**: タブレット縦横／PC 主要幅／スマホ横／縦書き・横書き／横並び・上下2段／栞復元／章ジャンプ／進捗／めくり効果。`node --test`。プレビュー実測。
10. `docs/50` B-2 更新。ラベルの「試験中」除去をもって正式機能化。

---

## 4. 残る確認（実装前後で詰める）

- **既定値**: `spread` の既定 OFF は確定。`spreadArrangement` の既定（暫定「横並び」）はユーザーが後日実機で確認したい。
- **実寸しきい値**: 横並び/上下2段の有効化しきい値（暫定 700px）と、1 面の最低読める寸法。実機（タブレット縦横）で調整。
- **上下2段の面あたり寸法**: 「新書組」に見せるための行数・字数の目安（タブレット縦、縦書き）。
