package checkout

import "errors"

var ErrInjected = errors.New("injected failure")

// MemoryOrders copies orders by value. A failed Save leaves the map unchanged.
type MemoryOrders struct {
	Data     map[string]Order
	FailSave bool
}

func (m *MemoryOrders) Find(id string) (Order, bool) {
	order, ok := m.Data[id]
	return order, ok
}

func (m *MemoryOrders) Save(order Order) error {
	if m.FailSave {
		return ErrInjected
	}
	m.Data[order.ID] = order
	return nil
}

// Failures happen before the corresponding inventory update.
type MemoryInventory struct {
	Reserved    map[string]bool
	FailReserve bool
	FailRelease bool
}

func (m *MemoryInventory) Reserve(id string) error {
	if m.FailReserve {
		return ErrInjected
	}
	m.Reserved[id] = true
	return nil
}

func (m *MemoryInventory) Release(id string) error {
	if m.FailRelease {
		return ErrInjected
	}
	m.Reserved[id] = false
	return nil
}

type MemoryNotifier struct {
	Sent map[string]int
	Fail bool
}

func (m *MemoryNotifier) Send(id string) error {
	if m.Fail {
		return ErrInjected
	}
	m.Sent[id]++
	return nil
}
