# TsukuyomiReader 描画・ページャ再設計

- 状態: Draft v0.1
- 作成日: 2026-06-22
- 対象: TXT / EPUB / HTML の本文表示
- 参考資料: `docs/reference/ibunkohd_settings_ui_reference_for_tsukuyomi.docx`

## 1. 目的

現在のTsukuyomiReaderは本文描画にCSS縦書きを使っている一方、ページ切替では一行文字数と一ページ行数を先に計算し、本文を文字単位で分割している。

この方式は単純なTXTでは動作するが、次の条件で表示結果と計算結果が一致しない。

- ルビ、傍点、取消線
- 見出しと本文で異なる文字サイズや行高
- 禁則処理とぶら下げ
- 半角英数字、縦中横、約物
- EPUB由来のインライン要素と画像
- 行番号表示
- 端末サイズ、ブラウザUI、フォント読込、表示倍率の変化

本再設計では、通常の読書画面を次の構成へ移行する。

```text
TsukuyomiReader
  = ブラウザ標準のHTML/CSS組版
  + DOM実測ページャ
  + 表示ページから独立した原文位置管理
```

## 2. 設計原則

### 2.1 ブラウザに任せるもの

- 縦書き・横書きの行組み
- ルビ配置
- 約物の字形と基本禁則
- 傍点、取消線
- 半角文字の向き
- フォントメトリクス
- 行内折り返し

### 2.2 Readerが管理するもの

- ページ表示領域
- ページ境界
- 強制改ページ
- ページ境界で分割してはいけない要素
- 原文位置と章ジャンプ
- 設定の保存、継承、即時プレビュー
- ページ移動UIと進捗表示

### 2.3 管理を分離するもの

次の値を混同しない。

```text
原文位置 != 表示ページ番号 != スクロール座標
文字方向 != ページ進行方向
アプリ既定値 != 本ごとの設定 != 一時プレビュー値
テキスト再組版 != PDF/画像の表示領域補正
```

## 3. 現行実装の整理

### 3.1 維持する実装

- `writing-mode: vertical-rl` / `horizontal-tb`
- HTMLの`ruby`、`rt`、`del`、`s`などを利用する描画
- TXT/EPUB正規化後の章`section`
- 本ごとの設定保存とグローバル設定保存
- 読書ログに添付する`viewerProfile`
- モバイルはページ表示、PCはスクロール表示を推奨する既定値
- テーマ、フォント、文字サイズ、行間、字間、行番号

### 3.2 置き換える実装

- `mobile-pager.js`の`charsPerLine` / `linesPerPage`によるページ確定
- ルビ親文字数を固定weightとして扱う容量計算
- 見出しを固定行数だけ予約する処理
- ページ番号を主とした再開位置
- 改行を1文字として加算する疑似`sourceOffset`

### 3.3 当面残す実装

旧ページャは移行期間中のフォールバックとして残す。新ページャを機能フラグで無効化できるようにし、問題発生時に即座に旧方式へ戻せるようにする。

## 4. 対象と対象外

### 4.1 対象

- TXT縦書きページ表示
- TXT横書きページ表示
- EPUB縦書きページ表示
- EPUB横書きページ表示
- HTML本文ページ表示
- ページ表示とスクロール表示の位置引継ぎ
- 章ジャンプ
- 文字サイズ、行間、字間、行番号変更時の再ページング

### 4.2 対象外

- PDFの再組版
- PDF余白カット
- 画像アーカイブ
- Canvasによる全グリフ描画
- サーバ側ページ分割
- ページ境界キャッシュのR2保存
- 見開き表示

PDFと画像は将来、別の表示領域補正機能として扱う。

## 5. 文書モデル

### 5.1 DocumentModel

TXT、EPUB、HTMLを共通の文書モデルへ正規化する。

```javascript
DocumentModel = {
  bookId,
  sourceRevision,
  format,
  chapters: [
    {
      chapterId,
      title,
      blocks: [Block]
    }
  ]
}
```

### 5.2 Block

```javascript
Block = {
  blockId,
  kind, // heading | paragraph | blank | image | forced-page-break
  sourceStart,
  sourceEnd,
  children: [InlineNode]
}
```

### 5.3 InlineNode

```javascript
InlineNode = {
  kind, // text | ruby | emphasis | strike | tcy | link | image | br
  sourceStart,
  sourceEnd,
  text,
  children
}
```

ルビ、縦中横、画像などは途中で分割しない原子単位とする。長い通常テキストノードだけはUnicodeコードポイント境界で分割候補を作る。

