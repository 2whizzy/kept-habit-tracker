import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import AuthScreen from "./AuthScreen";
import HabitTracker from "./HabitTracker";

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = still checking

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0A0A0F", color: "#63636F", fontFamily: "Inter, system-ui, sans-serif" }}>
        Loading…
      </div>
    );
  }
  if (!session) return <AuthScreen />;
  return (
    <HabitTracker
      key={session.user.id}
      user={session.user}
      onSignOut={() => supabase.auth.signOut()}
    />
  );
}
