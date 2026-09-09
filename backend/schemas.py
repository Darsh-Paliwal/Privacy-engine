from typing import Optional, Literal, Any, Dict, List
from pydantic import BaseModel, Field

class TestRequest(BaseModel):
    prompt: str = Field(..., description="Prompt text string to send to Qwen3.8-Flash")

class TestResponse(BaseModel):
    success: bool = Field(..., description="Indicates whether the API call succeeded")
    response: Optional[str] = Field(None, description="The response text from Qwen3.8-Flash")
    error: Optional[str] = Field(None, description="Error message if the API call failed")

class Action(BaseModel):
    action: Literal["FILL", "CLICK", "SCROLL", "SELECT", "WAIT"] = Field(..., description="Browser action type")
    target: str = Field(..., description="Target element identifier extracted from page context")
    source: Optional[str] = Field(None, description="Data source reference, e.g. LOCAL_PROFILE.email")
    direction: Optional[str] = Field(None, description="Scroll direction: up, down, top, or bottom")
    value: Optional[str] = Field(None, description="Direct text value - FORBIDDEN for sensitive profile fields")

class ReasonRequest(BaseModel):
    task: str = Field(..., description="User task description, e.g. 'Fill form using my profile'")
    context: Dict[str, Any] = Field(..., description="Sanitized browser context representation")

class ReasonResponse(BaseModel):
    success: bool = Field(..., description="Indicates overall success of reasoning and action validation")
    status: Literal["CONTINUE", "DONE", "NEED_USER", "ERROR"] = Field(..., description="Recommended execution status")
    actions: List[Action] = Field(default_factory=list, description="Validated list of browser actions")
    error: Optional[str] = Field(None, description="Detailed explanation if reasoning or validation failed")
