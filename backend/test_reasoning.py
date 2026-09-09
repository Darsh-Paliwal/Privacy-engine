"""
Phase 4B Verification & Adversarial Validation Test Suite
Tests validate_action_plan directly for privacy compliance and dynamic target enforcement.
"""

from schemas import Action
from agent import validate_action_plan, extract_valid_targets

# Sample sanitized Page 1 context matching Phase 3 specifications (No actual PII values)
SANITY_CONTEXT = {
  "success": True,
  "url": "file:///D:/SIH/demo-website/index.html",
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
        "sensitive": True,
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
        "sensitive": True,
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
        "sensitive": True,
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
        "sensitive": False,
        "category": "NON_SENSITIVE",
        "placeholder": None,
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

def test_dynamic_target_extraction():
    targets = extract_valid_targets(SANITY_CONTEXT)
    expected = {"agent-name", "agent-email", "agent-phone", "agent-college", "agent-el-100", "Next"}
    assert targets == expected, f"Dynamic target extraction failed: {targets} != {expected}"
    print("[PASS] Dynamic Target Extraction Passed:", targets)

def test_adversarial_validation():
    # Test 1: Action containing direct value (FORBIDDEN)
    bad_action_1 = [
        Action(action="FILL", target="agent-email", value="test_value_direct")
    ]
    is_valid, err = validate_action_plan(bad_action_1, SANITY_CONTEXT)
    assert not is_valid, "Failed to reject action with direct value!"
    print("[PASS] Adversarial Test 1 Passed (Direct value rejected):", err)

    # Test 2: Action containing BOTH source and value (FORBIDDEN)
    bad_action_2 = [
        Action(action="FILL", target="agent-email", source="LOCAL_PROFILE.email", value="test_value_both")
    ]
    is_valid, err = validate_action_plan(bad_action_2, SANITY_CONTEXT)
    assert not is_valid, "Failed to reject action with both source and value!"
    print("[PASS] Adversarial Test 2 Passed (Both source and value rejected):", err)

    # Test 3: Action containing fake target not in context (FORBIDDEN)
    bad_action_3 = [
        Action(action="CLICK", target="fake-target")
    ]
    is_valid, err = validate_action_plan(bad_action_3, SANITY_CONTEXT)
    assert not is_valid, "Failed to reject invented target!"
    print("[PASS] Adversarial Test 3 Passed (Invented target rejected):", err)

    # Test 4: Valid Action Plan (ACCEPTED)
    good_actions = [
        Action(action="FILL", target="agent-name", source="LOCAL_PROFILE.name"),
        Action(action="FILL", target="agent-email", source="LOCAL_PROFILE.email"),
        Action(action="FILL", target="agent-phone", source="LOCAL_PROFILE.phone"),
        Action(action="CLICK", target="agent-el-100")
    ]
    is_valid, err = validate_action_plan(good_actions, SANITY_CONTEXT)
    assert is_valid, f"Valid action plan was incorrectly rejected: {err}"
    print("[PASS] Valid Action Plan Test Passed (Plan Accepted cleanly)")

def test_page2_file_attachment_contexts():
    page2_missing = {
        "success": True,
        "url": "file:///D:/SIH/demo-website/page2.html",
        "title": "Job Application - Step 2",
        "fields": [
            {
                "target": "agent-address",
                "label": "Address",
                "type": "input",
                "inputType": "text",
                "privacy": {
                    "sensitive": True,
                    "category": "ADDRESS",
                    "placeholder": "<ADDRESS>",
                    "source": "LOCAL_PROFILE.address"
                }
            },
            {
                "target": "agent-resume",
                "label": "Resume",
                "type": "input",
                "inputType": "file",
                "privacy": {
                    "sensitive": True,
                    "category": "FILE_INPUT",
                    "placeholder": "<FILE_ATTACHMENT_MISSING>",
                    "source": "LOCAL_FILE_REQUIRED"
                }
            }
        ],
        "buttons": [
            {"target": "agent-submit", "text": "Submit Application", "type": "button"}
        ]
    }

    page2_present = {
        "success": True,
        "url": "file:///D:/SIH/demo-website/page2.html",
        "title": "Job Application - Step 2",
        "fields": [
            {
                "target": "agent-address",
                "label": "Address",
                "type": "input",
                "inputType": "text",
                "privacy": {
                    "sensitive": True,
                    "category": "ADDRESS",
                    "placeholder": "<ADDRESS>",
                    "source": "LOCAL_PROFILE.address"
                }
            },
            {
                "target": "agent-resume",
                "label": "Resume",
                "type": "input",
                "inputType": "file",
                "privacy": {
                    "sensitive": True,
                    "category": "FILE_INPUT",
                    "placeholder": "<FILE_ATTACHMENT_PRESENT>",
                    "source": "LOCAL_FILE_ATTACHED"
                }
            }
        ],
        "buttons": [
            {"target": "agent-submit", "text": "Submit Application", "type": "button"}
        ]
    }

    targets_missing = extract_valid_targets(page2_missing)
    targets_present = extract_valid_targets(page2_present)

    assert "agent-address" in targets_missing and "agent-resume" in targets_missing and "agent-submit" in targets_missing
    assert "agent-address" in targets_present and "agent-resume" in targets_present and "agent-submit" in targets_present

    # Test Action Plan for Page 2 Present (Submit CLICK action valid)
    submit_plan = [
        Action(action="CLICK", target="agent-submit")
    ]
    is_valid, err = validate_action_plan(submit_plan, page2_present)
    assert is_valid, f"Submit action plan rejected for Page 2 Present: {err}"
    print("[PASS] Page 2 File Attachment Contexts Test Passed (Targets extracted & Submit action validated)")

if __name__ == "__main__":
    print("=== Running Phase 4B Unit & Adversarial Tests ===")
    test_dynamic_target_extraction()
    test_adversarial_validation()
    test_page2_file_attachment_contexts()
    print("=== All Validation Tests Passed Successfully ===")
