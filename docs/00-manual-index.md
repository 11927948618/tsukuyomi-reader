# マニュアル索引

作成日: 2026-05-28

`docs/` 配下の資料は、読む順番が分かるようにファイル名へ通し番号を付けます。

## まず読むもの

- `01-tachiyomi-initial-setup.md`
  - 初回セットアップ、Cloudflare Pages、R2、環境変数の確認。
- `02-tachiyomi-update-manual.md`
  - 作品更新、管理画面操作、公開停止、運用時の手順。
- `03-tachiyomi-reader-manual.md`
  - 読者向けの基本操作。
- `04-tachiyomi-device-checklist.md`
  - Windows、Android、iPhoneなどの実機確認。

## 限定レビュー

- `05-limited-review-auth-quick-guide.md`
  - Cloudflare Accessが使えない場合のReader内パスワード認証クイック手順。
- `06-limited-review-operation.md`
  - 限定レビュー、賞応募候補、認証ログ、読書ログ利用の詳細運用。
- `07-cloudflare-access-investigation.md`
  - Cloudflare Accessがうまく設定できなかった原因候補と再調査手順。
- `08-admin-auth-recovery-design.md`
  - 管理者トークン忘れ・漏洩時の復旧設計。管理者メールOTP仕様。
- `09-log-coverage-guide.md`
  - 管理者認証、限定レビュー認証、読書ログの保存先と取得方法。

## 設計資料

- `10-reader-analytics-design.md`
  - 読書ログと分析設計。
- `20-cloudflare-usage-guard-design.md`
  - Cloudflare R2使用量ガード設計。
- `21-cloudflare-f5-defense-design.md`
  - F5連打・アクセス負荷対策設計。
- `30-dialogueassembler-mobile-pdf-export-spec.md`
  - DialogueAssemblerのスマホ向けPDF出力メモ。

## 履歴

- `99-work-progress-log.md`
  - 作業履歴と検証ログ。通常運用では最後に参照する。
