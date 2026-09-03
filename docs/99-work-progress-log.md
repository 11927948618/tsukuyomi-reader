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

- `docs/04-tachiyomi-device-checklist.md`
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

- 実機確認手順を `docs/04-tachiyomi-device-checklist.md` に整理した。
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

## 2026-05-15 Pages URL未作成の確認

### 発生状況

- `https://tsukuyomi-reader-tachiyomi.pages.dev/` にアクセスすると、Edgeで `DNS_PROBE_FINISHED_NXDOMAIN` が表示された。

### 判断

- アプリ本体の起動エラーではなく、Cloudflare Pagesプロジェクト `tsukuyomi-reader-tachiyomi` がまだ作成されていない状態。
- `*.pages.dev` のホスト名は、Pagesプロジェクト作成・初回デプロイ後に有効になる。

### 対応

- `docs/02-tachiyomi-update-manual.md` に「Pagesプロジェクトを作成する」手順を追加。
- `docs/04-tachiyomi-device-checklist.md` に、NXDOMAIN時はPagesプロジェクト未作成として扱う注意を追加。

### 次にやること

- Cloudflare Dashboardで `tsukuyomi-reader-tachiyomi` Pagesプロジェクトを作成する。
- 初回デプロイ後に公開URLと管理URLが開けるか確認する。
- その後、R2 bindingと管理トークンを設定して管理画面/API確認へ進む。

## 2026-05-15 Cloudflare Pages 初回ビルド失敗

### 発生状況

- Cloudflare Pagesの初回デプロイで `Build failed`。
- ログ:
  - `No build command specified. Skipping build step.`
  - `Validating asset output directory`
  - `Error: Output directory "tsukuyomi-reader" not found.`

### 判断

- コードの問題ではなく、Cloudflare Pagesのビルド設定ミス。
- 当初は作業フォルダ構成から `Root directory: tsukuyomi-reader` と判断していたが、ローカル確認の結果、`.git` は `tsukuyomi-reader/` 内にある。
- つまりGitHubリポジトリ直下がすでにアプリ本体であり、Cloudflare Pagesの `Root directory` は空欄が正しい。
- `Root directory` に `tsukuyomi-reader` を指定すると、Cloudflareが存在しないサブフォルダを探して失敗する。

### 対応方針

Cloudflare Pagesの設定を以下に修正する。

```text
Root directory: 空欄
Framework preset: None
Build command: 空欄
Build output directory: .
```

修正後、`Retry deployment` ではなく、必要なら `Check your build settings` から設定を直して再デプロイする。

## 2026-05-15 Cloudflare Pages 設定修正後も旧設定で失敗

### 発生状況

- 再デプロイログでも以下が出た。
  - `Error: Output directory "tsukuyomi-reader" not found.`
  - `No functions dir at /functions found. Skipping.`
- ローカルのGit確認結果:
  - 現在ブランチ: `main`
  - 最新コミット: `32aa9e2 backup 2026/05/15 10:37:43.89`
  - CloudflareログのHEADも同じ `32aa9e2`

### 判断

- GitHubへ接続しているコミット自体はCloudflareが取得できている。
- 失敗原因は引き続きCloudflare Pagesのビルド設定。
- `Build output directory: .` でも、`Root directory: tsukuyomi-reader` が入っていると、最終的な出力先は `tsukuyomi-reader` として扱われる。
- 現在のGitHubリポジトリ直下には `index.html`、`functions/`、`js/` などが直接存在するため、`Root directory` は空欄にする。

### 次にやること

- `Settings > Build > Build configuration` で `Root directory` を空欄にし、`Build output directory: .` を保存する。
- `Deployments` に戻り、新しい時刻のデプロイを作成または再実行する。
- 新しいログで `Build output: .` 相当になっているか確認する。

### 追記

- Cloudflare Pagesの `Build configuration` は保存済み。
- 保存時点の設定:

```text
Framework preset: None
Build command: 空欄
Build output directory: .
Root directory: tsukuyomi-reader
```

- ただし、この時点の `Root directory: tsukuyomi-reader` は誤り。正しくは空欄。

## 2026-05-15 Cloudflare Pages Root directory誤指定の判明

### 発生状況

- 再デプロイでも以下が継続。
  - `Error: Output directory "tsukuyomi-reader" not found.`
  - `No functions dir at /functions found. Skipping.`
- ローカルの実体確認:
  - `C:\Users\karak\VSCode\TsukuyomiReader\tsukuyomi-reader` 内に `.git` がある。
  - 同じ階層に `index.html`、`admin.html`、`functions/` がある。

### 判断

- GitHubリポジトリ直下がすでにアプリ本体。
- Cloudflare Pagesで `Root directory: tsukuyomi-reader` を指定してはいけない。
- 正しい設定は以下。

```text
Framework preset: None
Build command: 空欄
Build output directory: .
Root directory: 空欄
```

### 次にやること

- `Settings > Build > Build configuration` を開く。
- `Root directory (advanced)` の `Path` を空欄にする。
- `Build output directory` は `.` のままにする。
- 保存後、`Deployments` から新しいデプロイを実行する。

## 2026-05-15 Cloudflare Pages Root directory修正後

### 発生状況

- `Root directory` を空欄にして再デプロイした。
- 新しいログで以下が出た。
  - `Found Functions directory at /functions. Uploading.`
  - `Compiled Worker successfully`
  - `Validating asset output directory`

### 判断

- `Root directory` の誤指定は解消。
- Cloudflare Pagesが `functions/` を認識できている。
- 次は `Validating asset output directory` の後に、静的ファイルのアップロードとデプロイ完了まで進むか確認する。

### 次にやること

- デプロイログの最終行まで確認する。
- 成功した場合:
  - `https://tsukuyomi-reader-tachiyomi.pages.dev/`
  - `https://tsukuyomi-reader-tachiyomi.pages.dev/admin.html`
  を開く。
- 失敗した場合は、`Validating asset output directory` 以降のエラー行を確認する。

## 2026-05-15 Pages公開後の初回画面確認

### 確認結果

- `https://tsukuyomi-reader-tachiyomi.pages.dev/` が開いた。
- `https://tsukuyomi-reader-tachiyomi.pages.dev/admin` が開いた。
- 公開画面で `/api/books を読み込めません` が表示された。
- 管理画面は表示されるが、作品一覧は管理トークン未入力状態。
- 公開画面にローカルファイル読込UIが残って見えている。

### 調査結果

- `https://tsukuyomi-reader-tachiyomi.pages.dev/config/site-config.json` は `distribution` と `allowLocalImport: false` を返している。
- `https://tsukuyomi-reader-tachiyomi.pages.dev/api/books` はHTTP 500で、本文は以下。

```json
{"error":"R2 bucket binding が未設定です"}
```

### 判断

- Pages本体とFunctionsのデプロイは成功している。
- `/api/books` 失敗の原因はCloudflare側のR2 binding未設定。
- 作品登録・公開には、次に `TSUKUYOMI_BOOKS_BUCKET` と `TSUKUYOMI_ADMIN_TOKEN` の設定が必要。
- ローカル読込UIが残る件は、JS側の非表示処理だけでなくCSS側にも保険を追加する。

### 対応

- `css/base.css` に以下の保険を追加。
  - `[hidden] { display: none !important; }`
  - `body.site-mode-distribution [data-manual-import]` の強制非表示
  - `body.site-mode-distribution [data-export-control]` の強制非表示
- キャッシュ更新のため以下を更新。
  - `js/version.js`: `0.1.49`
  - `sw.js`: cache name `tsukuyomi-reader-v0.1.49`

### 検証

- `node --check js/app.js`: OK
- `node --check js/library.js`: OK
- `node --check sw.js`: OK
- `node --check js/version.js`: OK

### 次にやること

- この修正をcommit/pushしてCloudflareへ反映する。
- CloudflareでR2 bucket bindingを追加する。
- Cloudflareで管理トークン環境変数を追加する。

### 追記

- commit: `07397cf fix distribution mode deploy settings`
- `main` へpush済み。
- Cloudflare Pages公開側で `js/version.js` が `APP_VERSION = "0.1.49"` を返すことを確認。
- UI非表示の保険修正は公開環境へ反映済み。

## 2026-05-15 R2利用方針

### 判断

- Cloudflare R2は無料枠つきの従量課金。
- Standard storageの無料枠は、月10GB保存、Class A操作100万回、Class B操作1000万回。
- 無料枠を超えた分は後払いで課金される。
- 立ち読み用の小規模運用では無料枠内に収まる想定。
- Surface Goなど別環境から管理画面で更新しやすくするため、R2利用で進める。

### 次にやること

- Cloudflare R2の初回画面で `Add R2 subscription to my account` を押す。
- R2 bucket `tsukuyomi-reader-books` を作成する。
- Pagesプロジェクト `tsukuyomi-reader-tachiyomi` にR2 bindingを追加する。
- `TSUKUYOMI_ADMIN_TOKEN` を設定する。
- 再デプロイ後、`/api/books` が `[]` を返すことを確認する。

## 2026-05-15 R2 binding後のデプロイ成功

### 発生状況

- Cloudflare Pagesの再デプロイが成功。
- デプロイログで以下を確認。
  - `Found Functions directory at /functions. Uploading.`
  - `Compiled Worker successfully`
  - `Found _routes.json in output directory. Uploading.`
  - `Success: Assets published!`
  - `Success: Your site was deployed!`

### 確認結果

- `https://tsukuyomi-reader-tachiyomi.pages.dev/api/books`
  - HTTP 200
  - レスポンス: `[]`
- `https://tsukuyomi-reader-tachiyomi.pages.dev/js/version.js`
  - `APP_VERSION = "0.1.49"`

### 判断

- Pages本体、Functions、R2 bindingは正常。
- 作品未登録のため、読者画面の作品一覧は空で正しい。

### 次にやること

- 管理画面で `TSUKUYOMI_ADMIN_TOKEN` を入力して保存する。
- TXTまたはEPUB作品を1件登録する。
- `公開する` をONにして保存する。
- 読者画面に作品が表示され、読めることを確認する。

## 2026-05-15 作品登録後の公開確認

### 確認結果

- 読者画面に作品カードが1件表示された。
- 表示内容:
  - title: `銀河鉄道の夜`
  - author: `宮沢賢治`
  - format: `epub`
  - updatedAt: `2026-05-15`
- `/api/books` は以下の作品を返す。
  - id: `test000`
  - path: `/api/books/test000/content`
- `/api/books/test000/content`
  - HTTP 200
  - `Content-Type: application/epub+zip`
  - `Content-Length: 41437`

### 判断

