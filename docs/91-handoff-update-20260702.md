# TsukuyomiReader 引継ぎ更新メモ

作成日: 2026-07-02

この資料は `90-handoff-20260701.md` 以後の更新差分です。前回資料を読んだ上で、Admin管理画面とモバイルアップロードまわりの追加事項だけ確認してください。

## 最新状態

- 公開版バージョン:
  - `0.1.167`
- `js/version.js` の識別子:
  - `admin-mobile-upload-file-rewrap`
- 前回引継ぎ後の主なコミット:
  - `be10128 Improve admin upload error diagnostics`
  - `848eff1 Show admin build version`
  - `1a9e670 Rewrap admin upload files before submit`
- 公開版確認:
  - `https://tsukuyomi-reader-tachiyomi.pages.dev/js/version.js?deploy=0.1.167`
  - `0.1.167` 反映済み。

## 発生した問題

Admin管理メニューからスマホChromeでTXT作品をアップロードすると、保存時に以下のようなエラーが出ました。

```text
Failed to fetch
```

その後、診断メッセージ追加により以下の形で見えるようになりました。

```text
保存に失敗しました: 通信が途中で切断されました。
API: POST /api/admin/books。
時刻: 2026-07-02T00:52:36.898Z。
VPN/回線、Cloudflare Pages Functionsログを確認してください。
選択ファイル合計: 25.21 KB。
```

重要点:

- ファイルは約 25KB で、Cloudflare のアップロードサイズ上限では説明できません。
- `GET /api/admin-auth/status` は `200`。
- `POST /api/admin/books` もファイルなし未認証では `401` を返したため、Functions の経路自体は生きていました。
- 既存の作品一覧表示もできていたため、管理画面全体やR2読み取りではなく、スマホChromeのファイルPOST部分が疑わしい状態でした。

## 原因推定

原因はほぼ以下です。

スマホChromeで `input type="file"` から選んだ `File` を、そのまま `FormData` に入れて `fetch()` 送信すると、ファイル実体がAndroid側の一時URI、外部ストレージ、ファイル管理アプリ、Drive、Downloadsなどに依存したまま送信されることがあります。

この状態でmultipart送信中に読み出しストリームが切れると、サーバーへJSONエラーが届く前にブラウザ側で `TypeError: Failed to fetch` になります。

今回、送信前にファイルを `arrayBuffer()` で読み込み、ブラウザ内メモリ上の新しい `File` に詰め直したところ保存できました。

したがって、R2やCloudflareのサイズ制限ではなく、以下の相性問題と見ています。

```text
Android Chrome
+ input type="file"
+ multipart fetch
+ ファイル選択元の一時URI/外部ストレージ
```

## 実装した対策

対象:

- `js/admin.js`

保存時の処理を以下の順に変更しました。

1. 元の `FormData(bookForm)` を作る。
2. `bookFile` と `cover` の合計サイズを計算する。
3. 送信前に `prepareUploadFormData()` を通す。
4. `File` なら `arrayBuffer()` で読み込む。
5. `new File([buffer], value.name, ...)` で詰め直す。
6. 新しい `FormData` を `fetch("./api/admin/books", ...)` へ渡す。

実装上の要点:

```js
const buffer = await value.arrayBuffer();
formData.append(key, new File([buffer], value.name || "upload.bin", {
  type: value.type || "application/octet-stream",
  lastModified: value.lastModified || Date.now()
}));
```

これにより、スマホ側のファイル選択元に依存したストリーム送信ではなく、アプリが読み込み済みの安定したBlobを送る形にしています。

## 追加した診断

対象:

- `functions/api/admin/books/index.js`
- `js/admin.js`

### サーバー側

- `context.request.formData()` の読み取り失敗をJSONエラー化。
- R2アップロード失敗をJSONエラー化。
- R2アップロード失敗時は管理操作ログへ以下を残す。

```text
type: book-save-failed
reason: r2-upload-failed
details:
  message
  bookFileSize
  coverSize
```

注意:

通信がブラウザ側で切れてFunctionsに届かない場合、このログは残りません。その場合は画面上の時刻とCloudflare Pages Functionsログで照合します。

### クライアント側

`Failed to fetch` をそのまま出さず、以下を表示するようにしました。

- API名: `POST /api/admin/books`
- 発生時刻: ISO形式
- 選択ファイル合計サイズ
- VPN/回線/Cloudflareログ確認の案内

また、ファイル自体が読めない場合は以下の別メッセージになります。

```text
選択ファイルを読み取れませんでした。ファイルを選び直すか、別の保存場所から選択してください。
```

## Admin画面のバージョン表記

対象:

- `admin.html`
- `css/admin.css`
- `js/admin.js`
- `js/version.js`

Admin管理メニューにもバージョン表示を追加しました。

表示例:

```text
v0.1.167 / 2026-07-02 00:00 JST / admin-mobile-upload-file-rewrap
```

今後、ユーザーからAdmin画面スクショが来た場合は、まずこの表記を見て公開版が最新か確認してください。

## 今後の標準TIPS

スマホブラウザでファイルアップロードを扱う機能では、以下を標準ルールにします。

```text
input type="file" で得た File をそのまま fetch に渡さない。
一度 arrayBuffer() で読み込み、Blob/File に詰め直してから FormData へ入れる。
```

波及対象:

- Admin管理メニューの本文アップロード。
- 表紙画像アップロード。
- 将来の `.md` アップロード。
- PDFアップロード。
- TsukuyomiEditor / Scanner / Shot などで、Web画面からスマホのファイルを送る機能。
- Google Drive、Downloads、LINE添付、ファイル管理アプリ経由で選ぶファイル。

波及しないもの:

- R2に既にある本文ファイルの読み込み。
- Reader本文表示。
- 章解析。
- ページ送り。
- localStorage保存。
- PCローカルだけで完結する処理。

## 切り分け手順

同様のアップロード失敗が出たら、次の順で見ます。

1. Admin画面のバージョンが最新か確認する。
2. ファイルサイズを見る。
3. エラー文のAPI名と時刻を控える。
4. Cloudflare Pages Functionsログでその時刻の `POST /api/admin/books` を見る。
5. Functionsログに届いていない場合:
   - ブラウザ/回線/VPN/ファイル選択元の問題を疑う。
6. Functionsログに届いている場合:
   - JSONエラー本文、R2 binding、R2 put、manifest書き込みを確認する。
7. ファイル読み取りエラーの場合:
   - 同じファイルをDownloadsなど別の場所へ保存し直して選び直す。

## 検証済み

- `node --check js/admin.js`
- `node --check js/version.js`
- `node --check functions/api/admin/books/index.js`
- `git diff --check`
- 公開版 `version.js` が `0.1.167` になったことを確認。
- スマホ側で同じTXTアップロードが成功したことをユーザーが確認。

## 次に触る人への注意

- `Failed to fetch` はサーバーが返した業務エラーではありません。ブラウザがレスポンスを受け取れなかった時の低レベルな通信エラーです。
- 小さいファイルでも起きるため、サイズだけで判断しないでください。
- モバイルアップロードを追加する時は `prepareUploadFormData()` と同等の前処理を使ってください。
- エラー表示を削って「保存に失敗しました」だけに戻さないでください。次回の切り分け能力が落ちます。

