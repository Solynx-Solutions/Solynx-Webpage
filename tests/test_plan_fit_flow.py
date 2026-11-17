"""Regression checks for the contact-first plan-fit entrance, question flow and callback opt-in."""
import importlib.util
import json
import os
from email.message import Message
from html import escape
from io import BytesIO
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlencode
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("plan_fit_flow", ROOT / "api" / "plan-fit.py")
plan_fit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(plan_fit)

CONTACT = {"person": "Jamie Rios", "business": "Rios Roofing", "email": "jamie@riosroofing.com"}
MARKET = {"utm_source": "google", "utm_campaign": "fall-promo"}


def body(fields):
    return urlencode(fields).encode()


class EntranceScreenTests(unittest.TestCase):
    def test_entrance_collects_contact_without_phone(self):
        html = plan_fit.entrance_screen({}).decode()
        self.assertIn('name="person"', html)
        self.assertIn('name="business"', html)
        self.assertIn('name="email"', html)
        self.assertNotIn('name="phone"', html)

    def test_entrance_carries_market_attribution_as_hidden_fields(self):
        html = plan_fit.entrance_screen(MARKET).decode()
        self.assertIn('name="utm_source" value="google"', html)
        self.assertIn('name="utm_campaign" value="fall-promo"', html)

    def test_entrance_escapes_market_values(self):
        html = plan_fit.entrance_screen({"utm_source": '"><script>alert(1)</script>'}).decode()
        self.assertNotIn('<script>', html)


class ParseRequestStageTests(unittest.TestCase):
    def test_contact_only_submission_is_entrance_stage(self):
        stage = plan_fit.parse_request(body(CONTACT))
        self.assertEqual(stage["kind"], "entrance")
        self.assertEqual(stage["answers"], [])
        self.assertEqual(stage["contact"], CONTACT)

    def test_mid_question_submission_has_no_phone_requirement(self):
        fields = dict(CONTACT, q0="0")
        stage = plan_fit.parse_request(body(fields))
        self.assertEqual(stage["kind"], "question")
        self.assertEqual(stage["answers"], [0])

    def test_completed_diagnostics_without_phone_is_complete_stage(self):
        fields = dict(CONTACT, q0="0", q1="1", q2="0", q3="0", q4="0")
        stage = plan_fit.parse_request(body(fields))
        self.assertEqual(stage["kind"], "complete")
        self.assertEqual(stage["answers"], [0, 1, 0, 0, 0])
        self.assertIsNone(stage["media"])

    def test_optional_media_answer_survives_through_completion(self):
        fields = dict(CONTACT, q0="0", q1="0", q2="0", q3="0", q4="0", media="1")
        stage = plan_fit.parse_request(body(fields))
        self.assertEqual(stage["kind"], "complete")
        self.assertEqual(stage["media"], 1)

    def test_invalid_media_answer_is_rejected(self):
        fields = dict(CONTACT, q0="0", q1="0", q2="0", q3="0", q4="0", media="99")
        with self.assertRaises(ValueError):
            plan_fit.parse_request(body(fields))

    def test_market_attribution_survives_through_completion(self):
        fields = dict(CONTACT, **MARKET, q0="0", q1="0", q2="0", q3="0", q4="0")
        stage = plan_fit.parse_request(body(fields))
        self.assertEqual(stage["market"], MARKET)

    def test_callback_requires_both_phone_and_action(self):
        fields = dict(CONTACT, q0="0", q1="0", q2="0", q3="0", q4="0", phone="555-010-2020")
        with self.assertRaises(ValueError):
            plan_fit.parse_request(body(fields))

    def test_callback_stage_parses_with_valid_phone(self):
        fields = dict(CONTACT, q0="0", q1="0", q2="0", q3="0", q4="0", phone="(555) 010-2020", action="callback")
        stage = plan_fit.parse_request(body(fields))
        self.assertEqual(stage["kind"], "callback")
        self.assertEqual(stage["phone"], "(555) 010-2020")

    def test_callback_rejects_invalid_phone(self):
        fields = dict(CONTACT, q0="0", q1="0", q2="0", q3="0", q4="0", phone="abc", action="callback")
        with self.assertRaises(ValueError):
            plan_fit.parse_request(body(fields))

    def test_callback_with_media_field_is_rejected_as_unexpected(self):
        # The media choice is only ever submitted on the pricing-completion
        # request, never alongside a callback opt-in.
        fields = dict(CONTACT, q0="0", q1="0", q2="0", q3="0", q4="0", phone="(555) 010-2020", action="callback", media="0")
        with self.assertRaises(ValueError):
            plan_fit.parse_request(body(fields))

    def test_unexpected_field_is_rejected(self):
        fields = dict(CONTACT, unexpected="1")
        with self.assertRaises(ValueError):
            plan_fit.parse_request(body(fields))


