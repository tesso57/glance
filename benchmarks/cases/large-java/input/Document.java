public record Document(String id, Status status) {
    public enum Status { DRAFT, PUBLISHED, ARCHIVED }
}
