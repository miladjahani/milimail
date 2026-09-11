/**
 * Turbo Temp Mail Frontend Application
 * Handles State, Real-time Polling, Audio Chimes, and Safe Rendering
 */

// آدرس ورکر کلودفلر خود را در این متغیر قرار دهید
// در صورتی که خالی بماند، آدرس مبدا فعلی به عنوان ورکر فرض می‌شود
const DEFAULT_WORKER_URL = "https://turbo-temp-mail-worker.YOUR_SUBDOMAIN.workers.dev";
const DEFAULT_DOMAIN = "yourdomain.com";

let workerUrl = localStorage.getItem("turbo_worker_url") || DEFAULT_WORKER_URL;
let currentEmail = localStorage.getItem("turbo_current_email") || "";
let expiresAt = parseInt(localStorage.getItem("turbo_expires_at") || "0", 10);
let soundEnabled = localStorage.getItem("turbo_sound_enabled") !== "false";
let previousMessageIds = new Set();
let currentModalMessage = null;
let pollTimer = null;

// راه‌اندازی در زمان لود صفحه
window.addEventListener("DOMContentLoaded", async () => {
  setupServiceWorker();
  updateSoundUI();
  await loadWorkerConfig();

  if (!currentEmail || isExpired()) {
    generateRandomEmail();
  } else {
    updateActiveEmailUI();
    fetchMessages();
  }

  // شروع شمارش معکوس و پولینگ زنده
  setInterval(updateCountdown, 1000);
  startPolling();
});

function setupServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(err => {
      console.log("Service worker registration skipped:", err);
    });
  }
}

async function loadWorkerConfig() {
  try {
    const res = await fetch(`${workerUrl}/api/config`);
    if (res.ok) {
      const data = await res.json();
      if (data.domains && data.domains.length > 0) {
        const select = document.getElementById("domainSelect");
        select.innerHTML = "";
        data.domains.forEach(dom => {
          const opt = document.createElement("option");
          opt.value = dom;
          opt.textContent = dom;
          select.appendChild(opt);
        });
      }
    }
  } catch (err) {
    console.warn("Could not fetch remote config, using defaults:", err);
  }
}

function getSelectedDomain() {
  const select = document.getElementById("domainSelect");
  return select ? select.value : DEFAULT_DOMAIN;
}

function isExpired() {
  return Date.now() > expiresAt;
}

function resetExpiration() {
  expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 ساعت
  localStorage.setItem("turbo_expires_at", expiresAt.toString());
}

function generateRandomEmail() {
  const randomPrefix = "tmail_" + Math.random().toString(36).substring(2, 9);
  const domain = getSelectedDomain();
  setEmail(`${randomPrefix}@${domain}`);
}

function applyCustomEmail() {
  const input = document.getElementById("customUsernameInput");
  const rawPrefix = (input.value || "").trim().toLowerCase();

  if (!rawPrefix) {
    showToast("لطفاً یک نام کاربری وارد کنید یا از دکمه تصادفی استفاده نمایید");
    return;
  }

  // اعتبارسنجی حروف، اعداد و خط تیره/نقطه
  const cleanPrefix = rawPrefix.replace(/[^a-z0-9._-]/g, "");
  if (!cleanPrefix) {
    showToast("نام کاربری فقط می‌تواند شامل حروف انگلیسی و ارقام باشد");
    return;
  }

  const domain = getSelectedDomain();
  setEmail(`${cleanPrefix}@${domain}`);
  input.value = "";
}

function setEmail(email) {
  currentEmail = email.toLowerCase().trim();
  localStorage.setItem("turbo_current_email", currentEmail);
  resetExpiration();
  previousMessageIds.clear();

  updateActiveEmailUI();
  fetchMessages(true);
  showToast(`صندوق فعال: ${currentEmail}`);
}

function updateActiveEmailUI() {
  const display = document.getElementById("activeEmailDisplay");
  if (display) {
    display.textContent = currentEmail;
  }
}

function updateCountdown() {
  const timerElem = document.getElementById("countdownTimer");
  if (!timerElem) return;

  const diff = expiresAt - Date.now();
  if (diff <= 0) {
    timerElem.textContent = "00:00:00 (منقضی شد)";
    generateRandomEmail();
    return;
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  const pad = n => (n < 10 ? "0" + n : n);
  timerElem.textContent = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    fetchMessages(false);
  }, 5000);
}

