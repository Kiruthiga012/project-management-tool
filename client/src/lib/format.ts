export function formatDate(value?: Date | string | null, fallback = "No date") {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function initials(name?: string | null) {
  return (name || "U").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

export function taskStatusLabel(status: string) {
  return status.replace("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
