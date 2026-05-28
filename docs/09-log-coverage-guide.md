# ログ確認早見表

作成日: 2026-05-28

エラー調査時に、どのログが残るか、どこから取得できるかを確認するための早見表です。

## 管理者認証

管理画面:

```text
認証 > 管理者認証イベント
```

取得方法:

```text
認証 > 管理者認証イベント > ログ取得
```

R2:

```text
_tsukuyomi/admin-auth-log.json
```

API:

```text
GET /api/admin-auth/log
```

残すイベント:

| 表示 | type | 意味 |
|---|---|---|
| OTP送信 | `otp-sent` | 許可済み管理者メールへOTPを送った |
| OTP送信失敗 | `otp-send-failed` | Resend設定、APIキー、送信元などで送信失敗 |
| OTP検証成功 | `otp-verified` | 正しいOTPで管理ログインした |
| OTP検証失敗 | `otp-verify-failed` | OTP不一致、期限切れ、使用済み、試行上限 |
| 管理ログアウト | `logout` | 管理画面からログアウトした |

残さないもの:

- 許可外メールのOTP要求
  - メールアドレス列挙や攻撃リストを残さないため。
- 管理APIへのBearer総当たり失敗の生リスト
  - 高頻度攻撃ログで意味が薄くなりやすいため。

## 限定レビュー認証

管理画面:

```text
限定レビュー認証管理 > 認証振り返り
限定レビュー認証管理 > 認証イベント
```

取得方法:

```text
限定レビュー認証管理 > 認証イベント > ログ取得
```

R2:

```text
_tsukuyomi/review-auth-summary.json
_tsukuyomi/review-auth-log.json
```

残すイベント:

| 表示 | type | 意味 |
|---|---|---|
| 閲覧者追加 | `review-access-added` | 管理画面で閲覧者を一覧へ追加した |
| 閲覧状態変更 | `review-access-status-changed` | 未適用、閲覧許可、保留、停止を変更した |
| 閲覧者削除 | `review-access-removed` | 管理画面で閲覧者を一覧から削除した |
| PW発行 | `password-issued` | Reader内パスワードを発行した |
| PW発行失敗 | `password-issue-failed` | PW発行に失敗した。`secret-missing` は `TSUKUYOMI_REVIEW_AUTH_SECRET` 未設定 |
| PW無効化 | `password-revoked` | Reader内パスワードを無効化した |
| PW無効化失敗 | `password-revoke-failed` | PW無効化に失敗した。対象不一致など |
| 有効IDのPW失敗 | `valid-id-password-mismatch` | 登録済みメールまたは仮IDでPWが違う |
| ロック発生 | `account-locked` | 失敗回数が閾値を超えた |
| PW期限切れ | `password-expired` | 期限切れPWでログインしようとした |
| 有効IDの認証拒否 | `valid-id-login-denied` | 未発行、未適用、保留、停止など |
| 同時利用検知 | `concurrent-session` | 同じIDで複数セッションが近い時間に動いた |

未知IDの生値は残しません。アタックを受けたIDリストは後から見ても意味が薄く、個人情報やノイズになりやすいためです。未知ID失敗は `_tsukuyomi/review-auth-summary.json` に件数集計だけ残します。

## 読書ログ

管理画面:

```text
読書ログ
```

保存先:

```text
D1: TSUKUYOMI_ANALYTICS_DB
R2 fallback: _tsukuyomi/analytics-lite.json
```

残すもの:

- 作品を開いた
- 進捗
- 読了
- 限定レビュー認証やAccess認証と紐づけた管理用メール情報

読者同士には公開しません。管理側で一元保管・集計し、文芸分析や作品改善に使うためのログです。

## まだ詳細ログ化していないもの

現時点では以下は状態確認で対応し、詳細な操作ログは残しません。

- 作品アップロード、作品削除、公開/非公開変更の監査ログ
  - 現在の作品一覧状態とR2使用状況で確認します。
  - 操作責任の追跡が必要になったら、管理操作ログとして追加します。
- R2使用状況の取得失敗
  - 管理画面のエラーメッセージとCloudflare側のログで確認します。
- Resend側の配送詳細
  - TsukuyomiReader側には送信要求の成功/失敗だけ残します。
  - 到達性はResend Dashboardで確認します。

## 調査時の見方

PW発行が失敗した場合:

1. `限定レビュー認証管理 > 認証イベント` を見る
2. `PW発行失敗` の `reason` を確認する
3. `secret-missing` なら `TSUKUYOMI_REVIEW_AUTH_SECRET` を設定して再デプロイする
4. `target-not-found` なら対象のメールアドレスまたは仮IDが一覧にあるか確認する

管理ログインできない場合:

1. 管理トークン方式か、管理者メールOTP方式かを確認する
2. `email_otp` モードなら `管理者認証イベント` を見る
3. `OTP送信失敗` ならResend設定を確認する
4. `OTP検証失敗` なら期限切れ、使用済み、入力ミス、再発行済みコードを疑う
