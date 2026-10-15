# 地図ベータのバージョンをコンテンツ一覧へ表示

Reader v0.1.244。認証済みの一覧APIがservice binding経由で配信中の地図のviewer/app.jsを取得し、VERSIONを読み取る。ソースのmainや予定番号を固定表示しない。カードに「学習アプリ・v0.4.6」の形式で表示する。

既存認証の後にのみ問い合わせ、ReaderのCookie・Authorizationは転送しない。タイムアウト・非成功応答・形式不明では番号を捏造せず「バージョン確認できません」とし、起動導線は維持。既存のno-storeを維持。Service Workerキャッシュ名も0.1.244へ進める。地図側が更新されれば一覧の再読み込みで実際の版番号が変わる。

検証：npm test 44件成功。ブラウザで0.4.6・0.4.10・0.4.200・取得不能表示・起動リンクを確認。画像reports/wanwan-catalog-version/preview.png。main反映・Pages配信はこのPRの統合後。