### 5.4 原文位置

位置はページ番号ではなく次のLocatorで保存する。

```javascript
ReaderLocator = {
  sourceRevision,
  chapterId,
  blockId,
  textOffset,
  affinity // before | after
}
```

- `textOffset`は正規化後Block本文内のUnicodeコードポイント位置とする。
- TXTの改行コードは読込時にLFへ正規化する。
- EPUBは章内Blockとテキスト位置で保持する。
- `sourceRevision`が一致しない場合は章ID、進捗率の順にフォールバックする。
- ページ番号、スクロール座標は表示復元の補助値としてのみ保存する。

## 6. DOM実測ページャ

### 6.1 適用範囲

- `displayMode === "paged"`のTXT / EPUB / HTMLで使用する。
- スクロール表示では本文全体を連続DOMとして描画し、ページ分割しない。

### 6.2 測定コンテナ

画面外に測定専用DOMを一つ置く。

測定コンテナは表示コンテナと次を完全に一致させる。

- writing-mode、text-orientation、direction
- font-family、font-size、font-weight
- line-height、letter-spacing
- rubyサイズ
- padding、margin、行番号用余白
- 見出し、段落、画像のCSS
- 表示領域のinline-sizeとblock-size

測定開始前に`document.fonts.ready`を待つ。Webフォント、画像、表示領域が変わった場合は再計測する。

### 6.3 ページ境界探索

1. 現在のLocatorから候補範囲を作る。
2. 前回値または概算文字数から粗い終端候補を得る。
3. 候補DOMを測定コンテナへ配置する。
4. overflowと最終描画矩形を確認する。
5. 入る最大のLayoutUnit境界を二分探索する。
6. 禁則・原子要素・強制改ページを考慮して安全な境界へ補正する。
7. PageMapへ開始Locatorと終了Locatorを保存する。

文字数計算は探索初期値にのみ使用し、ページ確定には使用しない。

### 6.4 overflow判定

`scrollWidth > clientWidth`だけで確定しない。

```javascript
function fitsPage(probe, lastRenderedNode) {
  const epsilon = 1;
  const box = probe.getBoundingClientRect();
  const last = lastRenderedNode?.getBoundingClientRect();

  const noScrollOverflow =
    probe.scrollWidth <= probe.clientWidth + epsilon &&
    probe.scrollHeight <= probe.clientHeight + epsilon;

  const lastNodeInside = !last || (
    last.left >= box.left - epsilon &&
    last.right <= box.right + epsilon &&
    last.top >= box.top - epsilon &&
    last.bottom <= box.bottom + epsilon
  );

  return noScrollOverflow && lastNodeInside;
}
```

実装時は縦書き・横書きで論理軸へ変換し、ブラウザの小数丸めを許容する。

### 6.5 ページ境界ルール

境界にしてはいけない位置:

- ルビ親文字の途中
- 縦中横の途中
- 半角回転runの途中
- 開き括弧の直後
- 閉じ括弧・句読点の直前
- 結合文字、異体字セレクタ、サロゲート相当の途中
- 取消線・傍点など短い装飾範囲の途中

強制境界:

- 明示的な改ページ
- EPUB spine item境界のうち改ページ指定があるもの
- 章を必ず改ページする設定が有効な場合の章先頭

見出しは固定行数を予約せず、本文と同じDOM計測対象にする。

### 6.6 PageMap

```javascript
PageMap = {
  engineVersion,
  bookId,
  sourceRevision,
  layoutHash,
  viewportSignature,
  pages: [
    {
      pageIndex,
      chapterId,
      startLocator,
      endLocator,
      containsHeading
    }
  ]
}
```

PageMapにはHTML全文を保存せず、境界情報だけを保存する。

### 6.7 キャッシュ

キャッシュキー:

```text
bookId
+ sourceRevision
+ engineVersion
+ layoutHash
+ viewportSignature
```

`layoutHash`に含めるもの:

- writingMode、pageProgression
- fontFamily、fontSize、fontWeight
- lineHeight、letterSpacing
- rubyScale、半角回転、縦中横、傍点設定
- 行番号表示
- ページ余白

`viewportSignature`に含めるもの:

- 本文表示領域の幅と高さ
- devicePixelRatioは診断値として保持する

キャッシュはメモリとIndexedDBだけに保存する。R2、D1、Analytics APIへページ境界を送信しない。

## 7. 設定モデル

### 7.1 設定の階層

