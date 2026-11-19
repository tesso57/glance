------------------------ MODULE GlanceHistoryRecovery ------------------------
EXTENDS GlanceHistory, FiniteSets

\* A process stops abruptly while its OS and filesystem stay up. A rename
\* interrupted in flight is modeled on either side of its atomic commit.
\* Only recordModel changes the history. IDs fit in JS safe integers, and the
\* filesystem preserves completed writes and renames across a process stop.
\* Stopped slots restart as new processes with no retained in-memory attempt.
\* opened and returned record observations, outside the processes' memory.
VARIABLES phase, request, leftovers, completion, opened, returned
recovery == <<phase, request, leftovers, completion, opened, returned>>
recoveryVars == <<vars, recovery>>

SetWorker(state, w, value) == [other \in Writers |-> IF other = w THEN value ELSE state[other]]
SaveRequest(model, reuseEarlier) ==
    [active |-> TRUE, model |-> model, reuseEarlier |-> reuseEarlier]
NoRequest == [active |-> FALSE, model |-> "", reuseEarlier |-> FALSE]

RecoveryInit ==
    /\ Init
    /\ phase = [w \in Writers |-> "ready"]
    /\ request = [w \in Writers |-> NoRequest]
    /\ leftovers = {}
    /\ completion = [w \in Writers |-> Idle]
    /\ opened = {}
    /\ returned = Idle

MayScan(w, model, reuseEarlier) ==
    \/ phase[w] = "ready"
    \/ phase[w] = "retrying" /\ request[w] = SaveRequest(model, reuseEarlier)

\* recordModel enumerates vN directories and chooses an ID before mkdtemp.
Plan(w, model, reuseEarlier) ==
    /\ MayScan(w, model, reuseEarlier)
    /\ Begin(w, model, reuseEarlier)
    /\ phase' = SetWorker(phase, w, "planned")
    /\ request' = SetWorker(request, w, SaveRequest(model, reuseEarlier))
    /\ UNCHANGED <<leftovers, completion, opened, returned>>

CreateTemp(w) ==
    /\ phase[w] = "planned"
    /\ phase' = SetWorker(phase, w, "writing")
    /\ UNCHANGED <<vars, request, leftovers, completion, opened, returned>>

WriteTemp(w, from, to) ==
    /\ phase[w] = "writing"
    /\ Write(w, from, to)
    /\ UNCHANGED recovery

\* EEXIST or ENOTEMPTY followed by successful finally cleanup returns to the
\* top of the loop with the same model and reuse policy. Stopping before
\* cleanup is covered by Stop while writing.
RetryCollision(w) ==
    /\ phase[w] = "writing"
    /\ pending[w].files = CompleteFiles
    /\ pending[w].id <= lastId
    /\ Discard(w)
    /\ phase' = SetWorker(phase, w, "retrying")
    /\ UNCHANGED <<request, leftovers, completion, opened, returned>>

\* Other write or rename errors propagate after successful cleanup.
FailAndClean(w) ==
    /\ phase[w] = "writing"
    /\ Discard(w)
    /\ phase' = SetWorker(phase, w, "ready")
    /\ request' = SetWorker(request, w, NoRequest)
    /\ UNCHANGED <<leftovers, completion, opened, returned>>

CommitRename(w) ==
    /\ phase[w] = "writing"
    /\ Publish(w)
    /\ completion' = SetWorker(completion, w, pending[w])
    /\ phase' = SetWorker(phase, w, "committed")
    /\ request' = SetWorker(request, w, NoRequest)
    /\ UNCHANGED <<leftovers, opened, returned>>

\* The successful rename has already removed the temp name. The normal
\* return occurs after finally; a stop or cleanup error can prevent the
\* caller from receiving it without undoing the commit.
FinishSave(w, success) ==
    /\ phase[w] = "committed"
    /\ phase' = SetWorker(phase, w, "ready")
    /\ returned' = IF success THEN completion[w] ELSE returned
    /\ completion' = SetWorker(completion, w, Idle)
    /\ UNCHANGED <<vars, request, leftovers, opened>>

Eligible(model, reuseEarlier) ==
    {revision \in published :
         revision.model = model /\ (reuseEarlier \/ revision.id = lastId)}

