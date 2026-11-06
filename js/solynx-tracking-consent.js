/* global window, document */
(function (root, documentRef) {
    'use strict';

    var STORAGE_KEY = 'solynx_analytics_consent';
    var META_PIXEL_ID = '1644858803494667';
    var META_SCRIPT_ID = 'solynx-meta-pixel';
    var initialized = false;

    function storedChoice() {
        try {
            var value = root.localStorage.getItem(STORAGE_KEY);
            return value === 'granted' || value === 'denied' ? value : null;
        } catch {
            return null;
        }
    }

    function storeChoice(value) {
        try { root.localStorage.setItem(STORAGE_KEY, value); } catch { return; }
    }

    function googleConsent(value) {
        root.dataLayer = root.dataLayer || [];
        root.dataLayer.push(['consent', 'update', {
            analytics_storage: value,
            ad_storage: value,
            ad_user_data: value,
            ad_personalization: value
        }]);
    }

    function ensureMetaQueue() {
        if (root.fbq) return root.fbq;
        var fbq = function () {
            fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
        };
        fbq.push = fbq;
        fbq.loaded = true;
        fbq.version = '2.0';
        fbq.queue = [];
        root.fbq = fbq;
        root._fbq = fbq;
        return fbq;
    }

    function grantMeta() {
        var fbq = ensureMetaQueue();
        fbq('consent', 'grant');
        if (documentRef.getElementById(META_SCRIPT_ID)) return;
        var script = documentRef.createElement('script');
        script.id = META_SCRIPT_ID;
        script.async = true;
        script.src = 'https://connect.facebook.net/en_US/fbevents.js';
        var firstScript = documentRef.getElementsByTagName('script')[0];
        firstScript.parentNode.insertBefore(script, firstScript);
        fbq('init', META_PIXEL_ID);
        fbq('track', 'PageView');
    }

    function denyMeta() {
        if (root.fbq) root.fbq('consent', 'revoke');
    }

    function applyChoice(value) {
        storeChoice(value);
        googleConsent(value);
        if (value === 'granted') grantMeta();
        else denyMeta();
        render(value);
    }

    function render(choice) {
        var panel = documentRef.getElementById('solynx-consent-panel');
        if (panel) panel.hidden = choice !== null;
        var manage = documentRef.getElementById('solynx-consent-manage');
        if (manage) manage.hidden = choice === null;
        var status = documentRef.getElementById('solynx-consent-status');
        if (status) status.textContent = choice === 'granted' ? 'Analytics allowed' : choice === 'denied' ? 'Analytics declined' : 'Privacy choices';
    }

    function buildControls() {
        if (!documentRef.body || documentRef.getElementById('solynx-consent-controls')) return;
        var controls = documentRef.createElement('div');
        controls.id = 'solynx-consent-controls';
        controls.innerHTML = '<style>#solynx-consent-controls{position:fixed;inset:auto 16px 16px 16px;z-index:10000;font:14px/1.45 system-ui,sans-serif;color:#f7f7f7}#solynx-consent-panel{max-width:720px;margin:auto;background:#101820;border:1px solid #5f7285;border-radius:12px;padding:18px;box-shadow:0 12px 40px #0008}#solynx-consent-panel p{margin:0 0 14px}#solynx-consent-panel a{color:#8dd8ff}#solynx-consent-panel button,#solynx-consent-manage{border:1px solid #8dd8ff;border-radius:7px;padding:10px 14px;font:inherit;cursor:pointer}#solynx-consent-allow{background:#ff9000;color:#111;border-color:#ff9000;margin-right:8px}#solynx-consent-deny{background:#172431;color:#fff}#solynx-consent-manage{position:absolute;right:0;bottom:0;background:#101820;color:#fff;padding:7px 10px;font-size:12px}</style><section id="solynx-consent-panel" aria-label="Analytics privacy choices"><p><strong>Privacy choices</strong><br>We use optional analytics to understand website activity. Choose whether analytics and advertising tags may run. Essential site functions remain available either way. See our <a href="/privacy.html">Privacy Policy</a>.</p><button id="solynx-consent-allow" type="button">Allow analytics</button><button id="solynx-consent-deny" type="button">Essential only</button></section><button id="solynx-consent-manage" type="button"><span id="solynx-consent-status">Privacy choices</span></button>';
        documentRef.body.appendChild(controls);
        documentRef.getElementById('solynx-consent-allow').addEventListener('click', function () { applyChoice('granted'); });
        documentRef.getElementById('solynx-consent-deny').addEventListener('click', function () { applyChoice('denied'); });
        documentRef.getElementById('solynx-consent-manage').addEventListener('click', function () {
            documentRef.getElementById('solynx-consent-panel').hidden = false;
            documentRef.getElementById('solynx-consent-manage').hidden = true;
        });
        render(storedChoice());
    }

    function init() {
        if (initialized) return;
        initialized = true;
        var choice = storedChoice();
        if (choice === 'granted') grantMeta();
        else denyMeta();
        buildControls();
    }

    root.SolynxTrackingConsent = Object.freeze({
        grant: function () { applyChoice('granted'); },
        deny: function () { applyChoice('denied'); },
        getChoice: storedChoice,
        init: init
    });

    if (documentRef.readyState === 'loading') documentRef.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})(window, document);
