const USAGE_GUARD_KEY = "_tsukuyomi/usage-guard.json";
const GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(updateUsageGuard(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/status") {
      const auth = requireGuardToken(request, env);
      if (auth) return auth;
      const object = await env.TSUKUYOMI_BOOKS_BUCKET?.get(USAGE_GUARD_KEY);
      if (!object) return json({ ok: true, guard: null });
      return json({ ok: true, guard: JSON.parse(await object.text()) });
    }

    if (url.pathname === "/run") {
      const auth = requireGuardToken(request, env);
      if (auth) return auth;
      const result = await updateUsageGuard(env);
      return json({ ok: true, guard: result });
    }

    return json({ ok: true, service: "tsukuyomi-usage-guard" });
  }
};

async function updateUsageGuard(env) {
  const bucket = env.TSUKUYOMI_BOOKS_BUCKET;
  if (!bucket) throw new Error("TSUKUYOMI_BOOKS_BUCKET binding is required.");

  const bucketName = requiredEnv(env, "R2_BUCKET_NAME");
  const accountTag = requiredEnv(env, "CF_ACCOUNT_ID");
  const token = requiredEnv(env, "CF_ANALYTICS_TOKEN");

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
  const elapsedDays = Math.max(1, (now.getTime() - monthStart.getTime()) / 86400000);
  const daysInMonth = (nextMonth.getTime() - monthStart.getTime()) / 86400000;

  const operations = await queryR2Operations({
    accountTag,
    token,
    bucketName,
    startDate: monthStart.toISOString(),
    endDate: now.toISOString()
  });

  const classBMonthToDate = operations
    .filter((entry) => isClassBAction(entry.actionType))
    .reduce((sum, entry) => sum + entry.requests, 0);
  const classBProjected = Math.ceil((classBMonthToDate / elapsedDays) * daysInMonth);

  const thresholds = {
    watch: numberEnv(env, "USAGE_WARN_CLASS_B", 7000000),
    restrictPublishing: numberEnv(env, "USAGE_RESTRICT_CLASS_B", 8000000),
    pausePublication: numberEnv(env, "USAGE_PAUSE_CLASS_B", 9000000)
  };

  const guard = buildGuard({
    now,
    classBMonthToDate,
    classBProjected,
    elapsedDays,
    daysInMonth,
    thresholds,
    operations
  });

  await bucket.put(USAGE_GUARD_KEY, JSON.stringify(guard, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" }
  });
  return guard;
}

async function queryR2Operations({ accountTag, token, bucketName, startDate, endDate }) {
  const query = `
    query R2Operations($accountTag: string!, $startDate: Time, $endDate: Time, $bucketName: string) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          r2OperationsAdaptiveGroups(
            limit: 10000
            filter: {
              datetime_geq: $startDate
              datetime_leq: $endDate
              bucketName: $bucketName
            }
          ) {
            sum {
              requests
            }
            dimensions {
              actionType
            }
          }
        }
      }
    }
  `;

  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      query,
      variables: { accountTag, startDate, endDate, bucketName }
    })
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok || payload?.errors?.length) {
    const message = payload?.errors?.map((err) => err.message).join("; ") || `GraphQL request failed: ${res.status}`;
    throw new Error(message);
  }

  const groups = payload?.data?.viewer?.accounts?.[0]?.r2OperationsAdaptiveGroups || [];
  return groups.map((group) => ({
    actionType: String(group?.dimensions?.actionType || ""),
    requests: Number(group?.sum?.requests || 0)
  }));
}

function buildGuard({ now, classBMonthToDate, classBProjected, elapsedDays, daysInMonth, thresholds, operations }) {
  let level = "ok";
  let publicationPaused = false;
  let newPublishDisabled = false;
  let reason = "";

  if (classBProjected >= thresholds.pausePublication) {
    level = "paused";
    publicationPaused = true;
    newPublishDisabled = true;
    reason = "Class B projected usage exceeded pause threshold.";
  } else if (classBProjected >= thresholds.restrictPublishing) {
    level = "restrict-publishing";
    newPublishDisabled = true;
    reason = "Class B projected usage exceeded publishing restriction threshold.";
  } else if (classBProjected >= thresholds.watch) {
    level = "watch";
    reason = "Class B projected usage exceeded warning threshold.";
  }

  return {
    checkedAt: now.toISOString(),
    source: "scheduled-worker",
    level,
    publicationPaused,
    newPublishDisabled,
    reason,
    metrics: {
      classBMonthToDate,
      classBProjected,
      elapsedDays: Number(elapsedDays.toFixed(2)),
      daysInMonth,
      operations
    },
    thresholds
  };
}

function isClassBAction(actionType) {
  const normalized = String(actionType || "").toLowerCase();
  return normalized.includes("classb") || normalized.includes("get") || normalized.includes("head");
}

function requiredEnv(env, name) {
  const value = env?.[name];
  if (!value) throw new Error(`${name} is required.`);
  return String(value);
}

function requireGuardToken(request, env) {
  const expected = String(env?.USAGE_GUARD_TOKEN || "");
  if (!expected) return json({ error: "USAGE_GUARD_TOKEN is not configured." }, { status: 403 });

  const auth = request.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (bearer && bearer === expected) return null;
  return json({ error: "Unauthorized." }, { status: 401 });
}

function numberEnv(env, name, fallback) {
  const value = Number(env?.[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function json(data, init = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers || {})
    }
  });
}
