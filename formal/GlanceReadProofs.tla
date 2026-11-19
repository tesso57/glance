-------------------------- MODULE GlanceReadProofs --------------------------
EXTENDS GlanceRead, GlanceHistoryProofs

THEOREM ReaderRefinement == ReaderSpec => Spec
<1>1. ReaderInit => Init
    BY DEF ReaderInit
<1>2. [ReaderNext]_combined => [Next]_vars
    BY DEF ReaderNext, PublishStep, BeginList, StartBatch, ReadSuccess,
           ReadFailure, AcceptBatch, RejectBatch, FinishList, combined
<1>3. QED
    BY <1>1, <1>2, PTL DEF ReaderSpec, Spec

THEOREM ReaderKeepsListing == ReaderSpec => FixedListing
<1>1. [ReaderNext]_combined => [phase # "idle" => listed' = listed]_combined
    BY DEF ReaderNext, PublishStep, BeginList, StartBatch, ReadSuccess,
           ReadFailure, AcceptBatch, RejectBatch, FinishList, reader, combined
<1>2. QED
    BY <1>1, PTL DEF ReaderSpec, FixedListing

THEOREM ParallelReadCorrectness == ReaderSpec => []ReaderSafety
<1>1. ReaderInit => ReaderSafety
    BY SMT DEF ReaderInit, Init, ReaderSafety, Ids, Remaining
<1>2. Safety /\ ReaderSafety /\ [ReaderNext]_combined => ReaderSafety'
    <2>1. ReaderSafety /\ PublishStep => ReaderSafety'
        BY SMT DEF ReaderSafety, PublishStep, Next, Begin, Write, Discard,
                   Publish, Remaining, reader
    <2>2. \A observed \in SUBSET published : ReaderSafety /\ BeginList(observed) => ReaderSafety'
        BY SMT DEF BeginList, ReaderSafety, Ids, Remaining, vars
    <2>3. \A ids \in SUBSET Remaining : ReaderSafety /\ StartBatch(ids) => ReaderSafety'
        BY SMT DEF StartBatch, ReaderSafety, Remaining, vars
    <2>4. \A revision \in published : Safety /\ ReaderSafety /\ ReadSuccess(revision) => ReaderSafety'
        <3> SUFFICES ASSUME NEW revision \in published, Safety, ReaderSafety, ReadSuccess(revision)
                     PROVE ReaderSafety'
            OBVIOUS
        <3>1. PICK prior \in listed : prior.id = revision.id
            BY SMT DEF ReadSuccess, ReaderSafety, Ids
        <3>2. prior = revision
            BY SMT, <3>1 DEF Safety, ReaderSafety
        <3>3. QED
            BY SMT, <3>1, <3>2 DEF ReadSuccess, ReaderSafety, Ids, Remaining, vars
    <2>5. \A id \in batch : ReaderSafety /\ ReadFailure(id) => ReaderSafety'
        BY SMT DEF ReadFailure, ReaderSafety, Remaining, vars
    <2>6. ReaderSafety /\ AcceptBatch => ReaderSafety'
        BY SMT DEF AcceptBatch, ReaderSafety, Remaining, vars
    <2>7. \A id \in batch : ReaderSafety /\ RejectBatch(id) => ReaderSafety'
        <3> SUFFICES ASSUME NEW id \in batch, ReaderSafety, RejectBatch(id)
                     PROVE ReaderSafety'
            OBVIOUS
        <3>1. \A earlier \in Ids(listed) : earlier < id => earlier \in Ids(loaded)
            <4> SUFFICES ASSUME NEW earlier \in Ids(listed), earlier < id
                         PROVE earlier \in Ids(loaded)
                OBVIOUS
            <4>1. earlier \in batch \/ earlier \in Ids(loaded)
                BY SMT DEF ReaderSafety, Remaining
            <4>2. earlier \notin failed
                BY SMT DEF RejectBatch
            <4>3. QED
                BY SMT, <4>1, <4>2 DEF RejectBatch, Settled
        <3>2. QED
            BY SMT, <3>1 DEF RejectBatch, ReaderSafety, Remaining, vars
    <2>8. Safety /\ ReaderSafety /\ FinishList => ReaderSafety'
        <3> SUFFICES ASSUME Safety, ReaderSafety, FinishList PROVE ReaderSafety'
            OBVIOUS
        <3>1. listed \subseteq loaded
            <4> SUFFICES ASSUME NEW revision \in listed PROVE revision \in loaded
                OBVIOUS
            <4>1. PICK found \in loaded : found.id = revision.id
                BY SMT DEF FinishList, Remaining, Ids
            <4>2. found = revision
                BY SMT, <4>1 DEF Safety, ReaderSafety
            <4>3. QED
                BY <4>1, <4>2
        <3>2. loaded \subseteq listed
            BY DEF ReaderSafety
        <3>3. loaded = listed
            BY SMT, <3>1, <3>2, SetExtensionality
        <3>4. QED
            BY <3>3 DEF ReaderSafety, FinishList, Remaining, vars
    <2>9. ReaderSafety /\ UNCHANGED combined => ReaderSafety'
        BY DEF ReaderSafety, Remaining, combined, vars, reader
    <2>10. QED
        BY <2>1, <2>2, <2>3, <2>4, <2>5, <2>6, <2>7, <2>8, <2>9 DEF ReaderNext
<1>3. ReaderSpec => []Safety
    BY ReaderRefinement, HistorySafety
<1>4. QED
    BY <1>1, <1>2, <1>3, PTL DEF ReaderSpec
============================================================================
