from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from schemas import TestRequest, TestResponse, ReasonRequest, ReasonResponse
from agent import ask_qwen, reason_about_page

app = FastAPI(
    title="Browser Agent Backend",
    description="Backend foundation and reasoning layer for SIH 26171 Lightweight Browser Agent",
    version="1.0.0"
)

# CORS origin regex targeting localhost, 127.0.0.1, and Chrome Extensions
CORS_ORIGIN_REGEX = r"^(https?://(localhost|127\.0\.0\.1)(:\d+)?|chrome-extension://.*)$"

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "browser-agent-backend"
    }

@app.post("/test-qwen", response_model=TestResponse)
def test_qwen(request: TestRequest):
    try:
        response_text = ask_qwen(request.prompt)
        return TestResponse(
            success=True,
            response=response_text,
            error=None
        )
    except Exception as err:
        return TestResponse(
            success=False,
            response=None,
            error=str(err)
        )

@app.post("/reason", response_model=ReasonResponse)
def reason_endpoint(request: ReasonRequest):
    return reason_about_page(task=request.task, context=request.context)
