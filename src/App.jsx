import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import AuthScreen from "./AuthScreen";
import HabitTracker from "./HabitTracker";
import ResetPassword from "./ResetPassword";

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0A0A0F", color: "#63636F", fontFamily: "Inter, system-ui, sans-serif" }}>
        Loading…
      </div>
    );
  }
  if (recovery) return <ResetPassword onDone={() => setRecovery(false)} />;
  if (!session) return <AuthScreen />;
  return (
    <HabitTracker
      key={session.user.id}
      user={session.user}
      onSignOut={() => supabase.auth.signOut()}
    />
  );
}
