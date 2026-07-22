import { AppShell } from "@/components/app-shell";
import { entityDetailPath } from "@/lib/activity/entity-links";
import { FormModal } from "@/components/ui/form-modal";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusAlert } from "@/components/ui/status-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { formatDate } from "@/lib/format/date";
import type { Task } from "@/lib/types/tasks";
import type { StaffUser } from "@/lib/types/users";
import Link from "next/link";
import { cancelTask, completeTask, createTask } from "./actions";

type TasksPageProps = {
  searchParams?: {
    error?: string;
    success?: string;
  };
};

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function isOverdue(dueDate: string) {
  return new Date(dueDate).getTime() < startOfToday().getTime();
}

function isDueToday(dueDate: string) {
  const due = new Date(dueDate);
  const today = new Date();

  return (
    due.getFullYear() === today.getFullYear() &&
    due.getMonth() === today.getMonth() &&
    due.getDate() === today.getDate()
  );
}

function TaskGroup({
  title,
  tasks,
  staffById,
  showActions
}: {
  title: string;
  tasks: Task[];
  staffById: Map<string, string>;
  showActions: boolean;
}) {
  return (
    <div className="mt-6 overflow-hidden rounded border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-4 py-3">
        <h3 className="text-base font-semibold text-neutral-950">
          {title} ({tasks.length})
        </h3>
      </div>
      <div className="divide-y divide-neutral-200">
        {tasks.map((task) => (
          <div
            key={task.task_id}
            className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"
          >
            <div>
              <p className="text-sm font-semibold text-neutral-950">
                {task.title}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                Due {formatDate(task.due_date)}
                {task.entity_type && task.entity_id ? (
                  <>
                    {" · "}
                    <Link
                      href={entityDetailPath(task.entity_type, task.entity_id)}
                      className="font-semibold text-payscribe-blue hover:underline"
                    >
                      {task.entity_type} {task.entity_id}
                    </Link>
                  </>
                ) : null}
              </p>
              {task.created_by !== task.assigned_to ? (
                <p className="mt-1 text-xs text-neutral-500">
                  Assigned by {staffById.get(task.created_by) ?? "Unknown"}
                </p>
              ) : null}
              {task.notes ? (
                <p className="mt-1 text-xs text-neutral-600">{task.notes}</p>
              ) : null}
            </div>

            {showActions ? (
              <div className="flex shrink-0 gap-2">
                <form action={completeTask}>
                  <input type="hidden" name="task_id" value={task.task_id} />
                  <input type="hidden" name="return_to" value="/tasks" />
                  <SubmitButton
                    variant="outline"
                    size="sm"
                    pendingText="Saving..."
                  >
                    Mark Done
                  </SubmitButton>
                </form>
                <form action={cancelTask}>
                  <input type="hidden" name="task_id" value={task.task_id} />
                  <input type="hidden" name="return_to" value="/tasks" />
                  <SubmitButton
                    variant="secondary"
                    size="sm"
                    pendingText="Saving..."
                  >
                    Cancel
                  </SubmitButton>
                </form>
              </div>
            ) : null}
          </div>
        ))}

        {tasks.length === 0 ? (
          <div className="p-4 text-sm text-neutral-500">Nothing here.</div>
        ) : null}
      </div>
    </div>
  );
}

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  const [{ data: tasks }, { data: staffMembers }] = await Promise.all([
    supabase
      .from("tasks")
      .select("*")
      .eq("assigned_to", currentUser.user_id)
      .order("due_date", { ascending: true })
      .returns<Task[]>(),
    supabase
      .from("users")
      .select("*")
      .eq("status", "Active")
      .order("full_name", { ascending: true })
      .returns<StaffUser[]>()
  ]);

  const records = tasks ?? [];
  const staffById = new Map(
    (staffMembers ?? []).map((staffMember) => [
      staffMember.user_id,
      staffMember.full_name
    ])
  );

  const openTasks = records.filter((task) => task.status === "Open");
  const overdueTasks = openTasks.filter((task) => isOverdue(task.due_date));
  const dueTodayTasks = openTasks.filter(
    (task) => !isOverdue(task.due_date) && isDueToday(task.due_date)
  );
  const upcomingTasks = openTasks.filter(
    (task) => !isOverdue(task.due_date) && !isDueToday(task.due_date)
  );
  const completedTasks = records
    .filter((task) => task.status !== "Open")
    .sort(
      (a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime()
    );

  return (
    <AppShell currentUser={currentUser} permissions={permissions}>
      <section>
        <PageHeader
          eyebrow="Tasks"
          title="My Tasks"
          description="Personal follow-ups and reminders, linked to CRM records or standalone."
          actions={
            <FormModal
              buttonLabel="+ New Task"
              title="Add Task"
              description="Create a personal follow-up. You can assign it to a teammate."
              size="default"
            >
              <form action={createTask} className="space-y-4">
                <input type="hidden" name="return_to" value="/tasks" />

                <label className="block">
                  <span className="text-sm font-medium text-neutral-800">
                    Title
                  </span>
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
                  <span className="text-sm font-medium text-neutral-800">
                    Assign to
                  </span>
                  <select
                    name="assigned_to"
                    defaultValue={currentUser.user_id}
                    className="mt-2 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                  >
                    {(staffMembers ?? []).map((staffMember) => (
                      <option
                        key={staffMember.user_id}
                        value={staffMember.user_id}
                      >
                        {staffMember.user_id === currentUser.user_id
                          ? "Me"
                          : staffMember.full_name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-neutral-800">
                    Notes
                  </span>
                  <textarea
                    name="notes"
                    rows={3}
                    className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                  />
                </label>

                <div className="flex justify-end">
                  <SubmitButton pendingText="Saving task...">
                    Save Task
                  </SubmitButton>
                </div>
              </form>
            </FormModal>
          }
        />

        <StatusAlert type="error" message={searchParams?.error} />
        <StatusAlert type="success" message={searchParams?.success} />

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Overdue", overdueTasks.length],
            ["Due Today", dueTodayTasks.length],
            ["Upcoming", upcomingTasks.length],
            ["Completed", completedTasks.length]
          ].map(([label, value]) => (
            <MetricCard
              key={label}
              label={String(label)}
              value={value}
              density="compact"
            />
          ))}
        </div>

        <TaskGroup
          title="Overdue"
          tasks={overdueTasks}
          staffById={staffById}
          showActions
        />
        <TaskGroup
          title="Due Today"
          tasks={dueTodayTasks}
          staffById={staffById}
          showActions
        />
        <TaskGroup
          title="Upcoming"
          tasks={upcomingTasks}
          staffById={staffById}
          showActions
        />
        <TaskGroup
          title="Completed"
          tasks={completedTasks}
          staffById={staffById}
          showActions={false}
        />
      </section>
    </AppShell>
  );
}
