# コード棚卸し（不要コード・塩漬け・未実装）

作成: 2026-09-07
目的: `js/reader.js`（約2,700行）を中心に溜まった「死んだコード」「途中で止まった実装」「やりたかった機能」を分類し、削除・判断・実装の判断台帳にする。1項目ずつ処理したらここを更新する。

参照: 描画/ページャ設計 = `docs/40-reader-rendering-pager-redesign.md` / 進捗ログ = `docs/99-work-progress-log.md`

---

## A. 削除OK — より良い方式に置換済み or 完全に未使用

### A-1. `scrollx` 横スクロール表示モード  ← 次で削除予定
- **状況**: 表示モードは `paged` / `scroll` の2つに集約済み。`normalizeDisplayMode()` は `"scrollx"` を入力エイリアスとして受けるが必ず `"scroll"` に畳む。実行時 `displayMode` が `"scrollx"` になることはない。
- **デッド箇所**:
  - `js/reader.js`: `1939`（`bindPageTap` の `shouldHandlePagingTap` 内）/ `2067` `2083` `2095` `2129`（pointer/mouse ドラッグスクロール）/ `2240` `2243-2244`（`applyDisplayMode` の `mode-scrollx` 分岐）
  - `css/reader.css`: `899` `905`（`body.mode-scrollx .tap-zone`）/ `997`（`body.mode-scrollx .reader-viewport`）
- **残すもの**: `normalizeDisplayMode()` の入力エイリアス（`"scrollx"` / `"scroll-x"`）は旧保存設定の互換のため残す。
- **規模**: reader.js 約60行、css 約15行。
- **リスク**: 低。到達不能コードの除去のみ。

### A-2. `genkoPreset` 原稿用紙プリセット  ← 次で削除予定
- **状況**: `let genkoPreset = false;`（`reader.js:83`）が `true` になる経路が存在しない。全呼び出しで `false` リテラルを渡している。
- **デッド箇所**:
  - `js/reader.js`: `83`（宣言）/ `290` `297` `1572` `1579`（`genkoPreset: false` で呼び出し）/ `1385` `1388`（reset と `genko-preset-enabled` クラス除去）/ `2429-2433`（`resolveHorizontalPagePlan` の分岐）/ `2445-2475`（`resolveVerticalPagePlan` の候補テーブル・スケール・分岐）/ `2509-2511`（`scoreVerticalPageCandidate`）
  - `css/reader.css`: `1264` `1267`（`genko-badge-flash`）/ `1284` `1293`（`--genko-guide-percent`）
- **やること**: `genkoPreset` 変数・関数引数・`genkoPreset ? A : B` の三項（B側だけ残す）・genko候補配列・genko用CSSを削除。`resolveVerticalPagePlan` / `resolveHorizontalPagePlan` / `scoreVerticalPageCandidate` のシグネチャを簡素化。
- **規模**: reader.js 約70行、css 約10行。
- **リスク**: 低〜中。ページ候補生成の共通関数を触るので、削除後に `node --test`（`tests/mobile-pager.test.mjs`）と実測（プレビュー）で回帰確認。

### A-3. `css/vertical.css` とその `<link>`  ← 次で削除予定
- **状況**: リーダー本体は `.reader-content.force-vertical` 系を使う。`css/vertical.css`（16行）の `.vertical-root` はバックアップZIP書き出し用で、その定義は `js/storage.js` の `VERTICAL_CSS` に複製がある。`index.html:11` の `<link rel="stylesheet" href="./css/vertical.css">` はリーダーに無関係なルールを読み込んでいるだけ。
- **やること**: `css/vertical.css` 削除、`index.html` の `<link>` 削除。`js/storage.js` の `VERTICAL_CSS` は**残す**（ZIP書き出しで使用）。
- **規模**: ファイル1つ＋1行。
- **リスク**: 極低。

### A-4. `bindTopEdgeRevealTap` / `skipNextTap`  ← 済
- WIP「reader-gesture-flow-cleanup」で削除済み。`setReaderChromeVisible()` に置換。

---

## B. 塩漬け — 判断が必要（このセッションでは触らない）

### B-1. measured-pager v2（`js/measured-pager.js`）
- **理想形**: DOM実測でページ境界を確定する方式（`docs/40`）。現行の文字数見積りページャ（`js/mobile-pager.js`）の脆さ（gitログの overflow 警告調整合戦）を根本解決するはずのもの。
- **現状**: `config`/`app.js:29` `measuredPagerV2: false` で本番無効。`?measuredPagerV2=1` で手動有効化のみ。**txt限定**（EPUB/HTML では使えない）。`docs/40` の移行フェーズ 0-1 の土台のみ存在、フェーズ 2-5 未着手。
- **選択肢**:
  - (a) 仕上げてデフォルト化し、旧ページャを削除（`docs/40` 完遂）
  - (b) 現状維持（塩漬け継続）
  - (c) 削除して旧ページャに一本化（今回の横幅改善で旧ページャがかなり良くなった点を踏まえる）
