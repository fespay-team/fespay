# DB設計案の検証

状態：設計用。2026-10-09にPostgreSQL 16.12で104ケース（通常アプリ権限・2接続競合を含む）を実施し、全件合格。運用DBには適用しない。

[レビュー用証跡](review-evidence.json)に、SQL・検証器・API対応のcommitとファイルのSHA-256、API参照版、PostgreSQL image digest、実行結果と104ケースを保存する。[レビュー確認票](../review.md)から承認対象と実装時の残件を確認できる。証跡の対象SQLや検証器を変更した場合は再実行し、証跡も更新する。

## 再実行

リポジトリルートから実行する。Docker起動済み・PostgreSQL 16 imageが必要。検証器は既存container/volumeを触らず、port公開なし/network none/tmpfsの新規containerを作り、finallyで停止・削除する。imageは自動pullしない。アプリ依存ではなく独立検証環境を使う。

```sh
python3 -m venv /tmp/fespay-db-contract-check
/tmp/fespay-db-contract-check/bin/python -m pip install -r docs/design/database/validation/requirements.txt
/tmp/fespay-db-contract-check/bin/python docs/design/database/validation/check_contract.py
python3 docs/design/database/validation/verify_schema.py --image postgres:16-alpine --output /tmp/fespay-db-results.json
git diff --check
```

証跡と同じimageで再実行する場合は `--image postgres@sha256:0780ef0827baebe99b75a7feb7d97110d6ec1e4df3e5c4ec5b9a5143ef90ac3a` を指定する。事前にそのimageを用意する。現在の作業ツリーが証跡の対象ファイルと同一かは次で確認する。

```sh
python3 - <<'PY'
import hashlib, json
from pathlib import Path
evidence = json.loads(Path('docs/design/database/validation/review-evidence.json').read_text())
for file, expected in evidence['validated_files_sha256'].items():
    assert hashlib.sha256(Path(file).read_bytes()).hexdigest() == expected, file
print('証跡の対象ファイルと一致')
PY
```

一致は対象版の確認であり試験の再実行ではない。README・レビュー確認票・証跡自身は対象commit後の説明資料として追加し、ハッシュ対象には含めない。

check_contract.pyはapi-reference.jsonのGit commitからOpenAPIを読み、全171 operationの対応、各対応表/列のCHECKにあるenum語彙、SQL/物理本文/ERの55表一致、レビューで抜けていた列、公開連絡先/払戻し訂正の保存先、相対リンクを検査する。API版更新の確認には `--api-ref origin/api-design` を指定する。参照名は先にcommitへ解決し、その版を照合する。表名/語彙一致をBE実装の完成証明にしない。

追加確認では、訂正の所有列からNOT_REQUIREDだけを除去したSQL/物理本文と、confirmContactEmailの保存先から専用表を除去した対応表を一時コピーで与え、2件とも静的検証が拒否することを確認した。別の表やtriggerに同じ語彙があるだけでは列のenum一致を合格にしない。

verify_schema.pyは新規DBへSQL全体を適用し、通常appロール（schema変更権限なし）で金額の小数/NaN/Infinity/30桁、GLOBAL/EVENTキーの一意/所属、台帳均衡/不変履歴/成立後追加拒否/残高射影、異経路二重決済、B承認待ち/通常・返金専用の共通払戻し枠、元区分/拘束、NULL scope grant、REQUESTED返金先、元注文/単価/合計/返金累計、在庫戻し数量/射影/別キー/2接続競合、32bit在庫、CSV完成期限を確認する。SQLSTATEを照合し、誤った別原因で拒否されるケースを区別する。2接続競合は先行処理が原返金明細をロックした状態で後続を開始し、成立1件・復元累計1個を確認する。

API整合の追加40ケースは、訂正返却4状態/終端/同一案件の解決証跡、公開連絡先の本人/目的/メールbinding/期限/失効/確認と単回消費/差替え/再確認/個人情報削除、注文の店舗/支払者とITEMS/SUCCEEDED/同一Txの関連付け、CORRECTIONの同値履歴を確認する。メール配送・実物の現金返却・handlerの同キー復帰はこのSQL試験だけでは確認できない。

起動待ちは127.0.0.1のTCPにpg_isreadyを実行する。公式imageの初期化用一時サーバはsocketのみで、その終了前にDDLを送る競合を避ける。待機上限は30秒。SQL本体はUnix socketで最終サーバへ接続し、利用したserver_versionを出力する。

実handlerの現在認可/MFA/本人承認/現物事実、期限境界、返金の本人/先区分選択・全取消、CSV/SSE worker、認証基盤統合、実機/性能/復旧、運用migration/rollbackは未実施。これらの受入ATを制約試験だけで合格へ変更しない。

ER図はMermaid 12.1.0のparserで全6ブロックを検証済み。視覚的な描画/実画面の受入確認は別途行う。
