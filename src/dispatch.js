// ============================================================
// 调度判定：纯函数，不碰页面、不碰存储
// 规则：同一辆车避开已有任务；功率、燃油要够整段作业；
//       缺一项就保持待分配并注明缺口。
// ============================================================

import { ACTIVE_STATUS, fmtTime, round1 } from "./data.js";

/** 故障单的作业窗口 {start, end}（Date） */
export function orderWindow(order) {
  const start = new Date(order.start);
  const end = new Date(start.getTime() + Number(order.duration) * 3600_000);
  return { start, end };
}

/** 两个时间段是否重叠 */
export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/** 整段作业所需燃油(L)：作业油耗 × 预计时长 */
export function requiredFuel(vehicle, order) {
  return round1(Number(vehicle.fuelRate) * Number(order.duration));
}

/** 某车当前占用中的单子（已派车/作业中，回场前保持占用） */
export function activeOrdersOf(orders, vehicleId) {
  return orders.filter((o) => o.vehicleId === vehicleId && ACTIVE_STATUS.includes(o.status));
}

export function isVehicleBusy(orders, vehicleId) {
  return activeOrdersOf(orders, vehicleId).length > 0;
}

/**
 * 判定某车能否承接某单。
 * 返回 { ok, gaps }：gaps 为缺口说明列表，空数组表示可派。
 */
export function checkAssignment(vehicle, order, orders) {
  const gaps = [];
  const { start, end } = orderWindow(order);

  // 1) 可用时段要完整覆盖作业窗口
  const from = new Date(vehicle.availableFrom);
  const to = new Date(vehicle.availableTo);
  if (start < from || end > to) {
    gaps.push(`超出可用时段（可用 ${fmtTime(vehicle.availableFrom)}~${fmtTime(vehicle.availableTo)}）`);
  }

  // 2) 同一辆车避开已有任务（时段不得重叠）
  for (const other of activeOrdersOf(orders, vehicle.id)) {
    if (other.id === order.id) continue;
    const w = orderWindow(other);
    if (overlaps(start, end, w.start, w.end)) {
      gaps.push(`时段冲突：与「${other.location}」任务（${fmtTime(other.start)} 起 ${other.duration}h）重叠`);
    }
  }

  // 3) 功率要够整段作业
  if (Number(vehicle.ratedPower) < Number(order.load)) {
    gaps.push(`功率缺口 ${round1(order.load - vehicle.ratedPower)} kW（额定 ${vehicle.ratedPower} / 负荷 ${order.load}）`);
  }

  // 4) 燃油要够整段作业
  const need = requiredFuel(vehicle, order);
  if (Number(vehicle.fuel) < need) {
    gaps.push(`燃油缺口 ${round1(need - vehicle.fuel)} L（余油 ${vehicle.fuel} / 需 ${need}）`);
  }

  return { ok: gaps.length === 0, gaps };
}

/**
 * 自动派车：按车辆顺序找第一台全部满足的车。
 * 找不到时，返回缺口最少那台车的缺口说明（冠以车牌），用于停在待分配时注明缺口。
 * 返回 { vehicleId, gaps }
 */
export function autoAssign(vehicles, order, orders) {
  let best = null;
  for (const vehicle of vehicles) {
    const r = checkAssignment(vehicle, order, orders);
    if (r.ok) return { vehicleId: vehicle.id, gaps: [] };
    if (!best || r.gaps.length < best.gaps.length) {
      best = { vehicle, gaps: r.gaps };
    }
  }
  const gaps = best ? best.gaps.map((g) => `${best.vehicle.plate}：${g}`) : ["无可用车辆"];
  return { vehicleId: null, gaps };
}
