/* Hx — login page. Demo sign-in via Hx.devLogin; redirects to repos.html.
 * Every demo entry button drives the shared client (window.Hx). Nothing hardcoded. */
(function () {
  var msg = document.getElementById('login-msg');
  var buttons = Array.prototype.slice.call(document.querySelectorAll('[data-user]'));

  function setMsg(text, kind) {
    if (!msg) return;
    msg.textContent = text || '';
    msg.className = 'login-msg' + (kind ? ' ' + kind : '');
  }

  function setBusy(busy) {
    buttons.forEach(function (b) { b.disabled = busy; });
  }

  // After sign-in everyone lands on the repo list (patients see their threads,
  // providers see only what's shared with them).
  function destinationFor(/* user */) {
    return 'repos.html';
  }

  function go(userId, label) {
    if (!userId) return;
    setBusy(true);
    setMsg('Signing in' + (label ? ' as ' + label + '…' : '…'), 'busy');
    Hx.devLogin(userId)
      .then(function (user) {
        setMsg('Signed in. Taking you in…', 'busy');
        location.href = destinationFor(user);
      })
      .catch(function (err) {
        setBusy(false);
        setMsg((err && err.message) ? err.message : 'Could not sign in. Please try again.', 'err');
      });
  }

  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      go(b.getAttribute('data-user'), (b.querySelector('b') ? b.querySelector('b').textContent : '').replace(/^Continue as\s*/i, '') || null);
    });
  });

  // ALWAYS show the picker — never auto-redirect on an existing session (or you
  // could never switch roles). If already signed in, just show a hint; clicking a
  // role overwrites the session.
  Hx.me().then(function (user) {
    if (user && msg) setMsg('Signed in as ' + user.displayName + '. Pick an account below to switch.', '');
  }).catch(function () {});
})();
