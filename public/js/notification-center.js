(function () {
  'use strict';

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>\"']/g, function (char) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[char];
    });
  }

  function mount(options) {
    options = options || {};
    var endpoint = options.endpoint || '/notifications/api';
    var button = document.querySelector('[data-notification-toggle]');
    var panel = document.querySelector('[data-notification-panel]');
    if (!button || !panel) return;

    function render(items) {
      if (!items || !items.length) {
        panel.innerHTML = '<div class="nb-notification-empty">You are all caught up.</div>';
        return;
      }
      panel.innerHTML = items.map(function (item) {
        return '<a class="nb-notification-item" href="' + escapeHtml(item.actionUrl || '#') + '">' +
          '<span class="nb-notification-dot nb-' + escapeHtml(item.severity || 'info') + '"></span>' +
          '<span><strong>' + escapeHtml(item.title) + '</strong><small>' + escapeHtml(item.message) + '</small></span>' +
          '</a>';
      }).join('');
    }

    function load() {
      fetch(endpoint, { headers: { 'Accept': 'application/json' }, credentials: 'same-origin' })
        .then(function (response) { return response.ok ? response.json() : []; })
        .then(render)
        .catch(function () { render([]); });
    }

    button.addEventListener('click', function () {
      panel.classList.toggle('is-open');
      if (panel.classList.contains('is-open')) load();
    });

    document.addEventListener('click', function (event) {
      if (!panel.contains(event.target) && !button.contains(event.target)) panel.classList.remove('is-open');
    });
  }

  window.NovBankNotifications = { mount: mount };
}());
