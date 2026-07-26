import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { orgApi } from "@/lib/backend";

/**
 * Session + organization context for the whole app.
 *
 * `session` comes from Supabase (persisted in localStorage, auto-refreshed).
 * `org` comes from the BACKEND (/api/org/me), which derives it from the user's
 * membership rows — never from anything the browser claims.
 */
const AuthContext = createContext(null);

const ORG_KEY = "leadpilot.orgId"; // remembers which org you last worked in

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [orgError, setOrgError] = useState(null);

  // 1. Track the Supabase session.
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data?.session ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setOrg(null);
        setOrgs([]);
        localStorage.removeItem(ORG_KEY);
      }
    });
    return () => {
      active = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  // 2. Once signed in, ask the backend which org(s) we're a member of.
  const loadOrg = useCallback(async () => {
    if (!session) return;
    try {
      const me = await orgApi.me();
      setOrg(me.org);
      setOrgs(me.orgs || []);
      setOrgError(null);
      if (me.org?.id) localStorage.setItem(ORG_KEY, me.org.id);
    } catch (e) {
      setOrgError(e.message);
    }
  }, [session]);

  useEffect(() => {
    loadOrg();
  }, [loadOrg]);

  const signIn = useCallback(async (email, password) => {
    if (!supabase) throw new Error("Auth is not configured (missing Supabase env vars).");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const signUp = useCallback(async (email, password) => {
    if (!supabase) throw new Error("Auth is not configured (missing Supabase env vars).");
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/login` },
    });
    if (error) throw new Error(error.message);
    // No session => the project requires email confirmation first.
    return { needsConfirmation: !data.session };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) throw new Error("Auth is not configured (missing Supabase env vars).");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/app` },
    });
    if (error) throw new Error(error.message);
  }, []);

  const resetPassword = useCallback(async (email) => {
    if (!supabase) throw new Error("Auth is not configured (missing Supabase env vars).");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw new Error(error.message);
  }, []);

  const updatePassword = useCallback(async (password) => {
    if (!supabase) throw new Error("Auth is not configured (missing Supabase env vars).");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    localStorage.removeItem(ORG_KEY);
  }, []);

  const switchOrg = useCallback(async (orgId) => {
    localStorage.setItem(ORG_KEY, orgId);
    await loadOrg();
  }, [loadOrg]);

  const value = useMemo(
    () => ({
      configured: supabaseConfigured(),
      loading,
      session,
      user: session?.user ?? null,
      org,
      orgs,
      orgError,
      isOwner: org?.role === "owner",
      signIn, signUp, signInWithGoogle, resetPassword, updatePassword, signOut,
      switchOrg, reloadOrg: loadOrg,
    }),
    [loading, session, org, orgs, orgError, signIn, signUp, signInWithGoogle,
     resetPassword, updatePassword, signOut, switchOrg, loadOrg]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export { ORG_KEY };
