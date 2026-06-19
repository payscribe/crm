"use client";

import { updateLeadStageAndStatus } from "@/app/leads/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { leadStages, leadStatuses } from "@/lib/constants/leads";
import type { LeadStage, LeadStatus } from "@/lib/types/leads";

type LeadStageStatusFormProps = {
  leadId: string;
  leadName: string;
  currentStage: LeadStage;
  currentStatus: LeadStatus;
  returnTo: string;
  canEdit: boolean;
};

export function LeadStageStatusForm({
  leadId,
  leadName,
  currentStage,
  currentStatus,
  returnTo,
  canEdit
}: LeadStageStatusFormProps) {
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const nextStage = String(formData.get("stage") ?? "");
    const nextStatus = String(formData.get("status") ?? "");

    if (
      (nextStage === "Closed Lost" || nextStatus === "Closed Lost") &&
      !window.confirm(
        `Mark ${leadName} as Closed Lost? This is a destructive pipeline change and should only be done after review.`
      )
    ) {
      event.preventDefault();
    }
  }

  return (
    <form action={updateLeadStageAndStatus} onSubmit={handleSubmit}>
      <input type="hidden" name="lead_id" value={leadId} />
      <input type="hidden" name="return_to" value={returnTo} />
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <select
          name="stage"
          defaultValue={currentStage}
          disabled={!canEdit}
          className="rounded border border-neutral-300 bg-white px-2 py-2 text-xs outline-none focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20 disabled:bg-neutral-100 disabled:text-neutral-500"
        >
          {leadStages.map((stage) => (
            <option key={stage} value={stage}>
              {stage}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={currentStatus}
          disabled={!canEdit}
          className="rounded border border-neutral-300 bg-white px-2 py-2 text-xs outline-none focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20 disabled:bg-neutral-100 disabled:text-neutral-500"
        >
          {leadStatuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        {canEdit ? (
          <SubmitButton size="sm" pendingText="Moving...">
            Move
          </SubmitButton>
        ) : null}
      </div>
    </form>
  );
}
