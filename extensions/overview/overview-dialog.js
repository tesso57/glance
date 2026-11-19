function mountOverviewDialog(data, { byId, el, link, button, graph }) {
  const dialog = byId("viewer"), body = byId("dialogbody");
  const jump = byId("jump");
  let scale = 1;

  function sizeFigure(value) {
    const svg = body.querySelector("svg");
    if (!svg) return;
    scale = Math.max(0.5, Math.min(32, value));
    svg.style.width = Math.max(1, body.clientWidth - 28) * scale + "px";
    svg.style.height = "auto";
    byId("fplus").disabled = scale >= 32;
    byId("fminus").disabled = scale <= 0.5;
  }
  function fitFigure() {
    sizeFigure(1);
    body.scrollTo(0, 0);
    jump.value = "";
  }
  function open(title, content, mode) {
    byId("dialogtitle").textContent = title;
    jump.closest("label").hidden = mode !== "unified";
    if (mode === "unified") jump.value = "";
    dialog.classList.toggle("wide", mode === "unified");
    byId("figuretools").hidden = mode === "source";
    body.replaceChildren(...content);
    dialog.showModal();
    if (mode !== "source") sizeFigure(1);
    body.scrollTo(0, 0);
  }
  function openChart(chart) {
    open(chart.title, [graph(data.layouts.figures[chart.key])], "figure");
  }
  function sourceButton(source) {
    const ref = data.excerpts[source.file + "#" + source.line];
    const label = source.label ?? source.file.split("/").at(-1);
    return button(label + " · " + ref.line + "行", () => {
      const code = el("pre", undefined, "code");
      ref.snippet.split("\n").forEach((line, i) => {
        const number = ref.start + i;
        const row = el("span", undefined, number === ref.line ? "hit" : "");
        row.append(el("b", String(number)), document.createTextNode(line || " "));
        code.append(row);
      });
      const path = "../" + ref.file.split("/").map(encodeURIComponent).join("/") + "#L" + ref.line;
      const file = link("作業ツリーのファイルを開く", path);
      file.target = "_blank";
      file.rel = "noopener";
      const revision = data.sourceCommit ? " · " + data.sourceCommit.slice(0, 12) : "";
      const context = el("p", ref.file + " · " + ref.line + " 行" + revision, "crumb");
      open(label, [context, code, file], "source");
    }, "ref");
  }

  const hasComponents = !!data.components?.length;
  if (data.charts.length && (hasComponents || data.charts.length > 1)) {
    const launch = byId(hasComponents ? "unified" : "unified-states");
    launch.hidden = false;
    if (hasComponents) jump.add(new Option("コンポーネント", "components"));
    for (const chart of data.charts) jump.add(new Option(chart.workflow + " / " + chart.title, chart.key));
    launch.onclick = () => {
      const content = [];
      if (data.charts.some(c => c.owners?.length)) {
        content.push(el("p", "青線の丸印は、コンポーネントが担当する状態図を示します。", "expl"));
      }
      content.push(graph(data.layouts.unified));
      open("全体図 · " + data.charts.length + "枚の状態遷移図", content, "unified");
    };
    jump.onchange = () => {
      if (!jump.value) { fitFigure(); return; }
      const svg = body.querySelector("svg");
      const region = svg.getElementById("region-" + jump.value);
      const box = region.getBBox(), width = body.clientWidth - 28;
      sizeFigure(Math.min((width - 10) / box.width, (body.clientHeight - 12) / box.height) * svg.viewBox.baseVal.width / width);
      const rect = region.getBoundingClientRect(), outer = body.getBoundingClientRect();
      body.scrollBy(rect.left - outer.left + (rect.width - body.clientWidth) / 2,
        rect.top - outer.top + (rect.height - body.clientHeight) / 2);
    };
  }

  byId("close").onclick = () => dialog.close();
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  byId("fplus").onclick = () => sizeFigure(scale * 1.4);
  byId("fminus").onclick = () => sizeFigure(scale / 1.4);
  byId("ffit").onclick = fitFigure;
  return { openChart, sourceButton };
}
