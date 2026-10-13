# ADR-0004：DBに依存しないAPI入力・復帰・CSV契約

| 項目 | 内容 |
| --- | --- |
| 状態 / 担当 / レビュー | 提案 / natuki53 / FE・BE未割当、DB接点は別調整 |
| 日付 | 2026-10-09 |
| 要件 / 受入 | API-01～05、ACC-01～05、NET-02/04、PWA-01/02、RPT-01～05、SEC-07～10 / AT-001～007、036～038、055～062 |
| Issue / PR | [Issue #7](https://github.com/fespay-team/fespay/issues/7) / [Draft PR #8](https://github.com/fespay-team/fespay/pull/8) |

## 背景・提案

初稿では旧画面の必須更新、Google開始IDと戻り照会、失われたlogin challengeの復帰、CSV列/読取時点、HTTP入力上限が不足していた。DBの完成を待たず共通契約を具体化する。

1. DB不要のclient-policyと契約リビジョンヘッダー。新規CURRENT、既存/v1 READ/RECOVERYを操作別に明示し、更新停止で結果照会・現金完了を止めない。既成立キー/hashを更新で変えず、強制reloadなし。
2. Google公開flow_idを返し短命検証の照会IDと一致。AuthContextに認証段階を追加し、失われたメール202も事前文脈から復帰。Google challengeの製品方針は担当レビューに残し、業務MFAの既存要件を維持。
3. JSON/画像の資源上限、400/413/415/422、値を反射しないfield_errors、HTTP/code/retryable/画面動作をOpenAPI拡張へ保存。
4. SSE/GET世代・dirty再取得、statusを読めないEventSource error、poll復帰/前面制御/更新待機を具体化。
5. CSV列版1・列順・型別数式対策・BOM/CRLF・空結果/分割/partページング/download名。条件は申込時、読取時点は生成開始snapshot_at、期限は全part確定generated_at+24h。売上の発生時/原決済期間をsales_basisで区別し、店舗別/商品数量/注文経路別の内訳を最大100行のsnapshotページで返す。

## 具体値・影響

JSON256KiB/depth32/10,000ノード、multipart5,100,000bytes、画像8,192px/33,554,432画素/1フレーム、再接続1/2/5/10/30秒+jitter、part参照100件/ページはAPI案。5MB/長辺2048、CSV10万行・2job・24h、金銭結果2秒→5秒の既存規約は継承。20秒heartbeat案も維持する。

全更新を旧版で拒否すると現金完了を止める。全更新を許可すると必須改訂を案内できないため、READ/RECOVERY/CURRENTを操作別にし現在認可/MFA/状態を共通に維持する。公開値は環境/物理モデルに依存せずレビューできるが、性能達成を宣言しない。

FE/BE採択・実装試験、Better Auth固定版、デコーダ資源実測と環境設定は残る。物理型/enum/キー/ロック、Outbox再開位置/保持、snapshot/cutoffはDB成果物と後で合わせる。要件/DDL/受入管理表を変更しない。

## 成果物・検証

[OpenAPI](../design/api/openapi.yaml)、[HTTP契約](../design/api/http-contract.md)、[画面復帰](../design/api/client-flows.md)、[CSV契約](../design/api/csv-contract.md)。[設計用検証](../design/api/validation/README.md)を実サービスの認可/金銭/排他/認証/性能試験と区別する。

承認者・日付・PR：未記入。
