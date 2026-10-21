# FesPay 画面プロトタイプ

学園祭・地域のお祭り向けのスマートフォン画面を試すための、React・TypeScript・Vite 製の独立したデモアプリです。[画面と操作の説明（別PR #20）](https://github.com/fespay-team/fespay/blob/fc5897fbf9a9e367447941d982d4d6d9f4ecfcca/docs/design/Prototype.md)と[要件定義書](../docs/requirements/event_payment_requirements.md)を参照してください。既存の `apps/web` とは別に起動します。

## 起動

Node.js 20.19 以降の 20 系、または 22.12 以降と npm を用意し、リポジトリのルートから実行します。

```sh
cd prototype
npm ci
npm run dev
```

表示されたローカル URL をブラウザーで開いてください。画面はスマートフォン幅での閲覧を想定しています。ビルド確認は `npm run build` です。PowerShell で `npm.ps1` が制限される場合は、各コマンドの `npm` を `npm.cmd` に置き換えてください。

## 回帰テスト

Node.js 24 以降では、`prototype/` ディレクトリから `npm test` を実行できます。30桁の金額の保存・復元、取引計算、旧形式の保存データからの移行、破損データの扱い、保存失敗、同時送金時の残高を確認します。変更後は `npm test` と `npm run build` の両方を実行してください。

## 主なコードの役割

- [ledger.ts](./src/domain/ledger.ts): デモ口座・取引の型と、チャージ・送金による残高と履歴の計算。
- [demoLedgerRepository.ts](./src/data/demoLedgerRepository.ts): 保存形式の検証と移行、Web Locksによる排他、ブラウザーへの保存。
- [useDemoLedger.ts](./src/hooks/useDemoLedger.ts): 保存データとReactの同期、タブごとの選択口座、取引確定の呼び出し。
- [App.tsx](./src/App.tsx) と [pages/](./src/pages/): 画面の切り替えと、ホーム・支払い・アカウント・案内の表示。
- [FlowDialog.tsx](./src/FlowDialog.tsx) と [useDialogFocus.ts](./src/hooks/useDialogFocus.ts): ダイアログのフォーカス、Escape、背景の操作制限。
- [money.ts](./src/money.ts) と [FittedBalance.tsx](./src/FittedBalance.tsx): 金額の入力検証・書式化と、長い残高の1行表示。

## 試せる操作

- イベント案内、出店一覧、お知らせ、マイページ、デモ用の支払い QR を表示する。
- チャージの照合・金額入力・現金受領確認を画面上で進め、デモ残高と履歴に反映する。
- サンプルアカウントを選んでデモ送金し、送る側と受け取る側の残高・履歴を確認する。マイページでアカウントを切り替えられる。
- 取引履歴を検索・絞り込み、詳細を確認する。マイページからデモデータを初期化する。

## 残高表示の方針

このデモでは、30桁のチャージ後も残高の全桁を同時に1行で表示します。この条件に必要な幅計測は、ホーム・支払い・マイページで使う `FittedBalance` に限定しています。極端に長い残高を狭い画面や200%拡大で表示すると文字は小さくなるため、正式な画面仕様で1行固定を見直す場合は折り返し表示を検討してください。

## 画像

[src/assets/](./src/assets/) の大きなPNGは画像を再編集するための元画像です。画面とビルド出力では、表示サイズ別の軽量JPEGを使います。

## デモの範囲

バックエンドには接続していません。イベント、店舗、アカウント、残高、取引はサンプルです。残高と取引の変更は同じブラウザーの `localStorage` に、選択中のアカウントはタブごとの `sessionStorage` に保存されます。送金はそのブラウザー内のサンプルアカウント間のみで、他の端末や実在する相手には届きません。本人認証、実際の現金受領・決済、サーバー上の台帳、QR のカメラ読み取りには対応していません。画面上の QR を実際の支払いに使用することはできません。
