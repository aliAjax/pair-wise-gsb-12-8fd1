// 车辆资料：数据结构 + 演示用种子数据（纯数据，不含判定逻辑）

export interface Vehicle {
  id: string;
  name: string; // 车辆编号
  crew: string; // 班组
  availableFrom: string; // 可用时段起，本地时间 YYYY-MM-DDTHH:mm
  availableTo: string; // 可用时段止
  power: number; // 额定功率 kW
  fuel: number; // 余油 L
  tankCapacity: number; // 油箱容量 L
}

export type OrderStatus = "pending" | "dispatched" | "arrived" | "done" | "cancelled";

export interface FaultOrder {
  id: string;
  location: string; // 地点
  load: number; // 负荷 kW
  start: string; // 开始时刻，本地时间 YYYY-MM-DDTHH:mm
  duration: number; // 预计时长 h
  status: OrderStatus;
  vehicleId: string | null; // 已派车辆
  fuelUsed: number | null; // 到场后按时长扣减的燃油 L
  createdAt: string;
}

export interface DispatchState {
  vehicles: Vehicle[];
  orders: FaultOrder[];
  nextId: number;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function todayAt(h: number, m = 0): string {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return toLocalInput(d);
}

function hoursFromNow(h: number): string {
  return toLocalInput(new Date(Date.now() + h * 3600_000));
}

export function seedVehicles(): Vehicle[] {
  return [
    { id: "G01", name: "发电车 G01", crew: "抢修一班", availableFrom: todayAt(6), availableTo: todayAt(22), power: 400, fuel: 900, tankCapacity: 1200 },
    { id: "G02", name: "发电车 G02", crew: "抢修一班", availableFrom: todayAt(6), availableTo: todayAt(22), power: 250, fuel: 520, tankCapacity: 800 },
    { id: "G03", name: "发电车 G03", crew: "抢修二班", availableFrom: todayAt(0), availableTo: todayAt(23, 59), power: 630, fuel: 1500, tankCapacity: 2000 },
    { id: "G04", name: "发电车 G04", crew: "抢修二班", availableFrom: todayAt(8), availableTo: todayAt(20), power: 200, fuel: 120, tankCapacity: 600 },
    { id: "G05", name: "发电车 G05", crew: "应急班", availableFrom: todayAt(0), availableTo: todayAt(23, 59), power: 100, fuel: 300, tankCapacity: 400 }
  ];
}

export function seedOrders(): FaultOrder[] {
  const now = toLocalInput(new Date());
  return [
    { id: "F1001", location: "城东开闭所", load: 180, start: hoursFromNow(2), duration: 3, status: "pending", vehicleId: null, fuelUsed: null, createdAt: now },
    { id: "F1002", location: "城西医院", load: 500, start: hoursFromNow(4), duration: 4, status: "pending", vehicleId: null, fuelUsed: null, createdAt: now },
    { id: "F1003", location: "城南泵站", load: 150, start: hoursFromNow(1), duration: 2, status: "dispatched", vehicleId: "G02", fuelUsed: null, createdAt: now }
  ];
}

export function seedState(): DispatchState {
  return { vehicles: seedVehicles(), orders: seedOrders(), nextId: 1004 };
}
