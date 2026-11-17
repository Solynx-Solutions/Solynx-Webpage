"""Checks for the outbound User-Agent and safe failure logging in _call /
_guard_env. Logs must identify only the failing stage/service and a status
(numeric HTTP code or a fixed label) — never credentials, request/response
bodies, PII, full URLs, or exception reprs."""
import importlib.util
import json
import os
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("plan_fit_diagnostics", ROOT / "api" / "plan-fit.py")
plan_fit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(plan_fit)

SECRET_TOKEN = "super-secret-crm-token-value"
SECRET_URL = "https://real-guard-host.upstash.io"


class _FakeResponse:
    def __init__(self, payload):
        self._payload = json.dumps(payload).encode()

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False

    def read(self):
        return self._payload


class UserAgentHeaderTests(unittest.TestCase):
    """Prior authorized GHL testing showed the gateway needs an explicit,
    descriptive User-Agent instead of urllib's default."""

    def test_call_sets_explicit_descriptive_user_agent(self):
        captured = {}

        def fake_urlopen(request, timeout=5):
            captured["user_agent"] = request.get_header("User-agent")
            return _FakeResponse({"ok": True})

        with patch.object(plan_fit, "urlopen", side_effect=fake_urlopen):
            plan_fit._call(SECRET_URL, SECRET_TOKEN, stage="test.stage")

        self.assertEqual(captured["user_agent"], "SOLYNX-Plan-Finder/1.0")
        self.assertFalse(captured["user_agent"].lower().startswith("python-urllib"))


class SafeCallFailureLoggingTests(unittest.TestCase):
    """_call must log only stage + status on failure, and must never leak
    the credential, the body, the full URL, or the exception's repr."""

    def test_http_error_logs_numeric_status_only(self):
        def fake_urlopen(request, timeout=5):
            raise HTTPError(SECRET_URL, 503, "Service Unavailable", {}, BytesIO(b""))

        with patch.object(plan_fit, "urlopen", side_effect=fake_urlopen):
            with self.assertLogs("plan_fit", level="ERROR") as captured:
                with self.assertRaises(ConnectionError):
                    plan_fit._call(SECRET_URL, SECRET_TOKEN, {"pii": "jamie@example.com"}, stage="crm.notes_create")

        self.assertEqual(len(captured.records), 1)
        message = captured.records[0].getMessage()
        self.assertIn("stage=crm.notes_create", message)
        self.assertIn("status=503", message)
        self.assertNotIn(SECRET_TOKEN, message)
        self.assertNotIn(SECRET_URL, message)
        self.assertNotIn("jamie@example.com", message)
        self.assertNotIn("Service Unavailable", message)

    def test_url_error_logs_fixed_transport_failure_label(self):
        def fake_urlopen(request, timeout=5):
            raise URLError("[Errno -2] Name or service not known: " + SECRET_URL)

        with patch.object(plan_fit, "urlopen", side_effect=fake_urlopen):
            with self.assertLogs("plan_fit", level="ERROR") as captured:
                with self.assertRaises(ConnectionError):
                    plan_fit._call(SECRET_URL, SECRET_TOKEN, stage="guard.redis")

        self.assertEqual(len(captured.records), 1)
        message = captured.records[0].getMessage()
        self.assertIn("stage=guard.redis", message)
        self.assertIn("status=transport_failure", message)
        self.assertNotIn(SECRET_URL, message)
        self.assertNotIn(SECRET_TOKEN, message)

    def test_invalid_json_response_logs_fixed_invalid_response_label(self):
        class _BadResponse(_FakeResponse):
            def read(self):
                return b"not json"

        def fake_urlopen(request, timeout=5):
            return _BadResponse({})

        with patch.object(plan_fit, "urlopen", side_effect=fake_urlopen):
            with self.assertLogs("plan_fit", level="ERROR") as captured:
                with self.assertRaises(ConnectionError):
                    plan_fit._call(SECRET_URL, SECRET_TOKEN, stage="crm.tasks_lookup")

        message = captured.records[0].getMessage()
        self.assertIn("stage=crm.tasks_lookup", message)
        self.assertIn("status=invalid_response", message)
        self.assertNotIn(SECRET_URL, message)

    def test_stage_is_required_so_every_call_site_is_labeled(self):
        with self.assertRaises(TypeError):
            plan_fit._call(SECRET_URL, SECRET_TOKEN)