```text
組込既定値
  < アプリ既定値
  < 書籍メタデータの推奨値
  < 本ごとの上書き
  < 設定画面での未保存プレビュー
```

テーマは原則アプリ共通とし、本ごとの設定に戻されないようにする。本文組版設定はアプリ既定値を引き継ぎ、本ごとの上書きを許可する。

### 7.2 設定分類

#### 基本表示

- テーマ
- 文字サイズ
- フォント
- 行間
- 縦書き / 横書き
- ページ / スクロール

#### 縦書き詳細

- 半角回転
- 縦中横
- ルビ倍率
- 傍点表示
- 上余白

#### ページ操作

- ページ進行方向: auto / rtl / ltr
- タップ領域パターン
- ページ切替効果
- 行番号
- ページガイド

#### 文書解析

- TXT章構造自動判別
- 章先頭改ページ

#### 形式別

- TXT / EPUB / HTML: 再組版設定
- PDF / 画像: 方向、拡大、将来の余白カット

### 7.3 既存キーとの互換

初期実装では既存キーを維持し、新モデルへの読み替え層を追加する。全面的なキー名変更を同時に行わない。

| 既存キー | 新モデル上の意味 |
|---|---|
| `fontSize` | `reading.text.fontScalePercent` |
| `fontFamilyPreference` | `reading.text.fontFamily` |
| `lineHeight` | `reading.layout.lineHeight` |
| `letterSpacing` | `reading.layout.letterSpacingPx` |
| `wrapWidthPercent` | `reading.layout.pageBlockPercent` |
| `displayMode` | `reading.navigation.mode` |
| `writingModePreference` | `reading.text.writingMode` |
| `pageColumns` | 将来の見開き設定。現行段組みとは分離する |
| `lineNumbers` | `reading.display.lineNumbers` |
| `pageTurnEffect` | `reading.navigation.pageTurnEffect` |

### 7.4 Web/PWAで制約のある設定

- 輝度変更はブラウザから端末輝度を直接変更せず、テーマ・画面オーバーレイで代替する場合だけ実装する。
- 回転ロックはPWA、Fullscreen API、ブラウザ対応状況に依存するため、best effort機能として扱う。
- ptはUI上の参考表示に留め、内部レイアウトはCSS px/remと実測値を使う。

## 8. 読書位置とログ

### 8.1 端末内保存

```javascript
progress = {
  locator,
  progressPercent,
  pageIndex,      // 補助値
  scrollOffset,   // 補助値
  viewerProfile,
  updatedAt
}
```

設定変更や画面回転後は、保存Locatorを新しいPageMapへ写像する。

### 8.2 Analytics

通信頻度は現行の節目イベント方式を維持する。

- open
- 25 / 50 / 75%
- finish

PageMapやページ単位の移動履歴は送信しない。`viewerProfile`には診断に必要な設定値と表示領域だけを添付する。

### 8.3 行番号

行番号は画面上の折返し行ではなく、正規化文書モデル上の論理行番号とする。文字サイズや画面幅を変えても参照番号が変わらないことを優先する。

- TXT: 原文の論理行番号
- EPUB/HTML: Block番号を基礎にした安定番号
- 折返し後の各表示行へ新しい番号を振らない

## 9. UI設計

### 9.1 読書画面

- 本文レイヤーと操作レイヤーを分離する。
- 操作レイヤーを閉じた時に本文領域の寸法を変えない。
- 初回タップは操作レイヤー表示だけに使い、同じイベントで背後のボタンを押さない。
- 進捗スライダは読了方向を視覚的に表す。
- 縦書きrtlでは右端が開始、横書きltrでは左端が開始。

### 9.2 設定画面

- 読書中の本文を残したオーバーレイ/ドロワーとする。
- 設定を開閉しても本文表示領域を再配置しない。
- 基本設定は最初の画面に集約する。
- 詳細設定は折りたたみまたはサブ画面に分離する。
- 変更はプレビューへ即時反映する。
- 保存前は一時値、保存後は本ごとの設定またはアプリ既定値へ反映する。

### 9.3 設定の保存先を明示する

将来は設定画面で次を選べる構成を検討する。

- この本だけ
- 今後の既定値

初期移行では現在の保存動作を維持し、内部モデルだけ分離する。

## 10. 再ページング契機

再ページングする条件:

- 文字サイズ、フォント、行間、字間
- writing-mode、ページ進行方向
- ルビ倍率、半角回転、縦中横、傍点
- 行番号表示
- ページ余白
- 本文表示領域の寸法変化
- フォント読込完了
- sourceRevision変更

