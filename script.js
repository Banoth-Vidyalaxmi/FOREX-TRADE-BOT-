// script.js (module)
const connectBtn = document.getElementById("connectBtn");
const startBtn = document.getElementById("startTrading");
const stopBtn = document.getElementById("stopTrading");
const balanceEl = document.getElementById("balance");
const tickDisplay = document.getElementById("tickDisplay");
const statusEl = document.getElementById("status");
const historyEl = document.getElementById("history");
const accountSection = document.getElementById("account-section");
const tokenInput = document.getElementById("token");
const openChartBtn = document.getElementById("openChartBtn");

let ws = null;
let token = "";
let subscribedTicks = false;
let isRunning = false;

// Defensive helper
function safeHTML(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function setStatus(msg, isError=false) {
  statusEl.innerHTML = (isError ? "❌ " : "ℹ️ ") + safeHTML(msg);
}

// Connect button logic
connectBtn?.addEventListener("click", () => {
  token = tokenInput.value.trim();
  if (!token) {
    alert("Please enter your Deriv API token.");
    return;
  }

  // close existing connection if any
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.close(); } catch(e){ /* ignore */ }
  }

  setStatus("Connecting to Deriv WebSocket...");
  ws = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089");

  ws.addEventListener("open", () => {
    setStatus("Connected. Authorizing...");
    // authorize request (read-only)
    ws.send(JSON.stringify({ authorize: token }));
  });

  ws.addEventListener("message", (evt) => {
    try {
      const data = JSON.parse(evt.data);

      // Authorization response
      if (data.authorize) {
        setStatus(`Authorized: ${data.authorize.loginid}`);
        accountSection.classList.remove("hidden");
        // request balance subscribe
        ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
      }

      // Balance update
      if (data.balance) {
        const bal = Number(data.balance.balance || 0);
        balanceEl.innerText = bal.toFixed(2);
      }

      // Tick stream
      if (data.tick) {
        const price = Number(data.tick.quote);
        showTick(price);
      }

      // any error message from server
      if (data.error) {
        console.warn("Deriv error:", data.error);
        setStatus(`Deriv error: ${data.error.message}`, true);
      }
    } catch (err) {
      console.error("WS message parse error", err);
    }
  });

  ws.addEventListener("close", () => {
    setStatus("WebSocket closed.");
    subscribedTicks = false;
    isRunning = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
  });

  ws.addEventListener("error", (err) => {
    console.error("WS error", err);
    setStatus("WebSocket error (see console)", true);
  });
});

// display tick with last digit bold
function showTick(price) {
  // price might be e.g. 1234.56
  const str = Number(price).toFixed(2);
  const lastDigit = str.slice(-1); // includes '0'
  tickDisplay.innerHTML = safeHTML(str.slice(0, -1)) + "<b>" + safeHTML(lastDigit) + "</b>";
}

// subscribe to ticks
function subscribeTicks() {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    setStatus("WebSocket not open. Connect first.", true);
    return;
  }
  if (!subscribedTicks) {
    ws.send(JSON.stringify({ ticks: "R_100" }));
    subscribedTicks = true;
    setStatus("Subscribed to R_100 ticks.");
  }
}

// unsubscribe ticks (Deriv doesn't offer tick unsubscribe per v3 protocol in all docs; we simply close subscription by re-requesting or closing socket)
function unsubscribeTicks() {
  // best effort: close socket or set flag. We'll just set flag to prevent handling trades.
  subscribedTicks = false;
  setStatus("Unsubscribed from ticks (client-side).");
}

// Start/Stop buttons
startBtn?.addEventListener("click", () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    alert("Please connect first.");
    return;
  }
  isRunning = true;
  subscribeTicks();
  startBtn.disabled = true;
  stopBtn.disabled = false;
  setStatus("Started — listening to ticks (no trades will be executed).");
});

stopBtn?.addEventListener("click", () => {
  isRunning = false;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  setStatus("Stopped.");
});

// Safety: ensure openChartBtn also works if script loaded later
openChartBtn?.addEventListener("click", () => {
  const derivURL = "https://app.deriv.com/dtrader?action=redirect&redirect_to=accumulator&account=demo&trade_type=accumulator&chart_type=area&interval=1t&symbol=1HZ15V";
  window.open(derivURL, "_blank");
});

// small helper for history (simulated entries)
function addHistory(text, cls) {
  const li = document.createElement("li");
  li.textContent = `${new Date().toLocaleTimeString()} - ${text}`;
  if (cls) li.classList.add(cls);
  historyEl.prepend(li);
}

// keep UI initial state
(function init() {
  startBtn.disabled = false;
  stopBtn.disabled = true;
  accountSection.classList.add("hidden");
  setStatus("Ready. Connect with your Deriv token.");
})();
