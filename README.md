# Tsukuyomi Reader

縦書き読書を主目的にした PWA リーダーです。
現在は Reader 本体の主要機能が一通りそろっており、正式リリース前の仕上げと配布形態の整理を進める段階です。

## 現在の実装
- `TXT` 読み込み
  - `utf-8` / `shift_jis` の判定と手動選択に対応
- `HTML` 読み込み
  - 章構造がなくても `section.chapter` を補完
- `EPUB` 読み込み
  - spine 解決
  - nav / ncx / 見出しからの目次生成
  - 章内リンクの補正
  - 画像などアセットの blob URL 化
- `PDF` 読み込み
  - 固定レイアウト作品として表示
  - DialogueAssembler等のバブルチャットPDF向け
- バックアップ `ZIP` の保存 / 復元
- Reader 表示
  - `paged` / `scrollx` / `scrolly`
  - 縦書き / 横書き / auto 判定
  - 文字サイズ、行間、字間、折り返し幅、テーマ切替
  - 原稿用紙 400 字目安プリセット
  - 章一覧ジャンプ
  - Windows ホイールページ送り
- 状態保持
  - 表示設定の保存
  - 読書位置の保存
  - 前回の本のキャッシュ復元
- PWA
  - Service Worker による静的アセットのキャッシュ
- 立ち読みモード
  - `config/site-config.json` による開発版 / 配布版の切替
  - `/api/books` または `books/manifest.json` からの作品一覧表示
  - manifest経由のEPUB fetch
  - ローカル読込 / ZIP書き出しの非表示
  - 通常コピー、右クリック、ドラッグ保存の抑制
  - copyright表示
- 管理メニュー
  - `admin.html` から作品アップロード
  - 管理トークン方式と管理者メールOTP方式に対応
  - Cloudflare Pages Functions + R2 によるEPUB / TXT / PDF / 表紙保存
  - 管理APIから公開 / 非公開を切替
  - R2使用量ガードによる新規公開停止 / 公開一時停止
  - 公開APIの簡易IPレート制限
  - D1による匿名読書ログ

## マニュアル

- [マニュアル索引](docs/00-manual-index.md)
- [立ち読みモード 初期設定チェックリスト](docs/01-tachiyomi-initial-setup.md)
- [立ち読みモード 更新側マニュアル](docs/02-tachiyomi-update-manual.md)
- [立ち読みモード 読者向けマニュアル](docs/03-tachiyomi-reader-manual.md)
- [立ち読みモード 実機確認チェックリスト](docs/04-tachiyomi-device-checklist.md)
- [限定レビュー認証クイックガイド](docs/05-limited-review-auth-quick-guide.md)
- [限定レビュー運用資料](docs/06-limited-review-operation.md)
- [Cloudflare Access調査メモ](docs/07-cloudflare-access-investigation.md)
- [管理者認証と復旧設計](docs/08-admin-auth-recovery-design.md)
- [ログ確認早見表](docs/09-log-coverage-guide.md)
- [Reader Analytics設計](docs/10-reader-analytics-design.md)
- [Cloudflare R2 Usage Guard設計](docs/20-cloudflare-usage-guard-design.md)
- [Cloudflare F5 Defense設計](docs/21-cloudflare-f5-defense-design.md)
- [DialogueAssembler スマホ向けPDF出力メモ](docs/30-dialogueassembler-mobile-pdf-export-spec.md)
- [作業進捗ログ](docs/99-work-progress-log.md)

## ディレクトリ
- `index.html`
  - エントリーポイント
- `templates/`
  - `library.html`, `reader.html`
- `js/`
  - `app.js`: 画面遷移と状態保持
  - `library.js`: 読み込み画面
  - `reader.js`: Reader 本体
  - `normalize-txt.js`: TXT 整形
  - `normalize-epub.js`: EPUB 整形
  - `storage.js`: ZIP 入出力
- `css/`
  - 共通 / Reader / 縦組み用スタイル

## 現在の制約
- 本文は全文を一括で DOM に流し込む方式です
- 大容量書籍向けの分割描画や仮想化は未対応です
- JSZip は配布物に同梱しています

## 正式リリース前の方針
- 開発版と立ち読み用配布版を `config/site-config.json` で切り替えます
- 立ち読み用では `books/manifest.json` に登録された公開作品だけを表示します
- 作品データは `books/works/`、表紙画像は `books/covers/` に置きます
- 汎用版では `allowLocalImport` / `allowExport` を有効に戻し、外部ファイル読み込みやZIP保存を使います

