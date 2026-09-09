# Browser Agent Chrome Extension - Phase 3 (Local Profile & Privacy Engine)

> **SIH Problem Statement 26171**: On-device Visual Perception for Lightweight Browser Agents  
> **Phase 3 Status**: Completed (Local Profile + Privacy Boundary & Context Sanitization)

---

## 1. Overview & Purpose

Phase 3 establishes the **On-Device Local Privacy Boundary** before integrating AI reasoning engines (Qwen-VL / LLMs).

### Key Accomplishments in Phase 3
1. **Local Profile Storage**: User profile attributes (Name, Email, Phone, College, Address) are stored strictly on-device using `chrome.storage.local`.
2. **DOM-Based Privacy Classification**: Rule-based privacy engine classifies DOM elements (`PERSON`, `EMAIL`, `PHONE`, `ADDRESS`, `PASSWORD`, `FILE_INPUT`, `NON_SENSITIVE`) based purely on page metadata without needing or reading actual profile values.
3. **Context Sanitization**: Generates sanitized page context for future cloud/AI models where sensitive fields contain semantic placeholders (`<PERSON>`, `<EMAIL>`, `<PHONE>`, `<ADDRESS>`) and **zero** raw private profile values.
4. **Local Placeholder Mapping**: Keeps mapping between placeholders (`<EMAIL>`) and local profile references (`LOCAL_PROFILE.email`) strictly on-device.

---

## 2. Privacy Architecture Pipeline

```
┌──────────────────────────────────────────────────────────────┐
│                    DOM Perception Layer                      │
│                  scanPage() (content.js)                     │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                   Privacy Engine (privacy.js)                │
│    DOM Metadata (labels, types, id, name, autocomplete)      │
│              ---> NO PROFILE DATA REQUIRED <---              │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                   Sanitized Context Payload                  │
│       {"label": "Email", "value": "<EMAIL>",                 │
│        "source": "LOCAL_PROFILE.email"}                      │
│            ---> NO REAL DATA (darsh@example.com) <---        │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼ [Future AI Model]
┌──────────────────────────────────────────────────────────────┐
│                  Action JSON Generation                      │
│  {"action": "FILL", "target": "Email",                       │
│   "source": "LOCAL_PROFILE.email"}                           │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                 Local Action Execution Layer                 │
│ 1. Resolve LOCAL_PROFILE.email from chrome.storage.local     │
│ 2. Call fillField("Email", "darsh@example.com") locally       │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Project File Structure

```
extension/
├── manifest.json      # Manifest V3 extension configuration (storage, activeTab, scripting)
├── privacy.js         # Modular Privacy Engine (classification, sanitization, placeholders)
├── popup.html         # Extension Popup UI (Tabs for Perception, Privacy, and Profile)
├── popup.css          # Styling for Popup UI & Privacy Badges
├── popup.js           # Extension Popup controller & local profile manager
├── content.js         # Content script: Perception engine, target matcher & controller
└── README.md          # Comprehensive documentation and setup guide
```

---

## 4. Installation Instructions (Chrome Developer Mode)

1. Open **Google Chrome**.
2. Navigate to `chrome://extensions/` in the address bar.
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** in the top-left menu.
5. Select the `extension/` directory from this project (`d:\SIH\extension`).
6. Enable **"Allow access to file URLs"** in details if testing local HTML files directly.

---

## 5. Local Profile Management

The local profile is managed via the **Profile** tab in the extension popup:
- **Storage API**: `chrome.storage.local`
- **Fields**:
  - `name`: "Darsh"
  - `email`: "darsh@example.com"
  - `phone`: "9876543210"
  - `college`: "ABC University"
  - `address`: "Indore, Madhya Pradesh"
- **Security Notice**: `"🔒 Stored locally in this browser"`
- Profile values are **NEVER** placed in URLs, query parameters, network requests, console logs, or sanitized context previews.

---

## 6. Privacy Classification Rules (`privacy.js`)

