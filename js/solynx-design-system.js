(function () {
  "use strict";

  const bookingUrl = "https://link.solynx.solutions/widget/booking/f3EuIbW7JTKWLbval3Wc";
  const contactUrl = "https://link.solynx.solutions/widget/form/XK9biK6AROXKJdkCzyMw";
  const digitalMediaUrl = "/digital-media-tech/";

  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const isPath = function (candidate) {
    const normalized = candidate.replace(/\/+$/, "") || "/";
    return path === normalized;
  };

  const digitalMediaItem = '<a class="slx-nav-link" data-route="digital-media" href="' + digitalMediaUrl + '">Digital Media &amp; Tech</a>';

  const header = document.createElement("header");
  header.className = "slx-site-header";
  header.innerHTML = [
    '<div class="slx-header-inner">',
    '<a class="slx-brand" href="/" aria-label="SOLYNX home"><img src="/assets/images/SLX-WRD.png" alt="SOLYNX LLC"></a>',
    '<button class="slx-menu-toggle" type="button" aria-expanded="false" aria-controls="slx-primary-nav"><span class="slx-menu-icon" aria-hidden="true"></span><span class="sr-only">Open navigation</span></button>',
    '<nav class="slx-primary-nav" id="slx-primary-nav" aria-label="Primary navigation">',
    '<a class="slx-nav-link" data-route="home" href="/">Home</a>',
    '<a class="slx-nav-link" data-route="services" href="/services.html">Services</a>',
    '<div class="slx-dropdown" data-group="systems">',
    '<button class="slx-dropdown-toggle" type="button" aria-expanded="false">Systems <span class="slx-caret" aria-hidden="true"></span></button>',
    '<div class="slx-dropdown-menu">',
    '<a class="slx-nav-link" data-route="local-growth" href="/local-growth-system.html">Local Growth</a>',
    '<a class="slx-nav-link" data-route="live" href="/live-experience/">Live Experience</a>',
    '<a class="slx-nav-link" href="/#llc-audit">Lead Audit</a>',
    '<a class="slx-nav-link" href="/#automation-systems">Automation Systems</a>',
    '</div></div>',
    '<div class="slx-dropdown" data-group="markets">',
    '<button class="slx-dropdown-toggle" type="button" aria-expanded="false">Markets <span class="slx-caret" aria-hidden="true"></span></button>',
    '<div class="slx-dropdown-menu">',
    '<a class="slx-nav-link" data-route="tracy" href="/tracy-central-valley/">Tracy / Central Valley</a>',
    '<a class="slx-nav-link" data-route="santa-cruz" href="/santa-cruz-monterey/">Santa Cruz / Monterey</a>',
    '</div></div>',
    digitalMediaItem,
    '<a class="slx-nav-link" href="/#about">About</a>',
    '<a class="slx-header-cta" href="' + bookingUrl + '" target="_blank" rel="noopener noreferrer">Get Started</a>',
    '</nav></div>'
  ].join("");

  const footer = document.createElement("footer");
  footer.className = "slx-site-footer";
  footer.innerHTML = [
    '<div class="slx-footer-grid">',
    '<div class="slx-footer-brand"><img src="/assets/images/SLX-WRD.png" alt="SOLYNX LLC"><p>SOLYNX is a Business Systems &amp; Growth Infrastructure Company. We connect websites, calls, forms, CRM, follow-up, scheduling, reviews, tracking, automation, and AI support into one managed business system.</p></div>',
    '<div class="slx-footer-group"><h2>Explore</h2><a href="/">Home</a><a href="/services.html">Services</a><a href="/#about">About</a><a href="' + contactUrl + '">Contact</a></div>',
    '<div class="slx-footer-group"><h2>Systems</h2><a href="/local-growth-system.html">Local Growth</a><a href="/live-experience/">Live Experience</a><a href="/#llc-audit">Lead Audit</a><a href="/#automation-systems">Automation Systems</a><a href="' + digitalMediaUrl + '">Digital Media &amp; Tech</a></div>',
    '<div class="slx-footer-group"><h2>Markets &amp; Legal</h2><a href="/tracy-central-valley/">Tracy / Central Valley</a><a href="/santa-cruz-monterey/">Santa Cruz / Monterey</a><a href="/subscription-agreement.html">Subscription Agreement</a><a href="/privacy.html">Privacy Policy</a><a href="/terms.html">Terms of Use</a></div>',
    '</div>',
    '<div class="slx-footer-bottom"><span>&copy; 2026 SOLYNX LLC. Built with grit.</span><span>Business systems for service companies.</span></div>'
  ].join("");

  document.body.insertBefore(header, document.body.firstChild);
  document.body.appendChild(footer);

  const routeMap = [
    ["home", isPath("/")],
    ["services", isPath("/services.html")],
    ["local-growth", isPath("/local-growth-system.html")],
    ["live", isPath("/live-experience")],
    ["digital-media", isPath("/digital-media-tech")],
    ["tracy", isPath("/tracy-central-valley")],
    ["santa-cruz", isPath("/santa-cruz-monterey")]
  ];

  routeMap.forEach(function (entry) {
    if (!entry[1]) return;
    const activeLink = header.querySelector('[data-route="' + entry[0] + '"]');
    if (activeLink) activeLink.setAttribute("aria-current", "page");
  });

  if (isPath("/local-growth-system.html") || isPath("/live-experience")) {
    header.querySelector('[data-group="systems"]').classList.add("is-active");
  }
  if (isPath("/tracy-central-valley") || isPath("/santa-cruz-monterey")) {
    header.querySelector('[data-group="markets"]').classList.add("is-active");
  }

  const menuToggle = header.querySelector(".slx-menu-toggle");
  const nav = header.querySelector(".slx-primary-nav");
  const dropdowns = Array.from(header.querySelectorAll(".slx-dropdown"));

  const closeDropdowns = function (except) {
    dropdowns.forEach(function (dropdown) {
      if (dropdown === except) return;
      dropdown.classList.remove("is-open");
      dropdown.querySelector(".slx-dropdown-toggle").setAttribute("aria-expanded", "false");
    });
  };

  menuToggle.addEventListener("click", function () {
    const willOpen = !nav.classList.contains("is-open");
    nav.classList.toggle("is-open", willOpen);
    menuToggle.setAttribute("aria-expanded", String(willOpen));
    menuToggle.querySelector(".sr-only").textContent = willOpen ? "Close navigation" : "Open navigation";
    if (!willOpen) closeDropdowns();
  });

  dropdowns.forEach(function (dropdown) {
    const toggle = dropdown.querySelector(".slx-dropdown-toggle");
    toggle.addEventListener("click", function () {
      const willOpen = !dropdown.classList.contains("is-open");
      closeDropdowns(dropdown);
      dropdown.classList.toggle("is-open", willOpen);
      toggle.setAttribute("aria-expanded", String(willOpen));
    });
  });

  header.addEventListener("click", function (event) {
    const link = event.target.closest("a");
    if (!link || !nav.contains(link)) return;
    nav.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
    closeDropdowns();
  });

  document.addEventListener("click", function (event) {
    if (!header.contains(event.target)) closeDropdowns();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    closeDropdowns();
    nav.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.focus();
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth > 980) {
      nav.classList.remove("is-open");
      menuToggle.setAttribute("aria-expanded", "false");
      closeDropdowns();
    }
  });
})();
