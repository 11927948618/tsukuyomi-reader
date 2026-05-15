# TsukuyomiReader 立ち読みモード 更新側マニュアル

このマニュアルは、立ち読み用サイトに作品を追加・差し替え・公開停止する更新担当者向けです。

## 立ち読み専用URL

立ち読み用の公開URLは以下です。

```text
https://tsukuyomi-reader-tachiyomi.pages.dev/
```

Cloudflare Pagesでまだ作成していない場合は、このURLになるように `tsukuyomi-reader-tachiyomi` プロジェクトを作成します。

## 立ち読みモードの概要

立ち読みモードでは、読者はサイト上の作品一覧から作品を選んで読みます。

ローカルファイル読込とバックアップZIP保存は非表示になり、本文では通常のコピー、右クリック、ドラッグ保存を抑制します。これは一般的なコピー操作を避けるための設定であり、スクリーンショット、開発者ツール、通信取得まで完全に防ぐものではありません。

## 重要なファイル

- `config/site-config.json`
  - サイト全体の動作モードを切り替える設定です。
- `books/manifest.json`
  - 立ち読み用に表示する作品一覧です。
- `books/works/`
  - 配布するEPUBを置く場所です。
- `books/covers/`
  - 作品カードに表示する表紙画像を置く場所です。
- `update_books.bat`
  - Surface Goなどで、`books/` 配下だけをcommit/pushするための簡易バッチです。

## モード切替

立ち読み用として公開する場合は、`config/site-config.json` を以下の状態にします。

```json
{
  "mode": "distribution",
  "siteName": "TsukuyomiReader 立ち読み用",
  "allowLocalImport": false,
  "allowExport": false,
  "disableCopy": true,
  "showVersion": true,
  "showCopyright": true,
  "copyright": "© 2026 hal the juggernaut. All rights reserved.",
  "booksManifest": "./books/manifest.json"
}
```

開発確認でローカルファイル読込やZIP保存を使いたい場合は、以下のようにします。

```json
{
  "mode": "development",
  "siteName": "TsukuyomiReader Dev",
  "allowLocalImport": true,
  "allowExport": true,
  "disableCopy": false,
  "showVersion": true,
  "showCopyright": true,
  "copyright": "© 2026 hal the juggernaut. All rights reserved.",
  "booksManifest": "./books/manifest.json"
}
```

## 作品を追加する

1. EPUBを `books/works/` に置きます。

例:

```text
books/works/namida.epub
```

2. 表紙画像を `books/covers/` に置きます。

例:

```text
books/covers/namida.jpg
```

3. `books/manifest.json` に作品情報を追加します。

```json
{
  "id": "namida",
  "title": "なみだの行方",
  "author": "hal the juggernaut",
  "description": "立ち読み用の短い紹介文。",
  "format": "epub",
  "path": "./books/works/namida.epub",
  "cover": "./books/covers/namida.jpg",
  "published": true,
  "updatedAt": "2026-05-15"
}
```

`published` が `true` の作品だけが一覧に表示されます。

## 作品を差し替える

同じ作品IDのままEPUBを差し替える場合は、次のどちらかで運用します。

- 同じファイル名で上書きする
- 新しいファイル名にして、`books/manifest.json` の `path` と `updatedAt` を更新する

キャッシュの影響を避けたい場合は、新しいファイル名にする方法が確実です。

例:

```json
"path": "./books/works/namida-20260515.epub",
"updatedAt": "2026-05-15"
```

## 作品を非公開にする

`books/manifest.json` の該当作品を以下のように変更します。

```json
"published": false
```

ファイルをすぐ消す必要はありません。公開一覧から外したあと、不要になったタイミングで `books/works/` と `books/covers/` から削除します。

## ローカル確認

`tsukuyomi-reader` フォルダで以下を実行します。

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

ブラウザで開きます。

```text
http://127.0.0.1:8000/
```

確認する項目:

- 作品一覧に `published: true` の作品だけが出ている
- 表紙、タイトル、作者、紹介文、更新日が表示されている
- 「読む」でEPUBが開く
- 立ち読み用ではローカルファイル読込UIが出ていない
- 立ち読み用ではバックアップZIP保存が出ていない
- 本文画面と設定内にcopyrightが出ている
- 通常コピー、右クリック、ドラッグ保存が抑制されている

## Surface Goで作品だけ更新する

Surface Goでは原則として以下だけを更新します。

- `books/manifest.json`
- `books/works/*.epub`
- `books/covers/*`

更新後、`update_books.bat` を実行します。

バッチは `books/` 配下の変更だけを表示し、確認後に以下を実行します。

```bat
git add books
git commit -m "books update %date% %time%"
git push origin main
```

## Cloudflare Pagesでの配布

推奨構成:

- 開発版: `tsukuyomi-reader.pages.dev`
- 立ち読み用: `tsukuyomi-reader-tachiyomi.pages.dev`

ブランチ分離例:

- `main`: 開発用
- `tachiyomi`: 立ち読み用

Cloudflare Pagesでは2つのプロジェクトを作り、それぞれ監視ブランチを変えます。

## トラブル対応

作品一覧が出ない場合:

- `config/site-config.json` の `booksManifest` が `./books/manifest.json` になっているか確認します。
- `books/manifest.json` がJSONとして壊れていないか確認します。
- 作品の `published` が `true` になっているか確認します。

「読む」で失敗する場合:

- `path` のEPUBが実際に存在するか確認します。
- ファイル名の全角、空白、大文字小文字が一致しているか確認します。
- ローカル確認時は、ファイルを直接開かずHTTPサーバー経由で開きます。

表紙が出ない場合:

- `cover` の画像パスが実際のファイルと一致しているか確認します。
- 画像形式はまず `jpg` / `png` を使います。

更新したのに古い内容が出る場合:

- Library画面の「強制同期（キャッシュ破棄）」を実行します。
- EPUBを同名上書きした場合は、ファイル名を変えて `path` を更新します。
