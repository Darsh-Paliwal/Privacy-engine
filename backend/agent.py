import os
import json
from typing import Tuple, Set, Optional, Dict, Any, List
from dotenv import load_dotenv
from openai import OpenAI
from schemas import Action, ReasonResponse

# Load environment variables from .env file
load_dotenv()

DEFAULT_MODEL = "qwen3.8-flash"
DEFAULT_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"

SYSTEM_PROMPT_REASONING = """You are an intelligent, lightweight browser-agent reasoning engine.
Your sole responsibility is to analyze a user's high-level task along with a sanitized web page context, and generate a structured sequence of browser actions to achieve the task.

PRIVACY & SAFETY CONTRACT (CRITICAL):
1. You operate strictly on SANITIZED browser context containing semantic placeholders (e.g. <PERSON>, <EMAIL>, <PHONE>, <ADDRESS>, <FILE_ATTACHMENT_MISSING>, <FILE_ATTACHMENT_PRESENT>).
2. You NEVER possess, request, or invent actual private user values (e.g. real emails, passwords, phone numbers, addresses).
3. For any "FILL" action on a sensitive profile field, you MUST set "source" to a local profile reference such as:
   - "LOCAL_PROFILE.name"
   - "LOCAL_PROFILE.email"
   - "LOCAL_PROFILE.phone"
   - "LOCAL_PROFILE.address"
   - "LOCAL_PROFILE.college"
   - "LOCAL_FILE"
4. For "FILL" actions, you MUST NOT include a "value" string. The "value" attribute MUST be omitted/null.
5. You MUST ONLY target element identifiers ("target") that explicitly exist in the provided context's "fields" or "buttons" arrays.
6. FORBIDDEN: Do NOT generate arbitrary code, JavaScript, shell commands, or unformatted text.

FILE ATTACHMENT RULES (CRITICAL):
1. UNATTACHED FILE (<FILE_ATTACHMENT_MISSING>):
   - If a required file field has placeholder <FILE_ATTACHMENT_MISSING> (source: LOCAL_FILE_REQUIRED), the file is NOT yet attached.
   - You MUST still generate FILL actions for any safe, fillable non-file fields (such as Address).
   - You MUST NOT return a CLICK action on "Submit Application" or any submission button.
   - Set "status": "NEED_USER".
2. ATTACHED FILE (<FILE_ATTACHMENT_PRESENT>):
   - If a file field has placeholder <FILE_ATTACHMENT_PRESENT> (source: LOCAL_FILE_ATTACHED), the file requirement IS ALREADY SATISFIED.
   - The mere presence of an inputType="file" or category="FILE_INPUT" field is NOT a reason to return NEED_USER when placeholder is <FILE_ATTACHMENT_PRESENT>.
   - If all required fields are satisfied and submission is the next step, set "status": "CONTINUE" and generate a CLICK action on "Submit Application" (or submission button).

STATUS & NAVIGATION RULES:
1. "status": "DONE" -> Set when viewing a success/confirmation page (e.g. success.html, title/content containing "Application Submitted" or "Success"), or when all task actions are complete. Return empty "actions": [].
2. "status": "NEED_USER" -> Set ONLY when a required input field cannot be filled automatically (e.g. placeholder is <FILE_ATTACHMENT_MISSING> requiring manual file upload) or required profile info is missing.
3. "status": "CONTINUE" -> Set when executable actions remain to progress the task (e.g. submitting a form when all fields including <FILE_ATTACHMENT_PRESENT> are satisfied).
4. "status": "ERROR" -> Set if the page state or context prevents achieving the task.

OUTPUT FORMAT: Respond ONLY with a valid JSON object matching this schema:

{
  "status": "CONTINUE" | "DONE" | "NEED_USER" | "ERROR",
  "actions": [
    {
      "action": "FILL",
      "target": "target-id-from-context",
      "source": "LOCAL_PROFILE.name"
    },
    {
      "action": "CLICK",
      "target": "target-id-from-context"
    },
    {
      "action": "SCROLL",
      "target": "",
      "direction": "down"
    }
  ]
}
"""

def get_qwen_config() -> Tuple[str, str, str]:
    """Retrieves Qwen configuration tuple (api_key, model, base_url)."""
    api_key = os.getenv("DASHSCOPE_API_KEY", "").strip()
    model = os.getenv("QWEN_MODEL", DEFAULT_MODEL).strip()
    base_url = os.getenv("QWEN_BASE_URL", DEFAULT_BASE_URL).strip()
    return api_key, model, base_url

def ask_qwen(prompt: str) -> str:
    """Sends a simple prompt string to Qwen3.8-Flash."""
    api_key, model, base_url = get_qwen_config()

    if not api_key or api_key == "YOUR_API_KEY_HERE":
        raise ValueError("DASHSCOPE_API_KEY is missing or unconfigured in environment/.env file.")

    client = OpenAI(api_key=api_key, base_url=base_url)

    completion = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        extra_body={"enable_thinking": False}
    )

    if not completion.choices or len(completion.choices) == 0:
        raise RuntimeError("No response choices returned from Qwen API.")

    content = completion.choices[0].message.content
    return content if content is not None else ""

