/**
 * Browser Agent Popup Logic - Phase 4C-2
 * (Chrome Extension ↔ FastAPI /reason Backend Integration + Local Action Execution)
 * 
 * 1. Scans page DOM, applies local privacy sanitization, transmits ONLY sanitized context
 *    to http://127.0.0.1:8000/reason, and renders validated action plan.
 * 2. Executes validated action plan LOCALLY on user click (FILL, CLICK, SCROLL).
 *    Resolves LOCAL_PROFILE references strictly on-device via chrome.storage.local.
 *    Real PII values NEVER touch the backend or logs.
 */

document.addEventListener('DOMContentLoaded', () => {
  console.log('[Agent] Popup Phase 4C-2 initialized.');

  // Default Fallback Profile Data
  const DEFAULT_PROFILE = {
    name: 'Darsh',
    email: 'darsh@example.com',
    phone: '9876543210',
    college: 'ABC University',
    address: 'Indore, Madhya Pradesh'
  };

  // UI Tabs
  const tabScan = document.getElementById('tabScan');
  const tabPrivacy = document.getElementById('tabPrivacy');
  const tabProfile = document.getElementById('tabProfile');

  const viewScan = document.getElementById('viewScan');
  const viewPrivacy = document.getElementById('viewPrivacy');
  const viewProfile = document.getElementById('viewProfile');

  // DOM Elements - Agent & Perception View
  const inputAgentTask = document.getElementById('inputAgentTask');
  const btnRunAgent = document.getElementById('btnRunAgent');
  const btnExecutePlan = document.getElementById('btnExecutePlan');
  const boxActivityLog = document.getElementById('boxActivityLog');
  const agentActivityLog = document.getElementById('agentActivityLog');
  const boxActionPlan = document.getElementById('boxActionPlan');
  const agentActionPlan = document.getElementById('agentActionPlan');

  const btnScan = document.getElementById('btnScan');
  const btnFill = document.getElementById('btnFill');
  const btnNext = document.getElementById('btnNext');
  const valInputs = document.getElementById('valInputs');
  const valButtons = document.getElementById('valButtons');
  const listInputs = document.getElementById('listInputs');
  const listButtons = document.getElementById('listButtons');
  const statusText = document.getElementById('statusText');

  // DOM Elements - Privacy View
  const btnPrivacyScan = document.getElementById('btnPrivacyScan');
  const btnPreviewSanitized = document.getElementById('btnPreviewSanitized');
  const auditSensitiveCount = document.getElementById('auditSensitiveCount');
  const listPrivacyFields = document.getElementById('listPrivacyFields');
  const boxSanitized = document.getElementById('boxSanitized');
  const codeSanitized = document.getElementById('codeSanitized');

  // DOM Elements - Profile View
  const formProfile = document.getElementById('formProfile');
  const profName = document.getElementById('profName');
  const profEmail = document.getElementById('profEmail');
  const profPhone = document.getElementById('profPhone');
  const profCollege = document.getElementById('profCollege');
  const profAddress = document.getElementById('profAddress');

  let currentScanData = null;
  let lastValidatedPlan = [];

  // =========================================================================
  // 1. TAB SWITCHING LOGIC
  // =========================================================================
  function switchTab(targetTab, targetView) {
    [tabScan, tabPrivacy, tabProfile].forEach(t => t.classList.remove('active'));
    [viewScan, viewPrivacy, viewProfile].forEach(v => v.classList.remove('active'));

    targetTab.classList.add('active');
    targetView.classList.add('active');
  }

  tabScan.addEventListener('click', () => switchTab(tabScan, viewScan));
  tabPrivacy.addEventListener('click', () => switchTab(tabPrivacy, viewPrivacy));
  tabProfile.addEventListener('click', () => switchTab(tabProfile, viewProfile));

  // =========================================================================
  // 2. LOCAL PROFILE STORAGE & SOURCE RESOLVER
  // =========================================================================
  async function loadProfile() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['userProfile'], (result) => {
          if (result && result.userProfile) {
            resolve(result.userProfile);
          } else {
            chrome.storage.local.set({ userProfile: DEFAULT_PROFILE });
            resolve(DEFAULT_PROFILE);
          }
        });
      } else {
        resolve(DEFAULT_PROFILE);
      }
    });
  }

  async function saveProfile(profileData) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ userProfile: profileData }, () => {
          console.log('[Agent Profile] Local profile saved successfully.');
          resolve(true);
        });
      } else {
        resolve(true);
      }
    });
  }

  async function populateProfileForm() {
    const profile = await loadProfile();
    profName.value = profile.name || '';
    profEmail.value = profile.email || '';
    profPhone.value = profile.phone || '';
    profCollege.value = profile.college || '';
    profAddress.value = profile.address || '';
  }

  formProfile.addEventListener('submit', async (e) => {
    e.preventDefault();
    const updatedProfile = {
      name: profName.value.trim(),
      email: profEmail.value.trim(),
      phone: profPhone.value.trim(),
      college: profCollege.value.trim(),
      address: profAddress.value.trim()
    };

    await saveProfile(updatedProfile);
    setStatus('Local profile updated successfully.', 'success');
  });

  /**
   * Resolves a local profile reference (e.g. LOCAL_PROFILE.email) on-device from chrome.storage.local.
   * NEVER sends values to backend or logs.
   */
  async function resolveLocalSource(source) {
    if (!source || typeof source !== 'string') {
      return { success: false, error: 'Missing or empty source reference' };
    }

    const profile = await loadProfile();
    const cleanSource = source.trim();

    switch (cleanSource) {
      case 'LOCAL_PROFILE.name':
        return { success: true, value: profile.name || '' };
      case 'LOCAL_PROFILE.email':
        return { success: true, value: profile.email || '' };
      case 'LOCAL_PROFILE.phone':
        return { success: true, value: profile.phone || '' };
      case 'LOCAL_PROFILE.college':
        return { success: true, value: profile.college || '' };
      case 'LOCAL_PROFILE.address':
        return { success: true, value: profile.address || '' };
      case 'LOCAL_FILE':
        return { success: true, value: '[LOCAL_FILE_ATTACHMENT]' };
      default:
        return { success: false, error: `Unable to resolve local source: ${cleanSource}` };
    }
  }

  // =========================================================================
  // 3. MESSAGING HELPER
  // =========================================================================
  async function sendMessageToActiveTab(message) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs || tabs.length === 0) {
        throw new Error('No active browser tab found.');
      }

      const activeTab = tabs[0];
      if (activeTab.url && (activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('edge://') || activeTab.url.startsWith('about:'))) {
        throw new Error('Extension cannot run on browser system pages.');
      }

      return new Promise((resolve) => {
        chrome.tabs.sendMessage(activeTab.id, message, (response) => {
          if (chrome.runtime.lastError) {
            resolve({
              success: false,
              error: 'Could not connect to page script. Please refresh the page.'
            });
          } else {
            resolve(response || { success: false, error: 'Empty response from page.' });
          }
        });
      });
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  function setStatus(message, type = 'info') {
    statusText.textContent = message;
    statusText.className = `status-message ${type}`;
    console.log(`[Agent Status] (${type.toUpperCase()}): ${message}`);
  }

  function logActivity(text, type = 'info') {
    const item = document.createElement('div');
    item.className = `activity-item ${type}`;
    let symbol = '✓';
    if (type === 'info') symbol = '→';
    if (type === 'error') symbol = '✗';
    if (type === 'warn') symbol = '⚠';
    item.innerHTML = `<span>${symbol}</span> <span>${escapeHtml(text)}</span>`;
    agentActivityLog.appendChild(item);
  }

  // =========================================================================
  // 4. PERCEPTION & CONTROL (SCAN & MANUAL TESTS)
  // =========================================================================
  function updatePerceptionUI(response) {
    if (!response || !response.success) {
      valInputs.textContent = '0';
      valButtons.textContent = '0';
      listInputs.innerHTML = '<span class="empty-text">Scan failed.</span>';
      listButtons.innerHTML = '<span class="empty-text">Scan failed.</span>';
      return;
    }

    currentScanData = response;
    valInputs.textContent = response.totalInputs;
    valButtons.textContent = response.totalButtons;

    if (response.inputs && response.inputs.length > 0) {
      listInputs.innerHTML = response.inputs
        .map(inp => {
          const classification = AgentPrivacyEngine.classifyElement(inp);
          const badgeClass = classification.sensitive ? 'sensitive' : 'non-sensitive';
          return `<div class="item-row">
            <span>✓ ${escapeHtml(inp.label || inp.id || inp.name || 'Input')}</span>
            <span class="privacy-tag ${badgeClass}">${classification.category}</span>
          </div>`;
        })
        .join('');
    } else {
      listInputs.innerHTML = '<span class="empty-text">No inputs found on page.</span>';
    }

    if (response.buttons && response.buttons.length > 0) {
      listButtons.innerHTML = response.buttons
        .map(btn => `<div class="item-row"><span>✓ ${escapeHtml(btn.text || btn.id || 'Button')}</span></div>`)
        .join('');
    } else {
      listButtons.innerHTML = '<span class="empty-text">No buttons found on page.</span>';
    }
  }

  async function handleScanPage() {
    setStatus('Scanning page...', 'info');

    const response = await sendMessageToActiveTab({ type: 'SCAN_PAGE' });

    if (!response || !response.success) {
      setStatus(response.error || 'Failed to scan page.', 'error');
      updatePerceptionUI(null);
      return response;
    }

    updatePerceptionUI(response);
    setStatus(`Page scanned. Found ${response.totalInputs} inputs and ${response.totalButtons} buttons.`, 'success');
    return response;
  }

  async function handleTestAutoFill() {
    setStatus('Resolving local profile fields...', 'info');
    const profile = await loadProfile();

    const fieldMappings = [
      { labelTarget: 'Full Name', altTarget: 'name', value: profile.name },
      { labelTarget: 'Email', altTarget: 'email', value: profile.email },
      { labelTarget: 'Phone', altTarget: 'phone', value: profile.phone },
      { labelTarget: 'College', altTarget: 'college', value: profile.college },
      { labelTarget: 'Address', altTarget: 'address', value: profile.address }
    ];

    let filledCount = 0;
    const filledLabels = [];

    for (const item of fieldMappings) {
      if (!item.value) continue;

      let res = await sendMessageToActiveTab({
        type: 'FILL_FIELD',
        target: item.labelTarget,
        value: item.value
      });

      if (!res.success && item.altTarget) {
        res = await sendMessageToActiveTab({
          type: 'FILL_FIELD',
          target: item.altTarget,
          value: item.value
        });
      }

      if (res.success) {
        filledCount++;
        filledLabels.push(item.labelTarget);
      }
    }

    if (filledCount > 0) {
      setStatus(`Auto-filled ${filledCount} field(s) from local profile: ${filledLabels.join(', ')}`, 'success');
    } else {
      setStatus('No matching profile fields found to fill on this page.', 'error');
    }

    setTimeout(handleScanPage, 400);
  }

  async function handleTestClickNext() {
    setStatus('Clicking NEXT...', 'info');

    let clickRes = await sendMessageToActiveTab({ type: 'CLICK_ELEMENT', target: 'NEXT' });
    if (!clickRes.success) clickRes = await sendMessageToActiveTab({ type: 'CLICK_ELEMENT', target: 'Next' });
    if (!clickRes.success) clickRes = await sendMessageToActiveTab({ type: 'CLICK_ELEMENT', target: 'Submit Application' });

    if (clickRes.success) {
      setStatus('Clicked next/submit button successfully.', 'success');
      setTimeout(handleScanPage, 800);
    } else {
      setStatus(clickRes.error || 'Failed to click Next button.', 'error');
    }
  }

  // =========================================================================
  // 5. PHASE 4C-3: AUTONOMOUS AGENT LOOP
  // =========================================================================
  async function runAutonomousAgentLoop(taskText) {
    const MAX_ITERATIONS = 10;
    let iteration = 0;
    let previousStateSig = '';

    // Reset UI Areas & State
    lastValidatedPlan = [];
    boxActivityLog.classList.remove('hidden');
    boxActionPlan.classList.remove('hidden');
    agentActivityLog.innerHTML = '';
    agentActionPlan.innerHTML = '';

    setStatus('Starting autonomous agent loop...', 'info');

    while (iteration < MAX_ITERATIONS) {
      iteration++;

      // Log Iteration Header
      const iterHeader = document.createElement('div');
      iterHeader.className = 'activity-item info';
      iterHeader.style.fontWeight = '700';
      iterHeader.style.marginTop = '6px';
      iterHeader.style.borderTop = '1px solid var(--border-color)';
      iterHeader.style.paddingTop = '6px';
      iterHeader.innerHTML = `<span>🔄</span> <span>━━ Iteration ${iteration} ━━</span>`;
      agentActivityLog.appendChild(iterHeader);

      logActivity(`Perceiving DOM (Iteration ${iteration})...`, 'info');

      // STEP 1: Fresh Perception with Connection Retry
      let scanRes = null;
      for (let attempt = 1; attempt <= 5; attempt++) {
        scanRes = await sendMessageToActiveTab({ type: 'SCAN_PAGE' });
        if (scanRes && scanRes.success) break;
        await new Promise(r => setTimeout(r, 200));
      }

      if (!scanRes || !scanRes.success) {
        logActivity('Could not connect to page DOM.', 'error');
        setStatus('Agent stopped: Unable to scan page DOM.', 'error');
        break;
      }

      // Update Perception UI with fresh scan data
      updatePerceptionUI(scanRes);

      const currentPageUrl = scanRes.url || '';
      logActivity(`Perceived ${scanRes.totalInputs} input(s), ${scanRes.totalButtons} button(s) on ${scanRes.title || 'page'}.`);

      // STEP 2: Apply Local Privacy Protection
      const sanitizedContext = AgentPrivacyEngine.sanitizePageData(scanRes);

      // STEP 3: Request Reasoning from FastAPI / Qwen3.8-Flash
      logActivity('Requesting Qwen reasoning...', 'info');

      let reasonData = null;
      try {
        const response = await fetch('http://127.0.0.1:8000/reason', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task: taskText,
            context: sanitizedContext
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        reasonData = await response.json();
      } catch (err) {
        logActivity(`Backend error: ${err.message}`, 'error');
        setStatus('✗ Backend unavailable on port 8000.', 'error');
        break;
      }

      if (!reasonData || !reasonData.success) {
        logActivity(`Reasoning error: ${reasonData ? reasonData.error : 'Unknown error'}`, 'error');
        setStatus(`Agent error: ${reasonData ? reasonData.error : 'Reasoning failed'}`, 'error');
        break;
      }

      const rawStatus = reasonData.status || 'CONTINUE';
      const rawActions = reasonData.actions || [];

      // Check if page has an unresolved required file input
      const missingFileField = (scanRes.inputs || []).find(inp => {
        const isFile = inp.inputType === 'file' || inp.type === 'file';
        return isFile && !inp.hasFile;
      });

      // Filter actions: remove forbidden CLICK submit actions when a required file is missing
      const safeActions = [];
      let submitBlocked = false;

      for (const act of rawActions) {
        if (act.action === 'CLICK') {
          const targetLower = (act.target || '').toLowerCase();
          const isSubmit = targetLower.includes('submit') || targetLower.includes('agent-submit');
          if (missingFileField && isSubmit) {
            submitBlocked = true;
            logActivity('⚠ Filtered out Submit action: Resume file required.', 'warn');
            continue;
          }
        }
        safeActions.push(act);
      }

      // STEP 4: Render & Execute Safe Actions First (e.g. FILL Address)
      if (safeActions.length > 0) {
        // Render Actions in UI
        const labelMap = {};
        (scanRes.inputs || []).forEach(i => { labelMap[i.agentId || i.id || i.name] = i.label || i.id || i.name; });
        (scanRes.buttons || []).forEach(b => { labelMap[b.agentId || b.id || b.text] = b.text || b.id; });

        agentActionPlan.innerHTML = safeActions.map((act, idx) => {
          const humanLabel = labelMap[act.target] || act.target;
          const sourceText = act.source ? `<span class="plan-source">${escapeHtml(act.source)}</span>` : '';
          return `<div class="plan-item">
            <div>
              <span class="plan-action-type">${idx + 1}. ${escapeHtml(act.action)}</span>
              <span class="plan-target">→ ${escapeHtml(humanLabel)}</span>
            </div>
            ${sourceText}
          </div>`;
        }).join('');

        // STEP 5: Execute Local Actions Sequentially
        for (let i = 0; i < safeActions.length; i++) {
          const act = safeActions[i];
          const humanLabel = labelMap[act.target] || act.target;

          if (act.action === 'FILL') {
            if (!act.source) {
              logActivity(`Failed: ${humanLabel} missing source reference.`, 'error');
              continue;
            }
            const resolved = await resolveLocalSource(act.source);
            if (!resolved.success) {
              logActivity(`Unable to resolve local source: ${act.source}`, 'error');
              continue;
            }

            const fillRes = await sendMessageToActiveTab({
              type: 'FILL_FIELD',
              target: act.target,
              value: resolved.value
            });

            if (fillRes && fillRes.success) {
              logActivity(`Filled ${humanLabel}`);
            } else {
              logActivity(`Failed to fill ${humanLabel}: ${fillRes.error || 'Target not found'}`, 'error');
            }
          } else if (act.action === 'CLICK') {
            const clickRes = await sendMessageToActiveTab({
              type: 'CLICK_ELEMENT',
              target: act.target
            });

            if (clickRes && clickRes.success) {
              logActivity(`Clicked ${humanLabel}`);
            } else {
              logActivity(`Failed to click ${humanLabel}: ${clickRes.error || 'Target not found'}`, 'error');
            }
          } else if (act.action === 'SCROLL') {
            const dir = (act.direction || 'down').toLowerCase();
            const scrollRes = await sendMessageToActiveTab({
              type: 'SCROLL_PAGE',
              direction: dir
            });

            if (scrollRes && scrollRes.success) {
              logActivity(`Scrolled ${dir}`);
            } else {
              logActivity(`Failed to scroll: ${scrollRes.error || 'Scroll failed'}`, 'error');
            }
          }

          await new Promise(r => setTimeout(r, 350));
        }
      }

      // STEP 6: Enforce Status / Stop Condition AFTER safe actions execute
      if (rawStatus === 'DONE') {
        logActivity('✓ Task completed successfully.', 'success');
        setStatus('✓ Task completed successfully.', 'success');
        break;
      }

      if (rawStatus === 'NEED_USER' || missingFileField || submitBlocked) {
        logActivity('⚠ User input required: Please manually upload your Resume file.', 'warn');
        setStatus('⚠ User input required: Please manually upload your Resume file.', 'error');
        break;
      }

      if (rawStatus === 'ERROR') {
        logActivity(`✗ Agent error reported by backend: ${reasonData.error || 'Execution halted.'}`, 'error');
        setStatus(`✗ Agent error: ${reasonData.error || 'Halted.'}`, 'error');
        break;
      }

      if (safeActions.length === 0) {
        logActivity('No executable actions remaining.', 'info');
        setStatus('Agent idle: No actions generated.', 'info');
        break;
      }

      // STEP 7: Loop Protection Check
      const actionSig = `${currentPageUrl}::` + safeActions.map(a => `${a.action}:${a.target}`).join('|');
      if (actionSig === previousStateSig) {
        logActivity('⚠ Agent appears to be repeating the same action. Loop detected.', 'warn');
        setStatus('⚠ Loop detected: Agent repeated identical actions.', 'error');
        break;
      }
      previousStateSig = actionSig;

      // STEP 8: Pause for DOM stabilization before next cycle
      logActivity('Waiting for DOM stabilization...', 'info');
      await new Promise(r => setTimeout(r, 600));
    }

    if (iteration >= MAX_ITERATIONS) {
      logActivity('⚠ Maximum agent iterations reached (10). Stopping loop.', 'warn');
      setStatus('⚠ Hard iteration limit reached (10 iterations).', 'error');
    }
  }

  async function handleRunBrowserAgent() {
    const taskText = inputAgentTask.value.trim();
    if (!taskText) {
      setStatus('Please enter a task before running browser agent.', 'error');
      return;
    }
    await runAutonomousAgentLoop(taskText);
  }

  // =========================================================================
  // 6. PHASE 4C-2: LOCAL ACTION EXECUTION RUNNER
  // =========================================================================
  async function handleExecuteActionPlan() {
    if (!lastValidatedPlan || lastValidatedPlan.length === 0) {
      setStatus('No action plan available. Run Browser Agent first.', 'error');
      return;
    }

    setStatus('Executing action plan locally...', 'info');

    // Add divider in activity log
    const divider = document.createElement('div');
    divider.className = 'activity-item info';
    divider.style.fontWeight = '700';
    divider.style.marginTop = '6px';
    divider.style.borderTop = '1px dashed #334155';
    divider.style.paddingTop = '6px';
    divider.innerHTML = `<span>⚡</span> <span>--- Execution ---</span>`;
    agentActivityLog.appendChild(divider);

    // Rescan current page DOM to map targets dynamically
    const freshScan = await handleScanPage();
    const labelMap = {};
    if (freshScan && freshScan.success) {
      (freshScan.inputs || []).forEach(i => {
        const key = i.agentId || i.id || i.name;
        labelMap[key] = i.label || i.id || i.name || key;
      });
      (freshScan.buttons || []).forEach(b => {
        const key = b.agentId || b.id || b.text;
        labelMap[key] = b.text || b.id || key;
      });
    }

    // Capture initial tab URL to detect page navigation
    const initialTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const initialUrl = (initialTabs && initialTabs[0]) ? initialTabs[0].url : '';

    const totalActions = lastValidatedPlan.length;

    for (let i = 0; i < totalActions; i++) {
      const act = lastValidatedPlan[i];
      const stepNum = i + 1;
      const humanLabel = labelMap[act.target] || act.target;

      logActivity(`Executing ${stepNum}/${totalActions}: ${act.action} → ${humanLabel}`, 'info');

      // Execute Action Type
      if (act.action === 'FILL') {
        if (!act.source) {
          logActivity(`Failed: ${humanLabel} — Missing required source reference.`, 'error');
          continue;
        }

        // Resolve local profile value on-device from chrome.storage.local
        const resolved = await resolveLocalSource(act.source);
        if (!resolved.success) {
          logActivity(`Unable to resolve local source: ${act.source}`, 'error');
          continue;
        }

        // Send local FILL_FIELD message to content script (Completely ignoring any backend value)
        const fillRes = await sendMessageToActiveTab({
          type: 'FILL_FIELD',
          target: act.target,
          value: resolved.value
        });

        if (fillRes && fillRes.success) {
          logActivity(`Filled ${humanLabel}`);
        } else {
          logActivity(`Failed to fill ${humanLabel}: ${fillRes.error || 'Target not found'}`, 'error');
        }

      } else if (act.action === 'CLICK') {
        const clickRes = await sendMessageToActiveTab({
          type: 'CLICK_ELEMENT',
          target: act.target
        });

        if (clickRes && clickRes.success) {
          logActivity(`Clicked ${humanLabel}`);

          // Check if click caused page navigation
          await new Promise(r => setTimeout(r, 400));
          const updatedTabs = await chrome.tabs.query({ active: true, currentWindow: true });
          const currentUrl = (updatedTabs && updatedTabs[0]) ? updatedTabs[0].url : '';

          if (currentUrl && currentUrl !== initialUrl) {
            logActivity('Page navigation detected. Execution complete.', 'info');
            break; // Complete current plan after navigation
          }
        } else {
          logActivity(`Failed to click ${humanLabel}: ${clickRes.error || 'Target not found'}`, 'error');
        }

      } else if (act.action === 'SCROLL') {
        const validDirs = ['up', 'down', 'top', 'bottom'];
        const dir = (act.direction || 'down').toLowerCase();

        if (!validDirs.includes(dir)) {
          logActivity(`Invalid scroll direction: ${act.direction}`, 'error');
          continue;
        }

        const scrollRes = await sendMessageToActiveTab({
          type: 'SCROLL_PAGE',
          direction: dir
        });

        if (scrollRes && scrollRes.success) {
          logActivity(`Scrolled ${dir}`);
        } else {
          logActivity(`Failed to scroll: ${scrollRes.error || 'Scroll failed'}`, 'error');
        }

      } else {
        // Unsupported Action (SELECT, WAIT, etc.)
        logActivity(`Unsupported action: ${act.action}`, 'warn');
      }

      // Small pause between sequential actions
      await new Promise(r => setTimeout(r, 300));
    }

    logActivity('Execution complete.', 'info');
    setStatus('✓ Local execution of validated action plan complete.', 'success');
  }

  // =========================================================================
  // 7. PRIVACY ENGINE & SANITIZED CONTEXT PREVIEW
  // =========================================================================
  async function handlePrivacyScan() {
    setStatus('Running DOM privacy classification...', 'info');

    const scanRes = await handleScanPage();
    if (!scanRes || !scanRes.success) return;

    let sensitiveCount = 0;

    if (scanRes.inputs && scanRes.inputs.length > 0) {
      listPrivacyFields.innerHTML = scanRes.inputs
        .map(inp => {
          const cls = AgentPrivacyEngine.classifyElement(inp);
          if (cls.sensitive) sensitiveCount++;
          const badgeClass = cls.sensitive ? 'sensitive' : 'non-sensitive';
          const lockNote = cls.sensitive ? '🔒 Local' : 'Public';

          return `<div class="item-row">
            <div>
              <strong>${escapeHtml(inp.label || inp.id || 'Input')}</strong>
              <small style="color: var(--text-muted); display: block;">Source: ${cls.source}</small>
            </div>
            <div style="text-align: right;">
              <span class="privacy-tag ${badgeClass}">${cls.category}</span>
              <small style="color: var(--text-muted); display: block;">${lockNote}</small>
            </div>
          </div>`;
        })
        .join('');
    } else {
      listPrivacyFields.innerHTML = '<span class="empty-text">No interactive fields to classify.</span>';
    }

    auditSensitiveCount.textContent = sensitiveCount;
    setStatus(`Privacy scan complete. Detected ${sensitiveCount} sensitive field(s).`, 'success');
  }

  async function handlePreviewSanitized() {
    setStatus('Generating sanitized cloud-facing context...', 'info');

    let scanData = currentScanData;
    if (!scanData) {
      scanData = await sendMessageToActiveTab({ type: 'SCAN_PAGE' });
    }

    if (!scanData || !scanData.success) {
      setStatus('Scan required before generating preview.', 'error');
      return;
    }

    const sanitized = AgentPrivacyEngine.sanitizePageData(scanData);

    boxSanitized.classList.remove('hidden');
    codeSanitized.textContent = JSON.stringify(sanitized, null, 2);

    setStatus('Sanitized context generated. Actual private values are completely omitted.', 'success');
  }

  // =========================================================================
  // UTILITY
  // =========================================================================
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Event Listeners
  btnRunAgent.addEventListener('click', handleRunBrowserAgent);
  btnExecutePlan.addEventListener('click', handleExecuteActionPlan);
  btnScan.addEventListener('click', handleScanPage);
  btnFill.addEventListener('click', handleTestAutoFill);
  btnNext.addEventListener('click', handleTestClickNext);

  btnPrivacyScan.addEventListener('click', handlePrivacyScan);
  btnPreviewSanitized.addEventListener('click', handlePreviewSanitized);

  // Initialize
  populateProfileForm();
  handleScanPage();
});
