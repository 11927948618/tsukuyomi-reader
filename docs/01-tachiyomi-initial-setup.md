# TsukuyomiReader 初期設定チェックリスト

この資料は、Cloudflare Pages上で立ち読み版を動かし始める前に行う初期設定の確認用です。

## 結論

最小構成で必要なのは、次の3つです。

1. Pagesプロジェクトが正しいビルド設定でデプロイされている
2. R2 bucket binding `TSUKUYOMI_BOOKS_BUCKET` がある
3. 管理者認証が設定されている

この3つがそろうと、管理画面から作品を追加し、読者向けの `/api/books` で作品一覧を返せます。

## 必須設定

### Pages

対象プロジェクト:

```text
tsukuyomi-reader-tachiyomi
```

推奨URL:

```text
https://tsukuyomi-reader-tachiyomi.pages.dev/
```

Build settings:

```text
Framework preset: None
Build command: 空欄
Build output directory: .
Root directory: 空欄
```

`Root directory` に `tsukuyomi-reader` を入れると、存在しないサブフォルダを探して失敗します。

### R2

R2 bucketを作成します。

```text
tsukuyomi-reader-books
```

一般公開用と限定レビュー用を分ける場合は、公開用bucketも作成します。

```text
tsukuyomi-reader-public-books
```

Pagesプロジェクトの `Settings > Bindings` で、R2 bucket bindingを追加します。

```text
Variable name: TSUKUYOMI_BOOKS_BUCKET
R2 bucket: tsukuyomi-reader-books
```

一般公開用Pagesでは、`TSUKUYOMI_BOOKS_BUCKET` を公開用bucketに向けます。

```text
Variable name: TSUKUYOMI_BOOKS_BUCKET
R2 bucket: tsukuyomi-reader-public-books
```

限定レビュー用Pagesの管理画面から一般公開へ昇格する場合は、公開用bucketも追加します。

```text
Variable name: TSUKUYOMI_PUBLIC_BOOKS_BUCKET
R2 bucket: tsukuyomi-reader-public-books
```

### 管理者認証

Pagesプロジェクトの `Settings > Environment variables` に追加します。

当面の推奨構成は、管理画面を管理トークンで守り、読者は直接発行パスワードで認証します。

```text
TSUKUYOMI_ADMIN_AUTH_MODE=token
TSUKUYOMI_ADMIN_TOKEN=十分に長いランダム文字列
```

`TSUKUYOMI_ADMIN_AUTH_MODE` を省略した場合も `token` モードです。

管理者メールOTPは、メール送信設定を使う場合の将来オプションです。現時点の直接発行PW運用では不要です。

```text
TSUKUYOMI_ADMIN_AUTH_MODE=email_otp
TSUKUYOMI_ADMIN_EMAILS=halthejuggernaut@gmail.com,haltherock@yahoo.com,weezartherock@gmail.com
TSUKUYOMI_ADMIN_AUTH_SECRET=十分に長いランダム文字列
TSUKUYOMI_ADMIN_EMAIL_PROVIDER=mailjet
TSUKUYOMI_ADMIN_EMAIL_FROM=Mailjetで認証済みの送信元
MAILJET_API_KEY=Mailjet API Key
MAILJET_SECRET_KEY=Mailjet Secret Key
```

設定後は再デプロイします。

`token` モードでは、管理画面で `TSUKUYOMI_ADMIN_TOKEN` と同じ値を入力して保存します。`email_otp` モードでは、許可済み管理者メールに届く6桁コードでログインします。

```text
https://tsukuyomi-reader-tachiyomi.pages.dev/admin.html
```

## 最初の動作確認

1. `https://tsukuyomi-reader-tachiyomi.pages.dev/` を開く
2. `https://tsukuyomi-reader-tachiyomi.pages.dev/api/books` を開く
3. R2が空なら `[]` が返ることを確認する
4. `/admin.html` を開く
5. 管理者認証を通す。`token` モードなら管理トークンを保存し、`email_otp` モードならメールコードでログインする
6. EPUB、TXT、PDFのいずれかを1件登録する
7. `/api/books` に作品が1件出ることを確認する
8. Reader画面で作品を開けることを確認する