class SafeGuardEnvFailureLoggingTests(unittest.TestCase):
    """_guard_env must fail closed and log only presence/shape booleans for
    its config, never the actual URL or token values."""

    def setUp(self):
        for key in ("PLAN_FIT_CRM_TOKEN", "PLAN_FIT_GUARD_REST_URL", "PLAN_FIT_GUARD_REST_TOKEN",
                    "KV_REST_API_URL", "KV_REST_API_TOKEN"):
            os.environ.pop(key, None)

    def tearDown(self):
        for key in ("PLAN_FIT_CRM_TOKEN", "PLAN_FIT_GUARD_REST_URL", "PLAN_FIT_GUARD_REST_TOKEN",
                    "KV_REST_API_URL", "KV_REST_API_TOKEN"):
            os.environ.pop(key, None)

    def test_missing_everything_logs_all_false_booleans(self):
        with self.assertLogs("plan_fit", level="ERROR") as captured:
            with self.assertRaises(ConnectionError):
                plan_fit._guard_env()
        message = captured.records[0].getMessage()
        self.assertIn("status=config_missing", message)
        self.assertIn("crm_token_present=False", message)
        self.assertIn("guard_url_present=False", message)
        self.assertIn("guard_token_present=False", message)

    def test_present_but_invalid_guard_url_logs_present_true_valid_false(self):
        os.environ["PLAN_FIT_CRM_TOKEN"] = SECRET_TOKEN
        os.environ["PLAN_FIT_GUARD_REST_URL"] = "https://not-upstash.example.com"
        os.environ["PLAN_FIT_GUARD_REST_TOKEN"] = "guard-secret-token"
        with self.assertLogs("plan_fit", level="ERROR") as captured:
            with self.assertRaises(ConnectionError):
                plan_fit._guard_env()
        message = captured.records[0].getMessage()
        self.assertIn("guard_url_present=True", message)
        self.assertIn("guard_url_valid=False", message)
        self.assertNotIn(SECRET_TOKEN, message)
        self.assertNotIn("guard-secret-token", message)
        self.assertNotIn("not-upstash.example.com", message)

    def test_success_path_does_not_log(self):
        os.environ["PLAN_FIT_CRM_TOKEN"] = SECRET_TOKEN
        os.environ["PLAN_FIT_GUARD_REST_URL"] = SECRET_URL
        os.environ["PLAN_FIT_GUARD_REST_TOKEN"] = "guard-secret-token"
        with self.assertRaises(AssertionError):
            # assertLogs raises AssertionError itself when nothing was logged,
            # which is exactly the success behavior we want to confirm.
            with self.assertLogs("plan_fit", level="ERROR"):
                plan_fit._guard_env()


PII_EMAIL = "jamie@riosroofing.com"
CONTACT = {"person": "Jamie Rios", "business": "Rios Roofing", "email": PII_EMAIL}


