# TsukuyomiReader 描画内容決定ロジック推定 v0.3

作成日: 2026-06-20 JST  
目的: i文庫HD公式UIから推定した設定を、TsukuyomiReaderの実際の「何を・どこまで・どう描くか」の決定ロジックへ落とす。

---

## 1. 結論

現行 v0.2 は、**設定項目の抽出仕様としては有効**。  
ただし、TsukuyomiReader がブラウザ/PWAベースであるなら、v0.2のように全グリフ座標を自前計算して描く設計を主軸にするのは重い。

推奨は以下。

```text
本文の実描画: CSS/ブラウザの縦書き組版に任せる
ページ分割: TsukuyomiReader側でDOM計測して決める
PDF出力・画像化: 必要時だけ座標系ロジックを使う
```

つまり、v0.2は破棄ではなく、役割を変更する。

```text
v0.2の座標式 = Canvas/PDF出力・検証用
v0.3の本命 = HTML/CSS描画 + DOM計測ページング
```

評価:

| 観点 | 現行v0.2評価 | コメント |
|---|---:|---|
| i文庫HD設定の抽出 | 85/100 | 方向、半角回転、ルビ、行間、追加文字数/列数の拾い方は良い |
| 縦書き思想 | 80/100 | 右上開始・右から左への列送りは妥当 |
| 実描画エンジン | 60/100 | 手計算寄りすぎる。ブラウザベースなら過剰 |
| ページ分割 | 55/100 | `len(column)` 型はルビ・約物・半角列で崩れる |
| TsukuyomiReader適合 | 70/100 | HTML/PWA設計に合わせて再配置すれば有効 |

---

## 2. v0.2から直すべき最大点

### 2.1 「文字数でページを切る」は危険

v0.2では以下のような考えだった。

```python
while len(column) < metrics.chars_per_column:
    column.append(token)
```

これは初期検証には使えるが、本実装では危ない。

理由:

- ルビ付き文字は、本文1文字でも横方向に追加領域を持つ
- 半角回転の `ABC` は1トークンでも高さが本文1文字分とは限らない
- 縦中横は複数文字を1文字枠に入れる
- 傍点は本文の横に副レイヤーを持つ
- 句読点・括弧はセル中央配置では不自然
- 禁則処理で前後の列に文字が移動する

したがって、ページ分割単位は `文字数` ではなく、以下にする。

```text
LayoutUnit
  source_start
  source_end
  kind
  text
  break_before_allowed
  break_after_allowed
  css_class
  estimated_advance
```

ただし、ブラウザ版では `estimated_advance` は最終決定に使わない。  
最終的には DOM の overflow 実測で決める。

---

## 3. TsukuyomiReaderの推奨描画モデル

### 3.1 レイヤー構成

```text
Source Text / EPUB / HTML
↓
正規化
↓
構造化DOM用トークンへ変換
↓
HTML生成
↓
CSS縦書き表示
↓
隠し測定コンテナでページ境界を決定
↓
PageMap保存
↓
表示コンテナへ現在ページだけ描画
```

v0.2では「座標を計算して描く」発想だったが、TsukuyomiReaderでは次がよい。

```text
座標を決めるのはブラウザ
ページ境界を決めるのはTsukuyomiReader
```

---

## 4. i文庫HD UIから推定するCSS変数

i文庫HD公式UIから取れる項目を、TsukuyomiReaderのCSS変数にする。

```css
.reader-page {
  writing-mode: vertical-rl;
  direction: ltr;
  font-family: var(--reader-font-family);
  font-size: var(--reader-font-size);
  line-height: var(--reader-line-height);
  color: var(--reader-text-color);
  background: var(--reader-background-color);
}

.reader-page .halfwidth-rotated {
  text-orientation: sideways;
}

.reader-page .upright {
  text-orientation: upright;
}

.reader-page ruby rt {
  font-size: var(--reader-ruby-size);
}

.reader-page .emphasis {
  text-emphasis-style: filled sesame;
  text-emphasis-position: over right;
}
```

### 4.1 行間の扱いを修正

v0.2では以下の仮説だった。

```python
column_advance = font_px * 1.5 * 0.88
# = 1.32em
```

これは狭すぎる可能性が高い。  
「行間88%」を本文サイズに対する追加空きと見るなら、初期値は以下が自然。

```text
line-height = 1 + 0.88 = 1.88
```

TsukuyomiReader初期値案:

```yaml
reading.layout.line_spacing_percent: 88
reading.layout.line_height: 1.88
```

計算:

```python
def resolve_line_height(line_spacing_percent: int) -> float:
    return 1.0 + line_spacing_percent / 100.0
```

ただし、これは推定。  
実機比較がないため、UI上は `line_spacing_percent` を保持し、内部CSSでは `line-height` に変換する。

