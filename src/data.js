// ============================================================
// 车辆资料：数据模型、常量与种子数据
// 本文件只描述"数据长什么样"，不做任何调度判定（判定见 dispatch.js）
// ============================================================

export const STORAGE_KEY = "gen-dispatch-v1";

// 故障单状态：待分配 → 已派车 → 作业中 → 已回场；回场前任意环节可撤单
export const ORDER_STATUS = {
  pending: "待分配",
  dispatched: "已派车",
  onsite: "作业中",
  returned: "已回场",
  cancelled: "已撤单",
};

// 处于这些状态的单子会一直占用车辆（回场前保持占用）
export const ACTIVE_STATUS = ["dispatched", "onsite"];

/** 本地时间 → "YYYY-MM-DDTHH:mm"（与 datetime-local 输入框一致） */
export function localISO(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

/** 展示用 "MM-DD HH:mm" */
export function fmtTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function round1(n) {
  return Math.round(n * 10) / 10;
}

export function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** 当前时刻往后偏移 h 小时，取整到整点，返回 Date */
function hoursFromNow(h) {
  const d = new Date(Date.now() + h * 3600_000);
  d.setMinutes(0, 0, 0);
  return d;
}

/**
 * 车辆资料：
 * plate 车牌 / crew 班组 / availableFrom~availableTo 可用时段 /
 * ratedPower 额定功率(kW) / fuel 余油(L) / capacity 油箱容量(L) / fuelRate 作业油耗(L/h)
 */
export function seedVehicles() {
  return [
    {
      id: "V01",
      plate: "沪A-D8012",
      crew: "抢修一班",
      availableFrom: localISO(hoursFromNow(-2)),
      availableTo: localISO(hoursFromNow(14)),
      ratedPower: 400,
      fuel: 700,
      capacity: 900,
      fuelRate: 88,
    },
    {
      id: "V02",
      plate: "沪A-D8027",
      crew: "抢修二班",
      availableFrom: localISO(hoursFromNow(-2)),
      availableTo: localISO(hoursFromNow(22)),
      ratedPower: 250,
      fuel: 420,
      capacity: 600,
      fuelRate: 58,
    },
    {
      id: "V03",
      plate: "沪B-D1566",
      crew: "抢修三班",
      availableFrom: localISO(hoursFromNow(-1)),
      availableTo: localISO(hoursFromNow(10)),
      ratedPower: 630,
      fuel: 900,
      capacity: 1200,
      fuelRate: 135,
    },
    {
      id: "V04",
      plate: "沪C-D0931",
      crew: "应急班",
      availableFrom: localISO(hoursFromNow(-2)),
      availableTo: localISO(hoursFromNow(18)),
      ratedPower: 200,
      fuel: 260,
      capacity: 400,
      fuelRate: 46,
    },
  ];
}

/**
 * 故障单：
 * location 地点 / load 负荷(kW) / start 开始时刻 / duration 预计时长(h) /
 * status 状态 / vehicleId 派出车辆 / gaps 待分配缺口说明 / fuelCharged 到场已扣燃油(L)
 */
export function seedOrders() {
  const mk = (location, load, start, duration) => ({
    id: uid("O"),
    location,
    load,
    start: localISO(start),
    duration,
    status: "pending",
    vehicleId: null,
    gaps: [],
    fuelCharged: 0,
    createdAt: localISO(new Date()),
  });
  return [
    mk("仁和路开闭所", 320, hoursFromNow(1), 4),
    mk("滨江排涝泵站", 150, hoursFromNow(2), 3),
    mk("北环数据中心", 700, hoursFromNow(2), 6),
  ];
}

export function seedState() {
  return {
    vehicles: seedVehicles(),
    orders: seedOrders(),
    log: [`[${fmtTime(localISO(new Date()))}] 已载入默认车辆与故障单数据`],
  };
}
