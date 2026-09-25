// ============================================================
// 页面：渲染与交互。数据见 data.js，判定见 dispatch.js，保存见 storage.js
// ============================================================

import { ORDER_STATUS, fmtTime, localISO, round1, uid } from "./data.js";
import {
  orderWindow,
  requiredFuel,
  checkAssignment,
  autoAssign,
  activeOrdersOf,
  isVehicleBusy,
} from "./dispatch.js";
import { loadOrSeed, saveState, resetState } from "./storage.js";

let state = loadOrSeed();
const root = document.getElementById("root");

// ---------- 工具 ----------

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function persist() {
  saveState(state);
}

function log(msg) {
  state.log.unshift(`[${fmtTime(localISO(new Date()))}] ${msg}`);
  state.log = state.log.slice(0, 80);
}

function vehicleById(id) {
  return state.vehicles.find((v) => v.id === id);
}

function orderById(id) {
  return state.orders.find((o) => o.id === id);
}

// ---------- 业务动作 ----------

/** 派车：vehicleId 为空则自动派车；缺一项就停在待分配并注明缺口 */
function assignOrder(orderId, vehicleId) {
  const order = orderById(orderId);
  if (!order || order.status !== "pending") return;

  let result;
  if (vehicleId) {
    const vehicle = vehicleById(vehicleId);
    if (!vehicle) return;
    const r = checkAssignment(vehicle, order, state.orders);
    result = { vehicleId: r.ok ? vehicle.id : null, gaps: r.gaps.map((g) => `${vehicle.plate}：${g}`) };
  } else {
    result = autoAssign(state.vehicles, order, state.orders);
  }

  if (result.vehicleId) {
    order.vehicleId = result.vehicleId;
    order.status = "dispatched";
    order.gaps = [];
    log(`「${order.location}」派出 ${vehicleById(result.vehicleId).plate}，回场前保持占用`);
  } else {
    order.gaps = result.gaps;
    log(`「${order.location}」无法派车，停在待分配：${result.gaps.join("；")}`);
  }
  persist();
  render();
}

/** 撤单：立刻释放车辆；已到场扣过的油不退 */
function cancelOrder(orderId) {
  const order = orderById(orderId);
  if (!order || ["returned", "cancelled"].includes(order.status)) return;
  const wasOccupying = ["dispatched", "onsite"].includes(order.status);
  const plate = order.vehicleId ? vehicleById(order.vehicleId)?.plate : null;
  order.status = "cancelled";
  order.gaps = [];
  log(
    wasOccupying
      ? `「${order.location}」已撤单，${plate} 立刻释放` +
          (order.fuelCharged > 0 ? `（到场已扣 ${order.fuelCharged} L 不退）` : "")
      : `「${order.location}」待分配撤单`
  );
  persist();
  render();
}

/** 到场：按整段时长扣燃油 */
function arriveOrder(orderId) {
  const order = orderById(orderId);
  if (!order || order.status !== "dispatched") return;
  const vehicle = vehicleById(order.vehicleId);
  if (!vehicle) return;
  const need = requiredFuel(vehicle, order);
  vehicle.fuel = round1(vehicle.fuel - need);
  order.fuelCharged = need;
  order.status = "onsite";
  log(`「${order.location}」到场开工，${vehicle.plate} 扣油 ${need} L（余 ${vehicle.fuel} L）`);
  persist();
  render();
}

/** 回场：释放车辆 */
function returnOrder(orderId) {
  const order = orderById(orderId);
  if (!order || order.status !== "onsite") return;
  const plate = vehicleById(order.vehicleId)?.plate;
  order.status = "returned";
  log(`「${order.location}」完工回场，${plate} 释放`);
  persist();
  render();
}

/** 空闲车辆加满油 */
function refuelVehicle(vehicleId) {
  const v = vehicleById(vehicleId);
  if (!v || isVehicleBusy(state.orders, v.id)) return;
  const added = round1(v.capacity - v.fuel);
  if (added <= 0) return;
  v.fuel = v.capacity;
  log(`${v.plate} 补油 +${added} L，已加满（${v.capacity} L）`);
  persist();
  render();
}

function removeOrder(orderId) {
  const order = orderById(orderId);
  if (!order || !["returned", "cancelled"].includes(order.status)) return;
  state.orders = state.orders.filter((o) => o.id !== orderId);
  log(`已删除「${order.location}」的完结记录`);
  persist();
  render();
}

function resetAll() {
  state = resetState();
  render();
}

// ---------- 渲染 ----------

function defaultStart() {
  const d = new Date(Date.now() + 3600_000);
  d.setMinutes(0, 0, 0);
  return localISO(d);
}

