import assert from "node:assert/strict";
import test from "node:test";
import { traceToMermaid } from "../extensions/trace-chart.ts";

test("renders a trace in order without merging equal states", () => {
  const chart = traceToMermaid({kind: "invariant", property: "Safe", states: [
    {number: 1, action: "Initial predicate", value: 'status = "todo"'},
    {number: 2, action: "Start line 3", value: 'status = "done"'},
    {number: 3, action: "Again", value: 'status = "done"'},
  ]});
  assert.match(chart, /\[\*\] --> t1/);
  assert.match(chart, /t1 --> t2 : Start line 3/);
  assert.match(chart, /t2 --> t3 : Again/);
  assert.ok(chart.includes('t2 : 2. status = "done"'));
});

test("renders known liveness loops and rejects unknown endpoints", () => {
  const state = {number: 1, action: "Initial predicate", value: "x = 1"};
  assert.match(traceToMermaid({kind: "temporal", states: [state], loop: {kind: "back", target: 1}}), /t1 --> t1/);
  assert.throws(() => traceToMermaid({kind: "temporal", states: [state], loop: {kind: "back", target: 2}}));
});
