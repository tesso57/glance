# 評価用の期待事項（モデルへの入力には含めない）

## 対象と前提

`start` と共有 Task に対する `complete` を対象とする。通常の可変オブジェクトで型どおりの入力を想定し、`persist` の実装・永続化先の状態は与えられていない。`persist` が Task を変更しないという前提を置く場合は明示する。型外の値、getter/proxy、呼び出し元での例外処理は範囲外または未確認として扱う。

## 必須の挙動

1. `start` は `todo` 以外なら `false` を返し、変更・`persist` 呼び出しを行わない。
2. `todo` なら `persist` の呼び出し前に `status` を `doing` に変更し、同じ Task の参照を渡す。
3. `persist` が reject または同期 throw した場合、`start` は reject する。関数内に `status` を戻す処理はない。呼び出し後の追加変更がなければ `doing` が残るが、保存先は不明である。
4. `persist` が待機中の Task を共有していれば、他の処理は `complete` を呼べる。`complete` が `doing` を `done` に変更し、その後 `persist` が解決すると `start` は true を返す一方、Task は `done` のままになりうる。
5. したがって、並行変更を含む場合に「`start` が true を返したら status は必ず doing」とは言えない。単独実行でも `persist` が Task を書き換えないという追加前提が必要。

根拠: `input/task.ts` の `start` のガード、代入、`await`、`complete`。

## 観察したい性質

呼び出し前の状態、await 前の更新、解決と reject、共有参照による介入を区別できること。外部関数・保存先の効果や排他制御を根拠なく断定しないこと。対象外の実行時挙動と並行モデルの前提を記すこと。
