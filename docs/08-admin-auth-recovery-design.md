# 管理者認証と復旧設計

作成日: 2026-05-28
更新日: 2026-05-28

管理トークンを忘れた場合、または漏洩した場合の復旧方針です。マスターパスワード方式は避け、管理者メールOTPとCloudflare環境変数を組み合わせます。ログの保存先と取得方法は `09-log-coverage-guide.md` を参照します。

## 結論

管理画面は次の2モードに対応します。

- `TSUKUYOMI_ADMIN_AUTH_MODE=token`
  - 既存互換モード。未設定時のデフォルト。
  - `Authorization: Bearer <TSUKUYOMI_ADMIN_TOKEN>` で管理APIを使う。
- `TSUKUYOMI_ADMIN_AUTH_MODE=email_otp`
  - 推奨モード。
  - 許可済み管理者メールへ6桁OTPを送り、成功後はHttpOnly Cookieの管理セッションで管理APIを使う。

漏洩時の最終停止権限はアプリ内に置かず、Cloudflare Dashboardの環境変数変更をRoot of Trustとして残します。

理由:

- 漏洩した管理トークンで「リセットAPI」を叩ける設計にすると、攻撃者もリセットできる
- マスターパスワードは、結局もう1つの漏洩対象になる
- メールOTPなら、普段の管理者ログインは「管理メールの所有」で回復できる
- Cloudflareアカウントは、環境変数を変更できる最終権限として残せる

## 許可する管理者メール

初期実装では、次の3件を管理者メールとして使います。

```text
halthejuggernaut@gmail.com
haltherock@yahoo.com
weezartherock@gmail.com
```

環境変数ではカンマ区切りで明示します。

```text
TSUKUYOMI_ADMIN_EMAILS=halthejuggernaut@gmail.com,haltherock@yahoo.com,weezartherock@gmail.com
```

## 環境変数

メールOTPを使う場合:

```text
TSUKUYOMI_ADMIN_AUTH_MODE=email_otp
TSUKUYOMI_ADMIN_EMAILS=halthejuggernaut@gmail.com,haltherock@yahoo.com,weezartherock@gmail.com
TSUKUYOMI_ADMIN_AUTH_SECRET=十分に長いランダム文字列
TSUKUYOMI_ADMIN_EMAIL_PROVIDER=resend
TSUKUYOMI_ADMIN_EMAIL_FROM=Resendで有効な送信元
RESEND_API_KEY=Resend APIキー
```

任意の調整値:

```text
TSUKUYOMI_ADMIN_OTP_MINUTES=10
TSUKUYOMI_ADMIN_SESSION_HOURS=12
TSUKUYOMI_RATE_LIMIT_ADMIN_AUTH_REQUEST=5
TSUKUYOMI_RATE_LIMIT_ADMIN_AUTH_REQUEST_WINDOW_SECONDS=600
TSUKUYOMI_RATE_LIMIT_ADMIN_AUTH_REQUEST_BLOCK_SECONDS=1800
TSUKUYOMI_RATE_LIMIT_ADMIN_AUTH_VERIFY=10
TSUKUYOMI_RATE_LIMIT_ADMIN_AUTH_VERIFY_WINDOW_SECONDS=600
TSUKUYOMI_RATE_LIMIT_ADMIN_AUTH_VERIFY_BLOCK_SECONDS=1800
```

既存の管理トークン方式を使う場合:

```text
TSUKUYOMI_ADMIN_AUTH_MODE=token
TSUKUYOMI_ADMIN_TOKEN=十分に長いランダム文字列
```

`TSUKUYOMI_ADMIN_AUTH_MODE` を未設定にした場合も `token` モードです。

## ログイン手順

`email_otp` モード:

1. 管理画面で管理者メールアドレスを入力する
2. `コード送信` を押す
3. メールで届いた6桁コードを入力する
4. `ログイン` を押す
5. 成功後は `tsukuyomi_admin_session` Cookieで管理APIを使う

管理セッションは標準12時間です。`TSUKUYOMI_ADMIN_AUTH_SECRET` を変更すると、既存の管理セッションはすべて無効になります。

`token` モード:

1. 管理画面で `TSUKUYOMI_ADMIN_TOKEN` と同じ値を入力する
2. `保存` を押す
3. 既存どおりBearer tokenで管理APIを使う

## API

```text
GET  /api/admin-auth/status
POST /api/admin-auth/request
POST /api/admin-auth/verify
POST /api/admin-auth/logout
```

`email_otp` モードでは、既存の管理APIはBearer tokenを見ず、HttpOnly Cookieの管理セッションだけを受け付けます。

