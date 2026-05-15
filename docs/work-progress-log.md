# TsukuyomiReader 作業進捗ログ

## 運用ルール

- 作業開始時に、このログへ「開始」「目的」「触る予定の範囲」を追記する。
- 作業中に判明した未解決事項は「未解決・確認待ち」に追記する。
- 作業完了時に「完了」「確認結果」「次にやること」を追記する。
- 中断から再開するときは、最新日の「次にやること」と「未解決・確認待ち」から読む。

## 2026-05-15 立ち読みモード実機確認準備

### 開始

- 目的: 立ち読みモードを実機確認できる段階まで進んだか確認し、実機確認手順を整理する。
- 目的: 実機確認中に並行して進められるよう、本体側の未実装・修正中・要確認機能をリストアップする。
- 制約: 今回はコード修正を行わない。リストアップとログ追記まで。

### 現在の到達点

- 立ち読み用 `config/site-config.json` を追加済み。
- Libraryは `/api/books` または `books/manifest.json` から作品一覧を読む構成。
- 管理画面 `admin.html` を追加済み。
- Cloudflare Pages Functions + R2 前提の管理APIを追加済み。
- 管理画面/APIはEPUBとTXTのアップロードに対応済み。
- 管理者マニュアルに立ち読み専用URLと管理URLを追記済み。

### 未解決・確認待ち

- Cloudflare実環境でR2 bindingと管理APIが動くかは未確認。
- 実機でReader表示、コピー抑制、キャッシュ更新、管理画面操作を確認する必要がある。

### 追加した確認資料

- `docs/tachiyomi-device-checklist.md`
  - 実機確認用のチェックリストを追加。
- `README.md`
  - 実機確認チェックリストと作業進捗ログへのリンクを追加。

### 本体機能見直し結果

コード修正は行わず、未実装・修正中・要確認の機能をリストアップした。

#### 優先度 高

- Cloudflare実環境での管理API/R2動作が未確認。
  - `TSUKUYOMI_BOOKS_BUCKET` と `TSUKUYOMI_ADMIN_TOKEN` 設定後に確認が必要。

#### 優先度 中

- 管理画面に作品削除機能がない。
  - 現状は公開停止のみ。R2上の古い本文ファイル・表紙ファイルは残る。
- 管理画面に表紙だけ削除する機能がない。
  - 表紙差し替えはできるが、未設定へ戻せない。
- 管理画面の管理トークンはlocalStorage保存。
  - 共有端末では保存しない運用注意が必要。
- `update_books.bat` は `origin main` にpushする。
  - Cloudflareで `tachiyomi` ブランチ運用にする場合は不一致になる。
- `scripts/generate-book-manifest.mjs` と `UpdateBookManifest.bat` は旧 `book/` 運用前提。
  - 予備運用として残すか、立ち読み用に整理するか判断が必要。

#### 優先度 低

- Reader本文は全文一括DOM生成。
  - 大容量書籍向けの分割描画や仮想化は未実装。
- EPUB正規化で生成するBlob URLの明示的なrevokeは未実装。
  - 長時間・多冊読み替え時のメモリ確認が必要。
- 管理画面は基本機能のみ。
  - 並び順変更、検索、プレビュー、入力バリデーション詳細表示は未実装。

### TXT対応の補足

- 立ち読みモード本体は、manifest経由のTXT読込に対応済み。
- 管理画面/APIはEPUB専用になっていたため、実機確認前提として本文ファイルをEPUB/TXT両対応に修正済み。
- その後の本体機能見直しで見つけた事項については、コード修正せずリストアップのみとした。

### 完了

- 実機確認手順を `docs/tachiyomi-device-checklist.md` に整理した。
- 本体側の未実装・修正中・要確認機能を上記にリストアップした。
- 本体機能見直しで見つけた事項については、コード修正を行っていない。

### 次にやること

- 実機確認チェックリストに沿って、Cloudflare実環境と端末別確認を実施する。
- 実機確認結果をこのログへ追記する。
- 実機確認中に並行して、上記リストのうち高優先度から修正方針を決める。

## 2026-05-15 立ち読みモード実動前修正

### 開始

- 目的: 実機確認前に、立ち読みモードの動作を妨げる高優先度項目を先に修正する。
- 対象: キャッシュ制御、公開停止後の復元抑止、ローカル起動確認用フォールバック、内部ヘルプ。

### 実施内容

- Service Workerで `/api/*` をネットワーク専用にし、APIレスポンスをCache APIへ保存しないようにした。
- Service Workerのmanifest事前キャッシュで、`/api/books` が正常に返る本番環境ではAPI配下の本文を事前キャッシュしないようにした。
- 前回読んだmanifest作品を自動復元する前に、現在のmanifestで公開中か再確認するようにした。
- `books/manifest.json` のフォールバック作品を、実ファイルのないEPUBから `books/works/sample.txt` へ変更した。
- `books/works/sample.txt` を追加した。
- 内部ヘルプ `templates/help.html` の古いライト版・同梱本表現を、立ち読みモード表現へ更新した。
- PWA manifestの説明文を「公開作品」前提に更新した。

### 解消済み

- 公開停止後も前回キャッシュから本文復元される可能性。
  - 復元前に現在のmanifestで公開中か再確認するよう修正。
- Service Workerが `/api/books` や本文APIのレスポンスをキャッシュする可能性。
  - `/api/*` をネットワーク専用に修正。
- フォールバック用 `books/manifest.json` が存在しないサンプルEPUB/表紙を参照していた問題。
  - 実在する `books/works/sample.txt` に変更。
- 内部ヘルプが古いライト版・同梱本前提だった問題。
  - 立ち読みモード表現に更新。
- `manifest.json` のPWA説明が「同梱書籍」前提だった問題。
  - 「公開作品」前提に更新。

### 検証結果

- JS構文チェック: OK
  - `js/app.js`
  - `js/library.js`
  - `js/admin.js`
  - `sw.js`
- Functions構文チェック: OK
  - `functions/_shared/books.js`
  - `functions/api/books/index.js`
  - `functions/api/books/[id]/content.js`
  - `functions/api/books/[id]/cover.js`
  - `functions/api/admin/books/index.js`
  - `functions/api/admin/books/[id].js`
- ローカルHTTP配信確認: OK
  - `http://127.0.0.1:8000/index.html`
  - `http://127.0.0.1:8000/admin.html`
  - `http://127.0.0.1:8000/books/manifest.json`
  - `http://127.0.0.1:8000/books/works/sample.txt`
- mock R2による管理API/読者API確認: OK
  - TXT登録
  - 管理一覧取得
  - 公開一覧取得
  - TXT本文取得
  - 公開停止後に公開一覧から消えること

### 残る実機専用確認

- Cloudflare Pages Functionsが実デプロイで有効になること。
- 実R2 bindingでEPUB/TXT/表紙が保存・取得できること。
- Surface Go / Android / iPhoneでReader表示とコピー抑制が期待通り動くこと。
- iOS SafariでService Worker更新と強制同期の挙動が許容範囲か確認すること。
