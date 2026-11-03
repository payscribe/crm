// A lead is closed once it is won, lost or converted, whichever of stage or
// status says so. Closed leads have no follow-up date and get no reminders.
export function isClosedLeadState(stage: string, status: string) {
  return (
    status === "Closed Won" ||
    status === "Closed Lost" ||
    stage === "Converted" ||
    stage === "Closed Lost"
  );
}

export function isClosedLead(lead: { stage: string; status: string }) {
  return isClosedLeadState(lead.stage, lead.status);
}
