// upload-script.js
import { db, storage, collection, addDoc, ref, uploadBytes, getDownloadURL } from "./firebase.js";

document.addEventListener("DOMContentLoaded", () => {
  const fileInput = document.getElementById("fileInput");
  const processBtn = document.getElementById("processBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const parsedTableWrap = document.getElementById("parsedTableWrap");
  const summaryWrap = document.getElementById("summaryWrap");
  const messages = document.getElementById("messages");
  const fileFormatSelect = document.getElementById("fileFormat");

  let lastProcessed = null;

  processBtn.addEventListener("click", async () => {
    messages.textContent = "";
    parsedTableWrap.innerHTML = "";
    summaryWrap.innerHTML = "";
    downloadBtn.disabled = true;
    lastProcessed = null;

    if (!fileInput.files || !fileInput.files[0]) {
      messages.textContent = "Please choose a file to upload (CSV or JSON).";
      return;
    }

    const file = fileInput.files[0];
    const chosenFormat = fileFormatSelect.value;
    const text = await readFileAsText(file);

    try {
      // Parse file
      let trades;
      if (chosenFormat === "json" || (chosenFormat === "auto" && looksLikeJson(text))) {
        trades = parseJsonTrades(text);
      } else {
        trades = parseCsvTrades(text);
      }

      trades = trades.map(normalizeTrade).filter(Boolean);
      if (trades.length === 0) throw new Error("No valid trades found.");

      showParsedTable(trades);
      const summary = computeSummary(trades);
      showSummary(summary);

      lastProcessed = {
        fileName: file.name,
        trades,
        summary,
        processedAt: new Date().toISOString()
      };
      downloadBtn.disabled = false;

      // Upload file to Firebase Storage and save summary to Firestore
      await uploadToFirebase(file, lastProcessed);

      messages.style.color = "#007a00";
      messages.textContent = "✅ File processed and uploaded successfully!";
    } catch (err) {
      messages.style.color = "#b00";
      messages.textContent = "❌ Error: " + (err.message || err);
      console.error(err);
    }
  });

  downloadBtn.addEventListener("click", () => {
    if (!lastProcessed) return;
    const blob = new Blob([JSON.stringify(lastProcessed, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `processed-trades-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  async function uploadToFirebase(file, processedData) {
    // Storage path: trading_files/<timestamp>__<originalName>
    const safeName = `${Date.now()}__${file.name}`;
    const storageRef = ref(storage, `trading_files/${safeName}`);
    await uploadBytes(storageRef, file);
    const fileURL = await getDownloadURL(storageRef);

    // Save summary doc in Firestore
    const docRef = await addDoc(collection(db, "trading_summaries"), {
      fileName: processedData.fileName,
      fileURL: fileURL,
      processedAt: processedData.processedAt,
      summary: processedData.summary,
      totalTrades: processedData.trades.length
    });
    console.log("Uploaded and saved in Firestore with ID:", docRef.id);
  }

  // ---------- helpers ----------
  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = reject;
      fr.readAsText(file);
    });
  }

  function looksLikeJson(text) {
    const t = text.trim();
    return t.startsWith("{") || t.startsWith("[");
  }

  function parseJsonTrades(text) {
    let parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      for (const k of Object.keys(parsed)) {
        if (Array.isArray(parsed[k])) { parsed = parsed[k]; break; }
      }
    }
    if (!Array.isArray(parsed)) throw new Error("JSON must contain an array of trades.");
    return parsed;
  }

  function parseCsvTrades(text) {
    const lines = text.replace(/\r\n/g, "\n").split("\n").filter(l => l.trim() !== "");
    if (lines.length === 0) throw new Error("CSV is empty.");
    // robust header parse (handles comma inside quotes)
    const header = parseCsvLine(lines[0]).map(h => h.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const fields = parseCsvLine(lines[i]);
      if (fields.every(f => f.trim() === "")) continue;
      const obj = {};
      for (let j = 0; j < header.length; j++) {
        obj[header[j] || `col${j}`] = fields[j] !== undefined ? fields[j] : "";
      }
      rows.push(obj);
    }
    return rows;
  }

  function parseCsvLine(line) {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i+1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
        continue;
      }
      if (ch === ',' && !inQuotes) { out.push(cur); cur = ""; continue; }
      cur += ch;
    }
    out.push(cur);
    return out;
  }

  function normalizeTrade(raw) {
    // map typical field names
    const keys = Object.keys(raw);
    const lcMap = {};
    for (const k of keys) lcMap[k.toLowerCase()] = raw[k];

    const getVal = (variants) => {
      for (const v of variants) {
        if (raw[v] !== undefined) return raw[v];
        if (lcMap[v.toLowerCase()] !== undefined) return lcMap[v.toLowerCase()];
      }
      return "";
    };

    const symbol = String(getVal(["symbol", "ticker", "instrument"] || [])).trim();
    if (!symbol) return null;

    let side = String(getVal(["type", "side", "action"]) || "").toLowerCase();
    if (side === "b") side = "buy";
    if (side === "s") side = "sell";

    let qty = Number(String(getVal(["qty", "quantity", "shares", "amount"]) || "").trim());
    if (!isFinite(qty)) qty = 0;

    const price = Number(String(getVal(["price", "tradeprice", "rate"]) || "").trim());
    const date = String(getVal(["date", "timestamp", "trade_date"]) || "").trim();

    // If side missing, try infer from sign of qty
    if (!side) side = (qty < 0) ? "sell" : "buy";
    qty = Math.abs(qty);

    return { symbol, side, quantity: qty, price: isFinite(price) ? price : 0, date };
  }

  function computeSummary(trades) {
    const bySymbol = {};
    for (const t of trades) {
      const s = t.symbol;
      if (!bySymbol[s]) bySymbol[s] = { buyQty: 0, buyVal: 0, sellQty: 0, sellVal: 0, trades: [] };
      const q = Number(t.quantity) || 0;
      const p = Number(t.price) || 0;
      const v = q * p;
      bySymbol[s].trades.push(t);
      if (t.side === "sell") {
        bySymbol[s].sellQty += q;
        bySymbol[s].sellVal += v;
      } else {
        bySymbol[s].buyQty += q;
        bySymbol[s].buyVal += v;
      }
    }

    const summary = Object.keys(bySymbol).map(s => {
      const b = bySymbol[s];
      const avgBuy = b.buyQty ? round(b.buyVal / b.buyQty, 4) : null;
      const avgSell = b.sellQty ? round(b.sellVal / b.sellQty, 4) : null;
      const netQty = round(b.buyQty - b.sellQty);
      const netValue = round(b.buyVal - b.sellVal, 2);
      return {
        symbol: s,
        totalBoughtQty: round(b.buyQty),
        avgBuyPrice: avgBuy === null ? "-" : avgBuy,
        totalBoughtValue: round(b.buyVal,2),
        totalSoldQty: round(b.sellQty),
        avgSellPrice: avgSell === null ? "-" : avgSell,
        totalSoldValue: round(b.sellVal,2),
        netQty,
        netValue,
        tradesCount: b.trades.length
      };
    });

    summary.sort((a,b) => a.symbol.localeCompare(b.symbol));
    return summary;
  }

  function round(v, dec=2) {
    if (!isFinite(v)) return v;
    const m = Math.pow(10, dec);
    return Math.round(v * m) / m;
  }

  function showParsedTable(trades) {
    const headers = Object.keys(trades[0]);
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    headers.forEach(h => { const th = document.createElement("th"); th.textContent = h; headRow.appendChild(th); });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    trades.forEach(tr => {
      const trEl = document.createElement("tr");
      headers.forEach(h => {
        const td = document.createElement("td");
        td.textContent = (tr[h] !== undefined && tr[h] !== null) ? String(tr[h]) : "";
        trEl.appendChild(td);
      });
      tbody.appendChild(trEl);
    });
    table.appendChild(tbody);
    parsedTableWrap.innerHTML = "";
    parsedTableWrap.appendChild(table);
  }

  function showSummary(summary) {
    if (!Array.isArray(summary) || summary.length === 0) {
      summaryWrap.textContent = "No summary to show.";
      return;
    }
    const table = document.createElement("table");
    const headers = ["Symbol","Bought Qty","Avg Buy Price","Bought Value","Sold Qty","Avg Sell Price","Sold Value","Net Qty","Net Value","Trades"];
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    headers.forEach(h => { const th = document.createElement("th"); th.textContent = h; headRow.appendChild(th); });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    summary.forEach(s => {
      const row = document.createElement("tr");
      const cells = [
        s.symbol, s.totalBoughtQty, s.avgBuyPrice, s.totalBoughtValue,
        s.totalSoldQty, s.avgSellPrice, s.totalSoldValue,
        s.netQty, s.netValue, s.tradesCount
      ];
      cells.forEach(c => { const td = document.createElement("td"); td.textContent = String(c); row.appendChild(td); });
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    summaryWrap.innerHTML = "";
    summaryWrap.appendChild(table);
  }

});
