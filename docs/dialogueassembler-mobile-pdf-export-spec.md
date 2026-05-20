# DialogueAssembler スマホ向けPDF出力メモ

この資料は、DialogueAssembler側でバブルチャット形式のPDFをTsukuyomiReaderに渡すための出力方針です。

## 目的

DialogueAssemblerで作成した横書き・バブルチャット形式の作品を、TsukuyomiReaderの立ち読み版で固定レイアウトPDFとして読めるようにします。

TXT/EPUBのように本文を抽出して再組版するのではなく、PDF内の吹き出し、余白、ページ内配置、会話テンポを作品表現として保持します。

## 役割分担

DialogueAssembler側:

- スマホで読めるPDFレイアウトを生成する
- 配布用にPDFを圧縮する
- TsukuyomiReaderへ登録しやすいファイル名で出力する

TsukuyomiReader側:

- `format: "pdf"` の作品を一覧に表示する
- PDFを固定レイアウトビューアで表示する
- 立ち読みモードのコピー抑制、右クリック抑制、閲覧ログ方針を流用する

## 推奨出力プリセット

### スマホ縦長

スマホ閲覧を主対象にする場合の推奨です。

```text
ページ比率: 9:16 または 10:16
向き: 縦
余白: 狭め
本文フォント: 標準より大きめ
バブル幅: ページ幅の75%から90%程度
1ページあたりの発話量: 少なめ
```

A4相当のPDFをスマホで縮小表示すると文字が小さくなるため、最初からスマホ縦長ページとして出力する方が安定します。

### タブレット

タブレットやPC閲覧も想定する場合の追加プリセットです。

```text
ページ比率: 3:4 または A5相当
向き: 縦
余白: 標準
本文フォント: 標準からやや大きめ
```

## フォントサイズ

PDFビューア側のズームに頼るより、PDF自体の文字を大きくします。

目安:

```text
標準: 100%
スマホ向け: 120%から140%
小さい注釈: 使いすぎない
```

スマホ向けでは、1ページ内に詰め込む情報量を減らして読みやすさを優先します。

## PDF圧縮

DialogueAssembler側に、出力後の自動圧縮オプションを追加するのが望ましいです。

推奨オプション:

```text
PDF圧縮: しない / 配布用 / 強め
画像品質: 高 / 中 / 低
画像解像度上限: 1440px / 1920px / 2560px
メタデータ削除: on / off
```

元PDFは保管用として残し、TsukuyomiReaderには圧縮済みPDFを登録します。

出力例:

```text
namida_mobile_original.pdf
namida_mobile_compressed.pdf
```

## ファイル命名

R2と管理画面で扱いやすいよう、半角英数字、ハイフン、アンダースコアを基本にします。

例:

```text
dialogue_namida_mobile_v001.pdf
dialogue_namida_tablet_v001.pdf
```

## TsukuyomiReader登録時の想定

管理画面からPDFを本文ファイルとして登録します。

```json
{
  "id": "dialogue-namida",
  "title": "レーンフィールド商会第1部「なみだの行方」",
  "author": "hal the juggernaut",
  "description": "バブルチャット形式の固定レイアウトPDFです。",
  "format": "pdf",
  "path": "/api/books/dialogue-namida/content",
  "cover": "/api/books/dialogue-namida/cover",
  "published": true,
  "updatedAt": "2026-05-20"
}
```

## 確認項目

- Android Chromeで文字が小さすぎない
- iPhoneの新しめのSafari/Chromeでページ全体が表示される
- 1ページ目の読み始めがすぐわかる
- バブル内テキストが潰れていない
- 圧縮後に画像や文字が荒れすぎていない
- 10MBを大きく超える場合は、分冊または圧縮設定を見直す
- PDFをReader側で開いた時、縦書きReaderの段組みに巻き込まれない

## 実装優先度

第1段階:

- スマホ縦長PDFプリセット
- フォントサイズ倍率
- 配布用PDF圧縮

第2段階:

- タブレット向けプリセット
- 画像品質・解像度上限の詳細設定
- 出力後のファイルサイズ表示

第3段階:

- TsukuyomiReader登録用メタデータJSONの同時出力
- 表紙画像の自動生成

## 注意

PDF固定レイアウトは、通常コピー抑制や右クリック抑制をしても、スクリーンショットや通信取得まで完全には防げません。

未発表稿や限定レビュー作品は、TsukuyomiReader側でCloudflare Access等の認証をかけた環境に置きます。
