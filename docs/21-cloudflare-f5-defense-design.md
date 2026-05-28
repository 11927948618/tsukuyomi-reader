# Cloudflare F5 Defense Design

この資料は、独自ドメインを持たない `*.pages.dev` 運用でも無料で入れられる、軽量なF5連打対策をまとめたものです。

## 目的

読者が通常利用する範囲は邪魔せず、短時間の連打や誤操作でR2本文ファイルの読み取り回数が増え続けることを抑えます。

この対策はDDoS対策ではありません。Cloudflare WAF Rate Limiting Rulesの代替ではなく、独自ドメインなしでも入れられる保険です。

## 方針

公開APIの入口で、同一IPからの短時間アクセスをメモリ上で数えます。

```text
/api/books:
  作品一覧。軽いので緩め。

/api/books/:id/content:
  本文EPUB/TXT/PDF。R2読み取り負荷が高いので厳しめ。

/api/books/:id/cover:
  表紙画像。一覧表示で複数回呼ばれるので緩め。
```

既定値:

```text
manifest: 10秒に60回まで
content:  10秒に12回まで
cover:    10秒に60回まで
超過時:   30秒間 429
```

## 環境変数

必要ならCloudflare Pagesの環境変数で調整できます。

```text
TSUKUYOMI_RATE_LIMIT_DISABLED=true
TSUKUYOMI_RATE_LIMIT_WINDOW_SECONDS=10
TSUKUYOMI_RATE_LIMIT_BLOCK_SECONDS=30

TSUKUYOMI_RATE_LIMIT_MANIFEST=60
TSUKUYOMI_RATE_LIMIT_CONTENT=12
TSUKUYOMI_RATE_LIMIT_COVER=60
```

個別に判定窓やブロック秒数を変える場合:

```text
TSUKUYOMI_RATE_LIMIT_CONTENT_WINDOW_SECONDS=10
TSUKUYOMI_RATE_LIMIT_CONTENT_BLOCK_SECONDS=30
```

## 限界

- Pages Functionsの実行自体は発生します。
- メモリ上のカウンタなので、Cloudflareの複数拠点や複数実行環境をまたいだ完全な制限にはなりません。
- 大量分散アクセスには効きません。
- 429が多発して通常読者に影響する場合は、制限値を上げるか、独自ドメインを取得してCloudflare WAF Rate Limiting Rulesを使います。

## 位置づけ

無料運用では以下の順番で守ります。

```text
1. アプリ側の簡易IPレート制限
2. R2使用量ガードによる新規公開停止 / 公開一時停止
3. 必要になれば独自ドメイン + Cloudflare WAF Rate Limiting Rules
4. アクセスが収益化できる規模なら広告などで費用吸収を検討
```
