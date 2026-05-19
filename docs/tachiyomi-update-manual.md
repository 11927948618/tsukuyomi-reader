# TsukuyomiReader 立ち読みモード 更新側マニュアル

このマニュアルは、立ち読み用サイトに作品を追加・差し替え・公開停止する更新担当者向けです。

## 立ち読み専用URL

立ち読み用の公開URLは、Cloudflare Pagesでプロジェクトを作成したあとに有効になります。

予定URL:

```text
https://tsukuyomi-reader-tachiyomi.pages.dev/
```

このURLで `DNS_PROBE_FINISHED_NXDOMAIN` が出る場合、`tsukuyomi-reader-tachiyomi` というPagesプロジェクトがまだ作成されていません。Cloudflare Pagesでまだ作成していない場合は、このURLになるように `tsukuyomi-reader-tachiyomi` プロジェクトを作成します。

管理メニューのURLは以下です。

```text
https://tsukuyomi-reader-tachiyomi.pages.dev/admin.html
```

管理メニューは検索エンジンに出さない想定ですが、URLを知っているだけで操作できる設計にはしません。Cloudflare Pagesの環境変数 `TSUKUYOMI_ADMIN_TOKEN` と、管理画面で入力する管理トークンが一致した場合だけ操作できます。

## Pagesプロジェクトを作成する

`DNS_PROBE_FINISHED_NXDOMAIN` が出ている場合は、この手順から始めます。

1. Cloudflare Dashboardを開きます。
2. `Workers & Pages` を開きます。
3. `Create application` を押します。
4. `Pages` を選びます。
5. GitHubリポジトリを接続します。
6. Project name を以下にします。

```text
tsukuyomi-reader-tachiyomi
```

7. ブランチを選びます。

初期確認だけなら、現在コードが入っているブランチを選びます。ブランチ分離する場合は、あとで `tachiyomi` ブランチを作って、このPagesプロジェクトの監視ブランチを `tachiyomi` にします。

8. ビルド設定を入れます。

現在のGitHubリポジトリは、リポジトリ直下がそのままアプリ本体です。そのため、Cloudflare Pagesの `Root directory` は空欄にします。

```text
Framework preset: None
Build command: 空欄
Build output directory: .
Root directory: 空欄
```

この状態なら、`index.html` と `functions/` がどちらもPagesのプロジェクトルートから見えます。`Root directory` に `tsukuyomi-reader` を入れると、Cloudflareが存在しないサブフォルダを探して `Output directory "tsukuyomi-reader" not found.` で失敗します。

9. `Save and Deploy` を押します。

デプロイ完了後、Cloudflareが表示する `*.pages.dev` のURLを確認します。Project nameを `tsukuyomi-reader-tachiyomi` にできていれば、以下が開けるようになります。

```text
https://tsukuyomi-reader-tachiyomi.pages.dev/
```

別のURLになった場合は、このマニュアルとチェックリストのURLを実際のURLに置き換えてください。

## 立ち読みモードの概要

立ち読みモードでは、読者はサイト上の作品一覧から作品を選んで読みます。

ローカルファイル読込とバックアップZIP保存は非表示になり、本文では通常のコピー、右クリック、ドラッグ保存を抑制します。これは一般的なコピー操作を避けるための設定であり、スクリーンショット、開発者ツール、通信取得まで完全に防ぐものではありません。

## 限定レビュー版と賞応募候補

賞応募候補作品や未発表稿を友人・編集者候補に読んでもらう場合は、通常の立ち読み版とは分けて運用します。

基本方針:

- 公開版Readerには、賞応募に使わない作品だけ置きます。
- 賞応募候補作品は、公開版Readerで `published: true` にしません。
- 限定レビュー版Readerを別Pagesプロジェクトまたは別サブドメインで用意します。
- 限定レビュー版ReaderはCloudflare Access等でサイト/API全体を認証必須にします。
- `reviewOnly` や `awardCandidate` のようなフラグだけでは保護になりません。未認証URLで読めないことを優先します。

現時点では、作品別IDや鍵付きURLを自前実装するより、Cloudflare Access等で限定レビュー版全体を守る運用を推奨します。

個別アクセス許可はCloudflare Access側で行います。TsukuyomiReaderの管理画面にある `限定レビュー許可メモ` は、Accessへ許可を実行する機能ではなく、許可・停止した相手を記録する欄です。

限定レビュー版で「誰がどの作品をどこまで読んだか」を見る場合は、Access認証済みメールアドレスを読書ログへ紐づける設定を有効にします。

