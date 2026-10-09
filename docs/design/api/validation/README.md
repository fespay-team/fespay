# API契約の静的検証

状態：設計用チェック。担当：natuki53。更新日：2026-10-09。
[Issue #7](https://github.com/fespay-team/fespay/issues/7) / [Draft PR #8](https://github.com/fespay-team/fespay/pull/8)。

## 再実行

リポジトリのルートから実行する。アプリの依存関係とは別の一時環境を使う。requirements.txtは検証で利用した版を固定したもので、アプリの技術選定ではない。

```sh
python3 -m venv /tmp/fespay-api-contract-check
/tmp/fespay-api-contract-check/bin/python -m pip install -r docs/design/api/validation/requirements.txt
/tmp/fespay-api-contract-check/bin/python docs/design/api/validation/validate_contract.py
npx --yes @redocly/cli@2.60.0 lint docs/design/api/openapi.yaml
git diff --check
```

スキーマはJSON Schema 2020-12として、UUID/日時formatも検証する。YAML重複キー、全ローカル参照、operationIdの一意性、pathパラメータ、参照要件/受入ID、資料リンク、更新操作のCookie/CSRF/冪等キー宣言とキー照会operationの網羅も確認する。

## 確認する異常系

| 対応要件 / 受入試験 | 静的な確認 |
| --- | --- |
| MNY-02 / AT-023/024 | 0と正数の区別、30/31桁、先頭ゼロ・符号・小数・指数・JSON number拒否、安全整数超過の文字列保持 |
| TX-05 / AT-037/038 | 成立/最終拒否/処理中/結果不明の必須・禁止フィールド。コマンド成功に中間リソースを返せるが、未確認結果へ成功リソースを混在させない |
| CSH-01～04 / AT-042～044 | 本人承認の額・元区分・版・true確認、交付済みと未交付確認の混在拒否、状態ごとの拘束/交付/解放ID必須 |
| REF-01～03 / AT-045～047 | 金額/商品数量入力の分離、単価・返金先・支払者の入力拒否、未完了返金へ成立取引ID/返金先を返さない |
| NET-04 / AT-037/062 | 変更可能リソースのSSE version必須、秘匿対象の存在を理由に含めない再同期型 |

静的チェックはサーバーの認可・残高計算・元決済との一致・返金累計・同時実行・通信断・実機・性能を検証しない。特に、同じ元明細IDの重複、既返金累計超過、現在の担当/MFA、調査解決証跡、停止中の操作許可は実装後の受入試験で確認する。受入管理表を合格へ更新する根拠にしない。

Redoclyの既知警告3件は、OSSライセンス未選定のlicense欠落と、SSE dataの2スキーマを拡張参照しているためのunused扱い。構造エラーや新しい警告は別途確認する。
