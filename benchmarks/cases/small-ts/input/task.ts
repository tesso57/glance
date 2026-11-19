export type Status = "todo" | "doing" | "done";
export type Task = { status: Status };

/** Complete only a task that has started. */
export function complete(task: Task | null): boolean {
  if (task === null || task.status !== "doing") return false;
  task.status = "done";
  return true;
}
