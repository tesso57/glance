# 評価用の期待事項：medium-java

このファイルは評価者向けであり、モデル作成時にはエージェントに渡さない。

## 対象と前提

`input/RecordRun.java` の `record` と同ファイルのメモリ上の実装を対象とする。非 null の引数で一回呼び出し、`hasReadingsCsv`、`hasDiagnosticsReport`、`hasRunRow` はいずれも初期値を `false` とする。操作中の他スレッドからの変更はなく、失敗スイッチの値は変わらないと仮定する。他の初期状態や null を除外するときは前提として示す。

## 必須の振る舞い

1. 最初に測定値の CSV を書き込む。`failAfterReadingsWrite` が `true` なら `IllegalStateException` が伝播する。診断レポートは作られず、DB トランザクションは開始されない。
2. ストレージへの書き込みが成功すると、診断レポートも保存される。トランザクション内で `pendingRunRow` を `true` にした後、`failAfterStagedInsert` が `true` なら例外が発生する。`rollback()` の後に同じ例外が伝播する。DB の `hasRunRow` は `false` のままで、書き込んだ二つのファイルは残る。
3. 両方が成功すると `commit()` により DB の `hasRunRow` も `true` になり、例外なく戻る。成功後は三つとも `true` になる。
4. `Storage` と `Database` は独立したメモリ状態であり、`rollback()` はトランザクション内の状態を戻す。catch の対象は `RuntimeException` で、ストレージの失敗は try/catch の前に発生する。
5. これらの保証はこの実装と前提に限る。実 DB のコミット・ロールバック失敗、このストレージにない失敗パターン、他スレッドや外部からの変更はモデルの範囲外とする。

根拠は `input/RecordRun.java` の `Storage.writeArtifacts`、`Transaction.insert` / `commit` / `rollback`、`RecordRun.record`。

## 評価観点

ストレージ途中失敗と DB トランザクション内失敗の結果を区別し、どの状態がロールバックの対象か根拠を示す。指定した初期状態で一回呼び出すモデルでは、`hasRunRow` が `true` なら `hasReadingsCsv` と `hasDiagnosticsReport` も `true` である、という性質を評価できる。TLC を実行した場合は、検査結果と検査したモデルの範囲を記録する。
