import fs from "node:fs";

function loadCronSecret(): string | undefined {
  if (process.env.CRON_SECRET) {
    return process.env.CRON_SECRET;
  }

  // Attempt using Node's built-in process.loadEnvFile if available
  if (typeof process.loadEnvFile === "function") {
    for (const file of [".env.local", ".env"]) {
      try {
        process.loadEnvFile(file);
        if (process.env.CRON_SECRET) {
          return process.env.CRON_SECRET;
        }
      } catch {
        // file doesn't exist or failed to load
      }
    }
  }

  // Fallback: manually parse .env.local or .env
  for (const file of [".env.local", ".env"]) {
    try {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, "utf8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const match = trimmed.match(/^CRON_SECRET\s*=\s*(.*)$/);
          if (match) {
            let val = match[1].trim();
            if (
              (val.startsWith('"') && val.endsWith('"')) ||
              (val.startsWith("'") && val.endsWith("'"))
            ) {
              val = val.slice(1, -1);
            }
            process.env.CRON_SECRET = val;
            return val;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return undefined;
}

async function runSmokeTests() {
  const arg = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const rawUrl = arg || process.env.BASE_URL || "http://localhost:3000";
  const trimmedUrl = rawUrl.replace(/\/+$/, "");
  const baseUrl =
    trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://")
      ? trimmedUrl
      : `http://${trimmedUrl}`;

  const cronSecret = loadCronSecret();

  let failed = false;

  // Check 1: GET /api/health is 200 with ok true
  try {
    const res = await fetch(`${baseUrl}/api/health`);
    if (res.status === 200) {
      const data = await res.json().catch(() => null);
      if (data && data.ok === true) {
        console.log("PASS: GET /api/health is 200 with ok true");
      } else {
        console.log(`FAIL: GET /api/health returned 200 but ok was not true (got ${JSON.stringify(data)})`);
        failed = true;
      }
    } else {
      console.log(`FAIL: GET /api/health returned ${res.status} (expected 200)`);
      failed = true;
    }
  } catch (err) {
    console.log(`FAIL: GET /api/health encountered error: ${(err as Error).message}`);
    failed = true;
  }

  // Check 2: GET /login is 200
  try {
    const res = await fetch(`${baseUrl}/login`);
    if (res.status === 200) {
      console.log("PASS: GET /login is 200");
    } else {
      console.log(`FAIL: GET /login returned ${res.status} (expected 200)`);
      failed = true;
    }
  } catch (err) {
    console.log(`FAIL: GET /login encountered error: ${(err as Error).message}`);
    failed = true;
  }

  // Check 3: POST /api/plan without a session is 401
  try {
    const res = await fetch(`${baseUrl}/api/plan`, {
      method: "POST",
    });
    if (res.status === 401) {
      console.log("PASS: POST /api/plan without a session is 401");
    } else {
      console.log(`FAIL: POST /api/plan without a session returned ${res.status} (expected 401)`);
      failed = true;
    }
  } catch (err) {
    console.log(`FAIL: POST /api/plan without a session encountered error: ${(err as Error).message}`);
    failed = true;
  }

  // Check 4: GET /api/cron/replan without the header is 401
  try {
    const res = await fetch(`${baseUrl}/api/cron/replan`, {
      method: "GET",
    });
    if (res.status === 401) {
      console.log("PASS: GET /api/cron/replan without the header is 401");
    } else {
      console.log(`FAIL: GET /api/cron/replan without the header returned ${res.status} (expected 401)`);
      failed = true;
    }
  } catch (err) {
    console.log(`FAIL: GET /api/cron/replan without the header encountered error: ${(err as Error).message}`);
    failed = true;
  }

  // Check 5: If env var CRON_SECRET is set locally, GET /api/cron/replan with it is 200 and returns a JSON summary
  if (cronSecret) {
    try {
      const res = await fetch(`${baseUrl}/api/cron/replan`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${cronSecret}`,
        },
      });
      if (res.status === 200) {
        const data = await res.json().catch(() => null);
        if (data && typeof data === "object" && !Array.isArray(data)) {
          console.log("PASS: GET /api/cron/replan with CRON_SECRET is 200 and returns a JSON summary");
        } else {
          console.log(`FAIL: GET /api/cron/replan with CRON_SECRET returned 200 but did not return a JSON summary (got ${JSON.stringify(data)})`);
          failed = true;
        }
      } else {
        console.log(`FAIL: GET /api/cron/replan with CRON_SECRET returned ${res.status} (expected 200)`);
        failed = true;
      }
    } catch (err) {
      console.log(`FAIL: GET /api/cron/replan with CRON_SECRET encountered error: ${(err as Error).message}`);
      failed = true;
    }
  }

  if (failed) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSmokeTests();
