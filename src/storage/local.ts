// 本地保存：localStorage 读写，坏了就当没存过
import type { DispatchState } from "../data/vehicles";

const STORAGE_KEY = "gendispatch-v1";

export function loadState(): DispatchState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as DispatchState;
    if (!state || !Array.isArray(state.vehicles) || !Array.isArray(state.orders)) return null;
    return state;
  } catch {
    return null;
  }
}

export function saveState(state: DispatchState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储满了也不影响页面使用
  }
}

export function clearState(): void {
  localStorage.removeItem(STORAGE_KEY);
}
