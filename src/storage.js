// ============================================================
// 本地保存：localStorage 读写，坏了就回退到种子数据
// ============================================================

import { STORAGE_KEY, seedState } from "./data.js";

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !Array.isArray(s.vehicles) || !Array.isArray(s.orders)) return null;
    return {
      vehicles: s.vehicles,
      orders: s.orders,
      log: Array.isArray(s.log) ? s.log : [],
    };
  } catch {
    return null;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储被禁用或已满时静默失败，页面仍可继续使用
  }
}

export function resetState() {
  const s = seedState();
  saveState(s);
  return s;
}

/** 启动入口：优先读本地，没有或损坏则用种子数据 */
export function loadOrSeed() {
  return loadState() ?? resetState();
}