- 管理画面からの作品登録、R2保存、公開manifest反映、本文配信APIは正常。
- 次は読者画面の「読む」でReaderへ遷移し、EPUB本文が表示されるか確認する。

## 2026-05-15 EPUB Reader安全モード修正

### 発生状況

- 登録したEPUB「銀河鉄道の夜」をReaderで開くと、本文は表示されるが、EPUB側のCSSやhtml/body由来の組版指定がReader側の縦書き・段組みと衝突している。
- 現象:
  - 縦書き本文のページ化が不安定。
  - EPUB内の `writing-mode`、余白、ページ分割指定などがReaderの `.reader-content.force-vertical` と競合する。

### 対応

- `js/normalize-epub.js`
  - `PRESERVE_EPUB_CSS = false` を追加し、EPUB内CSSのReader挿入を停止。
  - `copyPresentationAttributes()` をやめ、html/bodyからは `lang` / `xml:lang` だけコピーする `copyLanguageOnly()` に変更。
  - `sanitizeChapter()` で `style` / `class` / `width` / `height` / `align` / `dir` とイベント属性を除去。
  - EPUB本文先頭に `h1` / `h2` / `h3` がある場合、normalize側の追加 `h1` を挿入しない。
  - brが3個以上ある青空系の巨大段落は、brをReaderへ持ち込まず論理段落として結合・分割するよう調整。
- `css/reader.css`
  - `.epub-html` / `.epub-body` がReader側の `writing-mode` / `text-orientation` / `direction` を継承するCSSを追加。
  - EPUB本文内の `p` / `div` / `section` の余白・組版指定をReader基準にリセット。
- `js/version.js` / `sw.js`
  - キャッシュ更新用に `0.1.50` へ更新。

### 検証

- `node --check js/normalize-epub.js`: OK
- `node --check js/app.js`: OK
- `node --check js/library.js`: OK
- `node --check sw.js`: OK

### 次にやること

- 修正をcommit/pushしてCloudflare Pagesへ反映する。
- 公開側で `v0.1.50` になったことを確認する。
- 読者画面で「銀河鉄道の夜」を開き、Readerの縦書き・ページ送りに従って表示されるか実機確認する。

### 追記

- commit: `9f363eb normalize epub for reader layout`
- `main` へpush済み。
- Cloudflare Pages公開側で `js/version.js` が `APP_VERSION = "0.1.50"` を返すことを確認。
- 公開側の `js/normalize-epub.js` に `PRESERVE_EPUB_CSS = false` と `copyLanguageOnly()` が反映されていることを確認。
- 公開側の `css/reader.css` に `.epub-html` / `.epub-body` のReader組版継承CSSが反映されていることを確認。

## 2026-05-18 Cloudflare R2使用量ガード設計と実装

### 目的

- Reader以外の公開アプリを増やす場合も、R2の無料枠はアカウント全体で共有される。
- 公開アプリが増えるとClass B操作も足し算で増えるため、共通で使える使用量ガード設計を資料化する。
- R2 Metricsの月間見込みに応じて、新規公開停止または公開一時停止できる構造を入れる。

### 対応

- `docs/20-cloudflare-usage-guard-design.md` を追加。
  - R2 Metrics監視、Cron Worker、`usage-guard.json`、公開停止ガードの共通設計を記載。
- `functions/_shared/usage-guard.js` を追加。
  - `_tsukuyomi/usage-guard.json` を短時間キャッシュして読む。
  - `TSUKUYOMI_PUBLICATION_PAUSED=true` による手動停止を優先。
  - 公開停止時のmanifest空配列応答、本文/表紙503応答、新規公開ブロック判定を提供。
- 公開APIにガードを追加。
  - `/api/books`
  - `/api/books/:id/content`
  - `/api/books/:id/cover`
- 管理APIにガードを追加。
  - `newPublishDisabled` 時は、新規公開または非公開から公開への変更を403で拒否。
  - 既存公開作品の非公開化や非公開保存は可能。
- 管理画面に使用量ガード状態の表示を追加。
- `workers/usage-guard/` を追加。
  - Cloudflare GraphQL Analytics APIでR2 Metricsを取得。
  - 月間Class B見込みを計算。
  - `_tsukuyomi/usage-guard.json` をR2へ書き込む別Worker雛形。
- `README.md` と `docs/02-tachiyomi-update-manual.md` に関連資料と運用メモを追記。
- キャッシュ更新用に `v0.1.51` へ更新。

### 検証

- `node --check functions/_shared/books.js`: OK
- `node --check functions/_shared/usage-guard.js`: OK
- `node --check functions/api/books/index.js`: OK
- `node --check functions/api/books/[id]/content.js`: OK
- `node --check functions/api/books/[id]/cover.js`: OK
- `node --check functions/api/admin/books/index.js`: OK
- `node --check functions/api/admin/books/[id].js`: OK
- `node --check js/admin.js`: OK
- `node --check sw.js`: OK
- `node --check workers/usage-guard/src/index.js`: OK
- R2モック検証:
  - 通常時 `/api/books`: 200、作品一覧を返す。
  - 通常時 `/api/books/a/content`: 200、本文を返す。
  - `TSUKUYOMI_PUBLICATION_PAUSED=true` 時 `/api/books`: 200、`[]` を返す。
  - `TSUKUYOMI_PUBLICATION_PAUSED=true` 時 `/api/books/a/content`: 503。
  - `TSUKUYOMI_PUBLICATION_PAUSED=true` 時、管理APIの新規公開POST: 403。

### 次にやること

- 変更をcommit/pushしてCloudflare Pagesへ反映する。
- 公開側で `v0.1.51` を確認する。
- 必要になった段階で `workers/usage-guard/` を別Workerとしてデプロイする。

### 追記

- commit: `369a871 add r2 usage guard`
- `main` へpush済み。
- Cloudflare Pages公開側で `js/version.js` が `APP_VERSION = "0.1.51"` を返すことを確認。
- `/api/books` はHTTP 200で公開作品一覧を返すことを確認。

## 2026-05-18 簡易F5対策の実装

### 目的

- 独自ドメインがない `*.pages.dev` 運用でも、無料で入れられる短時間連打対策を追加する。
- R2を読む前に公開APIで同一IPの過剰アクセスを429にし、R2 Class B操作の増加を抑える。
- R2使用量ガードは最後の停止線として残す。

### 対応

- `functions/_shared/rate-limit.js` を追加。
  - module scopeのMapで、同一IP・API種別ごとの短時間アクセス数を記録。
  - 既定値は `/api/books` と表紙が10秒60回、本文が10秒12回。
  - 超過時は30秒間429を返す。
- 公開API3本にレート制限を追加。
  - `/api/books`
  - `/api/books/:id/content`
  - `/api/books/:id/cover`
- `docs/21-cloudflare-f5-defense-design.md` を追加。
- `docs/20-cloudflare-usage-guard-design.md` と `docs/02-tachiyomi-update-manual.md` に運用メモを追記。
- キャッシュ更新用に `v0.1.52` へ更新。

### 検証

- `node --check functions/_shared/rate-limit.js`: OK
- `node --check functions/api/books/index.js`: OK
- `node --check functions/api/books/[id]/content.js`: OK
- `node --check functions/api/books/[id]/cover.js`: OK
- `node --check sw.js`: OK
- レート制限ヘルパー単体確認:
  - `TSUKUYOMI_RATE_LIMIT_CONTENT=2` で同一IPの3回目アクセスが429。
  - `retry-after` ヘッダーが付与される。
  - `TSUKUYOMI_RATE_LIMIT_DISABLED=true` で制限が無効化される。

### 追記

- commit: `8f621c0 add lightweight api rate limit`
- `main` へpush済み。
- Cloudflare Pages公開側で `js/version.js` が `APP_VERSION = "0.1.52"` を返すことを確認。
- `/api/books` はHTTP 200を返すことを確認。
- `/api/books/test000/content` はHTTP 200、`application/epub+zip` を返すことを確認。

## 2026-05-18 匿名読書ログ設計と実装

### 目的

- 立ち読み読者の実名、メールアドレス、端末番号、IPアドレスを保存せず、匿名読者ID単位で読書傾向を集計できるようにする。
- 作品を開いた日時、25/50/75%到達、読了相当をD1へ保存する。
- 同じ人物が別端末で読んだ場合は別読者扱いとし、強い端末追跡は行わない。

### 対応

- `docs/10-reader-analytics-design.md` を追加。
- `migrations/0001_reader_analytics.sql` を追加。
- `functions/_shared/analytics.js` を追加。
- `POST /api/analytics/event` を追加。
  - readerIdをサーバ側でハッシュ化。
  - IPアドレスと生User-Agentは保存しない。
  - D1未設定時は204で何もしない。
- `GET /api/admin/analytics` を追加。
  - 管理トークン必須。
  - 作品別の開始数、読了数、匿名読者数、平均到達率、最近のイベントを返す。
- Reader側に `js/analytics.js` を追加。
  - localStorageにランダムな匿名読者IDを保存。
  - `open`、25/50/75%到達、95%以上到達を送信。
  - Do Not Track有効時は既定で送信しない。
- 管理画面に読書ログ集計欄を追加。
- プライバシー表示をLibraryとReader設定に追加。
- キャッシュ更新用に `v0.1.53` へ更新。

### 検証

- `node --check functions/_shared/analytics.js`: OK
- `node --check functions/_shared/rate-limit.js`: OK
- `node --check functions/api/analytics/event.js`: OK
- `node --check functions/api/admin/analytics/index.js`: OK
- `node --check js/analytics.js`: OK
- `node --check js/app.js`: OK
- `node --check js/reader.js`: OK
- `node --check js/admin.js`: OK
- `node --check sw.js`: OK
- D1モック検証:
  - D1未設定時の `POST /api/analytics/event`: 204。
  - D1設定時の `open` / `progress` / `finish`: 200、3件保存。
  - 保存データにIPアドレスが含まれないことを確認。
  - `reader_id_hash` が64文字SHA-256形式になることを確認。
  - `GET /api/admin/analytics`: 200、作品別集計を返す。
  - 別OriginからのPOSTは403。
- フロント側送信ロジック検証:
  - manifest由来作品で `open` が送信される。
  - 25%到達で `progress:25` が送信される。
  - 100%到達時に未送信の `progress:50` / `progress:75` と `finish:100` が送信される。
  - 同一閾値は重複送信されない。

### 追記

- commit: `3b7b1b3 add anonymous reader analytics`
- `main` へpush済み。
- Cloudflare Pages公開側で `js/version.js` が `APP_VERSION = "0.1.53"` を返すことを確認。
- `/api/books` はHTTP 200を返すことを確認。
- `/api/analytics/event` はD1未設定状態でHTTP 204を返し、Reader本体に影響しないことを確認。

