import Link from "next/link";
import { connection } from "next/server";
import { getUserOrNull } from "@/lib/auth";

export async function AppNav() {
  await connection();
  const user = await getUserOrNull();

  if (!user) {
    return null;
  }

  return (
    <nav className="border-b bg-background">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="text-sm font-medium transition-colors hover:text-foreground/80 text-foreground"
          >
            Dashboard
          </Link>
          <Link
            href="/dashboard/history"
            className="text-sm font-medium transition-colors hover:text-foreground/80 text-foreground"
          >
            History
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <form action="/auth/signout" method="POST">
            <button
              type="submit"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}

export default AppNav;
