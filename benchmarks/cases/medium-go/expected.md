# 評価用の期待事項（モデルへの入力には含めない）

## 対象と前提

`RecordRun`、`Storage.WriteArtifacts`、`Database.InsertRun` を対象とする。測定値の CSV と診断レポートの保存先はストレージで、測定レコードの保存先は DB。ストレージと DB の状態はそれぞれメモリ上で管理する。非 nil の引数で一回呼び出し、`HasReadingsCSV`、`HasDiagnosticsReport`、`HasRunRow` はいずれも初期値を `false` とする。nil や他の初期状態を除外するときは前提として示す。

## 必須の挙動

1. `WriteArtifacts` は測定値の CSV を書き込む。`FailAfterReadingsWrite` が `true` なら `ErrStorage` を返す。診断レポートは作られず、DB は呼ばれない。
2. ストレージへの書き込みが成功すると、診断レポートも保存される。`FailInsert` が `true` なら `ErrDatabase` を返す。測定レコードは作られず、書き込んだ二つのファイルは残る。
3. 両方が成功すると nil を返し、三つとも `true` になる。
4. `RecordRun` にロールバック、補償、再試行の処理はない。DB 側でエラーになっても、ストレージに書き込んだファイルは残る。
5. 失敗スイッチは固定入力として扱う。失敗時の挙動は、このストレージと DB の模擬実装に限る。

根拠は `input/record.go` の `WriteArtifacts`、`InsertRun`、`RecordRun`。

## 観察したい性質

エラー時にどのファイルが残るかで二つの経路を区別する。指定した初期状態で一回呼び出すモデルでは、`HasRunRow` が `true` なら `HasReadingsCSV` と `HasDiagnosticsReport` も `true` である、という性質を評価できる。TLC を実行した場合は検査結果を記録する。
