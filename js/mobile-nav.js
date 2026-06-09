/**
 * SOLYNX — Shared Mobile Navigation
 * Manages the #solynx-mobile-nav full-screen overlay.
 * Works across: index.html, local-growth-system.html, live-experience/index.html
 *
 * Depends on:
 *   - #solynx-mobile-nav element in the page HTML
 *   - .mobile-menu-toggle button in the page HTML
 *   - css/mobile-nav.css (or equivalent path per page)
 */

(function () {
    'use strict';

    function initSolynxMobileNav() {
        var toggle = document.getElementById('mobileToggle');
        var overlay = document.getElementById('solynx-mobile-nav');
        var closeBtn = document.getElementById('snavClose');

        if (!toggle || !overlay) return;

        /* ── Open ─────────────────────────────────────── */
        function openNav() {
            overlay.classList.add('is-open');
            document.body.classList.add('snav-open');
            toggle.textContent = '✕';
            toggle.setAttribute('aria-expanded', 'true');
            toggle.setAttribute('aria-label', 'Close navigation menu');
            // Trap scroll to overlay
            overlay.scrollTop = 0;
        }

        /* ── Close ────────────────────────────────────── */
        function closeNav() {
            overlay.classList.remove('is-open');
            document.body.classList.remove('snav-open');
            toggle.textContent = '☰';
            toggle.setAttribute('aria-expanded', 'false');
            toggle.setAttribute('aria-label', 'Open navigation menu');
        }

        /* ── Toggle on hamburger click ────────────────── */
        toggle.addEventListener('click', function () {
            if (overlay.classList.contains('is-open')) {
                closeNav();
            } else {
                openNav();
            }
        });

        /* ── Close button inside the overlay ─────────── */
        if (closeBtn) {
            closeBtn.addEventListener('click', closeNav);
        }

        /* ── Close when any link inside overlay is tapped ─── */
        overlay.querySelectorAll('a').forEach(function (link) {
            link.addEventListener('click', closeNav);
        });

        /* ── Close on Escape key ──────────────────────── */
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && overlay.classList.contains('is-open')) {
                closeNav();
            }
        });

        /* ── Ensure overlay is hidden on resize to desktop ── */
        var resizeTimer;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
                if (window.innerWidth > 900 && overlay.classList.contains('is-open')) {
                    closeNav();
                }
            }, 150);
        });
    }

    /* Run after DOM is ready */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSolynxMobileNav);
    } else {
        initSolynxMobileNav();
    }
})();
