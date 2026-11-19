public final class RecordRun {
    // In-memory stand-ins: these flags represent explicit outcomes, not real infrastructure guarantees.
    public static final class Storage {
        public boolean hasReadingsCsv;
        public boolean hasDiagnosticsReport;
        public boolean failAfterReadingsWrite;

        public void writeArtifacts() {
            hasReadingsCsv = true;
            if (failAfterReadingsWrite) throw new IllegalStateException("storage write failed");
            hasDiagnosticsReport = true;
        }
    }

    public static final class Database {
        public boolean hasRunRow;
        public boolean failAfterStagedInsert;

        public Transaction begin() { return new Transaction(this); }
    }

    public static final class Transaction {
        private final Database database;
        private boolean pendingRunRow;

        private Transaction(Database database) {
            this.database = database;
            this.pendingRunRow = database.hasRunRow;
        }

        public void insert() {
            pendingRunRow = true;
            if (database.failAfterStagedInsert) throw new IllegalStateException("database insert failed");
        }

        public void commit() { database.hasRunRow = pendingRunRow; }
        public void rollback() { pendingRunRow = database.hasRunRow; }
    }

    public static void record(Storage storage, Database database) {
        storage.writeArtifacts();
        Transaction transaction = database.begin();
        try {
            transaction.insert();
            transaction.commit();
        } catch (RuntimeException e) {
            transaction.rollback();
            throw e;
        }
    }
}
