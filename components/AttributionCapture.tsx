"use client";

import { useEffect } from "react";

const keys = ["utm_source","utm_medium","utm_campaign","utm_content","utm_term","campaign","source","ref","gateway"];

export default function AttributionCapture() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const now = new Date().toISOString();
    const existingFirst = localStorage.getItem("raeburn_first_touch");
    const source = params.get("source") || params.get("utm_source") || document.referrer || "direct";

    if (!existingFirst) localStorage.setItem("raeburn_first_touch", source);
    localStorage.setItem("raeburn_last_touch", source);
    localStorage.setItem("raeburn_landing_page", window.location.href);
    if (document.referrer) localStorage.setItem("raeburn_referrer", document.referrer);
    localStorage.setItem("raeburn_touch_time", now);

    for (const key of keys) {
      const value = params.get(key);
      if (value) localStorage.setItem(`raeburn_${key}`, value);
    }
  }, []);
  return null;
}

export function readAttributionClient() {
  if (typeof window === "undefined") return {};
  const out: Record<string,string> = {};
  for (const key of [...keys,"first_touch","last_touch","landing_page","referrer"]) {
    const value = localStorage.getItem(`raeburn_${key}`);
    if (value) out[key] = value;
  }
  return out;
}
