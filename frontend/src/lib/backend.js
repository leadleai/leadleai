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

// Like req(), but returns the raw response as a Blob (for binary payloads such as
// voice-preview audio). Carries the same auth + org headers so RLS/auth apply; the
// provider API key stays server-side behind the FastAPI proxy.
async function reqBlob(path) {
  const headers = {};
  const token = await getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const orgId = localStorage.getItem(ORG_KEY);
  if (orgId) headers["X-Org-Id"] = orgId;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { headers });
  } catch (e) {
    throw new Error(`Can't reach the backend at ${API_BASE}. Is FastAPI running?`);
  }
  if (!res.ok) {
    let data = null;
    try { data = await res.json(); } catch { /* not json */ }
    const err = new Error(extractError(data, res.status));
    err.status = res.status;
    throw err;
  }
  return res.blob();
}

// Public, cosmetic visitor-country lookup used by the pricing page to pick a
// display currency. Never sends auth; frontend falls back to USD on any error.
export const geoApi = {
  detect: () => req("/api/geo", { publicRoute: true }),
};

export const orgApi = {
  me: () => req("/api/org/me"),
  // Members: { members:[{id,user_id,name,email,role,created_at,is_you}], can_manage, your_role }
  members: () => req("/api/org/members"),
  changeRole: (userId, role) =>
    req(`/api/org/members/${userId}`, { method: "PATCH", body: JSON.stringify({ role }) }),
  removeMember: (userId) => req(`/api/org/members/${userId}`, { method: "DELETE" }),
  // Invites (owners only). listInvites -> [{id,email,role,token,status,expires_at,...}]
  invites: () => req("/api/org/invites"),
  invite: (email, role = "member") =>
    req("/api/org/invites", { method: "POST", body: JSON.stringify({ email, role }) }),
  revokeInvite: (id) => req(`/api/org/invites/${id}`, { method: "DELETE" }),
  // Redeem an invite token (any signed-in user whose email matches the invite).
  acceptInvite: (token) =>
    req("/api/org/invites/accept", { method: "POST", body: JSON.stringify({ token }) }),
  // Public: preview an invite link before signing in -> {email, role, org_name, valid, expired}
  previewInvite: (token) =>
    req(`/api/public/invite/${encodeURIComponent(token)}`, { publicRoute: true }),
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

// Lead tags: an org-wide library (list/create/delete) plus per-lead assign/unassign.
// assign/unassign return the lead's full, updated tag set.
export const tagsApi = {
  list: () => req("/api/tags"),
  create: ({ name, color }) =>
    req("/api/tags", { method: "POST", body: JSON.stringify({ name, color }) }),
  remove: (id) => req(`/api/tags/${id}`, { method: "DELETE" }),
  assign: (leadId, tagId) =>
    req(`/api/leads/${leadId}/tags`, { method: "POST", body: JSON.stringify({ tag_id: tagId }) }),
  unassign: (leadId, tagId) =>
    req(`/api/leads/${leadId}/tags/${tagId}`, { method: "DELETE" }),
};

// Free-text notes on a lead. Each note carries author_email + created_at.
export const notesApi = {
  list: (leadId) => req(`/api/leads/${leadId}/notes`),
  add: (leadId, body) =>
    req(`/api/leads/${leadId}/notes`, { method: "POST", body: JSON.stringify({ body }) }),
  remove: (leadId, noteId) =>
    req(`/api/leads/${leadId}/notes/${noteId}`, { method: "DELETE" }),
};

// Custom fields: org-defined field DEFINITIONS, plus a lead's VALUES for them.
// getForLead returns definitions merged with the lead's current value; setForLead
// writes one value (blank clears it) and returns the merged set again.
export const customFieldsApi = {
  listDefs: () => req("/api/custom-fields"),
  createDef: ({ field_key, label, field_type, options }) =>
    req("/api/custom-fields", {
      method: "POST",
      body: JSON.stringify({ field_key, label, field_type, options }),
    }),
  updateDef: (id, { label, options }) =>
    req(`/api/custom-fields/${id}`, { method: "PATCH", body: JSON.stringify({ label, options }) }),
  removeDef: (id) => req(`/api/custom-fields/${id}`, { method: "DELETE" }),
  getForLead: (leadId) => req(`/api/leads/${leadId}/custom-fields`),
  setForLead: (leadId, defId, value) =>
    req(`/api/leads/${leadId}/custom-fields/${defId}`, {
      method: "PUT",
      body: JSON.stringify({ value }),
    }),
};

// Field types an org can choose when defining a custom field.
export const CUSTOM_FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Dropdown" },
];

// AI calling agents: per-org CRUD + the provider's real voice list. A call is
// placed *as* an agent; the org's default agent drives auto-calls.
export const agentsApi = {
  list: () => req("/api/agents"),
  get: (id) => req(`/api/agents/${id}`),
  create: (agent) => req("/api/agents", { method: "POST", body: JSON.stringify(agent) }),
  update: (id, patch) => req(`/api/agents/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  remove: (id) => req(`/api/agents/${id}`, { method: "DELETE" }),
  setDefault: (id) => req(`/api/agents/${id}`, { method: "PATCH", body: JSON.stringify({ is_default: true }) }),
  // Real provider voices for the editor dropdown; degrades to a static fallback.
  // Response: { provider, supports_preview, voices: [{id, name, description}] }.
  voices: (provider = "bland") => req(`/api/agents/voices?provider=${encodeURIComponent(provider)}`),
  // Fetch a REAL audio sample of one voice (Bland's sample API, proxied). Returns a
  // Blob the caller turns into an object URL to play — no fake audio, ever.
  voiceSample: (voiceId, provider = "bland") =>
    reqBlob(`/api/agents/voices/${encodeURIComponent(voiceId)}/sample?provider=${encodeURIComponent(provider)}`),
};

// Languages offered in the agent editor (Bland speaks many; these are common).
export const AGENT_LANGUAGES = [
  { value: "en", label: "English" },
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "en-IN", label: "English (India)" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "hi", label: "Hindi" },
  { value: "pt", label: "Portuguese" },
];

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
