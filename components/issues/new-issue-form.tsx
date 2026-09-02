"use client";

import { SubmitButton } from "@/components/ui/submit-button";
import type { StaffUser } from "@/lib/types/users";

type NewIssueFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  staffMembers: StaffUser[];
  categories: string[];
  priorities: string[];
  statuses: string[];
  defaults?: {
    title?: string;
    category?: string;
    description?: string;
    priority?: string;
    assignedTo?: string;
    status?: string;
  };
  linkedTicketId?: string;
};

const inputClass =
  "mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20";
const selectClass =
  "mt-2 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20";

export function NewIssueForm({
  action,
  staffMembers,
  categories,
  priorities,
  statuses,
  defaults = {},
  linkedTicketId
}: NewIssueFormProps) {
  return (
    <form action={action} className="space-y-4">
      {linkedTicketId ? (
        <input type="hidden" name="linked_ticket_id" value={linkedTicketId} />
      ) : null}

      <label className="block">
        <span className="text-sm font-medium text-neutral-800">Title</span>
        <input
          required
          name="title"
          defaultValue={defaults.title}
          placeholder="e.g. USD card declined for sandbox test transaction"
          className={inputClass}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-neutral-800">
            Category
          </span>
          <select
            name="category"
            defaultValue={defaults.category ?? ""}
            className={selectClass}
          >
            <option value="">Select category</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-neutral-800">
            Priority
          </span>
          <select
            required
            name="priority"
            defaultValue={defaults.priority ?? "Medium"}
            className={selectClass}
          >
            {priorities.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-neutral-800">Assigned to</span>
        <select
          required
          name="assigned_to"
          defaultValue={defaults.assignedTo ?? ""}
          className={selectClass}
        >
          <option value="">Select team member</option>
          {staffMembers.map((staffMember) => (
            <option key={staffMember.user_id} value={staffMember.user_id}>
              {staffMember.full_name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-neutral-800">Status</span>
        <select
          name="status"
          defaultValue={defaults.status ?? "Open"}
          className={selectClass}
        >
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-neutral-800">Description</span>
        <textarea
          required
          name="description"
          rows={4}
          defaultValue={defaults.description}
          placeholder="What happened? This becomes the searchable problem statement in the knowledge base."
          className={inputClass}
        />
      </label>

      <div className="flex justify-end">
        <SubmitButton pendingText="Saving issue...">Save Issue</SubmitButton>
      </div>
    </form>
  );
}
