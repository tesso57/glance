import assert from "node:assert/strict";
import test from "node:test";
import { dotToMermaid, projectDot } from "../extensions/graph.ts";

const dot = String.raw`strict digraph DiskGraph {
node [shape=box,style=rounded]
nodesep=0.35;
subgraph cluster_graph {
color="white";
-9223372036854775808 [label="/\\ status = \"todo\"\n/\\ n = 0",style = filled]
-9223372036854775808 -> 9223372036854775807 [label="Complete",color="black",fontcolor="black"];
9223372036854775807 [label="/\\ status = \"done\"",tooltip="/\\ status = \"done\""];
{rank = same; -9223372036854775808;}
{rank = same; 9223372036854775807;}
}
}`;

test("renders TLC states, action labels, initial states and large fingerprints", () => {
  const graph = dotToMermaid(dot);
  assert.match(graph, /^stateDiagram-v2\n/);
  assert.match(graph, /\[\*\] --> s0/);
  assert.match(graph, /s0 --> s1 : Complete/);
  assert.ok(graph.includes('status = "todo"<br/>/\\ n = 0'));
});

test("sorts output independently of emission order and removes duplicate edges", () => {
  const reordered = dot.replace('-9223372036854775808 -> 9223372036854775807 [label="Complete",color="black",fontcolor="black"];', '')
    .replace('{rank = same; -9223372036854775808;}', '-9223372036854775808 -> 9223372036854775807 [label="Complete",color="black",fontcolor="black"];\n-9223372036854775808 -> 9223372036854775807 [label="Complete",color="black",fontcolor="black"];\n{rank = same; -9223372036854775808;}');
  assert.equal(dotToMermaid(dot), dotToMermaid(reordered));
});

test("preserves distinct states with the same label and escapes diagram markup", () => {
  const graph = dotToMermaid(String.raw`strict digraph DiskGraph {
node [shape=box,style=rounded]
nodesep=0.35;
subgraph cluster_graph {
color="white";
1 [label="same \"\n\`\`\`mermaid",style = filled]
2 [label="same \"\n\`\`\`mermaid"];
1 -> 2 [label="x: y\n\`\`\`"];
}
}`.replaceAll('\\`', '`'));
  assert.match(graph, /^    s0 : same .*<br\/>/m);
  assert.match(graph, /^    s1 : same .*<br\/>/m);
  assert.doesNotMatch(graph, /```/);
  assert.ok(graph.includes('\\u0060\\u0060\\u0060'));
});

test("rejects incomplete or unrecognized graph data instead of inventing results", () => {
  assert.throws(() => dotToMermaid(dot.replace('9223372036854775807 [label=', 'missing [label=')), /Unsupported|unknown/);
  assert.throws(() => dotToMermaid(dot.slice(0, -2)), /Invalid/);
  assert.throws(() => dotToMermaid(dot.replace('style = filled', 'style = filled, fillcolor=lightyellow')), /constrained/);
});

const projectionFixture = String.raw`strict digraph DiskGraph {
nodesep=0.35;
subgraph cluster_graph {
color="white";
1 [label="/\\ phase = \"requested\"\n/\\ files = \"missing\"",style = filled]
2 [label="/\\ phase = \"requested\"\n/\\ files = \"ready\"",style = filled]
3 [label="/\\ phase = \"warning\"\n/\\ files = \"missing\""]
4 [label="/\\ phase = \"running\"\n/\\ files = \"ready\""]
1 -> 3 [label="Missing"];
2 -> 4 [label="Run"];
}
}`;

test("projection groups selected values while retaining states and conditional edge provenance", () => {
  const {mermaid, details} = projectDot(projectionFixture, ["phase"]);
  assert.equal((mermaid.match(/^    s\d+ : /gm) ?? []).length, 3);
  assert.ok(mermaid.includes('phase = "requested"'));
  assert.match(mermaid, / : Missing/);
  assert.match(mermaid, / : Run/);
  assert.match(details, /1 → 3/);
  assert.match(details, /2 → 4/);
  assert.match(details, /連続する矢印/);
  assert.match(details, /性質違反/);
});

test("projection is stable and rejects missing variables and unsupported values", () => {
  assert.equal(projectDot(projectionFixture, ["phase"]).mermaid, projectDot(projectionFixture, ["phase"]).mermaid);
  assert.throws(() => projectDot(projectionFixture, []), /at least one/);
  assert.throws(() => projectDot(projectionFixture, ["unknown"]), /missing/);
  assert.throws(() => projectDot(projectionFixture, ["phase", "phase"]), /duplicate/);
  assert.throws(() => projectDot(projectionFixture.replace('\\\"ready\\\"', '{1, 2}'), ["phase"]), /Unsupported/);
});
