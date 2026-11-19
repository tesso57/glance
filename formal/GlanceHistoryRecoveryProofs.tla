--------------------- MODULE GlanceHistoryRecoveryProofs ---------------------
EXTENDS GlanceHistoryRecovery, GlanceHistoryProofs

THEOREM RecoveryRefinesHistory == RecoverySpec => Spec
<1>1. RecoveryInit => Init
    BY DEF RecoveryInit
<1>2. [RecoveryNext]_recoveryVars => [Next]_vars
    <2>1. \A w \in Writers : Stop(w) => [Next]_vars
        BY DEF Stop, Next
    <2>2. QED
        BY <2>1 DEF RecoveryNext, Plan, CreateTemp, WriteTemp,
                   RetryCollision, FailAndClean, CommitRename, FinishSave,
                   ReuseSaved, Restart, OpenHistory, Next, recoveryVars
<1>3. QED
    BY <1>1, <1>2, PTL DEF RecoverySpec, Spec

THEOREM RecoveryHistorySafety == RecoverySpec => ([]Safety /\ AppendOnly)
    BY RecoveryRefinesHistory, HistorySafety, HistoryIsAppendOnly

THEOREM RecoveryObservations == RecoverySpec => []RecoverySafety
<1>1. RecoveryInit => RecoverySafety
    BY SMT DEF RecoveryInit, Init, RecoverySafety
<1>2. RecoverySafety /\ [RecoveryNext]_recoveryVars => RecoverySafety'
    <2>1. \A w \in Writers, m \in Models, b \in BOOLEAN :
              RecoverySafety /\ Plan(w, m, b) => RecoverySafety'
        BY SMT DEF RecoverySafety, Plan, Begin
    <2>2. \A w \in Writers : RecoverySafety /\ CreateTemp(w) => RecoverySafety'
        BY SMT DEF RecoverySafety, CreateTemp, vars
    <2>3. \A w \in Writers, from, to \in FileStages :
              RecoverySafety /\ WriteTemp(w, from, to) => RecoverySafety'
        BY SMT DEF RecoverySafety, WriteTemp, Write, recovery
    <2>4. \A w \in Writers :
              RecoverySafety /\ (RetryCollision(w) \/ FailAndClean(w)) => RecoverySafety'
        BY SMT DEF RecoverySafety, RetryCollision, FailAndClean, Discard
    <2>5. \A w \in Writers : RecoverySafety /\ CommitRename(w) => RecoverySafety'
        BY SMT DEF RecoverySafety, CommitRename, Publish, SetWorker
    <2>6. \A w \in Writers, success \in BOOLEAN :
              RecoverySafety /\ FinishSave(w, success) => RecoverySafety'
        BY SMT DEF RecoverySafety, FinishSave, vars, SetWorker
    <2>7. \A w \in Writers, m \in Models, b \in BOOLEAN, r \in published :
              RecoverySafety /\ ReuseSaved(w, m, b, r) => RecoverySafety'
        BY SMT DEF RecoverySafety, ReuseSaved, vars
    <2>8. \A w \in Writers : RecoverySafety /\ Stop(w) => RecoverySafety'
        BY SMT DEF RecoverySafety, Stop, Discard, vars, SetWorker
    <2>9. \A w \in Writers : RecoverySafety /\ Restart(w) => RecoverySafety'
        BY SMT DEF RecoverySafety, Restart, vars
    <2>10. \A w \in Writers : RecoverySafety /\ OpenHistory(w) => RecoverySafety'
        BY SMT DEF RecoverySafety, OpenHistory, vars
    <2>11. RecoverySafety /\ UNCHANGED recoveryVars => RecoverySafety'
        BY DEF RecoverySafety, recoveryVars, vars, recovery
    <2>12. QED
        BY <2>1, <2>2, <2>3, <2>4, <2>5, <2>6, <2>7, <2>8, <2>9, <2>10, <2>11
           DEF RecoveryNext, FileStages
<1>3. QED
    BY <1>1, <1>2, PTL DEF RecoverySpec

THEOREM StopAndResidueSafety ==
    RecoverySpec => (StopKeepsPublished /\ ResiduePersists)
<1>1. RecoveryNext =>
          (EnteringStoppedPreservesHistory /\ leftovers \subseteq leftovers')
    BY SMT DEF RecoveryNext, Plan, CreateTemp, WriteTemp, RetryCollision,
               FailAndClean, CommitRename, Publish, FinishSave, ReuseSaved,
               Stop, Discard, Restart, OpenHistory, EnteringStoppedPreservesHistory,
               vars, recovery, SetWorker
<1>2. QED
    BY <1>1, PTL DEF RecoverySpec, StopKeepsPublished, ResiduePersists

THEOREM CollisionRetrySafety == RecoverySpec => RetryUsesSameRequest
<1>1. RecoveryNext => RetryKeepsRequest
    BY SMT DEF RecoveryNext, Plan, MayScan, CreateTemp, WriteTemp, RetryCollision,
               FailAndClean, CommitRename, FinishSave, ReuseSaved, Stop, Restart,
               OpenHistory, RetryKeepsRequest, recovery, SetWorker
<1>2. QED
    BY <1>1, PTL DEF RecoverySpec, RetryUsesSameRequest

THEOREM RecoveryPlansFromHead == RecoverySpec => PlansFromPublishedHead
<1>1. RecoverySpec => []PendingOK
    BY RecoveryRefinesHistory, HistoryInvariant, PTL DEF Inv
<1>2. PendingOK /\ RecoveryNext => NewPlanUsesHead
    BY SMT DEF RecoveryNext, Plan, Begin, CreateTemp, WriteTemp, RetryCollision,
               FailAndClean, CommitRename, FinishSave, ReuseSaved, Stop, Restart,
               OpenHistory, NewPlanUsesHead, PendingOK, recovery, vars, Attempt, SetWorker
<1>3. QED
    BY <1>1, <1>2, PTL DEF RecoverySpec, PlansFromPublishedHead

============================================================================
