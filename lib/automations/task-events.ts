import type { NewAutomationEvent } from "@/lib/types/automation-events";
import type { Task } from "@/lib/types/tasks";
import type { StaffUser } from "@/lib/types/users";
import { slackFieldTable } from "@/lib/notifications/ticket-messages";

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function isDueOrOverdue(task: Task) {
  return (
    task.status === "Open" &&
    new Date(task.due_date).getTime() <= startOfToday().getTime()
  );
}

function isOverdue(task: Task) {
  return new Date(task.due_date).getTime() < startOfToday().getTime();
}

export function buildTaskAutomationEvents({
  tasks,
  staffMembers
}: {
  tasks: Task[];
  staffMembers: StaffUser[];
}) {
  const staffById = new Map(
    staffMembers.map((staffMember) => [staffMember.user_id, staffMember])
  );
  const events: NewAutomationEvent[] = [];
  const today = todayString();

  for (const task of tasks) {
    if (!isDueOrOverdue(task)) {
      continue;
    }

    const assignee = staffById.get(task.assigned_to) ?? null;
    const overdue = isOverdue(task);
    const linkedRecord =
      task.entity_type && task.entity_id
        ? `${task.entity_type} ${task.entity_id}`
        : "None";

    events.push({
      rule_key: "task_due_reminder",
      module: "Tasks",
      record_id: task.task_id,
      target_user_id: assignee?.user_id ?? null,
      target_channel: "slack_dm",
      message: slackFieldTable(overdue ? "TASK OVERDUE" : "TASK DUE TODAY", [
        ["Title", task.title],
        ["Due date", task.due_date],
        ["Linked record", linkedRecord],
        ["Notes", task.notes]
      ]),
      dedupe_key: `task_due_reminder:${task.task_id}:${today}`,
      payload: {
        task_id: task.task_id,
        title: task.title,
        due_date: task.due_date,
        entity_type: task.entity_type,
        entity_id: task.entity_id
      }
    });
  }

  return events;
}