function metricsHtml() {
  const busy = state.vehicles.filter((v) => isVehicleBusy(state.orders, v.id)).length;
  const pending = state.orders.filter((o) => o.status === "pending").length;
  const onsite = state.orders.filter((o) => o.status === "onsite").length;
  const items = [
    ["发电车", `${state.vehicles.length} 台`],
    ["占用中", `${busy} 台`],
    ["待分配故障单", `${pending} 张`],
    ["作业中", `${onsite} 张`],
  ];
  return items
    .map(([label, value]) => `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`)
    .join("");
}

function orderCardHtml(o) {
  const w = orderWindow(o);
  const vehicle = o.vehicleId ? vehicleById(o.vehicleId) : null;

  const gapsHtml =
    o.status === "pending" && o.gaps.length
      ? `<ul class="gaps">${o.gaps.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>`
      : "";

  const dispatchHtml = vehicle
    ? `<p class="note">派车：${esc(vehicle.plate)}（${esc(vehicle.crew)}）` +
      (o.fuelCharged > 0 ? ` · 到场已扣油 ${o.fuelCharged} L` : "") +
      `</p>`
    : "";

  const actions = [];
  if (o.status === "pending") {
    const options = state.vehicles
      .map((v) => `<option value="${v.id}">${esc(v.plate)} · ${esc(v.crew)} · ${v.ratedPower}kW · 余油${v.fuel}L</option>`)
      .join("");
    actions.push(`
      <button type="button" data-action="assign-auto" data-id="${o.id}">自动派车</button>
      <span class="assign-manual">
        <select id="veh-${o.id}"><option value="">指定车辆…</option>${options}</select>
        <button type="button" class="secondary" data-action="assign-manual" data-id="${o.id}">指定派车</button>
      </span>
      <button type="button" class="danger" data-action="cancel" data-id="${o.id}">撤单</button>`);
  } else if (o.status === "dispatched") {
    actions.push(`
      <button type="button" data-action="arrive" data-id="${o.id}">到场（扣油）</button>
      <button type="button" class="danger" data-action="cancel" data-id="${o.id}">撤单</button>`);
  } else if (o.status === "onsite") {
    actions.push(`<button type="button" data-action="return" data-id="${o.id}">完工回场</button>`);
  } else {
    actions.push(`<button type="button" class="secondary" data-action="remove" data-id="${o.id}">删除记录</button>`);
  }

  return `
    <article class="record">
      <div class="record-head">
        <p class="record-title">${esc(o.location)}</p>
        <span class="status st-${o.status}">${ORDER_STATUS[o.status]}</span>
      </div>
      <div class="details">
        <span>负荷：${o.load} kW</span>
        <span>开始：${fmtTime(o.start)}</span>
        <span>预计时长：${o.duration} h</span>
        <span>作业窗口：${fmtTime(o.start)} ~ ${fmtTime(localISO(w.end))}</span>
      </div>
      ${dispatchHtml}
      ${gapsHtml}
      <div class="actions">${actions.join("")}</div>
    </article>`;
}

function vehicleRowsHtml() {
  return state.vehicles
    .map((v) => {
      const busy = isVehicleBusy(state.orders, v.id);
      const current = busy ? activeOrdersOf(state.orders, v.id)[0] : null;
      const statusHtml = busy
        ? `<span class="busy">占用 · ${esc(current.location)}</span>`
        : `<span class="idle">空闲</span>`;
      const refuel =
        !busy && v.fuel < v.capacity
          ? `<button type="button" class="secondary" data-action="refuel" data-id="${v.id}">加满油</button>`
          : "";
      return `<tr>
        <td>${esc(v.plate)}</td>
        <td>${esc(v.crew)}</td>
        <td>${fmtTime(v.availableFrom)} ~ ${fmtTime(v.availableTo)}</td>
        <td>${v.ratedPower} kW</td>
        <td>${v.fuel} / ${v.capacity} L</td>
        <td>${statusHtml}</td>
        <td>${refuel}</td>
      </tr>`;
    })
    .join("");
}

