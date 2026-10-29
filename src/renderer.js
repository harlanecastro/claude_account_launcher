const $ = id => document.getElementById(id);
let state, editing, timer, launching = false;
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(timer); timer = setTimeout(() => { $('toast').hidden = true; }, 6500); }
async function action(fn) { try { await fn(); } catch (error) { toast(error.message); } }
function button(text, title, fn, className = 'icon-button') {
  const element = document.createElement('button'); element.textContent = text; element.title = title; element.setAttribute('aria-label', title); element.className = className;
  if (text === 'folder') {
    const icon = document.createElement('img');
    icon.src = 'assets/folder.svg'; icon.alt = ''; icon.width = 20; icon.height = 20;
    element.replaceChildren(icon);
  }
  element.onclick = () => action(async () => { element.disabled = true; try { await fn(); } finally { element.disabled = false; } }); return element;
}
function render(next) {
  state = next;
  $('platform').textContent = state.platform === 'darwin' ? 'macOS' : 'Windows';
  $('detected').textContent = state.executable ? 'Claude Desktop encontrado' : 'Selecione o Claude Desktop para começar';
  $('executable').textContent = state.executable || 'O Claude precisa estar instalado neste computador.';
  $('executable').title = state.executable || '';
  $('dot').classList.toggle('found', !!state.executable);
  $('profiles').replaceChildren();
  if (!state.profiles.length) {
    const empty = document.createElement('div'); empty.className = 'empty';
    const title = document.createElement('strong'); title.textContent = 'Qual conta você quer abrir primeiro?';
    const text = document.createElement('p'); text.textContent = 'Clique em “Novo perfil” para criar seu primeiro espaço.';
    empty.append(title, text); $('profiles').append(empty);
  }
  state.profiles.forEach(profile => {
    const card = document.createElement('article'); card.className = 'card'; card.classList.toggle('active', profile.active === true);
    const top = document.createElement('div'); top.className = 'card-top';
    const avatar = document.createElement('span'); avatar.className = 'avatar'; avatar.textContent = Array.from(profile.name)[0].toLocaleUpperCase('pt-BR');
    const info = document.createElement('div'); const title = document.createElement('h2'); title.textContent = profile.name;
    const meta = document.createElement('p'); meta.textContent = profile.lastOpened ? 'Última abertura: ' + new Date(profile.lastOpened).toLocaleDateString('pt-BR') : 'Pronto para o primeiro login';
    info.append(title);
    if (profile.active) { const badge = document.createElement('span'); badge.className = 'active-badge'; badge.textContent = '● Aberta'; info.append(badge); }
    info.append(meta); top.append(avatar, info);
    const bottom = document.createElement('div'); bottom.className = 'card-bottom';
    const launchText = profile.authenticated ? 'Abrir Claude' : 'Fazer login';
    bottom.append(button(launchText, `${launchText}: ${profile.name}`, async () => {
      if (launching) return;
      launching = true;
      $('profiles').querySelectorAll('button').forEach(b => { b.disabled = true; });
      toast(profile.active ? 'Exibindo o Claude…' : 'Abrindo a conta selecionada…');
      try { render(await window.launcher.launch(profile.id)); toast('Claude aberto na conta selecionada.'); }
      finally { launching = false; $('profiles').querySelectorAll('button').forEach(b => { b.disabled = false; }); }
    }, 'primary'), button('✎', `Renomear ${profile.name}`, () => editor(profile)), button('folder', `Abrir pasta de ${profile.name}`, () => window.launcher.folder(profile.id)), button('×', `Remover ${profile.name}`, async () => render(await window.launcher.remove(profile.id))));
    if (state.switching || launching) bottom.querySelectorAll('button').forEach(b => { b.disabled = true; });
    card.append(top, bottom); $('profiles').append(card);
  });
}
function editor(profile) { editing = profile?.id; $('dialog-title').textContent = editing ? 'Renomear perfil' : 'Novo perfil'; $('name').value = profile?.name || ''; $('editor').showModal(); $('name').focus(); }
$('add').onclick = () => editor();
$('cancel').onclick = () => $('editor').close();
$('choose').onclick = () => action(async () => { $('choose').disabled = true; try { render(await window.launcher.choose()); } finally { $('choose').disabled = false; } });
$('form').onsubmit = event => { event.preventDefault(); action(async () => { const submit = $('form').querySelector('[type="submit"]'); submit.disabled = true; try { render(editing ? await window.launcher.rename(editing, $('name').value) : await window.launcher.add($('name').value)); $('editor').close(); } finally { submit.disabled = false; } }); };
action(async () => render(await window.launcher.state()));

window.launcher.onProfilesChanged(() => action(async () => render(await window.launcher.state())));

let refreshing = false;
async function refreshSession() {
  if (document.hidden || refreshing || launching || $('editor').open) return;
  refreshing = true;
  try {
    const next = await window.launcher.state();
    if (JSON.stringify(next) !== JSON.stringify(state)) render(next);
  } catch (error) { console.warn(error.message); }
  finally { refreshing = false; }
}
window.addEventListener('focus', refreshSession);
document.addEventListener('visibilitychange', refreshSession);
setInterval(refreshSession, 3000);