## 2026-05-18 モバイル表示の実機指摘対応

### 目的

- AndroidでReader上部UIを隠した後、縦書き段組みが崩れる問題を抑制する。
- 立ち読み作品一覧をスマホで複数作品まで自然にスクロールして選べるようにする。
- 古いiPhone/Safariで黒画面だけになる状態を避ける。

### 対応

- `js/reader.js`
  - 上部UI表示/非表示、画面リサイズ、表示モード変更時にReader寸法を再計算する処理を統合。
  - 縦書きRTLの物理スクロール位置ではなく、論理ページ位置を保持してから再レイアウトするよう変更。
- `templates/library.html` / `css/base.css` / `js/library.js`
  - 作品一覧の開閉ボタンを見出し右側の小ボタンに変更。
  - スマホでは作品一覧をカード内スクロールではなくページ全体スクロールに変更。
  - 立ち読みモードのスマホ表示では作品一覧を上に出す。
  - 作品カードの表紙幅、説明文、読むボタンをスマホ向けに調整。
- `css/reader.css`
  - `100dvh` 非対応環境向けに `100vh` フォールバックを追加。
  - スマホReaderの余白と本文枠幅を調整。
- `js/legacy-check.js`
  - 古いSafari等で `?.` / `??` が使えない場合、黒画面ではなく未対応案内を表示。
  - iPhone 6 Plus級の完全対応は、Reader用JSの構文互換化が別作業として必要。
- キャッシュ更新用に `v0.1.54` へ更新。

### 検証

- `node --check js/reader.js`: OK
- `node --check js/library.js`: OK
- `node --check js/legacy-check.js`: OK
- `node --check js/app.js`: OK
- `node --check js/version.js`: OK
- `node --check sw.js`: OK
- ローカルHTTP起動確認:
  - `/`: HTTP 200
  - `/js/legacy-check.js`: HTTP 200
  - `/js/version.js`: `APP_VERSION = "0.1.54"`

### 追記

- ローカルコミット作成済み。
- 初回はCodex側の使用量制限により `git push origin main` が未実行だった。
- その後、再試行して `main` へpush済み。

## 2026-05-18 iPhone / iPad 対応世代の暫定明示

### 方針

- この時点では緩めの対象世代を記録したが、後続の「モバイル対応基準の再整理」でiOS / iPadOS 15以降へ変更した。
- iPhone 6 Plus以前、古いSafariは対象外とする。
- 目安:
  - iPhone: iPhone 6s / iPhone SE 第1世代以降
  - iPad: iPad Air 2 / iPad mini 4 / iPad Pro以降
- 対象外端末では黒画面ではなく未対応案内が出れば許容とする。

### 対応

- `js/legacy-check.js` の未対応案内に対象世代を明記。
- `docs/03-tachiyomi-reader-manual.md` の推奨ブラウザ欄に対象世代を追記。
- `docs/04-tachiyomi-device-checklist.md` の端末別確認に対象世代と対象外基準を追記。
- `templates/help.html` の配布前チェックリストに対象世代を追記。
- キャッシュ更新用に `v0.1.55` へ更新。

### 検証

- `node --check js/legacy-check.js`: OK
- `node --check js/version.js`: OK
- ローカルHTTP起動確認:
  - `/`: HTTP 200
  - `/js/legacy-check.js`: HTTP 200
  - `/js/version.js`: `APP_VERSION = "0.1.55"`

### 追記

- commit: `163ef90 fix mobile reader layout`
- `main` へpush済み。
- Cloudflare Pages公開側で `js/version.js` が `APP_VERSION = "0.1.55"` を返すことを確認。
- `/`: HTTP 200
- `/js/legacy-check.js`: HTTP 200
- `/api/books`: GETでHTTP 200、`application/json`

## 2026-05-18 モバイル対応基準の再整理

### 方針

- 個別端末の完全対応ではなく、立ち読み専用の標準ブラウザ向け表示安定を優先する。
- iPhone / iPadは、iOS 15 / iPadOS 15以降を公式対応にする。
- iOS 14以下、iPhone 6 Plus以前、古いSafariは対象外にする。
- 実機がない端末は、ブラウザ開発者ツールのスマホ幅シミュレーションで以下を確認する。
  - Library画面が崩れない
  - 作品一覧を複数作品までスクロールできる
  - Reader上部UIの表示/非表示で本文が極端に崩れない
  - 設定パネル、章一覧が最後までスクロールできる

### 対応

- `js/legacy-check.js`
  - 判別できる範囲でiOS/iPadOS 14以下を未対応案内に落とす。
  - 未対応案内をiOS 15 / iPadOS 15以降基準に変更。
- `docs/03-tachiyomi-reader-manual.md`
  - 推奨ブラウザをiOS 15 / iPadOS 15以降に変更。
- `docs/04-tachiyomi-device-checklist.md`
  - 実機がない場合のスマホ幅シミュレーション確認方針を追記。
- `templates/help.html`
  - 配布前チェックリストへ対応OS基準とシミュレーション確認を追記。
- キャッシュ更新用に `v0.1.56` へ更新。

### 検証

- `node --check js/legacy-check.js`: OK
- `node --check js/version.js`: OK
- `rg "iOS 13|iPadOS 13|iOS 12 以下|iOS 12以下"`: 現行表記なし
- Playwright Chromium / mobile viewport `393x852`:
  - 作品カード3件を表示。
  - `#bundledBooksList` は `max-height: none` / `overflow-y: visible`。
  - 3件目カードまで表示されることを確認。
  - Readerを開き、上部UI表示中の本文枠 `375x693`、非表示後 `375x828`。
  - 上部UI非表示後も `scrollLeft` は有限値で、本文枠とページ幅が破綻しないことを確認。

### 追記

- commit: `0350eff set mobile support baseline`
- `main` へpush済み。
- Cloudflare Pages公開側で `js/version.js` が `APP_VERSION = "0.1.56"` を返すことを確認。
- `/js/legacy-check.js`: HTTP 200
- `/api/books`: GETでHTTP 200、`application/json`

## 2026-05-18 iOS 12.5 レガシー試用枠

### 方針

- iPhone 6 Plus実機確認のため、iOS 12.5以降を一時的にレガシー試用枠として入口開放する。
- 公式対応は引き続き iOS 15 / iPadOS 15 以降とする。
- iOS 12.5から14は、レガシー資産のため正常動作するか不明であることを注意画面で明示する。
- iOS 12.4以下、古いSafari、必要Web APIがない環境は未対応案内に落とす。

### 対応

- `index.html`
  - Reader本体 `js/app.js` の自動読み込みをやめ、`legacy-check.js` から起動する方式へ変更。
- `js/legacy-check.js`
  - 通常環境では自動で `js/app.js` を読み込む。
  - iOS 12.5から14では注意画面を表示し、「理解して試す」押下後にReader本体を読み込む。
  - 起動失敗時はレガシー試用失敗案内を表示する。
- `docs/03-tachiyomi-reader-manual.md`
  - iOS 12.5以降はレガシー試用枠で、正常動作不明と明記。
- `docs/04-tachiyomi-device-checklist.md`
  - iOS 12.5から14の確認項目をレガシー試用枠に変更。
- `templates/help.html`
  - 配布前チェックリストへレガシー試用枠を追記。
- キャッシュ更新用に `v0.1.57` へ更新。

### 検証

- `node --check js/legacy-check.js`: OK
- `node --check js/version.js`: OK
- Playwright Chromium / 通常スマホ幅:
  - `legacy-check.js` 経由でReader本体が起動することを確認。
  - 作品カード表示と `v0.1.57` 表示を確認。
- Playwright Chromium / iPhone OS 12.5 UA:
  - 注意画面「レガシー端末での試用です」が表示されることを確認。
  - 「理解して試す」ボタンが表示されることを確認。

### 追記

- commit: `a71b0ac add ios legacy trial gate`
- `main` へpush済み。
- Cloudflare Pages公開側で `js/version.js` が `APP_VERSION = "0.1.57"` を返すことを確認。
- `/js/legacy-check.js`: HTTP 200
- `/api/books`: GETでHTTP 200、`application/json`

## 2026-05-18 管理画面のR2使用状況と軽量読書ログ

### 目的

- 管理画面からR2バケット内の保存容量とオブジェクト数を概算確認できるようにする。
- D1未設定でも、軽い読書ログ分析を試せるようにする。

### 対応

- `GET /api/admin/storage` を追加。
  - 管理トークン必須。
  - R2バケット内オブジェクトを走査し、保存容量、残り目安、オブジェクト数、プレフィックス別内訳を返す。
  - Class A/B操作数の月次残量はR2 bindingからは取得できないため、Cloudflare Metricsで確認する注記を返す。
- 管理画面に `R2使用状況` カードを追加。
  - 使用量、無料枠目安、残り目安、使用率、プレフィックス別内訳を表示。
- `functions/_shared/analytics-lite.js` を追加。
  - D1未設定時に `_tsukuyomi/analytics-lite.json` へ軽量集計を保存。
  - 作品別の開始数、読了数、匿名読者数、平均到達率、最近のイベントを保存。
- `POST /api/analytics/event`
  - D1 bindingがある場合は従来通りD1へ保存。
  - D1がなくR2 bucket bindingがある場合はR2軽量集計へ保存。
  - D1もR2もない場合は204で無害にスキップ。
- `GET /api/admin/analytics`
  - D1がある場合はD1集計。
  - D1がない場合はR2軽量集計を返す。
- `docs/02-tachiyomi-update-manual.md` と `docs/10-reader-analytics-design.md` にR2使用状況とR2軽量集計の注意を追記。
- キャッシュ更新用に `v0.1.58` へ更新。

### 検証

- `node --check functions/_shared/analytics-lite.js`: OK
- `node --check functions/api/analytics/event.js`: OK
- `node --check functions/api/admin/analytics/index.js`: OK
- `node --check functions/api/admin/storage/index.js`: OK
- `node --check js/admin.js`: OK
- `node --check js/version.js`: OK
- モックR2検証:
  - R2軽量集計で `open` と `progress:50` を保存できることを確認。
  - 管理用payloadで `opens: 1`、`avgProgress: 50` を返すことを確認。
  - R2使用状況APIがオブジェクト数、使用容量、残り目安を返すことを確認。

### 追記

- commit: `0c90663 add admin storage and lite analytics`
- `main` へpush済み。
- Cloudflare Pages公開側で `js/version.js` が `APP_VERSION = "0.1.58"` を返すことを確認。
- `/api/books`: GETでHTTP 200、`application/json`
- `/api/admin/storage`: 未認証でHTTP 401
- `/api/admin/analytics`: 未認証でHTTP 401