---

## 5. 描画内容の決定ルール

### 5.1 入力をそのまま描かない

本文は次の順に変換する。

```text
原文
↓
正規化済みテキスト
↓
InlineToken列
↓
LayoutUnit列
↓
HTML断片
↓
CSSで縦書き描画
```

### 5.2 Token分類

```python
class TokenKind:
    TEXT = "text"
    RUBY = "ruby"
    EMPHASIS = "emphasis"
    HALF_WIDTH_RUN = "half_width_run"
    DIGIT_RUN = "digit_run"
    LATIN_RUN = "latin_run"
    OPEN_BRACKET = "open_bracket"
    CLOSE_BRACKET = "close_bracket"
    PUNCT = "punct"
    PARAGRAPH_BREAK = "paragraph_break"
    FORCED_LINE_BREAK = "forced_line_break"
    FORCED_PAGE_BREAK = "forced_page_break"
```

### 5.3 描画出力の決定表

| 入力 | 条件 | 出力HTML | 備考 |
|---|---|---|---|
| 通常和文 | 常時 | text node | ブラウザ縦書きに任せる |
| `｜漢字《かんじ》` | 青空文庫ルビ | `<ruby><rb>漢字</rb><rt>かんじ</rt></ruby>` | ルビサイズはCSS変数 |
| 傍点注記 | 傍点ON | `<span class="emphasis">...</span>` | 縮小率はCSS側で調整困難なら別処理 |
| ASCII連続 | 半角回転ON | `<span class="halfwidth-rotated">ABC</span>` | i文庫HDの「半角回転」に対応 |
| ASCII連続 | 半角回転OFF | `<span class="upright">A B C</span>`相当 | 初期は通常表示でも可 |
| 2桁数字 | 縦中横ON | `<span class="tcy">12</span>` | 初期OFF。Reader側拡張 |
| 句読点 | 常時 | text node | Phase 1はフォント/ブラウザ任せ |
| 改ページ注記 | 常時 | page boundary | DOMには描かない |

---

## 6. ページ内容の決定ロジック

### 6.1 基本方針

TsukuyomiReaderでは、1ページに入る本文を手計算で決めず、**隠し測定DOMに入れて overflow を見る**。

```text
候補本文を測定コンテナへ投入
↓
縦書きCSSを適用
↓
scrollWidth / clientWidth を比較
↓
入るなら増やす
↓
溢れるなら減らす
↓
最大で入るsource offsetをページ境界にする
```

縦書き `vertical-rl` では、本文は右から左へ増えるため、縦方向ではなく横方向の overflow を見る。

```javascript
function isOverflowingVertical(container) {
  return container.scrollWidth > container.clientWidth + 1;
}
```

### 6.2 ページ境界探索

```javascript
function buildPageMap(units, startIndex, pageContainer) {
  let pages = [];
  let i = startIndex;

  while (i < units.length) {
    let lo = i + 1;
    let hi = estimateInitialEnd(units, i);

    while (hi < units.length && !overflows(units.slice(i, hi), pageContainer)) {
      hi = Math.min(units.length, hi * 2 - i);
    }

    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (overflows(units.slice(i, mid), pageContainer)) {
        hi = mid - 1;
      } else {
        lo = mid;
      }
    }

    const safeEnd = snapToSafeBreak(units, i, lo);

    pages.push({
      sourceStart: units[i].sourceStart,
      sourceEnd: units[safeEnd - 1].sourceEnd,
      unitStart: i,
      unitEnd: safeEnd
    });

    i = safeEnd;
  }

  return pages;
}
```

### 6.3 安全な切れ目

ページ末尾にしてよい場所を制限する。

```javascript
function snapToSafeBreak(units, start, end) {
  let i = end;

  while (i > start) {
    if (units[i - 1].breakAfterAllowed && units[i]?.breakBeforeAllowed !== false) {
      return i;
    }
    i--;
  }

  return end;
}
```

切ってはいけないもの:

- ルビ親文字とルビの途中
- 縦中横の途中
- 半角回転runの途中
- 開き括弧直後
- 閉じ括弧直前
- 行頭禁則文字の直前
- 傍点対象範囲の途中。ただし長い場合は例外を許す

---

## 7. 禁則処理の置き場所

v0.2では `apply_kinsoku(columns)` として手動処理を想定していた。

ブラウザ版では、まずCSSへ寄せる。

```css
.reader-page {
  line-break: strict;
  word-break: normal;
  overflow-wrap: normal;
}
```

ただし、ブラウザ差が出る。  
そのため、TsukuyomiReader側では「ページ境界で明らかに変な切れ方をしない」ための `snapToSafeBreak` だけ持つ。

```text
行内禁則: まずブラウザ任せ
ページ境界禁則: TsukuyomiReaderで制御
```

---

