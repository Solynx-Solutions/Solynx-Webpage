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
    var selected = new Map();
    var receiverReady = false;
    var submitting = false;
    var submittedBrief = '';

    if (!optionButtons.length || !projectList || !scopeCount || !scopeSubmit || !scopeReset) return;

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
            kind: button.getAttribute('data-selection-kind') || 'service',
            group: button.getAttribute('data-selection-group') || '',
            button: button
        };
    }

    function render() {
        submittedBrief = '';
        var items = Array.from(selected.values());

        projectList.innerHTML = '';
        items.forEach(function (item) {
            var row = document.createElement('li');
            var copy = document.createElement('span');
            var label = document.createElement('b');
            var price = document.createElement('small');
            var remove = document.createElement('button');
            label.textContent = item.label;
            price.textContent = 'Pricing by inquiry';
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
        projectEmpty.hidden = count > 0;
        scopeReset.disabled = count === 0 || Boolean(submittedBrief);
        scopeSubmit.disabled = !receiverReady || count === 0 || submitting || Boolean(submittedBrief);
        if (scopeDownload) scopeDownload.disabled = !submittedBrief;
    }

    optionButtons.forEach(function (button) {
        button.addEventListener('click', function () {
            if (submittedBrief) return;
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

    scopeReset.addEventListener('click', function () { if (submittedBrief) return; clearAll(); render(); });
    if (scopeLeadForm) scopeLeadForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (!receiverReady || submitting || submittedBrief || !selected.size) return;
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
            mode: 'inquiry',
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
                'Selected services:',
                ...selection.map(function (item) { return '- ' + item.label; }),
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
            scopeSubmit.textContent = 'Pricing request received';
            optionButtons.forEach(function (button) { button.disabled = true; });
            scopeReset.disabled = true;
            if (scopeDownload) {
                scopeDownload.disabled = false;
                scopeDownload.textContent = 'Download submitted brief';
            }
        } catch (error) {
            receiverReady = false;
            scopeLeadStatus.textContent = error.message || 'We could not confirm the intake. Part of your brief may have been saved. Please do not resubmit; email digitalmedia@solynx.solutions for a status check.';
        } finally {
            submitting = false;
            scopeSubmit.disabled = !receiverReady || !selected.size || Boolean(submittedBrief);
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
    render();
    fetch('/api/digital-media-lead', { cache: 'no-store' })
        .then(function (response) { return response.ok ? response.json() : { ready: false }; })
        .then(function (status) {
            if (status.ready !== true) return;
            receiverReady = true;
            scopeSubmit.textContent = 'Request project pricing ↗';
            scopeLeadStatus.textContent = 'Send your project details to request pricing. Your inquiry is saved only after submission is confirmed.';
            if (scopeLeadExplanation) scopeLeadExplanation.textContent = 'Share the essentials to request a personalized quote. After your inquiry is confirmed, you can download your selections. Pricing follows a review by our team.';
            scopeSubmit.disabled = !selected.size;
        })
        .catch(function () { /* Fail closed when the receiver cannot be verified. */ });
})();