class ScreenRenderingTests(unittest.TestCase):
    def test_question_screen_has_no_phone_field(self):
        html = plan_fit.screen([0], CONTACT, {}).decode()
        self.assertNotIn('name="phone"', html)

    def test_final_question_screen_offers_optional_unscored_media_choice(self):
        html = plan_fit.screen([0, 0, 0, 0], CONTACT, {}).decode()
        self.assertIn('name="media"', html)
        self.assertNotIn('required name="media"', html)

    def test_earlier_question_screens_have_no_media_choice(self):
        html = plan_fit.screen([0], CONTACT, {}).decode()
        self.assertNotIn('name="media"', html)

    def test_completion_shows_verified_price_and_callback_opt_in_without_upfront_action_choice(self):
        html = plan_fit.screen([0, 1, 0, 0, 0], CONTACT, {}, receipt="task-123").decode()
        self.assertIn(plan_fit.PLANS[1][3], html)  # verified price shown immediately
        self.assertIn('name="phone"', html)  # callback opt-in only appears after pricing
        self.assertIn('value="callback"', html)

    def test_completion_without_receipt_raises(self):
        with self.assertRaises(ValueError):
            plan_fit.screen([0, 1, 0, 0, 0], CONTACT, {})

    def test_callback_screen_has_no_further_phone_prompt(self):
        html = plan_fit.callback_screen([0, 0, 0, 0, 0], "task-456").decode()
        self.assertNotIn('name="phone"', html)
        self.assertIn("callback request is in", html)


class GuardedSubmitTests(unittest.TestCase):
    def setUp(self):
        for key in ("PLAN_FIT_CRM_TOKEN", "PLAN_FIT_GUARD_REST_URL", "PLAN_FIT_GUARD_REST_TOKEN",
                    "KV_REST_API_URL", "KV_REST_API_TOKEN"):
            os.environ.pop(key, None)

    def tearDown(self):
        for key in ("PLAN_FIT_CRM_TOKEN", "PLAN_FIT_GUARD_REST_URL", "PLAN_FIT_GUARD_REST_TOKEN",
                    "KV_REST_API_URL", "KV_REST_API_TOKEN"):
            os.environ.pop(key, None)

    def test_record_request_refuses_without_credentials(self):
        with self.assertRaises(ConnectionError):
            plan_fit.record_request([0, 0, 0, 0, 0], CONTACT, MARKET)

    def test_record_callback_refuses_without_credentials(self):
        with self.assertRaises(ConnectionError):
            plan_fit.record_callback([0, 0, 0, 0, 0], CONTACT, MARKET, "555-010-2020")


