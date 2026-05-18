# Cloudflare R2 Usage Guard Design

この資料は、TsukuyomiReaderに限らず、Cloudflare Pages / Workers / R2で公開アプリを運用するときの使用量ガード設計をまとめたものです。

## 目的

公開アプリがF5連打、単独IPからの過剰アクセス、想定外の拡散などを受けたときに、R2の読み取り回数やPages Functions / Workersの実行回数が増え続けることを避けます。

R2の無料枠はアカウント全体で共有されます。Reader以外にも公開アプリを増やすと、単純には利用量が足し算されます。したがって、アプリごとの局所対策だけでなく、同じ考え方を複数アプリへ横展開できる構造にします。

## 前提

- R2 Standard storageの無料枠は、月10GB保存、Class A操作100万回、Class B操作1000万回です。
- Pages FunctionsはWorkersリクエスト枠にカウントされます。
- R2 MetricsはCloudflare DashboardまたはGraphQL Analytics APIから確認できます。
- Cloudflare Cron TriggersはWorkerを定期実行できます。

## 役割分担

使用量ガードは、以下の3層で考えます。

```text
即時防御:
  Cloudflare Rate Limiting Rules
  アプリ側の簡易IPレート制限

月間使用量ガード:
  Cron WorkerがR2 Metricsを定期取得
  月間見込みを計算

公開停止:
  R2上の usage-guard.json を更新
  Pages Functions / Workers がその状態を読んでR2本文配信を止める
```

## usage-guard.json

各アプリのR2バケットに、以下のファイルを置きます。

```text
_tsukuyomi/usage-guard.json
```

形式:

```json
{
  "checkedAt": "2026-05-18T00:00:00.000Z",
  "source": "scheduled-worker",
  "level": "watch",
  "publicationPaused": false,
  "newPublishDisabled": false,
  "reason": "Class B projected usage exceeded warning threshold.",
  "metrics": {
    "classBMonthToDate": 3200000,
    "classBProjected": 7400000,
    "elapsedDays": 14,
    "daysInMonth": 31
  },
  "thresholds": {
    "watch": 7000000,
    "restrictPublishing": 8000000,
    "pausePublication": 9000000
  }
}
```

## 判定ルール

```text
月間見込み 700万超え:
  level = watch
  公開は継続
  管理画面に警告表示

月間見込み 800万超え:
  level = restrict-publishing
  newPublishDisabled = true
  新規公開と非公開から公開への変更を止める
  既存公開作品は読める

月間見込み 900万超え:
  level = paused
  publicationPaused = true
  /api/books は []
  /api/books/:id/content は 503
  /api/books/:id/cover は 503
```

## 月間見込み計算

Cron Workerは、月初から現在までのClass B操作をGraphQL Analytics APIで集計します。

```text
月間見込み = 現在の使用量 / 経過日数 * 月の日数
```

日単位の細かい揺れを吸収するため、実運用では毎日1回以上の確認を推奨します。

```text
毎日 09:00 JST = 0 0 * * * UTC
```

## アプリ側の実装方針

Pages Functions / Workersは、R2の大きな本文ファイルを読む前にusage guardを確認します。

```text
/api/books:
  publicationPausedなら [] を返す

/api/books/:id/content:
  publicationPausedなら 503 を返す

/api/books/:id/cover:
  publicationPausedなら 503 を返す

管理API:
  newPublishDisabledなら、新規公開または非公開から公開への変更を拒否する
```

## キャッシュ

usage-guard.jsonを毎リクエストR2から読むと、それ自体がClass B操作になります。そのため、アプリ側では短時間キャッシュします。

```text
通常時: 60秒キャッシュ
停止中: 300秒キャッシュ
```

これにより、F5連打中でもusage-guard.jsonの読み取り自体は増えにくくなります。

## 環境変数による手動停止

緊急時は、Metricsに関係なく環境変数で止められるようにします。

```text
TSUKUYOMI_PUBLICATION_PAUSED=true
```

この値がtrueなら、usage-guard.jsonより優先して公開停止します。

## 監視Workerに必要な設定

監視Workerには以下を設定します。

```text
CF_ACCOUNT_ID=Cloudflare account ID
CF_ANALYTICS_TOKEN=GraphQL Analytics API token
R2_BUCKET_NAME=tsukuyomi-reader-books

USAGE_WARN_CLASS_B=7000000
USAGE_RESTRICT_CLASS_B=8000000
USAGE_PAUSE_CLASS_B=9000000
```

必要なAPI token権限:

```text
Account > Account Analytics > Read
```

R2 binding:

```text
Variable name: TSUKUYOMI_BOOKS_BUCKET
R2 bucket: 対象バケット
```

## 限界

この設計は、課金事故を避けるための安全装置です。大量分散攻撃を完全に止めるものではありません。

即時防御には、Cloudflare Rate Limiting Rules、WAF、Bot対策、独自ドメインでのCloudflare管理を併用します。

## 参考

- R2 Pricing: https://developers.cloudflare.com/r2/pricing/
- R2 Metrics and Analytics: https://developers.cloudflare.com/r2/platform/metrics-analytics/
- Workers Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- GraphQL Analytics API token: https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/
- Pages Functions limits: https://developers.cloudflare.com/pages/platform/limits/