## 任意設定

### 読書ログ

R2 bucket bindingがあれば、D1未設定でもR2軽量集計を使えます。

本格的に分析する場合は、D1 databaseを作成し、PagesにD1 bindingを追加します。

```text
Variable name: TSUKUYOMI_ANALYTICS_DB
```

初期マイグレーション:

```text
migrations/0001_reader_analytics.sql
```

Access認証メールと読書ログを紐づける場合は、追加マイグレーションも実行します。

```text
migrations/0002_access_identity_analytics.sql
```

ハッシュ化補助値:

```text
TSUKUYOMI_ANALYTICS_SALT=十分に長いランダム文字列
```

### 限定レビュー

未発表稿や賞応募候補を置く場合は、公開版とは別の限定レビュー版を用意し、Cloudflare Accessで保護します。

Cloudflare Accessが使えない場合は、Reader内のメールアドレス+パスワード認証を有効にします。

```text
TSUKUYOMI_REVIEW_PASSWORD_AUTH=true
TSUKUYOMI_REVIEW_AUTH_SECRET=十分に長いランダム文字列
```

`TSUKUYOMI_REVIEW_AUTH_SECRET` を省略した場合は `TSUKUYOMI_ADMIN_TOKEN` を署名・パスワードハッシュ用の補助値として使います。管理トークン変更で既存パスワードも無効化されるため、限定レビュー運用では専用の `TSUKUYOMI_REVIEW_AUTH_SECRET` を推奨します。

有効化後は、管理画面の `限定レビュー認証管理` で仮IDを作成し、メールアドレスと紐づけます。`PW発行` で表示されたパスワードを個別に送ります。

読者は、メールアドレスまたは仮IDとパスワードでログインできます。メールアドレスを伏せたい相手には、仮IDとパスワードだけを案内できます。

作品はまず限定レビュー用R2へ保存します。一般公開する場合は、管理画面の `一般公開へ昇格` で公開用R2へコピーします。昇格作品は標準7日で一般一覧から自動的に消えます。

標準では次の事前対策を行います。

- ログインAPI: 60秒に6回まで。超過時は5分ブロック
- メールアドレス単位: 5回失敗で15分ロック
- パスワード期限: 発行から7日
- セッション期限: 14日
- 同時利用検知: 同じメールアドレスまたは仮IDで10分以内に複数セッションが動いた場合、認証イベントへ記録
- 認証振り返り: 有効IDのPW失敗やロックは詳細イベント、未知IDへの試行は件数集計のみ
- 限定レビュー認証時: 本文HTMLのローカルキャッシュ保存・復元を抑制

必要に応じて調整できます。

```text
TSUKUYOMI_RATE_LIMIT_REVIEW_AUTH=6
TSUKUYOMI_RATE_LIMIT_REVIEW_AUTH_WINDOW_SECONDS=60
TSUKUYOMI_RATE_LIMIT_REVIEW_AUTH_BLOCK_SECONDS=300
TSUKUYOMI_REVIEW_LOGIN_FAILURE_LIMIT=5
TSUKUYOMI_REVIEW_LOGIN_LOCK_MINUTES=15
TSUKUYOMI_REVIEW_PASSWORD_DAYS=7
TSUKUYOMI_REVIEW_AUTH_SESSION_DAYS=14
TSUKUYOMI_REVIEW_CONCURRENT_WINDOW_MINUTES=10
```

Access認証済みメールを読書ログへ管理用に紐づける場合:

```text
TSUKUYOMI_ACCESS_IDENTITY_ANALYTICS=true
```

Reader内パスワード認証のメールアドレスを読書ログへ紐づける場合:

```text
TSUKUYOMI_REVIEW_PASSWORD_IDENTITY_ANALYTICS=true
```

