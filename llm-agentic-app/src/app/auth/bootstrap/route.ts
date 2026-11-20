import { redirect } from "next/navigation";
import { getUserOrNull } from "@/lib/auth";
import { ensureLearner, getLearner } from "@/lib/learners";

export async function GET() {
  const user = await getUserOrNull();
  if (!user) {
    redirect("/login");
  }

  let redirectTo = "/dashboard";
  try {
    await ensureLearner(user.id);
    const learner = await getLearner(user.id);

    if (!learner || learner.profileJson === null) {
      redirectTo = "/onboarding";
    }
  } catch (err: unknown) {
    console.error("Bootstrap error:", err);
    redirectTo = "/onboarding";
  }

  redirect(redirectTo);
}
