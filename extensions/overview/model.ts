import { Type, type Static, type TProperties } from "typebox";
import { Check, Errors } from "typebox/value";

const object = <T extends TProperties>(fields: T) => Type.Object(fields, { additionalProperties: false });
const text = Type.String({ minLength: 1 });
const id = Type.String({ pattern: "^[A-Za-z][A-Za-z0-9_-]*$" });
const optionalText = Type.Optional(text);
const ids = Type.Optional(Type.Array(id, { uniqueItems: true }));
const source = object({ file: text, line: Type.Integer({ minimum: 1 }), label: optionalText });
const sources = Type.Optional(Type.Array(source));
const definition = object({ label: text, description: text });

export const overviewSchema = object({
  schemaVersion: Type.Literal(1),
  title: text,
  description: optionalText,
  revision: optionalText,
  sourceCommit: Type.Optional(Type.String({ pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$" })),
  components: Type.Optional(Type.Array(object({
    id, label: text, group: optionalText, description: optionalText,
  }))),
  dependencies: Type.Optional(Type.Array(object({
    from: id, to: id,
    kind: Type.Union([Type.Literal("runtime"), Type.Literal("event"), Type.Literal("build")]),
    label: text, context: optionalText, sources,
  }))),
  terms: Type.Optional(Type.Array(definition)),
  workflows: Type.Optional(Type.Array(object({
    id, label: text, description: optionalText, components: ids,
    exploredStates: Type.Optional(Type.Integer({ minimum: 0 })),
    charts: Type.Optional(Type.Array(object({
      title: text, file: text, heading: optionalText, description: optionalText, owners: ids,
    }))),
    terms: Type.Optional(Type.Array(text, { uniqueItems: true })),
    traces: Type.Optional(Type.Array(object({
      label: text, description: optionalText, steps: Type.Array(text, { minItems: 1 }),
      values: Type.Optional(Type.Array(text)),
    }))),
    evidence: Type.Optional(Type.Array(object({ label: text, description: optionalText, sources }))),
  }))),
  verification: Type.Optional(object({
    summary: text, scope: optionalText,
    metrics: Type.Optional(Type.Array(object({ label: text, value: text }))),
    properties: Type.Optional(Type.Array(definition)),
    tables: Type.Optional(Type.Array(object({
      title: text, columns: Type.Array(text, { minItems: 1 }), rows: Type.Array(Type.Array(Type.String())),
    }))),
  })),
});

export type Overview = Static<typeof overviewSchema>;
export type Component = NonNullable<Overview["components"]>[number];
export type Dependency = NonNullable<Overview["dependencies"]>[number];
export type Workflow = NonNullable<Overview["workflows"]>[number];
export type ChartSource = NonNullable<Workflow["charts"]>[number];
export type Source = NonNullable<Dependency["sources"]>[number];

function unique(keys: string[], field: string): Set<string> {
  const result = new Set<string>();
  for (const key of keys) {
    if (result.has(key)) throw new Error(`${field} の値が重複しています（${key}）`);
    result.add(key);
  }
  return result;
}

function requireKeys(keys: string[], allowed: Set<string>, field: string) {
  for (const key of keys) {
    if (!allowed.has(key)) throw new Error(`${field} の参照先がありません（${key}）`);
  }
}

export function parseOverview(json: string): Overview {
  const data: unknown = JSON.parse(json);
  if (!Check(overviewSchema, data)) {
    const error = Errors(overviewSchema, data)[0];
    throw new Error(`overview.json ${error.instancePath || "/"} · ${error.message}`);
  }

  const components = unique((data.components ?? []).map(c => c.id), "components.id");
  const workflows = data.workflows ?? [];
  unique(workflows.map(w => w.id), "workflows.id");
  const terms = unique((data.terms ?? []).map(t => t.label), "terms.label");
  if (!components.size && !workflows.some(w => w.charts?.length)) {
    throw new Error("components または workflows[].charts に表示する対象を指定してください。");
  }
  for (const dep of data.dependencies ?? []) requireKeys([dep.from, dep.to], components, "dependencies");
  for (const flow of workflows) {
    requireKeys(flow.components ?? [], components, flow.id);
    requireKeys(flow.terms ?? [], terms, flow.id);
    for (const chart of flow.charts ?? []) requireKeys(chart.owners ?? [], components, chart.title);
  }
  for (const table of data.verification?.tables ?? []) {
    if (table.rows.some(row => row.length !== table.columns.length)) {
      throw new Error(`「${table.title}」の列数と行の値の数が一致しません。`);
    }
  }
  return data;
}