## 2026-05-18 作品IDヘルプ追加

### 対応

- 管理画面の作品ID入力欄に、使用可能文字の短いヘルプを追加。
- 作品ID入力欄に英数字、ハイフン、アンダースコアのみのHTML patternを追加。
- 更新マニュアルに作品IDのルールと例を追記。
  - 英数字、ハイフン `-`、アンダースコア `_` が使用可能。
  - 日本語は使わない。
  - 空欄なら自動IDを作成。
  - 同じ作品を差し替える場合は同じ作品IDを使う。
- キャッシュ更新用に `v0.1.59` へ更新。

### 追記

- commit: `00c3c3b add admin book id help`
- `main` へpush済み。
- Cloudflare Pages公開側で `js/version.js` が `APP_VERSION = "0.1.59"` を返すことを確認。

## 2026-05-18 管理画面ヘルプ追加

### 対応

- 管理画面ヘッダーに `管理ヘルプ` ボタンを追加。
- ポップアップヘルプを追加。
  - すぐ使う操作の短いヘルプを表示。
  - 管理トークン、作品ID、本文ファイル、公開停止、R2使用状況、読書ログ、古いiPhoneの注意を記載。
- 既存Markdown資料を管理画面内で表示できる項目を追加。
  - `docs/02-tachiyomi-update-manual.md`
  - `docs/03-tachiyomi-reader-manual.md`
  - `docs/04-tachiyomi-device-checklist.md`
  - `docs/99-work-progress-log.md`
- キャッシュ更新用に `v0.1.60` へ更新。

### 検証

- `node --check js/admin.js`: OK
- `node --check js/version.js`: OK
- Playwright Chromium / local `admin.html`:
  - `管理ヘルプ` ボタンでポップアップが開くことを確認。
  - `すぐ使う` に作品IDなどの短いヘルプが出ることを確認。
  - `更新マニュアル` から `docs/02-tachiyomi-update-manual.md` を読み込めることを確認。
  - `閉じる` でポップアップを閉じられることを確認。

### 追記

- commit: `0248f25 add admin help modal`
- `main` へpush済み。
- Cloudflare Pages公開側で `js/version.js` が `APP_VERSION = "0.1.60"` を返すことを確認。
- 公開側 `admin.html` に `管理ヘルプ` とマニュアル表示導線が含まれることを確認。
- 公開側 `docs/02-tachiyomi-update-manual.md` がHTTP 200で読めることを確認。

## 2026-05-18 EPUB br改行分割修正

### 対応

- EPUB内の `<p>...<br>...</p>` 形式の本文で、br分割が最初の1個で止まっていた問題を修正。
- brタグの検出を `<br>` / `<br />` / 属性付きbrに対応する正規表現へ変更。
- brが多い段落を論理段落へ分ける際、同一段落内の明示改行を `<br />` として残すように変更。
- 青空文庫判定に乗らないEPUBでも、brが3個以上ある巨大段落はReader向けに分割するように変更。
- キャッシュ更新用に `v0.1.61` へ更新。

### 検証

- `node --check js/normalize-epub.js`: OK
- `node --check js/version.js`: OK
- Playwright Chromium / local:
  - テスト用EPUBをブラウザ上で生成して `normalizeEpub()` を実行。
  - 青空文庫判定あり/なしの両方で、brが3個以上ある巨大段落が複数の `<p>` に分かれることを確認。
  - 同一段落内の明示改行が `<br />` として残ることを確認。

## 2026-05-19 限定レビュー運用資料の取り込み

### 対応

- `docs/06-limited-review-operation.md` を追加。
  - 公開版Reader、限定レビュー版Reader、ローカル確認版の役割を整理。
  - 賞応募候補作品を公開版に置かない方針を明記。
  - Cloudflare Access等でサイト/API全体を認証必須にする運用を推奨として記載。
  - `reviewOnly` / `awardCandidate` フラグ案は、保護そのものではない注意を追記。
- `README.md` のマニュアル一覧と立ち読みモードメモに限定レビュー運用を追加。
- `docs/02-tachiyomi-update-manual.md` に限定レビュー版と賞応募候補の運用方針を追加。
- 管理画面ヘルプに `限定レビュー` の資料表示項目を追加。
- 管理画面の短いヘルプに、賞応募候補は公開版に置かない注意を追加。
- キャッシュ更新用に `v0.1.62` へ更新。

### 検証

- `node --check js/admin.js`: OK
- `node --check js/version.js`: OK
- `rg "limited-review-operation|限定レビュー|awardCandidate|reviewOnly"`: 追加箇所を確認。
- Playwright Chromium / local `admin.html`:
  - `管理ヘルプ` の短いヘルプに限定レビューの注意が出ることを確認。
  - `限定レビュー` ボタンから `docs/06-limited-review-operation.md` を読み込めることを確認。
  - 読み込んだ資料内に `Cloudflare Access` と `公開版Readerには置かない` が含まれることを確認。

### 追記

- commit: `0a12c0e add limited review operations guide`
- `main` へpush済み。
- Cloudflare Pages公開側で `js/version.js` が `APP_VERSION = "0.1.62"` を返すことを確認。
- 公開側 `docs/06-limited-review-operation.md` がHTTP 200で読めることを確認。
- 公開側 `admin.html` に限定レビュー資料へのヘルプ導線が含まれることを確認。

## 2026-05-19 限定レビューの個別許可メモとAccess読書ログ

### 対応

- 管理画面に `限定レビュー許可メモ` を追加。
  - 名前、メールアドレス、状態、メモを記録できる。
  - 状態は `未適用` / `Access適用済み` / `停止済み`。
  - 実際の許可はCloudflare Access側で行い、管理画面は記録欄として扱う。
- 管理API `GET/PUT /api/admin/review-access` を追加。
  - R2の `_tsukuyomi/review-access-list.json` に許可メモを保存する。
- 管理ヘルプに `アクセス許可` の抜粋ヘルプを追加。
  - Cloudflare Access側で許可すること。
  - Reader画面だけでなく `/api/books`、本文API、表紙APIも保護すること。
  - 管理画面の一覧は許可の実行ではなく記録であること。
- 限定レビュー版向けにAccess認証済みメールと読書ログを紐づける任意設定を追加。
  - `TSUKUYOMI_ACCESS_IDENTITY_ANALYTICS=true`
  - D1用マイグレーション `migrations/0002_access_identity_analytics.sql` を追加。
  - 管理画面の読書ログに `Access別読書ログ` を表示。
  - R2軽量集計にもAccess別の簡易集計を追加。
- マニュアル類へ、メールアドレスを含む個人情報ログになること、文芸分析目的で閲覧データを使う旨を案内文に明記することを追記。
- キャッシュ更新用に `v0.1.63` へ更新。

### 検証

- `node --check js/admin.js`: OK
- `node --check js/version.js`: OK
- `node --check functions/_shared/analytics.js`: OK
- `node --check functions/_shared/analytics-lite.js`: OK
- `node --check functions/api/analytics/event.js`: OK
- `node --check functions/api/admin/analytics/index.js`: OK
- `node --check functions/api/admin/review-access/index.js`: OK
- モックR2検証:
  - `GET/PUT /api/admin/review-access` で許可メモを保存・取得できることを確認。
  - R2軽量集計でAccess認証メール付きイベントを記録し、管理用payloadに `reviewers` が出ることを確認。
  - `POST /api/analytics/event` が `cf-access-authenticated-user-email` と `TSUKUYOMI_ACCESS_IDENTITY_ANALYTICS=true` を受けて、Access別ログを保存することを確認。
- Playwright Chromium / local `admin.html`:
  - `限定レビュー許可メモ` に名前・メール・状態・メモを追加できることを確認。
  - `管理ヘルプ > アクセス許可` で個別アクセス許可の抜粋ヘルプを表示できることを確認。

### 追記

- commit: `1b94a0b add review access tracking`
- `main` へpush済み。
- Cloudflare Pages公開側で `js/version.js` が `APP_VERSION = "0.1.63"` を返すことを確認。
- 公開側 `admin.html` に `限定レビュー許可メモ` と `アクセス許可` ヘルプ導線が含まれることを確認。
- 公開側 `/api/admin/review-access` が未認証でHTTP 401を返すことを確認。
- 公開側 `docs/10-reader-analytics-design.md` に `TSUKUYOMI_ACCESS_IDENTITY_ANALYTICS` と `Access別読書ログ` の説明が反映されていることを確認。

## 2026-05-19 限定レビュー読書ログの用途説明補正

### 対応

- 限定レビューの読書ログは、読者同士に進捗を公開する目的ではないことを明記。
- 管理側が一元的に保管・集計し、将来の文芸分析や作品改善に使う用途であることを、管理画面ヘルプとマニュアルへ追記。
- 管理画面の `Access別読書ログ` 表示を `Access別読書ログ（管理用）` に変更。
- 友人向け案内文に、閲覧データは他の読者には公開しないことを追記。
- キャッシュ更新用に `v0.1.64` へ更新。

### 検証

- `node --check js/admin.js`: OK
- `node --check js/version.js`: OK
- `rg "読者同士|一元保管|Access別読書ログ（管理用）"`: UIヘルプ、README、各マニュアルへの反映を確認。

### 追記

- commit: `f4d4599 clarify review analytics purpose`
- `main` へpush済み。
- Cloudflare Pages公開側で `js/version.js` が `APP_VERSION = "0.1.64"` を返すことを確認。
- 公開側 `js/admin.js` に `Access別読書ログ（管理用）` と、読者同士に進捗を公開しない説明が反映されていることを確認。
- 公開側 `docs/10-reader-analytics-design.md` と `docs/06-limited-review-operation.md` に、管理側の一元保管・将来分析用途の説明が反映されていることを確認。

## 2026-05-19 限定レビューの閲覧保留

### 対応

- Cloudflare Access許可を残したまま、Reader側で個別に作品一覧を空にする `閲覧保留` を追加。
- 環境変数 `TSUKUYOMI_REVIEW_ACCESS_SOFT_BLOCK=true` を追加。
  - 未設定時は従来通りで、公開版や既存運用へ影響しない。
- 管理画面の `限定レビュー許可メモ` に `閲覧保留` 状態と保留ボタンを追加。
- `閲覧保留` または `停止済み` のAccess認証済みメールに対して、読者向けAPIを以下の挙動にする。
  - `/api/books`: 空配列を返す。
  - `/api/books/:id/content`: 見つからない扱いにする。
  - `/api/books/:id/cover`: 見つからない扱いにする。
