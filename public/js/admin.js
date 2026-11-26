let me = null;

(async function init() {
  me = await requireSession('admin');
  if (!me) return;
  document.getElementById('who').textContent = me.username;
  document.getElementById('outBtn').onclick = logout;
  loadUsers();
})();

async function loadUsers() {
  const users = await api('/api/admin/users');
  const box = document.getElementById('users');
  box.innerHTML = '<div style="overflow-x:auto"><table><thead><tr><th>Usuario</th><th>Empresa</th><th>Rol</th><th>Estado</th><th>Creado</th><th>Acciones</th></tr></thead><tbody>' +
    users.map((u) => `<tr>
      <td>${esc(u.username)}</td>
      <td>${esc(u.company_name || '')}</td>
      <td>${u.role === 'admin' ? 'Administrador' : 'Usuario'}</td>
      <td><span class="badge ${u.active ? 'on' : 'off'}">${u.active ? 'Activo' : 'Inactivo'}</span></td>
      <td>${new Date(u.created_at).toLocaleDateString('es-MX')}</td>
      <td style="white-space:nowrap">
        <button class="btn secondary small" data-pw="${u.id}">Nueva contraseña</button>
        ${u.id !== me.id ? `<button class="btn secondary small" data-toggle="${u.id}" data-active="${u.active}">${u.active ? 'Desactivar' : 'Activar'}</button>
        <button class="btn danger small" data-del="${u.id}" data-name="${esc(u.username)}">Eliminar</button>` : ''}
      </td></tr>`).join('') + '</tbody></table></div>';

  box.querySelectorAll('[data-pw]').forEach((b) => b.onclick = async () => {
    const pw = prompt('Nueva contraseña (mínimo 8 caracteres):');
    if (!pw) return;
    try { await api('/api/admin/users/' + b.dataset.pw, { method: 'PATCH', body: { password: pw } }); alert('Contraseña actualizada.'); }
    catch (e) { alert(e.message); }
  });
  box.querySelectorAll('[data-toggle]').forEach((b) => b.onclick = async () => {
    try { await api('/api/admin/users/' + b.dataset.toggle, { method: 'PATCH', body: { active: b.dataset.active !== 'true' } }); loadUsers(); }
    catch (e) { alert(e.message); }
  });
  box.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    if (!confirm(`¿Eliminar al usuario "${b.dataset.name}" y todos sus datos? Esta acción no se puede deshacer.`)) return;
    try { await api('/api/admin/users/' + b.dataset.del, { method: 'DELETE' }); loadUsers(); }
    catch (e) { alert(e.message); }
  });
}

document.getElementById('cForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('cMsg');
  try {
    await api('/api/admin/users', {
      method: 'POST',
      body: {
        username: document.getElementById('c_username').value,
        password: document.getElementById('c_password').value,
        company_name: document.getElementById('c_company').value,
        role: document.getElementById('c_role').value,
      },
    });
    e.target.reset();
    showMsg(msg, 'Usuario creado. Comparte las credenciales de forma segura.', true);
    loadUsers();
  } catch (err) { showMsg(msg, err.message); }
});
