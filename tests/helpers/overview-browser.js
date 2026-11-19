try {
  const get = id => document.getElementById(id);
  const tap = element => element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const visible = element => getComputedStyle(element).display !== "none";
  function check(condition, message) {
    if (!condition) throw new Error(message);
  }

  const svg = get("map").querySelector("svg");
  const chart = svg.getElementById("chart_c0");
  const todo = svg.getElementById("node_todo");
  const list = svg.getElementById("node_list");
  check(!visible(chart), "chart should start collapsed");
  const fit = svg.viewBox.baseVal.width;
  get("plus").click();
  check(svg.viewBox.baseVal.width < fit, "zoom did not change");
  const position = svg.getAttribute("viewBox");

  tap(todo);
  tap(list);
  tap(todo);
  check(get("inspector").children.length === 1 && get("detail-list"), "unexpected expanded components");
  check(visible(chart) && !visible(svg.getElementById("owner_c0_todo")), "shared chart lost an owner");
  check(visible(svg.getElementById("owner_c0_list")), "expanded owner lost its connection");

  const eventLayer = document.querySelector('#layers input[value="event"]');
  const eventEdge = svg.getElementById("edge_1");
  eventLayer.click();
  check(!visible(eventEdge) && visible(chart), "dependency filter affected chart ownership");
  tap(todo);
  const selfRows = [...get("detail-todo").querySelectorAll('[data-edge="1"]')];
  check(selfRows.length === 2 && selfRows.every(row => row.hidden), "self-loop must respect the current filter at both ends");
  eventLayer.click();
  check(visible(eventEdge) && selfRows.every(row => !row.hidden), "inspector and graph filters diverged");

  tap(svg.getElementById("edge_0"));
  const ref = get("detail-list").querySelector(".edgefact[open] button");
  check(ref, "edge evidence did not open");
  ref.click();
  check(get("viewer").open && get("dialogbody").querySelector(".hit").textContent.includes("Complete"), "wrong source line");
  get("close").click();
  tap(chart);
  check(get("viewer").open && get("dialogbody").querySelector("svg"), "chart dialog did not open");
  get("close").click();
  get("unified").click();
  const jump = get("jump");
  jump.value = "c0";
  jump.dispatchEvent(new Event("change"));
  check(get("viewer").open && !!get("dialogbody").querySelector("#region-c0"), "unified map lost the chart region");
  get("ffit").click();
  check(jump.value === "", "fitting the unified map did not reset the jump selection");
  get("close").click();

  get("collapse-nodes").click();
  check(!visible(chart) && get("inspector").hidden && !get("inspector").children.length, "collapse did not clear the graph and inspector");
  check(svg.querySelectorAll('.component[aria-expanded="false"]').length === 3, "component state was lost");
  check(svg.getAttribute("viewBox") === position, "expansion changed the viewport");
  document.body.textContent = "PASS";
} catch (error) {
  document.body.textContent = "FAIL: " + error.message;
}
