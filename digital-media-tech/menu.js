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
    var scopeLeadStatus = document.getElementById('scopeLeadStatus');
    var scopeReset = document.getElementById('scopeReset');
    var selected = new Map();

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
        scopeReset.disabled = count === 0;
        scopeSubmit.disabled = count === 0;
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

    scopeReset.addEventListener('click', function () { clearAll(); render(); });
    var nativeFrame = document.getElementById('scopeNativeForm');
    var nativeLink = document.getElementById('scopeNativeLink');
    var nativeFallback = document.getElementById('scopeNativeFallback');
    scopeSubmit.addEventListener('click', function () {
        if (!selected.size) return;
        var brief = 'Selected services:\n' + Array.from(selected.values()).map(function (item) { return '- ' + item.label; }).join('\n');
        var url = 'https://link.solynx.solutions/widget/form/1NHtVDOSdhAUtCKRcvo8?project_brief=' + encodeURIComponent(brief);
        nativeFrame.src = url;
        nativeFrame.hidden = false;
        nativeLink.href = url;
        nativeFallback.hidden = false;
        scopeLeadStatus.textContent = 'Your selections are included below. Complete and submit the form to send your inquiry. Opening it alone does not save or submit anything.';
        scopeSubmit.textContent = 'Refresh form with current selection ↗';
    });
    render();
})();
