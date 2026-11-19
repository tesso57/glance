function mountComponentMap(data, dom, { openChart, openWorkflow, sourceButton, attachCamera }) {
  if (!data.components?.length) return;
  const { byId, el, button, details, prose, graph, showSection } = dom;
  showSection("architecture", "全体図");
  const svg = graph(data.layouts.map);
  const panel = byId("inspector");
  const viewport = byId("viewport");
  const picker = byId("components");
  const collapse = byId("collapse-nodes");
  byId("map").append(svg);

  const nodes = new Map(data.components.map(component => [component.id, {
    ...component,
    shape: svg.getElementById("node_" + component.id),
    incoming: [], outgoing: [], charts: [], workflows: [],
  }]));
  const edges = (data.dependencies ?? []).map((dependency, index) => {
    const edge = { ...dependency, index, shape: svg.getElementById("edge_" + index) };
    nodes.get(edge.from).outgoing.push(edge);
    nodes.get(edge.to).incoming.push(edge);
    return edge;
  });
  for (const workflow of data.workflows) {
    for (const id of workflow.components) nodes.get(id).workflows.push(workflow);
  }
  const branches = [];
  for (const chart of data.charts) {
    if (!chart.owners?.length) continue;
    const shape = svg.getElementById("chart_" + chart.key);
    const owners = chart.owners.map(id => {
      nodes.get(id).charts.push(chart);
      return { id, connector: svg.getElementById("owner_" + chart.key + "_" + id) };
    });
    branches.push({ shape, owners });
    svgButton(shape, chart.title + "の状態図を開く", () => openChart(chart));
  }

  const openDetails = new Map();
  const layerFields = new Map();
  const edgeVisible = edge => layerFields.get(edge.kind).checked;
  function sync() {
    for (const node of nodes.values()) {
      node.shape.setAttribute("aria-expanded", String(openDetails.has(node.id)));
    }

    let visibleEdges = 0;
    for (const edge of edges) {
      const visible = edgeVisible(edge);
      edge.shape.style.display = visible ? "" : "none";
      edge.shape.classList.toggle("expanded", openDetails.has(edge.from) || openDetails.has(edge.to));
      if (visible) visibleEdges++;
    }

    let hasVisibleChart = false;
    for (const { shape, owners } of branches) {
      let visible = false;
      for (const { id, connector } of owners) {
        const expanded = openDetails.has(id);
        connector.style.display = expanded ? "" : "none";
        visible ||= expanded;
      }
      shape.style.display = visible ? "" : "none";
      hasVisibleChart ||= visible;
    }
    for (const detail of openDetails.values()) detail.applyLayers();

    panel.hidden = openDetails.size === 0;
    collapse.hidden = panel.hidden;
    byId("chart-legend").hidden = !hasVisibleChart;
    byId("mapstats").textContent = nodes.size + " コンポーネント · " + visibleEdges + " 接続" +
      (openDetails.size ? " · " + openDetails.size + " 件を展開中" : "");
  }

  function makeDetail(node) {
    const article = el("article", undefined, "component-detail");
    article.id = "detail-" + node.id;
    const header = el("div", undefined, "component-heading");
    const title = el("h3", node.label);
    if (node.group) title.append(el("small", node.group));
    header.append(title, button("たたむ", () => close(node), "small"));
    article.append(header);
    if (node.description) article.append(prose("p", node.description));

    function addTags(heading, items, makeButton) {
      if (!items.length) return;
      const tags = el("div", undefined, "tags");
      for (const item of items) tags.append(makeButton(item));
      article.append(el("h4", heading), tags);
    }
    addTags("担当する状態図", node.charts, chart => button(chart.title, () => openChart(chart), "charttag"));
    addTags("関連する業務", node.workflows, flow => button(flow.label, () => openWorkflow(flow), "flowtag"));

    const groups = [];
    function addConnections(heading, connections, otherEnd, arrow) {
      if (!connections.length) return;
      const list = details(heading, "connections");
      const rows = connections.map(edge => {
        const other = nodes.get(edge[otherEnd]);
        const row = el("div", undefined, "adj");
        row.dataset.edge = edge.index;
        row.append(button(arrow + other.label, () => locate(other.id)),
          el("span", [edge.label, edge.context].filter(Boolean).join(" · ")));
        if (edge.sources?.length) {
          const refs = details("実装の根拠", "edgefact");
          refs.append(...edge.sources.map(sourceButton));
          row.append(refs);
        }
        list.append(row);
        return { row, edge };
      });
      groups.push({ heading, list, rows });
      article.append(list);
    }
    addConnections("このコンポーネントから", node.outgoing, "to", "→ ");
    addConnections("このコンポーネントへ", node.incoming, "from", "← ");

    function applyLayers() {
      for (const { heading, list, rows } of groups) {
        let visible = 0;
        for (const { row, edge } of rows) {
          row.hidden = !edgeVisible(edge);
          if (!row.hidden) visible++;
        }
        list.hidden = visible === 0;
        list.firstElementChild.textContent = heading + "（" + visible + "）";
      }
    }
    function revealEdge(index) {
      const row = article.querySelector('[data-edge="' + index + '"]');
      row.closest(".connections").open = true;
      const refs = row.querySelector(".edgefact");
      if (refs) refs.open = true;
    }
    return { article, applyLayers, revealEdge };
  }

  function open(node) {
    let detail = openDetails.get(node.id);
    if (!detail) {
      detail = makeDetail(node);
      openDetails.set(node.id, detail);
      panel.append(detail.article);
      sync();
    }
    return detail;
  }
  function close(node) {
    const { article } = openDetails.get(node.id);
    if (article.contains(document.activeElement)) node.shape.focus({ preventScroll: true });
    openDetails.delete(node.id);
    article.remove();
    sync();
  }
  function locate(id) {
    const node = nodes.get(id);
    open(node);
    camera.centerOn(node.shape);
    viewport.scrollIntoView({ block: "nearest" });
    node.shape.focus({ preventScroll: true });
  }
  function svgButton(shape, label, activate) {
    shape.setAttribute("tabindex", "0");
    shape.setAttribute("role", "button");
    shape.setAttribute("aria-label", label);
    shape.addEventListener("click", activate);
    shape.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (!event.repeat) activate();
    });
  }

  for (const node of nodes.values()) {
    picker.add(new Option(node.label, node.id));
    svgButton(node.shape, node.label, () => openDetails.has(node.id) ? close(node) : open(node));
  }
  for (const edge of edges) {
    const from = nodes.get(edge.from), to = nodes.get(edge.to);
    edge.shape.querySelector("title").textContent = from.label + " → " + to.label + " · " + edge.label;
    edge.shape.addEventListener("click", () => open(from).revealEdge(edge.index));
  }
  const layers = [
    ["runtime", "呼び出し・データ", "実線は利用側 → 依存先"],
    ["event", "イベント", "破線はイベントの送達方向"],
    ["build", "ビルド依存", "点線はビルド時の依存先"],
  ];
  const kinds = new Set(edges.map(edge => edge.kind));
  const directions = [];
  for (const [kind, label, direction] of layers) {
    if (!kinds.has(kind)) continue;
    const field = el("input"), option = el("label");
    field.type = "checkbox";
    field.value = kind;
    field.checked = true;
    field.onchange = sync;
    layerFields.set(kind, field);
    option.append(field, el("i", undefined, "line " + kind), label);
    byId("layers").append(option);
    directions.push(direction);
  }
  byId("directions").textContent = directions.join("、");
  byId("count").textContent = nodes.size + " コンポーネント · " + edges.length + " 接続";
  picker.onchange = () => {
    if (picker.value) locate(picker.value);
    picker.value = "";
  };
  collapse.onclick = () => {
    openDetails.clear();
    panel.replaceChildren();
    sync();
    viewport.focus({ preventScroll: true });
  };
  sync();
  const camera = attachCamera(viewport, svg, {
    plus: byId("plus"), minus: byId("minus"), fit: byId("fit"), level: byId("mapzoom"),
  });
  return id => button(nodes.get(id).label, () => locate(id), "tag");
}