- マニュアルへ、Cloudflare Accessから外すと拒否画面が出やすく、目立たせず保留したい場合はAccess許可を残してReader側の `閲覧保留` を使う旨を追記。
- キャッシュ更新用に `v0.1.65` へ更新。

### 検証

- `node --check js/admin.js`: OK
- `node --check js/version.js`: OK
- `node --check functions/_shared/review-access.js`: OK
- `node --check functions/api/admin/review-access/index.js`: OK
- `node --check functions/api/books/index.js`: OK
- `node --check functions/api/books/[id]/content.js`: OK
- `node --check functions/api/books/[id]/cover.js`: OK
- モックR2検証:
  - `muted@example.com` は `/api/books` が `[]` になることを確認。
  - `muted@example.com` は本文APIがHTTP 404になることを確認。
  - `allowed@example.com` は通常どおり作品一覧に作品が出ることを確認。

### 追記

- commit: `04424b0 add review access soft block`
- `main` へpush済み。
- Cloudflare Pages公開側で `js/version.js` が `APP_VERSION = "0.1.65"` を返すことを確認。
- 公開側 `admin.html` に `閲覧保留` の選択肢と説明が反映されていることを確認。
- 公開側 `js/admin.js` に `TSUKUYOMI_REVIEW_ACCESS_SOFT_BLOCK` のヘルプが反映されていることを確認。
- 公開側 `docs/06-limited-review-operation.md` に閲覧保留の説明が反映されていることを確認。

## 2026-05-19 初期設定チェックリスト

### 対応

- `docs/01-tachiyomi-initial-setup.md` を追加。
  - Pages、R2、管理トークンの必須設定を整理。
  - D1、Cloudflare Access、Access読書ログ、閲覧保留、公開停止を任意設定として整理。
  - 未設定時の影響を表で整理。
  - 初期設定後に確認すべき `/api/books`、`/admin.html`、作品登録、Reader表示を記載。
- `README.md` のマニュアル一覧に初期設定チェックリストを追加。
- 管理画面ヘルプに `初期設定` ボタンを追加。
- 更新側マニュアルのCloudflare初期設定章からチェックリストへ誘導。
- キャッシュ更新用に `v0.1.66` へ更新。

### 検証

- `node --check js/admin.js`: OK
- `node --check js/version.js`: OK
- `rg "tachiyomi-initial-setup|初期設定チェックリスト|未設定時の影響"`: README、管理画面ヘルプ、更新側マニュアル、作業ログへの反映を確認。

## 2026-05-20 DialogueAssembler向けPDF資料とPDF固定レイアウト対応

### 対応

- `docs/30-dialogueassembler-mobile-pdf-export-spec.md` を追加。
  - DialogueAssembler側でスマホ縦長PDFを出力する方針を整理。
  - フォントサイズ、ページ比率、圧縮PDF、ファイル命名、確認項目を記載。
- 管理画面ヘルプに `PDF出力` 資料ボタンを追加。
- 管理画面の本文ファイルでPDFを選択できるようにした。
- 管理APIの本文ファイル登録で `pdf` を許可。
- `application/pdf` のContent-Typeを追加。
- Libraryの手動読み込みとmanifest/API経由読み込みでPDFを判定。
- PDF作品は通常の縦書き本文正規化に流さず、Reader内の固定レイアウトPDF表示枠で開く。
- 更新側マニュアルとREADMEへPDF固定レイアウト作品の扱いを追記。
- キャッシュ更新用に `v0.1.67` へ更新し、Service Worker cache nameも更新。

### 検証

- `node --check js/library.js`: OK
- `node --check js/reader.js`: OK
- `node --check js/admin.js`: OK
- `node --check js/version.js`: OK
- `node --check sw.js`: OK
- `node --check functions/_shared/books.js`: OK
- `node --check functions/api/admin/books/index.js`: OK
- モックR2検証:
  - 管理APIでPDFを登録した時、公開manifestの `format` が `pdf` になることを確認。
  - R2保存時のContent-Typeが `application/pdf` になることを確認。
- `rg "pdf|PDF|dialogueassembler|DialogueAssembler|pdf-reader"`: 追加箇所を確認。

### 追記

- commit: `ca74aad add fixed layout pdf support`
- `main` へpush済み。
- Cloudflare Pages公開側で `js/version.js` が `APP_VERSION = "0.1.67"` を返すことを確認。
- 公開側 `admin.html` にPDF登録UI、`PDF出力` 資料リンク、初期設定資料リンクが反映されていることを確認。
- 公開側 `js/library.js` にPDF読み込み処理が反映されていることを確認。
- 公開側 `js/reader.js` に固定レイアウトPDF表示処理が反映されていることを確認。
- 公開側 `docs/30-dialogueassembler-mobile-pdf-export-spec.md` がHTTP 200で読めることを確認。

## 2026-05-25 管理画面の作品削除と表紙削除

### 開始

- 目的: R2運用で不要になった作品本体や表紙を管理画面から削除できるようにする。
- 対象: 管理API、管理画面、更新マニュアル、キャッシュ更新。
- 方針: 作品削除はmanifestから外したうえで現在参照中の本文・表紙オブジェクトをR2から削除する。表紙削除は作品を残したままcoverKeyだけ消す。

### 対応

- 管理API `DELETE /api/admin/books/:id` を追加し、作品をmanifestから削除後、現在参照中の本文・表紙R2オブジェクトを削除するようにした。
- 管理API `PATCH /api/admin/books/:id` に `removeCover` を追加し、作品本文を残したまま表紙だけ削除できるようにした。
- 既存作品の本文または表紙を差し替えた場合、差し替え前に参照していたR2オブジェクトを削除するようにした。
- 管理画面の作品一覧に、形式と表紙有無を表示し、`表紙削除` と `作品削除` ボタンを追加した。
- 更新マニュアル、README、初期設定、限定レビュー関連資料のEPUB/TXT/PDF表記を整理した。
- キャッシュ更新用に `v0.1.68` へ更新し、Service Worker cache nameも更新した。

### 検証

- `node --check js/admin.js`: OK
- `node --check functions/_shared/books.js`: OK
- `node --check functions/api/admin/books/index.js`: OK
- `node --check functions/api/admin/books/[id].js`: OK
- `node --check js/version.js`: OK
- `node --check sw.js`: OK
- `git diff --check`: OK
- モックR2検証:
  - 表紙削除で `coverKey` が空になり、旧表紙キーが削除されることを確認。
  - 本文差し替えで `contentKey` が更新され、旧本文キーが削除されることを確認。
  - 作品削除でmanifestから作品が消えることを確認。

### 次にやること

- 変更をcommit/pushしてCloudflare Pagesへ反映する。
- 公開側で `js/version.js` が `APP_VERSION = "0.1.68"` を返すことを確認する。
- 管理画面で実R2に対して表紙削除と作品削除を1件ずつ確認する。

## 2026-05-25 `/api/books` 読み込み失敗の詳細表示

### 発生状況

- Reader画面は `v0.1.68` まで更新されているが、作品一覧に `/api/books を読み込めません` と表示された。
- 静的ファイルは読めているため、切り分け対象は `/api/books` のHTTPステータスとレスポンス本文。

### 対応

- 作品一覧manifest読み込み時に、HTTPステータスとJSONエラー本文を画面へ表示するようにした。
  - 例: `/api/books を読み込めません（HTTP 500: R2 bucket binding が未設定です）`
- `fetch()` 自体が失敗した場合も、接続失敗としてエラー内容を表示するようにした。
- キャッシュ更新用に `v0.1.69` へ更新し、Service Worker cache nameも更新した。

## 2026-05-27 限定レビューのReader内パスワード認証

### 開始

- Cloudflare Access認証が安定しない場合の代替として、メールアドレス+パスワードのReader内認証を追加する。
- 管理画面から読者ごとのパスワード発行、無効化、認証ログ確認をできるようにする。
- 作品一覧、本文API、表紙APIは、認証有効時に未ログインで読めないようにする。

### 対応

- `TSUKUYOMI_REVIEW_PASSWORD_AUTH=true` で有効になるReader内パスワード認証を追加。
- `POST /api/review-auth/session` と `GET /api/review-auth/status` を追加。
  - ログイン成功時はHttpOnly Cookieでセッションを発行。
  - セッション署名とパスワードハッシュには `TSUKUYOMI_REVIEW_AUTH_SECRET` を使用。未設定時は管理トークンにフォールバック。
- `functions/_shared/review-auth.js` を追加。
  - パスワードはPBKDF2ハッシュでR2へ保存し、平文は発行時だけ返す。
  - 認証ログは `_tsukuyomi/review-auth-log.json` に保存。
- 既存の `_tsukuyomi/review-access-list.json` を拡張。
  - `hasPassword`、`passwordIssuedAt`、`lastLoginAt`、`lastFailedAt`、`failedLoginCount` を管理表示。
  - 管理画面の通常保存でパスワードハッシュが消えないよう、サーバー側で認証用フィールドを保持。
- 管理API `POST /api/admin/review-access/password` を追加。
  - `issue`: パスワード発行・再発行。
  - `revoke`: パスワード無効化と停止済み化。
- Reader起動時に認証状態を確認し、必要なら `templates/auth.html` のログイン画面を表示。
- 管理画面の `限定レビュー認証管理` に、PW発行、PW再発行、PW無効化、発行結果、認証ログを追加。
- 読書ログへReader内パスワード認証メールを紐づける任意設定 `TSUKUYOMI_REVIEW_PASSWORD_IDENTITY_ANALYTICS=true` を追加。
- README、初期設定、更新マニュアル、限定レビュー運用資料、Reader Analytics設計を更新。
- キャッシュ更新用に `v0.1.70` へ更新し、Service Worker cache nameも更新。

### 検証

- `node --check js/admin.js`: OK
- `node --check js/app.js`: OK
- `node --check js/version.js`: OK
- `node --check sw.js`: OK
- `node --check functions/_shared/review-access.js`: OK
- `node --check functions/_shared/review-auth.js`: OK
- `node --check functions/api/review-auth/status.js`: OK
- `node --check functions/api/review-auth/session.js`: OK
- `node --check functions/api/admin/review-access/index.js`: OK
- `node --check functions/api/admin/review-access/password.js`: OK
- `node --check functions/api/books/index.js`: OK
- `node --check functions/api/books/[id]/content.js`: OK
- `node --check functions/api/books/[id]/cover.js`: OK
- `node --check functions/api/analytics/event.js`: OK
- `git diff --check -- .`: OK

## 2026-05-28 ログ取得とログカバレッジ棚卸し

### 開始

- エラー調査時に、ログが残るかどうかを毎回コードから探さなくてよいようにする。
- 管理画面に表示されるログを、JSONとして取得できる導線を追加する。

