import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

export async function getUserOrNull(): Promise<User | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<User> {
  const user = await getUserOrNull();
  if (!user) {
    throw { status: 401 };
  }
  return user;
}
