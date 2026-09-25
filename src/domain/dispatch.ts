// 调度判定：纯函数，不碰页面和存储
import type { FaultOrder, OrderStatus, Vehicle } from "../data/vehicles";

export const FUEL_RATE = 0.25; // 综合油耗 升/千瓦时

export interface GapCheck {
  ok: boolean;
  gaps: string[];
}

export interface FleetCheck extends GapCheck {
  vehicle: Vehicle;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function orderEnd(order: FaultOrder): number {
  return new Date(order.start).getTime() + order.duration * 3600_000;
}

// 整段作业所需燃油
export function fuelNeeded(order: FaultOrder): number {
  return round1(order.load * order.duration * FUEL_RATE);
}

// 已派车、已到场都算占用，回场（完成）前不释放
export function isActive(status: OrderStatus): boolean {
  return status === "dispatched" || status === "arrived";
}

export function activeTasksOf(vehicleId: string, orders: FaultOrder[]): FaultOrder[] {
  return orders.filter((o) => o.vehicleId === vehicleId && isActive(o.status));
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// 单车校验：可用时段、时段冲突、功率、燃油，缺哪项记哪项
export function checkVehicle(vehicle: Vehicle, order: FaultOrder, orders: FaultOrder[]): GapCheck {
  const gaps: string[] = [];
  const start = new Date(order.start).getTime();
  const end = orderEnd(order);
  const from = new Date(vehicle.availableFrom).getTime();
  const to = new Date(vehicle.availableTo).getTime();

  if (start < from || end > to) {
    gaps.push(`超出可用时段（车可用 ${fmtTime(from)}–${fmtTime(to)}）`);
  }

  for (const task of activeTasksOf(vehicle.id, orders)) {
    if (overlaps(start, end, new Date(task.start).getTime(), orderEnd(task))) {
      gaps.push(`与 ${task.id}（${task.location}）时段冲突`);
    }
  }

  if (order.load > vehicle.power) {
    gaps.push(`功率缺 ${round1(order.load - vehicle.power)}kW`);
  }

  const need = fuelNeeded(order);
  if (need > vehicle.fuel) {
    gaps.push(`燃油缺 ${round1(need - vehicle.fuel)}L（全程需 ${need}L）`);
  }

  return { ok: gaps.length === 0, gaps };
}

export function evaluateFleet(vehicles: Vehicle[], order: FaultOrder, orders: FaultOrder[]): FleetCheck[] {
  return vehicles.map((vehicle) => ({ vehicle, ...checkVehicle(vehicle, order, orders) }));
}

// 自动派车：在全部通过的车里选功率最贴近的一辆，大车留给大活
export function pickVehicle(vehicles: Vehicle[], order: FaultOrder, orders: FaultOrder[]): Vehicle | null {
  const ok = evaluateFleet(vehicles, order, orders)
    .filter((e) => e.ok)
    .map((e) => e.vehicle)
    .sort((a, b) => a.power - b.power);
  return ok[0] ?? null;
}
