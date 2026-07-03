import { supabase } from "../supabaseClient";

/*
 * Data layer. Schema is fixed (see project notes), so the app maps its richer
 * model onto it like this:
 *   habits table      → id, name, category, icon (emoji), target (tpw target /
 *                       quantifiable target / 1), user_id, created_at
 *   habit_entries     → completed (boolean done), time_spent_seconds,
 *                       notes = JSON payload: {"lvl":0-5} for quality habits,
 *                       {"qty":n} for quantifiable ones
 *   auth user metadata → habit_config: { [habitId]: { mode, color, type, days,
 *                       quant, quantTarget, unit, desc, archived, order } }
 *   auth user metadata → profile: { displayName, avatarEmoji, avatarColor,
 *                       theme, accent }
 * RLS policies scope every query to auth.uid() automatically; user_id is still
 * written on inserts because the policies require it to match.
 */

const throwIf = (error) => { if (error) throw error; };

/* ---- per-habit config stored in auth user metadata (no schema change needed) ---- */
export const getConfig = (user) => (user && user.user_metadata && user.user_metadata.habit_config) || {};

export async function saveConfig(cfg) {
  const { error } = await supabase.auth.updateUser({ data: { habit_config: cfg } });
  throwIf(error);
}

/* ---- profile prefs, same pattern as habit_config: stored in user metadata ---- */
export const getProfile = (user) => (user && user.user_metadata && user.user_metadata.profile) || {};

export async function saveProfile(profile) {
  const { data, error } = await supabase.auth.updateUser({ data: { profile } });
  throwIf(error);
  return data.user;
}

/* ---- habits ---- */
export async function fetchHabits() {
  const { data, error } = await supabase.from("habits").select("*").order("created_at", { ascending: true });
  throwIf(error);
  return data || [];
}

export async function insertHabit(userId, fields) {
  const { data, error } = await supabase
    .from("habits")
    .insert({ user_id: userId, ...fields })
    .select()
    .single();
  throwIf(error);
  return data;
}

export async function updateHabitRow(id, patch) {
  const { error } = await supabase.from("habits").update(patch).eq("id", id);
  throwIf(error);
}

export async function deleteHabitCascade(id) {
  // No ON DELETE CASCADE in the given schema, so clear children first.
  const e1 = await supabase.from("habit_entries").delete().eq("habit_id", id);
  throwIf(e1.error);
  const e2 = await supabase.from("habits").delete().eq("id", id);
  throwIf(e2.error);
}

/* ---- entries ---- */
export async function fetchEntries(sinceDays = 400) {
  const since = new Date(Date.now() - sinceDays * 86400000);
  const iso = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-${String(since.getDate()).padStart(2, "0")}`;
  const { data, error } = await supabase.from("habit_entries").select("*").gte("date", iso);
  throwIf(error);
  return data || [];
}

export async function upsertEntry(payload) {
  const { error } = await supabase
    .from("habit_entries")
    .upsert(payload, { onConflict: "habit_id,date" });
  throwIf(error);
}
