import { useCallback, useEffect, useState } from "react";
import { analyticsApi } from "@/lib/backend";

// Loads the summary + timeseries for a period and reloads when it changes.
// Shared by the Dashboard and Analytics pages so both hit the same org-scoped
// endpoints with identical loading/error/empty handling.
export function useAnalytics(period, { withActivity = false } = {}) {
  const [summary, setSummary] = useState(null);
  const [timeseries, setTimeseries] = useState(null);
  const [activity, setActivity] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const calls = [analyticsApi.summary(period), analyticsApi.timeseries(period)];
      if (withActivity) calls.push(analyticsApi.activity(period));
      const [s, t, a] = await Promise.all(calls);
      setSummary(s);
      setTimeseries(t);
      if (withActivity) setActivity(a);
      setState("ready");
    } catch (e) {
      setError(e.message);
      setState("error");
    }
  }, [period, withActivity]);

  useEffect(() => {
    load();
  }, [load]);

  const hasData = !!summary?.has_data;
  return { summary, timeseries, activity, state, error, hasData, reload: load };
}

// ISO timestamp -> compact relative label ("2h ago", "3d ago", "just now").
export function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// "2026-07-24" -> "Jul 24" for chart axes.
export function shortDay(iso) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