class GuardRejectionLoggingTests(unittest.TestCase):
    """_redis, _lock_or_replay and _throttle must log a fixed stage/status
    before failing closed, with no raw guard URL/token/identity leaked."""

    def test_redis_invalid_response_logs_fixed_status(self):
        def fake_urlopen(request, timeout=5):
            return _FakeResponse({"unexpected": True})  # no "result", no "error"

        with patch.object(plan_fit, "urlopen", side_effect=fake_urlopen):
            with self.assertLogs("plan_fit", level="ERROR") as captured:
                with self.assertRaises(ConnectionError):
                    plan_fit._redis(SECRET_URL, SECRET_TOKEN, ["GET", "some-key"])
        message = captured.records[-1].getMessage()
        self.assertIn("stage=guard.redis", message)
        self.assertIn("status=redis_response_invalid", message)
        self.assertNotIn(SECRET_URL, message)
        self.assertNotIn(SECRET_TOKEN, message)

    def test_lock_or_replay_logs_lock_busy_on_nx_contention(self):
        def fake_urlopen(request, timeout=5):
            command = json.loads(request.data.decode())
            if command[0] == "GET":
                return _FakeResponse({"result": None})
            return _FakeResponse({"result": None})  # SET ... NX contention: not "OK"

        with patch.object(plan_fit, "urlopen", side_effect=fake_urlopen):
            with self.assertLogs("plan_fit", level="ERROR") as captured:
                with self.assertRaises(ConnectionError):
                    plan_fit._lock_or_replay(SECRET_URL, SECRET_TOKEN, "plan-fit:note:v1:abc123")
        message = captured.records[-1].getMessage()
        self.assertIn("stage=guard.lock", message)
        self.assertIn("status=lock_busy", message)
        self.assertNotIn(SECRET_URL, message)

    def test_throttle_logs_rate_limited_for_identity_limit(self):
        def fake_urlopen(request, timeout=5):
            command = json.loads(request.data.decode())
            key = command[-1]
            return _FakeResponse({"result": 1 if key == "plan-fit:rate:all" else 6})

        with patch.object(plan_fit, "urlopen", side_effect=fake_urlopen):
            with self.assertLogs("plan_fit", level="ERROR") as captured:
                with self.assertRaises(ConnectionError):
                    plan_fit._throttle(SECRET_URL, SECRET_TOKEN, PII_EMAIL)
        message = captured.records[-1].getMessage()
        self.assertIn("stage=guard.throttle_identity", message)
        self.assertIn("status=rate_limited", message)
        self.assertNotIn(PII_EMAIL, message)

    def test_throttle_logs_rate_limited_for_global_limit(self):
        def fake_urlopen(request, timeout=5):
            return _FakeResponse({"result": 61})

        with patch.object(plan_fit, "urlopen", side_effect=fake_urlopen):
            with self.assertLogs("plan_fit", level="ERROR") as captured:
                with self.assertRaises(ConnectionError):
                    plan_fit._throttle(SECRET_URL, SECRET_TOKEN, PII_EMAIL)
        message = captured.records[-1].getMessage()
        self.assertIn("stage=guard.throttle_global", message)
        self.assertIn("status=rate_limited", message)

    def test_upsert_contact_logs_receipt_invalid_on_wrong_location(self):
        def fake_urlopen(request, timeout=5):
            return _FakeResponse({"contact": {"id": "contact-1", "locationId": "WRONG_LOCATION"}})

        with patch.object(plan_fit, "urlopen", side_effect=fake_urlopen):
            with self.assertLogs("plan_fit", level="ERROR") as captured:
                with self.assertRaises(ConnectionError):
                    plan_fit._upsert_contact(SECRET_TOKEN, CONTACT)
        message = captured.records[-1].getMessage()
        self.assertIn("stage=crm.upsert_contact", message)
        self.assertIn("status=receipt_invalid", message)
        self.assertNotIn(PII_EMAIL, message)