```text
TSUKUYOMI_ACCESS_IDENTITY_ANALYTICS=true
```

D1を使う場合は、追加マイグレーションも実行します。

```text
migrations/0002_access_identity_analytics.sql
```

この設定はメールアドレスを含む個人情報ログになります。限定レビューの案内文やCloudflare Accessの案内文に、文芸分析目的で閲覧データを分析に使うことがある旨を明記してください。

Cloudflare Accessの許可リスト全員が自動で管理画面に出るわけではありません。読書ログに出るのは、実際にAccess認証を通ってReaderへアクセスした人です。

詳細:

```text
docs/limited-review-operation.md
```

## 重要なファイル

- `config/site-config.json`
  - サイト全体の動作モードを切り替える設定です。
- `books/manifest.json`
  - 管理API未設定時のフォールバック用作品一覧です。
- `books/works/`
  - 管理API未設定時のフォールバック用EPUB置き場です。
- `books/covers/`
  - 管理API未設定時のフォールバック用表紙画像置き場です。
- `admin.html`
  - 作品をアップロードし、公開/非公開を切り替える管理画面です。
- `functions/api/`
  - Cloudflare Pages Functions の管理APIです。
- Cloudflare R2
  - 管理画面からアップロードした本文ファイル、表紙画像、作品メタ情報を保存します。
