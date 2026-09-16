(function () {
    'use strict';

    // Reveal the definition when it enters view; the text remains readable without JavaScript.
    var definitionLine = document.querySelector('.typedLine');
    if (definitionLine && 'IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        var definitionObserver = new IntersectionObserver(function (entries) {
            if (!entries[0].isIntersecting) return;
            definitionLine.classList.add('isTyping');
            definitionObserver.disconnect();
        }, { threshold: 0.3 });
        definitionObserver.observe(definitionLine);
    }

    var optionButtons = Array.prototype.slice.call(document.querySelectorAll('.scopeOption[data-scope-id]'));
    var rateTabs = Array.prototype.slice.call(document.querySelectorAll('[data-rate-mode]'));
    var modeCopies = Array.prototype.slice.call(document.querySelectorAll('.modeCopy'));
    var modeOnlyElements = Array.prototype.slice.call(document.querySelectorAll('[data-mode-only]'));
    var projectList = document.getElementById('projectList');
    var projectEmpty = document.getElementById('projectEmpty');
    var scopeCount = document.getElementById('scopeCount');
    var navScopeCount = document.getElementById('navScopeCount');
    var scopeSubmit = document.getElementById('scopeSubmit');
    var scopeDownload = document.getElementById('scopeDownload');
    var scopeLeadForm = document.getElementById('scopeLeadForm');
    var scopeLeadStatus = document.getElementById('scopeLeadStatus');
    var scopeLeadExplanation = document.getElementById('scopeLeadExplanation');
    var scopeReset = document.getElementById('scopeReset');
    var rateModeDescription = document.getElementById('rateModeDescription');
    var projectRateSet = document.getElementById('projectRateSet');
    var oneTimeTotal = document.getElementById('oneTimeTotal');
    var monthlyTotal = document.getElementById('monthlyTotal');
    var menuCatalog = document.getElementById('media-menu-catalog');
    var selected = new Map();
    var activeMode = 'current';
    var receiverReady = false;
    var submitting = false;
    var submittedBrief = '';

    if (!optionButtons.length || !projectList || !scopeCount || !scopeSubmit || !scopeReset) return;

    var modeLabels = { current: 'Current menu', regional: 'Regional proposal' };
    var modeDescriptions = {
        current: 'Amber’s supplied current menu, presented for review in the SOLYNX department format. Choose services to build a planning summary.',
        regional: 'Proposed regional commercial rates and bounded starter packages, kept separate from the current menu for review.'
    };

    function money(value, monthly) {
        return '$' + Number(value || 0).toLocaleString('en-US') + (monthly ? '/mo' : '');
    }

    function buttonAction(button, selectedState) {
        var action = button.querySelector('em');
        if (!action) return;
        var verb = button.classList.contains('packageOption') || button.classList.contains('alphaOption') ? 'Start' : 'Add';
        action.innerHTML = selectedState ? 'Added <i aria-hidden="true">✓</i>' : verb + ' <i aria-hidden="true">+</i>';
    }

    function clearButton(button) {
        selected.delete(button.getAttribute('data-scope-id'));
        button.setAttribute('aria-pressed', 'false');
        buttonAction(button, false);
    }

    function clearAll() {
        selected.clear();
        optionButtons.forEach(function (button) {
            button.setAttribute('aria-pressed', 'false');
            buttonAction(button, false);
        });
    }

    function detailsFor(button) {
        return {
            id: button.getAttribute('data-scope-id'),
            label: button.getAttribute('data-scope-label'),
            display: button.getAttribute('data-' + activeMode + '-display') || 'Pricing to be defined',
            oneTime: Number(button.getAttribute('data-' + activeMode + '-onetime') || 0),
            monthly: Number(button.getAttribute('data-' + activeMode + '-monthly') || 0),
            kind: button.getAttribute('data-selection-kind') || 'service',
            group: button.getAttribute('data-selection-group') || '',
            button: button
        };
    }

    function render() {
        submittedBrief = '';
        var items = Array.from(selected.values());
        var totals = items.reduce(function (sum, item) {
            sum.oneTime += item.oneTime;
            sum.monthly += item.monthly;
            return sum;
        }, { oneTime: 0, monthly: 0 });
        projectList.innerHTML = '';
        items.forEach(function (item) {
            var row = document.createElement('li');
            var copy = document.createElement('span');
            var label = document.createElement('b');
            var price = document.createElement('small');
            var remove = document.createElement('button');
            label.textContent = item.label;
            price.textContent = item.display;
            copy.appendChild(label);
            copy.appendChild(price);
            remove.type = 'button';
            remove.textContent = 'Remove';
            remove.setAttribute('aria-label', 'Remove ' + item.label);
            remove.addEventListener('click', function () { clearButton(item.button); render(); });
            row.appendChild(copy);
            row.appendChild(remove);
            projectList.appendChild(row);
        });
        var count = items.length;
        scopeCount.textContent = String(count);
        if (navScopeCount) navScopeCount.textContent = String(count);
        if (projectRateSet) projectRateSet.textContent = modeLabels[activeMode];
        if (oneTimeTotal) oneTimeTotal.textContent = money(totals.oneTime, false);
        if (monthlyTotal) monthlyTotal.textContent = money(totals.monthly, true);
        projectEmpty.hidden = count > 0;
        scopeReset.disabled = count === 0;
        scopeSubmit.disabled = !receiverReady || count === 0 || submitting;
        if (scopeDownload) scopeDownload.disabled = true;
    }

    function switchMode(mode) {
        if (mode !== 'current' && mode !== 'regional') return;
        activeMode = mode;
        clearAll();
        rateTabs.forEach(function (tab) {
            var isActive = tab.getAttribute('data-rate-mode') === mode;
            tab.classList.toggle('isActive', isActive);
            tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        if (menuCatalog) menuCatalog.setAttribute('aria-labelledby', mode === 'current' ? 'currentRateTab' : 'regionalRateTab');
        if (rateModeDescription) rateModeDescription.textContent = modeDescriptions[mode];
        modeCopies.forEach(function (copy) { copy.textContent = copy.getAttribute('data-copy-' + mode) || copy.textContent; });
        modeOnlyElements.forEach(function (element) { element.hidden = element.getAttribute('data-mode-only') !== mode; });
        optionButtons.forEach(function (button) {
            var available = !button.getAttribute('data-mode-only') || button.getAttribute('data-mode-only') === mode;
            button.disabled = !available;
            var price = button.querySelector('.scopePrice');
            var display = button.getAttribute('data-' + mode + '-display');
            if (price && display) price.textContent = display;
        });
        render();
    }

    optionButtons.forEach(function (button) {
        button.addEventListener('click', function () {
            var details = detailsFor(button);
            if (selected.has(details.id)) { clearButton(button); render(); return; }
            if (details.kind === 'package') {
                clearAll();
            } else {
                Array.from(selected.values()).forEach(function (item) {
                    if (item.kind === 'package' || (details.group && item.group === details.group)) clearButton(item.button);
                });
            }
            selected.set(details.id, details);
            button.setAttribute('aria-pressed', 'true');
            buttonAction(button, true);
            render();
        });
    });

    rateTabs.forEach(function (tab) { tab.addEventListener('click', function () { switchMode(tab.getAttribute('data-rate-mode')); }); });
    scopeReset.addEventListener('click', function () { clearAll(); render(); });
    if (scopeLeadForm) scopeLeadForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (!receiverReady || submitting || !selected.size) return;
        if (!scopeLeadForm.reportValidity()) return;
        var form = new FormData(scopeLeadForm);
        var payload = {
            fullName: form.get('fullName'),
            email: form.get('email'),
            business: form.get('business'),
            phone: form.get('phone'),
            description: form.get('description'),
            location: form.get('location'),
            timeline: form.get('timeline'),
            website: form.get('website'),
            mode: activeMode,
            items: Array.from(selected.keys())
        };
        var selection = Array.from(selected.values());
        submitting = true;
        scopeSubmit.disabled = true;
        scopeLeadStatus.textContent = 'Saving your project brief with SOLYNX…';
        try {
            var response = await fetch('/api/digital-media-lead', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            var result = await response.json();
            if (!response.ok || result.saved !== true) throw new Error(result.error || 'Save not confirmed.');
            submittedBrief = [
                'SOLYNX Digital Media & Tech — submitted project brief',
                'Rate set: ' + modeLabels[payload.mode],
                'Selected services:',
                ...selection.map(function (item) { return '- ' + item.label + ' (' + item.display + ')'; }),
                '',
                'Name: ' + payload.fullName,
                'Email: ' + payload.email,
                'Business: ' + payload.business,
                'Phone: ' + (payload.phone || 'Not provided'),
                'Project: ' + payload.description,
                'Location: ' + (payload.location || 'Not provided'),
                'Timeline: ' + (payload.timeline || 'Not provided'),
                '',
                'Planning selections only. Final scope, rights, travel, usage, and price require written review.'
            ].join('\n');
            scopeLeadStatus.textContent = 'Your brief was saved. Download your submitted selection for your records; the team will review the scope.';
            if (scopeDownload) {
                scopeDownload.disabled = false;
                scopeDownload.textContent = 'Download submitted brief';
            }
        } catch (error) {
            receiverReady = false;
            scopeLeadStatus.textContent = error.message || 'We could not confirm the intake. Part of your brief may have been saved. Please do not resubmit; email digitalmedia@solynx.solutions for a status check.';
        } finally {
            submitting = false;
            scopeSubmit.disabled = !receiverReady || !selected.size;
        }
    });
    if (scopeDownload) scopeDownload.addEventListener('click', function () {
        if (!submittedBrief) return;
        var url = URL.createObjectURL(new Blob([submittedBrief], { type: 'text/plain;charset=utf-8' }));
        var link = document.createElement('a');
        link.href = url;
        link.download = 'solynx-digital-media-brief.txt';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
    switchMode('current');
    fetch('/api/digital-media-lead', { cache: 'no-store' })
        .then(function (response) { return response.ok ? response.json() : { ready: false }; })
        .then(function (status) {
            if (status.ready !== true) return;
            receiverReady = true;
            scopeSubmit.textContent = 'Submit project brief ↗';
            scopeLeadStatus.textContent = 'SOLYNX intake is connected. Your information is saved only after you submit and receive confirmation.';
            if (scopeLeadExplanation) scopeLeadExplanation.textContent = 'Share the essentials. After SOLYNX confirms the brief is saved, you can download your submitted selection for your records.';
            scopeSubmit.disabled = !selected.size;
        })
        .catch(function () { /* Fail closed when the receiver cannot be verified. */ });
})();
