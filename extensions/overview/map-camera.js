function attachMapCamera(viewport, svg, controls) {
  let center = { x: 0, y: 0 };
  let scale = 1, minimum = 0.1, fitted = true;
  const maximum = 8;
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function middle() {
    const { width, height } = svg.getBoundingClientRect();
    return { x: width / 2, y: height / 2 };
  }

  function localPoint(event) {
    const rect = svg.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function draw() {
    const { width, height } = svg.getBoundingClientRect();
    const w = width / scale, h = height / scale;
    if (!w || !h) return;
    svg.setAttribute("viewBox", [center.x - w / 2, center.y - h / 2, w, h].join(" "));
    controls.level.textContent = Math.round(scale * 100) + "%";
    controls.plus.disabled = scale >= maximum;
    controls.minus.disabled = scale <= minimum;
  }

  function fit() {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const group of svg.querySelectorAll("g.node, g.edge")) {
      const rect = group.getBoundingClientRect();
      if (!rect.width && !rect.height) continue;
      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
    }
    const { width, height } = svg.getBoundingClientRect();
    if (left === Infinity || !width || !height) return;
    const inverse = svg.getScreenCTM().inverse();
    const start = new DOMPoint(left, top).matrixTransform(inverse);
    const end = new DOMPoint(right, bottom).matrixTransform(inverse);
    center = midpoint(start, end);
    scale = Math.min(1.5, Math.max(1, width - 32) / Math.max(1, end.x - start.x),
      Math.max(1, height - 32) / Math.max(1, end.y - start.y));
    minimum = Math.min(0.25, scale / 2);
    fitted = true;
    draw();
  }

  function move(from, to, requestedScale) {
    const next = Math.max(minimum, Math.min(maximum, requestedScale));
    const origin = middle();
    center.x += (from.x - origin.x) / scale - (to.x - origin.x) / next;
    center.y += (from.y - origin.y) / scale - (to.y - origin.y) / next;
    scale = next;
    fitted = false;
    draw();
  }

  function centerOn(element) {
    const rect = element.getBoundingClientRect();
    const point = new DOMPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    center = point.matrixTransform(svg.getScreenCTM().inverse());
    fitted = false;
    draw();
  }

  const zoom = factor => move(middle(), middle(), scale * factor);
  controls.plus.onclick = () => zoom(1.4);
  controls.minus.onclick = () => zoom(1 / 1.4);
  controls.fit.onclick = fit;

  viewport.addEventListener("wheel", event => {
    if (!event.deltaY) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
    const rate = event.ctrlKey ? 0.01 : 0.002;
    const delta = Math.max(-1, Math.min(1, -event.deltaY * unit * rate));
    const anchor = localPoint(event);
    move(anchor, anchor, scale * Math.exp(delta));
  }, { passive: false });

  const pointers = new Map();
  let inGesture = false;
  viewport.addEventListener("pointerdown", event => {
    if (event.button !== 0 || pointers.size >= 2) return;
    inGesture = pointers.size > 0;
    const point = localPoint(event);
    pointers.set(event.pointerId, { start: point, last: point });
    event.target.setPointerCapture(event.pointerId);
  });
  viewport.addEventListener("pointermove", event => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    const point = localPoint(event), last = pointer.last;
    const other = [...pointers.values()].find(p => p !== pointer);
    if (other) {
      const previousDistance = distance(last, other.last);
      if (previousDistance > 0) {
        move(midpoint(last, other.last), midpoint(point, other.last), scale * distance(point, other.last) / previousDistance);
      }
    } else {
      if (!inGesture && distance(pointer.start, point) < 5) return;
      inGesture = true;
      move(last, point, scale);
    }
    pointer.last = point;
    viewport.classList.add("dragging");
  });
  function release(event) {
    pointers.delete(event.pointerId);
    if (!pointers.size) viewport.classList.remove("dragging");
  }
  viewport.addEventListener("pointerup", release);
  viewport.addEventListener("pointercancel", release);
  viewport.addEventListener("lostpointercapture", release);
  viewport.addEventListener("click", event => {
    if (inGesture && event.detail !== 0) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  viewport.addEventListener("keydown", event => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const start = middle();
    switch (event.key) {
      case "+": case "=": zoom(1.4); break;
      case "-": zoom(1 / 1.4); break;
      case "0": fit(); break;
      case "ArrowLeft": move(start, { x: start.x + 60, y: start.y }, scale); break;
      case "ArrowRight": move(start, { x: start.x - 60, y: start.y }, scale); break;
      case "ArrowUp": move(start, { x: start.x, y: start.y + 60 }, scale); break;
      case "ArrowDown": move(start, { x: start.x, y: start.y - 60 }, scale); break;
      default: return;
    }
    event.preventDefault();
  });
  viewport.addEventListener("focusin", event => {
    const node = event.target.closest("g.node");
    if (!node || !node.matches(":focus-visible")) return;
    const rect = node.getBoundingClientRect(), bounds = viewport.getBoundingClientRect();
    if (rect.right < bounds.left || rect.left > bounds.right || rect.bottom < bounds.top || rect.top > bounds.bottom) centerOn(node);
  });

  fit();
  new ResizeObserver(() => fitted ? fit() : draw()).observe(viewport);
  return { centerOn };
}
