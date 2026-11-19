public final class PublishService {
    public interface Documents {
        Document find(String id);
        void save(Document document);
    }

    public interface Storage {
        void put(String id);
    }

    public interface Notifier {
        void send(String id);
    }

    private final Documents documents;
    private final Storage storage;
    private final Notifier notifier;

    public PublishService(Documents documents, Storage storage, Notifier notifier) {
        this.documents = documents;
        this.storage = storage;
        this.notifier = notifier;
    }

    // The implementations used in this benchmark are in MemoryDependencies.
    public void publish(String id) {
        Document doc = documents.find(id);
        if (doc == null) throw new IllegalArgumentException("not found");
        if (doc.status() == Document.Status.PUBLISHED) return;
        if (doc.status() != Document.Status.DRAFT) throw new IllegalStateException("not a draft");

        storage.put(id);
        documents.save(new Document(doc.id(), Document.Status.PUBLISHED));
        notifier.send(id);
    }
}
