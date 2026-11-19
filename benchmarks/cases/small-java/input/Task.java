public final class Task {
    public enum Status { TODO, IN_PROGRESS, DONE }

    public Status status;

    public Task(Status status) {
        this.status = status;
    }

    public static boolean complete(Task task) {
        if (task == null) {
            throw new IllegalArgumentException("task is null");
        }
        if (task.status != Status.IN_PROGRESS) {
            return false;
        }
        task.status = Status.DONE;
        return true;
    }
}