class GuardEnvFallbackTests(unittest.TestCase):
    """_guard_env must fall back from the dedicated PLAN_FIT_GUARD_REST_*
    vars to the Upstash-provisioned KV_REST_API_* vars, but only as a
    coherent pair — never mixing one source's URL with the other's token —
    and the resolved pair still has to pass the https Upstash check."""

    def setUp(self):
        os.environ["PLAN_FIT_CRM_TOKEN"] = "crm-token"
        for key in ("PLAN_FIT_GUARD_REST_URL", "PLAN_FIT_GUARD_REST_TOKEN",
                    "KV_REST_API_URL", "KV_REST_API_TOKEN"):
            os.environ.pop(key, None)

    def tearDown(self):
        for key in ("PLAN_FIT_CRM_TOKEN", "PLAN_FIT_GUARD_REST_URL", "PLAN_FIT_GUARD_REST_TOKEN",
                    "KV_REST_API_URL", "KV_REST_API_TOKEN"):
            os.environ.pop(key, None)

    def test_falls_back_to_kv_pair_when_dedicated_vars_are_absent(self):
        os.environ["KV_REST_API_URL"] = "https://example.upstash.io"
        os.environ["KV_REST_API_TOKEN"] = "kv-token"
        token, guard, guard_token = plan_fit._guard_env()
        self.assertEqual(token, "crm-token")
        self.assertEqual(guard, "https://example.upstash.io")
        self.assertEqual(guard_token, "kv-token")

    def test_dedicated_pair_takes_priority_over_kv_pair(self):
        os.environ["PLAN_FIT_GUARD_REST_URL"] = "https://dedicated.upstash.io"
        os.environ["PLAN_FIT_GUARD_REST_TOKEN"] = "dedicated-token"
        os.environ["KV_REST_API_URL"] = "https://example.upstash.io"
        os.environ["KV_REST_API_TOKEN"] = "kv-token"
        _, guard, guard_token = plan_fit._guard_env()
        self.assertEqual(guard, "https://dedicated.upstash.io")
        self.assertEqual(guard_token, "dedicated-token")

    def test_mixed_pair_dedicated_url_with_kv_token_only_is_rejected(self):
        # A dedicated URL with no dedicated token must not silently pair
        # with the KV token — that would mix two different provisioned
        # pairs. The whole dedicated side is incoherent, so it falls back
        # to the KV pair wholesale; since KV_REST_API_URL is absent here,
        # the fallback pair is itself incomplete and must fail closed.
        os.environ["PLAN_FIT_GUARD_REST_URL"] = "https://dedicated.upstash.io"
        os.environ["KV_REST_API_TOKEN"] = "kv-token"
        with self.assertRaises(ConnectionError):
            plan_fit._guard_env()

    def test_mixed_pair_dedicated_token_with_kv_url_only_is_rejected(self):
        os.environ["PLAN_FIT_GUARD_REST_TOKEN"] = "dedicated-token"
        os.environ["KV_REST_API_URL"] = "https://example.upstash.io"
        with self.assertRaises(ConnectionError):
            plan_fit._guard_env()

    def test_kv_pair_with_non_upstash_url_is_rejected(self):
        os.environ["KV_REST_API_URL"] = "https://example.com"
        os.environ["KV_REST_API_TOKEN"] = "kv-token"
        with self.assertRaises(ConnectionError):
            plan_fit._guard_env()

    def test_no_pair_available_anywhere_is_rejected(self):
        with self.assertRaises(ConnectionError):
            plan_fit._guard_env()


class _FakeResponse:
    """Minimal stand-in for the context manager urlopen() normally returns."""
    def __init__(self, payload):
        self._payload = json.dumps(payload).encode()

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False

    def read(self):
        return self._payload


