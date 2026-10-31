// The same room chat survives lobby redraws and follows its WebSocket into play.
// Only server messages are rendered; names and text are always textContent.
(() => {
  let client, unsubscribe, roomId, selfId, panel, log, input, form, status, toggle, channelLabel;
  let channel = 'team', teamAllowed = false;
  let opened = false, composing = false, sending = false, previousFocus, restorePointer = false, fadeTimer, retry, generation = 0;
  const messages = new Map();
  const inGame = !!document.getElementById('renderCanvas');
  const editable = target => target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])');

  function mount() {
    if (panel) return;
    panel = document.createElement('section');
    panel.id = 'room-chat'; panel.hidden = true;
    panel.className = inGame ? 'room-chat in-game' : 'room-chat';
    panel.setAttribute('aria-label', 'Trò chuyện trong phòng');
    panel.innerHTML = '<button type="button" class="room-chat-toggle" aria-expanded="false" aria-controls="room-chat-form"><kbd>T</kbd> <span>CHAT PHÒNG</span><span class="room-chat-audience"></span></button><div class="room-chat-log" role="log" aria-label="Tin nhắn trong phòng" aria-live="polite" aria-relevant="additions text"></div><form id="room-chat-form" hidden autocomplete="off"><div class="room-chat-channels" role="group" aria-label="Chọn kênh chat"><button type="button" data-chat-channel="team" aria-pressed="true">ĐỘI</button><button type="button" data-chat-channel="all" aria-pressed="false">TẤT CẢ</button></div><label class="room-chat-label" for="room-chat-input">ĐỘI</label><input id="room-chat-input" maxlength="280" placeholder="Nhắn cho đồng đội…" aria-label="Tin nhắn cho đồng đội" autocomplete="off" spellcheck="false"><button type="submit" class="room-chat-send" aria-label="Gửi tin nhắn">↵</button><span class="room-chat-help">Enter gửi · Shift + Enter: All · /team, /all · Esc đóng</span></form><p class="room-chat-status" role="status" hidden></p>';
    (document.fullscreenElement || document.body).appendChild(panel);
    log = panel.querySelector('.room-chat-log');
    input = panel.querySelector('input'); form = panel.querySelector('form');
    status = panel.querySelector('.room-chat-status'); toggle = panel.querySelector('.room-chat-toggle');
    channelLabel = panel.querySelector('.room-chat-label');
    toggle.onclick = () => opened ? close() : open();
    form.onsubmit = event => { event.preventDefault(); send(); };
    panel.querySelectorAll('[data-chat-channel]').forEach(button => button.onclick = () => {
      selectChannel(button.dataset.chatChannel); input.focus({ preventScroll: true });
    });
    input.addEventListener('input', () => { if (!composing) parseChannelCommand(false); });
    input.addEventListener('compositionstart', () => composing = true);
    input.addEventListener('compositionend', () => composing = false);
  }

  function drawChannel() {
    if (!panel) return;
    const all = channel === 'all', label = all ? 'TẤT CẢ' : 'ĐỘI';
    panel.dataset.channel = channel;
    panel.querySelector('.room-chat-audience').textContent = label;
    channelLabel.textContent = label;
    input.placeholder = all ? 'Nhắn cho mọi người trong phòng…' : 'Nhắn cho đồng đội…';
    input.setAttribute('aria-label', all ? 'Tin nhắn cho mọi người trong phòng' : 'Tin nhắn chỉ cho đồng đội');
    panel.querySelectorAll('[data-chat-channel]').forEach(button => {
      button.disabled = button.dataset.chatChannel === 'team' && !teamAllowed;
      button.title = button.disabled ? 'Deathmatch và người quan sát chỉ dùng chat tất cả.' : button.dataset.chatChannel === 'team' ? 'Chỉ đồng đội nhận được tin nhắn' : 'Mọi người trong phòng nhận được tin nhắn';
      button.setAttribute('aria-pressed', String(button.dataset.chatChannel === channel));
    });
  }
  function selectChannel(next) {
    if (next === 'team' && !teamAllowed) { notice('Chế độ này chỉ dùng chat tất cả.'); return false; }
    channel = next; drawChannel(); notice(); return true;
  }
  function parseChannelCommand(submit) {
    const command = /^\/(all|team)(?:\s+|$)/i.exec(input.value);
    if (!command || (!submit && !/\s$/.test(command[0]))) return true;
    if (!selectChannel(command[1].toLowerCase())) return false;
    input.value = input.value.slice(command[0].length);
    return true;
  }

  function recent() {
    if (!panel) return;
    clearTimeout(fadeTimer); panel.classList.add('recent');
    fadeTimer = setTimeout(() => panel?.classList.remove('recent'), 9000);
  }
  function notice(text = '') {
    status.textContent = text; status.hidden = !text;
    if (text) recent();
  }
  function connected() {
    if (!panel || !roomId) return;
    panel.querySelector('.room-chat-send').disabled = !client?.connected || sending;
    if (!client?.connected) notice('Đang kết nối lại…');
    else if (status.textContent === 'Đang kết nối lại…') notice();
  }
  function render() {
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 35;
    log.setAttribute('aria-busy', 'true');
    for (const row of [...log.children]) if (!messages.has(Number(row.dataset.messageId))) row.remove();
    for (const message of messages.values()) {
      if (log.querySelector('[data-message-id="' + message.id + '"]')) continue;
      const row = document.createElement('div'); row.className = 'room-chat-message';
      row.dataset.messageId = String(message.id);
      row.dataset.channel = message.channel || 'all';
      row.classList.toggle('self', message.player === selfId);
      const badge = document.createElement('span'), name = document.createElement('strong'), text = document.createElement('span');
      badge.className = 'room-chat-tag'; badge.textContent = message.channel === 'team' ? '[Đội] ' : '[Tất cả] ';
      name.textContent = message.name + ': ';
      text.textContent = message.text;
      row.append(badge, name, text);
      row.title = new Date(message.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      log.appendChild(row);
    }
    log.setAttribute('aria-busy', 'false');
    if (!opened || atBottom) log.scrollTop = log.scrollHeight;
  }
  function receive(message) {
    if (!message || !Number.isSafeInteger(message.id) || messages.has(message.id) || typeof message.text !== 'string') return false;
    messages.set(message.id, message);
    while (messages.size > 100) messages.delete(messages.keys().next().value);
    return true;
  }
  function update(data) {
    if (data.type === 'room') {
      mount();
      if (roomId !== data.room.id) {
        reset(); roomId = data.room.id;
      }
      selfId = data.self; panel.hidden = false;
      teamAllowed = (data.room.gameMode || data.room.mode) !== 'deathmatch' && ['a', 'b'].includes(data.room.members.find(member => member.id === selfId)?.team);
      if (!teamAllowed && !input.value) channel = 'all';
      drawChannel();
      panel.classList.toggle('selecting', ['selecting', 'revealing', 'loading'].includes(data.room.phase));
      connected();
    }
    if (data.type === 'chatHistory' && data.room === roomId && Array.isArray(data.messages)) {
      let changed = false;
      for (const message of data.messages) changed = receive(message) || changed;
      if (changed) { render(); recent(); }
    }
    if (data.type === 'chat' && data.room === roomId && receive(data.message)) { render(); recent(); }
    if (data.type === 'connection') connected();
    if (data.type === 'left') reset();
  }
  function open(requestedChannel) {
    if (!client || !roomId || panel?.hidden) return;
    if (opened) { if (requestedChannel) selectChannel(requestedChannel); return; }
    // T defaults to Team. Preserved drafts keep their channel; only an explicit
    // channel shortcut/button changes who will receive an existing draft.
    if (requestedChannel) selectChannel(requestedChannel === 'team' && !teamAllowed ? 'all' : requestedChannel);
    else if (!input.value) selectChannel(teamAllowed ? 'team' : 'all');
    previousFocus = document.activeElement;
    restorePointer = inGame && !!window.__gamePlaying && !!document.fullscreenElement;
    if (window.playerController) {
      const hadCursor = window.__agentCursorMode;
      window.uiCloseAll?.(false);
      if (hadCursor) window.agentCancelEquip?.();
    }
    window.playerController?.stop();
    const board = document.getElementById('match-scoreboard'); if (board) board.hidden = true;
    // Keep pointer lock and the running match. Only the local input is blocked.
    opened = true; panel.classList.add('open'); form.hidden = false;
    toggle.setAttribute('aria-expanded', 'true'); connected();
    input.focus({ preventScroll: true }); log.scrollTop = log.scrollHeight;
  }
  function close(restoreFocus = true) {
    if (!opened) return;
    opened = false; composing = false; panel.classList.remove('open'); form.hidden = true;
    toggle.setAttribute('aria-expanded', 'false'); recent();
    window.playerController?.stop();
    if (restoreFocus) {
      const target = inGame && window.__gamePlaying ? document.getElementById('renderCanvas') : previousFocus;
      if (target?.isConnected) target.focus({ preventScroll: true });
      if (restorePointer && window.__gamePlaying && document.fullscreenElement && !document.pointerLockElement && !window.__agentCursorMode) {
        try { Promise.resolve(target?.requestPointerLock()).catch(() => {}); } catch {}
      }
    }
    restorePointer = false;
  }
  async function send() {
    if (composing || sending || !parseChannelCommand(true)) return;
    const text = input.value.trim();
    if (!text) return;
    if (channel === 'team' && !teamAllowed) { notice('Hãy chọn TẤT CẢ để gửi trong chế độ này.'); return; }
    if (!client?.connected) { notice('Đang kết nối lại…'); return; }
    const sender = client, targetRoom = roomId, currentGeneration = generation, sentChannel = channel;
    const clientId = retry?.text === text && retry.channel === sentChannel ? retry.clientId : crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
    retry = { text, clientId, channel: sentChannel }; sending = true; input.value = ''; notice(); close(); connected();
    let result;
    try { result = await sender.command('chat', { text, clientId, channel: sentChannel }); }
    catch { result = { ok: false, message: 'Không gửi được tin nhắn. Nhấn T để thử lại.' }; }
    if (generation !== currentGeneration || client !== sender || roomId !== targetRoom) return;
    sending = false;
    if (result.ok) retry = null;
    else {
      if (!input.value) { input.value = text; channel = sentChannel; drawChannel(); }
      notice(result.message || 'Chưa gửi được tin nhắn. Nhấn T để thử lại.');
    }
    connected();
  }
  function reset() {
    close(false); roomId = selfId = null; messages.clear(); retry = null; sending = false; channel = 'team'; teamAllowed = false; generation++;
    clearTimeout(fadeTimer);
    if (panel) { input.value = ''; log.replaceChildren(); panel.hidden = true; notice(); }
  }
  window.VSChat = {
    bind(next) {
      if (client === next) return;
      unsubscribe?.(); reset(); client = next; unsubscribe = client.on(update);
    },
    unbind(previous) {
      if (previous !== client) return;
      unsubscribe?.(); unsubscribe = null; client = null; reset();
    },
    close,
    get isOpen() { return opened; }
  };

  // Capture before gameplay handlers: typing must never switch a gun, cast,
  // move the player, open the scoreboard or turn Esc into the pause action.
  window.addEventListener('keydown', event => {
    if (opened) {
      event.stopImmediatePropagation();
      if (event.isComposing || composing || event.keyCode === 229) return;
      if (event.code === 'Escape') { event.preventDefault(); close(); }
      else if (event.code === 'Enter' || event.code === 'NumpadEnter') {
        event.preventDefault();
        if (event.shiftKey) selectChannel('all');
        else if (event.target.closest?.('[data-chat-channel]')) { selectChannel(event.target.closest('[data-chat-channel]').dataset.chatChannel); input.focus({ preventScroll: true }); }
        else if (event.target === toggle) close();
        else send();
      }
      else if (event.code === 'Tab') {
        event.preventDefault();
        const controls = [toggle, ...panel.querySelectorAll('[data-chat-channel]'), input, panel.querySelector('.room-chat-send')].filter(node => !node.disabled);
        const index = controls.indexOf(document.activeElement), direction = event.shiftKey ? -1 : 1;
        controls[(index + direction + controls.length) % controls.length].focus({ preventScroll: true });
      }
      return;
    }
    const enter = event.code === 'Enter' || event.code === 'NumpadEnter';
    if ((!enter && event.code !== 'KeyT') || event.repeat || event.ctrlKey || event.altKey || event.metaKey || editable(event.target) || !roomId || panel?.hidden) return;
    // Let Enter activate lobby buttons and links when they have keyboard focus.
    if (enter && !event.shiftKey && event.target.closest?.('button,a,[role="button"]')) return;
    event.preventDefault(); event.stopImmediatePropagation(); open(event.shiftKey ? 'all' : enter ? 'team' : undefined);
  }, true);
  window.addEventListener('keyup', event => { if (opened) event.stopImmediatePropagation(); }, true);
  for (const type of ['pointerdown', 'pointerup', 'click', 'contextmenu']) {
    window.addEventListener(type, event => {
      if (!opened) return;
      if (panel.contains(event.target)) return;
      if (document.pointerLockElement) {
        event.preventDefault(); event.stopImmediatePropagation(); input.focus({ preventScroll: true });
      } else close(false);
    }, true);
  }
  window.addEventListener('blur', () => close(false));
  document.addEventListener('visibilitychange', () => { if (document.hidden) close(false); });
  document.addEventListener('fullscreenchange', () => {
    close(false);
    if (panel) (document.fullscreenElement || document.body).appendChild(panel);
  });
  window.addEventListener('pagehide', () => { unsubscribe?.(); reset(); });
})();
