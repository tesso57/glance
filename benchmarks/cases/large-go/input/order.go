package checkout

import "errors"

type Status string

const (
	Pending  Status = "pending"
	Paid     Status = "paid"
	Canceled Status = "canceled"
)

type Order struct {
	ID     string
	Status Status
}

var (
	ErrNotFound = errors.New("order not found")
	ErrStatus   = errors.New("order cannot be checked out")
)

type Orders interface {
	Find(id string) (Order, bool)
	Save(order Order) error
}

type Inventory interface {
	Reserve(id string) error
	Release(id string) error
}

type Notifier interface {
	Send(id string) error
}
