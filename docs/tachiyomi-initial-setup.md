# TsukuyomiReader 初期設定チェックリスト

この資料は、Cloudflare Pages上で立ち読み版を動かし始める前に行う初期設定の確認用です。

## 結論

最小構成で必要なのは、次の3つです。

1. Pagesプロジェクトが正しいビルド設定でデプロイされている
2. R2 bucket binding `TSUKUYOMI_BOOKS_BUCKET` がある
3. 環境変数 `TSUKUYOMI_ADMIN_TOKEN` がある

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

Pagesプロジェクトの `Settings > Bindings` で、R2 bucket bindingを追加します。

```text
Variable name: TSUKUYOMI_BOOKS_BUCKET
R2 bucket: tsukuyomi-reader-books
```

### 管理トークン

Pagesプロジェクトの `Settings > Environment variables` に追加します。

```text
TSUKUYOMI_ADMIN_TOKEN=十分に長いランダム文字列
```

設定後は再デプロイします。

管理画面では、同じ値を入力して保存します。

```text
https://tsukuyomi-reader-tachiyomi.pages.dev/admin.html
```

## 最初の動作確認

1. `https://tsukuyomi-reader-tachiyomi.pages.dev/` を開く
2. `https://tsukuyomi-reader-tachiyomi.pages.dev/api/books` を開く
3. R2が空なら `[]` が返ることを確認する
4. `/admin.html` を開く
5. 管理トークンを入力して保存する
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

Access認証済みメールを読書ログへ管理用に紐づける場合:

```text
TSUKUYOMI_ACCESS_IDENTITY_ANALYTICS=true
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
| `TSUKUYOMI_ADMIN_TOKEN` 未設定 | 管理APIが500。読者向け閲覧はR2設定済みなら動く |
| 管理画面に入れたトークンが違う | 管理APIが401。作品追加や公開停止はできない |
| D1未設定 | 本格分析は不可。ただしR2 bucketがあれば軽量読書ログにフォールバック |
| D1 migration未実行 | 管理画面の読書ログが未設定扱い、またはAccessメール列だけ保存スキップ |
| `TSUKUYOMI_ACCESS_IDENTITY_ANALYTICS` 未設定 | Access認証メールと読書ログは紐づかない。匿名ログは通常どおり |
| Cloudflare Access未設定 | 限定レビュー版は保護されない。未発表稿は置かない |
| `TSUKUYOMI_REVIEW_ACCESS_SOFT_BLOCK` 未設定 | `閲覧保留` は記録だけになり、Reader側の個別保留は効かない |
| `TSUKUYOMI_PUBLICATION_PAUSED` 未設定 | 手動の全体公開停止は無効。通常公開は継続 |

## いま初期設定が未完了でも起きること

公開URLと静的ファイルだけなら、Pagesのデプロイだけで画面は開きます。

ただし、R2 bindingと管理トークンが未設定の場合、Web管理運用はできません。`/api/books` が500になり、作品一覧も管理画面も実運用できない状態になります。

D1、Access、閲覧保留は任意機能です。未設定でも、通常の立ち読み公開と管理画面更新には直接影響しません。

賞応募候補や限定レビューを扱う場合だけ、Cloudflare Accessと関連環境変数を設定します。

## 初期設定後の目安

最低限の成功状態:

```text
/api/books が [] または作品一覧JSONを返す
/admin.html で管理トークン保存後に作品一覧・R2使用状況を読める
管理画面からTXTまたはEPUBを1件登録できる
Reader画面で登録作品を開ける
```

ここまで通れば、初期設定は完了扱いでよいです。