- `update_books.bat`
  - APIを使わない場合に、`books/` 配下だけをcommit/pushするための予備バッチです。

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
  "booksManifest": "/api/books",
  "analyticsEnabled": true,
  "analyticsEndpoint": "/api/analytics/event",
  "analyticsRespectDoNotTrack": true,
  "analyticsNotice": "匿名の読書ログ（作品を開いた日時、進捗、読了）を分析目的で記録します。IPアドレスや氏名は保存しません。"
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
  "booksManifest": "./books/manifest.json",
  "analyticsEnabled": false,
  "analyticsEndpoint": "/api/analytics/event",
  "analyticsRespectDoNotTrack": true,
  "analyticsNotice": ""
}
```

## Cloudflare側の初期設定

Web管理メニューを使う場合は、Cloudflare Pages Functions と R2 を使います。

R2は無料枠つきの従量課金です。Standard storageの場合、毎月10GB保存、Class A操作100万回、Class B操作1000万回までは無料です。無料枠を超えた分は後払いで課金されます。立ち読み用の小規模運用なら通常は無料枠内に収まる想定ですが、絶対に課金を発生させたくない場合はR2を使わず、`books/` 配下をGitHubへpushする静的ファイル運用にします。

やることは大きく5つです。

1. R2バケットを作る
2. 立ち読み用PagesプロジェクトにR2を紐づける
3. 管理トークンを環境変数に入れる
4. 再デプロイする
5. `/admin.html` から作品を登録する

1. Cloudflare R2でバケットを作成します。

R2の初回画面で `Add R2 subscription to my account` が出た場合は、料金表示を確認した上で押します。表示上の `Total Due Now` が `$0.00` なら、その時点での請求はありません。

例:

```text
tsukuyomi-reader-books
```

2. Cloudflare Pagesの立ち読み用プロジェクトを開きます。

```text
tsukuyomi-reader-tachiyomi
```

3. `Settings > Bindings` でR2 bucket bindingを追加します。

設定値:

```text
Variable name: TSUKUYOMI_BOOKS_BUCKET
R2 bucket: tsukuyomi-reader-books
```

4. `Settings > Environment variables` に管理トークンを追加します。

```text
TSUKUYOMI_ADMIN_TOKEN=十分に長いランダム文字列
```

5. 再デプロイします。

`wrangler.example.toml` は設定例です。実際のプロジェクトでWranglerを使う場合は、必要に応じて `wrangler.toml` にコピーして使います。

## 使用量ガード

R2のClass B操作が増えすぎた場合に備えて、使用量ガードを用意しています。設計の詳細は以下を参照します。

```text
docs/cloudflare-usage-guard-design.md
```

ガード状態はR2内の以下に保存されます。

```text
_tsukuyomi/usage-guard.json
```

主な状態:

- `level: watch`
  - 使用量注意。公開は継続します。
- `level: restrict-publishing`
  - 新規公開と非公開作品の再公開を止めます。既存公開作品は読めます。
- `level: paused`
  - 公開を一時停止します。読者画面の作品一覧は空になり、本文配信は停止します。

緊急時はCloudflare Pagesの環境変数で手動停止できます。

```text
TSUKUYOMI_PUBLICATION_PAUSED=true
```

この値がtrueの場合、`usage-guard.json` より優先して公開停止します。解除する場合は `false` にするか、環境変数を削除して再デプロイします。

自動監視Workerの雛形は以下です。

```text
workers/usage-guard/
```

このWorkerはR2 MetricsをGraphQL Analytics APIで取得し、月間見込みに応じて `usage-guard.json` を更新します。

## 簡易F5対策

独自ドメインがない `*.pages.dev` 運用でも使える保険として、公開APIに簡易IPレート制限を入れています。

既定値:

```text
/api/books: 10秒に60回まで
/api/books/:id/content: 10秒に12回まで
/api/books/:id/cover: 10秒に60回まで
超過時: 30秒間 429
```

この制限はR2を読む前に働きます。Pages Functionsの実行自体は発生しますが、F5連打で本文ファイルや表紙ファイルのR2読み取りが増え続けることを抑えます。

## R2使用状況の確認

管理メニューの `R2使用状況` で、R2バケット内の保存容量を概算確認できます。

表示されるもの:

- 使用量
- 無料枠目安
- 残り目安
- オブジェクト数
- `works` / `covers` / `_tsukuyomi` などのプレフィックス別内訳

注意:

- これはR2バケット内のオブジェクトを走査して合計した概算です。
- R2の請求上の保存容量はGB-month単位で計算されます。
- Class A/B操作数の月間実績や請求上の残量は、Cloudflare DashboardのR2 Metrics / Billingで確認します。
- Reader以外のアプリと同じCloudflareアカウントでR2を使う場合、無料枠はアカウント全体で共有されます。

通常読者に429が出る場合は、Cloudflare Pagesの環境変数で値を上げます。

```text
TSUKUYOMI_RATE_LIMIT_CONTENT=20
TSUKUYOMI_RATE_LIMIT_BLOCK_SECONDS=10
```

一時的に無効化する場合:

```text
TSUKUYOMI_RATE_LIMIT_DISABLED=true
```

詳細:

```text
docs/cloudflare-f5-defense-design.md
```

## 匿名読書ログ

読者の実名、メールアドレス、端末番号、IPアドレスは保存せず、同じブラウザ環境を匿名IDとして読書傾向を記録できます。

記録するイベント:

```text
open: 作品を開いた
progress: 25% / 50% / 75% に到達した
finish: 95%以上に到達した
```

詳細:

```text
docs/reader-analytics-design.md
```

D1を使う場合は、CloudflareでD1 databaseを作成し、PagesプロジェクトにD1 bindingを追加します。

```text
Variable name: TSUKUYOMI_ANALYTICS_DB
```

作業手順:

1. Cloudflare Dashboardで `D1 SQL Database` を開きます。
2. databaseを作成します。

```text
例: tsukuyomi-reader-analytics
```

3. 作成したD1 databaseのConsoleまたはQuery画面で、以下のSQLを実行します。

テーブル定義:

```text
migrations/0001_reader_analytics.sql
```

4. Pagesプロジェクト `tsukuyomi-reader-tachiyomi` の `Settings > Bindings` でD1 bindingを追加します。

```text
Variable name: TSUKUYOMI_ANALYTICS_DB
D1 database: 作成したD1 database
```

ハッシュ化用の環境変数も設定します。

```text
TSUKUYOMI_ANALYTICS_SALT=十分に長いランダム文字列
```

D1 bindingまたはテーブルが未設定の場合は、R2内の `_tsukuyomi/analytics-lite.json` に軽量集計を保存します。

R2軽量集計で見られるもの:

- 作品別の匿名読者数
- 開始数
- 読了数
- 平均到達率
- 最近のイベント

R2軽量集計の注意:

- R2上のJSONを読み書きする簡易方式なので、高頻度アクセスや厳密な集計には向きません。
- 同時アクセスではまれに集計値が前後する可能性があります。
- 本格分析を行う場合はD1 bindingを設定します。

## 具体的な初回作業

初回だけ、開発環境側で以下を行います。

1. `config/site-config.json` が `/api/books` を見ていることを確認します。

```json
"booksManifest": "/api/books"
```

2. 変更をGitHubへpushします。

Cloudflare PagesがGitHub連携されていれば、このpushで自動デプロイされます。

3. Cloudflare PagesのデプロイログでFunctionsが認識されていることを確認します。

`functions/api/books` と `functions/api/admin/books` が配置されていれば、読者向けAPIと管理APIが使えます。

4. 管理メニューを開きます。

```text
https://tsukuyomi-reader-tachiyomi.pages.dev/admin.html
```

5. `TSUKUYOMI_ADMIN_TOKEN` と同じ管理トークンを入力し、「保存」を押します。

6. タイトル、作者、紹介文、本文ファイル、表紙画像を入力して保存します。

7. 読者画面を開き、作品一覧に表示されることを確認します。

```text
https://tsukuyomi-reader-tachiyomi.pages.dev/
```

## 管理メニューで作品を更新する

Surface Goなど、開発環境とは完全に別の端末では、この方法を基本運用にします。

1. 管理メニューを開きます。

```text
https://tsukuyomi-reader-tachiyomi.pages.dev/admin.html
```

2. 管理トークンを入力して「保存」を押します。

管理トークンはブラウザのlocalStorageに保存されます。共有PCや不特定多数が触れる端末では保存しないでください。

3. 作品を追加または差し替えます。

入力項目:

- 作品ID
- タイトル
- 作者
- 紹介文
- 更新日
- 本文ファイル
- 表紙画像
- 公開する / 非公開

作品IDは、URLやR2保存名に使う管理用IDです。使える文字は英数字、ハイフン `-`、アンダースコア `_` です。数字だけでなく英文字も使えます。

例:

```text
ginga
namida-01
lane_field_1
```

日本語は使わないでください。空欄にすると自動IDを作ります。日本語タイトルだけの場合は `book-日時` のようなIDになることがあります。あとで同じ作品を差し替える場合は、同じ作品IDを使います。

本文ファイルは `EPUB` または `TXT` を選択できます。初回登録では本文ファイルが必須です。既存作品の説明文や公開状態だけを変える場合、本文ファイルと表紙画像は選ばなくてかまいません。

4. 「保存」を押します。

保存後、読者向けの作品一覧API `/api/books` に反映されます。

5. 公開停止する場合は、作品一覧の「公開停止」を押します。

非公開にした作品は読者画面の作品一覧から消え、本文と表紙の公開APIからも取得できなくなります。

## ファイル直置きで作品を追加する

この方法は、Cloudflare R2管理APIを使わない場合の予備手順です。通常は管理メニューから更新します。

1. EPUBまたはTXTを `books/works/` に置きます。

例:

```text
books/works/namida.epub
books/works/namida.txt
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

