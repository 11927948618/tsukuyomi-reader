# 計画 2026-09-03 — PCスクロール不能 ＋ モバイル縦書き横幅

正規リポジトリ: `C:\Users\karak\VSCode\TsukuyomiReader\tsukuyomi-reader`
関連進捗ログ: `docs/99-work-progress-log.md`
同時進行の未コミットWIP: v0.1.221 "reader-gesture-flow-cleanup"（`bindPageTap` / chrome表示のみ。本計画とは非干渉）

---

## 問題1: PCでスクロールしない（既定 = スクロール表示 ＋ 縦書き）

### 原因（再現・計測で確認済み）

- `applyDisplayMode()`（`js/reader.js:2231-2238`）: `displayMode === "scroll"` のとき常に `body.mode-scrolly` を付与する。
  `normalizeDisplayMode()` は `"scrollx"` を返さないため `mode-scrollx` 分岐は死んでいる。
- `body.mode-scrolly .reader-viewport`（`css/reader.css:1004`）= `overflow-x: hidden; overflow-y: auto; touch-action: pan-y`。
  これは**横書き**用。縦書きでは本文が横方向に伸びる（計測: viewport 1126px に対し内容 7340px、横あふれ 6214px）。
  `overflow-x: hidden` で切り取られ、横スクロールバーも出ず、縦あふれも無いのでホイールも効かない。
- `bindWheelScroll()`（`js/reader.js:2294`）は `if (displayMode === "scroll") return;` で即時 return。
  スクロールモードはネイティブスクロール頼みだが、そのネイティブスクロールが上記で殺されている。

→ 既定設定（PC = scroll + vertical）でスクロール完全不能。

### 修正方針

1. `applyDisplayMode()` の scroll 分岐を**書字方向で出し分け**:
   - 縦書き → 横スクロール容器（`overflow-x:auto / overflow-y:hidden`）
   - 横書き → 縦スクロール容器（`overflow-x:hidden / overflow-y:auto`）
   実装は「`body.mode-scroll-x` / `body.mode-scroll-y` の新クラスを付与」し、CSS 側に対応ルールを追加する
   （既存 `mode-scrollx` は `scroll-snap-type: x mandatory` 等の余計な副作用があるため流用しない）。
2. `applyWritingModePreference()`（`js/reader.js:2332`）変更時に `applyDisplayMode(displayMode, …)` を呼び直し、
   スクロール軸クラスを再評価する。
3. `bindWheelScroll()`: スクロールモードでも、縦書き（横スクロール）時は
   `deltaY` を `scrollEl.scrollLeft`（rtl考慮）へ変換する。横書き時はネイティブ縦スクロールに任せる。
   Windows で自然に読めるようにする。既存の `stepHorizontalPage` ではなく素のスクロール量加算にする。
4. `css/reader.css`: `body.mode-scroll-x .reader-viewport` / `body.mode-scroll-y .reader-viewport` の
   overflow・`touch-action`・スクロールスナップ無効を定義。`body.mode-scrolly .reader-content.force-vertical`
   系ルール（1016-1033）を新クラスへ移植・調整。

### 検証

- PC幅（≥1024）で scroll + vertical: ホイール/トラックパッドで横方向に読み進められる。位置復元も動く。
- PC幅で scroll + horizontal: 縦スクロールが従来どおり。
- モバイル幅で scroll + vertical: 横スワイプでスクロールできる（`touch-action: pan-x`）。
- paged モードは影響なし（ホイールページ送り維持）。
- `node --check js/reader.js`、`node --test tests/*.test.mjs` パス。

---

## 問題2: モバイル縦書き（ページ切替）の本文横幅が画面の約60% → 目標 約95%

### 現状の幅ロス（画面375pxで計測、本文実効 224px = 60%）

| 段階 | ロス | 位置 |
|---|--:|---|
| `.reader-viewport` 左右パディング | 約60〜76 | `css/reader.css:1505-1507` `body.mode-paged .reader-viewport { padding-inline: 38px }` |
| `getContentWidthPercent()` = 88% | 約36 | `js/reader.js:147` `100 - PAGE_MARGIN_STANDARD_PERCENT(6)*2`。パディング済み内幅にさらに掛けて二重取り |
| ページ中央寄せ（259pxに固定） | 約4 | `--paged-block-size`（`resolveVerticalPagePlan`） |
| `.mobile-text-page` 右パディング 2.2em | 約35 | `css/reader.css:383` `.mobile-text-page.vertical.has-title { padding-block-start: 2.2em }`（縦書きで block-start = 右）|
| 装飾 `::before/::after` | 端18〜30ずつ | `css/reader.css:266-289`（スクショの左黒帯） |

### 修正方針（→ 本文 約95%）

1. `css/reader.css` モバイル時（`@media (max-width: 900px)` および必要なら 640/480）:
   - `body.mode-paged .reader-viewport { padding-inline: clamp(6px, 2vw, 12px) }` へ縮小
   - `.reader-viewport::before/.reader-viewport::after` をモバイルで `width: 0` もしくは `display:none`（縦書きページには不要）
2. `js/reader.js`:
   - `getContentWidthPercent()` にモバイル分岐: モバイル（`isMobileReadingDevice()`）かつ非見開きなら下限を 96〜98% に上げる
     （＝ページ幅をほぼビューポート幅に。余白スライダーは装飾ではなく実余白として残す設計だが、
     モバイル既定位置では極小に）。
   - あるいは `resolveSinglePageLayout` に渡す `rawWrapped` をモバイル縦書きで `viewportWidth` そのものにする。
3. `.mobile-text-page` タイトル用ガター:
   - `has-title` かつ実際に `h1` が可視のページのみ・量も `1.6em` 程度へ削減。タイトル無しページは 0。
4. `resolveVerticalPagePlan` 側は `blockBase` 増加で自然に広い候補を選ぶ（`maxBlock` が拡大するため）。
   `scoreVerticalPageCandidate` の `blockUse` 係数（36）で横いっぱい寄りが選ばれることを確認。

### 検証

- 画面 360 / 390 / 412 / 768 で縦書きページ切替: 本文実効幅 ≥ 92%（目標95%前後）。
- 1画面の行数が増え、文字あふれ（`body.pager-fit-warning`）が悪化しないこと。
- 余白スライダーを動かすと従来どおり余白が増減すること（機能を殺さない）。
- 横書きページ切替・見開き（PC）に副作用が無いこと。
- `node --check`、`node --test` パス。

---

## 共通

- バージョン: 作業まとめて `node scripts/update-version-meta.mjs --bump --ref reader-scroll-mobile-width` で bump（WIPの 0.1.221 を踏まえ 0.1.222 想定）。コミット/デプロイはユーザー指示後。
- WIP（reader-gesture-flow-cleanup）はそのまま同居。競合しないファイル領域。
- ローカル検証は `python -m http.server` ＋ `books/manifest.json` に一時テスト作品を追加（コミットしない）。
