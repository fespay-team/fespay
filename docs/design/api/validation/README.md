# API契約の静的検証

状態：設計用チェック。担当：natuki53。更新日：2026-10-09。
[Issue #7](https://github.com/fespay-team/fespay/issues/7) / [Draft PR #8](https://github.com/fespay-team/fespay/pull/8)。

## 再実行

リポジトリのルートから実行する。アプリの依存関係とは別の一時環境を使う。requirements.txtは検証で利用した版を固定したもので、アプリの技術選定ではない。

```sh
python3 -m venv /tmp/fespay-api-contract-check
/tmp/fespay-api-contract-check/bin/python -m pip install -r docs/design/api/validation/requirements.txt
/tmp/fespay-api-contract-check/bin/python docs/design/api/validation/validate_contract.py
/tmp/fespay-api-contract-check/bin/python docs/design/api/validation/validate_lint.py
npx --yes @redocly/cli@2.60.0 lint docs/design/api/openapi.yaml
git diff --check
```

スキーマはJSON Schema 2020-12として、UUID/日時formatも検証する。YAML重複キー、全ローカル参照、operationIdの一意性、pathパラメータ、参照要件/受入ID、資料リンク、全58論理API ID、更新操作のCookie/CSRF宣言、62キー付き操作のEVENT/GLOBAL別照会網羅も確認する。認証/秘密発行などキー記録を使わない操作は用途・単回消費の契約を確認する。292ケースの形式/状態確認はvalidate_contract.pyとcontract_cases.pyへ保存。SSE例のevent/data/idを分解し、dataのJSON型とresource.changedのUUIDも確認する。

## 確認する異常系

| 対応要件 / 受入試験 | 静的な確認 |
| --- | --- |
| MNY-02 / AT-023/024 | 0と正数の区別、30/31桁、先頭ゼロ・符号・小数・指数・JSON number拒否、安全整数超過の文字列保持 |
| TX-05 / AT-037/038 | 成立/最終拒否/処理中/結果不明の必須・禁止フィールド。コマンド成功に中間リソースを返せるが、未確認結果へ成功リソースを混在させない |
| CSH-01～04 / AT-042～044 | 本人承認の額・元区分・版・true確認、交付済みと未交付確認の混在拒否、状態ごとの拘束/交付/解放ID必須 |
| REF-01～03 / AT-045～047 | 金額/商品数量入力の分離、単価・返金先・支払者の入力拒否、未完了返金へ成立取引ID/返金先を返さない |
| ACC/SEC/STF / AT-001～007/011～016 | PW境界、safe return_path、認証手段の型、TOTP/code、grantのrole/shop/register組合せ |
| PAY/CHG/TRF / AT-025～040 | A/B/C入力の分離、本人承認true、現金受領/返却状態と成立ID、固定譲渡入力 |
| INV/ORD / AT-046/049～053 | 再販戻しの元明細/true確認、32bit/50明細/数量境界、受取証明、全取消の返金参照 |
| RPT / AT-055～057 | 集計31桁超と負純額、CSV READYの必須part/件数/期限、期限切れのdownload参照禁止 |
| NET-04 / AT-037/062 | 変更可能リソースのSSE version必須、秘匿対象の存在を理由に含めない再同期型 |

静的チェックはサーバーの認可・残高計算・元決済との一致・返金累計・同時実行・通信断・実機・性能を検証しない。特に、同じ元明細IDの重複、既返金累計超過、現在の担当/MFA、調査解決証跡、停止中の操作許可は実装後の受入試験で確認する。受入管理表を合格へ更新する根拠にしない。

## ライセンス・Google認証・更新通知の検証

既知だった4警告を次の方法で解消した。Redocly 2.60.0の結果はエラー0・警告0・無視0。[redocly.yaml](../../../../redocly.yaml)はrecommendedを継承し、[FesPayプラグイン](fespay-plugin.cjs)を読み込む。ignoreファイルは使用しない。

| 対象 | 方針と検証 |
| --- | --- |
| 公開条件 | 当面は[権利留保](../../../../LICENSE)。OSS利用許諾は付与しない。OpenAPIのlicense.nameと独自識別子LicenseRef-FesPay-All-Rights-Reservedを記載。README・権利表示との一致も検証。info-license/info-license-strictはerror |
| Google callback | ブラウザー遷移専用GETの成功は302。組込みoperation-2xx-responseをFesPayのoperation-success-responseへ置き換え、全操作で2xxを必須とし、この正確なパスのGETだけ302を要求する。operationId、必須LocationのReturnPath参照、Cache-Control: no-storeも検証。302欠落や形式だけの200追加はerror |
| SSE更新通知 | HTTPのtext/event-streamはstringのまま維持。x-event-data-schemasをSchemaの型参照として登録し、参照解決・構造・未使用検出の対象にする。ResourceChanged/ResyncNoticeを標準のJSON応答として偽装しない。no-unused-componentsはerror |

validate_lint.pyは同じCLIと設定で正本のエラー/警告/無視がすべて0であることを確認する。続いて一時ファイルだけを変更し、通常APIの200欠落・302置換、callbackの302欠落・200追加・Location欠落/任意文字列化・no-store欠落、SSEの参照切れ・使用参照削除、別の未使用型、license欠落の11件がすべてエラーになることを確認する。検証途中のAPI仕様をリポジトリへ書き戻さない。

型拡張・専用ルールは[Redoclyの型拡張](https://redocly.com/docs/cli/custom-plugins/extended-types)と[ルール作成](https://redocly.com/docs/cli/custom-plugins/custom-rules)の仕組みを利用する。公開条件の記述には[OpenAPI 3.1のLicense Object](https://spec.openapis.org/oas/v3.1.0.html#license-object)を用いる。権利留保は当面の公開方針で、将来のOSS採用はチームの決定として別途反映する。
