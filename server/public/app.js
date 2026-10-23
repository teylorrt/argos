const $ = id => document.getElementById(id);
let csrf = null, cursor = null, observations = [], selectedId = null;
const names = { whatsapp: 'WhatsApp', instagram: 'Instagram', messenger: 'Messenger' };
const sources = { accessibility: 'Acessibilidade', notification: 'Notificação' };
const directions = { incoming: 'Recebida', outgoing: 'Saída observada', unknown: 'Direção desconhecida' };
const states = { observed: 'Observada', pending: 'Pendente', sent: 'Indicador de envio observado', unknown: 'Estado desconhecido' };
function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; }
function date(value) { return value ? new Date(value).toLocaleString('pt-BR') : 'Não disponível'; }
function error(e) { $('error').textContent = e.message; }
async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options, headers: { 'content-type': 'application/json', ...(csrf ? { 'x-csrf-token': csrf } : {}), ...options.headers } });
  const body = await response.json();
  if (!response.ok) { if (response.status === 401) showLogin(); throw new Error(body.error || `Erro ${response.status}`); }
  $('error').textContent = ''; return body;
}
function showLogin() { $('login').hidden = false; $('workspace').hidden = true; $('logout').hidden = true; observations = []; $('messages').replaceChildren(); }
async function authenticated() { $('login').hidden = true; $('workspace').hidden = false; $('logout').hidden = false; await Promise.all([load(false), devices()]); }
$('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  try { const result = await api('/v1/session', { method: 'POST', body: JSON.stringify({ token: $('token').value }) }); csrf = result.csrf; $('token').value = ''; await authenticated(); } catch (e) { error(e); }
});
$('logout').onclick = async () => { try { await api('/v1/session', { method: 'DELETE' }); csrf = null; showLogin(); } catch(e) { error(e); } };
async function load(more) {
  try {
    const query = new URLSearchParams({ limit: '50' });
    for (const key of ['app', 'source', 'simulated']) if ($(key).value) query.set(key, $(key).value);
    for (const key of ['from', 'to']) if ($(key).value) query.set(key, new Date($(key).value).toISOString());
    if (more && cursor) query.set('before', cursor);
    const result = await api('/v1/observations?' + query);
    observations = more ? [...observations, ...result.items] : result.items;
    cursor = result.nextCursor; $('more').hidden = !cursor; render();
  } catch (e) { error(e); }
}
function render() {
  const search = $('search').value.toLocaleLowerCase();
  const items = observations.filter(item => [item.text, item.sender, item.recipient, item.conversation?.title].some(value => (value || '').toLocaleLowerCase().includes(search)));
  const root = $('messages'); root.replaceChildren();
  $('summary').textContent = `${items.length} registros exibidos · Ordem de recebimento, mais recentes primeiro`;
  if (!items.length) root.append(element('div', 'empty', 'Nenhuma mensagem por aqui. Conecte um aparelho ou envie os dados de demonstração.'));
  for (const item of items) {
    const card = element('article', 'message'); card.tabIndex = 0;
    const top = element('div', 'message-top');
    top.append(element('span', 'badge ' + (item.app || ''), names[item.app] || 'Registro indisponível'));
    if (item.simulated) top.append(element('span', 'badge simulated', 'SIMULADO'));
    top.append(element('span', '', sources[item.source] || item.error));
    const time = element('time', '', date(item.messageAt || item.observedAt)); top.append(time); card.append(top);
    card.append(element('div', 'participants', `${item.sender || 'Origem desconhecida'} → ${item.recipient || 'Destinatário desconhecido'}`));
    card.append(element('p', 'body', item.text || 'Não foi possível decifrar o registro. Verifique as chaves do servidor.'));
    card.append(element('div', 'meta', `${item.conversation?.title || 'Conversa não identificada'} · ${directions[item.direction] || ''} · ${states[item.deliveryState] || ''}`));
    const open = async () => { try { const detail = await api('/v1/observations/' + item.id); selectedId = item.id; $('detail-json').textContent = JSON.stringify(detail, null, 2); $('detail').showModal(); } catch(e) { error(e); } };
    card.onclick = open; card.onkeydown = event => { if (event.key === 'Enter') open(); }; root.append(card);
  }
}
async function devices() {
  const result = await api('/v1/devices'); $('devices').replaceChildren();
  if (!result.items.length) $('devices').textContent = 'Nenhum aparelho cadastrado.';
  for (const d of result.items) {
    const row = element('div', 'device'); row.append(element('strong', '', d.label), element('p', '', `${d.revoked_at ? 'Revogado' : 'Registrado'} · Último contato: ${date(d.last_seen_at)}`));
    if (!d.revoked_at) { const button = element('button', '', 'Revogar acesso'); button.onclick = async () => { if (!confirm('Revogar este aparelho? A captura offline só saberá na próxima comunicação.')) return; try { await api(`/v1/devices/${d.id}/revoke`, { method: 'POST', body: '{}' }); await devices(); } catch(e) { error(e); } }; row.append(button); }
    $('devices').append(row);
  }
}
$('pair').onclick = async () => { try { const result = await api('/v1/enrollments', { method: 'POST', body: '{}' }); $('pair-code').textContent = `${result.code}\nVálido até ${date(result.expiresAt)}`; } catch(e) { error(e); } };
$('delete').onclick = async () => { if (!selectedId || !confirm('Excluir este registro do servidor?')) return; try { await api('/v1/observations/' + selectedId, { method: 'DELETE' }); $('detail').close(); await load(false); } catch(e) { error(e); } };
$('close-detail').onclick = () => $('detail').close();
for (const id of ['app', 'source', 'simulated', 'from', 'to']) $(id).onchange = () => load(false);
$('search').oninput = render;
$('refresh').onclick = async () => { await load(false); try { await devices(); } catch(e) { error(e); } };
$('more').onclick = () => load(true);
api('/v1/session').then(async result => { csrf = result.csrf; await authenticated(); }).catch(() => { showLogin(); $('error').textContent = ''; });
