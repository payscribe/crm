"use client";

import { useMemo, useRef, useState } from "react";
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

  if (textAfterAt.includes("\n") || /\s/.test(textAfterAt)) {
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
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [attachmentName, setAttachmentName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
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
      `${noteBody.slice(0, mention.atIndex)}@${staffMember.full_name} ${noteBody.slice(
        mention.atIndex + mention.query.length + 1
      )}`
    );
    setMentionedUserIds((current) =>
      current.includes(staffMember.user_id)
        ? current
        : [...current, staffMember.user_id]
    );
    setActiveSuggestionIndex(0);
    setAttachmentName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeMention(userId: string) {
    setMentionedUserIds((current) => current.filter((id) => id !== userId));
  }

  async function sendReply(formData: FormData) {
    await action(formData);
    setNoteBody("");
    setMentionedUserIds([]);
    setActiveSuggestionIndex(0);
  }

  return (
    <form action={sendReply} className="mt-5">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <input type="hidden" name="realtime_chat" value="yes" />
      {mentionedUserIds.map((userId) => (
        <input
          key={userId}
          type="hidden"
          name="mentioned_user_ids"
          value={userId}
        />
      ))}

      <label className="block">
        <span className="text-sm font-medium text-neutral-800">Reply</span>
        <textarea
          name="note_body"
          rows={3}
          value={noteBody}
          placeholder="Write a reply to the customer..."
          onChange={(event) => {
            setNoteBody(event.target.value);
            setActiveSuggestionIndex(0);
          }}
          onKeyDown={(event) => {
            if (suggestions.length === 0) {
              return;
            }

            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveSuggestionIndex((current) =>
                current + 1 >= suggestions.length ? 0 : current + 1
              );
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveSuggestionIndex((current) =>
                current - 1 < 0 ? suggestions.length - 1 : current - 1
              );
            }

            if (event.key === "Enter" && mention) {
              event.preventDefault();
              chooseMention(suggestions[activeSuggestionIndex]);
            }

            if (event.key === "Escape") {
              setNoteBody((current) => `${current} `);
            }
          }}
          className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
        />
      </label>

      <div className="mt-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 transition hover:border-payscribe-blue hover:text-payscribe-blue">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round">
            <path d="M21.4 11.6 12 21a6 6 0 0 1-8.5-8.5l10-10a4 4 0 0 1 5.7 5.7l-10 10a2 2 0 1 1-2.8-2.8l9.3-9.3" />
          </svg>
          {attachmentName || "Add attachment"}
          <input
            ref={fileRef}
            className="sr-only"
            type="file"
            name="attachment"
            accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,.doc,.docx"
            onChange={(event) => setAttachmentName(event.target.files?.[0]?.name ?? "")}
          />
        </label>
        {attachmentName ? (
          <button type="button" className="ml-2 text-xs font-semibold text-red-600" onClick={() => {
            setAttachmentName("");
            if (fileRef.current) fileRef.current.value = "";
          }}>Remove</button>
        ) : null}
      </div>

      {suggestions.length > 0 ? (
        <div className="mt-2 overflow-hidden rounded border border-neutral-200 bg-white shadow-sm">
          {suggestions.map((staffMember) => (
            <button
              key={staffMember.user_id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseMention(staffMember)}
              className={`flex w-full flex-col px-3 py-2 text-left text-sm transition hover:bg-neutral-50 ${
                suggestions[activeSuggestionIndex]?.user_id === staffMember.user_id
                  ? "bg-blue-50"
                  : ""
              }`}
            >
              <span className="font-semibold text-neutral-900">
                {staffMember.full_name}
              </span>
              <span className="text-xs text-neutral-500">
                {mentionLabel(staffMember)}
                {staffMember.slack_user_id
                  ? ` - ${staffMember.slack_user_id}`
                  : " - No Slack ID"}
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
        This reply will be visible in the customer&apos;s support widget. Attach one file up to 5 MB. Type @ to notify a teammate.
      </span>

      <div className="mt-3 flex justify-end">
        <SubmitButton pendingText="Sending reply...">Send Reply</SubmitButton>
      </div>
    </form>
  );
}