async function fetchMessages(isManual = false) {
  if (!currentEmail) return;

  const refreshIcon = document.getElementById("refreshIcon");
  if (isManual && refreshIcon) {
    refreshIcon.classList.add("animate-spin");
  }

  try {
    const res = await fetch(`${workerUrl}/api/messages?email=${encodeURIComponent(currentEmail)}`);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

    const data = await res.json();
    const messages = data.messages || [];

    // بررسی آیا ایمیل جدیدی اضافه شده است
    let hasNewMail = false;
    messages.forEach(m => {
      if (!previousMessageIds.has(m.id)) {
        hasNewMail = true;
        previousMessageIds.add(m.id);
      }
    });

    if (hasNewMail && !isManual && messages.length > 0) {
      playChime();
      showToast("ایمیل جدید دریافت شد!");
    }

    renderMessages(messages);
  } catch (err) {
    console.error("خطا در همگام‌سازی پیام‌ها:", err);
  } finally {
    if (isManual && refreshIcon) {
      setTimeout(() => refreshIcon.classList.remove("animate-spin"), 500);
    }
  }
}

function renderMessages(messages) {
  const container = document.getElementById("messagesListContainer");
  const countBadge = document.getElementById("messagesCountBadge");

  if (countBadge) {
    countBadge.textContent = `${messages.length} پیام`;
  }

  if (!messages || messages.length === 0) {
    container.innerHTML = `
      <div id="emptyState" class="flex flex-col items-center justify-center py-16 text-center text-slate-500">
        <div class="w-14 h-14 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center mb-3 text-slate-600">
          <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
        </div>
        <p class="text-sm font-medium text-slate-400">صندوق ورودی شما خالی است</p>
        <p class="text-xs text-slate-600 mt-1 max-w-sm">پیام‌های جدید به‌طور خودکار در این قسمت ظاهر می‌شوند.</p>
      </div>`;
    return;
  }

  container.innerHTML = messages.map(msg => {
    const formattedDate = new Date(msg.date).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
    return `
      <div onclick="openMessage('${msg.id}')"
        class="group p-4 bg-slate-950/80 hover:bg-slate-900 border border-slate-800/80 hover:border-blue-500/50 rounded-xl transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm hover:shadow-md">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"></span>
            <span class="text-xs font-semibold text-slate-200 truncate" dir="ltr">${escapeHtml(msg.from)}</span>
            <span class="text-[10px] text-slate-500 font-mono">${formattedDate}</span>
          </div>
          <h4 class="text-sm font-bold text-slate-100 truncate group-hover:text-blue-400 transition">${escapeHtml(msg.subject)}</h4>
          <p class="text-xs text-slate-400 mt-1 truncate">${escapeHtml(msg.rawSnippet || "(بدون پیش‌نمایش)")}</p>
        </div>
        <div class="flex items-center gap-2 self-end sm:self-center">
          <span class="text-xs text-blue-400 opacity-0 group-hover:opacity-100 transition flex items-center gap-1 font-medium">
            مشاهده
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
          </span>
        </div>
      </div>
    `;
  }).join("");
}

