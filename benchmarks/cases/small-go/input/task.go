package task

import "errors"

type Status string

const (
	Todo       Status = "todo"
	InProgress Status = "inprogress"
	Done       Status = "done"
)

type Task struct {
	Status Status
}

// Complete updates a task that is in progress.
func Complete(task *Task) (bool, error) {
	if task == nil {
		return false, errors.New("task is nil")
	}
	if task.Status != InProgress {
		return false, nil
	}
	task.Status = Done
	return true, nil
}