### 対応

- 管理者認証ログを管理画面に表示。
  - `GET /api/admin-auth/log` を追加。
  - `認証 > 管理者認証イベント` に表示。
  - `ログ取得` ボタンで `tsukuyomi-admin-auth-log-YYYY-MM-DD.json` をダウンロード。
- 限定レビュー認証ログに管理操作イベントを追加。
  - `review-access-added`: 閲覧者追加。
  - `review-access-status-changed`: 閲覧許可、保留、停止などの状態変更。
  - `review-access-removed`: 閲覧者削除。
- 限定レビュー認証ログの取得ボタンを追加。
  - `限定レビュー認証管理 > 認証イベント > ログ取得`。
  - `tsukuyomi-review-auth-log-YYYY-MM-DD.json` として、閲覧者一覧、認証集計、認証イベントをまとめて保存。
- `docs/09-log-coverage-guide.md` を追加。
  - 管理者認証、限定レビュー認証、読書ログの保存先、表示場所、取得方法を整理。
  - あえて残さないログと、まだ詳細ログ化していないものも明記。
- README、マニュアル索引、管理画面ヘルプに `ログ確認` の導線を追加。

### 検証

- `node --check functions/_shared/admin-auth.js`: OK
- `node --check functions/_shared/review-auth.js`: OK
- `node --check functions/api/admin-auth/log.js`: OK
- `node --check functions/api/admin/review-access/index.js`: OK
- `node --check js/admin.js`: OK
- モックR2検証:
  - 閲覧者追加が `review-access-added` として残ることを確認。
  - 閲覧許可への変更が `review-access-status-changed / pending->applied` として残ることを確認。
  - 管理者OTP送信ログを `/api/admin-auth/log` から取得できることを確認。
- `git diff --check -- .`: OK

## 2026-05-28 限定レビューPW発行失敗ログの解析

### 開始

- 管理画面で閲覧許可後に `PW発行` がエラーになったため、管理操作ログとコード経路を確認する。

### 解析

- `PW発行` は `POST /api/admin/review-access/password` から `issueReviewPassword()` を呼ぶ。
- `issueReviewPassword()` は、読者用パスワードのハッシュと読者セッション署名に `TSUKUYOMI_REVIEW_AUTH_SECRET` を使う。
- `TSUKUYOMI_REVIEW_AUTH_SECRET` が未設定の場合、旧互換として `TSUKUYOMI_ADMIN_TOKEN` にフォールバックする。
- 管理者認証を `email_otp` モードへ移行し、`TSUKUYOMI_ADMIN_TOKEN` も未設定または未使用にしている環境では、閲覧許可の保存は通るが `PW発行` は失敗する。
- この場合の原因は、管理者OTP用の `TSUKUYOMI_ADMIN_AUTH_SECRET` と、限定レビューPW用の `TSUKUYOMI_REVIEW_AUTH_SECRET` を別に設定する必要があること。

### 対応

- `TSUKUYOMI_ADMIN_AUTH_MODE=email_otp` で読者用秘密鍵が未設定の場合、エラーメッセージに `TSUKUYOMI_REVIEW_AUTH_SECRET` を明示するようにした。
- `PW発行` 失敗時に `password-issue-failed` を `_tsukuyomi/review-auth-log.json` へ残すようにした。
  - `secret-missing`: `TSUKUYOMI_REVIEW_AUTH_SECRET` 未設定。
  - `target-not-found`: 対象メールアドレスまたは仮IDが認証管理にない。
- `PW無効化` 失敗時も `password-revoke-failed` を残すようにした。
- 管理画面の `認証イベント` で `PW発行失敗`、`PW無効化失敗` として表示するようにした。
- PW操作APIが失敗レスポンスを返す場合も、最新の認証イベントを管理画面へ返して表示更新できるようにした。
- クイックガイド、限定レビュー運用資料、管理者認証資料にトラブルシュートを追記。

### 検証

- `node --check functions/_shared/review-auth.js`: OK
- `node --check functions/api/admin/review-access/password.js`: OK
- `node --check js/admin.js`: OK
- `git diff --check -- .`: OK
- モックR2検証:
  - `email_otp` モードかつ `TSUKUYOMI_REVIEW_AUTH_SECRET` 未設定で `PW発行` が失敗することを確認。
  - `password-issue-failed / secret-missing` が認証イベントへ残ることを確認。
- モックR2検証:
  - 許可メモ登録後にPW発行できることを確認。
  - 発行パスワードでログインできることを確認。
  - Cookieセッションで認証判定が通ることを確認。
  - PW無効化後、既存セッションが拒否されることを確認。

### 次にやること

- Pages環境変数に `TSUKUYOMI_REVIEW_PASSWORD_AUTH=true` と `TSUKUYOMI_REVIEW_AUTH_SECRET` を設定して再デプロイする。
- 管理画面で対象メールアドレスにPW発行し、実機でReaderログインと作品表示を確認する。

## 2026-05-27 限定レビュー認証の事前防御強化

### 開始

- Reader内パスワード認証の実運用前に、総当たり対策、パスワード期限、同時利用検知、本文キャッシュ対策を入れる。

### 対応

- ログインAPI `POST /api/review-auth/session` に `review_auth` レート制限を追加。
  - 標準: 60秒に6回まで、超過時は5分ブロック。
  - `TSUKUYOMI_RATE_LIMIT_REVIEW_AUTH`、`TSUKUYOMI_RATE_LIMIT_REVIEW_AUTH_WINDOW_SECONDS`、`TSUKUYOMI_RATE_LIMIT_REVIEW_AUTH_BLOCK_SECONDS` で調整可能。
- メールアドレス単位のロックアウトを追加。
  - 標準: 5回失敗で15分ロック。
  - `TSUKUYOMI_REVIEW_LOGIN_FAILURE_LIMIT`、`TSUKUYOMI_REVIEW_LOGIN_LOCK_MINUTES` で調整可能。
- 発行パスワードに期限を追加。
  - 標準: 発行から7日。
  - `TSUKUYOMI_REVIEW_PASSWORD_DAYS` で調整可能。
  - APIアクセス時にも期限を確認し、ログイン済みCookieが残っていても期限切れなら拒否。
- セッションIDをログイントークンに追加。
- `_tsukuyomi/review-session-activity.json` にセッション活動を記録。
  - 同じメールアドレスで10分以内に複数セッションが動いた場合、認証ログへ `concurrent-session` を記録。
  - `TSUKUYOMI_REVIEW_CONCURRENT_WINDOW_MINUTES` で判定窓を調整可能。
- 限定レビュー認証が有効な場合、本文HTMLのローカルキャッシュ保存・復元を抑制。
- 管理画面に `PW期限`、`ロック中`、`同時利用検知` 表示を追加。
- README、初期設定、更新マニュアル、限定レビュー運用資料を更新。
- キャッシュ更新用に `v0.1.71` へ更新し、Service Worker cache nameも更新。

### 検証

- `node --check functions/_shared/review-auth.js`: OK
- `node --check functions/_shared/review-access.js`: OK
- `node --check functions/_shared/rate-limit.js`: OK
- `node --check functions/api/review-auth/session.js`: OK
- `node --check functions/api/books/index.js`: OK
- `node --check functions/api/books/[id]/content.js`: OK
- `node --check functions/api/books/[id]/cover.js`: OK
- `node --check functions/api/analytics/event.js`: OK
- `node --check js/app.js`: OK
- `node --check js/admin.js`: OK
- モックR2検証:
  - パスワード誤入力3回でロックされ、正しいパスワードでもログイン拒否になることを確認。
  - ロック解除後、正しいパスワードでログインできることを確認。
  - 2つのセッションIDが同じメールアドレスで動いた時、`concurrent-session` が認証ログに残ることを確認。
  - `passwordExpiresAt` が過去日の場合、既存セッションでも `password-expired` として拒否されることを確認。

### 次にやること

- Pages環境変数に必要値を設定して、管理画面からPW発行と期限表示を実R2で確認する。

## 2026-05-27 限定レビューの仮ID作成と紐づけ

### 開始

- メールアドレスだけでなく、管理用の仮IDを作成し、PW発行・認証ログ・同時利用検知へ紐づける。

### 対応

- 許可メモの各エントリに `reviewerId` を追加。
  - 既存エントリには決定的な `rv-xxxxxxxx` 形式の仮IDを補完。
  - 新規エントリでは管理画面からランダム仮IDを作成可能。
- Readerログイン画面を `メールアドレス / 仮ID` 入力に変更。
  - 読者はメールアドレスまたは仮IDとパスワードでログイン可能。
- PW発行・無効化APIをメールアドレスまたは仮IDで対象指定できるようにした。
- セッショントークンに `reviewerId` を含めるようにした。
- 認証ログと同時利用検知ログに仮IDを保存・表示。
- 管理画面の `限定レビュー認証管理` に仮ID欄、作成ボタン、一覧表示、ログ表示を追加。
- README、初期設定、更新マニュアル、限定レビュー運用資料を更新。
- キャッシュ更新用に `v0.1.72` へ更新し、Service Worker cache nameも更新。

### 検証

- `node --check functions/_shared/review-auth.js`: OK
- `node --check functions/_shared/review-access.js`: OK
- `node --check functions/api/review-auth/session.js`: OK
- `node --check functions/api/admin/review-access/password.js`: OK
- `node --check js/admin.js`: OK
- `node --check js/app.js`: OK
- モックR2検証:
  - `reviewerId` 指定でPW発行できることを確認。
  - 仮IDログインとメールログインの両方で認証できることを確認。
  - セッション判定に `reviewerId` が含まれることを確認。
  - 同時利用検知ログに `reviewerId` が残ることを確認。

### 次にやること

- 実R2の管理画面で仮ID作成、PW発行、仮IDログイン、ログ表示を確認する。

## 2026-05-27 限定レビュー認証ログの分化

### 開始

- 認証ログを後から振り返れる情報に絞る。
- 未知IDへの総当たりリストは見ても意味が薄いため、生のIDを詳細ログに残さない。
- 有効なIDに対するPW失敗、ロック、期限切れなど、流出や妨害の判断材料になるものだけを詳細化する。

### 対応

- `_tsukuyomi/review-auth-summary.json` を追加。
  - 存在しないメールアドレスまたは仮IDへのログイン試行は、未知ID失敗として件数だけ日別集計。
  - 未知IDの生値は保存しない。
- `_tsukuyomi/review-auth-log.json` の詳細イベントを整理。
  - `valid-id-password-mismatch`: 登録済みIDへのPW失敗。
  - `account-locked`: 失敗回数が閾値に達したロック。
  - `password-expired`: 期限切れPWでのログイン試行。
  - `valid-id-login-denied`: 登録済みIDだが未発行、未適用、保留、停止などで拒否。
  - `password-issued`、`password-revoked`、`concurrent-session` は継続。
