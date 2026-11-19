package checkout

import "errors"

type Service struct {
	Orders    Orders
	Inventory Inventory
	Notifier  Notifier
}

// Checkout reserves inventory before saving the order, then sends a receipt.
// Calls to a Service and its dependencies are assumed to be sequential.
func (s Service) Checkout(id string) error {
	order, ok := s.Orders.Find(id)
	if !ok {
		return ErrNotFound
	}
	if order.Status == Paid {
		return nil
	}
	if order.Status != Pending {
		return ErrStatus
	}
	if err := s.Inventory.Reserve(id); err != nil {
		return err
	}
	order.Status = Paid
	if err := s.Orders.Save(order); err != nil {
		return errors.Join(err, s.Inventory.Release(id))
	}
	return s.Notifier.Send(id)
}
