(function () {
    'use strict';

    var FORM_BASE = 'https://link.solynx.solutions/widget/form/1NHtVDOSdhAUtCKRcvo8';
    var FORM_ID = '1NHtVDOSdhAUtCKRcvo8';
    var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
    var UTM_ALLOWLIST = /^[a-zA-Z0-9_-]{1,80}$/;

    function buildInquiryUrl() {
        var url = new URL(FORM_BASE);
        url.searchParams.set('project_brief', 'Holiday media inquiry: holiday party, company celebration, or work event coverage, captured now for 2027 booking.');
        var campaign = new URLSearchParams(window.location.search);
        // Only allowlisted campaign slugs are forwarded; never arbitrary query or contact fields.
        UTM_KEYS.forEach(function (key) {
            var value = campaign.get(key);
            if (value && UTM_ALLOWLIST.test(value)) url.searchParams.set(key, value);
        });
        if (!url.searchParams.get('utm_campaign')) url.searchParams.set('utm_campaign', 'holiday-media-2027');
        return url.href;
    }

    var ctaLinks = Array.prototype.slice.call(document.querySelectorAll('#hmCtaTop, #hmCtaHero, #hmCtaClose'));
    if (!ctaLinks.length) return;

    var inquiryUrl = buildInquiryUrl();
    ctaLinks.forEach(function (link) { link.href = inquiryUrl; });

    var openRecorded = false;
    ctaLinks.forEach(function (link) {
        link.addEventListener('click', function () {
            // Opening the form is intent only, never a submitted lead or booking.
            // No brief text, contact details, or URL values enter analytics.
            if (openRecorded) return;
            openRecorded = true;
            var analyticsWindow = /** @type {Window & {dataLayer?: object[]}} */ (window);
            analyticsWindow.dataLayer = analyticsWindow.dataLayer || [];
            analyticsWindow.dataLayer.push({ event: 'media_inquiry_open', form_id: FORM_ID, source_page: 'holiday-media' });
        });
    });
})();
