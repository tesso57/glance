import java.util.HashMap;
import java.util.Map;

public final class MemoryDependencies {
    private MemoryDependencies() {}

    public static final class Documents implements PublishService.Documents {
        public final Map<String, Document> records = new HashMap<>();
        public boolean failSave;
        @Override public Document find(String id) { return records.get(id); }
        @Override public void save(Document doc) {
            if (failSave) throw new IllegalStateException("save failed");
            records.put(doc.id(), doc);
        }
    }

    public static final class Storage implements PublishService.Storage {
        public final Map<String, Boolean> pages = new HashMap<>();
        public boolean failAfterWrite;
        @Override public void put(String id) {
            pages.put(id, true);
            if (failAfterWrite) throw new IllegalStateException("storage failed");
        }
    }

    public static final class Notifier implements PublishService.Notifier {
        public final Map<String, Integer> sent = new HashMap<>();
        public boolean failSend;
        @Override public void send(String id) {
            if (failSend) throw new IllegalStateException("send failed");
            sent.merge(id, 1, Integer::sum);
        }
    }
}
