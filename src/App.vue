<script setup lang="ts">
// 页面：只负责渲染和交互，判定走 domain/dispatch，数据走 data/vehicles，保存走 storage/local
import { computed, reactive } from "vue";
import type { FaultOrder, Vehicle } from "./data/vehicles";
import { seedState, toLocalInput } from "./data/vehicles";
import {
  activeTasksOf,
  evaluateFleet,
  fmtTime,
  fuelNeeded,
  isActive,
  orderEnd,
  pickVehicle,
  round1
} from "./domain/dispatch";
import { clearState, loadState, saveState } from "./storage/local";

const state = reactive(loadState() ?? seedState());

function persist() {
  saveState(state);
}

// ---------- 车辆 ----------

const fleet = computed(() =>
  state.vehicles.map((vehicle) => ({ vehicle, tasks: activeTasksOf(vehicle.id, state.orders) }))
);

const idleCount = computed(() => fleet.value.filter((f) => f.tasks.length === 0).length);

function vehicleById(id: string | null): Vehicle | undefined {
  return state.vehicles.find((v) => v.id === id);
}

function fuelPercent(vehicle: Vehicle): number {
  return Math.max(0, Math.min(100, (vehicle.fuel / vehicle.tankCapacity) * 100));
}

// ---------- 故障单 ----------

const STATUS_LABEL: Record<FaultOrder["status"], string> = {
  pending: "待分配",
  dispatched: "已派车·途中",
  arrived: "作业中",
  done: "已完成",
  cancelled: "已取消"
};

const byStart = (a: FaultOrder, b: FaultOrder) => new Date(a.start).getTime() - new Date(b.start).getTime();

const pendingOrders = computed(() => state.orders.filter((o) => o.status === "pending").sort(byStart));
const activeOrders = computed(() => state.orders.filter((o) => isActive(o.status)).sort(byStart));
const archivedOrders = computed(() =>
  state.orders
    .filter((o) => o.status === "done" || o.status === "cancelled")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
);

// 待分配单的缺口说明：有可派车辆就列出来，没有就逐车注明缺什么
function gapNotes(order: FaultOrder): string[] {
  const checks = evaluateFleet(state.vehicles, order, state.orders);
  const ok = checks.filter((c) => c.ok);
  if (ok.length > 0) {
    return [`可派：${ok.map((c) => c.vehicle.id).join("、")}，点击“派车”即可`];
  }
  return checks.map((c) => `${c.vehicle.id} ${c.vehicle.crew}：${c.gaps.join("；")}`);
}

// ---------- 新建故障单 ----------

function defaultStart(): string {
  const d = new Date(Date.now() + 3600_000);
  d.setMinutes(0, 0, 0);
  return toLocalInput(d);
}

const form = reactive({
  location: "",
  load: 100,
  start: defaultStart(),
  duration: 2
});

function addOrder() {
  const order: FaultOrder = {
    id: `F${state.nextId++}`,
    location: form.location.trim(),
    load: Number(form.load),
    start: form.start,
    duration: Number(form.duration),
    status: "pending",
    vehicleId: null,
    fuelUsed: null,
    createdAt: toLocalInput(new Date())
  };
  state.orders.push(order);
  form.location = "";
  form.start = defaultStart();
  persist();
}

// ---------- 调度动作 ----------

function dispatchOne(order: FaultOrder): boolean {
  const vehicle = pickVehicle(state.vehicles, order, state.orders);
  if (!vehicle) return false; // 缺一项就停在待分配
  order.vehicleId = vehicle.id;
  order.status = "dispatched";
  return true;
}

function dispatch(order: FaultOrder) {
  dispatchOne(order);
  persist();
}

function dispatchAll() {
  for (const order of pendingOrders.value) {
    dispatchOne(order); // 每派一单，后续单的时段冲突判定都会看到它
  }
  persist();
}

