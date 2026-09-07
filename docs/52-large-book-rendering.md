# 大容量書籍の描画（最大30万字）

- 状態: Draft（2026-09-07）。実装は別セッション。
- 対象: TXT / Markdown / EPUB / HTML の本文。想定最大 **約30万字**。
- 関連: 棚卸し `docs/50-code-inventory.md` C-2 / 旧ページャ `docs/40`（v0.1.226 で一本化）
- 既に着手: v0.1.228 でページャの**トークン化キャッシュ**（設定変更時の再計算を回避）。

---

## 1. 現状の計測（約23万字 / 30章 / 227k トークン / 990ページ）

| 処理 | 時間 | どこ |
|---|---|---|
| `normalizeTxtToBook` | 約160ms | 章分け・行分割・document model |
| `tokenizeMobilePagerSource` | 約350〜420ms | **DOM parse + 全ツリー走査**（`buildMobileTextPagerPages`） |
| `splitMobilePagerTokens`（全章） | 約105ms | 文字数ベースのページ分割 |
| スクロールモードの本文注入 | 重い（秒単位） | `#bookContent.innerHTML = 全文HTML`（約57万字）＋ 全文レイアウト |

### モード別の実態

- **ページ切替（`mode-paged`, モバイル既定）**: DOM には現在ページのみ（〜数百字）。
  重いのは初回のトークン化。**v0.1.228 のキャッシュで、設定変更時の再ページ化は
  約420ms → 約35ms に短縮済み**。初回オープンは約 600〜700ms。
- **スクロール（`mode-scrolly`, PC既定）**: `#bookContent` に**全文（約23万字）を展開**。
  初回描画とリフローが重い。30万字だと体感で数秒。**ここが本丸**。

---

## 2. 方針

### 2.1 スクロールモードの仮想化（最優先）

案A: **スクロールモードもページャ経由にする**
- 現状スクロールは CSS カラム / ネイティブスクロールで全文を持つ。
- ページャは全書籍を安価に分割でき（キャッシュ後 ~100ms）、表示は1ページ分だけ。
- 「スクロール」= ページャの1画面を、境界でスナップせず連続スクロールで見せる、に寄せる。
  縦書きは横スクロール、横書きは縦スクロール（v0.1.222/225 の軸判定を流用）。
- 利点: 実装が一本化され、全文DOMが消える。栞・進捗・章ジャンプはページャ側の
  Locator 機構をそのまま使える。
- 欠点: 「本当の連続スクロール感」ではなくなる（ページ境界のつなぎ目を自然に見せる工夫が要る）。

案B: **章単位の仮想リスト**
- `#bookContent` に見えている章 ± 1 だけをマウント。スクロールで前後を差し替え。
- 各章の高さを先に見積もってスクロールバーの整合を取る（縦書きは幅）。
- 利点: 連続スクロール感は保てる。
- 欠点: 章差し替え時のスクロール位置維持、章内の栞位置、`getCurrentChapterId` の
  スクロール判定など、周辺の作り直しが多い。

**推奨: 案A**。ページャは v0.1.222〜228 で安定しており、二重メンテを避けられる。
案B は「どうしても連続スクロールが要る」と分かってから。

### 2.2 初回トークン化のブロック回避

- 30万字のトークン化は 1 回 400〜500ms、メインスレッドを止める。
- 対策（軽い順）:
  1. **章ごとに `await` を挟んで yield**（`buildMobileTextPagerPages` を async 化、
     章ループ間で `await new Promise(r => setTimeout(r))`）。体感の「固まり」を消す。
  2. 最初の数章だけ先に組んで表示 → 残りを後追いで組む（プログレッシブ）。
  3. Web Worker でトークン化（DOM API が要るので `OffscreenCanvas` 相当が無く難しい。
     正規表現ベースの簡易トークナイザに置き換えるなら可能）。
- **推奨: 1 + 2**。3 は大掛かりなので保留。

### 2.3 document model の遅延化

- `buildTxtDocumentModel` / `buildHtmlDocumentModel` は栞 Locator と章ジャンプのためのもの。
- 全文を最初に処理せず、**章単位で必要時に構築**する。
- 影響: `normalize-*.js` の戻り値契約、`document-model.js`、reader.js の Locator 復元。

### 2.4 EPUB blob URL の解放（小・独立）

- `normalize-epub.js` の `blobUrlCache`（画像・CSS）は戻り値に含まれず、`revoke` されない。
  画像の多い EPUB で本を切り替えるとリーク。
- 対策: `blobUrlCache` の URL 一覧を book オブジェクトに載せ、
  本を閉じる / 別の本を開く時に `URL.revokeObjectURL`。
- reader.js に「アンマウント時処理」の口が無いので、そこも用意する（下記）。

### 2.5 initReader のティアダウン（小・独立）

- `initReader` は `render("reader")` のたびに呼ばれ、`window` / `document` に
  リスナー（resize, orientationchange, visualViewport, copy/contextmenu guard）を追加するが
  除去しない。reader ↔ library を往復するとリスナーが蓄積。
- 対策: `initReader` が cleanup 関数を返し、`render()` が画面遷移時に呼ぶ。
  2.4 の blob URL 解放もここに乗せる。

---

## 3. 実装ステップ（別セッション）

1. **initReader のライフサイクル**: cleanup 関数を返す / app.js が保持して画面遷移で呼ぶ。
   window/document リスナーを登録解除。
2. **EPUB blob URL 解放**: `normalize-epub` が URL 一覧を返す → book に保持 → cleanup で revoke。
3. **トークン化を async 化**: `buildMobileTextPagerPages` を章ループで yield。
   `syncMobileTextPager` / `upgradeToMeasuredPager`（削除済）呼び出し側の await 対応。
4. **プログレッシブ初期表示**: 先頭数章を組んで即表示 → 残りを後追い。ページ番号は
   「+」表示など暫定 UI で。
5. **スクロールモードをページャ経由に**（案A）: `mode-scrolly` を「境界スナップ無しの
   ページャ表示」に。全文DOM展開を廃止。栞・進捗・章ジャンプの動作確認。
6. **document model の遅延構築**: 章単位。Locator 復元の経路を通す。
7. **検証**: 30万字 TXT / EPUB / Markdown で 初回オープン・設定変更・スクロール・
   ページ送り・章ジャンプ・栞復元・メモリ（本の切替を10回）。`node --test`。プレビュー実測。
8. `docs/50` C-2 更新、`help.html` の「大きい書籍で重い」注記を見直し。

---

## 4. 要判断

1. **スクロールモードの扱い**（案A ページャ経由 / 案B 章仮想リスト）。推奨は A。
2. **プログレッシブ表示の UI**: 総ページ数が確定するまでの見せ方（「1 / 約120」等）。
3. **30万字の初回オープン許容時間**の目標値（例: 1.5 秒以内で読み始められる）。
4. 5〜6 は影響範囲が広い。1〜4（ライフサイクル + async + プログレッシブ）だけ先に入れて
   様子を見るか、5〜6 まで一気にやるか。
