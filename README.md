# Tsukuyomi Reader

縦書き読書を主目的にした PWA リーダーです。
現在は Reader 本体の主要機能が一通りそろっており、正式リリース前の仕上げと配布形態の整理を進める段階です。

## 現在の実装
- `TXT` 読み込み
  - `utf-8` / `shift_jis` の判定と手動選択に対応
- `HTML` 読み込み
  - 章構造がなくても `section.chapter` を補完
- `EPUB` 読み込み
  - spine 解決
  - nav / ncx / 見出しからの目次生成
  - 章内リンクの補正
  - 画像などアセットの blob URL 化
- バックアップ `ZIP` の保存 / 復元
- Reader 表示
  - `paged` / `scrollx` / `scrolly`
  - 縦書き / 横書き / auto 判定
  - 文字サイズ、行間、字間、折り返し幅、テーマ切替
  - 原稿用紙 400 字目安プリセット
  - 章一覧ジャンプ
  - Windows ホイールページ送り
- 状態保持
  - 表示設定の保存
  - 読書位置の保存
  - 前回の本のキャッシュ復元
- PWA
  - Service Worker による静的アセットのキャッシュ

## ディレクトリ
- `index.html`
  - エントリーポイント
- `templates/`
  - `library.html`, `reader.html`
- `js/`
  - `app.js`: 画面遷移と状態保持
  - `library.js`: 読み込み画面
  - `reader.js`: Reader 本体
  - `normalize-txt.js`: TXT 整形
  - `normalize-epub.js`: EPUB 整形
  - `storage.js`: ZIP 入出力
- `css/`
  - 共通 / Reader / 縦組み用スタイル

## 現在の制約
- 本文は全文を一括で DOM に流し込む方式です
- 大容量書籍向けの分割描画や仮想化は未対応です
- JSZip は配布物に同梱しています

## 正式リリース前の方針
- まずはライト版として、同梱した書籍だけを確実に読める構成へ寄せる案が有力です
- 現在は `book/` フォルダと `book/manifest.json` を使い、配布物に含める `TXT` / `EPUB` を固定で読む形へ寄せています
- 汎用版ではこの制約を外し、外部ファイル読み込みや配布方式を整理して再拡張します

## ライト版メモ
- 同梱書籍の一覧は `book/manifest.json` で管理します
- 実ファイルは `book/` 直下またはその配下に置けます
- ライト版の同梱上限は `6冊` とします
- ライト版の制約は主に `js/library.js` に閉じ込めています
- 汎用版へ戻すときは `LIGHT_EDITION_BUNDLED_ONLY` と `book/manifest.json` の導線を外す想定です
- `book/` に本を追加したら `node ./scripts/generate-book-manifest.mjs` で manifest を再生成できます
- ダブルクリック用に `UpdateBookManifest.bat` も用意しています
- `TsukuyomiReader.bat` 起動時も、先に manifest 更新を試みます
- 既存の `title` / `description` は、同じ相対パスの本であれば再生成時も引き継ぎます
- ライト版では、前回キャッシュの自動復元も同梱書籍に限定します

## 今後の候補
- 大容量書籍向けの分割描画
- 同梱書籍専用のライト版導線
- 汎用版への再拡張

## 配布前チェックリスト
- Windows / Android / iPhone で起動し、Library 画面が崩れないこと
- 同梱本一覧で長いタイトルや説明が枠からはみ出さないこと
- 内部ヘルプと Reader の表示設定が最後までスクロールできること
- 本文フォント `system / 明朝 / ゴシック` の切替が効くこと
- 縦書き EPUB / 横書き EPUB の初期文字組みが大きく外れないこと
- 設定保存後に再度開き、表示設定と進捗が復元されること
- バックアップ ZIP の書き出しと読み戻しができること
- 「再起動（リロード）」と「強制同期（キャッシュ破棄）」後も正常起動すること
