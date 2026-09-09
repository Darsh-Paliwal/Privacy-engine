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
  // =========================================================================
  // 5. PHASE 4C-3 / PHASE 7: HYBRID AUTONOMOUS AGENT LOOP
  // =========================================================================
  async function runAutonomousAgentLoop(taskText) {
    const MAX_ITERATIONS = 10;
    let iteration = 0;
    let previousStateSig = '';
    let previousPerceptionFailed = false;

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
        previousPerceptionFailed = true;
        break;
      }

      // Update Perception UI with fresh scan data
      updatePerceptionUI(scanRes);

      const currentPageUrl = scanRes.url || '';
      logActivity(`Perceived ${scanRes.totalInputs} input(s), ${scanRes.totalButtons} button(s) on ${scanRes.title || 'page'}.`);

      // STEP 2: Intelligent Perception Router (Phase 7 Hybrid Integration)
      const t0Route = performance.now();
      const routingDecision = decidePerceptionMode(scanRes, taskText, { previousPerceptionFailed });
      const routingMs = Math.round(performance.now() - t0Route);

      logActivity(`Perception route: ${routingDecision.mode} — ${routingDecision.reason}`, routingDecision.mode === 'DOM_PLUS_VISION' ? 'warn' : 'info');

      // STEP 3: Build Sanitized Context & Execute Visual Perception if Needed
      const sanitizedContext = AgentPrivacyEngine.sanitizePageData(scanRes);
      let visualInferenceMs = 0;
      let visualResultMeta = { available: false };

      if (routingDecision.mode === 'DOM_PLUS_VISION') {
        let screenshotDataUrl = '';
        try {
          screenshotDataUrl = await handleCaptureScreen();
        } catch (err) {
          logActivity(`Visual perception warning: Screenshot capture failed: ${err.message}`, 'warn');
        }

        if (screenshotDataUrl && !screenshotDataUrl.startsWith('about:blank')) {
          try {
            logActivity('Executing local SmolVLM vision inference...', 'info');
            const infRes = await executeLocalVisionInference(screenshotDataUrl);
            visualInferenceMs = infRes.inferenceMs;
            const sanitizedDesc = sanitizeVisualDescriptionText(infRes.description);

            visualResultMeta = {
              available: true,
              description: sanitizedDesc,
              model: 'SmolVLM-256M-Instruct',
              executionDevice: infRes.executionDevice,
              dtype: infRes.dtype
            };

            logActivity(`Local vision: SmolVLM/${infRes.executionDevice} (${infRes.dtype}) completed in ${infRes.inferenceMs} ms.`, 'success');
          } catch (err) {
            logActivity(`Local vision inference failed: ${err.message}`, 'error');
            visualResultMeta = {
              available: false,
              description: `Visual inference error: ${err.message}`,
              model: 'SmolVLM-256M-Instruct',
              executionDevice: 'WEBGPU',
              dtype: localVisionDtype || 'fp32'
            };
          }
        }
      } else {
        logActivity('DOM_ONLY mode active — 0 ms visual inference.', 'info');
      }

      // Attach perception & visual metadata to sanitized cloud context (NO screenshot data, NO PII)
      sanitizedContext.perception = {
        mode: routingDecision.mode,
        router: {
          reason: routingDecision.reason,
          signals: routingDecision.signals
        },
        telemetry: {
          routingMs: routingMs,
          visualInferenceMs: visualInferenceMs
        }
      };
      sanitizedContext.visual = visualResultMeta;

      // STEP 4: Request Reasoning from FastAPI / Qwen3.8-Flash
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
        previousPerceptionFailed = true;
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

      // STEP 5: Render & Execute Safe Actions First (e.g. FILL Address)
      let targetResolutionFailed = false;

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

        // STEP 6: Execute Local Actions Sequentially
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
              const errStr = (fillRes && fillRes.error) ? fillRes.error.toLowerCase() : '';
              if (errStr.includes('not found') || !fillRes) {
                targetResolutionFailed = true;
              }
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
              const errStr = (clickRes && clickRes.error) ? clickRes.error.toLowerCase() : '';
              if (errStr.includes('not found') || !clickRes) {
                targetResolutionFailed = true;
              }
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

      // Update previousPerceptionFailed state ONLY when target resolution genuinely fails
      previousPerceptionFailed = targetResolutionFailed;

      // STEP 7: Enforce Status / Stop Condition AFTER safe actions execute
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

      // STEP 8: Loop Protection Check
      const actionSig = `${currentPageUrl}::` + safeActions.map(a => `${a.action}:${a.target}`).join('|');
      if (actionSig === previousStateSig) {
        logActivity('⚠ Agent appears to be repeating the same action. Loop detected.', 'warn');
        setStatus('⚠ Loop detected: Agent repeated identical actions.', 'error');
        break;
      }
      previousStateSig = actionSig;

      // STEP 9: Pause for DOM stabilization before next cycle
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

  // =========================================================================
  // PHASE 5A: LOCAL SCREENSHOT CAPTURE
  // =========================================================================
  const btnCaptureScreen = document.getElementById('btnCaptureScreen');
  const boxScreenshotPreview = document.getElementById('boxScreenshotPreview');
  const imgScreenshot = document.getElementById('imgScreenshot');
  const valDimensions = document.getElementById('valDimensions');
  const valScreenshotStatus = document.getElementById('valScreenshotStatus');

  async function handleCaptureScreen() {
    setStatus('Capturing local screenshot...', 'info');

    return new Promise((resolve, reject) => {
      if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.query) {
        const errMsg = 'Chrome tabs API unavailable.';
        setStatus(`Screenshot error: ${errMsg}`, 'error');
        logActivity(`Screenshot capture failed: ${errMsg}`, 'error');
        return reject(new Error(errMsg));
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          const errMsg = chrome.runtime.lastError.message || 'Tab query failed.';
          setStatus(`Screenshot error: ${errMsg}`, 'error');
          logActivity(`Screenshot capture failed: ${errMsg}`, 'error');
          return reject(new Error(errMsg));
        }

        if (!tabs || tabs.length === 0) {
          const errMsg = 'No active browser tab found.';
          setStatus(`Screenshot error: ${errMsg}`, 'error');
          logActivity(`Screenshot capture failed: ${errMsg}`, 'error');
          return reject(new Error(errMsg));
        }

        const activeTab = tabs[0];
        if (activeTab.url && (activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('edge://') || activeTab.url.startsWith('about:'))) {
          const errMsg = 'Extension cannot capture browser system pages.';
          setStatus(`Screenshot error: ${errMsg}`, 'error');
          logActivity(`Screenshot capture failed: ${errMsg}`, 'error');
          return reject(new Error(errMsg));
        }

        chrome.tabs.captureVisibleTab(activeTab.windowId, { format: 'jpeg', quality: 90 }, (dataUrl) => {
          if (chrome.runtime.lastError) {
            const errMsg = chrome.runtime.lastError.message || 'Screenshot capture failed.';
            console.error('[Phase 5A Capture Error]', errMsg);
            setStatus(`Screenshot error: ${errMsg}`, 'error');
            logActivity(`Screenshot capture failed: ${errMsg}`, 'error');
            return reject(new Error(errMsg));
          }

          if (!dataUrl) {
            const errMsg = 'Screenshot failed: Empty data URL returned.';
            setStatus(errMsg, 'error');
            logActivity('Screenshot capture returned empty data.', 'error');
            return reject(new Error(errMsg));
          }

          const img = new Image();
          img.onload = () => {
            const width = img.naturalWidth || img.width;
            const height = img.naturalHeight || img.height;

            imgScreenshot.src = dataUrl;
            valDimensions.textContent = `${width} × ${height}`;
            valScreenshotStatus.textContent = 'Captured locally';
            boxScreenshotPreview.classList.remove('hidden');

            setStatus(`✓ Screenshot captured locally (${width} × ${height} px).`, 'success');
            logActivity(`Screenshot captured locally (${width} × ${height} px).`, 'success');
            resolve(dataUrl);
          };

          img.onerror = () => {
            const errMsg = 'Failed to process captured screenshot preview.';
            setStatus(errMsg, 'error');
            logActivity(errMsg, 'error');
            reject(new Error(errMsg));
          };

          img.src = dataUrl;
        });
      });
    });
  }

  if (btnCaptureScreen) {
    btnCaptureScreen.addEventListener('click', () => {
      handleCaptureScreen().catch(err => {
        console.warn('[Capture Screen UI Error]', err);
      });
    });
  }

  // =========================================================================
  // PHASE 5B / 6A: LOCAL VISION INFERENCE ENGINE
  // =========================================================================
  const btnAnalyzeVision = document.getElementById('btnAnalyzeVision');
  const boxVisionResult = document.getElementById('boxVisionResult');
  const txtVisionOutput = document.getElementById('txtVisionOutput');
  const valVisionDevice = document.getElementById('valVisionDevice');
  const valVisionStatus = document.getElementById('valVisionStatus');
  const valModelLoadTime = document.getElementById('valModelLoadTime');
  const valInferenceTime = document.getElementById('valInferenceTime');

  let localVisionProcessor = null;
  let localVisionModel = null;
  let localVisionDevice = 'webgpu';
  let localVisionDtype = 'fp32';

  async function checkWebGPUSupport() {
    if (navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) return 'webgpu';
      } catch (e) {
        console.warn('[Phase 5B] WebGPU requestAdapter failed:', e);
      }
    }
    return 'wasm';
  }

  /**
   * Single authoritative shared local SmolVLM vision inference routine.
   * Loads SmolVLM-256M-Instruct on WebGPU with fp32 precision.
   */
  async function executeLocalVisionInference(screenshotDataUrl) {
    if (!screenshotDataUrl || typeof screenshotDataUrl !== 'string' || screenshotDataUrl.startsWith('about:blank')) {
      throw new Error('Invalid or empty screenshot data URL provided to vision inference.');
    }

    const t0Total = performance.now();
    const device = await checkWebGPUSupport();
    if (device !== 'webgpu') {
      throw new Error('WebGPU is not supported or GPU adapter request failed.');
    }

    // Lazy load model & processor once
    if (!localVisionModel || !localVisionProcessor) {
      logActivity('Loading SmolVLM-256M-Instruct on WEBGPU (fp32)...', 'info');

      const transformers = await import(chrome.runtime.getURL('transformers.esm.js'));
      const { AutoProcessor, AutoModelForVision2Seq, env } = transformers;

      if (env) {
        env.allowLocalModels = false;
        env.allowRemoteModels = true;
        const onnxUrl = chrome.runtime.getURL('onnx/');
        if (env.wasm) env.wasm.wasmPaths = onnxUrl;
        if (env.backends && env.backends.onnx && env.backends.onnx.wasm) {
          env.backends.onnx.wasm.wasmPaths = onnxUrl;
        }
      }

      const modelId = 'HuggingFaceTB/SmolVLM-256M-Instruct';
      if (valVisionStatus) valVisionStatus.textContent = 'Downloading/Loading weights...';

      localVisionProcessor = await AutoProcessor.from_pretrained(modelId);

      logActivity('Loading SmolVLM on WebGPU with fp32 precision...', 'info');
      localVisionModel = await AutoModelForVision2Seq.from_pretrained(modelId, {
        device: 'webgpu',
        dtype: 'fp32'
      });

      localVisionDevice = 'webgpu';
      localVisionDtype = 'fp32';
      if (valVisionDevice) {
        valVisionDevice.textContent = 'WebGPU (fp32)';
      }
    }

    // Preprocess / Resize image copy to max width 1024 while maintaining aspect ratio
    const t0Preprocess = performance.now();
    const transformers = await import(chrome.runtime.getURL('transformers.esm.js'));
    const { RawImage } = transformers;
    const originalImage = await RawImage.fromURL(screenshotDataUrl);
    const origW = originalImage.width;
    const origH = originalImage.height;

    const TARGET_MAX_WIDTH = 1024;
    let targetW = origW;
    let targetH = origH;
    if (origW > TARGET_MAX_WIDTH) {
      targetW = TARGET_MAX_WIDTH;
      targetH = Math.round(TARGET_MAX_WIDTH * (origH / origW));
    }

    const processedImage = (origW !== targetW || origH !== targetH)
      ? await originalImage.resize(targetW, targetH)
      : originalImage;

    const t1Preprocess = performance.now();
    const preprocessMs = Math.round(t1Preprocess - t0Preprocess);

    // Input Prep
    const t0InputPrep = performance.now();
    const prompt = "List visible webpage UI elements in this screenshot: headings, input fields, buttons, links, and key controls. Be concise.";
    const messages = [
      {
        role: "user",
        content: [
          { type: "image" },
          { type: "text", text: prompt }
        ]
      }
    ];

    const textPrompt = localVisionProcessor.apply_chat_template(messages, { add_generation_prompt: true });
    const inputs = await localVisionProcessor(textPrompt, processedImage);
    const t1InputPrep = performance.now();
    const inputPrepMs = Math.round(t1InputPrep - t0InputPrep);

    // Generation
    const t0Generate = performance.now();
    const generateOutputs = await localVisionModel.generate({
      ...inputs,
      max_new_tokens: 80,
      do_sample: false
    });
    const t1Generate = performance.now();
    const generateMs = Math.round(t1Generate - t0Generate);

    // Decoding
    const t0Decode = performance.now();
    const decodedText = localVisionProcessor.batch_decode(generateOutputs, { skip_special_tokens: true });
    const t1Decode = performance.now();
    const decodeMs = Math.round(t1Decode - t0Decode);

    const inferMs = Math.round(performance.now() - t0Total);

    let rawDesc = Array.isArray(decodedText) ? decodedText.join('\n').trim() : String(decodedText || '').trim();

    // Case-insensitive assistant turn header extraction
    const assistantMatch = rawDesc.match(/assistant\s*:?\s*/i);
    if (assistantMatch) {
      const matchIndex = rawDesc.toLowerCase().lastIndexOf(assistantMatch[0].toLowerCase());
      if (matchIndex !== -1) {
        rawDesc = rawDesc.substring(matchIndex + assistantMatch[0].length).trim();
      }
    }

    return {
      description: rawDesc,
      executionDevice: 'WEBGPU',
      dtype: 'fp32',
      inferenceMs: inferMs,
      timingBreakdown: {
        preprocessMs,
        inputPrepMs,
        generateMs,
        decodeMs,
        origW,
        origH,
        targetW,
        targetH
      }
    };
  }

  async function handleAnalyzeVisionLocally() {
    let screenshotDataUrl = imgScreenshot ? imgScreenshot.src : '';
    if (!screenshotDataUrl || screenshotDataUrl === '' || screenshotDataUrl.startsWith('about:blank')) {
      try {
        screenshotDataUrl = await handleCaptureScreen();
      } catch (err) {
        setStatus('Please capture a screen first using "📸 Capture Screen".', 'error');
        logActivity('Local vision analysis failed: No screenshot captured.', 'error');
        return;
      }
    }

    boxVisionResult.classList.remove('hidden');
    txtVisionOutput.textContent = 'Initializing local vision model pipeline...';
    valVisionStatus.textContent = 'Loading model...';
    valModelLoadTime.textContent = '-- ms';
    valInferenceTime.textContent = '-- ms';
    setStatus('Initializing local vision model...', 'info');
    logActivity('Starting local vision inference...', 'info');

    try {
      valVisionStatus.textContent = 'Analyzing screen...';
      txtVisionOutput.textContent = 'Analyzing screenshot locally via SmolVLM...';
      logActivity('Model ready. Running local SmolVLM vision inference...', 'info');

      const result = await executeLocalVisionInference(screenshotDataUrl);
      valVisionDevice.textContent = `${result.executionDevice} (${result.dtype})`;
      valInferenceTime.textContent = `${result.inferenceMs} ms`;
      valVisionStatus.textContent = 'Analysis complete';

      const tb = result.timingBreakdown;
      txtVisionOutput.textContent = `${result.description}\n\n` +
        `----------------------------------------\n` +
        `[Performance & Instrumentation Breakdown]\n` +
        `• Vision Input Dimensions: ${tb.targetW} × ${tb.targetH} (original: ${tb.origW} × ${tb.origH})\n` +
        `• Active dtype: ${result.dtype}\n` +
        `• Execution Device: ${result.executionDevice}\n` +
        `• Image Preprocessing / Resize: ${tb.preprocessMs} ms\n` +
        `• Processor / Input Prep: ${tb.inputPrepMs} ms\n` +
        `• Model Generate: ${tb.generateMs} ms\n` +
        `• Text Decoding: ${tb.decodeMs} ms\n` +
        `• Total Warm Inference: ${result.inferenceMs} ms`;

      setStatus(`✓ Local vision analysis complete (${result.inferenceMs} ms).`, 'success');
      logActivity(`Local vision complete (${result.inferenceMs} ms total | Resize: ${tb.preprocessMs}ms, Prep: ${tb.inputPrepMs}ms, Gen: ${tb.generateMs}ms, Dec: ${tb.decodeMs}ms | Input: ${tb.targetW}x${tb.targetH}).`, 'success');

    } catch (err) {
      console.error('[Phase 5B Vision Inference Error]', err);
      console.error('Error details:', err.name, err.message, err.stack);

      valVisionStatus.textContent = 'Vision inference failed';
      valInferenceTime.textContent = '-- ms';
      txtVisionOutput.textContent = `Error: ${err.name || 'Error'}: ${err.message || 'Vision inference failed.'}`;
      setStatus(`Vision inference failed: ${err.message}`, 'error');
      logActivity(`Vision inference failed: ${err.message}`, 'error');
    }
  }

  if (btnAnalyzeVision) {
    btnAnalyzeVision.addEventListener('click', handleAnalyzeVisionLocally);
  }

  // =========================================================================
  // PHASE 5C: LOCAL VISUAL PRIVACY REDACTION
  // =========================================================================
  const btnRedactVisuals = document.getElementById('btnRedactVisuals');
  const boxRedactionResult = document.getElementById('boxRedactionResult');
  const valOriginalDimensions = document.getElementById('valOriginalDimensions');
  const valViewportDimensions = document.getElementById('valViewportDimensions');
  const valDPR = document.getElementById('valDPR');
  const valScaleFactors = document.getElementById('valScaleFactors');
  const valSensitiveRegionCount = document.getElementById('valSensitiveRegionCount');
  const valRedactionStatus = document.getElementById('valRedactionStatus');
  const imgRedactedScreenshot = document.getElementById('imgRedactedScreenshot');
  const listRedactedRegions = document.getElementById('listRedactedRegions');

  async function handleRedactVisualPrivacy() {
    setStatus('Capturing screenshot and executing local visual privacy redaction...', 'info');

    // 1. Ensure screenshot is available
    let screenshotDataUrl = imgScreenshot ? imgScreenshot.src : '';
    if (!screenshotDataUrl || screenshotDataUrl === '' || screenshotDataUrl.startsWith('about:blank')) {
      try {
        screenshotDataUrl = await handleCaptureScreen();
      } catch (err) {
        screenshotDataUrl = '';
      }
    }

    if (!screenshotDataUrl || screenshotDataUrl === '' || screenshotDataUrl.startsWith('about:blank')) {
      setStatus('Visual redaction failed: No screenshot captured.', 'error');
      logActivity('Visual redaction failed: No screenshot available.', 'error');
      return;
    }

    // 2. Perform DOM perception scan via content script
    const scanRes = await sendMessageToActiveTab({ type: 'SCAN_PAGE' });
    if (!scanRes || !scanRes.success) {
      setStatus('Visual redaction failed: Unable to scan DOM elements.', 'error');
      logActivity('Visual redaction failed: DOM scan failed.', 'error');
      return;
    }

    // 3. Load screenshot image to get authoritative pixel dimensions
    const img = new Image();
    img.onload = () => {
      const imgWidth = img.naturalWidth || img.width;
      const imgHeight = img.naturalHeight || img.height;

      // Extract viewport & DPR metrics from content script scan payload
      const viewport = scanRes.viewport || {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio || 1
      };

      const vpWidth = viewport.width || 1280;
      const vpHeight = viewport.height || 720;
      const dpr = viewport.devicePixelRatio || 1;

      // Calculate scale factors (Screenshot Pixels / Viewport CSS Pixels)
      const scaleX = imgWidth / vpWidth;
      const scaleY = imgHeight / vpHeight;

      // 4. Identify sensitive elements using existing AgentPrivacyEngine
      const sensitiveRegions = [];

      (scanRes.inputs || []).forEach(inp => {
        if (!inp.visible || !inp.rect) return;
        const cls = AgentPrivacyEngine.classifyElement(inp);
        if (cls.sensitive) {
          sensitiveRegions.push({
            label: inp.label || inp.id || inp.name || 'Input',
            category: cls.category,
            rect: inp.rect
          });
        }
      });

      (scanRes.buttons || []).forEach(btn => {
        if (!btn.visible || !btn.rect) return;
        const cls = AgentPrivacyEngine.classifyElement(btn);
        if (cls.sensitive) {
          sensitiveRegions.push({
            label: btn.text || btn.id || 'Button',
            category: cls.category,
            rect: btn.rect
          });
        }
      });

      // 5. Redact sensitive regions on HTML Canvas at full screenshot resolution
      const canvas = document.createElement('canvas');
      canvas.width = imgWidth;
      canvas.height = imgHeight;
      const ctx = canvas.getContext('2d');

      // Draw original screenshot
      ctx.drawImage(img, 0, 0);

      const mappedBoundingBoxes = [];

      sensitiveRegions.forEach(item => {
        const r = item.rect;
        if (!r || r.width <= 0 || r.height <= 0) return;

        // Map DOM viewport coordinates to screenshot pixel coordinates
        let x1 = Math.floor(r.left * scaleX);
        let y1 = Math.floor(r.top * scaleY);
        let x2 = Math.ceil((r.left + r.width) * scaleX);
        let y2 = Math.ceil((r.top + r.height) * scaleY);

        // Clamp coordinates to screenshot boundaries
        x1 = Math.max(0, Math.min(x1, imgWidth));
        y1 = Math.max(0, Math.min(y1, imgHeight));
        x2 = Math.max(0, Math.min(x2, imgWidth));
        y2 = Math.max(0, Math.min(y2, imgHeight));

        const rw = x2 - x1;
        const rh = y2 - y1;

        if (rw <= 0 || rh <= 0) return;

        // Draw opaque dark slate mask
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(x1, y1, rw, rh);

        // Draw category badge over redacted rectangle
        ctx.fillStyle = '#ef4444';
        const fontSize = Math.max(10, Math.round(12 * scaleY));
        ctx.font = `bold ${fontSize}px sans-serif`;
        const tagText = `🔒 ${item.category}`;
        ctx.fillText(tagText, x1 + 4, y1 + Math.max(fontSize, 14));

        mappedBoundingBoxes.push({
          category: item.category,
          bbox: [x1, y1, x2, y2]
        });
      });

      // 6. Export sanitized screenshot URL
      const redactedDataUrl = canvas.toDataURL('image/jpeg', 0.9);

      // Update UI elements
      if (imgRedactedScreenshot) imgRedactedScreenshot.src = redactedDataUrl;
      if (valOriginalDimensions) valOriginalDimensions.textContent = `${imgWidth} × ${imgHeight}`;
      if (valViewportDimensions) valViewportDimensions.textContent = `${vpWidth} × ${vpHeight}`;
      if (valDPR) valDPR.textContent = dpr.toFixed(2);
      if (valScaleFactors) valScaleFactors.textContent = `${scaleX.toFixed(2)} / ${scaleY.toFixed(2)}`;
      if (valSensitiveRegionCount) valSensitiveRegionCount.textContent = String(mappedBoundingBoxes.length);
      if (valRedactionStatus) valRedactionStatus.textContent = 'Redacted Locally';

      if (listRedactedRegions) {
        if (mappedBoundingBoxes.length > 0) {
          listRedactedRegions.innerHTML = mappedBoundingBoxes.map(b => `
            <div class="item-row" style="display: flex; justify-content: space-between; align-items: center; padding: 4px 6px; border-bottom: 1px solid var(--border-color); font-size: 10px;">
              <span class="privacy-tag sensitive" style="font-size: 9px;">🔒 ${escapeHtml(b.category)}</span>
              <span style="font-family: monospace; color: var(--accent-blue); font-size: 9px;">[${b.bbox.join(',')}]</span>
            </div>
          `).join('');
        } else {
          listRedactedRegions.innerHTML = '<span class="empty-text">No sensitive regions found to redact.</span>';
        }
      }

      if (boxRedactionResult) boxRedactionResult.classList.remove('hidden');
      setStatus(`✓ Visual privacy redaction complete (${mappedBoundingBoxes.length} region(s) masked locally).`, 'success');
      logActivity(`Visual privacy redaction complete (${mappedBoundingBoxes.length} region(s) masked | Scale: ${scaleX.toFixed(2)}x, ${scaleY.toFixed(2)}y | DPR: ${dpr}).`, 'success');
    };

    img.onerror = () => {
      setStatus('Failed to process screenshot image for visual redaction.', 'error');
      logActivity('Failed to process screenshot image for visual redaction.', 'error');
    };

    img.src = screenshotDataUrl;
  }

  if (btnRedactVisuals) {
    btnRedactVisuals.addEventListener('click', handleRedactVisualPrivacy);
  }

  // =========================================================================
  // PHASE 6A: UNIFIED PERCEPTION ENGINE
  // =========================================================================
  const btnRunUnifiedPerception = document.getElementById('btnRunUnifiedPerception');
  const boxUnifiedPerception = document.getElementById('boxUnifiedPerception');
  const valUnifiedDomInputs = document.getElementById('valUnifiedDomInputs');
  const valUnifiedDomButtons = document.getElementById('valUnifiedDomButtons');
  const valUnifiedDomLinks = document.getElementById('valUnifiedDomLinks');
  const valUnifiedVisualAvailable = document.getElementById('valUnifiedVisualAvailable');
  const valUnifiedVisualModel = document.getElementById('valUnifiedVisualModel');
  const valUnifiedVisualDevice = document.getElementById('valUnifiedVisualDevice');
  const valUnifiedVisualDtype = document.getElementById('valUnifiedVisualDtype');
  const valUnifiedVisualTime = document.getElementById('valUnifiedVisualTime');
  const valUnifiedVisualDesc = document.getElementById('valUnifiedVisualDesc');
  const valUnifiedScreenshotDims = document.getElementById('valUnifiedScreenshotDims');
  const codeUnifiedJson = document.getElementById('codeUnifiedJson');

  /**
   * Phase 6A: Lightweight local sanitization over raw VLM text description
   * Replaces obvious sensitive patterns (emails, phone numbers, passwords) with placeholders.
   */
  function sanitizeVisualDescriptionText(text) {
    if (!text || typeof text !== 'string') return '';
    let sanitized = text;

    // 1. Email pattern replacement
    sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '<EMAIL>');

    // 2. Phone number pattern replacement (7+ digits with optional separators)
    sanitized = sanitized.replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '<PHONE>');

    // 3. Password pattern signals
    sanitized = sanitized.replace(/\b(password|secret|passcode)\s*[:=]\s*\S+/gi, '$1: <PASSWORD>');

    return sanitized;
  }

  function renderUnifiedPerceptionUI(data) {
    if (!data) return;

    if (valUnifiedDomInputs) valUnifiedDomInputs.textContent = String(data.dom.counts.inputs);
    if (valUnifiedDomButtons) valUnifiedDomButtons.textContent = String(data.dom.counts.buttons);
    if (valUnifiedDomLinks) valUnifiedDomLinks.textContent = String(data.dom.counts.links);

    if (valUnifiedVisualAvailable) valUnifiedVisualAvailable.textContent = data.visual.available ? 'Yes' : 'No';
    if (valUnifiedVisualModel) valUnifiedVisualModel.textContent = data.visual.model;
    if (valUnifiedVisualDevice) valUnifiedVisualDevice.textContent = data.visual.executionDevice;
    if (valUnifiedVisualDtype) valUnifiedVisualDtype.textContent = data.visual.dtype;
    if (valUnifiedVisualTime) valUnifiedVisualTime.textContent = `${data.visual.inferenceMs} ms`;
    if (valUnifiedVisualDesc) valUnifiedVisualDesc.textContent = data.visual.description || 'No description produced.';

    if (valUnifiedScreenshotDims) valUnifiedScreenshotDims.textContent = `${data.screenshot.width} × ${data.screenshot.height}`;
    if (codeUnifiedJson) codeUnifiedJson.textContent = JSON.stringify(data, null, 2);

    if (boxUnifiedPerception) boxUnifiedPerception.classList.remove('hidden');
  }

  /**
   * Phase 6A: Unified Perception Engine Entry Point
   * Combines DOM perception scan, screenshot metadata, and local SmolVLM visual description.
   */
  async function runUnifiedPerception() {
    setStatus('Executing Unified Perception Engine (DOM + Local Vision)...', 'info');

    // 1. DOM Scan from active tab content script
    const scanRes = await sendMessageToActiveTab({ type: 'SCAN_PAGE' });
    if (!scanRes || !scanRes.success) {
      setStatus('Unified Perception failed: Unable to scan DOM elements.', 'error');
      logActivity('Unified Perception failed: DOM scan unavailable.', 'error');
      return null;
    }

    // 2. Apply existing AgentPrivacyEngine sanitization to DOM data
    const sanitizedDom = AgentPrivacyEngine.sanitizePageData(scanRes);

    // 3. Capture local screenshot if not already captured
    let screenshotDataUrl = imgScreenshot ? imgScreenshot.src : '';
    if (!screenshotDataUrl || screenshotDataUrl === '' || screenshotDataUrl.startsWith('about:blank')) {
      try {
        screenshotDataUrl = await handleCaptureScreen();
      } catch (err) {
        console.warn('[Unified Perception] Screenshot capture failed:', err);
      }
    }

    let screenshotMeta = {
      available: false,
      width: 0,
      height: 0
    };

    if (imgScreenshot && imgScreenshot.naturalWidth) {
      screenshotMeta = {
        available: true,
        width: imgScreenshot.naturalWidth || imgScreenshot.width,
        height: imgScreenshot.naturalHeight || imgScreenshot.height
      };
    }

    // 4. Run local SmolVLM inference on screenshot pixels
    let visualRes = {
      available: false,
      description: 'No visual analysis performed',
      model: 'SmolVLM-256M-Instruct',
      executionDevice: 'WEBGPU',
      dtype: localVisionDtype || 'fp32',
      inferenceMs: 0
    };

    if (screenshotDataUrl && !screenshotDataUrl.startsWith('about:blank')) {
      try {
        const infRes = await executeLocalVisionInference(screenshotDataUrl);
        const sanitizedDesc = sanitizeVisualDescriptionText(infRes.description);
        visualRes = {
          available: true,
          description: sanitizedDesc,
          model: 'SmolVLM-256M-Instruct',
          executionDevice: infRes.executionDevice,
          dtype: infRes.dtype,
          inferenceMs: infRes.inferenceMs
        };
      } catch (err) {
        console.warn('[Phase 6A Unified Perception Vision Warning]', err);
        visualRes = {
          available: false,
          description: `Visual inference error: ${err.message}`,
          model: 'SmolVLM-256M-Instruct',
          executionDevice: 'WEBGPU',
          dtype: localVisionDtype || 'fp32',
          inferenceMs: 0
        };
      }
    }

    // 5. Construct Unified Perception Object
    const allButtons = scanRes.buttons || [];
    const linkElements = allButtons.filter(b => b.type === 'link').map(l => ({ target: l.agentId || l.text, text: l.text }));
    const buttonElements = (sanitizedDom.buttons || []).filter(b => b.type !== 'link');

    const unifiedPerception = {
      dom: {
        inputs: sanitizedDom.fields || [],
        buttons: buttonElements,
        links: linkElements,
        counts: {
          inputs: (sanitizedDom.fields || []).length,
          buttons: buttonElements.length,
          links: linkElements.length
        },
        viewport: scanRes.viewport || { width: 0, height: 0, devicePixelRatio: 1 }
      },
      visual: visualRes,
      screenshot: screenshotMeta,
      generatedAt: new Date().toISOString()
    };

    // 6. Update Debug UI
    renderUnifiedPerceptionUI(unifiedPerception);

    setStatus(`✓ Unified perception complete (DOM: ${unifiedPerception.dom.counts.inputs} inputs, Vision: ${unifiedPerception.visual.inferenceMs} ms).`, 'success');
    logActivity(`Unified Perception complete (Inputs: ${unifiedPerception.dom.counts.inputs}, Buttons: ${unifiedPerception.dom.counts.buttons}, Links: ${unifiedPerception.dom.counts.links} | Vision: ${unifiedPerception.visual.executionDevice}/${unifiedPerception.visual.dtype} in ${unifiedPerception.visual.inferenceMs}ms).`, 'success');

    return unifiedPerception;
  }

  if (btnRunUnifiedPerception) {
    btnRunUnifiedPerception.addEventListener('click', runUnifiedPerception);
  }

  // =========================================================================
  // PHASE 6B: INTELLIGENT PERCEPTION ROUTER
  // =========================================================================

  /**
   * Phase 6B: Deterministic Intelligent Perception Router
   * Evaluates DOM perception signals, user task language, and failure flags to decide
   * whether DOM_ONLY perception is sufficient or DOM_PLUS_VISION is required.
   *
   * @param {Object} domData - Raw or sanitized DOM perception payload
   * @param {string} task - User prompt / task description
   * @param {Object} [options] - Options object (e.g. { previousPerceptionFailed: boolean })
   * @returns {Object} Structured perception mode decision & generic routing signals
   */
  function decidePerceptionMode(domData, task, options = {}) {
    const cleanTask = typeof task === 'string' ? task.trim() : '';
    const opts = options || {};

    // 1. Task-based Visual Signal Detection (Deterministic keyword & pattern matching)
    const VISUAL_KEYWORDS = [
      'look at',
      'visually',
      'visual',
      'screenshot',
      'image',
      'icon',
      'red button',
      'blue button',
      'highlighted',
      'highlight',
      'color',
      'coloured',
      'shown',
      'pictured',
      'appearance',
      'which card',
      'find the picture'
    ];

    const lowerTask = cleanTask.toLowerCase();
    const taskRequiresVisual = VISUAL_KEYWORDS.some(kw => lowerTask.includes(kw));

    // 2. Extract Generic DOM Perception Signals
    const inputs = (domData && Array.isArray(domData.inputs))
      ? domData.inputs
      : (domData && Array.isArray(domData.fields) ? domData.fields : []);
    const rawButtons = (domData && Array.isArray(domData.buttons)) ? domData.buttons : [];

    const inputCount = (domData && typeof domData.totalInputs === 'number')
      ? domData.totalInputs
      : inputs.length;
    const linkCount = (domData && domData.counts && typeof domData.counts.links === 'number')
      ? domData.counts.links
      : rawButtons.filter(b => b.type === 'link').length;
    const buttonCount = (domData && domData.counts && typeof domData.counts.buttons === 'number')
      ? domData.counts.buttons
      : rawButtons.filter(b => b.type !== 'link').length;

    const interactiveElementCount = inputCount + buttonCount + linkCount;

    const hasCanvas = Boolean(domData && domData.hasCanvas);
    const hasShadowDom = Boolean(domData && domData.hasShadowDom);
    const customElementCount = (domData && typeof domData.customElementCount === 'number') ? domData.customElementCount : 0;
    const textDensity = (domData && typeof domData.textDensity === 'number') ? domData.textDensity : 0;
    const previousPerceptionFailed = Boolean(opts.previousPerceptionFailed);

    const signals = {
      interactiveElementCount: interactiveElementCount,
      inputCount: inputCount,
      buttonCount: buttonCount,
      linkCount: linkCount,
      hasCanvas: hasCanvas,
      hasShadowDom: hasShadowDom,
      customElementCount: customElementCount,
      textDensity: textDensity,
      taskRequiresVisual: taskRequiresVisual,
      previousPerceptionFailed: previousPerceptionFailed
    };

    // 3. Routing Decision Logic (Deterministic Priority)
    let mode = "DOM_ONLY";
    let useVisual = false;
    let reason = "";

    if (taskRequiresVisual) {
      mode = "DOM_PLUS_VISION";
      useVisual = true;
      reason = "Task explicitly requires visual understanding.";
    } else if (previousPerceptionFailed) {
      mode = "DOM_PLUS_VISION";
      useVisual = true;
      reason = "Previous DOM perception failed to resolve the requested target.";
    } else if (hasCanvas) {
      mode = "DOM_PLUS_VISION";
      useVisual = true;
      reason = "Canvas-based content may not be represented reliably in the DOM.";
    } else if (interactiveElementCount === 0 && textDensity > 0.2) {
      mode = "DOM_PLUS_VISION";
      useVisual = true;
      reason = "Page has low interactive DOM element exposure despite substantial content.";
    } else {
      mode = "DOM_ONLY";
      useVisual = false;
      reason = "DOM provides sufficient structured interactive elements for this task.";
    }

    return {
      mode: mode,
      useVisual: useVisual,
      reason: reason,
      signals: signals
    };
  }

  // Expose globally on window for modular reuse / external callers
  window.decidePerceptionMode = decidePerceptionMode;

  // Phase 6B Test UI DOM Elements
  const btnDecideRouter = document.getElementById('btnDecideRouter');
  const chkPrevFailed = document.getElementById('chkPrevFailed');
  const boxRouterResult = document.getElementById('boxRouterResult');
  const valRouterMode = document.getElementById('valRouterMode');
  const valRouterReason = document.getElementById('valRouterReason');
  const valSigInteractive = document.getElementById('valSigInteractive');
  const valSigInputs = document.getElementById('valSigInputs');
  const valSigButtons = document.getElementById('valSigButtons');
  const valSigLinks = document.getElementById('valSigLinks');
  const valSigCanvas = document.getElementById('valSigCanvas');
  const valSigShadow = document.getElementById('valSigShadow');
  const valSigCustom = document.getElementById('valSigCustom');
  const valSigDensity = document.getElementById('valSigDensity');
  const valSigTaskVisual = document.getElementById('valSigTaskVisual');
  const valSigPrevFailed = document.getElementById('valSigPrevFailed');

  async function handleDecidePerceptionMode() {
    setStatus('Evaluating Perception Router decision...', 'info');

    // 1. Query active tab scan
    const scanRes = await sendMessageToActiveTab({ type: 'SCAN_PAGE' });
    if (!scanRes || !scanRes.success) {
      setStatus('Perception Router failed: Unable to scan page DOM.', 'error');
      return;
    }

    // 2. Read task prompt from existing task input if available
    const taskText = inputAgentTask ? inputAgentTask.value.trim() : '';

    // 3. Read previous perception failure simulation flag
    const previousFailed = chkPrevFailed ? chkPrevFailed.checked : false;

    // 4. Run deterministic perception router logic (No VLM model load, no screenshot, no backend request)
    const decision = decidePerceptionMode(scanRes, taskText, { previousPerceptionFailed: previousFailed });

    // 5. Update Phase 6B Router Test UI
    if (valRouterMode) {
      valRouterMode.textContent = decision.mode === 'DOM_PLUS_VISION' ? 'DOM + LOCAL VISION' : 'DOM ONLY';
      valRouterMode.className = decision.mode === 'DOM_PLUS_VISION'
        ? 'privacy-tag sensitive'
        : 'privacy-tag non-sensitive';
    }

    if (valRouterReason) {
      valRouterReason.textContent = decision.reason;
    }

    const s = decision.signals;
    if (valSigInteractive) valSigInteractive.textContent = String(s.interactiveElementCount);
    if (valSigInputs) valSigInputs.textContent = String(s.inputCount);
    if (valSigButtons) valSigButtons.textContent = String(s.buttonCount);
    if (valSigLinks) valSigLinks.textContent = String(s.linkCount);
    if (valSigCanvas) valSigCanvas.textContent = s.hasCanvas ? 'Yes' : 'No';
    if (valSigShadow) valSigShadow.textContent = s.hasShadowDom ? 'Yes' : 'No';
    if (valSigCustom) valSigCustom.textContent = String(s.customElementCount);
    if (valSigDensity) valSigDensity.textContent = String(s.textDensity);
    if (valSigTaskVisual) valSigTaskVisual.textContent = s.taskRequiresVisual ? 'Yes' : 'No';
    if (valSigPrevFailed) valSigPrevFailed.textContent = s.previousPerceptionFailed ? 'Yes' : 'No';

    if (boxRouterResult) boxRouterResult.classList.remove('hidden');

    setStatus(`✓ Router Decision: ${decision.mode} (${decision.useVisual ? 'Vision Needed' : 'DOM Only'})`, 'success');
    logActivity(`Router Decision: ${decision.mode} | Reason: "${decision.reason}" | TaskVisual: ${s.taskRequiresVisual}, PrevFailed: ${s.previousPerceptionFailed}, Canvas: ${s.hasCanvas}.`, 'success');
  }

  if (btnDecideRouter) {
    btnDecideRouter.addEventListener('click', handleDecidePerceptionMode);
  }

  // Initialize
  populateProfileForm();
  handleScanPage();
});
