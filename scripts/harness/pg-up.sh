#!/bin/bash
# Scratch Postgres 16 for JOS-83: a cluster under the postgres user's home, Supabase stand-ins,
# every migration applied once into a template database (jos83_tpl) that tests clone.
set -euo pipefail
BIN=/usr/lib/postgresql/16/bin
ROOT=/var/lib/postgresql/jos83
SOCK=$ROOT/sock
PORT=54329
REPO=/home/user/baby-tracker-app
psqlx() { psql -X -q -h "$SOCK" -p $PORT -U postgres "$@"; }

if [ ! -d "$ROOT/data" ]; then
  install -d -o postgres -g postgres "$ROOT" "$SOCK"
  runuser -u postgres -- $BIN/initdb -D "$ROOT/data" -A trust -U postgres >/dev/null
fi
# A pid file left by a cluster that died with the last session blocks the start; one that belongs to
# a live server must stay. (Removing it from under a running server orphans it.)
if [ -f "$ROOT/data/postmaster.pid" ] && ! kill -0 "$(head -1 "$ROOT/data/postmaster.pid")" 2>/dev/null; then
  rm -f "$ROOT/data/postmaster.pid"
fi
if ! runuser -u postgres -- $BIN/pg_ctl -D "$ROOT/data" status >/dev/null 2>&1; then
  runuser -u postgres -- $BIN/pg_ctl -D "$ROOT/data" -o "-p $PORT -k $SOCK -c listen_addresses=''" -l "$ROOT/log" -w start >/dev/null
fi

psqlx -d postgres -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
SQL

if ! psqlx -d postgres -Atc "select 1 from pg_database where datname='jos83_tpl'" | grep -q 1; then
  psqlx -d postgres -c "create database jos83_tpl"
  psqlx -d jos83_tpl -v ON_ERROR_STOP=1 <<'SQL'
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create publication supabase_realtime;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
SQL
  for f in $(ls $REPO/supabase/migrations/*.sql | sort); do
    echo "applying $(basename $f)"
    psqlx -d jos83_tpl -v ON_ERROR_STOP=1 -f "$f" >/dev/null
  done
fi
echo "ready: socket=$SOCK port=$PORT template=jos83_tpl"