class GuardedPipelineFailureLoggingTests(unittest.TestCase):
    """Exercises the full _guarded_note pipeline (guard env + lock + throttle
    + CRM upsert/notes) with a mocked receiver, injecting one shape or
    confirmation failure at a time to confirm each stage logs its fixed
    status with no leakage of the contact, guard URL/token, or CRM token."""

    def setUp(self):
        os.environ["PLAN_FIT_CRM_TOKEN"] = SECRET_TOKEN
        os.environ["PLAN_FIT_GUARD_REST_URL"] = SECRET_URL
        os.environ["PLAN_FIT_GUARD_REST_TOKEN"] = "guard-secret-token"
        self.redis_store = {}
        self.seed = [PII_EMAIL, "Rios Roofing", "Jamie Rios", [0, 0, 0, 0, 0]]

    def tearDown(self):
        for key in ("PLAN_FIT_CRM_TOKEN", "PLAN_FIT_GUARD_REST_URL", "PLAN_FIT_GUARD_REST_TOKEN"):
            os.environ.pop(key, None)

    def _redis_default(self, command):
        op = command[0]
        if op == "GET":
            return self.redis_store.get(command[1])
        if op == "SET":
            key, value = command[1], command[2]
            if "NX" in command and key in self.redis_store:
                return None
            self.redis_store[key] = value
            return "OK"
        if op == "EVAL":
            key = command[-1]
            count = self.redis_store.get(key, 0) + 1
            self.redis_store[key] = count
            return count
        raise AssertionError(f"Unexpected redis command: {command}")

    def _dispatcher(self, *, notes_lookup=None, notes_create_override=None, confirm_override=None):
        def fake_urlopen(request, timeout=5):
            url = request.full_url
            payload = json.loads(request.data.decode()) if request.data else None
            if url == SECRET_URL:
                if payload[0] == "SET" and str(payload[2]).startswith("done:") and confirm_override is not None:
                    return _FakeResponse({"result": confirm_override})
                return _FakeResponse({"result": self._redis_default(payload)})
            if url.endswith("/contacts/upsert"):
                return _FakeResponse({"contact": {"id": "contact-1", "locationId": plan_fit.LOCATION_ID}})
            if url.endswith("/notes") and payload is None:
                return _FakeResponse(notes_lookup if notes_lookup is not None else {"notes": []})
            if url.endswith("/notes"):
                note = notes_create_override if notes_create_override is not None else {"id": "note-1", "contactId": "contact-1"}
                return _FakeResponse({"note": note})
            raise AssertionError(f"Unexpected URL: {url}")
        return fake_urlopen

    def test_notes_lookup_invalid_shape_logs_fixed_status(self):
        fake = self._dispatcher(notes_lookup={"notes": "not-a-list"})
        with patch.object(plan_fit, "urlopen", side_effect=fake):
            with self.assertLogs("plan_fit", level="ERROR") as captured:
                with self.assertRaises(ConnectionError):
                    plan_fit._guarded_note(self.seed, "plan-fit:note:v1:", "marker", ["line"], CONTACT)
        messages = [r.getMessage() for r in captured.records]
        self.assertTrue(any("stage=crm.notes_lookup" in m and "status=lookup_invalid" in m for m in messages))
        self.assertFalse(any(PII_EMAIL in m for m in messages))
        self.assertFalse(any(SECRET_URL in m for m in messages))

    def test_note_receipt_invalid_logs_fixed_status(self):
        fake = self._dispatcher(notes_create_override={"id": "", "contactId": "contact-1"})
        with patch.object(plan_fit, "urlopen", side_effect=fake):
            with self.assertLogs("plan_fit", level="ERROR") as captured:
                with self.assertRaises(ConnectionError):
                    plan_fit._guarded_note(self.seed, "plan-fit:note:v1:", "marker", ["line"], CONTACT)
        messages = [r.getMessage() for r in captured.records]
        self.assertTrue(any("stage=crm.notes_create" in m and "status=receipt_invalid" in m for m in messages))

    def test_note_confirmation_failed_logs_fixed_status(self):
        fake = self._dispatcher(confirm_override="FAIL")
        with patch.object(plan_fit, "urlopen", side_effect=fake):
            with self.assertLogs("plan_fit", level="ERROR") as captured:
                with self.assertRaises(ConnectionError):
                    plan_fit._guarded_note(self.seed, "plan-fit:note:v1:", "marker", ["line"], CONTACT)
        messages = [r.getMessage() for r in captured.records]
        self.assertTrue(any("stage=guard.confirm_note" in m and "status=confirmation_failed" in m for m in messages))

    def test_successful_note_does_not_log(self):
        fake = self._dispatcher()
        with patch.object(plan_fit, "urlopen", side_effect=fake):
            with self.assertRaises(AssertionError):
                # No ERROR records at all is the success case.
                with self.assertLogs("plan_fit", level="ERROR"):
                    plan_fit._guarded_note(self.seed, "plan-fit:note:v1:", "marker", ["line"], CONTACT)


if __name__ == "__main__":
    unittest.main()
