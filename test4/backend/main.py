import io
import json
import os

import httpx
import pdfplumber
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

load_dotenv()

app = FastAPI(title="智能问诊 AI 对话机器人")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_BASE_URL = "https://api.xiaomimimo.com/v1"
API_KEY = os.getenv("ANTHROPIC_API_KEY")
MODEL = "mimo-v2.5-pro"

SYSTEM_PROMPT = """你是一位专业的医疗问诊助手。你的职责是：
1. 耐心倾听用户描述的症状和不适
2. 通过合理的追问了解病情细节
3. 提供初步的健康建议和可能的病因分析
4. 在必要时建议用户及时就医

重要提醒：
- 你不能开具处方或进行确诊
- 涉及严重症状（如胸痛、呼吸困难、大出血等）时，必须建议立即就医
- 始终保持专业、温和、关怀的态度
- 回复使用中文
"""


@app.post("/api/chat")
async def chat(request: dict):
    messages = request.get("messages", [])
    api_messages = [{"role": "system", "content": SYSTEM_PROMPT}] + messages

    def generate():
        with httpx.stream(
            "POST",
            f"{API_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": MODEL,
                "max_tokens": 4096,
                "stream": True,
                "messages": api_messages,
            },
            timeout=120,
        ) as resp:
            for line in resp.iter_lines():
                if not line.startswith("data: "):
                    continue
                data_str = line[6:]
                if data_str.strip() == "[DONE]":
                    break
                try:
                    chunk = json.loads(data_str)
                    delta = chunk["choices"][0]["delta"]
                    content = delta.get("content")
                    if content:
                        yield f"data: {json.dumps({'content': content}, ensure_ascii=False)}\n\n"
                except (json.JSONDecodeError, KeyError, IndexError):
                    pass
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/api/health")
async def health():
    return {"status": "ok"}


REPORT_ANALYSIS_PROMPT = """你是一位专业的体检报告分析助手。请分析以下体检报告内容，输出严格 JSON 格式（不要包含 markdown 代码块标记），结构如下：

{
  "summary": "一句话总检结论",
  "abnormalities": [
    {
      "item": "检查项目名称",
      "value": "检测值",
      "reference": "正常参考范围",
      "level": "warning 或 danger（warning=偏高/偏低但不严重，danger=明显异常需关注）",
      "plainExplanation": "用通俗易懂的白话解释这个指标意味着什么",
      "advice": "具体的改善建议"
    }
  ],
  "overall": "综合健康评价和整体建议，用通俗易懂的语言"
}

要求：
1. 只列出异常或偏高的项目，正常项目不需要列出
2. level 判断：轻微偏离用 warning，明显偏离或需要重点关注的用 danger
3. 白话解释要让没有医学背景的人也能理解
4. 建议要具体可操作
5. 输出纯 JSON，不要任何其他文字"""


@app.post("/api/analyze-report")
async def analyze_report(file: UploadFile = File(...)):
    contents = await file.read()

    text = ""
    with pdfplumber.open(io.BytesIO(contents)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"

    if not text.strip():
        return {"error": "无法从 PDF 中提取文字内容，请确认文件是否有效。"}

    resp = httpx.post(
        f"{API_BASE_URL}/chat/completions",
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": MODEL,
            "max_tokens": 4096,
            "messages": [
                {"role": "system", "content": REPORT_ANALYSIS_PROMPT},
                {"role": "user", "content": text},
            ],
        },
        timeout=120,
    )

    result_text = resp.json()["choices"][0]["message"]["content"].strip()

    # 清理可能的 markdown 代码块包裹
    if result_text.startswith("```"):
        result_text = result_text.split("\n", 1)[1] if "\n" in result_text else result_text[3:]
    if result_text.endswith("```"):
        result_text = result_text[:-3]
    if result_text.startswith("json"):
        result_text = result_text[4:]

    try:
        result = json.loads(result_text.strip())
    except json.JSONDecodeError:
        return {"error": "分析结果解析失败，请重试。", "raw": result_text}

    return result


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
