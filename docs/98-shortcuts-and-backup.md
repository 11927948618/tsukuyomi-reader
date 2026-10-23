# Readerの入口とバックアップ（2026-10-23）

## 添付された旧Windowsショートカットの調査

`.lnk` の文字列と参照先を読み取った。ショートカットやBATは実行していない。

- `TsukuyomiReader - ショートカット.lnk`: Drive内の「過去／旧Drive正本_v0.1.168_20260907」のフォルダを参照。現在の本番Readerとは別。履歴を見る用途に限り、ここから現在の作業や公開を再開しない。
- `☆backup_push.bat - ショートカット.lnk`: PCのVSCode作業フォルダ内のBATを参照。参照先ファイルがPCに今も存在するか、その内容が最新かはこの環境からは確認できない。
- 現在のmainにある同名BATはPowerShell 7経由で `backup_push.ps1` を実行。作品マニフェスト生成、確認後の版番号更新、`git add -A`、commit、`git push -u origin main` を行う。ローカルの変更全体をGitへ送る処理で、R2の本文・表紙・カタログのバックアップではない。旧作業コピーからの実行は推奨しない。

## 通常使う入口

- 本番Reader: https://tsukuyomi-reader-tachiyomi.pages.dev/
- 本番管理画面: https://tsukuyomi-reader-tachiyomi.pages.dev/admin.html
- ソースと変更履歴: https://github.com/11927948618/tsukuyomi-reader
- コミット済みmainのソースZIP: https://github.com/11927948618/tsukuyomi-reader/archive/refs/heads/main.zip

これらを開くだけの `.url` は端末固有のDriveパス、Python、PowerShell、古い版に依存しない。ログイン情報や管理トークンをURLに入れない。

## 作品のバックアップ

本番管理画面で対象を「限定レビュー」または「一般公開」に切り替え、作品一覧の「フォルダと一括操作 → まとめて取り込む・バックアップ → 一括バックアップ」を使う。本文・表紙・作者／フォルダ情報がZIPに入る。両区分は別々に取得する。

1回500作品・合計256MB・各ファイル64MBまで。ブラウザ内の読書位置、管理トークン、環境変数、認証・操作ログ、カタログ外のR2ファイルはこのZIPに含まれない。認証・操作ログはそれぞれの「ログ取得」で別に保存する。復元は限定レビュー・非公開、既存IDを上書きしない。

ソースZIPはプログラムのバックアップであり、R2の作品バックアップの代わりにはならない。
