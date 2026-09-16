(function () {
    'use strict';

    var optionButtons = Array.prototype.slice.call(document.querySelectorAll('.scopeOption[data-scope-id]'));
    var rateTabs = Array.prototype.slice.call(document.querySelectorAll('[data-rate-mode]'));
    var modeCopies = Array.prototype.slice.call(document.querySelectorAll('.modeCopy'));
    var modeOnlyElements = Array.prototype.slice.call(document.querySelectorAll('[data-mode-only]'));
    var projectList = document.getElementById('projectList');
    var projectEmpty = document.getElementById('projectEmpty');
    var scopeCount = document.getElementById('scopeCount');
    var navScopeCount = document.getElementById('navScopeCount');
    var scopeQuote = document.getElementById('scopeQuote');
    var scopeReset = document.getElementById('scopeReset');
    var rateModeDescription = document.getElementById('rateModeDescription');
    var projectRateSet = document.getElementById('projectRateSet');
    var oneTimeTotal = document.getElementById('oneTimeTotal');
    var monthlyTotal = document.getElementById('monthlyTotal');
    var menuCatalog = document.getElementById('media-menu-catalog');
    var selected = new Map();
    var activeMode = 'current';

    if (!optionButtons.length || !projectList || !scopeCount || !scopeQuote || !scopeReset) return;

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

    function buildMailto(items, totals) {
        var subject = encodeURIComponent('SOLYNX Media Scope Request');
        var body = encodeURIComponent(
            'Rate set: ' + modeLabels[activeMode] + '\n\n' +
            items.map(function (item) { return '• ' + item.label + ' — ' + item.display; }).join('\n') +
            '\n\nPlanning subtotal: ' + money(totals.oneTime, false) +
            '\nRecurring monthly: ' + money(totals.monthly, true) +
            '\n\nPlease confirm eligibility, scope, rights, deliverables, timing, and final quote.'
        );
        return 'mailto:rafael@solynx.solutions?subject=' + subject + '&body=' + body;
    }

    function render() {
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
        scopeQuote.classList.toggle('isDisabled', count === 0);
        scopeQuote.setAttribute('aria-disabled', count === 0 ? 'true' : 'false');
        scopeQuote.href = count === 0 ? 'mailto:rafael@solynx.solutions?subject=SOLYNX%20Media%20Scope%20Request' : buildMailto(items, totals);
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
    scopeQuote.addEventListener('click', function (event) {
        if (!selected.size) { event.preventDefault(); optionButtons[0].focus(); }
    });
    switchMode('current');
})();