class GuardedSubmitMockedTests(unittest.TestCase):
    """Exercises record_request/record_callback against a mocked CRM + guard
    receiver so the note-vs-task behavior and replay/partial-failure safety
    can be verified without any network access."""

    def setUp(self):
        os.environ["PLAN_FIT_CRM_TOKEN"] = "crm-token"
        os.environ["PLAN_FIT_GUARD_REST_URL"] = "https://example.upstash.io"
        os.environ["PLAN_FIT_GUARD_REST_TOKEN"] = "guard-token"
        self.redis_store = {}
        self.notes = []
        self.tasks = []
        self.calls = []
        self._redis_override = None

    def tearDown(self):
        for key in ("PLAN_FIT_CRM_TOKEN", "PLAN_FIT_GUARD_REST_URL", "PLAN_FIT_GUARD_REST_TOKEN"):
            os.environ.pop(key, None)

    def _redis(self, command):
        if self._redis_override is not None:
            return self._redis_override(command)
        return self._redis_default(command)

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

    def _urlopen(self, request, timeout=5):
        url = request.full_url
        payload = json.loads(request.data.decode()) if request.data else None
        self.calls.append((url, payload))
        if url == "https://example.upstash.io":
            return _FakeResponse({"result": self._redis(payload)})
        if url.endswith("/contacts/upsert"):
            return _FakeResponse({"contact": {"id": "contact-1", "locationId": plan_fit.LOCATION_ID}})
        if url.endswith("/notes") and payload is None:
            return _FakeResponse({"notes": self.notes})
        if url.endswith("/notes"):
            note = {"id": f"note-{len(self.notes)+1}", "contactId": "contact-1", "body": payload["body"]}
            self.notes.append(note)
            return _FakeResponse({"note": note})
        if url.endswith("/tasks") and payload is None:
            return _FakeResponse({"tasks": self.tasks})
        if url.endswith("/tasks"):
            task = {
                "id": f"task-{len(self.tasks)+1}",
                "assignedTo": plan_fit.MEL_OWNER_ID,
                "contactId": "contact-1",
                "title": payload["title"],
                "body": payload["body"],
            }
            self.tasks.append(task)
            return _FakeResponse({"task": task})
        raise AssertionError(f"Unexpected URL: {url}")

    def test_pricing_only_persists_note_without_creating_a_task(self):
        with patch.object(plan_fit, "urlopen", side_effect=self._urlopen):
            receipt = plan_fit.record_request([0, 1, 2, 1, 0], CONTACT, MARKET, 0)
        self.assertEqual(len(self.notes), 1)
        self.assertEqual(len(self.tasks), 0)
        self.assertEqual(receipt, self.notes[0]["id"])
        self.assertFalse(any(url.endswith("/tasks") for url, _ in self.calls))
        for (question, options), value in zip(plan_fit.QUESTIONS, [0, 1, 2, 1, 0]):
            self.assertIn(f"{question} {options[value]}", self.notes[0]["body"])

    def test_pricing_only_replay_returns_cached_note_without_duplicating(self):
        with patch.object(plan_fit, "urlopen", side_effect=self._urlopen):
            first = plan_fit.record_request([0, 1, 2, 1, 0], CONTACT, MARKET)
            second = plan_fit.record_request([0, 1, 2, 1, 0], CONTACT, MARKET)
        self.assertEqual(first, second)
        self.assertEqual(len(self.notes), 1)

    def test_explicit_callback_creates_exactly_one_mel_task_with_all_answers(self):
        with patch.object(plan_fit, "urlopen", side_effect=self._urlopen):
            receipt = plan_fit.record_callback([0, 1, 2, 1, 0], CONTACT, MARKET, "555-010-2020")
        self.assertEqual(len(self.tasks), 1)
        task = self.tasks[0]
        self.assertEqual(receipt, task["id"])
        self.assertEqual(task["assignedTo"], plan_fit.MEL_OWNER_ID)
        for (question, options), value in zip(plan_fit.QUESTIONS, [0, 1, 2, 1, 0]):
            self.assertIn(f"{question} {options[value]}", task["body"])

    def test_explicit_callback_replay_does_not_duplicate_the_task(self):
        with patch.object(plan_fit, "urlopen", side_effect=self._urlopen):
            first = plan_fit.record_callback([0, 1, 2, 1, 0], CONTACT, MARKET, "555-010-2020")
            second = plan_fit.record_callback([0, 1, 2, 1, 0], CONTACT, MARKET, "555-010-2020")
        self.assertEqual(first, second)
        self.assertEqual(len(self.tasks), 1)

    def test_callback_recovers_after_partial_failure_without_duplicate_task(self):
        attempt = {"count": 0}

        def flaky_redis(command):
            if command[0] == "SET" and str(command[2]).startswith("done:") and attempt["count"] == 0:
                attempt["count"] += 1
                return "FAIL"  # simulates the receiver dropping the final confirmation write
            return self._redis_default(command)

        self._redis_override = flaky_redis
        with patch.object(plan_fit, "urlopen", side_effect=self._urlopen):
            with self.assertRaises(ConnectionError):
                plan_fit.record_callback([0, 1, 2, 1, 0], CONTACT, MARKET, "555-010-2020")
            # Simulate the short-lived lock expiring before the caller retries.
            for key in [k for k, v in self.redis_store.items() if v == "pending"]:
                del self.redis_store[key]
            second = plan_fit.record_callback([0, 1, 2, 1, 0], CONTACT, MARKET, "555-010-2020")
        self.assertEqual(len(self.tasks), 1)
        self.assertEqual(second, self.tasks[0]["id"])

    def test_pricing_then_later_callback_creates_note_and_a_separate_single_task(self):
        with patch.object(plan_fit, "urlopen", side_effect=self._urlopen):
            note_receipt = plan_fit.record_request([0, 1, 2, 1, 0], CONTACT, MARKET, 0)
            task_receipt = plan_fit.record_callback([0, 1, 2, 1, 0], CONTACT, MARKET, "555-010-2020")
        self.assertEqual(len(self.notes), 1)
        self.assertEqual(len(self.tasks), 1)
        self.assertNotEqual(note_receipt, task_receipt)


