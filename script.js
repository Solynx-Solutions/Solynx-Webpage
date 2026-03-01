document.addEventListener('DOMContentLoaded', () => {
    // Mobile Menu Toggle
    const mobileToggle = document.getElementById('mobileToggle');
    const navMenu = document.getElementById('navMenu');
    const navLinks = document.querySelectorAll('.nav-link');

    if (mobileToggle && navMenu) {
        mobileToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            mobileToggle.classList.toggle('active');

            // Change icon based on state
            if (navMenu.classList.contains('active')) {
                mobileToggle.textContent = '✕'; // Close icon
                mobileToggle.setAttribute('aria-expanded', 'true');
            } else {
                mobileToggle.textContent = '☰'; // Menu icon
                mobileToggle.setAttribute('aria-expanded', 'false');
            }
        });

        // Close menu when a link is clicked
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('active');
                mobileToggle.classList.remove('active');
                mobileToggle.textContent = '☰';
                mobileToggle.setAttribute('aria-expanded', 'false');
            });
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!navMenu.contains(e.target) && !mobileToggle.contains(e.target) && navMenu.classList.contains('active')) {
                navMenu.classList.remove('active');
                mobileToggle.classList.remove('active');
                mobileToggle.textContent = '☰';
                mobileToggle.setAttribute('aria-expanded', 'false');
            }
        });
    }

    // Navbar Scroll Effect
    const navbar = document.getElementById('navbar');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.style.background = 'rgba(5, 10, 20, 0.95)';
            navbar.style.boxShadow = '0 2px 10px rgba(0,0,0,0.3)';
        } else {
            navbar.style.background = 'rgba(5, 10, 20, 0.85)';
            navbar.style.boxShadow = 'none';
        }
    });

    // Animation on Scroll (Intersection Observer)
    const fadeElements = document.querySelectorAll('.fade-in-up');

    const observerOptions = {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px"
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.animationPlayState = 'running';
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    fadeElements.forEach(el => {
        el.style.animationPlayState = 'paused';
        observer.observe(el);
    });
    // Sticky Background Opacity Control
    const stickyBg = document.querySelector('.faint-sticky-bg');
    if (stickyBg) {
        window.addEventListener('scroll', () => {
            // Increase opacity as user scrolls down, maxing out at 0.3
            const scrollPercent = Math.min(window.scrollY / 1000, 1);
            const baseOpacity = 0.05;
            const targetOpacity = baseOpacity + (scrollPercent * 0.25);
            stickyBg.style.opacity = targetOpacity;
        });
    }

    // ─── Book Consultation CTA — Reveal Calendar on Click ───────────────────
    const consultationBtn = document.getElementById('consultation-btn');
    const calendarWrapper = document.getElementById('bc-calendar-wrapper');

    if (consultationBtn && calendarWrapper) {
        consultationBtn.addEventListener('click', function (e) {
            e.preventDefault();

            // Smooth-scroll to the booking section
            const bookingSection = document.getElementById('book-consultation');
            if (bookingSection) {
                bookingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }

            // Reveal the calendar only if still hidden (prevents re-animation)
            if (calendarWrapper.classList.contains('calendar-hidden')) {
                setTimeout(function () {
                    calendarWrapper.classList.remove('calendar-hidden');
                    calendarWrapper.classList.add('calendar-visible');
                }, 300);
            }
        });
    }

});

/* =================================
   Lost Leads Calculator Logic
   ================================= */
(function () {
    const missedCallsEl = document.getElementById('llc-missedCalls');
    const closeRateEl = document.getElementById('llc-closeRate');
    const avgJobEl = document.getElementById('llc-avgJob');

    const lostWeekEl = document.getElementById('llc-lostWeek');
    const lostMonthEl = document.getElementById('llc-lostMonth');
    const lostYearEl = document.getElementById('llc-lostYear');
    const mathLineEl = document.getElementById('llc-mathLine');

    if (!missedCallsEl || !closeRateEl || !avgJobEl) return;

    const fmtUSD = (num) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0
        }).format(num);
    };

    function calculate() {
        const missedCalls = Math.max(0, parseFloat(missedCallsEl.value) || 0);
        const closeRatePct = Math.min(Math.max(parseFloat(closeRateEl.value) || 0, 0), 100);
        const avgJob = Math.max(0, parseFloat(avgJobEl.value) || 0);

        const closeRate = closeRatePct / 100;
        const lostJobsPerWeek = missedCalls * closeRate;
        const lostRevenueWeek = lostJobsPerWeek * avgJob;

        const weeksPerMonth = 4.33;
        const lostRevenueMonth = lostRevenueWeek * weeksPerMonth;
        const lostRevenueYear = lostRevenueMonth * 12;

        if (lostWeekEl) lostWeekEl.textContent = fmtUSD(lostRevenueWeek);
        if (lostMonthEl) lostMonthEl.textContent = fmtUSD(lostRevenueMonth);
        if (lostYearEl) lostYearEl.textContent = fmtUSD(lostRevenueYear);

        if (mathLineEl) {
            mathLineEl.textContent =
                `${missedCalls} calls × ${closeRatePct}% rate × ${fmtUSD(avgJob)} avg = ${fmtUSD(lostRevenueWeek)}/wk`;
        }
    }

    [missedCallsEl, closeRateEl, avgJobEl].forEach(el => {
        el.addEventListener('input', calculate);
    });

    calculate();
})();
