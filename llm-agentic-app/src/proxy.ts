import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function isPublicPath(pathname: string): boolean {
  if (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/api/health" ||
    pathname.startsWith("/api/health/") ||
    pathname === "/api/cron" ||
    pathname.startsWith("/api/cron/") ||
    pathname === "/_next" ||
    pathname.startsWith("/_next/")
  ) {
    return true;
  }

  // Static assets: files with common file extensions (excluding API routes)
  if (
    !pathname.startsWith("/api/") &&
    /\.(ico|png|jpg|jpeg|gif|svg|webp|css|js|map|txt|xml|json|webmanifest|woff|woff2|ttf|eot|mp4|webm|wav|mp3|pdf)$/i.test(
      pathname
    )
  ) {
    return true;
  }

  return false;
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://pfmkuykhcalscznuuqjj.supabase.co";
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "sb_publishable_ojkaMU8Koz5uFNC1NUuLcQ_9ustxcJW";

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    if (pathname.startsWith("/api/") || pathname === "/api") {
      const errorResponse = NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Sign in required",
          },
        },
        { status: 401 }
      );
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        errorResponse.cookies.set(cookie);
      });
      return errorResponse;
    }

    const redirectUrl = new URL("/login", request.url);
    const redirectResponse = NextResponse.redirect(redirectUrl);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  }

  return supabaseResponse;
}

export default proxy;

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
