(function () {
    'use strict';

    var definitionSection = document.querySelector('.definition');
    var packageSection = document.getElementById('media-packages');
    if (definitionSection && packageSection) definitionSection.insertAdjacentElement('afterend', packageSection);

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
    var projectList = document.getElementById('projectList');
    var projectEmpty = document.getElementById('projectEmpty');
    var scopeCount = document.getElementById('scopeCount');
    var navScopeCount = document.getElementById('navScopeCount');
    var navProjectLink = document.getElementById('navProjectLink');
    var projectPanel = /** @type {HTMLDetailsElement | null} */ (document.getElementById('project-summary'));
    var selectionAssist = document.getElementById('selectionAssist');
    var selectionAssistLink = document.getElementById('selectionAssistLink');
    var selectionAssistCount = document.getElementById('selectionAssistCount');
    var selectionAnnouncement = document.getElementById('selectionAnnouncement');
    const scopeLeadForm = /** @type {HTMLFormElement | null} */ (document.querySelector('form#scopeLeadForm'));
    const scopeSubmit = /** @type {HTMLButtonElement | null} */ (document.querySelector('button#scopeSubmit'));
    var scopeLeadStatus = document.getElementById('scopeLeadStatus');
    const scopeReset = /** @type {HTMLButtonElement | null} */ (document.querySelector('button#scopeReset'));
    var approvedPricebook = document.getElementById('approvedPricebook');
    var approvedPriceList = document.getElementById('approvedPriceList');
    var approvedPriceNote = document.getElementById('approvedPriceNote');
    var projectTotals = document.getElementById('projectTotals');
    var oneTimeTotal = document.getElementById('oneTimeTotal');
    var selected = new Map();
    var approvedPrices = null;
    var receiverReady = false;
    var submitting = false;
    var saveConfirmed = false;
    var submissionUncertain = false;

    if (!optionButtons.length || !projectList || !projectEmpty || !scopeCount ||
        !(scopeLeadForm instanceof HTMLFormElement) || !(scopeSubmit instanceof HTMLButtonElement) ||
        !(scopeReset instanceof HTMLButtonElement) || !scopeLeadStatus ||
        !approvedPricebook || !approvedPriceList) return;

    function money(value) {
        return '$' + Number(value || 0).toLocaleString('en-US');
    }

    function priceFor(item) {
        if (!approvedPrices || !item.priceKey) return null;
        var price = approvedPrices[item.priceKey];
        if (!price || !Number.isFinite(price.amount) || typeof price.display !== 'string') return null;
        return price;
    }

    function buttonAction(button, selectedState) {
        var action = button.querySelector('em');
        if (!action) return;
        action.innerHTML = selectedState ? '<i aria-hidden="true">✓</i><span>Selected</span>' : '<i aria-hidden="true">+</i><span>Add</span>';
        button.setAttribute('aria-label', (selectedState ? 'Remove ' : 'Add ') + button.getAttribute('data-scope-label'));
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
            priceKey: button.getAttribute('data-price-key') || '',
            kind: button.getAttribute('data-selection-kind') || 'service',
            group: button.getAttribute('data-selection-group') || '',
            button: button
        };
    }

    function updatePriceDisplays() {
        optionButtons.forEach(function (button) {
            var key = button.getAttribute('data-price-key');
            var target = button.querySelector('.scopePrice');
            if (!key || !target) return;
            target.textContent = approvedPrices && approvedPrices[key] ? approvedPrices[key].display : 'Unlock price';
        });
        Array.prototype.slice.call(document.querySelectorAll('[data-price-display]')).forEach(function (target) {
            var key = target.getAttribute('data-price-display');
            target.textContent = approvedPrices && approvedPrices[key] ? approvedPrices[key].display : 'Unlock price';
        });
    }

    function render() {
        var items = Array.from(selected.values());
        var pricedTotal = 0;
        projectList.innerHTML = '';
        items.forEach(function (item) {
            var row = document.createElement('li');
            var copy = document.createElement('span');
            var label = document.createElement('b');
            var price = document.createElement('small');
            var remove = document.createElement('button');
            var approved = priceFor(item);
            label.textContent = item.label;
            if (approved) {
                price.textContent = approved.display;
                pricedTotal += approved.amount;
            } else if (item.priceKey) {
                price.textContent = 'Unlock after saved contact';
            } else {
                price.textContent = 'Custom quote';
            }
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
        if (navProjectLink) navProjectLink.setAttribute('aria-label', 'View your project, ' + count + ' selected ' + (count === 1 ? 'item' : 'items'));
        if (selectionAssist) selectionAssist.hidden = count === 0 || Boolean(projectPanel && projectPanel.open);
        if (selectionAssistCount) selectionAssistCount.textContent = count + ' selected';
        projectEmpty.hidden = count > 0;
        scopeReset.disabled = count === 0;
        scopeSubmit.disabled = !receiverReady || count === 0 || submitting || saveConfirmed || submissionUncertain;
        if (projectTotals) projectTotals.hidden = approvedPrices === null;
        if (oneTimeTotal) oneTimeTotal.textContent = money(pricedTotal);
    }

    optionButtons.forEach(function (button) {
        buttonAction(button, false);
        button.addEventListener('click', function () {
            var details = detailsFor(button);
            if (selected.has(details.id)) {
                clearButton(button);
                render();
                if (selectionAnnouncement) selectionAnnouncement.textContent = details.label + ' removed. ' + selected.size + ' selected ' + (selected.size === 1 ? 'item' : 'items') + '.';
                return;
            }
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
            if (selectionAnnouncement) selectionAnnouncement.textContent = details.label + ' selected. ' + selected.size + ' selected ' + (selected.size === 1 ? 'item' : 'items') + '. Use View your project to review the selection.';
        });
    });

    [navProjectLink, selectionAssistLink].forEach(function (link) {
        if (!link || !projectPanel) return;
        link.addEventListener('click', function () {
            projectPanel.open = true;
            if (selectionAssist) selectionAssist.hidden = true;
            window.setTimeout(function () {
                var summary = projectPanel.querySelector('summary');
                if (summary) summary.focus({ preventScroll: true });
            }, 0);
        });
    });
    if (projectPanel) projectPanel.addEventListener('toggle', render);

    scopeReset.addEventListener('click', function () { clearAll(); render(); });

    function acceptPrices(prices) {
        if (!prices || typeof prices !== 'object' || Array.isArray(prices)) throw new Error('The saved contact was confirmed, but matching prices could not be verified. Please contact the Digital Media team.');
        var expected = Array.from(selected.values()).map(function (item) { return item.priceKey; }).filter(Boolean);
        var valid = expected.every(function (key) {
            return prices[key] && Number.isFinite(prices[key].amount) && prices[key].amount > 0 &&
                typeof prices[key].label === 'string' && typeof prices[key].display === 'string';
        });
        if (!valid) throw new Error('The saved contact was confirmed, but a matching approved price was missing. Please contact the Digital Media team.');
        approvedPrices = prices;
        updatePriceDisplays();
        approvedPriceList.innerHTML = '';
        expected.forEach(function (key) {
            var term = document.createElement('dt');
            var amount = document.createElement('dd');
            term.textContent = prices[key].label;
            amount.textContent = prices[key].display;
            approvedPriceList.appendChild(term);
            approvedPriceList.appendChild(amount);
        });
        if (approvedPriceNote) approvedPriceNote.textContent = expected.length ?
            'Only approved prices matching your selected individual services are shown. Final scope, travel, usage rights, timing, and any work outside the listed service are confirmed in a written proposal.' :
            'Your selection was saved. Sean and Amber will review the details and provide a written quote for the work you selected.';
        approvedPricebook.hidden = false;
        render();
    }

    function campaignAttribution() {
        var query = new URLSearchParams(window.location.search);
        var campaign = {};
        // Match the established native bridge's public campaign-slug contract.
        // Never forward the raw URL, private query keys, click IDs or fragments.
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (key) {
            var value = query.get(key);
            if (value && /^[a-zA-Z0-9_-]{1,80}$/.test(value)) campaign[key] = value;
        });
        return campaign;
    }

    scopeLeadForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (!receiverReady || submitting || saveConfirmed || submissionUncertain || !selected.size) return;
        if (!scopeLeadForm.reportValidity()) return;
        var form = new FormData(scopeLeadForm);
        var payload = {
            fullName: form.get('fullName'),
            email: form.get('email'),
            business: form.get('business'),
            phone: form.get('phone'),
            preferredContact: form.get('preferredContact'),
            description: form.get('description'),
            location: form.get('location'),
            timeline: form.get('timeline'),
            website: form.get('website'),
            marketingConsent: form.get('marketingConsent') === 'yes',
            qualifiers: Object.fromEntries(['intendedUse', 'deliveryChannels', 'footageReadiness', 'usageRights', 'decisionProcess']
                .map(function (key) { return [key, String(form.get(key) || '').trim().slice(0, 300)]; })
                .filter(function (entry) { return entry[1]; })),
            attribution: campaignAttribution(),
            mode: 'inquiry',
            items: Array.from(selected.keys()),
            selections: Array.from(selected.values()).map(function (item) {
                return { id: item.id, quantity: 1, kind: item.kind };
            }),
            packageChoice: (Array.from(selected.values()).find(function (item) { return item.kind === 'package'; }) || {}).id || null
        };
        submitting = true;
        submissionUncertain = true;
        render();
        scopeLeadStatus.textContent = 'Saving your contact and project brief with SOLYNX…';
        try {
            var response = await fetch('/api/digital-media-lead', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            var result = await response.json();
            // These responses are returned before any CRM write by this receiver.
            if (!response.ok && [400, 403, 413, 429, 503].includes(response.status)) submissionUncertain = false;
            if (!response.ok || result.saved !== true) throw new Error(result.error || 'Save not confirmed.');
            saveConfirmed = true;
            acceptPrices(result.prices);
            scopeLeadStatus.textContent = 'Saved. Matching approved prices are shown when available—no account or login was created.';
            scopeSubmit.textContent = 'Contact saved';
            Array.prototype.slice.call(scopeLeadForm.querySelectorAll('input, textarea')).forEach(function (field) { field.disabled = true; });
        } catch (error) {
            scopeLeadStatus.textContent = submissionUncertain && !saveConfirmed ?
                'We could not confirm every intake step. Part of your brief may have been saved. Please do not resubmit; email digitalmedia@solynx.solutions for a status check.' :
                error.message || 'We could not confirm the save. Please email digitalmedia@solynx.solutions.';
        } finally {
            submitting = false;
            render();
        }
    });

    fetch('/api/digital-media-lead', { cache: 'no-store' })
        .then(function (response) { return response.ok ? response.json() : { ready: false }; })
        .then(function (status) {
            if (status.ready !== true) {
                scopeLeadStatus.textContent = 'Secure price access is not connected yet. Nothing has been sent; email the Digital Media team for help.';
                return;
            }
            receiverReady = true;
            scopeLeadStatus.textContent = 'Secure intake connected. Your information is saved only after you submit and receive confirmation.';
            render();
        })
        .catch(function () {
            scopeLeadStatus.textContent = 'Secure price access could not be verified. Nothing has been sent.';
        });

    updatePriceDisplays();
    render();
})();
