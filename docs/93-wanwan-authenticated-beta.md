# 認証付き地図ベータの接続

2026-10-13：未配信の実装。

- 認証付き立ち読み版 `https://tsukuyomi-reader-tachiyomi.pages.dev/` だけに地図を表示する。
- `/api/apps/wanwan` が認証済み利用者へ起動項目を返し、Libraryのコンテンツ一覧に並ぶ。公開Reader・未認証・接続準備中には表示しない。
- `/apps/wanwan/` はReaderへ戻る操作と地図iframeを表示。配下の全資産を既存の読者認証で保護する。
- 公開URLのない別Worker `wanwan-map-beta` へ、Pagesのservice binding `WANWAN_BETA` を接続する。ReaderのCookieや認証情報は転送しない。
- 既存の認証・作品API・登録済み作品の公開範囲は変更しない。認証設定やbindingが未設定のときは拒否する。
- map用資産はService Workerキャッシュに保存しない。オンラインベータをログアウト後にキャッシュから起動しない。成績は既存wanwan:*キーを保持。
- 地図のコード・教材・配信用認証はこのReaderリポジトリへコピーしない。

既存Nodeテスト34件＋認証ゲート7件が合格。ローカル統合では一覧→地図→回答→再読込後の履歴保持→戻る、未認証/ログアウト後のHTML・データ拒否を確認。実環境の接続と実機確認は未実施。

反映前に、地図Workerが公開URLなしで配信済みであること、認証付きPagesのbinding、既存読者認証が有効であることを確認する。main反映は既存Pages自動配信を起こすので、管理者の確認したタイミングで行う。