再ページングしない条件:

- テーマ色だけの変更
- 操作メニューの表示・非表示
- ページ切替効果
- 進捗スライダ表示

`ResizeObserver`と`visualViewport`を監視し、連続変更はdebounceする。前回処理をAbortControllerまたは世代番号で無効化し、古い計測結果を採用しない。

## 11. 性能設計

- 初回は現在ページと前後1ページを優先生成する。
- 残りのPageMapは`requestIdleCallback`または短い分割タスクで生成する。
- 1回の計測で文書全体HTMLを再生成しない。
- 章単位でDocumentFragmentを再利用する。
- 設定スライダ操作中は表示中ページだけを暫定更新し、操作停止後にPageMapを確定する。
- 生成中は最後に確定したページを表示し続ける。
- キャッシュ上限とLRU削除を設ける。

## 12. 段階移行

### Phase 0: 基準試験を固定

- 代表TXT、代表EPUB、長文、短文をfixture化
- ルビ、見出し、禁則、空行、取消線、長い英数字を含める
- 現行版のページ数と既知不具合を記録

### Phase 1: DocumentModelとLocator

- TXT正規化結果へBlock IDと原文位置を付与
- EPUB正規化結果へBlock IDと章内位置を付与
- 現行表示は変更しない
- 栞をLocator優先へ移行

### Phase 2: TXT測定ページャ

- 縦書きTXT
- 横書きTXT
- 見出し、空行、禁則、行番号
- 機能フラグで旧方式と切替可能にする

### Phase 3: EPUB/HTML測定ページャ

- ルビ、取消線、傍点
- EPUB CSSの安全な継承
- 画像と強制改ページ
- 章ジャンプ

### Phase 4: 設定UI整理

- 基本設定と詳細設定を分離
- pageProgression、半角回転、ルビ倍率を追加
- 形式別設定を整理
- 本ごとの上書きとアプリ既定値を分離

### Phase 5: 旧ページャ削除判定

受入試験を満たし、公開版で一定期間問題がなければ旧文字数ページャを削除する。

## 13. 受入試験

### 13.1 内容完全性

- 全ページの本文を順に連結すると正規化本文と一致する。
- ページ間で文字、ルビ、改行が欠落しない。
- ページ間で文字が重複しない。
- Locatorがページ順に単調増加する。

### 13.2 表示

- 最後の行・列が見切れない。
- ページ送りごとに表示枠が移動しない。
- 見出しページで本文が重ならない。
- ルビ、取消線、傍点、縦中横が欠落しない。
- 禁則文字が明らかに不自然な位置へ出ない。
- 縦書きは右上開始、横書きは左上開始になる。

### 13.3 位置復元

- 文字サイズ変更後も同じ原文位置を含むページへ戻る。
- ページ/スクロール切替後も同じ原文位置へ戻る。
- 画面サイズ変更後も同じ原文位置へ戻る。
- 章ジャンプは対象見出しを含むページへ移動する。

### 13.4 端末・画面

- Android Chrome 縦画面
- Android Chrome ブラウザUI表示あり/なし
- Windows Edge/Chrome 主要ウィンドウ幅
- 文字サイズ最小/標準/最大
- 縦書き/横書き
- ページ/スクロール

### 13.5 性能

- 設定操作で画面が長時間停止しない。
- ページ送り時にDOM計測しない。
- 同一layoutHashの再表示ではキャッシュを利用する。
- ネットワーク通信回数とR2負荷が増えない。

## 14. ロールバック条件

次の場合は新ページャを無効化し、旧ページャへ戻す。

- 本文欠落または重複
- 栞位置の大幅な後退・進行
- 特定EPUBが開けない
- 初回ページ生成が許容時間を超える
- 主要端末で操作不能になる

ロールバック時も新しいLocator保存は維持し、ページャだけを切り替えられる構造にする。

## 15. 実装開始条件

実装前に次を確定する。

1. 行番号を論理行番号として扱うこと。
2. ページ進行方向の初期値を`auto`とし、縦書きならrtl、横書きならltrに解決すること。
3. テーマをアプリ共通設定とすること。
4. 章先頭を必ずページ先頭にする設定を初期実装へ含めるか。
5. DOM測定ページャの機能フラグ名。

推奨値:

```text
lineNumbers = logical source lines
pageProgression = auto
themeScope = global
chapterStartsNewPage = false
featureFlag = measuredPagerV2
```

