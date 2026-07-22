import { logActivity } from "@/lib/activity/actions";
import { formatDate } from "@/lib/format/date";
import type { ActivityEntry, CrmRecordType } from "@/lib/types/activity";
import { SubmitButton } from "@/components/ui/submit-button";

type ActivityTimelineProps = {
  entityType: CrmRecordType;
  entityId: string;
  entries: ActivityEntry[];
  actorNames: Map<string, string>;
  canCreate: boolean;
};

export function ActivityTimeline({
  entityType,
  entityId,
  entries,
  actorNames,
  canCreate
}: ActivityTimelineProps) {
  return (
    <div className="mt-6 overflow-hidden rounded border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-4 py-3">
        <h3 className="text-base font-semibold text-neutral-950">
          Activity Timeline
        </h3>
        <p className="mt-1 text-sm text-neutral-600">
          Combined history of logged communication, notes, and updates for
          this record.
        </p>
      </div>

      {canCreate ? (
        <form action={logActivity} className="border-b border-neutral-200 p-4">
          <input type="hidden" name="entity_type" value={entityType} />
          <input type="hidden" name="entity_id" value={entityId} />
          <label className="block">
            <span className="text-sm font-medium text-neutral-800">
              Add an activity note
            </span>
            <textarea
              required
              name="summary"
              rows={3}
              placeholder="What happened?"
              className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
            />
          </label>
          <div className="mt-3 flex justify-end">
            <SubmitButton pendingText="Saving activity..." size="sm">
              Log Activity
            </SubmitButton>
          </div>
        </form>
      ) : null}

      <div className="divide-y divide-neutral-200">
        {entries.map((entry) => (
          <div key={`${entry.source}:${entry.id}`} className="p-4">
            <div className="flex flex-col gap-1 text-xs text-neutral-500 md:flex-row md:items-center md:justify-between">
              <span className="font-semibold text-neutral-700">
                {actorNames.get(entry.actorId ?? "") ?? "Team member"}
                {entry.channel ? ` · ${entry.channel}` : ""}
                {entry.direction ? ` · ${entry.direction}` : ""}
              </span>
              <span>{formatDate(entry.date)}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
              {entry.summary}
            </p>
          </div>
        ))}

        {entries.length === 0 ? (
          <div className="p-4 text-sm text-neutral-600">
            No activity has been logged yet.
          </div>
        ) : null}
      </div>
    </div>
  );
}