def extract_valid_targets(context: Dict[str, Any]) -> Set[str]:
    """Dynamically extracts all valid element target identifiers from page context."""
    valid = set()
    if not isinstance(context, dict):
        return valid

    # Extract field targets
    fields = context.get("fields", [])
    if isinstance(fields, list):
        for f in fields:
            if isinstance(f, dict):
                for key in ("target", "id", "agentId"):
                    val = f.get(key)
                    if val and isinstance(val, str):
                        valid.add(val.strip())

    # Extract button targets
    buttons = context.get("buttons", [])
    if isinstance(buttons, list):
        for b in buttons:
            if isinstance(b, dict):
                for key in ("target", "id", "agentId", "text"):
                    val = b.get(key)
                    if val and isinstance(val, str):
                        valid.add(val.strip())

    return valid

def validate_action_plan(actions: List[Action], context: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """
    Rigorously validates action plan against privacy rules and context targets:
    1. Target Validation: 'target' MUST exist in valid targets collected from context.
    2. FILL Rule 1: 'source' is REQUIRED for FILL actions.
    3. FILL Rule 2: 'value' MUST be null/absent for FILL actions.
    4. FILL Rule 3: Any FILL action with direct 'value' is REJECTED.
    5. FILL Rule 4: Any FILL action with BOTH 'source' AND 'value' is REJECTED.
    """
    valid_targets = extract_valid_targets(context)

    for idx, act in enumerate(actions):
        act_num = idx + 1

        # Target Validation
        if act.action in ("FILL", "CLICK", "SELECT"):
            if not act.target or act.target not in valid_targets:
                return False, f"Action #{act_num} ({act.action}) specifies invalid target '{act.target}' not found in page context."

        # Strict FILL Validation Rules
        if act.action == "FILL":
            if not act.source or not act.source.strip():
                return False, f"Action #{act_num} (FILL) on '{act.target}' is missing required 'source' field."
            if act.value is not None and str(act.value).strip() != "":
                return False, f"Action #{act_num} (FILL) on '{act.target}' contains direct 'value'. Direct values are strictly forbidden for security."
            if act.source and act.value:
                return False, f"Action #{act_num} (FILL) on '{act.target}' contains both 'source' and 'value'. This combination is forbidden."

        # SCROLL Validation
        if act.action == "SCROLL":
            valid_dirs = {"up", "down", "top", "bottom"}
            if act.direction and act.direction.lower() not in valid_dirs:
                return False, f"Action #{act_num} (SCROLL) specifies invalid direction '{act.direction}'."

    return True, None

def parse_json_payload(raw_text: str) -> Dict[str, Any]:
    """Strips markdown fences and parses raw JSON string cleanly."""
    text = raw_text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        # Remove opening ```json or ```
        if lines[0].startswith("```"):
            lines = lines[1:]
        # Remove closing ```
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    return json.loads(text)

def reason_about_page(task: str, context: Dict[str, Any]) -> ReasonResponse:
    """
    Sends task + sanitized context to Qwen3.8-Flash, parses action plan,
    and runs validate_action_plan before returning ReasonResponse.
    """
    api_key, model, base_url = get_qwen_config()

    if not api_key or api_key == "YOUR_API_KEY_HERE":
        return ReasonResponse(
            success=False,
            status="ERROR",
            actions=[],
            error="DASHSCOPE_API_KEY is missing or unconfigured in environment/.env file."
        )

    user_payload = {
        "task": task,
        "context": context
    }

    try:
        client = OpenAI(api_key=api_key, base_url=base_url)

        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT_REASONING},
                {"role": "user", "content": json.dumps(user_payload, indent=2)}
            ],
            extra_body={"enable_thinking": False}
        )

        if not completion.choices or len(completion.choices) == 0:
            return ReasonResponse(
                success=False,
                status="ERROR",
                actions=[],
                error="No response returned from Qwen API."
            )

        raw_output = completion.choices[0].message.content or ""
        parsed_dict = parse_json_payload(raw_output)

        status = parsed_dict.get("status", "CONTINUE")
        raw_actions = parsed_dict.get("actions", [])

        # Parse actions into Pydantic models
        actions_list = [Action(**a) for a in raw_actions]

        # Execute Strict Validation
        is_valid, err_msg = validate_action_plan(actions_list, context)
        if not is_valid:
            return ReasonResponse(
                success=False,
                status="ERROR",
                actions=[],
                error=f"Action Plan Validation Rejected: {err_msg}"
            )

        return ReasonResponse(
            success=True,
            status=status,
            actions=actions_list,
            error=None
        )

    except Exception as err:
        return ReasonResponse(
            success=False,
            status="ERROR",
            actions=[],
            error=f"Reasoning Error: {str(err)}"
        )