許可ユーザーをAccessから外さずにReader側で一時保留する場合:

```text
TSUKUYOMI_REVIEW_ACCESS_SOFT_BLOCK=true
```

この設定があると、管理画面で `閲覧保留` または `停止済み` にしたメールアドレスには、作品一覧が空で返ります。

### 公開停止

緊急時に全体公開を止める場合:

```text
TSUKUYOMI_PUBLICATION_PAUSED=true
```

この場合、`/api/books` は空配列を返し、本文APIは一時停止扱いになります。

## 未設定時の影響

| 未設定項目 | 影響 |
|---|---|
| Pagesプロジェクト未作成 | `*.pages.dev` URL自体が開かない |
| Build settings不正 | デプロイ失敗、またはFunctions/APIが動かない |
| `TSUKUYOMI_BOOKS_BUCKET` 未設定 | `/api/books` が500、管理画面の作品操作・R2使用状況・許可メモが使えない |
| R2 bucketはあるが作品未登録 | `/api/books` は `[]`。Readerは開くが作品一覧は空 |
| `TSUKUYOMI_ADMIN_TOKEN` 未設定 | `token` モードでは管理APIが500。読者向け閲覧はR2設定済みなら動く |
| `TSUKUYOMI_ADMIN_AUTH_SECRET` 未設定 | `email_otp` モードでは管理セッション作成・検証ができない |
| `MAILJET_API_KEY`、`MAILJET_SECRET_KEY`、`TSUKUYOMI_ADMIN_EMAIL_FROM` 未設定 | `email_otp` モードでログインコードを送信できない |
| 管理画面に入れたトークンが違う | 管理APIが401。作品追加や公開停止はできない |
| D1未設定 | 本格分析は不可。ただしR2 bucketがあれば軽量読書ログにフォールバック |
| D1 migration未実行 | 管理画面の読書ログが未設定扱い、またはAccessメール列だけ保存スキップ |
| `TSUKUYOMI_ACCESS_IDENTITY_ANALYTICS` 未設定 | Access認証メールと読書ログは紐づかない。匿名ログは通常どおり |
| Cloudflare Access未設定 | 限定レビュー版は保護されない。未発表稿は置かない |
| `TSUKUYOMI_REVIEW_PASSWORD_AUTH` 未設定 | Reader内パスワード認証は無効。Access等の外部認証がない場合は保護されない |
| `TSUKUYOMI_REVIEW_AUTH_SECRET` 未設定 | 管理トークンを補助値に使う。管理トークン変更で既存パスワードが無効化される |
| `TSUKUYOMI_REVIEW_PASSWORD_IDENTITY_ANALYTICS` 未設定 | Reader内パスワード認証メールと読書ログは紐づかない。認証イベントには対象のメールアドレスまたは仮IDが残る |
| `TSUKUYOMI_REVIEW_ACCESS_SOFT_BLOCK` 未設定 | `閲覧保留` は記録だけになり、Reader側の個別保留は効かない |
| `TSUKUYOMI_PUBLICATION_PAUSED` 未設定 | 手動の全体公開停止は無効。通常公開は継続 |

## いま初期設定が未完了でも起きること

公開URLと静的ファイルだけなら、Pagesのデプロイだけで画面は開きます。

ただし、R2 bindingと管理者認証が未設定の場合、Web管理運用はできません。`/api/books` が500になり、作品一覧も管理画面も実運用できない状態になります。

D1、Access、閲覧保留は任意機能です。未設定でも、通常の立ち読み公開と管理画面更新には直接影響しません。

賞応募候補や限定レビューを扱う場合だけ、Cloudflare Accessと関連環境変数を設定します。

## 初期設定後の目安

最低限の成功状態:

```text
/api/books が [] または作品一覧JSONを返す
/admin.html で管理者認証後に作品一覧・R2使用状況を読める
管理画面からTXTまたはEPUBを1件登録できる
Reader画面で登録作品を開ける
```

ここまで通れば、初期設定は完了扱いでよいです。
