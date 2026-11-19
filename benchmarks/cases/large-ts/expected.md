# 評価用の期待事項（エージェント入力に含めない）

Article の保存状態・version、キャッシュ、処理位置を区別する。`input/publish.ts` と `input/fakes.ts` を根拠に、指定された模擬実装に限って分析する。入力と保存済み Article の ID が一致し、型の定義どおりの値であることを前提とする。

- `get` に対象がないと `missing`、`published` なら `alreadyPublished`。どちらも render・save・cache を呼ばない。
- `draft` なら render を待つ。`FakeRenderer.fail` は保存前に例外を発生させ、文章やキャッシュを変更しない。
- render の await 中などに別処理が Article を変更し、`save` の実行時点で version が読み取り時と異なるか Article が存在しなければ、`save` は `conflict` を返し、publish 自身は保存状態もキャッシュも更新しない。ただし、他処理による変更は残る。削除後に同じ version で再作成された場合などは条件を満たさない。
- `save` 成功の直後、Article は `published`、version は読み取った値の +1。続く cache の失敗は例外を伝播し、publish 自身は保存内容を戻さず、cache は変更しない。その間に別処理が Article を変更した場合は、その変更も考慮する。
- cache が成功すればページを保存し `published` を返す。cache 失敗後から再試行まで他の変更がなければ Article が `published` なので、再試行は `alreadyPublished` を返し、cache の再作成はしない。
- await の合間の並行変更のパターンと初期状態は範囲を明記する。外部コードによる cache 書き換え、例外、ランタイム不正値、モック以外の実装は未確認または対象外にする。
- `input/fakes.ts` の get と save はコピーを使うので、ローカルで新しい object を作るだけでは保存データは変わらない。仮にレンダラや保存側の実装を変えたときの副作用は本ケースの保証に含めない。
- TLC 結果とコードの一致を区別し、前提と省略を示す。形式証明や全入力の網羅を推測しない。