class PreviewDemoModeTests(unittest.TestCase):
    """On a Vercel Preview deployment (VERCEL_ENV=preview) the plan finder
    must let a tester reach any of the four tiers and try the optional
    callback without ever writing to the CRM, while staying clearly labeled
    as a demo. Production (VERCEL_ENV unset or "production") must be
    byte-for-byte unaffected by this branch."""

    def setUp(self):
        for key in ("PLAN_FIT_CRM_TOKEN", "PLAN_FIT_GUARD_REST_URL", "PLAN_FIT_GUARD_REST_TOKEN", "VERCEL_ENV"):
            os.environ.pop(key, None)

    def tearDown(self):
        os.environ.pop("VERCEL_ENV", None)

    def test_production_env_is_unaffected(self):
        self.assertFalse(plan_fit.is_preview_deployment())
        os.environ["VERCEL_ENV"] = "production"
        self.assertFalse(plan_fit.is_preview_deployment())

    def test_preview_env_is_detected(self):
        os.environ["VERCEL_ENV"] = "preview"
        self.assertTrue(plan_fit.is_preview_deployment())

    def test_record_request_makes_no_crm_call_in_preview(self):
        os.environ["VERCEL_ENV"] = "preview"
        with patch.object(plan_fit, "urlopen") as mock_urlopen:
            receipt = plan_fit.record_request([0, 0, 0, 0, 0], CONTACT, MARKET, 0)
        mock_urlopen.assert_not_called()
        self.assertTrue(receipt.startswith(plan_fit.DEMO_RECEIPT_PREFIX))

    def test_record_callback_makes_no_crm_call_in_preview(self):
        os.environ["VERCEL_ENV"] = "preview"
        with patch.object(plan_fit, "urlopen") as mock_urlopen:
            receipt = plan_fit.record_callback([0, 0, 0, 0, 0], CONTACT, MARKET, "555-010-2020")
        mock_urlopen.assert_not_called()
        self.assertTrue(receipt.startswith(plan_fit.DEMO_RECEIPT_PREFIX))

    def test_record_request_in_preview_needs_no_crm_credentials(self):
        # Credentials are absent (see setUp); production would raise ConnectionError here.
        os.environ["VERCEL_ENV"] = "preview"
        receipt = plan_fit.record_request([0, 0, 0, 0, 0], CONTACT, MARKET)
        self.assertTrue(receipt.startswith(plan_fit.DEMO_RECEIPT_PREFIX))

    def test_all_four_tiers_are_reachable_and_demo_labeled_with_no_crm_write(self):
        os.environ["VERCEL_ENV"] = "preview"
        tier_answers = {
            0: [0, 0, 0, 0, 0],  # Scout
            1: [0, 1, 0, 0, 0],  # Prowler
            2: [0, 0, 0, 2, 0],  # Nexus
            3: [0, 0, 0, 0, 1],  # Apex
        }
        with patch.object(plan_fit, "urlopen") as mock_urlopen:
            for tier, answers in tier_answers.items():
                receipt = plan_fit.record_request(answers, CONTACT, MARKET)
                html = plan_fit.screen(answers, CONTACT, MARKET, receipt).decode()
                self.assertIn(f'<h1>{plan_fit.PLANS[tier][0]}</h1>', html)
                self.assertIn(plan_fit.PLANS[tier][3], html)  # verified price still shown
                self.assertIn(plan_fit.DEMO_BANNER_TEXT, html)
        mock_urlopen.assert_not_called()

    def test_preview_callback_screen_is_demo_labeled_with_no_crm_write(self):
        os.environ["VERCEL_ENV"] = "preview"
        answers = [0, 0, 0, 0, 0]
        with patch.object(plan_fit, "urlopen") as mock_urlopen:
            receipt = plan_fit.record_callback(answers, CONTACT, MARKET, "555-010-2020")
            html = plan_fit.callback_screen(answers, receipt).decode()
        mock_urlopen.assert_not_called()
        self.assertIn(plan_fit.DEMO_BANNER_TEXT, html)
        self.assertIn("Demo callback request simulated", html)
        self.assertNotIn("Your callback request is in.", html)

    def test_production_result_screen_has_no_demo_banner(self):
        # VERCEL_ENV unset (production-equivalent): real receipt, no banner.
        html = plan_fit.screen([0, 0, 0, 0, 0], CONTACT, MARKET, receipt="task-real-123").decode()
        self.assertNotIn(plan_fit.DEMO_BANNER_TEXT, html)
        self.assertIn("Our team has this request on file.", html)


