"use client";

import { resolveProductEvent } from "@/app/product-log/actions";
import { SubmitButton } from "@/components/ui/submit-button";

type ResolveProductEventFormProps = {
  eventId: string;
  eventTitle: string;
  canEdit: boolean;
};

export function ResolveProductEventForm({
  eventId,
  eventTitle,
  canEdit
}: ResolveProductEventFormProps) {
  if (!canEdit) {
    return null;
  }

  return (
    <form
      action={resolveProductEvent}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Mark "${eventTitle}" as resolved? This will set the resolved time automatically.`
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="event_id" value={eventId} />
      <SubmitButton pendingText="Resolving event...">
        Mark Resolved
      </SubmitButton>
    </form>
  );
}
