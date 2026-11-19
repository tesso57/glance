# Web UI の入力形式

対象プロジェクトの `.glance/overview.json` に、どのコンポーネントがどの業務・状態図に関わるかを記録する。表示に使う HTML、JavaScript、SVG はパッケージが生成する。

## 状態図が1枚あるとき

対象の `.glance/status.mmd` に保存した状態図を次の入力で表示できる。

```json
{
  "schemaVersion": 1,
  "title": "TODO リスト",
  "workflows": [
    {
      "id": "progress",
      "label": "TODO の進捗",
      "charts": [{ "title": "開始と完了", "file": "status.mmd" }]
    }
  ]
}
```

`file` は `.glance/` からの相対パス。Markdown に図がある場合は `{"title":"開始と完了","file":"charts.md","heading":"TODO の進捗"}` のように、一意の見出しを指定する。その節にある一つの `mermaid` コードブロックを読む。対応する記法は glance の `/glance chart` が出力する平坦な `stateDiagram-v2`（状態の宣言、開始・終了、名前付き・名前なしの矢印）。新しい検査が必要な場合は同じ仕様・設定で TLC を実行し、得た図を保存する。途中で停止した探索の図を使う場合は、その条件と未完了であることを図の `description` に記録する。

## コンポーネントと業務の対応

| 項目 | 内容 |
| --- | --- |
| `components[]` | `id`、画面に出す `label`。任意で `group` と `description`。 |
| `dependencies[]` | `from`、`to`、`kind`、関係を表す `label`。呼び出し・データは `runtime`、イベントは送達方向に `event`、ビルド時は利用側から依存先へ `build`。任意で `context`、`sources`。 |
| `workflows[].components` | この業務に関与するコンポーネントの ID の配列。全体図と業務を相互にたどれる。 |
| `workflows[].charts[].owners` | この図が表す状態を担当するコンポーネントの ID の配列。統合図では青線で結ぶ。担当が分かったものだけを指定する。業務に関与するコンポーネントにも自動で加わる。 |
| `terms[]` | `label` と `description` の組で用語を定義する。業務の `terms` に名前を並べると、その業務の図の下に表示される。 |
| `workflows[].evidence[]` | `label`、任意の `description` と `sources`。根拠の例は `{"label":"完了の条件","sources":[{"file":"src/todo.ts","line":7,"label":"complete"}]}`。ファイルはプロジェクトのルートからの相対パス、行番号は1始まり。 |
| `workflows[].traces[]` | TLC の出力などで実際に連続して到達した経路。名前を `label`、操作の列を `steps` に書く。任意で `description`、最終状態の値の配列 `values`。 |
| `verification` | 保存された検査記録。必須の `summary` に対象と結果を書く。任意で `scope`、`metrics`（`label` と文字列の `value`）、`properties`（`label` と `description`）、`tables`（`title`、`columns` と同じ列数を持つ `rows`）。業務別の探索状態数が分かれば、その業務の `exploredStates` に記す。 |

`components` だけでも依存図を表示できる。コンポーネントと業務の `id` は英字で始め、後続には英数字、`-`、`_` を使う。名称と説明にはドメインで使う表記を使う。新規設計の提案ならその旨を `description` に書く。用語や検査記録がなければ、その項目は省略する。

`revision` はモデルの版を示す自由な文字列。ソース抜粋を再現するには、実装を照合した Git コミットの完全な SHA を `sourceCommit` に記録する。指定するとそのコミットから、未指定なら作業ツリーから、指定行と前後の行を読み込む。HTML の抜粋は生成時の内容を保持する。

## 生成と確認

既存の設計資料と状態図を読み、参照するファイル・見出し・行番号を照合する。既存の入力があれば変更点を反映する。検査の状態数や経路は元の記録にあるものを使う。実装との一致はコードに根拠を添える。

Pi では `/glance overview` で再生成できる。エージェントが初回生成を依頼されたら、パッケージに同梱された [生成スクリプト](../../../scripts/overview.mjs) を絶対パスに解決し、`node <スクリプトのパス> <対象プロジェクトのルート>` を実行する。必要な実行環境は Node.js と Graphviz の `dot`。成功すると HTML の絶対パスを出力する。入力の検証に失敗した場合はエラーが示す項目を直して再生成する。

[TODO の入力例](../../../examples/todo/overview.json) には担当関係・用語・検査結果・根拠が含まれる。生成スクリプトに `--schema` を渡すと検証に使う JSON Schema を取得できる。
