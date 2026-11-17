(() => {
    // Targets the regional hero CTA by id (legacy) plus any plan finder entry
    // link on the page, so attribution carries through from every entrance —
    // not just the dedicated regional hero CTA.
    const links = document.querySelectorAll('#hero-cta-questionnaire, a[href="/plan-fit"], a[href^="/plan-fit?"]');
    if (!links.length) return;

    const incoming = new URLSearchParams(window.location.search);
    const allowed = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
        'meta_ad_id', 'meta_adset_id', 'meta_campaign_id', 'fbclid'
    ];
    links.forEach((link) => {
        const destination = new URL(link.href);
        for (const key of allowed) {
            const value = incoming.get(key);
            if (value) destination.searchParams.set(key, value);
        }
        link.href = destination.href;
    });
})();
