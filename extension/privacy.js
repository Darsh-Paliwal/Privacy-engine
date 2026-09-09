/**
 * Browser Agent Privacy Engine - Phase 3
 * 
 * Provides DOM-based privacy classification and page context sanitization.
 * Operates strictly on page metadata (labels, types, attributes) without reading
 * or exposing actual local profile values.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AgentPrivacyEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use Object';

  // =========================================================================
  // 1. CLASSIFICATION CATEGORIES & RULES
  // =========================================================================

  const CATEGORIES = {
    PERSON: {
      category: 'PERSON',
      placeholder: '<PERSON>',
      source: 'LOCAL_PROFILE.name',
      sensitive: true
    },
    EMAIL: {
      category: 'EMAIL',
      placeholder: '<EMAIL>',
      source: 'LOCAL_PROFILE.email',
      sensitive: true
    },
    PHONE: {
      category: 'PHONE',
      placeholder: '<PHONE>',
      source: 'LOCAL_PROFILE.phone',
      sensitive: true
    },
    ADDRESS: {
      category: 'ADDRESS',
      placeholder: '<ADDRESS>',
      source: 'LOCAL_PROFILE.address',
      sensitive: true
    },
    PASSWORD: {
      category: 'PASSWORD',
      placeholder: '<PASSWORD>',
      source: 'SENSITIVE_SECRET',
      sensitive: true
    },
    FILE_INPUT: {
      category: 'FILE_INPUT',
      placeholder: '<FILE_ATTACHMENT>',
      source: 'LOCAL_FILE',
      sensitive: true
    },
    COLLEGE: {
      category: 'NON_SENSITIVE',
      placeholder: null,
      source: 'LOCAL_PROFILE.college',
      sensitive: false
    },
    NON_SENSITIVE: {
      category: 'NON_SENSITIVE',
      placeholder: null,
      source: 'USER_INPUT',
      sensitive: false
    }
  };

  /**
   * Classifies a DOM element based purely on its structural metadata.
   * Does NOT read or require actual user profile values.
   * 
   * @param {Object} elementData Metadata extracted during DOM scan
   * @returns {Object} Privacy classification payload
   */
  function classifyElement(elementData) {
    if (!elementData) return CATEGORIES.NON_SENSITIVE;

    const type = (elementData.type || '').toLowerCase();
    const inputType = (elementData.inputType || '').toLowerCase();
    const label = (elementData.label || '').toLowerCase();
    const id = (elementData.id || '').toLowerCase();
    const name = (elementData.name || '').toLowerCase();
    const placeholder = (elementData.placeholder || '').toLowerCase();
    const ariaLabel = (elementData.ariaLabel || '').toLowerCase();
    const autocomplete = (elementData.autocomplete || '').toLowerCase();

    // Combine metadata signals into searchable text
    const metaString = `${label} ${id} ${name} ${placeholder} ${ariaLabel} ${autocomplete}`.trim();

    // 1. Check File Inputs
    if (inputType === 'file' || type === 'file' || /\b(resume|cv|file|upload|document)\b/i.test(metaString)) {
      if (elementData && elementData.hasFile) {
        return {
          category: 'FILE_INPUT',
          placeholder: '<FILE_ATTACHMENT_PRESENT>',
          source: 'LOCAL_FILE_ATTACHED',
          sensitive: true
        };
      } else {
        return {
          category: 'FILE_INPUT',
          placeholder: '<FILE_ATTACHMENT_MISSING>',
          source: 'LOCAL_FILE_REQUIRED',
          sensitive: true
        };
      }
    }

    // 2. Check Passwords
    if (inputType === 'password' || /\b(password|passcode|pin|secret)\b/i.test(metaString)) {
      return CATEGORIES.PASSWORD;
    }

    // 3. Check Email
    if (inputType === 'email' || autocomplete.includes('email') || /\b(email|e-mail|mail)\b/i.test(metaString)) {
      return CATEGORIES.EMAIL;
    }

    // 4. Check Phone
    if (inputType === 'tel' || autocomplete.includes('tel') || /\b(phone|mobile|telephone|tel|cell|contact)\b/i.test(metaString)) {
      return CATEGORIES.PHONE;
    }

    // 5. Check Address
    if (type === 'textarea' || autocomplete.includes('address') || /\b(address|street|city|state|zip|pincode|location)\b/i.test(metaString)) {
      return CATEGORIES.ADDRESS;
    }

    // 6. Check College / University / Education fields (NON_SENSITIVE, source: LOCAL_PROFILE.college)
    if (/\b(college|university|school|institution|degree|major)\b/i.test(metaString)) {
      return CATEGORIES.COLLEGE;
    }

    // 7. Check Other Non-Sensitive Exceptions
    if (/\b(organization|company|subject|title)\b/i.test(metaString)) {
      return CATEGORIES.NON_SENSITIVE;
    }

    // 7. Check Person Name (using word boundaries to avoid false positives)
    if (
      autocomplete.includes('name') ||
      /\b(full name|first name|last name|fname|lname|user name|applicant name)\b/i.test(metaString) ||
      /\bname\b/i.test(metaString)
    ) {
      return CATEGORIES.PERSON;
    }

    // Default to NON_SENSITIVE for unclassified fields
    return CATEGORIES.NON_SENSITIVE;
  }

  /**
   * Transforms DOM scan results into a sanitized representation suitable for an AI model.
   * Removes all actual values and replaces sensitive attributes with semantic placeholders.
   * 
   * @param {Object} scanResult Output from scanPage()
   * @returns {Object} Sanitized page context representation
   */
  function sanitizePageData(scanResult) {
    if (!scanResult || !scanResult.success) {
      return {
        success: false,
        error: 'Invalid scan result'
      };
    }

    const sanitizedInputs = (scanResult.inputs || []).map(inp => {
      const classification = classifyElement(inp);

      return {
        target: inp.agentId || inp.id || inp.name || inp.label,
        label: inp.label || inp.id || inp.name || 'Input',
        type: inp.type,
        inputType: inp.inputType,
        privacy: {
          sensitive: classification.sensitive,
          category: classification.category,
          placeholder: classification.placeholder,
          source: classification.source
        }
      };
    });

    const sanitizedButtons = (scanResult.buttons || []).map(btn => ({
      target: btn.agentId || btn.id || btn.text,
      text: btn.text,
      type: btn.type
    }));

    return {
      success: true,
      url: scanResult.url,
      title: scanResult.title,
      privacySummary: {
        totalElements: sanitizedInputs.length + sanitizedButtons.length,
        sensitiveCount: sanitizedInputs.filter(i => i.privacy.sensitive).length,
        nonSensitiveCount: sanitizedInputs.filter(i => !i.privacy.sensitive).length,
        transmissionState: 'NOT_CONNECTED',
        storageState: 'LOCAL_ONLY'
      },
      fields: sanitizedInputs,
      buttons: sanitizedButtons
    };
  }

  /**
   * Returns the local mapping table between placeholders and local profile references.
   * @returns {Object}
   */
  function getPlaceholderMapping() {
    return {
      '<PERSON>': 'LOCAL_PROFILE.name',
      '<EMAIL>': 'LOCAL_PROFILE.email',
      '<PHONE>': 'LOCAL_PROFILE.phone',
      '<ADDRESS>': 'LOCAL_PROFILE.address',
      '<PASSWORD>': 'SENSITIVE_SECRET',
      '<FILE_ATTACHMENT_MISSING>': 'LOCAL_FILE_REQUIRED',
      '<FILE_ATTACHMENT_PRESENT>': 'LOCAL_FILE_ATTACHED'
    };
  }

  return {
    classifyElement,
    sanitizePageData,
    getPlaceholderMapping,
    CATEGORIES
  };
});
