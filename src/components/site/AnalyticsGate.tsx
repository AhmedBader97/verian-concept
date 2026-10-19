"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { useEffect } from "react";

const KEY = "va-ignore";

/**
 * Cookie-free Vercel Web Analytics. Visiting any page once with ?me in the URL
 * marks this browser as the author's, so his own visits are never counted.
 * Events carry the page address only, without its query string or fragment.
 */
export function AnalyticsGate() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has("me")) window.localStorage.setItem(KEY, "1");
      if (params.has("notme")) window.localStorage.removeItem(KEY);
    } catch {
      /* storage unavailable: count the visit */
    }
  }, []);

  const beforeSend = (event: BeforeSendEvent) => {
    try {
      if (window.localStorage.getItem(KEY) === "1") return null;
    } catch {
      /* ignore */
    }
    // Count the page, never what was typed: drop any query string or fragment.
    return { ...event, url: event.url.split(/[?#]/)[0]! };
  };

  return <Analytics beforeSend={beforeSend} />;
}
