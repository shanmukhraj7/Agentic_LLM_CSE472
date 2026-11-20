async function runAuthGuardTests() {
  const arg = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const baseUrl = (arg || "http://localhost:3000").replace(/\/+$/, "");

  console.log(`Running auth guard checks against: ${baseUrl}\n`);

  let failed = false;

  const postEndpoints = [
    "/api/plan",
    "/api/progress",
    "/api/replan",
    "/api/replan/seen",
    "/api/profile",
    "/api/profile/draft",
    "/api/market/simulate",
    "/api/market/refresh",
  ];

  // 1. POST endpoints with no cookies must return 401
  for (const endpoint of postEndpoints) {
    try {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: "POST",
      });
      if (res.status === 401) {
        console.log(`PASS: POST ${endpoint} returned 401`);
      } else {
        console.log(`FAIL: POST ${endpoint} returned ${res.status} (expected 401)`);
        failed = true;
      }
    } catch (err) {
      console.log(`FAIL: POST ${endpoint} encountered error: ${(err as Error).message}`);
      failed = true;
    }
  }

  // 2. GET /api/cron/replan with no header must return 401
  try {
    const res = await fetch(`${baseUrl}/api/cron/replan`, {
      method: "GET",
    });
    if (res.status === 401) {
      console.log("PASS: GET /api/cron/replan (no header) returned 401");
    } else {
      console.log(`FAIL: GET /api/cron/replan (no header) returned ${res.status} (expected 401)`);
      failed = true;
    }
  } catch (err) {
    console.log(`FAIL: GET /api/cron/replan (no header) encountered error: ${(err as Error).message}`);
    failed = true;
  }

  // 3. GET /api/cron/replan with wrong Bearer value must return 401
  try {
    const res = await fetch(`${baseUrl}/api/cron/replan`, {
      method: "GET",
      headers: {
        Authorization: "Bearer invalid-bearer-token",
      },
    });
    if (res.status === 401) {
      console.log("PASS: GET /api/cron/replan (wrong Bearer value) returned 401");
    } else {
      console.log(`FAIL: GET /api/cron/replan (wrong Bearer value) returned ${res.status} (expected 401)`);
      failed = true;
    }
  } catch (err) {
    console.log(`FAIL: GET /api/cron/replan (wrong Bearer value) encountered error: ${(err as Error).message}`);
    failed = true;
  }

  // 4. GET /api/health must return 200
  try {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: "GET",
    });
    if (res.status === 200) {
      console.log("PASS: GET /api/health returned 200");
    } else {
      console.log(`FAIL: GET /api/health returned ${res.status} (expected 200)`);
      failed = true;
    }
  } catch (err) {
    console.log(`FAIL: GET /api/health encountered error: ${(err as Error).message}`);
    failed = true;
  }

  // 5. GET /dashboard (redirect: "manual") must redirect to /login
  try {
    const res = await fetch(`${baseUrl}/dashboard`, {
      method: "GET",
      redirect: "manual",
    });
    const location = res.headers.get("location");
    const isRedirectStatus =
      [301, 302, 303, 307, 308].includes(res.status) || res.type === "opaqueredirect";

    let isLoginRedirect = false;
    if (location) {
      try {
        const parsed = new URL(location, baseUrl);
        isLoginRedirect = parsed.pathname === "/login";
      } catch {
        isLoginRedirect = location === "/login" || location.endsWith("/login");
      }
    }

    if (isRedirectStatus && (isLoginRedirect || (!location && res.type === "opaqueredirect"))) {
      console.log(`PASS: GET /dashboard (redirect: "manual") redirected to /login (status ${res.status}, location: ${location})`);
    } else {
      console.log(`FAIL: GET /dashboard (redirect: "manual") did not redirect to /login (status ${res.status}, location: ${location})`);
      failed = true;
    }
  } catch (err) {
    console.log(`FAIL: GET /dashboard (redirect: "manual") encountered error: ${(err as Error).message}`);
    failed = true;
  }

  if (failed) {
    console.error("\nSome auth guard checks failed.");
    process.exit(1);
  } else {
    console.log("\nAll auth guard checks passed.");
    process.exit(0);
  }
}

runAuthGuardTests();
