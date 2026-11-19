export type Status = "todo" | "doing" | "done";
export type Task = { status: Status };
export type Persist = (task: Task) => Promise<void>;

export async function start(task: Task, persist: Persist): Promise<boolean> {
  if (task.status !== "todo") return false;
  task.status = "doing";
  await persist(task);
  return true;
}

export function complete(task: Task): boolean {
  if (task.status !== "doing") return false;
  task.status = "done";
  return true;
}