## 8. 現行設計で残してよいもの

| v0.2要素 | 判定 | 理由 |
|---|---|---|
| `writing_mode: vertical_rl` | 残す | 日本語縦書きの主軸 |
| `page_progression: rtl` | 残す | 右開き本として必要 |
| `font_size_pt` | 残す | UI表示値として有効 |
| `ruby_scale_percent` | 残す | i文庫HD UIに対応 |
| `line_spacing_percent` | 残す | ただし変換式は修正 |
| `additional_chars_per_column` | 条件付きで残す | DOM計測前の推定値として使う |
| `additional_columns_per_page` | 条件付きで残す | 物理列数操作ではなく版面幅補正として扱う |
| 原文オフセット保存 | 必ず残す | ページ番号保存は再ページングで壊れる |
| Phase分割 | 残す | 実装順として妥当 |

---

## 9. 現行設計から変更すべきもの

| 現行v0.2 | 問題 | 修正案 |
|---|---|---|
| 手計算座標が主役 | PWA/HTML設計と相性が悪い | 主役はCSS、座標式はPDF/検証用へ |
| `chars_per_column`で分割 | ルビ・禁則・半角で崩れる | DOM overflowでページ境界決定 |
| `line_spacing = 1.5em * 0.88` | 狭すぎる可能性 | `line-height = 1 + 0.88` を初期仮説に変更 |
| 半角回転をCanvas描画想定 | ブラウザならCSSで可能 | `.halfwidth-rotated { text-orientation: sideways; }` |
| ルビ座標を手計算 | HTMLならruby要素が自然 | `<ruby><rt>`に変換 |
| 傍点を座標計算 | CSS text-emphasisで可 | CSS優先。不足時のみ独自描画 |

---

## 10. TsukuyomiReader用データ構造案

### 10.1 設定

```yaml
reading:
  text:
    writing_mode: vertical_rl
    page_progression: rtl
    font_family: system_serif_ja
    font_size_pt: 18.0
    text_color: "#111111"
    background_color: "#F5EEDC"

  layout:
    ruby_scale_percent: 56
    line_spacing_percent: 88
    line_height: 1.88
    top_margin_chars: 0
    additional_chars_per_column: 0
    additional_columns_per_page: 0

  display:
    rotate_half_width_in_vertical: true
    tate_chu_yoko_enabled: false
    tate_chu_yoko_max_digits: 2
    shrink_emphasis_dots: true
    show_running_title: true
    show_page_number: true
    portrait_page_layout: single
    landscape_page_layout: spread
```

### 10.2 PageMap

```json
{
  "bookId": "sample",
  "textRevision": "sha256...",
  "layoutHash": "sha256...",
  "pages": [
    {
      "pageIndex": 0,
      "sourceStart": 0,
      "sourceEnd": 842,
      "unitStart": 0,
      "unitEnd": 126
    }
  ]
}
```

---

## 11. 実装順の修正版

### Phase 1: CSS縦書き表示

- 原文をHTML化
- `writing-mode: vertical-rl`
- 右開きページ移動
- フォントサイズ
- 背景色/文字色
- 行間
- 原文オフセット保存

### Phase 2: DOM計測ページング

- 隠し測定コンテナ
- overflow判定
- PageMap生成
- ページ境界のsource offset保存
- リサイズ時再ページング

### Phase 3: i文庫HD系の縦書き要素

- 半角回転
- ルビ
- 傍点
- 表題表示
- ページ番号
- ページガイド

### Phase 4: 青空文庫対応

- ルビ注記
- 傍点注記
- 字下げ注記
- 改ページ注記

### Phase 5: 品質調整

- 縦中横
- 禁則補助
- 約物補正
- 見開き
- PDF出力

---

## 12. 最終判断

TsukuyomiReaderの現在の設計は、**方向性は正しいが、v0.2のままだと描画エンジンを自作しすぎる**。

採るべき設計はこれ。

```text
TsukuyomiReader = CSS縦書きレンダラー + DOM計測ページャ + 原文オフセット管理
```

i文庫HDから学ぶべきなのは内部描画座標ではなく、以下。

```text
読者が調整できる組版パラメータ
右開き/縦書き/見開きの読書UI
ルビ・傍点・半角回転のON/OFF思想
自動計算後に微調整できる設計
```

v0.2は「低レベル描画設計」として残し、v0.3では「ブラウザ縦書き描画を前提にしたページ決定ロジック」へ移すのがよい。

---

## 13. 参照

- NagisaWorks i文庫HD 公式マニュアル 文字ウィンドウ
- NagisaWorks i文庫HD 公式マニュアル 表示設定
- NagisaWorks i文庫HD 公式マニュアル マージン設定
- W3C CSS Writing Modes Level 3
- W3C 日本語組版処理の要件 JLReq
