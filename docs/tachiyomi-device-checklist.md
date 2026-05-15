# TsukuyomiReader 立ち読みモード 実機確認チェックリスト

## 事前準備

Cloudflare側で以下が完了していることを確認します。

- 立ち読み用Pagesプロジェクトがある
  - `tsukuyomi-reader-tachiyomi`
- 公開URLが開ける
  - `https://tsukuyomi-reader-tachiyomi.pages.dev/`
- 管理URLが開ける
  - `https://tsukuyomi-reader-tachiyomi.pages.dev/admin.html`
- R2 bindingがある
  - `TSUKUYOMI_BOOKS_BUCKET`
- 管理トークン環境変数がある
  - `TSUKUYOMI_ADMIN_TOKEN`
- 最新コードがデプロイ済み
- ブラウザでキャッシュが残っている場合は、Readerの「強制同期（キャッシュ破棄）」を使える状態にしておく

## 管理画面の確認

対象URL:

```text
https://tsukuyomi-reader-tachiyomi.pages.dev/admin.html
```

確認項目:

- 管理画面が表示される
- 管理トークン未入力では作品一覧取得に失敗する
- 正しい管理トークンを入力して「保存」すると作品一覧が読める
- EPUBをアップロードできる
- TXTをアップロードできる
- 表紙画像をアップロードできる
- 作品ID、タイトル、作者、紹介文、更新日が保存される
- 「公開する」をONにした作品が読者画面に出る
- 「公開停止」を押すと読者画面から消える
- 「公開する」を押すと再度読者画面に出る
- 「編集に読み込む」で既存作品をフォームに戻せる
- 本文ファイルを選ばず、説明文や公開状態だけ変更できる

## 読者画面の確認

対象URL:

```text
https://tsukuyomi-reader-tachiyomi.pages.dev/
```

確認項目:

- 作品一覧が表示される
- `published: true` の作品だけ表示される
- 表紙、タイトル、作者、紹介文、更新日が表示される
- EPUB作品の「読む」でReaderが開く
- TXT作品の「読む」でReaderが開く
- Libraryにローカルファイル読込UIが出ない
- LibraryにバックアップZIP書き出しUIが出ない
- Reader設定内にバックアップZIP保存が出ない
- copyrightがLibraryに表示される
- copyrightがReader画面下部に表示される
- copyrightがReader設定内に表示される

## Reader操作の確認

確認項目:

- `Library` ボタンで作品一覧に戻れる
- `章` ボタンで章一覧が開く
- `設定` ボタンで設定パネルが開く
- 文字サイズ変更が効く
- 行間変更が効く
- 字間変更が効く
- 折り返し位置変更が効く
- Light / Darkテーマ変更が効く
- 縦書き / 横書き変更が効く
- paged / scrollx / scrolly が切り替わる
- 読書位置が保存される
- 再読み込み後に読書位置が復元される

## コピー抑制の確認

立ち読みモードでは、完全なコピー防止ではなく通常操作の抑制として確認します。

確認項目:

- 本文を通常ドラッグ選択できない
- `Ctrl+C` / コピー操作で本文コピーできない
- 右クリックメニューが開かない
- 画像や本文をドラッグ保存できない
- スクリーンショットや開発者ツールまでは防げない前提で運用する

## 端末別確認

最低限、以下で確認します。

- Windows / Edge
- Surface Go / Edge
- Android / Chrome
- iPhone or iPad / Safari

各端末で見る項目:

- Library画面が崩れない
- 作品カードの長いタイトルや紹介文がはみ出さない
- Reader上部メニューが画面外にはみ出さない
- 設定パネルが最後までスクロールできる
- 章一覧が開閉できる
- タップによるページ送りが効く
- 画面回転後に表示が破綻しない

## キャッシュ更新の確認

確認項目:

- 作品を差し替えたあと、読者画面に更新が反映される
- 反映されない場合、「再起動（リロード）」で変わる
- それでも変わらない場合、「強制同期（キャッシュ破棄）」で変わる
- 公開停止した作品が、通常の再読み込み後に一覧から消える

## 結果記録

確認結果は `docs/work-progress-log.md` に追記します。

記録例:

```text
### 実機確認結果

- Windows Edge: OK
- Surface Go Edge: OK
- Android Chrome: 未確認
- iPhone Safari: Reader設定パネルのスクロール要再確認

### 発見事項

- ...
```
