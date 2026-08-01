// Client for our FastAPI backend (inbound leads + Bland calls).
// The browser only ever talks to FastAPI — Supabase service-role/Bland keys
// stay server-side. Requests carry the user's Supabase access token; the
// backend verifies it and derives the org from their membership rows.

import { getAccessToken } from "@/lib/supabase";

const API_BASE = process.env.REACT_APP_BACKEND_URL || "http://localhost:8001";
const ORG_KEY = "leadpilot.orgId";

export const LEAD_STATUSES = ["new", "contacted", "interested", "meeting_booked", "closed"];
export const API_BASE_URL = API_BASE;

function extractError(data, status) {
  if (!data) return `Request failed (${status})`;
  const d = data.detail ?? data.error ?? data.message;
  if (Array.isArray(d)) return d.map((e) => e.msg || e.message || JSON.stringify(e)).join("; ");
  if (typeof d === "string") return d;
  return `Request failed (${status})`;
}

/**
 * @param {object} opts
 * @param {boolean} [opts.publicRoute] skip auth headers (enquiry form etc.)
 */
async function req(path, opts = {}) {
  const { publicRoute, ...init } = opts;
  const headers = { "Content-Type": "application/json", ...(init.headers || {}) };

  if (!publicRoute) {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    // Which org to act in. The backend only accepts this if you're a member —
    // it is a CHOICE among your orgs, never a grant of access.
    const orgId = localStorage.getItem(ORG_KEY);
    if (orgId) headers["X-Org-Id"] = orgId;
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch (e) {
    throw new Error(`Can't reach the backend at ${API_BASE}. Is FastAPI running?`);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) {
    const err = new Error(extractError(data, res.status));
    err.status = res.status;
    throw err;
  }
  return data;
}

// Public, cosmetic visitor-country lookup used by the pricing page to pick a
// display currency. Never sends auth; frontend falls back to USD on any error.
export const geoApi = {
  detect: () => req("/api/geo", { publicRoute: true }),
};

export const orgApi = {
  me: () => req("/api/org/me"),
  members: () => req("/api/org/members"),
  invite: (email, role = "member") =>
    req("/api/org/invite", { method: "POST", body: JSON.stringify({ email, role }) }),
  revokeInvite: (id) => req(`/api/org/invite/${id}`, { method: "DELETE" }),
  removeMember: (id) => req(`/api/org/members/${id}`, { method: "DELETE" }),
  // Public: lets the enquiry form show whose form it is.
  publicOrg: (slug) => req(`/api/public/org/${encodeURIComponent(slug)}`, { publicRoute: true }),
};

export const leadsApi = {
  list: () => req("/api/leads"),
  get: (id) => req(`/api/leads/${id}`),
  // Merged, newest-first activity timeline for one lead (calls, emails,
  // status changes, and the original enquiry submission).
  activity: (id) => req(`/api/leads/${id}/activity`),
  // PUBLIC — the enquiry form has no session. `org_slug` files it under the
  // right tenant; it is a non-secret form identifier, not a credential.
  create: (lead) =>
    req("/api/leads", { method: "POST", body: JSON.stringify(lead), publicRoute: true }),
  updateStatus: (id, status) =>
    req(`/api/leads/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  call: (lead) => req("/api/call", { method: "POST", body: JSON.stringify(lead) }),
};

export const settingsApi = {
  getAutoCall: () => req("/api/settings/auto-call"),
  setAutoCall: (enabled) =>
    req("/api/settings/auto-call", { method: "PUT", body: JSON.stringify({ enabled }) }),
};

// Per-org automation settings — the single source of truth the sweeps read live.
// GET returns the org's resolved settings merged over env defaults + read-only
// deployment flags; PATCH writes a partial update (only the fields you pass).
export const orgSettingsApi = {
  get: () => req("/api/org/settings"),
  update: (patch) =>
    req("/api/org/settings", { method: "PATCH", body: JSON.stringify(patch) }),
};

export const crmApi = {
  status: () => req("/api/crm/status"),
  import: () => req("/api/crm/import", { method: "POST" }),
};

export const followupApi = {
  getSettings: () => req("/api/settings/followup"),
  setSettings: (enabled) =>
    req("/api/settings/followup", { method: "PUT", body: JSON.stringify({ enabled }) }),
  send: (leadId) => req(`/api/followup/send/${leadId}`, { method: "POST" }),
};

export const callsApi = {
  list: () => req("/api/calls"),
};

export const integrationsApi = {
  list: () => req("/api/integrations"),
  authorize: (platform) => req(`/api/integrations/${platform}/authorize`),
  disconnect: (platform) => req(`/api/integrations/${platform}`, { method: "DELETE" }),
};

export const knowledgeApi = {
  list: () => req("/api/knowledge"),
  create: ({ title, content, keywords }) =>
    req("/api/knowledge", { method: "POST", body: JSON.stringify({ title, content, keywords }) }),
  update: (id, { title, content, keywords }) =>
    req(`/api/knowledge/${id}`, { method: "PATCH", body: JSON.stringify({ title, content, keywords }) }),
  remove: (id) => req(`/api/knowledge/${id}`, { method: "DELETE" }),
  testMatch: (enquiry) =>
    req("/api/knowledge/test-match", { method: "POST", body: JSON.stringify({ enquiry }) }),
};

// Parse a comma-separated keywords input into a clean array, and back for display.
export const parseKeywords = (s) =>
  (s || "").split(",").map((k) => k.trim().toLowerCase()).filter(Boolean)
    .filter((k, i, a) => a.indexOf(k) === i);
export const keywordsToText = (arr) => (Array.isArray(arr) ? arr.join(", ") : "");

export const aiEmailsApi = {
  getSettings: () => req("/api/settings/ai-emails"),
  setSettings: (enabled) =>
    req("/api/settings/ai-emails", { method: "PUT", body: JSON.stringify({ enabled }) }),
};

export const emailsApi = {
  list: () => req("/api/emails"),
  compose: (leadId) => req(`/api/emails/compose/${leadId}`),
  send: ({ lead_id, to, subject, body }) =>
    req("/api/emails/send", { method: "POST", body: JSON.stringify({ lead_id, to, subject, body }) }),
  getTemplates: () => req("/api/emails/templates"),
  saveTemplates: (items) => req("/api/emails/templates", { method: "PUT", body: JSON.stringify(items) }),
};

export const analyticsApi = {
  summary: (period = "7d") => req(`/api/analytics/summary?period=${encodeURIComponent(period)}`),
  timeseries: (period = "7d") => req(`/api/analytics/timeseries?period=${encodeURIComponent(period)}`),
  activity: (period = "7d") => req(`/api/analytics/activity?period=${encodeURIComponent(period)}`),
};

// The time-period options shared by the Dashboard and Analytics pages.
export const ANALYTICS_PERIODS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

export const MAX_FOLLOWUPS = 3;