async function openMessage(id) {
  try {
    const res = await fetch(`${workerUrl}/api/message?email=${encodeURIComponent(currentEmail)}&id=${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error("پیام پیدا نشد");

    const data = await res.json();
    currentModalMessage = data.message;

    document.getElementById("modalSubject").textContent = currentModalMessage.subject;
    document.getElementById("modalFrom").textContent = currentModalMessage.from;
    document.getElementById("modalDate").textContent = new Date(currentModalMessage.date).toLocaleString("fa-IR");

    // تنظیم نمای ساده
    document.getElementById("modalRawText").textContent = currentModalMessage.text || currentModalMessage.rawSnippet || "(بدون متن ساده)";

    // تنظیم نمای امن درون iframe sandbox
    const iframe = document.getElementById("emailIframeSandbox");
    const htmlContent = currentModalMessage.html || `<pre style="font-family:sans-serif;padding:20px;white-space:pre-wrap;">${escapeHtml(currentModalMessage.text || '')}</pre>`;
    iframe.srcdoc = htmlContent;

    switchModalTab(currentModalMessage.html ? "html" : "text");
    document.getElementById("emailDetailModal").classList.remove("hidden");
  } catch (err) {
    showToast("خطا در بارگذاری جزییات پیام");
  }
}

function switchModalTab(tab) {
  const htmlContainer = document.getElementById("modalHtmlContainer");
  const textContainer = document.getElementById("modalTextContainer");
  const tabHtmlBtn = document.getElementById("tabHtmlBtn");
  const tabTextBtn = document.getElementById("tabTextBtn");

  if (tab === "html") {
    htmlContainer.classList.remove("hidden");
    textContainer.classList.add("hidden");
    tabHtmlBtn.className = "px-3 py-1 rounded-md text-xs font-semibold bg-blue-600 text-white transition";
    tabTextBtn.className = "px-3 py-1 rounded-md text-xs font-medium text-slate-400 hover:text-slate-200 transition";
  } else {
    htmlContainer.classList.add("hidden");
    textContainer.classList.remove("hidden");
    tabTextBtn.className = "px-3 py-1 rounded-md text-xs font-semibold bg-blue-600 text-white transition";
    tabHtmlBtn.className = "px-3 py-1 rounded-md text-xs font-medium text-slate-400 hover:text-slate-200 transition";
  }
}

function closeModal() {
  document.getElementById("emailDetailModal").classList.add("hidden");
  currentModalMessage = null;
}

function copyModalContent() {
  if (!currentModalMessage) return;
  const content = currentModalMessage.text || currentModalMessage.rawSnippet || "";
  navigator.clipboard.writeText(content).then(() => {
    showToast("متن پیام در کلیپ‌بورد کپی شد");
  });
}

async function deleteCurrentModalEmail() {
  if (!currentModalMessage) return;
  if (!confirm("آیا مایل به حذف این پیام هستید؟")) return;

  try {
    const res = await fetch(`${workerUrl}/api/message?email=${encodeURIComponent(currentEmail)}&id=${encodeURIComponent(currentModalMessage.id)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      closeModal();
      showToast("پیام حذف شد");
      fetchMessages(true);
    }
  } catch (err) {
    showToast("خطا در حذف پیام");
  }
}

async function deleteCurrentInbox() {
  if (!confirm(`آیا از حذف کامل صندوق ${currentEmail} اطمینان دارید؟ تمامی پیام‌ها پاک خواهند شد.`)) return;

  try {
    await fetch(`${workerUrl}/api/messages?email=${encodeURIComponent(currentEmail)}`, {
      method: "DELETE",
    });
    showToast("صندوق ورودی به طور کامل پاک شد");
    generateRandomEmail();
  } catch (err) {
    showToast("خطا در حذف صندوق");
  }
}

function copyCurrentEmail() {
  if (!currentEmail) return;
  navigator.clipboard.writeText(currentEmail).then(() => {
    const copyBtnText = document.getElementById("copyBtnText");
    if (copyBtnText) copyBtnText.textContent = "کپی شد!";
    showToast("آدرس ایمیل با موفقیت کپی شد");
    setTimeout(() => {
      if (copyBtnText) copyBtnText.textContent = "کپی آدرس";
    }, 2000);
  });
}

function openQrModal() {
  const modal = document.getElementById("qrModal");
  const img = document.getElementById("qrImage");
  const text = document.getElementById("qrEmailText");

  img.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(currentEmail)}`;
  text.textContent = currentEmail;
  modal.classList.remove("hidden");
}

function closeQrModal() {
  document.getElementById("qrModal").classList.add("hidden");
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem("turbo_sound_enabled", soundEnabled.toString());
  updateSoundUI();
  showToast(soundEnabled ? "صدای اعلان فعال شد" : "صدای اعلان غیرفعال شد");
}

function updateSoundUI() {
  const btn = document.getElementById("soundToggleBtn");
  if (btn) {
    btn.classList.toggle("text-blue-400", soundEnabled);
    btn.classList.toggle("text-slate-600", !soundEnabled);
  }
}

// تولید صدای زنگ سبک با Web Audio API بدون نیاز به فایل صوتی جانبی
function playChime() {
  if (!soundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {
    console.log("Audio not allowed yet:", e);
  }
}

function showToast(message) {
  const toast = document.getElementById("toast");
  const text = document.getElementById("toastText");
  if (!toast || !text) return;

  text.textContent = message;
  toast.classList.remove("translate-y-20", "opacity-0");
  toast.classList.add("translate-y-0", "opacity-100");

  setTimeout(() => {
    toast.classList.remove("translate-y-0", "opacity-100");
    toast.classList.add("translate-y-20", "opacity-0");
  }, 2500);
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
