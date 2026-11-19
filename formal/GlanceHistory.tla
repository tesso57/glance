-------------------------- MODULE GlanceHistory --------------------------
EXTENDS Naturals

\* recordModel in extensions/history.ts. Models represents already-read
\* Spec.tla/Spec.cfg pairs, identified by their two digests.
\* The history starts empty and changes only by recordModel. A successful
\* directory rename is atomic. File contents and crash durability are abstracted.
CONSTANTS Writers, Models, ModelCheckLimit
VARIABLES lastId, published, pending
vars == <<lastId, published, pending>>

NoFiles == {}
SpecFile == {"Spec.tla"}
InputFiles == SpecFile \cup {"Spec.cfg"}
CompleteFiles == InputFiles \cup {"metadata.json"}
FileStages == {NoFiles, SpecFile, InputFiles, CompleteFiles}
Attempt(id, model, files) == [id |-> id, model |-> model, files |-> files]
Idle == Attempt(0, "", NoFiles)

Init ==
    /\ lastId = 0
    /\ published = {}
    /\ pending = [w \in Writers |-> Idle]

Saved(model, reuseEarlier) ==
    \E revision \in published :
        /\ revision.model = model
        /\ reuseEarlier \/ revision.id = lastId

Begin(w, model, reuseEarlier) ==
    /\ pending[w] = Idle
    /\ ~Saved(model, reuseEarlier)
    /\ pending' = [pending EXCEPT ![w] = Attempt(lastId + 1, model, NoFiles)]
    /\ UNCHANGED <<lastId, published>>

Write(w, from, to) ==
    /\ pending[w] # Idle
    /\ pending[w].files = from
    /\ pending' = [pending EXCEPT ![w].files = to]
    /\ UNCHANGED <<lastId, published>>

\* A rename to an already published, nonempty directory fails. The stale
\* attempt is discarded and Begin chooses a fresh slot on the next iteration.
\* A write failure likewise discards the temporary directory.
Discard(w) ==
    /\ pending[w] # Idle
    /\ pending' = [pending EXCEPT ![w] = Idle]
    /\ UNCHANGED <<lastId, published>>

\* A successful rename is atomic and publishes all three files.
Publish(w) ==
    /\ pending[w].id = lastId + 1
    /\ pending[w].files = CompleteFiles
    /\ lastId' = pending[w].id
    /\ published' = published \cup {pending[w]}
    /\ pending' = [pending EXCEPT ![w] = Idle]

Next ==
    \E w \in Writers :
        \/ \E model \in Models, reuseEarlier \in BOOLEAN : Begin(w, model, reuseEarlier)
        \/ Write(w, NoFiles, SpecFile)
        \/ Write(w, SpecFile, InputFiles)
        \/ Write(w, InputFiles, CompleteFiles)
        \/ Discard(w)
        \/ Publish(w)

Spec == Init /\ [][Next]_vars

Safety ==
    /\ lastId \in Nat
    /\ published \subseteq [id : 1..lastId, model : Models, files : {CompleteFiles}]
    /\ \A a, b \in published : a.id = b.id => a = b
    /\ \A id \in 1..lastId : \E revision \in published : revision.id = id

PendingOK ==
    pending \in [Writers ->
        {Idle} \cup [id : 1..(lastId + 1), model : Models, files : FileStages]]

AppendOnly == [][published \subseteq published']_vars

\* Only TLC uses this limit. The proof makes no assumption about ModelCheckLimit.
SmallHistory == lastId <= ModelCheckLimit

==========================================================================
