export default function Loading() {
  return (
    <main className="min-h-[60vh] bg-neutral-50">
      <div className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center px-4">
        <div className="flex items-center gap-3 rounded border border-neutral-200 bg-white px-4 py-3 shadow-sm">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-payscribe-blue border-t-transparent" />
          <div>
            <p className="text-sm font-semibold text-neutral-950">Loading</p>
            <p className="mt-1 text-xs text-neutral-500">
              Fetching the latest CRM data.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