ReuseSaved(w, model, reuseEarlier, revision) ==
    /\ MayScan(w, model, reuseEarlier)
    /\ revision \in Eligible(model, reuseEarlier)
    /\ \A other \in Eligible(model, reuseEarlier) : ~(revision.id < other.id)
    /\ phase' = SetWorker(phase, w, "ready")
    /\ request' = SetWorker(request, w, NoRequest)
    /\ returned' = revision
    /\ UNCHANGED <<vars, leftovers, completion, opened>>

\* Each residue stands for one or more distinct .pending-* names. Its files
\* are the completed write prefix; a write interrupted in progress can also
\* leave a partial file. mkdtemp picks a fresh name even when the next save
\* chooses the same candidate ID. Recovery does not touch the residue.
Stop(w) ==
    /\ phase[w] # "stopped"
    /\ IF pending[w] = Idle THEN UNCHANGED vars ELSE Discard(w)
    /\ leftovers' =
           IF phase[w] = "writing" THEN leftovers \cup {pending[w]} ELSE leftovers
    /\ phase' = SetWorker(phase, w, "stopped")
    /\ completion' = SetWorker(completion, w, Idle)
    /\ request' = SetWorker(request, w, NoRequest)
    /\ UNCHANGED <<opened, returned>>

Restart(w) ==
    /\ phase[w] = "stopped"
    /\ phase' = SetWorker(phase, w, "ready")
    /\ UNCHANGED <<vars, request, leftovers, completion, opened, returned>>

\* Model a successful listing at a point when the namespace is settled.
\* revisionIds filters .pending-*; GlanceRead covers overlapping enumeration.
OpenHistory(w) ==
    /\ phase[w] = "ready"
    /\ opened' = published
    /\ UNCHANGED <<vars, phase, request, leftovers, completion, returned>>

RecoveryNext ==
    \E w \in Writers :
        \/ \E model \in Models, reuseEarlier \in BOOLEAN :
              \/ Plan(w, model, reuseEarlier)
              \/ \E revision \in published : ReuseSaved(w, model, reuseEarlier, revision)
        \/ CreateTemp(w)
        \/ WriteTemp(w, NoFiles, SpecFile)
        \/ WriteTemp(w, SpecFile, InputFiles)
        \/ WriteTemp(w, InputFiles, CompleteFiles)
        \/ RetryCollision(w)
        \/ FailAndClean(w)
        \/ CommitRename(w)
        \/ \E success \in BOOLEAN : FinishSave(w, success)
        \/ Stop(w)
        \/ Restart(w)
        \/ OpenHistory(w)

RecoverySpec == RecoveryInit /\ [][RecoveryNext]_recoveryVars

ProcessState ==
    \A w \in Writers :
        /\ (phase[w] \in {"planned", "writing"}) <=> (pending[w] # Idle)
        /\ (phase[w] = "committed") <=> (completion[w] # Idle)
        /\ (phase[w] \in {"planned", "writing", "retrying"}) <=> (request[w] # NoRequest)
        /\ pending[w] # Idle => pending[w].model = request[w].model

RecoverySafety ==
    /\ opened \subseteq published
    /\ returned \in published \cup {Idle}
    /\ \A w \in Writers : completion[w] \in published \cup {Idle}

\* At a new scan, the published head alone sets the next ID. The comparison
\* uses the pre-state: another writer can commit before the planned rename.
NewPlanUsesHead ==
    \A w \in Writers :
        phase[w] \in {"ready", "retrying"} /\ phase'[w] = "planned" =>
            pending'[w].id = lastId + 1

EnteringStoppedPreservesHistory ==
    \A w \in Writers :
        phase[w] # "stopped" /\ phase'[w] = "stopped" =>
            UNCHANGED <<lastId, published>>

RetryKeepsRequest ==
    \A w \in Writers :
        (\/ phase[w] = "writing" /\ phase'[w] = "retrying"
         \/ phase[w] = "retrying" /\ phase'[w] = "planned") =>
            request'[w] = request[w]

PlansFromPublishedHead == [][NewPlanUsesHead]_recoveryVars
StopKeepsPublished == [][EnteringStoppedPreservesHistory]_recoveryVars
ResiduePersists == [][leftovers \subseteq leftovers']_recoveryVars
RetryUsesSameRequest == [][RetryKeepsRequest]_recoveryVars

\* Only TLC uses these bounds. Multiplicity of identical residues is abstracted.
CONSTANT ModelCheckOrphanLimit
SmallRecovery == SmallHistory /\ Cardinality(leftovers) <= ModelCheckOrphanLimit

============================================================================