// 到场开工：按时长一次性扣减整段作业燃油，车辆保持占用
function arrive(order: FaultOrder) {
  const vehicle = vehicleById(order.vehicleId);
  if (!vehicle) return;
  const used = fuelNeeded(order);
  vehicle.fuel = round1(Math.max(0, vehicle.fuel - used));
  order.fuelUsed = used;
  order.status = "arrived";
  persist();
}

// 完工回场：到这里才释放车辆
function finish(order: FaultOrder) {
  order.status = "done";
  persist();
}

// 撤单：立即释放车辆；已扣的燃油不退
function cancel(order: FaultOrder) {
  const note = order.status === "arrived" ? "\n该单已到场扣油，撤单后燃油不退回。" : "";
  if (!window.confirm(`确认撤销 ${order.id}（${order.location}）？车辆将立即释放。${note}`)) return;
  order.status = "cancelled";
  persist();
}

function removeOrder(order: FaultOrder) {
  state.orders = state.orders.filter((o) => o.id !== order.id);
  persist();
}

function resetAll() {
  if (!window.confirm("清空本地数据并恢复演示数据？")) return;
  clearState();
  const fresh = seedState();
  state.vehicles = fresh.vehicles;
  state.orders = fresh.orders;
  state.nextId = fresh.nextId;
}
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">暴雨应急 · 抢修中心</p>
          <h1>发电车调度台</h1>
          <p class="subtitle">按时段、功率、燃油三项判定派车；缺一项就停在待分配并注明缺口，撤单立即释放车辆。</p>
        </div>
        <div class="topbar-actions">
          <button type="button" :disabled="pendingOrders.length === 0" @click="dispatchAll">一键派车（{{ pendingOrders.length }}）</button>
          <button type="button" class="secondary" @click="resetAll">重置数据</button>
        </div>
      </header>

      <section class="metrics">
        <article class="metric"><span>车辆总数</span><strong>{{ state.vehicles.length }}</strong></article>
        <article class="metric"><span>空闲车辆</span><strong>{{ idleCount }}</strong></article>
        <article class="metric"><span>任务中</span><strong>{{ state.vehicles.length - idleCount }}</strong></article>
        <article class="metric"><span>待分配故障单</span><strong>{{ pendingOrders.length }}</strong></article>
      </section>

      <section class="workspace">
        <section class="panel">
          <h2>车辆</h2>
          <div class="fleet-list">
            <article v-for="{ vehicle, tasks } in fleet" :key="vehicle.id" class="vehicle">
              <div class="vehicle-head">
                <p class="vehicle-name">{{ vehicle.name }}</p>
                <span class="crew">{{ vehicle.crew }}</span>
              </div>
              <div class="details">
                <span>可用时段：{{ fmtTime(new Date(vehicle.availableFrom).getTime()) }} – {{ fmtTime(new Date(vehicle.availableTo).getTime()) }}</span>
                <span>额定功率：{{ vehicle.power }} kW</span>
              </div>
              <div class="fuel">
                <div class="fuel-track">
                  <div class="fuel-fill" :class="{ low: fuelPercent(vehicle) < 20 }" :style="{ width: `${fuelPercent(vehicle)}%` }" />
                </div>
                <span class="fuel-text">余油 {{ vehicle.fuel }} / {{ vehicle.tankCapacity }} L</span>
              </div>
              <p v-if="tasks.length === 0" class="vehicle-status idle">空闲</p>
              <p v-else class="vehicle-status busy">
                占用中 → {{ tasks.map((t) => `${t.id} ${t.location}`).join("；") }}（回场前保持占用）
              </p>
            </article>
          </div>
        </section>

        <section class="panel">
          <h2>新建故障单</h2>
          <form class="form-grid" @submit.prevent="addOrder">
            <label>
              地点
              <input v-model="form.location" type="text" placeholder="如：城东开闭所" required />
            </label>
            <div class="form-row">
              <label>
                负荷（kW）
                <input v-model="form.load" type="number" min="1" step="1" required />
              </label>
              <label>
                预计时长（小时）
                <input v-model="form.duration" type="number" min="0.5" step="0.5" required />
              </label>
            </div>
            <label>
              开始时刻
              <input v-model="form.start" type="datetime-local" required />
            </label>
            <button type="submit">登记故障单</button>
          </form>

          <template v-if="pendingOrders.length">
            <h3 class="group-title">待分配</h3>
            <article v-for="order in pendingOrders" :key="order.id" class="order">
              <div class="order-head">
                <p class="order-title">{{ order.id }} · {{ order.location }}</p>
                <span class="badge badge-pending">{{ STATUS_LABEL[order.status] }}</span>
              </div>
              <div class="details">
                <span>负荷：{{ order.load }} kW</span>
                <span>开始：{{ fmtTime(new Date(order.start).getTime()) }}</span>
                <span>时长：{{ order.duration }} h（至 {{ fmtTime(orderEnd(order)) }}）</span>
                <span>全程需油：{{ fuelNeeded(order) }} L</span>
              </div>
              <ul class="gaps">
                <li v-for="(note, i) in gapNotes(order)" :key="i">{{ note }}</li>
              </ul>
              <div class="actions">
                <button type="button" @click="dispatch(order)">派车</button>
                <button type="button" class="danger" @click="cancel(order)">撤单</button>
              </div>
            </article>
          </template>

          <template v-if="activeOrders.length">
            <h3 class="group-title">进行中</h3>
            <article v-for="order in activeOrders" :key="order.id" class="order">
              <div class="order-head">
                <p class="order-title">{{ order.id }} · {{ order.location }}</p>
                <span class="badge" :class="order.status === 'arrived' ? 'badge-arrived' : 'badge-dispatched'">{{ STATUS_LABEL[order.status] }}</span>
              </div>
              <div class="details">
                <span>车辆：{{ order.vehicleId }}（{{ vehicleById(order.vehicleId)?.crew }}）</span>
                <span>负荷：{{ order.load }} kW</span>
                <span>开始：{{ fmtTime(new Date(order.start).getTime()) }}</span>
                <span>时长：{{ order.duration }} h（至 {{ fmtTime(orderEnd(order)) }}）</span>
                <span v-if="order.fuelUsed !== null">已扣燃油：{{ order.fuelUsed }} L</span>
              </div>
              <div class="actions">
                <button v-if="order.status === 'dispatched'" type="button" @click="arrive(order)">到场开工（扣油 {{ fuelNeeded(order) }} L）</button>
                <button v-else type="button" @click="finish(order)">完工回场</button>
                <button type="button" class="danger" @click="cancel(order)">撤单</button>
              </div>
            </article>
          </template>

          <template v-if="archivedOrders.length">
            <h3 class="group-title">已完结</h3>
            <article v-for="order in archivedOrders" :key="order.id" class="order archived">
              <div class="order-head">
                <p class="order-title">{{ order.id }} · {{ order.location }}</p>
                <span class="badge" :class="order.status === 'done' ? 'badge-done' : 'badge-cancelled'">{{ STATUS_LABEL[order.status] }}</span>
              </div>
              <div class="details">
                <span>负荷：{{ order.load }} kW</span>
                <span>开始：{{ fmtTime(new Date(order.start).getTime()) }}</span>
                <span v-if="order.vehicleId">车辆：{{ order.vehicleId }}</span>
                <span v-if="order.fuelUsed !== null">耗油：{{ order.fuelUsed }} L</span>
              </div>
              <div class="actions">
                <button type="button" class="secondary" @click="removeOrder(order)">删除记录</button>
              </div>
            </article>
          </template>

          <p v-if="state.orders.length === 0" class="empty">暂无故障单</p>
        </section>
      </section>
    </div>
  </main>
</template>
