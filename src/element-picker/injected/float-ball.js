(function () {
  "use strict";

  const CONFIG = {
    wsPort: "__WS_PORT__",
    wsToken: "__WS_TOKEN__",
    mode: "__MODE__",  // "agent" | "standalone"
  };

  if (window.__selectorFinderActive) return;
  window.__selectorFinderActive = true;

  // --- Utility functions (defined early so iframes can use them) ---
  function getElementInfo(el) {
    const attrs = {};
    for (const attr of el.attributes) attrs[attr.name] = attr.value;
    const path = [];
    let cur = el;
    for (let i = 0; i < 4 && cur && cur !== document.body; i++) {
      const tag = cur.tagName.toLowerCase();
      const id = cur.id ? '#' + cur.id : '';
      const cls = cur.classList.length ? '.' + [...cur.classList].join('.') : '';
      path.unshift(tag + id + cls);
      cur = cur.parentElement;
    }
    const frameChain = [];
    let win = window;
    while (win !== win.top) {
      try {
        const f = win.frameElement;
        if (f) frameChain.unshift({ tagName: f.tagName.toLowerCase(), name: f.name || null, id: f.id || null, src: f.src || null });
      } catch { break; }
      win = win.parent;
    }
    return {
      tagName: el.tagName.toLowerCase(),
      id: el.id || null,
      role: el.getAttribute('role') || null,
      ariaLabel: el.getAttribute('aria-label') || null,
      classList: [...el.classList],
      attributes: attrs,
      textContent: (el.textContent || '').trim().slice(0, 100),
      parentPath: path.join(' > '),
      outerHTML: el.outerHTML.slice(0, 500),
      frameChain: frameChain.length > 0 ? frameChain : null,
    };
  }

  // --- Iframe relay: if running in an iframe, highlight + relay clicks to top frame ---
  const isTopFrame = window === window.top;
  if (!isTopFrame) {
    const iframeOverlay = document.createElement('div');
    iframeOverlay.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #0969da;border-radius:3px;background:rgba(9,105,218,0.1);z-index:2147483647;transition:all 0.05s ease;display:none;';
    document.body.appendChild(iframeOverlay);

    document.addEventListener('mouseover', (e) => {
      const rect = e.target.getBoundingClientRect();
      iframeOverlay.style.display = 'block';
      iframeOverlay.style.top = rect.top + 'px';
      iframeOverlay.style.left = rect.left + 'px';
      iframeOverlay.style.width = rect.width + 'px';
      iframeOverlay.style.height = rect.height + 'px';
    }, true);

    document.addEventListener('mouseout', () => {
      iframeOverlay.style.display = 'none';
    }, true);

    document.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const info = getElementInfo(e.target);
      try {
        window.top.postMessage({
          type: '__selector-finder-iframe-click',
          info,
        }, '*');
      } catch {}
    }, true);

    return; // Don't create float ball/panel in iframes
  }

  // --- Shadow DOM Host ---
  const host = document.createElement('div');
  host.id = '__selector-finder-host';
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;';
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'closed' });

  // --- Styles ---
  const style = document.createElement('style');
  style.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .sf-ball {
      position: fixed; bottom: 24px; right: 24px;
      width: 48px; height: 48px; border-radius: 50%;
      background: #0969da; color: #fff; border: none;
      cursor: grab; display: flex; align-items: center; justify-content: center;
      font-size: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      transition: transform 0.15s, background 0.15s;
      user-select: none;
    }
    .sf-ball:hover { transform: scale(1.1); }
    .sf-ball.active { background: #1a7f37; }
    .sf-panel {
      position: fixed; bottom: 80px; right: 24px;
      width: 380px; max-height: 480px; overflow-y: auto;
      background: #fff; border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18);
      font: 13px/1.5 -apple-system, 'Segoe UI', sans-serif;
      color: #24292f; display: none; padding: 0;
    }
    .sf-panel.open { display: block; }
    .sf-panel-header {
      padding: 12px 16px; border-bottom: 1px solid #d0d7de;
      font-weight: 600; font-size: 14px;
      display: flex; justify-content: space-between; align-items: center;
    }
    .sf-panel-body { padding: 12px 16px; }
    .sf-element-info {
      background: #f6f8fa; border-radius: 6px; padding: 8px 12px;
      font-family: 'Fira Code', monospace; font-size: 12px;
      margin-bottom: 12px; word-break: break-all;
    }
    .sf-selector-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 0; border-bottom: 1px solid #f0f0f0;
    }
    .sf-selector-row:last-child { border-bottom: none; }
    .sf-selector-text {
      font-family: 'Fira Code', monospace; font-size: 12px;
      flex: 1; margin-right: 8px; word-break: break-all;
    }
    .sf-btn {
      padding: 4px 10px; border-radius: 6px; border: 1px solid #d0d7de;
      background: #fff; color: #24292f; cursor: pointer; font-size: 12px;
      margin-left: 4px; white-space: nowrap;
    }
    .sf-btn:hover { background: #f3f4f6; }
    .sf-btn.primary { background: #0969da; color: #fff; border-color: #0969da; }
    .sf-btn.primary:hover { background: #0860c4; }
    .sf-btn.select-btn { background: #1a7f37; color: #fff; border-color: #1a7f37; }
    .sf-btn.select-btn:hover { background: #157a2f; }
    .sf-btn.analyze {
      background: #0969da; color: #fff; border-color: #0969da;
      width: 100%; padding: 8px; font-size: 13px; margin-top: 8px;
    }
    .sf-btn.analyze:hover { background: #0860c4; }
    .sf-overlay {
      position: fixed; pointer-events: none;
      border: 2px solid #0969da; border-radius: 3px;
      background: rgba(9,105,218,0.1);
      z-index: 2147483646; transition: all 0.05s ease; display: none;
    }
    .sf-status {
      padding: 8px 16px; font-size: 12px; color: #656d76;
      text-align: center; border-top: 1px solid #d0d7de;
    }
  `;
  shadow.appendChild(style);

  // --- Overlay (highlight on hover) ---
  const overlay = document.createElement('div');
  overlay.className = 'sf-overlay';
  shadow.appendChild(overlay);

  // --- Float Ball ---
  const ball = document.createElement('button');
  ball.className = 'sf-ball';
  ball.textContent = '\uD83C\uDFAF';
  ball.title = 'Selector Finder';
  shadow.appendChild(ball);

  // --- Panel ---
  const panel = document.createElement('div');
  panel.className = 'sf-panel';
  panel.innerHTML = `
    <div class="sf-panel-header">
      <span>Selector Finder</span>
    </div>
    <div class="sf-panel-body">
      <div id="picker-hint" style="display:none; padding:8px 12px; background:#fff3cd; color:#664d03; border-radius:6px; margin-bottom:8px; font-size:13px;"></div>
      <div class="sf-element-info" style="display:none"></div>
      <div class="sf-selectors"></div>
    </div>
    <div class="sf-status">Picker mode: inactive</div>
  `;
  shadow.appendChild(panel);

  const elementInfo = panel.querySelector('.sf-element-info');
  const selectorsContainer = panel.querySelector('.sf-selectors');
  const statusBar = panel.querySelector('.sf-status');

  // --- State ---
  let pickerActive = false;
  let panelOpen = false;
  let pendingElementInfo = null;

  // --- WebSocket ---
  let ws = null;
  function connectWs() {
    ws = new WebSocket(`ws://127.0.0.1:${CONFIG.wsPort}?token=${CONFIG.wsToken}`);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'status-update':
            statusBar.textContent = msg.payload.text || '';
            break;

          case 'selector-loading':
            selectorsContainer.innerHTML = '<div style="text-align:center;padding:20px;color:#656d76;">Analyzing element...</div>';
            break;

          case 'selector-results':
            renderSelectors(pendingElementInfo, msg.payload.selectors);
            break;

          case 'selector-error': {
            const errDiv = document.createElement('div');
            errDiv.style.cssText = 'text-align:center;padding:20px;color:#d1242f;';
            errDiv.textContent = 'Error: ' + (msg.payload.message || 'Unknown error');
            selectorsContainer.innerHTML = '';
            selectorsContainer.appendChild(errDiv);
            break;
          }

          case 'activate-picker':
            togglePicker(true);
            if (msg.payload && msg.payload.hint) {
              const hintEl = shadow.getElementById('picker-hint');
              if (hintEl) {
                hintEl.textContent = '\uD83C\uDFAF ' + msg.payload.hint;
                hintEl.style.display = 'block';
              }
            }
            break;

          case 'deactivate-picker': {
            togglePicker(false);
            const hintEl2 = shadow.getElementById('picker-hint');
            if (hintEl2) hintEl2.style.display = 'none';
            break;
          }
        }
      } catch {}
    };
    ws.onclose = () => { setTimeout(connectWs, 2000); };
    ws.onerror = () => {};
  }
  connectWs();

  // Top frame listens for iframe relay
  window.addEventListener('message', (e) => {
    if (e.data?.type === '__selector-finder-iframe-click') {
      pendingElementInfo = e.data.info;
      showPendingConfirm(e.data.info);
      if (!panelOpen) {
        panelOpen = true;
        panel.classList.add('open');
      }
    }
  });

  function wsSend(type, payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload }));
    }
  }

  function showLoading(info) {
    elementInfo.style.display = 'block';
    elementInfo.textContent = `<${info.tagName}${info.id ? ' id="'+info.id+'"' : ''}${info.classList.length ? ' class="'+info.classList.join(' ')+'"' : ''}>`;
    statusBar.textContent = info.tagName + (info.id ? '#'+info.id : '');
    selectorsContainer.innerHTML = '<div style="text-align:center;padding:20px;color:#656d76;">Analyzing element...</div>';
  }

  function showPendingConfirm(info) {
    elementInfo.style.display = 'block';
    elementInfo.textContent = `<${info.tagName}${info.id ? ' id="'+info.id+'"' : ''}${info.classList.length ? ' class="'+info.classList.join(' ')+'"' : ''}>`;
    statusBar.textContent = info.tagName + (info.id ? '#'+info.id : '');

    selectorsContainer.innerHTML = '';

    const details = document.createElement('div');
    details.style.cssText = 'font-size:12px;color:#656d76;margin-bottom:8px;';
    const lines = [];
    if (info.id) lines.push('ID: ' + info.id);
    if (info.classList.length) lines.push('Class: ' + info.classList.join(' '));
    if (info.role) lines.push('Role: ' + info.role);
    if (info.textContent) lines.push('Text: ' + info.textContent.slice(0, 60));
    details.textContent = lines.join(' \u00B7 ') || 'No identifying attributes';
    selectorsContainer.appendChild(details);

    const analyzeBtn = document.createElement('button');
    analyzeBtn.className = 'sf-btn analyze';
    analyzeBtn.textContent = 'Analyze';
    analyzeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!pendingElementInfo) return;
      showLoading(pendingElementInfo);
      wsSend('element-selected', { info: pendingElementInfo });
    });
    selectorsContainer.appendChild(analyzeBtn);
  }

  // --- Float Ball: Toggle ---
  ball.addEventListener('click', (e) => {
    e.stopPropagation();
    panelOpen = !panelOpen;
    panel.classList.toggle('open', panelOpen);
    if (panelOpen && !pickerActive) {
      togglePicker(true);
    }
  });

  // --- Float Ball: Drag ---
  let dragging = false, dragX, dragY, ballX, ballY;
  ball.addEventListener('mousedown', (e) => {
    dragging = true;
    dragX = e.clientX;
    dragY = e.clientY;
    const rect = ball.getBoundingClientRect();
    ballX = rect.left;
    ballY = rect.top;
    ball.style.cursor = 'grabbing';
  });
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragX;
    const dy = e.clientY - dragY;
    ball.style.position = 'fixed';
    ball.style.left = (ballX + dx) + 'px';
    ball.style.top = (ballY + dy) + 'px';
    ball.style.right = 'auto';
    ball.style.bottom = 'auto';
  });
  document.addEventListener('mouseup', () => {
    dragging = false;
    ball.style.cursor = 'grab';
  });

  // --- Picker Mode ---
  function togglePicker(on) {
    pickerActive = on;
    ball.classList.toggle('active', on);
    statusBar.textContent = on ? 'Picker mode: active \u2014 click an element' : 'Picker mode: inactive';
    if (!on) overlay.style.display = 'none';
  }

  // --- Element Picker Events (on document, not shadow) ---
  function renderSelectors(info, selectors) {
    if (!info) return;
    elementInfo.style.display = 'block';
    elementInfo.textContent = `<${info.tagName}${info.id ? ' id="'+info.id+'"' : ''}${info.classList.length ? ' class="'+info.classList.join(' ')+'"' : ''}>`;
    statusBar.textContent = info.tagName + (info.id ? '#'+info.id : '');

    selectorsContainer.innerHTML = '';
    selectors.forEach((s) => {
      const row = document.createElement('div');
      row.className = 'sf-selector-row';
      row.style.flexDirection = 'column';
      row.style.alignItems = 'stretch';

      const topRow = document.createElement('div');
      topRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;';

      const selectorText = document.createElement('div');
      selectorText.className = 'sf-selector-text';
      selectorText.textContent = s.selector;

      const btnGroup = document.createElement('div');
      btnGroup.style.cssText = 'display:flex;gap:4px;flex-shrink:0;';

      const copyBtn = document.createElement('button');
      copyBtn.className = 'sf-btn';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(s.selector);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => copyBtn.textContent = 'Copy', 1500);
      });

      btnGroup.appendChild(copyBtn);

      // Replace button: only shown in standalone mode
      if (CONFIG.mode !== 'agent') {
        const replaceBtn = document.createElement('button');
        replaceBtn.className = 'sf-btn primary';
        replaceBtn.textContent = 'Replace';
        replaceBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          wsSend('selector-chosen', {
            action: 'replace-selection',
            selector: s.selector,
            selectorType: s.type,
            elementInfo: info,
          });
          replaceBtn.textContent = 'Sent!';
          setTimeout(() => replaceBtn.textContent = 'Replace', 1500);
        });
        btnGroup.appendChild(replaceBtn);
      }

      // Select button: only shown in agent mode
      if (CONFIG.mode === 'agent') {
        const selectBtn = document.createElement('button');
        selectBtn.textContent = 'Select';
        selectBtn.className = 'sf-btn select-btn';
        selectBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          wsSend('selector-chosen', {
            action: 'select',
            selector: s.selector,
            type: s.type,
            elementInfo: info,
          });
          selectBtn.textContent = 'Sent!';
          setTimeout(() => selectBtn.textContent = 'Select', 1500);
        });
        btnGroup.appendChild(selectBtn);
      }

      topRow.appendChild(selectorText);
      topRow.appendChild(btnGroup);

      const reasonEl = document.createElement('div');
      reasonEl.style.cssText = 'font-size:11px;color:#656d76;margin-top:4px;';
      reasonEl.textContent = s.reason || '';

      row.appendChild(topRow);
      if (s.reason) row.appendChild(reasonEl);
      selectorsContainer.appendChild(row);
    });
  }

  document.addEventListener('mouseover', (e) => {
    if (!pickerActive || e.target === host) return;
    const rect = e.target.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
  }, true);

  document.addEventListener('mouseout', () => {
    if (pickerActive) overlay.style.display = 'none';
  }, true);

  document.addEventListener('click', (e) => {
    if (!pickerActive || e.target === host) return;
    if (e.target.closest?.('#__selector-finder-host')) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const info = getElementInfo(e.target);
    pendingElementInfo = info;
    showPendingConfirm(info);

    // Switch overlay to green
    overlay.style.borderColor = '#1a7f37';
    overlay.style.background = 'rgba(26,127,55,0.1)';

    // Open panel if not open
    if (!panelOpen) {
      panelOpen = true;
      panel.classList.add('open');
    }
  }, true);

})();
