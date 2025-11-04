// dashboard.js
import { db } from "./firebase.js";
import { collection, getDocs, orderBy, query } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", async () => {
  const section = document.getElementById("dataSection");

  try {
    const q = query(collection(db, "trading_summaries"), orderBy("processedAt", "desc"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      section.innerHTML = "<p>No uploaded summaries found.</p>";
      return;
    }

    const rows = [];
    snapshot.forEach(doc => {
      const d = doc.data();
      rows.push({
        id: doc.id,
        fileName: d.fileName,
        fileURL: d.fileURL,
        processedAt: d.processedAt,
        totalTrades: d.totalTrades,
        summary: d.summary
      });
    });

    const html = `
      <table>
        <thead>
          <tr>
            <th>File Name</th>
            <th>Processed Date</th>
            <th>Total Trades</th>
            <th>Download</th>
            <th>View Summary</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${r.fileName}</td>
              <td>${new Date(r.processedAt).toLocaleString()}</td>
              <td>${r.totalTrades}</td>
              <td><a href="${r.fileURL}" target="_blank">File</a></td>
              <td><button class="btn" onclick='window.viewSummary(${JSON.stringify(r.summary).replaceAll("'", "\\'")})'>View</button></td>
            </tr>`).join("")}
        </tbody>
      </table>
      <div id="summaryDisplay" style="margin-top:25px;"></div>
    `;

    section.innerHTML = html;
  } catch (err) {
    console.error(err);
    section.innerHTML = "<p>Error loading data. Check console.</p>";
  }
});

// global function to display summary table
window.viewSummary = (summary) => {
  const wrap = document.getElementById("summaryDisplay");
  if (!summary || !Array.isArray(summary)) { wrap.innerHTML = "<p>No summary</p>"; return; }
  const html = `
    <h3>Trade Summary</h3>
    <table>
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Bought Qty</th>
          <th>Avg Buy</th>
          <th>Sold Qty</th>
          <th>Avg Sell</th>
          <th>Net Qty</th>
          <th>Net Value</th>
        </tr>
      </thead>
      <tbody>
        ${summary.map(s => `
          <tr>
            <td>${s.symbol}</td>
            <td>${s.totalBoughtQty}</td>
            <td>${s.avgBuyPrice}</td>
            <td>${s.totalSoldQty}</td>
            <td>${s.avgSellPrice}</td>
            <td>${s.netQty}</td>
            <td>${s.netValue}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>`;
  wrap.innerHTML = html;
};
