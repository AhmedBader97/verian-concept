"use client";

import { useEffect, useState } from "react";
import { AgentConsole } from "./AgentConsole";

/**
 * Reads the question from the link's #q= fragment ("Open the full trace"). A
 * fragment never leaves the browser, so the question is not sent to the server,
 * its logs or analytics. ?q= still works for old links.
 */
export function ConsoleFromQuery() {
  const [q, setQ] = useState<string | null>(null);
  useEffect(() => {
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get("q");
    const found = fromHash ?? new URLSearchParams(window.location.search).get("q") ?? "";
    setQ(found);
    if (found) {
      // Arriving with a question: bring the console into view.
      requestAnimationFrame(() => document.getElementById("agent")?.scrollIntoView({ block: "start" }));
    }
  }, []);
  if (q === null) return <AgentConsole key="initial" />;
  return <AgentConsole key={q || "none"} initialQuestion={q || undefined} />;
}
