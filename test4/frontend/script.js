const API_URL = "http://localhost:8000/api/chat";
const REPORT_API_URL = "http://localhost:8000/api/analyze-report";

let messages = [];
let isStreaming = false;
let reportData = null;

const chatMessages = document.getElementById("chatMessages");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

function autoResize(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
}

function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

function scrollToBottom() {
    chatMessages.scrollTo({
        top: chatMessages.scrollHeight,
        behavior: "smooth",
    });
}

function removeWelcome() {
    const welcome = chatMessages.querySelector(".welcome-message");
    if (welcome) welcome.remove();
}

function addMessage(role, content) {
    removeWelcome();

    const wrapper = document.createElement("div");
    wrapper.className = `message ${role}`;

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = role === "user" ? "我" : "AI";

    const bubble = document.createElement("div");
    bubble.className = "message-content";
    bubble.textContent = content;

    wrapper.appendChild(avatar);
    wrapper.appendChild(bubble);
    chatMessages.appendChild(wrapper);
    scrollToBottom();

    return bubble;
}

function addTypingIndicator() {
    removeWelcome();

    const wrapper = document.createElement("div");
    wrapper.className = "message assistant";
    wrapper.id = "typingIndicator";

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = "AI";

    const bubble = document.createElement("div");
    bubble.className = "message-content";
    bubble.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';

    wrapper.appendChild(avatar);
    wrapper.appendChild(bubble);
    chatMessages.appendChild(wrapper);
    scrollToBottom();
}

function removeTypingIndicator() {
    const el = document.getElementById("typingIndicator");
    if (el) el.remove();
}

async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || isStreaming) return;

    messageInput.value = "";
    messageInput.style.height = "auto";
    sendBtn.disabled = true;
    isStreaming = true;

    messages.push({ role: "user", content: text });
    addMessage("user", text);

    addTypingIndicator();

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages }),
        });

        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }

        removeTypingIndicator();

        const wrapper = document.createElement("div");
        wrapper.className = "message assistant";

        const avatar = document.createElement("div");
        avatar.className = "message-avatar";
        avatar.textContent = "AI";

        const bubble = document.createElement("div");
        bubble.className = "message-content";

        wrapper.appendChild(avatar);
        wrapper.appendChild(bubble);
        chatMessages.appendChild(wrapper);

        let assistantText = "";
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    const data = line.slice(6);
                    if (data === "[DONE]") break;
                    try {
                        const parsed = JSON.parse(data);
                        assistantText += parsed.content;
                        bubble.textContent = assistantText;
                        scrollToBottom();
                    } catch {
                        // skip malformed chunks
                    }
                }
            }
        }

        messages.push({ role: "assistant", content: assistantText });
    } catch (error) {
        removeTypingIndicator();
        addMessage(
            "assistant",
            "抱歉，连接出现问题，请确认后端服务已启动。错误信息：" + error.message
        );
    } finally {
        isStreaming = false;
        sendBtn.disabled = false;
        messageInput.focus();
    }
}

function sendQuickMessage(text) {
    messageInput.value = text;
    sendMessage();
}

function clearChat() {
    messages = [];
    chatMessages.innerHTML = "";

    const welcome = document.createElement("div");
    welcome.className = "welcome-message";
    welcome.innerHTML = `
        <div class="welcome-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M12 2a7 7 0 0 1 7 7c0 5-7 11-7 11S5 14 5 9a7 7 0 0 1 7-7z"/>
                <circle cx="12" cy="9" r="2.5"/>
            </svg>
        </div>
        <h2>欢迎使用智能问诊助手</h2>
        <p>请描述您的症状，我将为您提供初步的健康建议。</p>
        <div class="quick-topics">
            <button class="topic-btn" onclick="sendQuickMessage('我最近经常头痛，是怎么回事？')">经常头痛</button>
            <button class="topic-btn" onclick="sendQuickMessage('我感冒了好几天了，一直不好，怎么办？')">感冒不愈</button>
            <button class="topic-btn" onclick="sendQuickMessage('我最近睡眠质量很差，总是失眠，有什么建议？')">失眠困扰</button>
            <button class="topic-btn" onclick="sendQuickMessage('我经常胃痛，特别是吃完饭之后，是什么原因？')">饭后胃痛</button>
        </div>
    `;
    chatMessages.appendChild(welcome);
}

// ===== Tab Switching =====
function switchTab(tab) {
    document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("active"));

    if (tab === "chat") {
        document.querySelector(".tab-btn:first-child").classList.add("active");
        document.getElementById("chatPanel").classList.add("active");
    } else {
        document.querySelector(".tab-btn:last-child").classList.add("active");
        document.getElementById("reportPanel").classList.add("active");
    }
}

// ===== PDF Upload =====
function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add("drag-over");
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove("drag-over");
}

function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file && file.type === "application/pdf") {
        uploadReport(file);
    } else {
        alert("请上传 PDF 格式的文件");
    }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) uploadReport(file);
    e.target.value = "";
}

