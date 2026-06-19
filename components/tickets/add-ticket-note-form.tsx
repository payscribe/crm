"use client";

import { useMemo, useState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import type { StaffUser } from "@/lib/types/users";

type AddTicketNoteFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  staffMembers: StaffUser[];
  ticketId: string;
};

function mentionLabel(staffMember: StaffUser) {
  return staffMember.department
    ? `${staffMember.full_name} - ${staffMember.department}`
    : staffMember.full_name;
}

function activeMentionQuery(noteBody: string) {
  const cursorText = noteBody;
  const atIndex = cursorText.lastIndexOf("@");

  if (atIndex === -1) {
    return null;
  }

  const textAfterAt = cursorText.slice(atIndex + 1);

  if (textAfterAt.includes("\n")) {
    return null;
  }

  return {
    atIndex,
    query: textAfterAt.toLowerCase()
  };
}

export function AddTicketNoteForm({
  action,
  staffMembers,
  ticketId
}: AddTicketNoteFormProps) {
  const [noteBody, setNoteBody] = useState("");
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const mention = activeMentionQuery(noteBody);

  const suggestions = useMemo(() => {
    if (!mention) {
      return [];
    }

    return staffMembers
      .filter((staffMember) => {
        const haystack = [
          staffMember.full_name,
          staffMember.email,
          staffMember.department ?? "",
          staffMember.job_title ?? ""
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(mention.query);
      })
      .slice(0, 6);
  }, [mention, staffMembers]);

  const selectedStaff = staffMembers.filter((staffMember) =>
    mentionedUserIds.includes(staffMember.user_id)
  );

  function chooseMention(staffMember: StaffUser) {
    if (!mention) {
      return;
    }

    setNoteBody(
      `${noteBody.slice(0, mention.atIndex)}@${staffMember.full_name} `
    );
    setMentionedUserIds((current) =>
      current.includes(staffMember.user_id)
        ? current
        : [...current, staffMember.user_id]
    );
  }

  function removeMention(userId: string) {
    setMentionedUserIds((current) => current.filter((id) => id !== userId));
  }

  return (
    <form action={action} className="mt-5">
      <input type="hidden" name="ticket_id" value={ticketId} />
      {mentionedUserIds.map((userId) => (
        <input
          key={userId}
          type="hidden"
          name="mentioned_user_ids"
          value={userId}
        />
      ))}

      <label className="block">
        <span className="text-sm font-medium text-neutral-800">Add note</span>
        <textarea
          required
          name="note_body"
          rows={3}
          value={noteBody}
          onChange={(event) => setNoteBody(event.target.value)}
          className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
        />
      </label>

      {suggestions.length > 0 ? (
        <div className="mt-2 overflow-hidden rounded border border-neutral-200 bg-white shadow-sm">
          {suggestions.map((staffMember) => (
            <button
              key={staffMember.user_id}
              type="button"
              onClick={() => chooseMention(staffMember)}
              className="flex w-full flex-col px-3 py-2 text-left text-sm transition hover:bg-neutral-50"
            >
              <span className="font-semibold text-neutral-900">
                {staffMember.full_name}
              </span>
              <span className="text-xs text-neutral-500">
                {mentionLabel(staffMember)}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {selectedStaff.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {selectedStaff.map((staffMember) => (
            <button
              key={staffMember.user_id}
              type="button"
              onClick={() => removeMention(staffMember.user_id)}
              className="rounded border border-payscribe-blue/25 bg-payscribe-blue/5 px-2 py-1 text-xs font-semibold text-payscribe-blue"
            >
              @{staffMember.full_name} x
            </button>
          ))}
        </div>
      ) : null}

      <span className="mt-2 block text-xs text-neutral-500">
        Type @ and select a teammate to send them a Slack DM.
      </span>

      <div className="mt-3 flex justify-end">
        <SubmitButton pendingText="Adding note...">Add Note</SubmitButton>
      </div>
    </form>
  );
}