function render() {
  const orderCards = state.orders.length
    ? state.orders.map(orderCardHtml).join("")
    : `<div class="empty">暂无故障单</div>`;
  const logItems = state.log.length
    ? state.log.map((l) => `<li>${esc(l)}</li>`).join("")
    : `<li>暂无日志</li>`;

  root.innerHTML = `
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">暴雨应急 · 抢修中心</p>
          <h1>发电车调度台</h1>
          <p class="subtitle">派车时同一辆车避开已有任务，功率和燃油要够整段作业；缺一项就停在待分配并注明缺口。撤单立刻释放车辆，到场按时长扣燃油，回场前保持占用。</p>
        </div>
        <div class="top-actions">
          <button type="button" class="secondary" data-action="reset">恢复默认数据</button>
        </div>
      </header>

      <section class="metrics">${metricsHtml()}</section>

      <section class="workspace">
        <aside class="side">
          <form class="panel" id="order-form">
            <h2>新增故障单</h2>
            <div class="form-grid">
              <label>地点<input name="location" required placeholder="如：城西配电站" /></label>
              <label>负荷 (kW)<input name="load" type="number" min="1" step="1" required placeholder="如：320" /></label>
              <label>开始时刻<input name="start" type="datetime-local" required value="${defaultStart()}" /></label>
              <label>预计时长 (h)<input name="duration" type="number" min="0.5" step="0.5" required placeholder="如：4" /></label>
              <button type="submit">登记并尝试派车</button>
            </div>
          </form>

          <form class="panel" id="vehicle-form">
            <h2>新增发电车</h2>
            <div class="form-grid">
              <label>车牌<input name="plate" required placeholder="如：沪D-12345" /></label>
              <label>班组<input name="crew" required placeholder="如：抢修四班" /></label>
              <label>可用时段起<input name="availableFrom" type="datetime-local" required /></label>
              <label>可用时段止<input name="availableTo" type="datetime-local" required /></label>
              <label>额定功率 (kW)<input name="ratedPower" type="number" min="1" step="1" required /></label>
              <label>余油 (L)<input name="fuel" type="number" min="0" step="1" required /></label>
              <label>油箱容量 (L)<input name="capacity" type="number" min="1" step="1" required /></label>
              <label>作业油耗 (L/h)<input name="fuelRate" type="number" min="1" step="1" required /></label>
              <button type="submit">登记车辆</button>
            </div>
          </form>
        </aside>

        <section class="main-col">
          <div class="list-panel">
            <h2>故障单</h2>
            <div class="record-grid">${orderCards}</div>
          </div>

          <div class="list-panel">
            <h2>发电车</h2>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr><th>车牌</th><th>班组</th><th>可用时段</th><th>额定功率</th><th>余油/容量</th><th>状态</th><th>操作</th></tr>
                </thead>
                <tbody>${vehicleRowsHtml()}</tbody>
              </table>
            </div>
          </div>

          <div class="list-panel">
            <h2>调度日志</h2>
            <ul class="log">${logItems}</ul>
          </div>
        </section>
      </section>
    </div>
  </main>`;
}

// ---------- 事件 ----------

root.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === "assign-auto") assignOrder(id, null);
  else if (action === "assign-manual") {
    const select = document.getElementById(`veh-${id}`);
    if (select && select.value) assignOrder(id, select.value);
  } else if (action === "cancel") {
    if (confirm("确认撤单？车辆将立刻释放。")) cancelOrder(id);
  } else if (action === "arrive") arriveOrder(id);
  else if (action === "return") returnOrder(id);
  else if (action === "refuel") refuelVehicle(id);
  else if (action === "remove") removeOrder(id);
  else if (action === "reset") {
    if (confirm("恢复默认数据？当前改动将丢失。")) resetAll();
  }
});

root.addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form).entries());

  if (form.id === "order-form") {
    const order = {
      id: uid("O"),
      location: data.location.trim(),
      load: Number(data.load),
      start: data.start,
      duration: Number(data.duration),
      status: "pending",
      vehicleId: null,
      gaps: [],
      fuelCharged: 0,
      createdAt: localISO(new Date()),
    };
    if (!order.location || !(order.load > 0) || !order.start || !(order.duration > 0)) return;
    state.orders.unshift(order);
    log(`登记故障单「${order.location}」（${order.load} kW / ${order.duration}h）`);
    persist();
    render();
    assignOrder(order.id, null); // 登记后立即尝试派车，缺项则停在待分配并注明缺口
  } else if (form.id === "vehicle-form") {
    const vehicle = {
      id: uid("V"),
      plate: data.plate.trim(),
      crew: data.crew.trim(),
      availableFrom: data.availableFrom,
      availableTo: data.availableTo,
      ratedPower: Number(data.ratedPower),
      fuel: Number(data.fuel),
      capacity: Number(data.capacity),
      fuelRate: Number(data.fuelRate),
    };
    if (!vehicle.plate || !vehicle.crew || !vehicle.availableFrom || !vehicle.availableTo) return;
    if (!(vehicle.ratedPower > 0) || !(vehicle.capacity > 0) || !(vehicle.fuelRate > 0)) return;
    if (vehicle.fuel < 0) return;
    if (new Date(vehicle.availableFrom) >= new Date(vehicle.availableTo)) {
      alert("可用时段起必须早于可用时段止");
      return;
    }
    vehicle.fuel = Math.min(vehicle.fuel, vehicle.capacity);
    state.vehicles.push(vehicle);
    log(`登记车辆 ${vehicle.plate}（${vehicle.crew}，${vehicle.ratedPower} kW）`);
    persist();
    render();
  }
});

render();
