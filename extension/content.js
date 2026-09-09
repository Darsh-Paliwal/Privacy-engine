/**
 * Browser Agent Content Script - Phase 2 (DOM Perception & Browser Control)
 * 
 * Provides generic browser perception (scanPage) and control capabilities
 * (fillField, clickElement, scrollPage) without hardcoded page-specific rules.
 */

(function () {
  'use Object';

  console.log('[Agent] Content script loaded and ready.');

  // =========================================================================
  // 1. VISIBILITY & STATE HELPERS
  // =========================================================================

  /**
   * Checks if a DOM element is visible to the user.
   * @param {HTMLElement} el 
   * @returns {boolean}
   */
  function isElementVisible(el) {
    if (!el || !(el instanceof HTMLElement)) return false;

    // Use native checkVisibility API if available
    if (typeof el.checkVisibility === 'function') {
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
        return false;
      }
    }

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /**
   * Checks if an element is enabled.
   * @param {HTMLElement} el 
   * @returns {boolean}
   */
  function isElementEnabled(el) {
    if (!el) return false;
    if (el.disabled) return false;
    if (el.getAttribute('aria-disabled') === 'true') return false;
    return true;
  }

  // =========================================================================
  // 2. LABEL DETECTION HEURISTIC
  // =========================================================================

  /**
   * Resolves a meaningful label for an input element using priority heuristics.
   * Priority:
   * 1. Explicit <label for="id">
   * 2. Enclosing/wrapping <label>
   * 3. aria-label
   * 4. aria-labelledby
   * 5. Nearby label text (preceding sibling / parent form-group text)
   * 6. placeholder
   * 7. name
   * 8. id
   * 
   * @param {HTMLElement} el 
   * @returns {string}
   */
  function resolveLabel(el) {
    if (!el) return '';

    // 1. Explicit <label for="id">
    if (el.id) {
      try {
        const explicitLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (explicitLabel && explicitLabel.textContent.trim()) {
          return explicitLabel.textContent.trim();
        }
      } catch (e) {
        // Fallthrough if selector fails
      }
    }

    // 2. Enclosing/wrapping <label>
    const wrappingLabel = el.closest('label');
    if (wrappingLabel) {
      // Clone label node to extract text without input value if nested
      const clone = wrappingLabel.cloneNode(true);
      const inputs = clone.querySelectorAll('input, select, textarea');
      inputs.forEach(i => i.remove());
      const labelText = clone.textContent.trim();
      if (labelText) return labelText;
    }

    // 3. aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) {
      return ariaLabel.trim();
    }

    // 4. aria-labelledby
    const ariaLabelledBy = el.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const labelEl = document.getElementById(ariaLabelledBy);
      if (labelEl && labelEl.textContent.trim()) {
        return labelEl.textContent.trim();
      }
    }

    // 5. Nearby label text (form-group container / preceding sibling)
    const parentGroup = el.closest('.form-group, .field, .input-group, div');
    if (parentGroup) {
      const prevLabel = parentGroup.querySelector('label, .label, span.label');
      if (prevLabel && prevLabel.textContent.trim()) {
        return prevLabel.textContent.trim();
      }
    }

    // 6. placeholder
    const placeholder = el.getAttribute('placeholder');
    if (placeholder && placeholder.trim()) {
      return placeholder.trim();
    }

    // 7. name
    const name = el.getAttribute('name');
    if (name && name.trim()) {
      return name.trim();
    }

    // 8. id
    if (el.id && el.id.trim()) {
      return el.id.trim();
    }

    return '';
  }

  // =========================================================================
  // 3. AGENT ID ASSIGNMENT
  // =========================================================================

  /**
   * Generates or retrieves a stable data-agent-id for a DOM element.
   * @param {HTMLElement} el 
   * @param {number} index 
   * @returns {string}
   */
  function ensureAgentId(el, index) {
    if (el.hasAttribute('data-agent-id')) {
      return el.getAttribute('data-agent-id');
    }

    const rawName = el.id || el.getAttribute('name') || resolveLabel(el) || `el-${index}`;
    const cleanName = rawName.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-');
    const agentId = `agent-${cleanName}`;

    el.setAttribute('data-agent-id', agentId);
    return agentId;
  }

  // =========================================================================
  // 4. PAGE SCANNING (DOM PERCEPTION)
  // =========================================================================

  /**
   * Scans the current DOM and returns structured perception information.
   * @returns {Object} Structured metadata of inputs and buttons
   */
  function scanPage() {
    console.log('[Agent] Scanning page...');

    const inputElements = Array.from(document.querySelectorAll('input, textarea, select'));
    const buttonElements = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a[href], [role="button"]'));

    const detectedInputs = [];
    const detectedButtons = [];

    // Process Input Elements
    inputElements.forEach((el, idx) => {
      const type = el.tagName.toLowerCase();
      const inputType = el.getAttribute('type') || (type === 'textarea' ? 'textarea' : 'text');
      const label = resolveLabel(el);
      const agentId = ensureAgentId(el, idx);
      const r = el.getBoundingClientRect();

      detectedInputs.push({
        type: type,
        inputType: inputType,
        id: el.id || '',
        name: el.getAttribute('name') || '',
        label: label,
        placeholder: el.getAttribute('placeholder') || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        autocomplete: el.getAttribute('autocomplete') || '',
        visible: isElementVisible(el),
        enabled: isElementEnabled(el),
        agentId: agentId,
        hasFile: inputType === 'file' ? Boolean(el.files && el.files.length > 0) : false,
        value: (inputType !== 'password' && inputType !== 'file') ? (el.value || '') : '',
        rect: {
          left: Math.round(r.left),
          top: Math.round(r.top),
          width: Math.round(r.width),
          height: Math.round(r.height)
        }
      });
    });

    // Process Button Elements
    buttonElements.forEach((el, idx) => {
      const type = el.tagName.toLowerCase();
      const text = el.textContent.trim() || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || el.id || 'Button';
      const agentId = ensureAgentId(el, idx + 100);
      const r = el.getBoundingClientRect();

      detectedButtons.push({
        type: type === 'a' ? 'link' : 'button',
        text: text,
        id: el.id || '',
        name: el.getAttribute('name') || '',
        visible: isElementVisible(el),
        enabled: isElementEnabled(el),
        agentId: agentId,
        rect: {
          left: Math.round(r.left),
          top: Math.round(r.top),
          width: Math.round(r.width),
          height: Math.round(r.height)
        }
      });
    });

    console.log(`[Agent] Found ${detectedInputs.length} inputs and ${detectedButtons.length} buttons.`);

    // Page-based signal extraction for Perception Router
    const hasCanvas = document.getElementsByTagName('canvas').length > 0;

    let hasShadow = false;
    let customCount = 0;
    const allElements = document.getElementsByTagName('*');
    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i];
      if (el.shadowRoot) {
        hasShadow = true;
      }
      if (el.tagName && el.tagName.includes('-')) {
        customCount++;
      }
    }

    // Text density calculation (normalized 0 to 1)
    const rawText = document.body ? (document.body.innerText || '') : '';
    const textLength = rawText.replace(/\s+/g, ' ').trim().length;
    const textDensity = Math.min(1.0, Math.round((textLength / 5000) * 1000) / 1000);

    return {
      success: true,
      url: window.location.href,
      title: document.title,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio || 1
      },
      totalInputs: detectedInputs.length,
      totalButtons: detectedButtons.length,
      inputs: detectedInputs,
      buttons: detectedButtons,
      hasCanvas: hasCanvas,
      hasShadowDom: hasShadow,
      customElementCount: customCount,
      textDensity: textDensity
    };
  }

  // =========================================================================
  // 5. DYNAMIC TARGET FINDER (findElement)
  // =========================================================================

  /**
   * Finds an element on the page using multiple search strategies.
   * Priority:
   * 1. Exact data-agent-id
   * 2. ID match
   * 3. Name match
   * 4. Label match (exact or case-insensitive)
   * 5. aria-label match
   * 6. Placeholder match
   * 7. Text content match (for buttons / links)
   * 8. Substring / fuzzy match
   * 
   * @param {string} target 
   * @returns {HTMLElement|null}
   */
  function findElement(target) {
    if (!target || typeof target !== 'string') return null;

    const query = target.trim();
    const lowerQuery = query.toLowerCase();

    // Strategy 1: Match by data-agent-id
    let el = document.querySelector(`[data-agent-id="${CSS.escape(query)}"]`) ||
             document.querySelector(`[data-agent-id="${CSS.escape('agent-' + lowerQuery)}"]`);
    if (el) return el;

    // Strategy 2: Match by ID
    if (document.getElementById(query)) return document.getElementById(query);
    try {
      el = document.querySelector(`#${CSS.escape(query)}`);
      if (el) return el;
    } catch (e) {}

    // Strategy 3: Match by Name attribute
    try {
      el = document.querySelector(`[name="${CSS.escape(query)}"]`);
      if (el) return el;
    } catch (e) {}

    // Gather all interactive elements for label/text matching
    const candidates = Array.from(document.querySelectorAll('input, textarea, select, button, a, [role="button"]'));

    // Strategy 4: Match by detected label
    for (const cand of candidates) {
      const label = resolveLabel(cand);
      if (label && label.toLowerCase() === lowerQuery) {
        return cand;
      }
    }

    // Strategy 5: Match by aria-label or placeholder
    for (const cand of candidates) {
      const aria = cand.getAttribute('aria-label');
      const ph = cand.getAttribute('placeholder');
      if ((aria && aria.toLowerCase() === lowerQuery) || (ph && ph.toLowerCase() === lowerQuery)) {
        return cand;
      }
    }

    // Strategy 6: Match by visible text content (Buttons & Links)
    for (const cand of candidates) {
      const text = (cand.textContent || cand.value || '').trim().toLowerCase();
      if (text === lowerQuery) {
        return cand;
      }
    }

    // Strategy 7: Substring/Fuzzy match on label or text
    for (const cand of candidates) {
      const label = resolveLabel(cand).toLowerCase();
      const text = (cand.textContent || cand.value || '').trim().toLowerCase();

      if ((label && label.includes(lowerQuery)) || (text && text.includes(lowerQuery))) {
        return cand;
      }
    }

    return null;
  }

  // =========================================================================
  // 6. BROWSER CONTROL ACTIONS
  // =========================================================================

  /**
   * Fills an input field programmatically.
   * @param {string} target 
   * @param {string} value 
   * @returns {Object} Structured execution result
   */
  function fillField(target, value) {
    console.log(`[Agent] Action: FILL field "${target}"`);

    const el = findElement(target);

    if (!el) {
      console.warn(`[Agent] Element not found for target: "${target}"`);
      return {
        success: false,
        action: 'FILL',
        target: target,
        error: `Element not found: ${target}`
      };
    }

    if (!isElementVisible(el)) {
      return {
        success: false,
        action: 'FILL',
        target: target,
        error: `Element is not visible: ${target}`
      };
    }

    if (!isElementEnabled(el)) {
      return {
        success: false,
        action: 'FILL',
        target: target,
        error: `Element is disabled: ${target}`
      };
    }

    try {
      // Scroll into view & focus
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();

      // Use prototype setter for compatibility with React / Vue / Angular
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )?.set;

      if (nativeSetter && (el instanceof HTMLInputElement)) {
        nativeSetter.call(el, value);
      } else {
        el.value = value;
      }

      // Dispatch standard DOM events so listeners detect change
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));

      console.log(`[Agent] Successfully filled "${target}"`);

      // NOTE: Do NOT return actual value in success result (Privacy & Security Adjustment #1)
      return {
        success: true,
        action: 'FILL',
        target: target
      };
    } catch (err) {
      console.error(`[Agent] Error filling field "${target}":`, err);
      return {
        success: false,
        action: 'FILL',
        target: target,
        error: err.message || 'Failed to set field value'
      };
    }
  }

  /**
   * Clicks a button or interactive element programmatically.
   * @param {string} target 
   * @returns {Object} Structured execution result
   */
  function clickElement(target) {
    console.log(`[Agent] Action: CLICK element "${target}"`);

    const el = findElement(target);

    if (!el) {
      console.warn(`[Agent] Element not found for target: "${target}"`);
      return {
        success: false,
        action: 'CLICK',
        target: target,
        error: `Element not found: ${target}`
      };
    }

    if (!isElementVisible(el)) {
      return {
        success: false,
        action: 'CLICK',
        target: target,
        error: `Element is not visible: ${target}`
      };
    }

    if (!isElementEnabled(el)) {
      return {
        success: false,
        action: 'CLICK',
        target: target,
        error: `Element is disabled: ${target}`
      };
    }

    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();

      // Simple, standard DOM click (Click adjustment #2)
      el.click();

      console.log(`[Agent] Click successful on "${target}"`);

      return {
        success: true,
        action: 'CLICK',
        target: target
      };
    } catch (err) {
      console.error(`[Agent] Error clicking target "${target}":`, err);
      return {
        success: false,
        action: 'CLICK',
        target: target,
        error: err.message || 'Click action failed'
      };
    }
  }

  /**
   * Scrolls the window in the specified direction.
   * @param {string} direction ('up'|'down'|'top'|'bottom')
   * @returns {Object} Structured execution result
   */
  function scrollPage(direction) {
    console.log(`[Agent] Action: SCROLL "${direction}"`);

    const normalizedDir = (direction || 'down').toLowerCase();

    try {
      switch (normalizedDir) {
        case 'down':
          window.scrollBy({ top: window.innerHeight * 0.75, behavior: 'smooth' });
          break;
        case 'up':
          window.scrollBy({ top: -window.innerHeight * 0.75, behavior: 'smooth' });
          break;
        case 'top':
          window.scrollTo({ top: 0, behavior: 'smooth' });
          break;
        case 'bottom':
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
          break;
        default:
          return {
            success: false,
            action: 'SCROLL',
            direction: direction,
            error: `Invalid direction: ${direction}. Use 'up', 'down', 'top', or 'bottom'.`
          };
      }

      return {
        success: true,
        action: 'SCROLL',
        direction: normalizedDir
      };
    } catch (err) {
      return {
        success: false,
        action: 'SCROLL',
        direction: direction,
        error: err.message || 'Scroll failed'
      };
    }
  }

  // =========================================================================
  // 7. MESSAGE LISTENER
  // =========================================================================

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request || !request.type) {
      sendResponse({ success: false, error: 'Invalid message request payload' });
      return true;
    }

    switch (request.type) {
      case 'SCAN_PAGE': {
        const result = scanPage();
        sendResponse(result);
        break;
      }

      case 'FILL_FIELD': {
        const result = fillField(request.target, request.value);
        sendResponse(result);
        break;
      }

      case 'CLICK_ELEMENT': {
        const result = clickElement(request.target);
        sendResponse(result);
        break;
      }

      case 'SCROLL_PAGE': {
        const result = scrollPage(request.direction);
        sendResponse(result);
        break;
      }

      default: {
        sendResponse({
          success: false,
          error: `Unknown action type: ${request.type}`
        });
        break;
      }
    }

    return true; // Keeps messaging channel open for asynchronous sendResponse
  });

})();
