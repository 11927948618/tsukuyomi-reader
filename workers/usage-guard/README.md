# Tsukuyomi Usage Guard Worker

R2 Metricsを定期確認し、対象バケットに `_tsukuyomi/usage-guard.json` を書き込む監視Workerです。

このWorkerはPages Functionsとは別プロジェクトとしてデプロイします。複数の公開アプリで同じ設計を使う場合は、アプリごとにWorkerを分けるか、バケットごとの設定を増やして横展開します。

## 必要な環境変数

```text
CF_ACCOUNT_ID=Cloudflare account ID
CF_ANALYTICS_TOKEN=GraphQL Analytics API token
R2_BUCKET_NAME=tsukuyomi-reader-books

USAGE_WARN_CLASS_B=7000000
USAGE_RESTRICT_CLASS_B=8000000
USAGE_PAUSE_CLASS_B=9000000
```

`CF_ANALYTICS_TOKEN` には `Account > Account Analytics > Read` 権限が必要です。
`/status` と `/run` を手動実行する場合は、`USAGE_GUARD_TOKEN` もsecretとして設定します。

```text
wrangler secret put CF_ANALYTICS_TOKEN
wrangler secret put USAGE_GUARD_TOKEN
```

## 必要なR2 binding

```text
Variable name: TSUKUYOMI_BOOKS_BUCKET
R2 bucket: tsukuyomi-reader-books
```

## Cron

毎日 09:00 JST に実行する場合:

```text
0 0 * * *
```

Cloudflare CronはUTC基準です。

## 出力

```text
_tsukuyomi/usage-guard.json
```

このファイルをPages Functions側が読み取り、公開継続・新規公開停止・公開一時停止を判断します。