class ApexQuestionPlainLanguageTests(unittest.TestCase):
    """The final question must read in plain owner language, without
    assuming the reader already knows internal tier names."""

    def test_apex_question_does_not_name_internal_tiers(self):
        prompt, choices = plan_fit.QUESTIONS[4]
        for text in [prompt] + choices:
            self.assertNotIn("Nexus", text)
            self.assertNotIn("Scout", text)
            self.assertNotIn("Prowler", text)
            self.assertNotIn("Apex", text)

    def test_apex_question_still_maps_to_apex_tier(self):
        self.assertEqual(plan_fit.tier_for([0, 0, 0, 0, 1]), 3)
        self.assertEqual(plan_fit.tier_for([0, 0, 0, 0, 0]), 0)


class PreviewStepDisclosureTests(unittest.TestCase):
    """The preview demo disclosure (no CRM write) must be visible before the
    entrance form and on every question step, not only on the final
    recommendation. Production must never show it."""

    def setUp(self):
        os.environ.pop("VERCEL_ENV", None)

    def tearDown(self):
        os.environ.pop("VERCEL_ENV", None)

    def test_entrance_shows_demo_banner_in_preview(self):
        os.environ["VERCEL_ENV"] = "preview"
        html = plan_fit.entrance_screen({}).decode()
        self.assertIn(plan_fit.DEMO_BANNER_TEXT, html)

    def test_entrance_has_no_demo_banner_in_production(self):
        html = plan_fit.entrance_screen({}).decode()
        self.assertNotIn(plan_fit.DEMO_BANNER_TEXT, html)

    def test_every_question_step_shows_demo_banner_in_preview(self):
        os.environ["VERCEL_ENV"] = "preview"
        for answers in ([], [0], [0, 0], [0, 0, 0], [0, 0, 0, 0]):
            html = plan_fit.screen(answers, CONTACT, {}).decode()
            self.assertIn(plan_fit.DEMO_BANNER_TEXT, html)

    def test_no_question_step_shows_demo_banner_in_production(self):
        for answers in ([], [0], [0, 0], [0, 0, 0], [0, 0, 0, 0]):
            html = plan_fit.screen(answers, CONTACT, {}).decode()
            self.assertNotIn(plan_fit.DEMO_BANNER_TEXT, html)


