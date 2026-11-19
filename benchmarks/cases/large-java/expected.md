# 評価用の期待事項（エージェント入力に含めない）

1件の Document を逐次処理し、保存された Document の ID と検索キーが一致する通常の非 null 入力を前提とする。状態は Document レコード、保存済みページ、通知回数を区別する。対象の具体的な依存先は `MemoryDependencies` であり、interface の任意の実装や並行呼び出しには保証を広げない。

- Document が見つからないなら `IllegalArgumentException`、`PUBLISHED` なら何も変えず正常 return、`DRAFT` 以外なら `IllegalStateException`。いずれも後続の storage、save、send を呼ばない。
- `storage.put` はページを追加した後で失敗する可能性がある。`failAfterWrite` なら例外が伝播し、ページは存在するが Document は `DRAFT` のままで通知されない。`failAfterWrite` を解除して再試行すれば、もう一度ページを書いて先に進む。
- storage が成功し `failSave` なら save は更新前に例外を投げる。ページは残り、Document は `DRAFT` のまま、通知は行われない。処理にはページのロールバックや補償はない。
- save が成功し `failSend` なら、Document は `PUBLISHED` でページが存在するが通知回数は増えず、例外が伝播する。成功なら Document が `PUBLISHED`、ページが存在し、通知回数が1増えて正常 return する。
- 通知失敗後に、Document を変更せずに同じ ID で再試行すると、`PUBLISHED` のため即 return する。通知の再送は行われず、成功 return を通知済みの保証と混同しない。
- ページの初期状態や既存通知回数は未指定。初期ページなし・通知0とする場合は前提として記す。`null`、状態値、外部の変更や例外契約の範囲は明記する。
- 根拠: `input/PublishService.java` の分岐と呼び出し順、`input/MemoryDependencies.java` の各更新・失敗順、`input/Document.java` の状態。有限 TLC モデルの検査結果と実装一致の証明を区別する。
