type MetricCardProps = {
  label: string;
  value: number | string;
  density?: "default" | "compact";
};

export function MetricCard({ label, value, density = "default" }: MetricCardProps) {
  const compact = density === "compact";

  return (
    <div className={`rounded border border-neutral-200 bg-white ${compact ? "p-4" : "p-5"}`}>
      <p
        className={
          compact
            ? "text-xs font-semibold uppercase tracking-wide text-neutral-500"
            : "text-sm font-medium text-neutral-500"
        }
      >
        {label}
      </p>
      <p
        className={`mt-2 font-semibold text-neutral-950 ${
          compact ? "text-2xl" : "text-3xl"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