- **注意**: `js/document-model.js` は `normalize-txt.js` / `normalize-epub.js` が正規化時に使用しているので、v2 を捨てても document-model 本体は残す。
- **推奨**: 実機確認後に判断。旧ページャで実用上困らないなら (c)、縦書き組版の精度を上げたいなら (a)。

### B-2. 見開き表示（`pageColumns` / spread / stacked）
- **現状**: 設定ラベルに「PC向け・試験中」。`isSpreadViewActive() = pageColumns && !isMobileReadingDevice()`。縦書き版はページを上下スタックする変則レイアウト（`docs/90` でも「モバイル2カラムは別機能」と整理）。reader.js/css に約70箇所の分岐。
- **選択肢**: 完成させる / PC専用の実験機能として明示のまま維持 / 削除。
- **推奨**: 使っていないなら削除候補。使うなら縦書きの見開き方向を通常の書籍（左右）に直す設計から。

---

## C. 未実装だが欲しかった機能

### C-1. `.md`（Markdown）原稿対応
- 出典: `docs/99`（2026-06-05「次期候補」）、`docs/90`「未完了・候補」
- 想定: TXTの上位互換として正規化。`#`/`##`/`###` 見出し、段落、空行、引用、区切り線まで。表・脚注・HTML混在は対象外。
- 規模: `js/normalize-md.js` 新規（`normalize-txt.js` を土台に）＋ library.js の受け入れ拡張。中規模。

### C-2. 大容量書籍の分割 / 仮想描画
- 出典: `README`「今後の候補」、`docs/99`（2026-05-15）、`help.html:101` にも制約明記
- 現状: 本文HTMLを丸ごと `#bookContent` に一括注入。超大型書籍で重い。EPUB blob URL の `revoke` もしていない。
- 規模: 大。章単位の遅延マウント＋アンマウント、ページャとの整合、栞位置の維持。

### C-3. 没入モードの正式設計
- 現状: `shouldUseImmersivePagedChrome()` = `paged` かつ（幅≤640 or coarse pointer）で**自動 ON、切れない**。トップバー非表示・向きロック・chrome表示時0.8倍プレビュー。設計されていない emergent 挙動。
- 案（別セッション）: 設定 `immersiveMode` で独立フラグ化。ON時は全chrome非表示＋Fullscreen API（Android はステータスバー＝時計も消える）＋細いプログレスバーのみ。復帰は中央タップで数秒表示 or 長押しで設定。
- 規模: 中。Fullscreen は user gesture 必須なので発火点の設計が要る。C-4（プログレスバー）の後に。

### C-4. 全体プログレスバー  ← 次でA削除と同時に実装
- 設定 `progressBar`（既定 ON、常時表示）＋ `progressBarPercent`（既定 OFF、数字も表示）。
- 画面下端 2〜3px、`pointer-events:none`、テーマ連動、塗り方向は `pageDirection` 準拠。
- データ: 既存の `updateMobileTextPagerProgress()`（`reader.js:1236`）/ `bindProgressTracking()`（`reader.js:1717`）が算出する `progressPercent` をそのまま使う。
- 規模: 小。表示のみ、ページャ非干渉。

### C-5. 管理画面の並べ替え / 検索 / プレビュー / 入力検証表示
- 出典: `docs/99`（2026-05-15）。`js/admin.js`（約1,750行）。
- 規模: 中。優先度低め（運用者は本人1名）。

---

## D. 廃案（記録のみ・実装しない）

- **音声 / TsukuyomiPlayer**: `docs/99`（2026-06-05）で廃案。コード残骸なし（確認済み）。将来やるなら別サービス。
- **Cloudflare Access**: `docs/07-cloudflare-access-investigation.md`。Reader内パスワード認証で代替済み。`docs/07` は経緯記録としてアーカイブ可（`docs/過去/` などへ）。
- **400字/ページを組版の基準にする案**: `docs/90` で放棄。ライブラリ一覧の目安表示のみに用途縮小。

---

## 進め方

1. **（次）** A-1 / A-2 / A-3 の削除 ＋ C-4 プログレスバー実装 → まとめて 1〜数コミット、`node --test` ＋ プレビュー実測。
2. 実機確認（Android / iOS）。
3. C-3 没入モードの設計・実装（別セッション）。
4. B-1 / B-2 の判断（実機所感を踏まえて）。
5. C-1 `.md` 対応、C-2 仮想描画は個別に計画。
