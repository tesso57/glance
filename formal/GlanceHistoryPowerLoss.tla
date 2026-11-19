----------------------- MODULE GlanceHistoryPowerLoss -----------------------
EXTENDS GlanceHistory

\* One save through recordModel in extensions/history.ts. A successful
\* rename publishes to the live filesystem. The writes do not request flush
\* and there is no directory sync before the call returns.
\* For this counterexample, allow a reboot to retain or lose the published
\* directory. This assumption does not describe a particular filesystem.
VARIABLES phase, acknowledged
powerVars == <<vars, phase, acknowledged>>

PowerInit == Init /\ phase = "saving" /\ acknowledged = {}

SaveStep ==
    /\ phase = "saving"
    /\ lastId = 0
    /\ Next
    /\ UNCHANGED <<phase, acknowledged>>

ReturnSuccess ==
    /\ phase = "saving"
    /\ lastId = 1
    /\ phase' = "returned"
    /\ acknowledged' = published
    /\ UNCHANGED vars

ReopenAfterPowerLoss(retained) ==
    /\ phase = "returned"
    /\ phase' = "reopened"
    /\ published' = IF retained THEN published ELSE {}
    /\ lastId' = IF retained THEN lastId ELSE 0
    /\ pending' = [w \in Writers |-> Idle]
    /\ UNCHANGED acknowledged

PowerNext ==
    \/ SaveStep
    \/ ReturnSuccess
    \/ \E retained \in BOOLEAN : ReopenAfterPowerLoss(retained)

PowerSpec == PowerInit /\ [][PowerNext]_powerVars

\* Expected to fail. This is a durability claim, not atomic publication.
AcknowledgedSaveSurvives == acknowledged \subseteq published

============================================================================
