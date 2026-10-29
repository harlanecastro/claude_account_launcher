const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { AccountSwitcher } = require('../src/account-switcher');
async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'native-accounts-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const native = path.join(base,'Claude'), legacy=path.join(base,'legacy'), root=path.join(base,'saved');
  const profiles=[{id:'personal',name:'Pessoal'},{id:'work',name:'Trabalho'},{id:'new',name:'Nova'}];
  for(const [folder,account,content] of [[native,'account-a','original native work'],[path.join(legacy,'personal'),'account-a','old isolated work'],[path.join(legacy,'work'),'account-b','work history']]) {
    await fs.mkdir(folder,{recursive:true});
    await fs.writeFile(path.join(folder,'config.json'),JSON.stringify({lastKnownAccountUuid:account}));
    await fs.writeFile(path.join(folder,'history.txt'),content);
  }
  let running=true;
  const calls=[];
  const runtime={list:async()=>running?[{pid:10,relocated:false}]:[], stop:async()=>{calls.push('stop');running=false;}, start:async()=>{calls.push('start');running=true;}, focus:async()=>{calls.push('focus');return running;}};
  const manager=new AccountSwitcher({root,native,legacy,runtime});
  await manager.initialize(profiles);
  return {manager,profiles,root,native,legacy,runtime,calls,setRunning:v=>{running=v;}};
}
test('adopts native account, marks only the running account and reuses its window',async t=>{
  const f=await fixture(t);
  assert.equal(f.manager.data.activeId,'personal');
  assert.deepEqual((await f.manager.status(f.profiles)).map(p=>p.active),[true,false,false]);
  await f.manager.open('personal');
  assert.deepEqual(f.calls,['focus']);
  f.setRunning(false);
  assert.ok((await f.manager.status(f.profiles)).every(p=>!p.active));
  await f.manager.open('personal');
  assert.equal(f.calls.at(-1),'start');
});
test('switches whole directories only after shutdown and restores original native work',async t=>{
  const f=await fixture(t);
  await f.manager.open('work');
  assert.deepEqual(f.calls,['stop','start']);
  assert.equal(await fs.readFile(path.join(f.native,'history.txt'),'utf8'),'work history');
  assert.equal(await fs.readFile(path.join(f.legacy,'work/history.txt'),'utf8'),'work history','legacy stays intact');
  await fs.writeFile(path.join(f.native,'new-session.txt'),'new conversation');
  assert.deepEqual((await f.manager.status(f.profiles)).map(p=>p.active),[false,true,false]);
  await f.manager.open('personal');
  assert.equal(await fs.readFile(path.join(f.native,'history.txt'),'utf8'),'original native work');
  await f.manager.open('work');
  assert.equal(await fs.readFile(path.join(f.native,'new-session.txt'),'utf8'),'new conversation');
});
test('a new account starts empty without exposing another account session',async t=>{
  const f=await fixture(t);
  await f.manager.open('new');
  assert.deepEqual(await fs.readdir(f.native),[]);
  assert.equal(f.manager.data.activeId,'new');
  assert.deepEqual((await f.manager.status(f.profiles)).map(p=>p.active),[false,false,true]);
  await f.manager.open('personal');
  assert.equal(await fs.readFile(path.join(f.native,'history.txt'),'utf8'),'original native work');
});
test('refused shutdown and concurrent switches never replace live data',async t=>{
  const f=await fixture(t);
  f.runtime.stop=async()=>{throw Error('still running');};
  await assert.rejects(f.manager.open('work'),/still running/);
  assert.equal(await fs.readFile(path.join(f.native,'history.txt'),'utf8'),'original native work');
  f.manager.busy=true;
  await assert.rejects(f.manager.open('work'),/Aguarde/);
});
test('recovers a crash between directory moves and finalizes a completed move',async t=>{
  const f=await fixture(t);
  f.setRunning(false);
  const previous=path.join(f.root,'previous'), target=path.join(f.root,'target');
  await fs.cp(path.join(f.legacy,'work'),target,{recursive:true});
  f.manager.data.transaction={fromId:'personal',toId:'work',previous,target,hadNative:true};
  await f.manager.save();
  await fs.rename(f.native,previous);
  const recovered=new AccountSwitcher({root:f.root,native:f.native,legacy:f.legacy,runtime:f.runtime});
  await recovered.initialize(f.profiles);
  assert.equal(await fs.readFile(path.join(f.native,'history.txt'),'utf8'),'original native work');
  assert.equal(recovered.data.activeId,'personal');
  recovered.data.transaction={fromId:'personal',toId:'work',previous,target,hadNative:true};
  await recovered.save();
  await fs.rename(f.native,previous);
  await fs.rename(target,f.native);
  const completed=new AccountSwitcher({root:f.root,native:f.native,legacy:f.legacy,runtime:f.runtime});
  await completed.initialize(f.profiles);
  assert.equal(completed.data.activeId,'work');
  assert.equal(completed.data.stores.personal,previous);
});
test('unfinished switch refuses recovery while Claude is running',async t=>{
  const f=await fixture(t);
  f.manager.data.transaction={fromId:'personal',toId:'work',previous:path.join(f.root,'previous'),target:path.join(f.root,'target'),hadNative:true};
  await f.manager.save();
  const recovered=new AccountSwitcher({root:f.root,native:f.native,legacy:f.legacy,runtime:f.runtime});
  await assert.rejects(recovered.initialize(f.profiles),/Saia do Claude/);
});
test('metadata survives restart and an account opened directly is marked correctly',async t=>{
  const f=await fixture(t);
  await f.manager.open('work');
  const restarted=new AccountSwitcher({root:f.root,native:f.native,legacy:f.legacy,runtime:f.runtime});
  await restarted.initialize(f.profiles);
  assert.equal(restarted.data.activeId,'work');
  assert.equal((await restarted.status(f.profiles)).find(p=>p.id==='work').active,true);
  await restarted.open('personal');
  assert.equal(await fs.readFile(path.join(f.native,'history.txt'),'utf8'),'original native work');
});
test('in-flight metadata writes are serialized',async t=>{
  const f=await fixture(t);
  f.manager.data.activeId='work';
  const first=f.manager.save();
  f.manager.data.activeId='personal';
  const second=f.manager.save();
  await Promise.all([first,second]);
  assert.equal(JSON.parse(await fs.readFile(f.manager.file,'utf8')).activeId,'personal');
});
test('a Claude restart during preparation cancels the directory swap',async t=>{
  const f=await fixture(t);
  let polls=0;
  f.runtime.stop=async()=>{};
  f.runtime.list=async()=>++polls===2?[]:[{pid:10,relocated:false}];
  await assert.rejects(f.manager.open('work'),/reaberto durante/);
  assert.equal(await fs.readFile(path.join(f.native,'history.txt'),'utf8'),'original native work');
});
