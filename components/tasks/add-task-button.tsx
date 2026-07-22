import { createTask } from "@/app/tasks/actions";
import { FormModal } from "@/components/ui/form-modal";
import { SubmitButton } from "@/components/ui/submit-button";
import type { CrmRecordType } from "@/lib/types/activity";

type AddTaskButtonProps = {
  entityType: CrmRecordType;
  entityId: string;
  returnTo: string;
};

export function AddTaskButton({
  entityType,
  entityId,
  returnTo
}: AddTaskButtonProps) {
  return (
    <FormModal
      buttonLabel="+ Add Task"
      title="Add Task"
      description="Create a follow-up reminder linked to this record. It will show up on your My Tasks page."
      size="default"
    >
      <form action={createTask} className="space-y-4">
        <input type="hidden" name="entity_type" value={entityType} />
        <input type="hidden" name="entity_id" value={entityId} />
        <input type="hidden" name="return_to" value={returnTo} />

        <label className="block">
          <span className="text-sm font-medium text-neutral-800">Title</span>
          <input
            required
            name="title"
            className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-neutral-800">
            Due date
          </span>
          <input
            required
            name="due_date"
            type="date"
            className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-neutral-800">Notes</span>
          <textarea
            name="notes"
            rows={3}
            className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
          />
        </label>

        <div className="flex justify-end">
          <SubmitButton pendingText="Saving task...">Save Task</SubmitButton>
        </div>
      </form>
    </FormModal>
  );
}
