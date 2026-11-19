(() => {
  const byId = id => document.getElementById(id);
  const data = JSON.parse(byId("dataset").textContent);
  const workflows = data.workflows;
  const charts = new Map(data.charts.map(c => [c.key, c]));
  const terms = new Map((data.terms ?? []).map(t => [t.label, t.description]));

  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function button(label, fn, className) {
    const node = el("button", label, className);
    node.type = "button";
    node.onclick = fn;
    return node;
  }
  function link(label, href) {
    const node = el("a", label);
    node.href = href;
    return node;
  }
  function prose(tag, text, className) {
    const node = el(tag, undefined, className);
    for (const [i, part] of (text ?? "").split("`").entries()) {
      node.append(i % 2 ? el("code", part) : document.createTextNode(part));
    }
    return node;
  }
  function details(label, className = "sub") {
    const node = el("details", undefined, className);
    node.append(el("summary", label));
    return node;
  }
  function definitions(items, description = prose) {
    const list = el("dl");
    for (const [key, value] of items) list.append(el("dt", key), description("dd", value));
    return list;
  }
  function table(columns, rows, cell = el) {
    const box = el("div", undefined, "tablebox"), node = el("table");
    const header = node.createTHead().insertRow(), body = node.createTBody();
    for (const title of columns) header.append(el("th", title));
    for (const row of rows) {
      const tr = body.insertRow();
      for (const value of row) tr.append(cell("td", value));
    }
    box.append(node);
    return box;
  }
  function showSection(id, title) {
    byId(id).hidden = false;
    byId("nav").append(link(title, "#" + id));
  }
  function graph(svg) {
    return new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  }
  const dom = { byId, el, button, link, prose, details, graph, showSection };
  const { openChart, sourceButton } = mountOverviewDialog(data, dom);
  function openWorkflow(flow) {
    const section = byId("flow-" + flow.id);
    section.open = true;
    section.scrollIntoView({ block: "start" });
    section.querySelector("summary").focus({ preventScroll: true });
  }

  function stateFigure(chart) {
    const figure = el("figure", undefined, "state"), caption = el("figcaption"), title = el("div");
    title.append(el("h4", chart.title));
    if (chart.description) title.append(prose("p", chart.description));
    const svg = data.layouts.figures[chart.key];
    caption.append(title, button("拡大表示", () => openChart(chart), "small"));
    const canvas = el("div", undefined, "statecanvas"), image = el("img");
    image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    image.alt = chart.title + "の状態遷移図";
    canvas.append(image);
    const labels = new Map(chart.states.map(s => [s.id, s.label]));
    const list = details("状態と遷移を表で見る");
    const boundaries = [];
    if (chart.initial.length) boundaries.push(["開始状態", chart.initial.map(id => labels.get(id)).join(" ／ ")]);
    if (chart.final.length) boundaries.push(["終了状態", chart.final.map(id => labels.get(id)).join(" ／ ")]);
    const connected = new Set([...chart.initial, ...chart.final, ...chart.transitions.flatMap(e => [e.from, e.to])]);
    const isolated = chart.states.filter(s => !connected.has(s.id));
    if (isolated.length) boundaries.push(["単独の状態", isolated.map(s => s.label).join(" ／ ")]);
    if (boundaries.length) list.append(definitions(boundaries, el));
    list.append(table(["操作前", "操作", "操作後"], chart.transitions.map(e => [labels.get(e.from), e.label, labels.get(e.to)])));
    figure.append(caption, canvas, list);
    return figure;
  }
  function traceItem(trace) {
    const item = el("div", undefined, "trace");
    item.append(el("h5", trace.label));
    if (trace.description) item.append(prose("p", trace.description));
    const steps = el("ol");
    for (const name of trace.steps) {
      const step = el("li");
      step.append(el("code", name));
      steps.append(step);
    }
    item.append(steps);
    if (trace.values?.length) item.append(el("p", trace.values.join(" · "), "values"));
    return item;
  }

  function evidenceItem(fact) {
    const item = el("div", undefined, "fact");
    item.append(el("h5", fact.label));
    if (fact.description) item.append(prose("p", fact.description));
    item.append(...(fact.sources ?? []).map(sourceButton));
    return item;
  }

  function workflowSection(flow) {
    const section = details("", "case");
    section.id = "flow-" + flow.id;
    const heading = el("span", flow.label);
    if (flow.id !== flow.label) heading.append(el("code", flow.id));
    const counts = [];
    if (flow.charts.length) counts.push(flow.charts.length + "図");
    if (flow.exploredStates !== undefined) counts.push(flow.exploredStates.toLocaleString("ja-JP") + " 探索状態");
    section.querySelector("summary").append(heading, el("small", counts.join(" · ")));
    const body = el("div", undefined, "casebody");
    if (flow.description) body.append(prose("p", flow.description));
    if (flow.components.length) {
      const tags = el("div", undefined, "tags");
      for (const id of flow.components) tags.append(componentButton(id));
      body.append(tags);
    }
    for (const key of flow.charts) body.append(stateFigure(charts.get(key)));
    if (flow.terms?.length) {
      const glossary = details("図の用語（" + flow.terms.length + "件）");
      glossary.append(definitions(flow.terms.map(k => [k, terms.get(k)])));
      body.append(glossary);
    }
    if (flow.traces?.length) {
      const traces = details("モデルで到達した経路（" + flow.traces.length + "件）");
      for (const trace of flow.traces) traces.append(traceItem(trace));
      body.append(traces);
    }
    if (flow.evidence?.length) {
      const evidence = details("根拠（" + flow.evidence.length + "項目）");
      for (const fact of flow.evidence) evidence.append(evidenceItem(fact));
      body.append(evidence);
    }
    section.append(body);
    return section;
  }

  function setupVerification(v) {
    showSection("verification", "検査結果");
    const section = byId("verification");
    section.append(prose("p", v.summary));
    if (v.metrics?.length) {
      const metrics = el("div", undefined, "numbers");
      for (const metric of v.metrics) {
        const item = el("div");
        item.append(el("strong", metric.value), el("span", metric.label));
        metrics.append(item);
      }
      section.append(metrics);
    }
    if (v.properties?.length) {
      const props = details("検査した性質");
      props.append(definitions(v.properties.map(p => [p.label, p.description])));
      section.append(props);
    }
    if (v.scope) {
      const scope = details("モデルの単位と探索範囲");
      scope.append(prose("p", v.scope, "expl"));
      section.append(scope);
    }
    for (const record of v.tables ?? []) {
      const item = details(record.title);
      item.append(table(record.columns, record.rows, prose));
      section.append(item);
    }
  }

  document.title = data.title + " — 構成と状態遷移";
  byId("project").textContent = data.title;
  byId("title").textContent = data.title;
  byId("description").textContent = data.description ?? "構成と状態遷移";
  byId("foot-title").textContent = data.title;
  if (data.revision) byId("revision").append(el("span", "モデル " + data.revision));
  if (data.sourceCommit) byId("revision").append(el("code", data.sourceCommit.slice(0, 12)));
  for (const doc of data.links) byId("documents").append(link(doc.label, doc.file));
  const componentButton = mountComponentMap(data, dom, {
    openChart, openWorkflow, sourceButton, attachCamera: attachMapCamera,
  });
  if (workflows.length) {
    showSection("workflows", "業務の状態");
    const sections = workflows.map(workflowSection), expand = byId("expand");
    byId("cases").append(...sections);
    if (sections.length === 1) {
      sections[0].open = true;
      expand.hidden = true;
    } else {
      const allOpen = () => sections.every(section => section.open);
      const updateLabel = () => { expand.textContent = allOpen() ? "すべて閉じる" : "すべて開く"; };
      for (const section of sections) section.addEventListener("toggle", updateLabel);
      expand.onclick = () => {
        const open = !allOpen();
        for (const section of sections) section.open = open;
        updateLabel();
      };
    }
  }
  const otherTerms = [...terms].filter(([key]) => !workflows.some(w => w.terms?.includes(key)));
  if (otherTerms.length) {
    showSection("glossary", "用語");
    byId("glossary").append(definitions(otherTerms));
  }
  if (data.verification) setupVerification(data.verification);
})();
