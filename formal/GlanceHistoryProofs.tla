------------------------ MODULE GlanceHistoryProofs ----------------------
EXTENDS GlanceHistory, TLAPS

Inv == Safety /\ PendingOK

THEOREM HistoryInvariant == Spec => []Inv
<1>1. Init => Inv
    BY SMT DEF Init, Inv, Safety, PendingOK, Idle, Attempt, NoFiles
<1>2. Inv /\ [Next]_vars => Inv'
    <2>1. \A w \in Writers, m \in Models, b \in BOOLEAN :
              Inv /\ Begin(w, m, b) => Inv'
        BY SMT DEF Inv, Begin, Safety, PendingOK, Idle, Attempt,
                   FileStages, NoFiles
    <2>2. \A w \in Writers, from, to \in FileStages :
              Inv /\ Write(w, from, to) => Inv'
        BY SMT DEF Inv, Write, Safety, PendingOK, Idle, Attempt, NoFiles
    <2>3. \A w \in Writers : Inv /\ Discard(w) => Inv'
        BY SMT DEF Inv, Discard, Safety, PendingOK
    <2>4. \A w \in Writers : Inv /\ Publish(w) => Inv'
        <3> SUFFICES ASSUME NEW w \in Writers, Inv, Publish(w)
                     PROVE Inv'
            OBVIOUS
        <3>1. /\ lastId' \in Nat
              /\ 1..lastId' = (1..lastId) \cup {lastId'}
              /\ lastId' \notin 1..lastId
            BY SMT DEF Inv, Safety, Publish
        <3>2. pending[w] # Idle
            BY SMT DEF Inv, Safety, Publish, Idle, Attempt
        <3>3. pending[w] \in [id : 1..lastId', model : Models, files : {CompleteFiles}]
            BY SMT, <3>1, <3>2 DEF Inv, PendingOK, Publish
        <3>4. Safety'
            BY SMT, <3>1, <3>3 DEF Inv, Safety, Publish
        <3>5. PendingOK'
            BY SMT DEF Inv, Safety, PendingOK, Publish
        <3>6. QED
            BY <3>4, <3>5 DEF Inv
    <2>5. Inv /\ UNCHANGED vars => Inv'
        BY DEF Inv, Safety, PendingOK, vars
    <2>6. QED
        BY <2>1, <2>2, <2>3, <2>4, <2>5 DEF Next, FileStages
<1>3. QED
    BY <1>1, <1>2, PTL DEF Spec

THEOREM HistorySafety == Spec => []Safety
    BY HistoryInvariant, PTL DEF Inv

THEOREM HistoryIsAppendOnly == Spec => AppendOnly
<1>1. [Next]_vars => [published \subseteq published']_vars
    BY DEF Next, Begin, Write, Discard, Publish, vars
<1>2. QED
    BY <1>1, PTL DEF Spec, AppendOnly

==========================================================================
