"use client";

import { closeTicket } from "@/app/tickets/actions";
import { SubmitButton } from "@/components/ui/submit-button";

type CloseTicketFormProps = {
  ticketId: string;
  canEdit: boolean;
};

export function CloseTicketForm({ ticketId, canEdit }: CloseTicketFormProps) {
  if (!canEdit) {
    return null;
  }

  return (
    <form
      action={closeTicket}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Closing ${ticketId} will remove it from the active queue. Confirm?`
          )
        ) {
          event.preventDefault();
        }
      }}
      className="flex flex-col gap-3 md:flex-row md:items-end"
    >
      <input type="hidden" name="ticket_id" value={ticketId} />
      <label className="block flex-1">
        <span className="text-sm font-medium text-neutral-800">
          Resolution
        </span>
        <input
          required
          name="resolution_notes"
          className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
        />
      </label>
      <SubmitButton
        variant="outline"
        pendingText="Closing ticket..."
        className="border-red-300 text-red-700 hover:border-red-400 hover:bg-red-50 hover:text-red-800"
      >
        Close Ticket
      </SubmitButton>
    </form>
  );
}
