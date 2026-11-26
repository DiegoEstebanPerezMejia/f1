const form = document.getElementById('form');
const msg = document.getElementById('msg');
const go = document.getElementById('go');

// Si ya hay sesión activa, redirige
api('/api/me').then((me) => { location.href = me.role === 'admin' ? '/admin.html' : '/app.html'; }).catch(() => {});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  go.disabled = true;
  showMsg(msg, '');
  try {
    const me = await api('/api/login', {
      method: 'POST',
      body: { username: form.username.value, password: form.password.value },
    });
    location.href = me.role === 'admin' ? '/admin.html' : '/app.html';
  } catch (err) {
    showMsg(msg, err.message);
    go.disabled = false;
  }
});
