# 管理画面の第一段階（Issue #30）

管理共通枠とM01・M02のfixture実装です。正式なAPI統合・認可・MFA・金銭処理・受入完了を示しません。通常のWeb入口は準備中画面のままです。

## 確認方法

Node.js 24 / npm 11、リポジトリルートで依存導入済みの開発環境を使います。以下のコマンドでVite dev serverを起動し、`http://127.0.0.1:5173/management-demo.html`を開きます。

```powershell
npm.cmd exec --workspace @fespay/web -- vite
# http://127.0.0.1:5173/management-demo.html

npm.cmd run typecheck
npm.cmd run build
npm.cmd test
npm.cmd run test:management --workspace @fespay/web
```

`management-demo.html`は開発確認用の独立したfixture入口です。通常のproduction buildには含めず、stagingの配信対象にしません。既存の`npm.cmd run dev`でも同じURLから開けます。Docker localでも開発用Vite経由でアクセスできます。通常の`/`は変更していません。全画面でDEMOを明示し、実API通信・DB・実認証・実金銭を使用しません。

確認用データで、主催者（grant兼務）・運営担当・店舗管理者・レジ担当・権限解除、長い名称/金額、0円、負の売上純額、未解決現金ケース、店舗状態/受付設定/緊急停止、loading/empty/errorを切り替えられます。未実装の業務画面は権限に応じてナビに表示しますが操作できません。主催者はナビの「イベント設定」からM02を開けます。M02専用fixtureで保存成功、片方だけの拒否、版の競合、機能依存、初回チャージ後の保護、確認中、結果照会障害、認証・認可・取得エラーを確認できます。

## 構造・契約

- `contracts.ts`: 採択済みOpenAPIの必要部分のみのwire DTO。共通契約パッケージを所有しません。
- `model.ts`: 現在の所有/active grant/permissionによる表示判定、選択検証、M01 ViewModel、金額表示。DTOに`OWNER`/`isOwner`/`currentRole`/`total_balance`を追加しません。
- `fixtures.ts` / `adapter.ts`: 架空データとメモリ内adapter。カーソルを最後まで読み、表示対象外の業務データを返さないfixtureです。API認可の代用ではありません。
- `useManagement.ts`: キー・AbortSignal・世代番号で古いイベント/主体の応答を排除します。イベント変更時に店舗を直ちに解除し、取得後も所属を検証します。金銭処理は存在しません。
- `components/` / `pages/OrganizerHome.tsx`: 管理レイアウト、ナビ、選択、状態UI、M01。
- `settingsModel.ts` / `settingsAdapter.ts` / `settingsState.ts` / `pages/EventSettings.tsx`: M02専用の入力変換・全項目DTO・メモリ内更新/結果照会・編集状態・案内/業務設定フォーム。
- `ManagementDemo.tsx` / `demo/main.tsx`: 管理機能専用の確認入口。全体routing/provider/AuthContext/fixture切替とは分離しています。
- `tests/`: 既存の`tsx`とNode標準`node:test`による管理機能のテスト。全体テスト設定や新しいフレームワークは追加しません。

使用するoperationIdは`listMyEvents`（OWNED/STAFFED）、`listGrants`（MINE）、`getEventDashboard`（EVENT、shop_idなし）、`listEventShops`、`listEventSuspensions`、`getReconciliation`です。M01は主催者に限定します。他の業務担当には表示資格に応じた管理対象とナビを表示し、主催者の主要指標を取得・表示しません。所有の根拠は`listMyEvents(scope=OWNED)`であり、grant roleとは別です。

売上純額は`net_sales_amount`を表示し、対象期間を断定しません。残高3区分は同一Reconciliation DTOの`available_amount`/`held_amount`/`refund_only_amount`を保持し、総額のみViewModelで任意精度整数として導出します。拘束・返金専用を使用可能額には加えません。DashboardとReconciliationの`checked_at`はそれぞれ正本確認時刻として扱い、集計期間や両APIの同一snapshotを意味させません。

店舗の`status`、`accepting_new_payments`、SHOP緊急停止、EVENT緊急停止は別々に表示します。停止中店舗の統一件数や精算専用再開の実施状態を導出しません。

根拠は採択済み[要件書](../../../../../docs/requirements/event_payment_requirements.md)のROL-01/03/04/06、UI-05/06/07/08、CFG-03/05、LED-02および終了時の照合式、RPT-01、[基本設計](../../../../../docs/design/basic-design.md)のM01、[詳細設計](../../../../../docs/design/detailed-design.md)第4/6章、[OpenAPI](../../../../../docs/design/api/openapi.yaml)、[共通規約](../../../../../docs/design/api/common/conventions.md)です。AT-010/015/016/020/055/068に関する表示/選択の一部をfixtureで確認し、API認可や金銭処理を含むAT全体の合格にはしません。

## デザインと後続の境界

[未マージPR #25](https://github.com/fespay-team/fespay/pull/25)の`84a5dd5`にある白ベース、青〜水色/紫、角丸カード、薄い境界線、控えめなshadow、badge、入力・focus表現を参考に、PC主体の管理画面として構成しました。コードのimport・依存ライブラリ・業務ロジックは流用していません。`prototype/`や設計書は変更しません。

Issue #28と調整する全体App/router/provider/AuthSession・AuthContext・共通型・fixture切替・フロント全体テスト基盤は作成しません。今回はすべて管理機能内に閉じ、sharedへの昇格は行いません。

## M02の保存境界

`getEventGuide` / `updateEventGuide`と`getEventSettings` / `updateEventSettings`を使用します。案内と業務設定は別フォーム・別保存・別状態です。全必須項目と文字列のexpected_version、空白以外のreasonを送ります。日時入力はAsia/Tokyoとして明示変換し、UTC ISO 8601で送ります。参加パスワードはKEEP/SET/CLEARを送信し、GETと保存後のフォームに秘密を復元しません。

202、RESULT_UNKNOWN、通信結果不明・503は「確認中」として元のIdempotency-KeyとoperationIdを保持します。`getMyTransactionResultByKey`で照会し、SUCCEEDEDの参照先と最新GETを確認してから保存済みにします。PENDING/UNKNOWNや照会エラーでは新しい要求を作りません。競合時は編集内容を保持して最新の正本と比較し、利用者が基準版を更新してから再保存します。画面内のイベント切替でもイベントごとの編集・確認中の要求を保持します。ブラウザー再読込・主体fixture変更でメモリ内データは初期化されます。

初回チャージ後の保護と機能依存はfixture側の拒否として確認し、FEの入力検証や表示資格を最終認可・業務判断にしません。実API・MFA・公開メール所有確認の統合は別途必要です。

未解決の契約差異として、updateEventSettingsの説明はFEATURE_DEPENDENCYを409とし、共通x-error-codesは422としています。fixtureは422を使い、画面はHTTP statusではなくcodeを識別します。案内版と設定版の相互更新の詳細は未確定であり、fixtureで原子的保存や版の連動を仮定しません。M01の売上期間、停止中店舗の定義、実APIへの結合と最新所有/権限の供給も別途確認が必要です。
