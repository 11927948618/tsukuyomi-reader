# 見開き表示 再設計（縦積み・横積みの両見開き）

- 状態: Draft（2026-09-07）— 策定中。実装は別セッション。
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

| 書字方向 | 既定の並べ方 | 意味 |
|---|---|---|
| 縦書き | **横並び（右→左）** | 和書の見開き。右面が先、左面が次。 |
| 横書き | **横並び（左→右）** | 洋書の見開き。左面が先。 |

- 「上下2段」は**別の並べ方オプション**（横書きの長い行を縦に2段積む＝新聞的レイアウト、または縦書きを段組み風に）として残すが、既定ではない。
- つまり **設定は1つ「見開き表示」ON/OFF ＋ 詳細で「並べ方: 自動 / 横並び / 上下」** に集約。

### 2.2 有効条件

- `paged` モードのみ。
- **画面の短辺ではなく「見開き軸の実寸」で判定**する。
  - 横並び: 見開き軸（＝並べる方向）に十分な幅があるか。目安 `並べ軸 >= 700px` かつ 1 面あたり最低読める寸法を確保できる。
  - 上下2段: 直交軸に十分な高さ。
- `isMobileReadingDevice()` での一律除外はやめ、上記の実寸判定に統一。ランドスケープのスマホでも条件を満たせば有効。

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

- `visiblePageCount` は arrangement から算出（現状踏襲、将来 3 面も視野に入れて N 化）。
- ページ送り: N ページ単位。ただし**末尾の半端面**（奇数ページで最後が1面）を許容し、`buildMobileTextPagerMarkup` の「1ページなら単ページにフォールバック」を「不足分は空白面」に変更（見開きの座組みを崩さない）。
- 栞・章ジャンプ・進捗: 面インデックスではなく**先頭面の原文 Locator**で丸める（既存 `sourceLocator` を流用）。「6-7 / 24」のような面範囲表示は維持。
- 進捗バー（v0.1.224）: 見開き時は「見開きの左端 or 右端」の Locator を基準に。

### 2.5 設定 UI

現行の2チェックを次へ集約:

```
[ ] 見開き表示
    並べ方:  ( ) 自動   ( ) 横並び   ( ) 上下2段        ← 見開きON時のみ表示
```

- 旧 `spreadView` / `pageColumns` → `spread: true, spreadArrangement: "auto"`
- 旧 `stackedView` / `twoTierView` → `spread: true, spreadArrangement: "stacked"`
- 互換: `normalizeSavedSettingsSnapshot` で旧キーを吸収。

---

## 3. 実装ステップ（別セッション）

1. **設定モデル移行**: `spread` + `spreadArrangement`（`auto` / `columns` / `rows`）。旧4キーの読み替え。`buildSettingsPayload` / `READER_DEFAULT_SETTINGS` / `normalizeSavedSettingsSnapshot` / app.js `DEFAULT_SETTINGS`。
2. **有効条件を実寸判定に**: `isSpreadEligible(axisPx, crossPx)`。`isMobileReadingDevice()` 依存を除去。
3. **4象限レイアウト**: `.mobile-text-spread` の CSS を `--spread-axis` ベースへ整理。`resolvePageColumnFrame` / `resolveSpreadPhysicalSize` を象限で統一。
4. **面をセルいっぱいに**: ページプラン関数に「枠フィット」モード追加。端数はガター吸収。
5. **半端面の空白化**: `buildMobileTextPagerMarkup` の単ページフォールバックを空白面に。
6. **状態の面丸め**: 栞・章ジャンプ・進捗・進捗バーを先頭面 Locator 基準に統一。
7. **設定 UI**: チェック1つ＋ラジオ。ラベルから「試験中」を外す。
8. **検証**: PC 主要幅／タブレット縦横／スマホ横／縦書き・横書き／栞復元／章ジャンプ／進捗。`node --test`。プレビュー実測。
9. `docs/00` 索引・`docs/50` B-2 更新。ラベルの「試験中」除去をもって正式機能化。

---

## 4. 未確定（要判断）

1. **上下2段の用途**。縦書きで上下2段は実際に読みやすいか？　横書き新聞レイアウト用途に限るなら「横書き時のみ選択可」にする手も。
2. **3面以上**。将来的に横長ディスプレイで 3 面を出すか（N 面設計にしておくか、2 面固定でよいか）。
3. **スマホ横向きで見開きを出すか**。出す場合、字が小さくなりすぎない下限寸法をどこに置くか。
4. **ページめくり効果**（`pageTurnEffect`）との相性。見開き時は面単位でなく見開き単位で演出するか。
5. 既定の `spreadArrangement: "auto"` で、縦書き＝横並び／横書き＝横並び、で良いか（上下を自動で選ぶ状況はあるか）。
