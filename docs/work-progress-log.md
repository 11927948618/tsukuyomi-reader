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

- `docs/reader-analytics-design.md` を追加。
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
- `docs/tachiyomi-reader-manual.md` の推奨ブラウザ欄に対象世代を追記。
- `docs/tachiyomi-device-checklist.md` の端末別確認に対象世代と対象外基準を追記。
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
- `docs/tachiyomi-reader-manual.md`
  - 推奨ブラウザをiOS 15 / iPadOS 15以降に変更。
- `docs/tachiyomi-device-checklist.md`
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
- `docs/tachiyomi-reader-manual.md`
  - iOS 12.5以降はレガシー試用枠で、正常動作不明と明記。
- `docs/tachiyomi-device-checklist.md`
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
- `docs/tachiyomi-update-manual.md` と `docs/reader-analytics-design.md` にR2使用状況とR2軽量集計の注意を追記。
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
  - `docs/tachiyomi-update-manual.md`
  - `docs/tachiyomi-reader-manual.md`
  - `docs/tachiyomi-device-checklist.md`
  - `docs/work-progress-log.md`
- キャッシュ更新用に `v0.1.60` へ更新。

### 検証

- `node --check js/admin.js`: OK
- `node --check js/version.js`: OK
- Playwright Chromium / local `admin.html`:
  - `管理ヘルプ` ボタンでポップアップが開くことを確認。
  - `すぐ使う` に作品IDなどの短いヘルプが出ることを確認。
  - `更新マニュアル` から `docs/tachiyomi-update-manual.md` を読み込めることを確認。
  - `閉じる` でポップアップを閉じられることを確認。

### 追記

- commit: `0248f25 add admin help modal`
- `main` へpush済み。
- Cloudflare Pages公開側で `js/version.js` が `APP_VERSION = "0.1.60"` を返すことを確認。
- 公開側 `admin.html` に `管理ヘルプ` とマニュアル表示導線が含まれることを確認。
- 公開側 `docs/tachiyomi-update-manual.md` がHTTP 200で読めることを確認。

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

- `docs/limited-review-operation.md` を追加。
  - 公開版Reader、限定レビュー版Reader、ローカル確認版の役割を整理。
  - 賞応募候補作品を公開版に置かない方針を明記。
  - Cloudflare Access等でサイト/API全体を認証必須にする運用を推奨として記載。
  - `reviewOnly` / `awardCandidate` フラグ案は、保護そのものではない注意を追記。
- `README.md` のマニュアル一覧と立ち読みモードメモに限定レビュー運用を追加。
- `docs/tachiyomi-update-manual.md` に限定レビュー版と賞応募候補の運用方針を追加。
- 管理画面ヘルプに `限定レビュー` の資料表示項目を追加。
- 管理画面の短いヘルプに、賞応募候補は公開版に置かない注意を追加。
- キャッシュ更新用に `v0.1.62` へ更新。

### 検証

- `node --check js/admin.js`: OK
- `node --check js/version.js`: OK
- `rg "limited-review-operation|限定レビュー|awardCandidate|reviewOnly"`: 追加箇所を確認。
- Playwright Chromium / local `admin.html`:
  - `管理ヘルプ` の短いヘルプに限定レビューの注意が出ることを確認。
  - `限定レビュー` ボタンから `docs/limited-review-operation.md` を読み込めることを確認。
  - 読み込んだ資料内に `Cloudflare Access` と `公開版Readerには置かない` が含まれることを確認。

### 追記

- commit: `0a12c0e add limited review operations guide`
- `main` へpush済み。
- Cloudflare Pages公開側で `js/version.js` が `APP_VERSION = "0.1.62"` を返すことを確認。
- 公開側 `docs/limited-review-operation.md` がHTTP 200で読めることを確認。
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
- 公開側 `docs/reader-analytics-design.md` に `TSUKUYOMI_ACCESS_IDENTITY_ANALYTICS` と `Access別読書ログ` の説明が反映されていることを確認。

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
- 公開側 `docs/reader-analytics-design.md` と `docs/limited-review-operation.md` に、管理側の一元保管・将来分析用途の説明が反映されていることを確認。

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