- 成功ログインとログアウトは詳細イベントに積まず、各エントリの `lastLoginAt` で確認する方針に変更。
- 管理画面に `認証振り返り` を追加。
  - 未知ID失敗の総数、今日の件数、最終発生時刻を表示。
  - 詳細イベントは、意味のある認証イベントだけを表示。
- 仮IDだけの運用でも認証用フィールドが通常保存で消えないよう、既存フィールドの引き継ぎを `reviewerId` でも照合するようにした。
- README、初期設定、更新マニュアル、限定レビュー運用資料を更新。
- キャッシュ更新用に `v0.1.73` へ更新し、Service Worker cache nameも更新。

### 検証

- `node --check functions/_shared/review-auth.js`: OK
- `node --check functions/_shared/review-access.js`: OK
- `node --check functions/api/admin/review-access/index.js`: OK
- `node --check functions/api/admin/review-access/password.js`: OK
- `node --check js/admin.js`: OK
- `node --check js/version.js`: OK
- `node --check sw.js`: OK
- `git diff --check -- .`: OK（CRLF変換警告のみ）
- モックR2検証:
  - 未知IDのPW失敗が `authSummary.unknownIdentifierFailures.total` に加算され、詳細ログへは残らないことを確認。
  - 登録済み仮IDのPW失敗が `valid-id-password-mismatch` として詳細ログに残ることを確認。
  - 失敗閾値到達時に `account-locked` が残ることを確認。
  - 成功ログインは `lastLoginAt` を更新し、詳細ログへログイン成功イベントを追加しないことを確認。

### 次にやること

- 実R2の管理画面で、未知ID集計、有効IDのPW失敗イベント、ロック表示、PW発行/無効化イベントを確認する。

## 2026-05-28 限定レビュー認証クイックガイド

### 開始

- 詳細資料だけだと実運用時に辿りにくいため、操作順に沿った短い資料を追加する。

### 対応

- `docs/05-limited-review-auth-quick-guide.md` を追加。
  - Cloudflare Pages環境変数。
  - 管理画面での仮ID作成、PW発行、読者案内。
  - 自分での確認手順。
  - 認証振り返り、認証イベントの見方。
  - 保留、停止、PW再発行の手順。
  - 読者へ送る案内文テンプレ。
- READMEのマニュアル一覧へリンクを追加。
- `06-limited-review-operation.md` からクイックガイドを参照する一文を追加。

### 検証

- 資料内容が現在の実装と一致していることを確認。

## 2026-05-28 マニュアルファイル名の通し番号化

### 開始

- `docs/` 配下の資料名が増えて、どれから読むべきか分かりにくくなってきた。
- ファイル名自体に通し番号を付け、READMEと管理画面ヘルプからも番号順に辿れるようにする。

### 対応

- `docs/00-manual-index.md` を追加。
- 主要資料を番号付きファイル名へ変更。
  - `01-tachiyomi-initial-setup.md`
  - `02-tachiyomi-update-manual.md`
  - `03-tachiyomi-reader-manual.md`
  - `04-tachiyomi-device-checklist.md`
  - `05-limited-review-auth-quick-guide.md`
  - `06-limited-review-operation.md`
  - `10-reader-analytics-design.md`
  - `20-cloudflare-usage-guard-design.md`
  - `21-cloudflare-f5-defense-design.md`
  - `30-dialogueassembler-mobile-pdf-export-spec.md`
  - `99-work-progress-log.md`
- READMEのマニュアル一覧を番号順に整理。
- 管理画面ヘルプの資料読み込み先を番号付きファイル名へ更新。

### 検証

- 旧ファイル名への参照が残っていないことを確認。

## 2026-05-28 Cloudflare Access設定失敗の調査メモ

### 開始

- Cloudflare Accessの運用ができなかったため、代替認証を進めつつ、失敗理由を後から検証できるようにする。

### 対応

- `docs/07-cloudflare-access-investigation.md` を追加。
  - Pagesの `Enable access policy` が標準ではプレビューDeployment向けで、本番 `<project>.pages.dev` とは別扱いになる点を最有力候補として整理。
  - One-time PINは許可済みメールにだけ送信され、未許可でも画面上は送信済みに見える点を整理。
  - Access applicationのPublic hostname、Allow policy、Include/Require、Bypass/Service Auth、カスタムドメイン検証の確認項目を整理。
  - 再調査時に必要な情報と、最小構成での再挑戦手順を追加。
- README、マニュアル索引、管理画面ヘルプに調査メモへの導線を追加。

### 検証

- Cloudflare公式ドキュメントの現行仕様を確認。
- 調査メモが現在の代替認証方針と矛盾しないことを確認。

## 2026-05-28 管理者認証と復旧設計

### 開始

- 管理者トークンを忘れた場合や漏洩した場合に備え、マスターパスワードなしの復旧方針を整理する。

### 対応

- `docs/08-admin-auth-recovery-design.md` を追加。
  - 現状の `TSUKUYOMI_ADMIN_TOKEN` 方式の限界を整理。
  - 管理者メールOTPを本命認証にする案を整理。
  - 管理トークンはBreak-glass用に残し、漏洩時はCloudflare Dashboardで環境変数を変更する方針を明記。
  - `TSUKUYOMI_ADMIN_AUTH_SECRET` と `TSUKUYOMI_REVIEW_AUTH_SECRET` を分ける必要を明記。
  - OTP API、保存先、レート制限、Cookie、ログ方針を実装候補として整理。
- README、マニュアル索引、管理画面ヘルプに導線を追加。

### 検証

- 現在の管理API実装がサーバー側リセット機能を持たないことを確認。
- Cloudflare Email Service / Email Routing の現行ドキュメントを確認。

### 追記

- 無料枠だけで運用する前提で、管理者OTPメール送信Providerの候補を整理。
  - Free planの `100 emails/day`、`3,000 emails/month` は管理者OTP用途には十分。
  - Brevoは `300 emails/day` と大きいが、今回の用途では実装の単純さを優先。
  - Cloudflare Email ServiceのOutbound送信はWorkers Paid前提のため、完全無料運用では第一候補から外す。
- メールProviderを環境変数で切り替える案を記録。
- Brevoは代替候補として残す。
- 送信処理は `sendAdminOtpEmail()` に閉じ込め、将来Brevoへ差し替えやすい形にする。

## 2026-05-28 管理者メールOTP実装

### 開始

- 無料メールProviderを使い、管理画面ログインを管理者メールOTP方式へ対応させる。
- 既存の管理トークン方式は `token` モードとして互換維持する。
- SMS、マスターパスワード、アプリ内の管理トークン再発行APIは実装しない。

### 対応

- `_shared/admin-auth.js` を追加。
  - `TSUKUYOMI_ADMIN_AUTH_MODE=token` / `email_otp` を切替。
  - 許可管理者メール3件を扱う。
  - OTPは6桁、10分有効、1回限り、最大5回試行。
  - OTP平文は保存せず、R2にはハッシュとsaltを保存。
  - 管理セッションは `tsukuyomi_admin_session` HttpOnly Cookieで発行。
  - `TSUKUYOMI_ADMIN_AUTH_SECRET` 変更で既存管理セッションを失効。
  - メール送信を `sendAdminOtpEmail()` に分離。
- `/api/admin-auth/status`、`request`、`verify`、`logout` を追加。
- 既存管理APIの `requireAdmin()` を非同期化し、全管理APIで `await requireAdmin(...)` へ変更。
- `rate-limit.js` に `admin_auth_request` と `admin_auth_verify` を追加。
  - OTP要求: 5回/10分、30分ブロック。
  - OTP検証: 10回/10分、30分ブロック。
- `admin.html` / `js/admin.js` を更新。
  - `email_otp` モードではメール入力、コード送信、コード入力、ログアウトを表示。
  - `token` モードでは従来の管理トークン入力を表示。
  - OTPログイン後はCookie認証で管理APIを呼ぶ。
- バージョンとService Worker cache nameを `0.1.74` に更新。
- README、初期設定、更新マニュアル、実機確認、限定レビュークイックガイド、管理者認証資料を更新。
  - メールProviderの採用方針を資料に記録。
  - Brevoは代替候補として資料に残す。

### 検証

- `node --check functions/_shared/admin-auth.js`: OK
- `node --check functions/_shared/books.js`: OK
- `node --check functions/_shared/rate-limit.js`: OK
- `node --check functions/api/admin-auth/status.js`: OK
- `node --check functions/api/admin-auth/request.js`: OK
- `node --check functions/api/admin-auth/verify.js`: OK
- `node --check functions/api/admin-auth/logout.js`: OK
- `node --check functions/api/admin/books/index.js`: OK
- `node --check functions/api/admin/books/[id].js`: OK
- `node --check functions/api/admin/storage/index.js`: OK
- `node --check functions/api/admin/analytics/index.js`: OK
- `node --check functions/api/admin/review-access/index.js`: OK
- `node --check functions/api/admin/review-access/password.js`: OK
- `node --check js/admin.js`: OK
- `node --check js/version.js`: OK
- `node --check sw.js`: OK
- モックR2 + モックメール送信検証:
  - 許可メールでOTP要求するとメール送信APIが1回呼ばれることを確認。
  - 許可外メールでは同じ成功レスポンスだがメール送信APIが呼ばれないことを確認。
  - 同じ管理者メールで新しいOTPを発行すると、古い未使用OTPが無効になることを確認。
  - 正しいOTPで管理セッションCookieを検証できることを確認。
  - 間違ったOTP、期限切れOTP、使用済みOTPが拒否されることを確認。
  - `TSUKUYOMI_ADMIN_AUTH_SECRET` を変えると既存セッションが無効になることを確認。
  - `token` モードでは既存Bearer認証が通ることを確認。
  - `email_otp` モードではBearerだけでは管理APIを通さないことを確認。
- `git diff --check -- .`: OK

## 2026-05-29 管理者OTP送信ProviderをMailjet専用化

### 対応

