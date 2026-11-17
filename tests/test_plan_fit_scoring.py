"""Regression checks for the plan-fit tier scoring formula."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("plan_fit", ROOT / "api" / "plan-fit.py")
plan_fit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(plan_fit)


def tier_for(answers):
    html = plan_fit.screen(answers).decode()
    for index, (name, *_rest) in enumerate(plan_fit.PLANS):
        if f'<h1>{name}</h1>' in html:
            return index
    raise AssertionError(f"No plan name found in rendered screen: {html}")


class TierScoringTests(unittest.TestCase):
    def test_reentry_alone_caps_at_nexus(self):
        # q3 "Constantly — info gets retyped..." (index 2) must not reach
        # Apex on its own; it should cap at Nexus absent an explicit custom
        # routing need.
        answers = [0, 0, 0, 2, 0]
        self.assertEqual(tier_for(answers), 2)

    def test_apex_requires_explicit_custom_routing_signal(self):
        # Only q4's "Yes — custom routing beyond Nexus" (index 1) should be
        # sufficient, by itself, to recommend Apex.
        answers = [0, 0, 0, 0, 1]
        self.assertEqual(tier_for(answers), 3)

    def test_apex_still_reached_when_both_signals_present(self):
        answers = [0, 0, 0, 2, 1]
        self.assertEqual(tier_for(answers), 3)

    def test_missed_followup_signal_caps_at_prowler(self):
        answers = [0, 1, 0, 0, 0]
        self.assertEqual(tier_for(answers), 1)

    def test_lowest_sufficient_tier_is_scout_when_all_minimal(self):
        answers = [0, 0, 0, 0, 0]
        self.assertEqual(tier_for(answers), 0)

    def test_soft_lead_intake_signal_does_not_affect_tier(self):
        base = [0, 0, 1, 1, 0]
        varied = [2, 0, 1, 1, 0]
        self.assertEqual(tier_for(base), tier_for(varied))

    def test_tier_for_signature_takes_only_the_five_scored_answers(self):
        # tier_for's signature is the contract: it accepts only the answers
        # list. There is no parameter for market/attribution (ads, UTM,
        # GBP campaign tags) or timing data, so none of that optional
        # context can reach the scoring formula, by construction.
        import inspect
        params = list(inspect.signature(plan_fit.tier_for).parameters)
        self.assertEqual(params, ["answers"])

    def test_identical_answers_score_the_same_regardless_of_ad_attribution_or_timing_context(self):
        # Simulates two visitors with identical answers but different
        # optional ad/GBP attribution and request timing metadata reaching
        # the server; the resulting tier must be identical either way.
        answers = [1, 1, 2, 2, 1]
        market_a = {"utm_source": "google", "utm_campaign": "gbp", "fbclid": "abc123"}
        market_b = {}
        contact = {"person": "Jamie Rios", "business": "Rios Roofing", "email": "jamie@riosroofing.com"}
        html_a = plan_fit.screen(answers, contact, market_a, receipt="r-a").decode()
        html_b = plan_fit.screen(answers, contact, market_b, receipt="r-b").decode()
        name = plan_fit.PLANS[plan_fit.tier_for(answers)][0]
        self.assertIn(f'<h1>{name}</h1>', html_a)
        self.assertIn(f'<h1>{name}</h1>', html_b)


if __name__ == "__main__":
    unittest.main()
