# Reader Analytics Design

この資料は、立ち読み版で匿名読者ごとの読書傾向を記録するための設計です。

## 目的

実名、メールアドレス、端末番号を取得せずに、同じブラウザ環境の読者がどの作品をどこまで読んだかを分析できるようにします。

目的は読者個人の特定ではなく、作品傾向の把握です。

```text
匿名読者A:
  作品Xを開いた
  作品Yを75%まで読んだ
  作品Zを読了した
```

## 取得する情報

保存するイベントは3種類です。

```text
open:
  作品を開いた

progress:
  25% / 50% / 75% に到達した

finish:
  95%以上に到達した
```

保存項目:

```text
created_at
event_type
book_id
reader_id_hash
session_id
progress_percent
chapter_id
source_type
user_agent_hash
country
referer_path
```

## 取得しない情報

以下は保存しません。

```text
氏名
メールアドレス
住所
端末番号
IPアドレス
生のUser-Agent
```

ブラウザ側では `localStorage` にランダムな読者IDを保存します。サーバ側では、その読者IDをハッシュ化して保存します。

同じブラウザなら同一読者として集計できますが、別端末、別ブラウザ、キャッシュ削除後は別読者として扱います。

## 限定レビュー版のAccess連携

限定レビュー版をCloudflare Accessで保護している場合に限り、AccessがFunctionsへ渡す認証済みメールアドレスを読書ログへ紐づけられます。

有効化する環境変数:

```text
TSUKUYOMI_ACCESS_IDENTITY_ANALYTICS=true
```

この設定を有効にした場合、管理画面の読書ログに「Access別読書ログ」が表示され、どのメールアドレスがどの作品をどこまで読んだかを確認できます。

注意:

- これは匿名ログではなく、メールアドレスを含む個人情報ログです。
- 公開版Readerでは有効にしません。
- 限定レビュー版の案内文やCloudflare Accessの案内文に、文芸分析目的で閲覧データを利用することを明記します。
- Cloudflare Accessの許可リスト全員が自動で取得されるわけではありません。読書ログに出るのは、実際にAccess認証を通ってReaderへアクセスした人です。

D1を使う場合は、追加マイグレーションを実行します。

```text
migrations/0002_access_identity_analytics.sql
```

D1が未設定の場合は、R2軽量集計にもAccess別の簡易集計を保存します。

## 保存先

基本はCloudflare D1を使います。

```text
Binding name: TSUKUYOMI_ANALYTICS_DB
```

D1テーブル定義:

```text
migrations/0001_reader_analytics.sql
```

D1が未設定の場合は、R2軽量集計へフォールバックします。

```text
_tsukuyomi/analytics-lite.json
```

R2軽量集計は、作品別の開始数、読了数、匿名読者数、平均到達率、最近のイベントだけを保存します。R2上のJSONを読み書きする簡易方式なので、本格分析や高頻度アクセス時の厳密な集計にはD1を使います。

## API

読者側:

```text
POST /api/analytics/event
```

管理側:

```text
GET /api/admin/analytics
```

管理APIは `TSUKUYOMI_ADMIN_TOKEN` で保護します。

## プライバシー表示

読者画面には以下の説明を表示します。

```text
匿名の読書ログ（作品を開いた日時、進捗、読了）を分析目的で記録します。IPアドレスや氏名は保存しません。
```

また、ブラウザのDo Not Trackが有効な場合は、既定ではログ送信を行いません。

## 環境変数

```text
TSUKUYOMI_ANALYTICS_DB
TSUKUYOMI_ANALYTICS_SALT
```

`TSUKUYOMI_ANALYTICS_SALT` はハッシュ化の補助値です。十分に長いランダム文字列を設定します。未設定でも動作しますが、設定を推奨します。

`TSUKUYOMI_ANALYTICS_DB` が未設定でも、R2 bucket bindingがあればR2軽量集計は動作します。

## site-config

```json
{
  "analyticsEnabled": true,
  "analyticsEndpoint": "/api/analytics/event",
  "analyticsRespectDoNotTrack": true,
  "analyticsNotice": "匿名の読書ログ（作品を開いた日時、進捗、読了）を分析目的で記録します。IPアドレスや氏名は保存しません。"
}
```

一時停止する場合:

```json
{
  "analyticsEnabled": false
}
```

## 無料枠の注意

D1 Freeの目安:

```text
Rows written: 100,000 / day
Rows read: 5,000,000 / day
Storage: 5GB
```

イベントは作品を開いた時、25/50/75%、読了時だけ送るため、通常の立ち読み運用では過剰な書き込みになりにくい設計です。

R2軽量集計を使う場合、イベントごとにR2上の集計JSONを読み書きします。小規模な立ち読み確認には十分ですが、アクセスが増えた場合はD1へ切り替えます。

## 限界

- 同じ人物が別端末で読んだ場合は別読者になります。
- localStorageを削除すると別読者になります。
- 読者本人の実名や連絡先は分かりません。
- 作品を開いたまま放置して離脱した場合、最後の進捗送信以降の状態は分かりません。
- R2軽量集計は同時アクセス時にまれに集計値が前後する可能性があります。

この制約は受け入れます。読者個人を強く追跡するより、作品傾向分析に必要な最小限のログに絞る方針です。

## 参考

- Cloudflare Workers / D1 pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare Web Analytics privacy stance: https://developers.cloudflare.com/web-analytics/about/
- 個人情報保護委員会 ガイドライン通則編: https://www.ppc.go.jp/personalinfo/legal/guidelines_tsusoku/