- 独自ドメイン必須の運用に合わないため、メールOTP送信から旧Provider互換分岐を削除。
- `sendAdminOtpEmail()` の既定Providerを `mailjet` に変更。
- `mailjet` では `MAILJET_API_KEY` をBasic Auth username、`MAILJET_SECRET_KEY` をpasswordとして `https://api.mailjet.com/v3.1/send` を呼ぶ。
- 成功時の管理者認証ログ `reason` は `mailjet` として記録。
- 送信失敗時はR2の `otp-send-failed` に加え、CloudflareログへProvider、HTTP status、短縮エラーを出す。
- 初期設定、更新マニュアル、実機確認、限定レビュークイックガイド、管理者認証設計、ログガイドをMailjet推奨に更新。
- 管理画面の限定レビュー認証フォームに `PW発行` ボタンを追加。
  - 入力した名前、仮ID、メールから一覧登録と閲覧許可、Reader用パスワード発行を一気に実行。
  - 既存のメールまたは仮IDがある場合は重複追加せず、その行を閲覧許可にして再発行確認後に発行。
- 直接発行したReader用パスワードの標準有効期限を7日に短縮。

### 検証

- `node --check tsukuyomi-reader/functions/_shared/admin-auth.js`: OK
- `node --check tsukuyomi-reader/js/admin.js`: OK
- `node --check tsukuyomi-reader/functions/api/admin-auth/request.js`: OK
- `node --check tsukuyomi-reader/functions/api/admin-auth/status.js`: OK
- `node --check tsukuyomi-reader/functions/api/admin-auth/verify.js`: OK
- モックR2 + モックfetch検証:
  - Mailjet Send API v3.1宛に1回送信要求することを確認。
  - MailjetのBasic Authが `MAILJET_API_KEY:MAILJET_SECRET_KEY` から作られることを確認。
  - Mailjet送信成功時の認証ログ `reason` が `mailjet` になることを確認。
  - Mailjet送信失敗時はチャレンジを削除し、`otp-send-failed` を記録し、Cloudflareログ向けの `console.warn` が出ることを確認。
  - Reader用パスワード発行で対象者が `閲覧許可` になり、パスワード済み状態になることを確認。
  - Reader用パスワードの `passwordExpiresAt` が発行から7日後になることを確認。

## 2026-05-29 当面の認証運用を管理トークン + 直接発行PWに整理

### 対応

- 当面の推奨構成を `Admin=token`、`読者=Reader内直接発行PW` に整理。
- 管理者メールOTPはメール送信設定を使う場合の将来オプションとして扱う。
- 初期設定、更新マニュアル、限定レビュー認証クイックガイド、実機確認、復旧設計、ログガイド、READMEの表記を更新。
- 管理画面ヘルプの認証説明を、管理トークン方式を当面の推奨として読める文面に変更。

### 運用

```text
TSUKUYOMI_ADMIN_AUTH_MODE=token
TSUKUYOMI_ADMIN_TOKEN=管理者用の長いランダム文字列
TSUKUYOMI_REVIEW_PASSWORD_AUTH=true
TSUKUYOMI_REVIEW_AUTH_SECRET=読者PW用の長いランダム文字列
TSUKUYOMI_REVIEW_PASSWORD_DAYS=7
```

### 検証

- `node --check tsukuyomi-reader/js/admin.js`: OK
- `git diff --check -- .`: OK

## 2026-06-04 Reader栞・表示モード・ヘルプ表記の整理

### 対応

- 読者向けマニュアルを、栞、ページ切替/横スクロール/縦スクロール、ページめくり効果、TXT構造自動判別に合わせて更新。
- Reader内ヘルプを、栞から再開、ヘルプからReader位置へ戻る挙動、PDF対応、立ち読みモードのキャッシュ/栞制限に合わせて更新。
- 実機確認チェックリストとREADMEの配布前チェックを、旧「進捗」表現から「栞」表現へ更新。
- 栞から読む/最初から読むの確認をブラウザ標準ダイアログからReader内モーダルへ変更。
- 限定レビュー表示バッジを琥珀系に変更し、一般モードとの差を強めた。
- 強制同期の前に確認を挟み、キャッシュ破棄操作であることを明示。
- ページめくり効果に `スライド` と `紙影` を追加。本文再配置ではなく短いCSS演出で実装。

### 検証

- `node --check js/app.js`: OK
- `node --check js/storage.js`: OK
- `node --check js/reader.js`: OK
- `node --check js/normalize-txt.js`: OK

## 2026-06-04 一般公開の延長と残日数表示

### 対応

- 限定レビュー一覧で一般公開中の作品を `一般公開中（あとN日）` と表示するように変更。
- 一般公開済みの作品ボタンを `延長（+7日）` と表示するように変更。
- 延長時は現在の公開期限を起点に+7日する。期限切れの場合は今日から7日間に戻す。
- 更新マニュアルと限定レビュー運用資料に、延長と残日数表示の仕様を追記。

### 検証

- `node --check js/admin.js`: OK
- `node --check functions/api/admin/books/[id]/promote.js`: OK

## 2026-06-05 文字特化方針とMarkdown対応候補

### 方針

- MP3など音声ファイルをTsukuyomiReaderへ混ぜる案は廃案。
- 当面はReaderを文字表示に特化し、対応原稿形式は現行のまま維持する。
- 将来音声を扱う場合は、TsukuyomiPlayerのような別サービスとして検討する。

### 作業候補

- `.md` 読込対応を次期候補として残す。
  - TXTの上位互換として正規化し、本文・見出し・空行・引用・区切り線を扱う想定。
  - 初期対応範囲は `#` / `##` / `###` 見出し、通常段落、空行、引用、区切り線程度に絞る。
  - 表、脚注、HTML混在、複雑なリンクカードは初期対応外でよい。

## 2026-09-03 リポジトリ3コピーの整理（開始）

### 背景

- 作業用クローンが3か所に分裂していた。
  - `C:\Users\karak\VSCode\TsukuyomiReader\tsukuyomi-reader` … v0.1.168 で放置（23コミット遅れ）
  - `C:\Users\karak\Documents\TsukuyomiReader\tsukuyomi-reader` … 実際の作業・デプロイ元。HEAD=v0.1.220、未コミットWIP（v0.1.221 "reader-gesture-flow-cleanup"）あり
  - `H:\マイドライブ\900.Tsukuyomi\D.TsukuyomiReader\tsukuyomi-reader` … v0.1.168、git管理外。旧「Driveから反映してデプロイ」方式。Drive同期が切れて更新停止したとみられる
- `docs/90-handoff-20260701.md` の「編集マスター=H:ドライブ / Gitミラー=C:」という前提は既に実態と食い違っている。

### 対応

- 正規（カノニカル）を `C:\Users\karak\VSCode\TsukuyomiReader\tsukuyomi-reader` に統一。
- Documents クローンの未コミットWIP 4ファイル（`js/reader.js` `css/reader.css` `js/version.js` `sw.js`）を
  正規リポジトリへコピー移設。`git hash-object` で全ファイル一致を確認。
- Documents フォルダごと `過去・凍結\×Documents_TsukuyomiReader_旧クローン_20260903\` へ隔離（× = 破棄相当）。
- H: ドライブ側は今回は未処置。「クラウドベース運用へ移行するか」の検討とあわせて後日整理する。

### 検証

- 移設後の正規リポジトリで `node --check js/reader.js` / `js/app.js`: OK
- `node --test tests/*.test.mjs`: 11 pass / 0 fail

### 次

- モバイル端末での表示領域の使い方（画面が「全然足りない」問題）を調査。

## 2026-09-03 PCスクロール不能 ＋ モバイル縦書き横幅（v0.1.222）

計画: `docs/plan-20260903-reader-scroll-and-mobile-width.md`

### 問題1: PC（既定 scroll + vertical）でスクロール不能

- 原因: `applyDisplayMode()` はスクロール表示で常に `body.mode-scrolly`（`overflow-x:hidden / overflow-y:auto`）を付けていた。
  これは横書き用。縦書きは本文が横方向に伸びるため（実測: viewport 1126px / 本文 7340px、横あふれ6214px）
  `overflow-x:hidden` に切り取られ、横スクロールバーも出ず、縦あふれも無いのでホイールも効かない。
  `bindWheelScroll()` もスクロールモードで即 return していた。
- 修正:
  - `css/reader.css`: `body.mode-scrolly .reader-viewport` を `writing-vertical` / `writing-horizontal` で出し分け。
    縦書き → `overflow-x:auto / overflow-y:hidden / touch-action:pan-x`。
  - `js/reader.js` `bindWheelScroll()`: スクロール＋縦書きのとき `deltaY` を `scrollLeft`（rtl考慮）へ変換。
- 検証（ローカルサーバ + 長文TXT、幅1280）: `overflow-x:auto` になり横スクロールバー可、ホイールで
  scrollLeft が減少方向（＝読み進め方向）に移動することを確認。

### 問題2: モバイル縦書き（ページ切替）の本文横幅

- 実測 画面375px: 本文実効 224px（60%）。積み重ね: `.reader-viewport` 左右38px（`mobile-paged-immersive` の
  `clamp(30px,8vw,38px)`）/ `getContentWidthPercent()` 88%の二重余白 / ページ中央寄せ / `.mobile-text-page` の
  タイトルガター2.2em / 装飾 `::before/::after`。
- 修正:
  - `css/reader.css` `@media (max-width:900px)`: `body.mode-paged .reader-viewport` padding-inline を縮小、
    装飾 `::before/::after` を（紙影・フラッシュ以外で）透明化。
  - `body.mobile-paged-immersive.mode-paged .reader-viewport`: padding-inline `clamp(3px,1.2vw,10px)`、`border-inline-width:0`。
  - `body.mobile-paged-immersive .reader-main`: `width: min(100vw, 720px)` ＋ `margin-inline:0`。
  - `js/reader.js` `getContentWidthPercent()`: モバイル非見開き時は `100 - 余白%*0.5`（下限84%）。
  - `.mobile-text-page.vertical.has-title` のガター 2.2em → 1.9em。
- 検証（ローカル、画面375px）: 本文なしページ（8/24）で本文実効 346px ＝ **92%**（旧60%）。
  タイトルページは約84%（ガター分）。文字あふれ・`pager-fit-warning` 無し。
  ※エミュレータのスクロールバー分16pxを差し引くと実機はさらに広い見込み。
- 残課題: 行送りの量子化で「内容幅 − 1行未満」の端数が残る。タイトルページのガターは
  絶対配置タイトルの構造上のもの（インライン化は別タスク）。

### 検証（共通）

- `node --check js/reader.js` / `js/app.js`: OK
- `node --test tests/*.test.mjs`: 11 pass / 0 fail
- WIP `reader-gesture-flow-cleanup` はそのまま同居。バージョンは 0.1.221 → 0.1.222（ref: reader-scroll-mobile-width）。

### 次

- 実機（Android Chrome / iOS Safari）で両方を確認。
- コミット/デプロイはユーザー確認後（`git push origin main` で Cloudflare Pages 自動デプロイ）。
- H: ドライブ後始末＋クラウドベース運用の検討。
