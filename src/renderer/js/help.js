'use strict';
/* "Where to get these gems": the gems of the overlay list, each with the quest and NPC. */
(function () {
  const api = window.helpApi;
  const list = document.getElementById('list');

  function el(tag, props = {}, children = []) {
    const node = Object.assign(document.createElement(tag), props);
    for (const c of [].concat(children)) node.append(c);
    return node;
  }

  function lines(g) {
    const s = g.source;
    if (!s) return [el('p', { textContent: `It is in your route after ${g.area}, but no quest there gives it to your class. The wiki says where it drops or who sells it.` })];
    if (s.how === 'reward') {
      return [
        el('p', { textContent: `Free reward of the quest ${s.quest}: talk to ${s.npc} in ${s.where}.` }),
        el('p', { className: 'task', textContent: s.task }),
      ];
    }
    return [
      el('p', { textContent: `Sold by ${s.npc} in ${s.where} once the quest ${s.quest} is done.` }),
      el('p', { className: 'task', textContent: s.task }),
    ];
  }

  async function render() {
    const { className, gems } = await api.get();
    document.getElementById('intro').textContent = className ? `For a ${className}.` : 'No class known: import a PoB build in the route window to get class-specific help.';
    list.textContent = '';
    if (gems.length === 0) {
      list.append(el('p', { className: 'empty', textContent: 'There is nothing to buy right now.' }));
      return;
    }
    for (const g of gems) {
      const how = g.source ? g.source.how : null;
      const title = el('h2', {}, [el('span', { className: 'dot ' + g.color }), g.name]);
      if (how) title.append(el('span', { className: 'how ' + how, textContent: how === 'reward' ? 'free' : 'buy' }));
      const item = el('section', { className: 'gem' }, [title, ...lines(g)]);
      if (g.wiki) {
        const wiki = el('button', { className: 'wiki', textContent: 'Open the wiki page' });
        wiki.addEventListener('click', () => api.openWiki(g.name));
        item.append(wiki);
      }
      list.append(item);
    }
  }

  let queued = false;
  api.onChange(() => {
    if (queued) return;
    queued = true;
    setTimeout(() => { queued = false; render(); }, 200);
  });
  render();
})();
