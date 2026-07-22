"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type SearchResultItem = {
  id: string;
  title: string;
  subtitle: string | null;
};

type GlobalSearchResponse = {
  businesses: SearchResultItem[];
  leads: SearchResultItem[];
  partners: SearchResultItem[];
  tickets: SearchResultItem[];
};

const emptyResults: GlobalSearchResponse = {
  businesses: [],
  leads: [],
  partners: [],
  tickets: []
};

const groupConfig: Array<{
  key: keyof GlobalSearchResponse;
  label: string;
  hrefPrefix: string;
}> = [
  { key: "businesses", label: "Businesses", hrefPrefix: "/businesses" },
  { key: "leads", label: "Leads", hrefPrefix: "/leads" },
  { key: "partners", label: "Partners", hrefPrefix: "/partners" },
  { key: "tickets", label: "Tickets", hrefPrefix: "/tickets" }
];

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResponse>(emptyResults);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setResults(emptyResults);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timeout = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(trimmed)}`)
        .then((response) => (response.ok ? response.json() : emptyResults))
        .then((data: GlobalSearchResponse) => {
          setResults(data);
          setOpen(true);
        })
        .catch(() => {
          setResults(emptyResults);
        })
        .finally(() => setLoading(false));
    }, 250);

    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const hasResults = groupConfig.some(
    (group) => results[group.key].length > 0
  );

  function goTo(hrefPrefix: string, id: string) {
    setOpen(false);
    setQuery("");
    router.push(`${hrefPrefix}/${id}`);
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => {
          if (query.trim().length >= 2) {
            setOpen(true);
          }
        }}
        placeholder="Search businesses, leads, partners, tickets..."
        className="w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
      />

      {open ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-96 overflow-y-auto rounded border border-neutral-200 bg-white shadow-lg">
          {loading ? (
            <div className="p-4 text-sm text-neutral-500">Searching...</div>
          ) : hasResults ? (
            groupConfig.map((group) => {
              const items = results[group.key];

              if (items.length === 0) {
                return null;
              }

              return (
                <div
                  key={group.key}
                  className="border-b border-neutral-100 last:border-b-0"
                >
                  <p className="bg-neutral-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    {group.label}
                  </p>
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => goTo(group.hrefPrefix, item.id)}
                      className="block w-full px-4 py-2 text-left text-sm hover:bg-blue-50"
                    >
                      <span className="font-semibold text-neutral-950">
                        {item.title}
                      </span>
                      {item.subtitle ? (
                        <span className="ml-2 text-xs text-neutral-500">
                          {item.subtitle}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              );
            })
          ) : (
            <div className="p-4 text-sm text-neutral-500">
              No matches found.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
