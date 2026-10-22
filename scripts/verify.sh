#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

SAMPLE_DIR="sample-data"
JSONL_ACTIONS="QUEUE_REVIEW AUTO_CLOSE NEEDS_HUMAN QUEUE_REVIEW QUEUE_REVIEW NEEDS_HUMAN QUEUE_REVIEW NEEDS_HUMAN"
JSONL_RULE_IDS="R-NSF-001 R-DUP-001 R-NSF-HV-001 R-ACC-001 R-BKU-001 R-ABSTAIN-001 R-NSF-001 R-ABSTAIN-001"

TMP_DIR="$(mktemp -d)"
SERVER_LOG="$TMP_DIR/server.log"
RESPONSE_FILE="$TMP_DIR/response.json"
RAW_ACCOUNTS_FILE="$TMP_DIR/raw-accounts.txt"
SERVER_PID=""
BASE_URL=""
SMOKE_CHECKS=0

trap cleanup EXIT

main() {
  step "npm ci" npm ci
  step "npm run format:check" npm run format:check
  step "npm run typecheck" npm run typecheck
  step "npm test" npm test
  step "npm run build" npm run build

  : > "$RAW_ACCOUNTS_FILE"
  smoke_test_normal
  smoke_test_degrade

  echo
  echo "Smoke checks passed: $SMOKE_CHECKS"
  echo "VERIFY PASSED"
}

cleanup() {
  stop_server
  rm -rf "$TMP_DIR"
}

step() {
  local title="$1"
  shift
  echo
  echo "==> $title"
  "$@"
}

fail() {
  echo "FAIL: $1" >&2
  if [ -s "$SERVER_LOG" ]; then
    echo "---- server log ----" >&2
    cat "$SERVER_LOG" >&2
    echo "--------------------" >&2
  fi
  exit 1
}

pass() {
  SMOKE_CHECKS=$((SMOKE_CHECKS + 1))
  echo "ok   $1"
}

smoke_test_normal() {
  echo
  echo "==> smoke test 1: built server, settlement available"
  start_server "false"

  check_post_file "insufficient-funds.json" 201 '"action":"QUEUE_REVIEW"' '"status":"QUEUED"' '"maskedBsb":"***-001"'
  check_post_file "duplicate-payment.json" 201 '"action":"AUTO_CLOSE"' '"status":"CLOSED"'
  check_post_file "unknown-reason.json" 201 '"action":"NEEDS_HUMAN"' '"ruleId":"R-ABSTAIN-001"'
  check_post_file "invalid-bsb.json" 422 'bsb must be in the format XXX-XXX using digits only'
  check_jsonl_lines

  check_server_log_has_no_raw_account_number
  stop_server
}

smoke_test_degrade() {
  echo
  echo "==> smoke test 2: built server, settlement failing"
  start_server "true"

  check_post_file "insufficient-funds.json" 201 '"action":"DEGRADED"' '"status":"DEGRADED"' '"ruleId":"R-DEGRADE-001"'

  check_server_log_has_no_raw_account_number
  stop_server
}

start_server() {
  local settlement_fail="$1"
  local port
  port="$(free_port)"
  BASE_URL="http://127.0.0.1:$port"

  : > "$SERVER_LOG"
  PORT="$port" SETTLEMENT_FAIL="$settlement_fail" node dist/main.js > "$SERVER_LOG" 2>&1 &
  SERVER_PID=$!

  wait_for_health
  pass "server healthy on port $port (SETTLEMENT_FAIL=$settlement_fail)"
}

stop_server() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2> /dev/null || true
    wait "$SERVER_PID" 2> /dev/null || true
    SERVER_PID=""
  fi
}

free_port() {
  node -e 'const server = require("net").createServer(); server.listen(0, "127.0.0.1", () => { console.log(server.address().port); server.close(); });'
}

wait_for_health() {
  local attempt=0
  while [ "$attempt" -lt 50 ]; do
    if ! kill -0 "$SERVER_PID" 2> /dev/null; then
      fail "server exited before becoming healthy"
    fi
    if curl -fsS "$BASE_URL/health" > /dev/null 2>&1; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 0.2
  done
  fail "server did not become healthy at $BASE_URL/health"
}

check_post_file() {
  local file="$1"
  local expected_status="$2"
  shift 2
  post_and_check "$SAMPLE_DIR/$file" "$file" "$expected_status" "$@"
}

check_jsonl_lines() {
  local index=0
  local line
  while IFS= read -r line || [ -n "$line" ]; do
    if [ -z "$line" ]; then
      continue
    fi
    index=$((index + 1))
    local action rule_id body_file
    action="$(nth_word "$JSONL_ACTIONS" "$index")"
    rule_id="$(nth_word "$JSONL_RULE_IDS" "$index")"
    body_file="$TMP_DIR/line-$index.json"
    printf '%s\n' "$line" > "$body_file"
    post_and_check "$body_file" "exceptions.jsonl line $index" 201 "\"action\":\"$action\"" "\"ruleId\":\"$rule_id\""
  done < "$SAMPLE_DIR/exceptions.jsonl"

  local expected_count
  expected_count="$(echo "$JSONL_ACTIONS" | wc -w | tr -d ' ')"
  if [ "$index" -ne "$expected_count" ]; then
    fail "exceptions.jsonl has $index lines, expected $expected_count"
  fi
}

nth_word() {
  echo "$1" | cut -d' ' -f"$2"
}

post_and_check() {
  local body_file="$1"
  local label="$2"
  local expected_status="$3"
  shift 3

  local raw_account_number status
  raw_account_number="$(account_number_of "$body_file")"
  echo "$raw_account_number" >> "$RAW_ACCOUNTS_FILE"

  status="$(curl -sS -o "$RESPONSE_FILE" -w '%{http_code}' -X POST "$BASE_URL/exceptions" \
    -H 'content-type: application/json' --data-binary "@$body_file")"
  if [ "$status" != "$expected_status" ]; then
    fail "$label: expected HTTP $expected_status, got $status: $(cat "$RESPONSE_FILE")"
  fi

  local expected_text
  for expected_text in "$@"; do
    if ! grep -qF -- "$expected_text" "$RESPONSE_FILE"; then
      fail "$label: response is missing $expected_text: $(cat "$RESPONSE_FILE")"
    fi
  done

  if grep -qF -- "$raw_account_number" "$RESPONSE_FILE"; then
    fail "$label: response contains the raw account number"
  fi

  pass "$label -> HTTP $status"
}

account_number_of() {
  node -e 'const body = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); process.stdout.write(String(body.accountNumber));' "$1"
}

check_server_log_has_no_raw_account_number() {
  if grep -qF -f "$RAW_ACCOUNTS_FILE" "$SERVER_LOG"; then
    fail "server log contains a raw account number"
  fi
  pass "server log has no raw account number"
}

main "$@"
