const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { isAuthenticated } = require('./profile-session');
async function exists(file) { try { await fs.access(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
async function identity(directory) {
  try { return JSON.parse(await fs.readFile(path.join(directory, 'config.json'), 'utf8')).lastKnownAccountUuid || null; }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
class AccountSwitcher {
  constructor({ root, native, legacy, runtime }) {
    Object.assign(this, { root, native, legacy, runtime });
    this.file = path.join(root, 'state.json');
    this.data = { activeId: null, stores: {}, identities: {} };
    this.busy = false;
    this.saveQueue = Promise.resolve();
  }
  async save() {
    const content = JSON.stringify(this.data, null, 2);
    this.saveQueue = this.saveQueue.catch(() => {}).then(async () => {
      await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
      await fs.writeFile(this.file + '.tmp', content, { mode: 0o600 });
      await fs.rename(this.file + '.tmp', this.file);
    });
    return this.saveQueue;
  }
  async initialize(profiles) {
    try { this.data = JSON.parse(await fs.readFile(this.file, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (this.data.transaction) {
      // Recovery happens only with Claude closed; never rename a live data folder.
      if ((await this.runtime.list()).length) throw new Error('Uma troca foi interrompida. Saia do Claude e reabra o launcher para recuperar os dados.');
      await this.recover();
    }
    for (const profile of profiles) {
      if (!this.data.identities[profile.id]) this.data.identities[profile.id] = await identity(path.join(this.legacy, profile.id));
    }
    await this.reconcile(profiles);
    await this.save();
  }
  async reconcile(profiles) {
    if (this.busy) return;
    const before = JSON.stringify(this.data);
    const account = await identity(this.native);
    if (this.busy) return;
    if (account) {
      const matching = profiles.find(p => this.data.identities[p.id] === account);
      if (matching) this.data.activeId = matching.id;
      else if (this.data.activeId && profiles.some(p => p.id === this.data.activeId)) this.data.identities[this.data.activeId] = account;
      else if (isAuthenticated(this.native)) {
        const entry = { id: randomUUID(), name: 'Conta atual do Claude', lastOpened: null };
        profiles.push(entry);
        this.data.activeId = entry.id;
        this.data.identities[entry.id] = account;
      }
    }
    // activeId records the owner of the native directory, including before login.
    if (JSON.stringify(this.data) !== before) await this.save();
  }
  directory(id) {
    if (id === this.data.activeId) return this.native;
    return this.data.stores[id] || path.join(this.legacy, id);
  }
  async status(profiles) {
    if (!this.busy) await this.reconcile(profiles);
    const running = (await this.runtime.list()).some(p => !p.relocated);
    return profiles.map(profile => ({ ...profile, authenticated: isAuthenticated(this.directory(profile.id)), active: running && profile.id === this.data.activeId }));
  }
  async recover() {
    const tx = this.data.transaction;
    if (!tx) return;
    const nativeExists = await exists(this.native), targetExists = await exists(tx.target);
    if (!targetExists && nativeExists) {
      // Target has reached the native path; complete the metadata commit.
      if (tx.hadNative && tx.fromId) this.data.stores[tx.fromId] = tx.previous;
      delete this.data.stores[tx.toId];
      this.data.activeId = tx.toId;
    } else if (!nativeExists && await exists(tx.previous)) {
      await fs.rename(tx.previous, this.native);
    } else if (!nativeExists && tx.hadNative) {
      throw new Error('Recuperação pendente: a pasta anterior do Claude não foi encontrada. Os arquivos foram preservados.');
    }
    delete this.data.transaction;
    try { await this.save(); }
    catch (error) { this.data.transaction = tx; throw error; }
  }
  async open(id) {
    if (this.busy) throw new Error('Aguarde a troca de conta em andamento.');
    this.busy = true;
    try {
      const processes = await this.runtime.list();
      if (id === this.data.activeId && !processes.some(p => p.relocated)) {
        if (!await this.runtime.focus()) await this.runtime.start();
        return;
      }
      await this.runtime.stop();
      // Recheck after graceful shutdown, before touching either directory.
      if ((await this.runtime.list()).length) throw new Error('O Claude precisa estar fechado para trocar de conta.');
      if (id !== this.data.activeId) {
        await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
        let target = this.data.stores[id];
        if (!target) {
          target = path.join(this.root, `${id}-${randomUUID()}`);
          const old = path.join(this.legacy, id);
          if (await exists(old)) {
            // Old isolated profiles remain intact for recovery.
            await fs.cp(old, target, { recursive: true, force: false, errorOnExist: true,
              filter: source => !['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'DevToolsActivePort'].includes(path.basename(source)) });
          } else await fs.mkdir(target, { mode: 0o700 });
        }
        if ((await this.runtime.list()).length) throw new Error('O Claude foi reaberto durante a preparação. Nenhum dado foi trocado; saia dele e tente novamente.');
        const tx = { fromId: this.data.activeId, toId: id, previous: path.join(this.root, `saved-${randomUUID()}`), target, hadNative: await exists(this.native) };
        this.data.transaction = tx;
        await this.save();
        try {
          if (tx.hadNative) await fs.rename(this.native, tx.previous);
          await fs.mkdir(path.dirname(this.native), { recursive: true });
          await fs.rename(target, this.native);
          await this.recover();
        } catch (error) {
          await this.recover();
          throw error;
        }
      }
      await this.runtime.start();
    } finally { this.busy = false; }
  }
}
module.exports = { AccountSwitcher, identity };
