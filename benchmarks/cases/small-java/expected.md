# 評価用の期待事項：small-java

このファイルは評価者向けであり、モデル作成時にはエージェントに渡さない。

## 対象と前提

- `input/Task.java` の `Task.complete` を単一呼び出しとして扱う。外部の同時更新を除くなら、その前提を明記する。
- `Status` は enum だが `Task.status` は参照型であり、コンストラクタに `null` を指定できる。状態を enum の三値に限定する場合は、`status != null` を前提として明記する。

## 必須の振る舞い

| 操作前 | 結果 | 操作後 |
|---|---|---|
| `task == null` | `IllegalArgumentException` | Task の変更はない |
| 非 null、`status == IN_PROGRESS` | `true` | `status == DONE` |
| 非 null、`status == TODO`、`DONE` または `null` | `false` | `status` は変更されない |

- `true` が返れば対象の status は `DONE`。非 null のタスクに `false` が返れば status は変わらない（他スレッドによる変更を除く）。
- `DONE` を再度完了しても `true` にはならない。task 自体が null の場合の結果は `NullPointerException` ではなく明示的な `IllegalArgumentException`。
- nil/null、`status == null`、並行更新をモデルから省く場合は範囲を明示する。TLC の成功だけで実装とモデルが一致すると主張しない。

## 評価観点

三つの結果、例外と状態変更、enum 変数自体が null を許す点を正しく区別できるか。コードの事実と仮定を分け、生成された TLA+ と有限設定を実際に検査できるか。
