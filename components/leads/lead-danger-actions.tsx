"use client";

import { deleteLead, linkLeadToBusiness } from "@/app/leads/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Business } from "@/lib/types/businesses";

type LeadDangerActionsProps = {
  businesses: Business[];
  linkedBusinessId: string | null;
  leadId: string;
  leadName: string;
  canDelete: boolean;
  canLinkBusiness: boolean;
};

export function LeadDangerActions({
  businesses,
  linkedBusinessId,
  leadId,
  leadName,
  canDelete,
  canLinkBusiness
}: LeadDangerActionsProps) {
  function confirmLink(event: React.FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        `Link ${leadName} to this registered business and mark the lead Closed Won?`
      )
    ) {
      event.preventDefault();
    }
  }

  function confirmDelete(event: React.FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        `Delete ${leadName}? This permanently removes the lead and its communication history. Confirm?`
      )
    ) {
      event.preventDefault();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {linkedBusinessId ? (
        <div className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          This lead is linked to business {linkedBusinessId}.
        </div>
      ) : null}

      {canLinkBusiness && !linkedBusinessId ? (
        <form
          action={linkLeadToBusiness}
          onSubmit={confirmLink}
          className="grid gap-3 md:grid-cols-[1fr_auto]"
        >
          <input type="hidden" name="lead_id" value={leadId} />
          <select
            required
            name="business_id"
            className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
          >
            <option value="">Select registered business</option>
            {businesses.map((business) => (
              <option key={business.business_id} value={business.business_id}>
                {business.business_name} - {business.business_id}
              </option>
            ))}
          </select>
          <SubmitButton pendingText="Linking business...">
            Link to Registered Business
          </SubmitButton>
        </form>
      ) : null}

      {canDelete ? (
        <form action={deleteLead} onSubmit={confirmDelete}>
          <input type="hidden" name="lead_id" value={leadId} />
          <SubmitButton
            variant="outline"
            pendingText="Deleting lead..."
            className="border-red-300 text-red-700 hover:border-red-400 hover:bg-red-50 hover:text-red-800"
          >
            Delete Lead
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