## 立ち読みモードメモ
- Web管理を使う場合、作品一覧は `/api/books` から取得します
- API未設定時は `books/manifest.json` にフォールバックします
- `published: true` の作品だけがLibraryに表示されます
- EPUBはmanifestの `path` からfetchし、既存のEPUB正規化処理へ渡します
- 配布用ではローカルファイル読込とバックアップZIP保存を非表示にします
- 配布用では通常コピー、右クリック、ドラッグ保存を抑制します
- Surface Goなどの別環境では、原則として `admin.html` の管理メニューから更新します
- `update_books.bat` はAPIを使わない予備運用向けです

## 限定レビュー運用メモ
- 賞応募候補作品は、公開版Readerには置かない方針です
- 友人・編集者候補に読んでもらう場合は、公開版とは別の限定レビュー版Readerを用意します
- 限定レビュー版はCloudflare Access等でサイト/API全体を認証必須にします
- Cloudflare Accessが使えない場合は、`TSUKUYOMI_REVIEW_PASSWORD_AUTH=true` を設定し、Reader内のメールアドレス+パスワード認証を使います
- Reader内パスワード認証では、管理画面の `限定レビュー認証管理` から仮IDを作成し、メールアドレスと紐づけてパスワードを発行・無効化できます
- 読者はメールアドレスまたは仮IDとパスワードでログインできます
- Reader内パスワード認証は、ログイン総当たり対策、30日パスワード期限、同時利用検知、限定レビュー時の本文キャッシュ抑制を行います
- 認証振り返りでは、有効IDのPW失敗やロックなどの意味があるイベントだけを詳細化し、未知IDへの試行は件数集計だけにします
- `reviewOnly` や `awardCandidate` のようなフラグだけでは保護にならないため、未認証URLで読める状態にしないことを優先します
- 限定レビュー版では、必要に応じてAccess認証済みメールアドレスを読書ログへ管理用に紐づけられます
- Reader内パスワード認証のメールアドレスを読書ログへ紐づける場合は、`TSUKUYOMI_REVIEW_PASSWORD_IDENTITY_ANALYTICS=true` を設定します
- その場合は、閲覧データを読者同士には公開せず、管理側で一元保管・集計して文芸分析目的に使うことを案内文に明記します
- `TSUKUYOMI_REVIEW_ACCESS_SOFT_BLOCK=true` を使うと、管理画面で `閲覧保留` にした相手へ作品一覧を空で返す個別保留ができます
- 詳細は [限定レビュー運用資料](docs/06-limited-review-operation.md) を参照します

## 今後の候補
- 大容量書籍向けの分割描画
- 管理画面の削除、並び順変更、プレビュー
- 汎用版への再拡張

## 配布前チェックリスト
- Windows / Android / iPhone で起動し、Library 画面が崩れないこと
- 作品一覧で長いタイトルや説明が枠からはみ出さないこと
- 内部ヘルプと Reader の表示設定が最後までスクロールできること
- 本文フォント `system / 明朝 / ゴシック` の切替が効くこと
- 縦書き EPUB / 横書き EPUB の初期文字組みが大きく外れないこと
- 設定保存後に再度開き、表示設定と進捗が復元されること
- 配布用ではローカル読込とバックアップ ZIP 保存が表示されないこと
- 管理画面から EPUB / TXT / PDF / 表紙をアップロードできること
- 管理画面から公開停止と再公開ができること
- 「再起動（リロード）」と「強制同期（キャッシュ破棄）」後も正常起動すること

## 自家製 EPUB 生成チェックリスト
- 本文中の `｜漢字《ルビ》` と `漢字《ルビ》` を、EPUB 化の時点で `<ruby><rt>` へ変換していること
- `…` `‥` `―` `—` など、縦組みで見え方が崩れやすい記号の扱いを確認していること
- `［＃...］` `〔以下...〕` など青空注記を本文へ生で残すのか、注釈化するのか、除去するのか方針を決めていること
- `-------------------------------------------------------` のような ASCII 罫線を本文へ残さず、見出しや区切り要素へ変換していること
- 前付け、本文、底本情報、入力者注を同じ本文段落に混ぜず、セクションとして分けていること
- `<br>` 連打で見た目を作らず、段落は `<p>`、見出しは `<h1>` など意味に沿った要素へ落としていること
- `html` / `body` / 本文コンテナに縦書き指定を入れる場合、章内の一部だけ横組みにしたい箇所へ逃げ道があること
- `font-family` を固定しすぎず、端末標準の和文縦組み字形を殺していないこと
- OPF の `spine`、`nav`、`ncx`、`page-progression-direction` が本文構造と矛盾していないこと
- 画像、CSS、フォントなどの相対パスが EPUB 内で閉じていて、外部 URL に依存していないこと
- 生成後に Windows / Android で開き、ルビ、三点リーダー、ダッシュ、句読点、段落頭が崩れていないことを確認していること
