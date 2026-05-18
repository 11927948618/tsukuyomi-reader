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

## 2026-05-15 Pages URL未作成の確認

### 発生状況

- `https://tsukuyomi-reader-tachiyomi.pages.dev/` にアクセスすると、Edgeで `DNS_PROBE_FINISHED_NXDOMAIN` が表示された。

### 判断

- アプリ本体の起動エラーではなく、Cloudflare Pagesプロジェクト `tsukuyomi-reader-tachiyomi` がまだ作成されていない状態。
- `*.pages.dev` のホスト名は、Pagesプロジェクト作成・初回デプロイ後に有効になる。

### 対応

- `docs/tachiyomi-update-manual.md` に「Pagesプロジェクトを作成する」手順を追加。
- `docs/tachiyomi-device-checklist.md` に、NXDOMAIN時はPagesプロジェクト未作成として扱う注意を追加。

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

- `docs/cloudflare-usage-guard-design.md` を追加。
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
- `README.md` と `docs/tachiyomi-update-manual.md` に関連資料と運用メモを追記。
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
- `docs/cloudflare-f5-defense-design.md` を追加。
- `docs/cloudflare-usage-guard-design.md` と `docs/tachiyomi-update-manual.md` に運用メモを追記。
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
