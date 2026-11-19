---------------------------- MODULE Spec ----------------------------
VARIABLE status

vars == <<status>>
Init == status = "todo"
Start == /\ status = "todo" /\ status' = "inprogress"
Complete == /\ status = "inprogress" /\ status' = "done"
Done == /\ status = "done" /\ UNCHANGED status
Next == Start \/ Complete \/ Done
Spec == Init /\ [][Next]_vars
TypeOK == status \in {"todo", "inprogress", "done"}
====================================================================