TXTを登録する場合は、`format` と `path` を以下のようにします。

```json
{
  "id": "namida-txt",
  "title": "なみだの行方 TXT版",
  "author": "hal the juggernaut",
  "description": "TXTから読む立ち読み版。",
  "format": "txt",
  "path": "./books/works/namida.txt",
  "cover": "./books/covers/namida.jpg",
  "published": true,
  "updatedAt": "2026-05-15"
}
```

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

管理メニューを使う場合、Surface Go側でGit操作は不要です。

APIを使わない予備運用では、Surface Goで以下だけを更新します。

- `books/manifest.json`
- `books/works/*.epub`
- `books/works/*.txt`
- `books/covers/*`

予備運用でファイル直置き更新をした場合のみ、`update_books.bat` を実行します。

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

- `config/site-config.json` の `booksManifest` が `/api/books` になっているか確認します。
- Cloudflare Pages Functions がデプロイされているか確認します。
- R2 bucket binding `TSUKUYOMI_BOOKS_BUCKET` が設定されているか確認します。
- API未設定のローカル確認では、フォールバック用の `books/manifest.json` がJSONとして壊れていないか確認します。
- 作品の `published` が `true` になっているか確認します。

「読む」で失敗する場合:

- 管理画面の作品一覧で対象作品が公開中になっているか確認します。
- R2に本文ファイルが保存されているか確認します。
- ローカル確認時は、ファイルを直接開かずHTTPサーバー経由で開きます。

表紙が出ない場合:

- 管理画面で表紙画像を選んで保存済みか確認します。
- 画像形式はまず `jpg` / `png` を使います。

管理メニューで認証に失敗する場合:

- Cloudflareの環境変数 `TSUKUYOMI_ADMIN_TOKEN` と入力値が一致しているか確認します。
- 環境変数を追加したあとに再デプロイしたか確認します。
- 管理トークンの前後に空白が入っていないか確認します。

更新したのに古い内容が出る場合:

- Library画面の「強制同期（キャッシュ破棄）」を実行します。
- EPUBを同名上書きした場合は、ファイル名を変えて `path` を更新します。
