type InboxTask = { reference: string; status: string; priority: string; unitCode: string; assignedRole: string; acceptedBy?: string | null; dueAt?: string | number | Date | null; ticketReference?: string | null; callReference?: string | null; searchText?: string };
export function filterInboxTasks<T extends InboxTask>(tasks: T[], scope: "open" | "mine" | "urgent" | "scheduled" | "all", email: string, query: string): T[] {
  const isOpen = (task: T) => !["completed", "cancelled", "scheduled"].includes(task.status);
  const q = query.trim().toLocaleLowerCase("tr-TR");
  const rank = (priority: string) => priority === "Acil" ? 0 : priority === "Yüksek" ? 1 : 2;
  const due = (task: T) => task.dueAt == null ? Number.POSITIVE_INFINITY : new Date(task.dueAt).getTime();
  return tasks.filter(task => {
    const visible = scope === "all" || (scope === "scheduled" ? task.status === "scheduled" : isOpen(task) && (scope === "open" || (scope === "mine" ? Boolean(email) && task.acceptedBy === email : ["Acil", "Yüksek"].includes(task.priority))));
    return visible && (!q || `${task.reference} ${task.unitCode} ${task.assignedRole} ${task.ticketReference || ""} ${task.callReference || ""} ${task.searchText || ""}`.toLocaleLowerCase("tr-TR").includes(q));
  }).sort((a, b) => rank(a.priority) - rank(b.priority) || due(a) - due(b) || a.reference.localeCompare(b.reference));
}
