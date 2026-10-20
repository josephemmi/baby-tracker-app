// Harness for JOS-83 (scratchpad only): the browser's Supabase calls are answered by the REAL database
// functions in a scratch Postgres, per simulated user, with a controllable clock.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { execFileSync } from "node:child_process";

export { chromium };
export const SOCK = "/var/lib/postgresql/jos83/sock";
export const USERS = { joseph: "00000000-0000-0000-0000-0000000000a1", jen: "00000000-0000-0000-0000-0000000000a2" };
export const BABY = "00000000-0000-0000-0000-0000000000d1";
export const HOUSEHOLD = "00000000-0000-0000-0000-0000000000c1";
const PSQL = ["-X", "-q", "-A", "-t", "-h", SOCK, "-p", "54329", "-U", "postgres", "-v", "ON_ERROR_STOP=1"];

export const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
export function lit(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "string") return q(v);
  return q(JSON.stringify(v));
}

// Run SQL, return the last non-empty output line.
export function psql(db, sql) {
  const out = execFileSync("psql", [...PSQL, "-d", db, "-c", sql], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const lines = out.split("\n").filter((l) => l.length);
  return lines[lines.length - 1] ?? "";
}
export function asUser(db, user, sql) {
  const sub = USERS[user] ?? user;
  return psql(db, `begin; set local role authenticated; select set_config('request.jwt.claim.sub', ${q(sub)}, true); ${sql}; commit;`);
}

// A fresh database from the migrated template, household/baby/users, and a clock the tests can move.
export function freshDb(name) {
  execFileSync("psql", ["-X", "-q", "-h", SOCK, "-p", "54329", "-U", "postgres", "-d", "postgres", "-c", `drop database if exists ${name}`, "-c", `create database ${name} template jos83_tpl`]);
  psql(name, `
    insert into auth.users (id) values (${q(USERS.joseph)}), (${q(USERS.jen)});
    insert into public.households (id, name) values (${q(HOUSEHOLD)}, 'Our household');
    insert into public.users (id, household_id, name) values (${q(USERS.joseph)}, ${q(HOUSEHOLD)}, 'Joseph'), (${q(USERS.jen)}, ${q(HOUSEHOLD)}, 'Jen');
    insert into public.babies (id, household_id, name, date_of_birth) values (${q(BABY)}, ${q(HOUSEHOLD)}, 'Baby', '2026-06-01');
    create table public.t_clock (at timestamptz);
    insert into public.t_clock values (null);
    create or replace function public.sleep_now() returns timestamptz language sql stable as $$
      select coalesce((select at from public.t_clock), date_trunc('milliseconds', now())) $$;
  `);
}
export const setClock = (db, iso) => psql(db, iso ? `update public.t_clock set at = ${q(iso)}` : `update public.t_clock set at = null`);

// Seed finished/open sleeps straight into the table (as the owner), from [{start,end}] stretches in ms.
export function seedSleeps(db, sleeps) {
  const iso = (ms) => new Date(ms).toISOString();
  const rows = sleeps.map((s) => {
    const segs = s.stretches.map((x) => ({ start: iso(x.start), end: x.end == null ? null : iso(x.end) }));
    const last = s.stretches[s.stretches.length - 1];
    const closed = s.closedAt === undefined ? last.end : s.closedAt;
    return `(${q(BABY)}, ${q(USERS.joseph)}, ${q(JSON.stringify(segs))}::jsonb, ${closed == null ? "null" : q(iso(closed))}, 1, ${q(USERS.joseph)}, 'start', ${q(iso(last.end ?? last.start))})`;
  });
  const chunk = 200;
  for (let i = 0; i < rows.length; i += chunk) {
    psql(db, `insert into public.sleeps (baby_id, logged_by, segments, closed_at, rev, last_by, last_action, last_at) values ${rows.slice(i, i + chunk).join(",")}`);
  }
}

function whereFrom(url) {
  const conds = [];
  for (const [k, v] of url.searchParams) {
    if (["select", "order", "limit", "offset"].includes(k)) continue;
    const m = /^(not\.)?(eq|neq|is|lt|lte|gt|gte)\.(.*)$/.exec(v);
    if (!m) throw new Error(`unsupported filter ${k}=${v}`);
    const [, not, op, val] = m;
    const col = `s.${k}`;
    if (op === "is") conds.push(`${col} is ${not ? "not " : ""}${val}`);
    else conds.push(`${col} ${{ eq: "=", neq: "<>", lt: "<", lte: "<=", gt: ">", gte: ">=" }[op]} ${q(val)}`);
  }
  return conds.length ? `where ${conds.join(" and ")}` : "";
}

export const hits = [];
// Entry rows the Log's refetch gets back (the release-notes shots want realistic Last feed / poo / pee tiles).
export const ENTRY_ROWS = [];

// Answer the Supabase REST/RPC/auth/realtime calls of one simulated phone.
export async function installApi(context, { db, user, log = hits, onRpc }) {
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "content-range" };
  await context.route(/^https?:\/\/localhost:54321\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const json = (status, body, extra = {}) =>
      route.fulfill({ status, contentType: "application/json", headers: { ...cors, ...extra }, body: typeof body === "string" ? body : JSON.stringify(body) });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    try {
      if (path.startsWith("/rest/v1/rpc/")) {
        const fn = path.split("/").pop();
        const body = req.postDataJSON() ?? {};
        log.push({ user, kind: "rpc", fn, body });
        if (onRpc) await onRpc(fn, body);
        const args = Object.entries(body).map(([k, v]) => `${k} => ${lit(v)}`).join(", ");
        return json(200, asUser(db, user, `select public.${fn}(${args})::text`));
      }
      if (path === "/rest/v1/sleeps" && req.method() === "GET") {
        log.push({ user, kind: "get", table: "sleeps", query: url.search });
        const sel = url.searchParams.get("select") ?? "*";
        const pick = sel === "*" ? "to_jsonb(s)" : `jsonb_build_object(${sel.split(",").map((c) => `${q(c.trim())}, s.${c.trim()}`).join(", ")})`;
        const order = url.searchParams.get("order");
        const ord = order ? `order by ${order.split(",").map((o) => { const [c, d] = o.split("."); return `s.${c} ${d === "desc" ? "desc" : "asc"}`; }).join(", ")}` : "";
        const lim = url.searchParams.get("limit"), off = url.searchParams.get("offset");
        const inner = `select ${pick} as j from public.sleeps s ${whereFrom(url)} ${ord} ${off ? `offset ${+off}` : ""} ${lim ? `limit ${+lim}` : ""}`;
        const out = asUser(db, user, `select coalesce(jsonb_agg(x.j), '[]'::jsonb)::text from (${inner}) x`);
        const wantsObject = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object+json");
        if (wantsObject) {
          const arr = JSON.parse(out);
          return arr.length === 1 ? json(200, arr[0]) : json(406, { message: "JSON object requested, multiple (or no) rows returned" });
        }
        return json(200, out, { "content-range": `0-0/*` });
      }
      if (path.startsWith("/rest/v1/entries")) {
        log.push({ user, kind: req.method().toLowerCase(), table: "entries", query: url.search });
        if (req.method() === "GET" && ENTRY_ROWS.length) return json(200, ENTRY_ROWS, { "content-range": `0-${ENTRY_ROWS.length - 1}/${ENTRY_ROWS.length}` });
        return json(200, [], { "content-range": "*/0" });
      }
      if (path.startsWith("/auth/v1/")) return json(401, { message: "no session in the harness" });
      log.push({ user, kind: "unhandled", method: req.method(), path });
      return json(404, { message: `harness: no handler for ${req.method()} ${path}` });
    } catch (e) {
      log.push({ user, kind: "error", path, error: String(e.stderr || e.message).slice(0, 300) });
      return json(400, { code: "P0001", message: String(e.stderr || e.message).replace(/^ERROR:\s+/, "").slice(0, 300) });
    }
  });
  // Realtime: say yes to every join so the app does not log failures; no events are pushed (the poll covers it).
  await context.routeWebSocket(/localhost:54321\/realtime/, (ws) => {
    ws.onMessage((m) => {
      try {
        const [joinRef, ref, topic, event] = JSON.parse(String(m));
        if (event === "phx_join" || event === "heartbeat") {
          ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response: { postgres_changes: [] } }]));
        }
      } catch { /* ignore */ }
    });
  });
}

export async function newPhone(browser, { db, user, width = 393, height = 852, time, tz = "Europe/London", log }) {
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: tz, locale: "en-GB",
  });
  await installApi(context, { db, user, log });
  if (time) await context.clock.install({ time: new Date(time) });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log(`[${user}] pageerror:`, e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/websocket|WebSocket|ERR_CONNECTION|Failed to load resource/.test(m.text())) console.log(`[${user}] console.error:`, m.text().slice(0, 200)); });
  return { context, page };
}

export const HIDE_DEV_UI = `nextjs-portal { display: none !important } *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important }`;
