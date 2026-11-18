"""Regression checks for the Scope2 homepage + Services pricing-entry
section (esther-handoff.md Scope2): exact heading/support/CTA copy, no
public price re-exposure, no free/time-limited claims, and no new
unverified checkout links. Scope1 (post-funnel checkout routing) is
intentionally NOT implemented here because the historical payment/booking
links return 403 and are unverified by MAX; this suite also guards that
no one accidentally wires them up as a "Get Started" checkout later
without updating this test."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]

REQUIRED_HEADING = "Find Your Plan &amp; Pricing"
REQUIRED_SUPPORT = "Answer a few questions about your business to see your recommended package and pricing."
REQUIRED_CTA = "Find My Plan &amp; Pricing"
DISALLOWED_CLAIMS = ("free", "limited time", "today only", "expires", "act now")
UNVERIFIED_PAYMENT_LINK = "link.solynx.solutions/payment-link/69e0107480425dc02fbc8805"


def pricing_section(html):
    start = html.index('<section id="pricing" class="pricing-section">')
    end = html.index("</section>", start) + len("</section>")
    return html[start:end]


class HomepagePricingEntryTests(unittest.TestCase):
    def setUp(self):
        self.html = (ROOT / "index.html").read_text(encoding="utf-8")
        self.section = pricing_section(self.html)

    def test_has_exact_required_heading_support_and_cta_copy(self):
        self.assertIn(REQUIRED_HEADING, self.section)
        self.assertIn(REQUIRED_SUPPORT, self.section)
        self.assertIn(REQUIRED_CTA, self.section)

    def test_old_copy_replaced(self):
        self.assertNotIn("Find the right foundation for your business.", self.section)
        self.assertNotIn("Explore Scout, Prowler, Nexus and Apex", self.section)

    def test_cta_still_points_at_existing_plan_fit_funnel(self):
        self.assertIn('href="/plan-fit"', self.section)

    def test_no_price_or_currency_reexposed_in_section(self):
        self.assertNotRegex(self.section, r"\$\d")
        self.assertNotIn("/month", self.section)
        self.assertNotIn("/year", self.section)

    def test_no_disallowed_marketing_claims(self):
        lowered = self.section.lower()
        for phrase in DISALLOWED_CLAIMS:
            self.assertNotIn(phrase, lowered)

    def test_no_unverified_checkout_link_introduced(self):
        self.assertNotIn(UNVERIFIED_PAYMENT_LINK, self.html)

    def test_only_one_pricing_section_on_page(self):
        self.assertEqual(self.html.count('<section id="pricing" class="pricing-section">'), 1)


class ServicesPricingEntryTests(unittest.TestCase):
    def setUp(self):
        self.html = (ROOT / "services.html").read_text(encoding="utf-8")
        self.section = pricing_section(self.html)

    def test_has_exact_required_heading_support_and_cta_copy(self):
        self.assertIn(REQUIRED_HEADING, self.section)
        self.assertIn(REQUIRED_SUPPORT, self.section)
        self.assertIn(REQUIRED_CTA, self.section)

    def test_cta_still_points_at_existing_plan_fit_funnel(self):
        self.assertIn('href="/plan-fit"', self.section)

    def test_no_price_or_currency_reexposed_in_section(self):
        self.assertNotRegex(self.section, r"\$\d")
        self.assertNotIn("/month", self.section)
        self.assertNotIn("/year", self.section)

    def test_no_disallowed_marketing_claims(self):
        lowered = self.section.lower()
        for phrase in DISALLOWED_CLAIMS:
            self.assertNotIn(phrase, lowered)

    def test_section_is_between_hero_and_package_comparison(self):
        hero_end = self.html.index("</section>", self.html.index('<section class="services-hero">'))
        comparison_start = self.html.index('<section id="package-overview"')
        section_start = self.html.index('<section id="pricing" class="pricing-section">')
        self.assertTrue(hero_end < section_start < comparison_start)

    def test_only_one_pricing_section_on_page(self):
        self.assertEqual(self.html.count('<section id="pricing" class="pricing-section">'), 1)

    def test_no_unverified_checkout_link_introduced(self):
        self.assertNotIn(UNVERIFIED_PAYMENT_LINK, self.html)

    def test_no_get_started_checkout_cta_added(self):
        # Scope1 (verified checkout routing) is intentionally deferred: the
        # historical payment/booking links return 403 and MAX has not
        # supplied an authenticated readback, so no "Get Started" checkout
        # button may exist anywhere on this page yet.
        self.assertNotIn("Get Started", self.html)

    def test_existing_consultation_booking_links_untouched(self):
        # Pre-existing per-package / hero consultation links are a separate
        # scope (Scope1) and must not be added to, removed, or rewritten by
        # the Scope2 pricing-entry copy change.
        booking_link = "https://link.solynx.solutions/widget/booking/f3EuIbW7JTKWLbval3Wc"
        self.assertEqual(self.html.count(booking_link), 7)
        for label in ("Book a Growth Systems Review", "Book Prowler Consultation",
                      "Book Nexus Consultation", "Request Apex Consultation"):
            self.assertIn(label, self.html)

    def test_apex_card_remains_consultation_only_not_a_checkout(self):
        apex_start = self.html.index('id="pkg-apex"')
        apex_end = self.html.index("<!-- /.packages-grid -->", apex_start)
        apex_card = self.html[apex_start:apex_end]
        self.assertIn("Request Apex Consultation", apex_card)
        self.assertNotIn("Get Started", apex_card)
        self.assertNotRegex(apex_card, r"\$\d")


class NoScopeCreepIntoPlanFitBackendTests(unittest.TestCase):
    """Scope1 (verified checkout routing) is explicitly not implementable
    without MAX-authenticated link verification, so api/plan-fit.py must
    stay untouched by this round: no payment/checkout logic introduced."""

    def test_api_plan_fit_has_no_payment_or_checkout_logic(self):
        source = (ROOT / "api" / "plan-fit.py").read_text(encoding="utf-8")
        for token in ("stripe", "checkout", "payment-link", "payment_link", "Get Started"):
            self.assertNotIn(token, source)


if __name__ == "__main__":
    unittest.main()
