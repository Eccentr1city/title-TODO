import { TodoItem } from "./types";

export const MANUAL_WEIGHT = 2;
const EPSILON = 0.01;
const FIXED_BUMP = 0.5;

export function timeUrgency(nextReminder: string | null): number {
  if (!nextReminder) return 0;
  const hoursUntil =
    (new Date(nextReminder).getTime() - Date.now()) / (1000 * 60 * 60);
  if (hoursUntil <= 0) return Math.min(10 + Math.abs(hoursUntil) / 24, 15);
  if (hoursUntil >= 168) return 0;
  return 10 * (1 - hoursUntil / 168);
}

export function effectivePriority(todo: TodoItem): number {
  return timeUrgency(todo.nextReminder) + (todo.manualPriority ?? 0) * MANUAL_WEIGHT;
}

/**
 * Compute the new manualPriority for an item so it jumps above/below
 * its neighbor in the currently displayed sorted list.
 */
export function computeVotePriority(
  todo: TodoItem,
  direction: "up" | "down",
  sortedList: TodoItem[]
): number {
  const idx = sortedList.findIndex((t) => t.id === todo.id);
  if (idx === -1) return todo.manualPriority ?? 0;

  if (direction === "up") {
    if (idx === 0) {
      return (todo.manualPriority ?? 0) + FIXED_BUMP;
    }
    const neighbor = sortedList[idx - 1];
    const targetEP = effectivePriority(neighbor) + EPSILON;
    return (targetEP - timeUrgency(todo.nextReminder)) / MANUAL_WEIGHT;
  } else {
    if (idx === sortedList.length - 1) {
      return (todo.manualPriority ?? 0) - FIXED_BUMP;
    }
    const neighbor = sortedList[idx + 1];
    const targetEP = effectivePriority(neighbor) - EPSILON;
    return (targetEP - timeUrgency(todo.nextReminder)) / MANUAL_WEIGHT;
  }
}

/**
 * Returns Tailwind CSS classes for the heat tint based on effective priority.
 */
export function priorityHeatClass(ep: number): string {
  if (ep >= 10) return "border-l-2 border-l-heat-6";
  if (ep >= 7) return "border-l-2 border-l-heat-4";
  if (ep >= 4) return "border-l-2 border-l-heat-2";
  if (ep >= 1) return "border-l-2 border-l-border-hover";
  return "";
}
