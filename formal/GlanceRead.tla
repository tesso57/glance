----------------------------- MODULE GlanceRead -----------------------------
EXTENDS GlanceHistory, FiniteSets

\* listRevisions in extensions/history.ts. One enumeration captures a subset
\* of the published directories, excluding temporary directories. A save
\* after that enumeration can only append; no external mutation is modeled.
\* ReadSuccess represents validated metadata for the given published record.
\* ReadFailure abstracts any read or validation error by its revision ID.
CONSTANT BatchSize
ASSUME BatchSize \in Nat \ {0}

VARIABLES listed, loaded, batch, failed, phase, errorId
reader == <<listed, loaded, batch, failed, phase, errorId>>
combined == <<vars, reader>>
Ids(revisions) == {revision.id : revision \in revisions}
Remaining == Ids(listed) \ Ids(loaded)
Settled == batch \subseteq Ids(loaded) \cup failed

ReaderInit ==
    /\ Init
    /\ listed = {}
    /\ loaded = {}
    /\ batch = {}
    /\ failed = {}
    /\ phase = "idle"
    /\ errorId = 0

BeginList(observed) ==
    /\ phase = "idle"
    /\ listed' = observed
    /\ phase' = "reading"
    /\ UNCHANGED <<vars, loaded, batch, failed, errorId>>

StartBatch(ids) ==
    /\ phase = "reading"
    /\ batch = {}
    /\ ids # {}
    /\ ids \subseteq Remaining
    /\ Cardinality(ids) <= BatchSize
    /\ Cardinality(ids) = BatchSize \/ ids = Remaining
    /\ \A id \in ids, other \in Remaining \ ids : ~(other < id)
    /\ batch' = ids
    /\ UNCHANGED <<vars, listed, loaded, failed, phase, errorId>>

ReadSuccess(revision) ==
    /\ phase = "reading"
    /\ revision.id \in batch \ (Ids(loaded) \cup failed)
    /\ loaded' = loaded \cup {revision}
    /\ UNCHANGED <<vars, listed, batch, failed, phase, errorId>>

ReadFailure(id) ==
    /\ phase = "reading"
    /\ id \in batch \ (Ids(loaded) \cup failed)
    /\ failed' = failed \cup {id}
    /\ UNCHANGED <<vars, listed, loaded, batch, phase, errorId>>

AcceptBatch ==
    /\ phase = "reading"
    /\ batch # {}
    /\ Settled
    /\ failed = {}
    /\ batch' = {}
    /\ UNCHANGED <<vars, listed, loaded, failed, phase, errorId>>

RejectBatch(id) ==
    /\ phase = "reading"
    /\ Settled
    /\ id \in failed
    /\ \A other \in failed : ~(other < id)
    /\ phase' = "error"
    /\ errorId' = id
    /\ UNCHANGED <<vars, listed, loaded, batch, failed>>

FinishList ==
    /\ phase = "reading"
    /\ batch = {}
    /\ Remaining = {}
    /\ phase' = "done"
    /\ UNCHANGED <<vars, listed, loaded, batch, failed, errorId>>

PublishStep == Next /\ UNCHANGED reader

ReaderNext ==
    \/ PublishStep
    \/ \E observed \in SUBSET published : BeginList(observed)
    \/ \E ids \in SUBSET Remaining : StartBatch(ids)
    \/ \E revision \in published : ReadSuccess(revision)
    \/ \E id \in batch : ReadFailure(id) \/ RejectBatch(id)
    \/ AcceptBatch
    \/ FinishList

ReaderSpec == ReaderInit /\ [][ReaderNext]_combined

ReaderSafety ==
    /\ listed \subseteq published
    /\ loaded \subseteq listed
    /\ batch \subseteq Ids(listed)
    /\ batch # {} => Cardinality(batch) <= BatchSize
    /\ failed \subseteq batch \ Ids(loaded)
    /\ \A id \in batch, other \in Remaining \ batch : ~(other < id)
    /\ phase = "idle" => batch = {} /\ loaded = {}
    /\ phase = "done" => loaded = listed
    /\ phase = "error" =>
         /\ errorId \in failed
         /\ \A id \in Ids(listed) : id < errorId => id \in Ids(loaded)

FixedListing == [][phase # "idle" => listed' = listed]_combined

============================================================================
