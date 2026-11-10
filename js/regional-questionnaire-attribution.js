(() => {
    const link = document.getElementById('hero-cta-questionnaire');
    if (!link) return;

    const incoming = new URLSearchParams(window.location.search);
    const destination = new URL(link.href);
    const allowed = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
        'meta_ad_id', 'meta_adset_id', 'meta_campaign_id', 'fbclid'
    ];
    for (const key of allowed) {
        const value = incoming.get(key);
        if (value) destination.searchParams.set(key, value);
    }
    link.href = destination.href;
})();
