# Tsukuyomi Reader (tsukuyomi-reader)

PWA縦書きリーダーのPhase 0 + Phase 1実装。

## 構成
- `index.html` がテンプレートを差し替えるSPA風構成
- Library / Readerは `templates/` に分離
- JSは画面別に分割

## 動作
- TXT / HTML / 保存ZIP (book-reader-data.zip) の読み込み
- 縦書き表示 (writing-mode: vertical-rl)
- 章一覧から該当章へスクロール

## 重要
- EPUBは未実装（`normalize-epub.js` はスタブ）
- JSZipはCDNを利用
