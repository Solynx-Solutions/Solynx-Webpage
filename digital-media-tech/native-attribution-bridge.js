(function () {
    'use strict';
    var receiverOrigin = 'https://link.solynx.solutions';
    var formId = '1NHtVDOSdhAUtCKRcvo8';
    var locationId = 'X7gmSDv2qIOri1Al4ewE';
    var campaignKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
    function pageURL(value) {
        try {
            var url = new URL(value);
            return /^https?:$/.test(url.protocol) ? url.origin + url.pathname : '';
        } catch { return ''; }
    }
    window.addEventListener('message', function (event) {
        var frame = document.getElementById('scopeNativeForm');
        if (!(frame instanceof HTMLIFrameElement) || event.source !== frame.contentWindow || event.origin !== receiverOrigin) return;
        var request = event.data;
        if (!Array.isArray(request)) return;
        var receiver;
        var parent;
        try { receiver = new URL(frame.src); parent = new URL(window.location.href); } catch { return; }
        if (receiver.origin !== receiverOrigin || receiver.pathname !== '/widget/form/' + formId) return;
        if (request[0] === 'iframeLoaded') {
            // Native child requests query parameters only after this vendor initializer.
            // Disable resize/public methods; no other child actions are implemented here.
            frame.contentWindow.postMessage('[iFrameSizer]' + frame.id + ':8:false:false:32:false:false:8px:offset:null:null:0', receiverOrigin);
            frame.setAttribute('data-native-attribution-bridge', 'initialized');
            return;
        }
        if (request[0] !== 'fetch-query-params') return;
        if (request[2] && request[2] !== locationId) return;
        if (request[3] && request[3] !== formId) return;
        var landing = new URL(pageURL(parent.href));
        var campaign = {};
        campaignKeys.forEach(function (key) {
            var value = parent.searchParams.get(key);
            if (value && /^[a-zA-Z0-9_-]{1,80}$/.test(value)) {
                campaign[key] = value;
                landing.searchParams.set(key, value);
            }
        });
        // Native vendor query-params protocol, scoped to this frame and safe campaign slugs.
        // Referrer origin/path preserve classification; query/fragment cannot disclose private data.
        frame.contentWindow.postMessage([
            'query-params', campaign, landing.href, pageURL(document.referrer), frame.id,
            { consent: null, isConsentExpected: false }
        ], receiverOrigin);
        frame.setAttribute('data-native-attribution-bridge', 'responded');
    });
})();