`token` モードでは、既存どおり `Authorization: Bearer <TSUKUYOMI_ADMIN_TOKEN>` を受け付けます。

## R2保存先

```text
_tsukuyomi/admin-auth-challenges.json
_tsukuyomi/admin-auth-log.json
```

OTPの平文は保存しません。保存するのはハッシュ、salt、期限、試行回数です。

ログは振り返りに使える粒度に絞ります。許可外メールのOTP要求は、画面上は成功扱いにしますが、メール送信も詳細ログ保存もしません。アタックを受けたメールアドレスの生リストを溜めないためです。

## セキュリティ仕様

- OTPは6桁
- OTP有効期限は10分
- OTPは1回限り
- 同じ管理者メールに新しいOTPを発行した場合、古い未使用OTPは失効
- OTP検証は最大5回まで
- OTP要求は標準5回/10分、超過時30分ブロック
- OTP検証は標準10回/10分、超過時30分ブロック
- 許可外メールでも `/request` は同じ成功レスポンスを返し、メールアドレス列挙を防ぐ
- 許可外メールには送信しない
- 管理セッションはHttpOnly Cookie
- Cookie名は `tsukuyomi_admin_session`
- Cookieは `SameSite=Lax`、HTTPSでは `Secure`
- `TSUKUYOMI_ADMIN_AUTH_SECRET` 変更で全管理セッション失効

## 復旧手順

### 管理トークンを忘れた場合

`email_otp` モードなら、許可済み管理者メールでログインします。管理トークンを覚えておく必要はありません。

メールOTPも使えない場合は、Cloudflare Dashboardで環境変数を変更します。

1. `TSUKUYOMI_ADMIN_AUTH_MODE=token` に切り替える
2. `TSUKUYOMI_ADMIN_TOKEN` を新しい値へ変更する
3. 再デプロイする
4. 管理画面で新しい管理トークンを保存する
5. 必要なら `email_otp` モードへ戻す

### 管理セッションや秘密情報が漏洩した場合

1. Cloudflare Dashboardで `TSUKUYOMI_ADMIN_AUTH_SECRET` を変更する
2. `TSUKUYOMI_ADMIN_TOKEN` も別値へ変更する
3. `RESEND_API_KEY` 漏洩疑いがある場合はResend側でAPIキーを失効し、新しいキーを設定する
4. 再デプロイする
5. 管理画面で作品、限定レビューPW発行状況、認証イベントを確認する

## メール送信

初期実装はResendだけに対応します。

無料枠だけで運用する場合の採用方針は `Resend` です。

理由:

- Free planがあり、管理者OTP用途には十分な `100 emails/day` と `3,000 emails/month` がある
- Pages FunctionsからREST APIを `fetch()` で呼ぶだけで実装できる
- 管理者OTPは通常1日数通以下なので、無料枠を超えにくい

Brevoも無料枠が大きく、`300 emails/day` まで使えます。Resendのアカウント制限、到達性、独自ドメイン設定で問題が出た場合の代替候補として残します。ただし、今回の初期実装には含めません。

SMS認証は原則有料になりやすいため、今回の実装対象外です。

比較:

| Provider | 無料枠 | 位置づけ |
|---|---:|---|
| Resend | 100 emails/day, 3,000 emails/month | 採用 |
| Brevo | 300 emails/day | 代替候補 |
| Mailgun | 100 messages/day | 予備候補 |
| Cloudflare Email Service | Outbound送信はWorkers Paid前提 | 完全無料では採用しない |
| SendGrid | 無料が試用寄り | 採用しない |

## 限定レビュー認証との分離

`TSUKUYOMI_REVIEW_AUTH_SECRET` を未設定にしている場合、レビュー用パスワード認証が `TSUKUYOMI_ADMIN_TOKEN` に依存します。

管理者認証をメールOTPへ移行する前に、限定レビュー版では必ず以下を分けます。

```text
TSUKUYOMI_REVIEW_AUTH_SECRET=レビュー認証専用の長いランダム文字列
TSUKUYOMI_ADMIN_AUTH_SECRET=管理者セッション専用の長いランダム文字列
```

これにより、管理者認証の変更で読者用パスワードまで壊れる事故を避けます。

`email_otp` モードで `TSUKUYOMI_REVIEW_AUTH_SECRET` が未設定の場合、管理画面の `PW発行` は失敗します。この場合は認証イベントに `PW発行失敗 / secret-missing` が残ります。

## やらないこと

- SMS認証
- マスターパスワード
- 秘密の質問
- 管理トークンを知っていればサーバー側トークンを変更できるAPI
- 許可メール未登録でもOTPを送る仕組み
