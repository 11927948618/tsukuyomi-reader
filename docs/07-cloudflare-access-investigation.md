# Cloudflare Access 調査メモ

作成日: 2026-05-28

Cloudflare Access の運用がうまく設定できなかった理由を、現時点の実装資料とCloudflare公式ドキュメントから切り分けるためのメモです。今は代替としてReader内パスワード認証を優先し、この資料はAccessへ再挑戦する場合の調査台帳として使います。

## 現時点の結論

確定原因は、Cloudflare Dashboard上の実設定や当時のエラー画面が残っていないため断定できません。

ただし、最も疑わしいのは次の2点です。

1. Cloudflare Pagesの `Enable access policy` は、標準ではプレビューDeploymentを保護する機能で、本番の `<project>.pages.dev` やカスタムドメインを保護しない。
2. One-time PINは、Access policyで許可されたメールアドレスにだけ送信される。未許可でも画面上は「送った」ように見えるため、設定ミスが分かりにくい。

## 公式ドキュメント上の重要点

- Cloudflare Access は、対象アプリの前段でリクエストを検査し、Access policyを満たした場合だけ通す。
- Access policyには少なくとも1つの `Include` ruleが必要。
- `Include` はOR条件、`Require` はAND条件として扱われる。
- `Bypass` はAccessの認証・ログを無効化するため、保護目的では使わない。
- One-time PINは、許可されたメールアドレスにだけ送られる。
- One-time PINは1回限りで、新しいPINを要求すると古いPINは無効になる。
- メールセキュリティ製品がPINリンクを先に開くと、PINが使用済みになることがある。
- PagesのプレビューDeployment保護は、本番の `<project>.pages.dev` やカスタムドメインとは別扱い。
- カスタムドメイン検証中にAccessをかけると、HTTP検証がAccessログインへリダイレクトされ、検証が詰まることがある。

参照:

- https://developers.cloudflare.com/pages/configuration/preview-deployments/
- https://developers.cloudflare.com/pages/platform/known-issues/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/
- https://developers.cloudflare.com/cloudflare-one/access-controls/policies/
- https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/
- https://developers.cloudflare.com/pages/configuration/debugging-pages/

## 起きやすい原因候補

### 1. プレビューだけ保護して本番URLが保護されていない

Cloudflare Pagesの `Settings > General > Enable access policy` だけを使った場合、保護されるのは通常プレビューDeploymentです。

例:

```text
保護される可能性が高い:
<hash>.<project>.pages.dev

保護されない可能性がある:
<project>.pages.dev
独自ドメイン
```

この場合、Accessを設定したつもりでも、本番ReaderのURLを開くと普通に読めてしまいます。

### 2. Access application の Public hostname が対象URLと違う

Access applicationのPublic hostnameが、実際に読者へ渡すURLと一致していないと保護されません。

確認する値:

```text
読者へ渡すURL:
https://tsukuyomi-reader-review.pages.dev/

Access applicationのPublic hostname:
tsukuyomi-reader-review.pages.dev
```

プレビューURL、production `pages.dev`、独自ドメインは別物として確認します。

### 3. One-time PIN のIdentity Providerが未設定

One-time PINを使う場合は、Zero Trust側でIdentity Providerとして `One-time PIN` を追加しておく必要があります。

確認場所:

```text
Zero Trust > Integrations > Identity providers
```

### 4. 許可メールがAccess policyに入っていない

One-time PINは、Access policyで許可されたメールアドレスにだけ送信されます。未許可でも画面は「コードを送った」と表示するため、利用者には失敗理由が分かりません。

確認する値:

```text
Policy action: Allow
Include: Emails
Value: test@example.com
Login method: One-time PIN
```

### 5. Require条件でANDになって誰も通れない

`Require` はAND条件です。複数条件を不用意に置くと、現実には満たせない条件になります。

最初の検証では、複雑な条件を避けます。

推奨の最小構成:

```text
Action: Allow
Include: Emails -> 自分のメールアドレス1件
```

### 6. Bypass または Service Auth を使っている

ブラウザで読者にログインさせる用途では、最初は `Allow` を使います。

- `Bypass`: Access認証を無効化する
- `Service Auth`: サービス間認証向けで、通常のメールログインではない

### 7. カスタムドメイン検証中にAccessが邪魔をした

独自ドメイン設定中にAccessを先に有効化すると、Cloudflare PagesのHTTP検証がAccessログインにリダイレクトされ、ドメイン検証が完了しないことがあります。

この場合は、ドメイン検証が終わるまでAccessを一時的に外します。

## 再調査時の確認手順

### 1. 対象URLを1つに固定する

まず本番の `pages.dev` だけを対象にします。

```text
https://tsukuyomi-reader-review.pages.dev/
```

プレビューURLや独自ドメインは後回しにします。

### 2. Access applicationを確認する

確認場所:

```text
Zero Trust > Access controls > Applications
```

見る項目:

- Application type: Self-hosted
- Public hostname: `tsukuyomi-reader-review.pages.dev`
- Policy action: `Allow`
- Include: 自分のメールアドレス
- Login method: One-time PIN

### 3. シークレットウィンドウで開く

期待する挙動:

```text
/            -> Accessログイン画面
/api/books   -> Accessログイン画面またはAccessによる拒否
/admin.html  -> Accessログイン画面
```

未ログインでReaderや `/api/books` がそのまま開ける場合、対象URLにAccessがかかっていません。

### 4. curlでヘッダーを見る

PowerShell例:

```powershell
curl.exe -I https://tsukuyomi-reader-review.pages.dev/
curl.exe -I https://tsukuyomi-reader-review.pages.dev/api/books
```

未認証で `200` が返る場合、Access保護はかかっていません。

`302` で `/cdn-cgi/access/login` へ向く場合、Accessは前段で効いています。

### 5. OTPメールを確認する

見ること:

- 迷惑メールに入っていないか
- 送信元 `noreply@notify.cloudflare.com` が拒否されていないか
- Access policyに入力メールが含まれているか
- 新しいPINを要求して古いPINを使っていないか

## 調査に必要な情報

原因を確定するには、次の情報が必要です。

- AccessをかけようとしたURL
- そのURLをシークレットウィンドウで開いた時の表示
- OTPメールが届いたか
- PIN入力後に出た表示
- Access applicationのPublic hostname
- Access policyのAction、Include、Require、Login method
- Cloudflare Zero TrustのAccess logsに記録があるか

## 再挑戦する場合の最小構成

1. 限定レビュー用Pagesプロジェクトを1つ作る
2. 本番URLを `https://tsukuyomi-reader-review.pages.dev/` に固定する
3. Zero TrustでSelf-hosted applicationを作る
4. Public hostnameに `tsukuyomi-reader-review.pages.dev` を設定する
5. Policyは `Allow` + `Include Emails` + 自分のメールアドレス1件だけにする
6. Identity Providerは `One-time PIN` だけにする
7. シークレットウィンドウで `/` と `/api/books` を確認する
8. 問題なければ友人のメールを追加する

## 現在の判断

今すぐ限定レビューを進める目的では、Reader内パスワード認証を使う方が確実です。

Accessは、後で時間を取って上記の最小構成から再検証します。特に `Pagesのプレビュー保護` と `本番pages.dev保護` の違いを最初に確認します。
