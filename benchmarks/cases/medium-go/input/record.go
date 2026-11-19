package recording

import "errors"

var ErrStorage = errors.New("storage write failed")
var ErrDatabase = errors.New("database insert failed")

// Storage and Database are in-memory stand-ins with independent failure switches.
type Storage struct {
	HasReadingsCSV         bool
	HasDiagnosticsReport   bool
	FailAfterReadingsWrite bool
}

type Database struct {
	HasRunRow  bool
	FailInsert bool
}

func (s *Storage) WriteArtifacts() error {
	s.HasReadingsCSV = true
	if s.FailAfterReadingsWrite {
		return ErrStorage
	}
	s.HasDiagnosticsReport = true
	return nil
}

func (d *Database) InsertRun() error {
	if d.FailInsert {
		return ErrDatabase
	}
	d.HasRunRow = true
	return nil
}

func RecordRun(s *Storage, db *Database) error {
	if err := s.WriteArtifacts(); err != nil {
		return err
	}
	return db.InsertRun()
}
