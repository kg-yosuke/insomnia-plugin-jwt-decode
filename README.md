# insomnia-plugin-jwt-decode

[Kong Insomnia](https://insomnia.rest/) で JWT（JSON Web Token）の中身を確認するためのカスタムプラグインです。

- Bearer Token や Authorization ヘッダーに入っている JWT
- **OAuth 2.0 で取得した Access Token / Identity Token**

これらを、外部サイトに貼り付けずに Insomnia の中でデコードできます。

## なぜ作ったのか

API が 401 / 403 を返したとき、原因はトークンの中身にあることがよくあります。

- `scope` が足りない
- `aud`（宛先）が違う
- `exp`（有効期限）が切れている

JWT は Base64URL でエンコードされているだけなので、デコードすれば中身はすぐに分かります。ただ、そのために jwt.io などの外部サイトへトークンを貼り付けるのは、本番のトークンを社外に出すことになり、望ましくありません。

このプラグインは、デコードをすべて手元の Insomnia の中で行います。
また OAuth 2.0 の画面で取得したトークンは、Insomnia の内部に保存されているため、プラグインから直接読み出してデコードできるようにしました。

## 機能

| 機能 | 使い方 | 対象 |
|---|---|---|
| 右クリック「Decode JWT」 | サイドバーのリクエストの「…」→ Decode JWT | Bearer Token / Authorization ヘッダー / クリップボードの JWT |
| テンプレートタグ `OAuth2 JWT` | 入力欄で右クリック → OAuth2 JWT | OAuth 2.0 で取得した Access Token / Identity Token |
| テンプレートタグ `JWT Claim` | 入力欄で右クリック → JWT Claim | 指定した JWT から任意のクレームを取り出す |

右クリック「Decode JWT」は、`alg` / `kid` / `sub` / `iss` / `aud` / `scope` / `exp` と残り時間をダイアログに表示し、payload 全体をクリップボードにコピーします。

## インストール

Insomnia のプラグインフォルダにこのリポジトリを置きます。

```bash
cd ~/Library/Application\ Support/Insomnia/plugins   # macOS の場合
git clone https://github.com/kg-yosuke/insomnia-plugin-jwt-decode.git
```

プラグインフォルダは、Insomnia の **Preferences → Plugins → Reveal Plugins Folder** でも開けます。
置いたあと、同じ画面の **Reload** を押すか、Insomnia を再起動してください。

## 使い方

### 1. Bearer Token をデコードする

1. リクエストの Auth を **Bearer Token** にして、TOKEN 欄に JWT を入れます。
2. サイドバーでリクエストの「…」→ **Decode JWT** を選びます。

### 2. OAuth 2.0 で取得したトークンをデコードする（テンプレートタグ）

1. Auth を **OAuth 2.0** にして **Fetch Tokens** でトークンを取得します。
2. Headers タブで新しいヘッダーを追加し、値の欄で**右クリック** → **OAuth2 JWT** → **Access Token**（または Identity Token）を選びます。
3. 入ったタグをクリックすると編集画面が開き、**Live Preview** にデコード結果が表示されます。

| 設定 | 選択肢 |
|---|---|
| Token | Access Token / Identity Token |
| Output | Payload (JSON) / Header (JSON) / Claim / Raw token |
| Claim | Output が Claim のときに取り出すクレーム名（例: `scope`, `sub`, `exp`） |

確認が終わったら、そのヘッダーは無効化（チェックを外す）か削除してください。有効のままだと、デコード結果がヘッダーとして送信されます。

逆に、`Claim` で `sub` を取り出すタグをヘッダーに置いておけば、トークンを取り直しても最新のユーザー ID を自動で送れます。

認証をフォルダから継承している場合は、フォルダ側に保存されたトークンを読みます。

### 3. OAuth 2.0 のトークンを右クリックでデコードする

右クリックのメニュー（Request Action）からは、Insomnia のプラグイン API の制約で OAuth 2.0 のトークンを直接読めません。そのため、クリップボードを使います。

1. Auth タブの **Access Token** 欄をコピーします（`Cmd+A` → `Cmd+C`）。
2. サイドバーでリクエストの「…」→ **Decode JWT** を選びます。

## 外部の IdP なしで試す

OAuth 2.0 の Access Token 欄は手で書き換えられるので、ダミーの JWT を貼れば試せます。
次のコマンドで、ダミーの JWT をクリップボードにコピーできます（署名は偽物です）。

```bash
node -e 'const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");process.stdout.write(b({alg:"RS256",kid:"test-key"})+"."+b({sub:"user-123",iss:"https://auth.example.com",aud:["orders-api"],scope:"orders:read orders:write",exp:Math.floor(Date.now()/1000)+3600})+".sig")' | pbcopy
```

Auth を OAuth 2.0 にして、画面下の **Access Token** 欄（ACCESS TOKEN URL 欄ではありません）に貼り付けてください。

## 注意

- **署名の検証はしません。** 中身を読むためのデコードだけです。トークンが正しいかどうかの判断には使えません。
- JWT ではない、ランダムな文字列のアクセストークン（不透明トークン）はデコードできません。その場合は Identity Token を試してください。
- Insomnia 13.4.0 で動作を確認しています。設定でプラグインのサンドボックス（`pluginSandboxEnabled`）を有効にしている場合の動作は確認していません。