async function uploadReport(file) {
    document.getElementById("uploadArea").style.display = "none";
    document.getElementById("reportLoading").style.display = "flex";
    document.getElementById("reportResult").style.display = "none";

    const formData = new FormData();
    formData.append("file", file);

    try {
        const response = await axios.post(REPORT_API_URL, formData, {
            headers: { "Content-Type": "multipart/form-data" },
            timeout: 120000,
        });

        if (response.data.error) {
            throw new Error(response.data.error);
        }

        reportData = response.data;
        renderReport(reportData);

        document.getElementById("reportLoading").style.display = "none";
        document.getElementById("reportResult").style.display = "flex";
    } catch (error) {
        document.getElementById("reportLoading").style.display = "none";
        document.getElementById("uploadArea").style.display = "flex";
        alert("分析失败：" + (error.response?.data?.error || error.message));
    }
}

// ===== Render Report =====
function renderReport(data) {
    // Summary
    const summaryEl = document.getElementById("reportSummary");
    summaryEl.innerHTML = `<strong>总检结论</strong>${data.summary}`;

    // Abnormalities
    const listEl = document.getElementById("abnormalList");
    listEl.innerHTML = "";

    if (data.abnormalities && data.abnormalities.length > 0) {
        data.abnormalities.forEach((item) => {
            const level = item.level === "danger" ? "danger" : "warning";
            const levelText = level === "danger" ? "需关注" : "偏高/偏低";
            const card = document.createElement("div");
            card.className = `abnormal-card ${level}`;
            card.innerHTML = `
                <div class="abnormal-card-header">
                    <span class="abnormal-item-name">${item.item}</span>
                    <span class="abnormal-level-badge">${levelText}</span>
                </div>
                <div class="abnormal-values">
                    <span>检测值：<span class="val">${item.value}</span></span>
                    <span>参考范围：<span class="val">${item.reference}</span></span>
                </div>
                <div class="abnormal-explain">${item.plainExplanation}</div>
                <div class="abnormal-advice">${item.advice}</div>
            `;
            listEl.appendChild(card);
        });
    } else {
        listEl.innerHTML = '<p style="color: var(--green-500); text-align: center; padding: 20px;">所有检查指标均在正常范围内，身体状况良好！</p>';
    }

    // Overall
    const overallEl = document.getElementById("reportOverall");
    overallEl.innerHTML = `<strong>综合建议</strong>${data.overall}`;
}

// ===== Reset Report =====
function resetReport() {
    reportData = null;
    document.getElementById("uploadArea").style.display = "flex";
    document.getElementById("reportLoading").style.display = "none";
    document.getElementById("reportResult").style.display = "none";
}

// ===== Download Report =====
function downloadReport() {
    if (!reportData) return;

    const now = new Date();
    const dateStr = now.toLocaleDateString("zh-CN");

    let abnormalRows = "";
    if (reportData.abnormalities && reportData.abnormalities.length > 0) {
        reportData.abnormalities.forEach((item) => {
            const levelLabel = item.level === "danger" ? "需关注" : "偏高/偏低";
            const levelColor = item.level === "danger" ? "#ef4444" : "#f97316";
            abnormalRows += `
                <tr>
                    <td>${item.item}</td>
                    <td style="color: ${levelColor}; font-weight: 600;">${item.value}</td>
                    <td>${item.reference}</td>
                    <td><span style="background: ${levelColor}22; color: ${levelColor}; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${levelLabel}</span></td>
                </tr>
                <tr>
                    <td colspan="4" style="padding: 8px 16px; background: #f8fafc; font-size: 13px; color: #475569; line-height: 1.7;">
                        <p><strong>解读：</strong>${item.plainExplanation}</p>
                        <p style="margin-top: 4px;"><strong>建议：</strong>${item.advice}</p>
                    </td>
                </tr>
            `;
        });
    } else {
        abnormalRows = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #22c55e;">所有指标均在正常范围内</td></tr>';
    }

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>体检报告分析 - ${dateStr}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; color: #1e293b; padding: 40px; max-width: 800px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 2px solid #2563eb; }
        .header h1 { font-size: 24px; color: #2563eb; margin-bottom: 8px; }
        .header p { font-size: 13px; color: #64748b; }
        .section { margin-bottom: 24px; }
        .section h2 { font-size: 16px; color: #2563eb; margin-bottom: 12px; padding-left: 12px; border-left: 4px solid #2563eb; }
        .summary-box { background: #dbeafe; border-radius: 12px; padding: 20px; font-size: 15px; line-height: 1.7; }
        .overall-box { background: #f0fdf4; border-radius: 12px; padding: 20px; font-size: 14px; line-height: 1.7; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th { background: #f1f5f9; padding: 10px 16px; text-align: left; font-size: 13px; color: #475569; }
        td { padding: 10px 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
        .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; }
    </style>
</head>
<body>
    <div class="header">
        <h1>体检报告智能分析</h1>
        <p>分析日期：${dateStr} · AI 驱动 · 仅供参考，不替代专业医疗诊断</p>
    </div>
    <div class="section">
        <h2>总检结论</h2>
        <div class="summary-box">${reportData.summary}</div>
    </div>
    <div class="section">
        <h2>异常指标详情</h2>
        <table>
            <thead><tr><th>检查项目</th><th>检测值</th><th>参考范围</th><th>状态</th></tr></thead>
            <tbody>${abnormalRows}</tbody>
        </table>
    </div>
    <div class="section">
        <h2>综合建议</h2>
        <div class="overall-box">${reportData.overall}</div>
    </div>
    <div class="footer">
        本报告由 AI 智能问诊助手生成，仅供参考，不能替代专业医生的诊断和治疗。
    </div>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `体检报告分析_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