| Category | Input / Metadata Match Criteria | Placeholder | Resolved Source | Sensitive? |
| :--- | :--- | :--- | :--- | :---: |
| **`PERSON`** | `full name`, `first name`, `last name`, `fname`, `lname`, `\bname\b` | `<PERSON>` | `LOCAL_PROFILE.name` | Yes |
| **`EMAIL`** | `inputType="email"`, `email`, `mail`, `autocomplete="email"` | `<EMAIL>` | `LOCAL_PROFILE.email` | Yes |
| **`PHONE`** | `inputType="tel"`, `phone`, `mobile`, `tel`, `cell`, `contact` | `<PHONE>` | `LOCAL_PROFILE.phone` | Yes |
| **`ADDRESS`** | `textarea`, `address`, `street`, `city`, `state`, `pincode` | `<ADDRESS>` | `LOCAL_PROFILE.address` | Yes |
| **`PASSWORD`** | `inputType="password"`, `password`, `pin`, `secret` | `<PASSWORD>` | `SENSITIVE_SECRET` | Yes |
| **`FILE_INPUT`** | `inputType="file"`, `resume`, `cv`, `upload` | `<FILE_ATTACHMENT>` | `LOCAL_FILE` | Yes |
| **`NON_SENSITIVE`** | `college`, `university`, `school`, `degree`, public text fields | *None* | `USER_INPUT` | No |

---

## 7. Example Sanitized Context Representation

### Original DOM Page State (Page 1)
- Input: `Full Name`
- Input: `Email`
- Input: `Phone`
- Input: `College`

### Cloud-Facing Sanitized Representation (`sanitizePageData()`)
```json
{
  "success": true,
  "url": "file:///d:/SIH/demo-website/index.html",
  "title": "Job Application - Step 1",
  "privacySummary": {
    "totalElements": 5,
    "sensitiveCount": 3,
    "nonSensitiveCount": 1,
    "transmissionState": "NOT_CONNECTED",
    "storageState": "LOCAL_ONLY"
  },
  "fields": [
    {
      "target": "agent-name",
      "label": "Full Name",
      "type": "input",
      "inputType": "text",
      "privacy": {
        "sensitive": true,
        "category": "PERSON",
        "placeholder": "<PERSON>",
        "source": "LOCAL_PROFILE.name"
      }
    },
    {
      "target": "agent-email",
      "label": "Email",
      "type": "input",
      "inputType": "email",
      "privacy": {
        "sensitive": true,
        "category": "EMAIL",
        "placeholder": "<EMAIL>",
        "source": "LOCAL_PROFILE.email"
      }
    },
    {
      "target": "agent-phone",
      "label": "Phone",
      "type": "input",
      "inputType": "tel",
      "privacy": {
        "sensitive": true,
        "category": "PHONE",
        "placeholder": "<PHONE>",
        "source": "LOCAL_PROFILE.phone"
      }
    },
    {
      "target": "agent-college",
      "label": "College",
      "type": "input",
      "inputType": "text",
      "privacy": {
        "sensitive": false,
        "category": "NON_SENSITIVE",
        "placeholder": null,
        "source": "USER_INPUT"
      }
    }
  ],
  "buttons": [
    {
      "target": "agent-el-100",
      "text": "Next",
      "type": "button"
    }
  ]
}
```

> [!NOTE]
> Notice that `darsh@example.com`, `Darsh`, and `9876543210` do **NOT** exist anywhere inside this sanitized context object!

---

## 8. Verification & Testing Checklist

- [x] **Test 1**: Local profile saves and persists via `chrome.storage.local`.
- [x] **Test 2**: Privacy scan classifies `Full Name` -> `PERSON`, `Email` -> `EMAIL`, `Phone` -> `PHONE`, `College` -> `NON_SENSITIVE`.
- [x] **Test 3**: `Preview Sanitized Context` displays `<PERSON>`, `<EMAIL>`, `<PHONE>`, `<ADDRESS>` placeholders with **zero** raw private profile values.
- [x] **Test 4**: Code audit confirms `darsh@example.com` or private values are never hardcoded or printed to console.
- [x] **Test 5**: All Phase 2 browser control functions (`scanPage`, `fillField`, `clickElement`, `scrollPage`) remain fully functional.