class LiveFailureScreenTests(unittest.TestCase):
    """When a live (non-preview) CRM write fails, the visitor must still see
    their recommendation and the answers they gave, without being told the
    request was saved, and without any form to retry or resubmit. Because a
    partial write is possible (e.g. the contact or note already created
    before the final confirmation step failed), the copy must not assert
    the negative either — it must say the save could not be confirmed,
    never that nothing was saved or that no one was notified."""

    def test_failure_screen_shows_recommendation_and_answers_without_confirming_save(self):
        answers = [0, 1, 0, 0, 0]
        html = plan_fit.failure_screen(answers, CONTACT, {}).decode()
        self.assertIn(f'<h1>{plan_fit.PLANS[1][0]}</h1>', html)
        self.assertIn(plan_fit.PLANS[1][3], html)
        for (question, choices), value in zip(plan_fit.QUESTIONS, answers):
            self.assertIn(escape(question), html)
            self.assertIn(escape(choices[value]), html)
        self.assertIn(CONTACT["email"], html)
        self.assertNotIn("<form", html)
        self.assertNotIn("Our team has this request on file", html)
        self.assertNotIn(plan_fit.DEMO_BANNER_TEXT, html)

    def test_failure_screen_does_not_claim_nothing_was_saved(self):
        # A partial write (contact/note created, final confirmation lost) is
        # possible, so the copy must say the save could not be confirmed —
        # never assert outright that nothing was saved.
        html = plan_fit.failure_screen([0, 1, 0, 0, 0], CONTACT, {}).decode()
        self.assertIn("unable to confirm", html)
        self.assertNotIn("nothing has been saved", html)
        self.assertNotIn("nothing was saved", html)

    def test_callback_failure_screen_shows_recommendation_without_confirming_callback(self):
        answers = [0, 0, 0, 0, 1]
        html = plan_fit.callback_failure_screen(answers, "555-010-2020").decode()
        self.assertIn(f'<h1>{plan_fit.PLANS[3][0]}</h1>', html)
        self.assertIn("555-010-2020", html)
        self.assertNotIn("<form", html)
        self.assertNotIn("Your callback request is in", html)

    def test_callback_failure_screen_does_not_claim_no_one_was_notified(self):
        # Same partial-write concern applies to the callback task: it may
        # have actually been created before the confirmation write failed.
        html = plan_fit.callback_failure_screen([0, 0, 0, 0, 1], "555-010-2020").decode()
        self.assertIn("unable to confirm", html)
        self.assertNotIn("no one has been notified", html)


class _StubHandler:
    """Minimal duck-typed stand-in for BaseHTTPRequestHandler so do_POST can
    be exercised without opening a real socket."""

    def __init__(self, data, origin="https://example.com", host="example.com"):
        self.headers = Message()
        self.headers["Origin"] = origin
        self.headers["Host"] = host
        self.headers["Content-Type"] = "application/x-www-form-urlencoded"
        self.headers["Content-Length"] = str(len(data))
        self.rfile = BytesIO(data)
        self.sent = []

    def respond(self, response_body, status=200):
        self.sent.append((status, response_body))


class DoPostFailureWiringTests(unittest.TestCase):
    """Confirms handler.do_POST renders the new failure screens (not the old
    generic "try again later" page) when a live CRM write fails, and keeps
    the fail-closed behavior: still refuses with no network write."""

    def setUp(self):
        for key in ("PLAN_FIT_CRM_TOKEN", "PLAN_FIT_GUARD_REST_URL", "PLAN_FIT_GUARD_REST_TOKEN", "VERCEL_ENV"):
            os.environ.pop(key, None)

    def tearDown(self):
        os.environ.pop("VERCEL_ENV", None)

    def _post(self, fields):
        stub = _StubHandler(body(fields))
        with patch.object(plan_fit, "urlopen") as mock_urlopen:
            plan_fit.handler.do_POST(stub)
        mock_urlopen.assert_not_called()
        self.assertEqual(len(stub.sent), 1)
        return stub.sent[0]

    def test_complete_stage_without_crm_credentials_shows_failure_screen(self):
        fields = dict(CONTACT, q0="0", q1="1", q2="0", q3="0", q4="0")
        status, response_body = self._post(fields)
        html = response_body.decode()
        self.assertEqual(status, 503)
        self.assertIn(f'<h1>{plan_fit.PLANS[1][0]}</h1>', html)
        self.assertNotIn("Our team has this request on file", html)
        self.assertNotIn("<form", html)

    def test_callback_stage_without_crm_credentials_shows_failure_screen(self):
        fields = dict(CONTACT, q0="0", q1="0", q2="0", q3="0", q4="1", phone="(555) 010-2020", action="callback")
        status, response_body = self._post(fields)
        html = response_body.decode()
        self.assertEqual(status, 503)
        self.assertIn(f'<h1>{plan_fit.PLANS[3][0]}</h1>', html)
        self.assertNotIn("Your callback request is in", html)
        self.assertNotIn("<form", html)


if __name__ == "__main__":
    unittest.main()
