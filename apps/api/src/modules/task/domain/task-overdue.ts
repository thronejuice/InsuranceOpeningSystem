export function isOverdue(status: string, dueDate: Date | null | undefined): boolean {
  if (!dueDate) return false;
  if (status === 'DONE' || status === 'CANCELLED') return false;
  return dueDate < new Date();
}
