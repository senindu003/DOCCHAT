const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const HEADER_HEIGHT = 92;
const FOOTER_HEIGHT = 36;

const applyContentStyles = (root) => {
  root.querySelectorAll(".katex, .katex-display").forEach((element) => {
    const math = document.createElement("span");
    math.textContent = element.textContent;
    math.dataset.exportMath = "true";
    element.replaceWith(math);
  });
  root.querySelectorAll("*").forEach((element) => {
    element.removeAttribute("class");
    element.removeAttribute("style");
  });
  root.style.cssText = "font-size:14px;line-height:1.6;color:#1f2937;overflow-wrap:anywhere";
  root.querySelectorAll("[data-export-math]").forEach((element) => { element.style.cssText = "font-family:serif;font-style:italic"; });
  root.querySelectorAll("strong, b").forEach((element) => { element.style.fontWeight = "700"; });
  root.querySelectorAll("em, i").forEach((element) => { element.style.fontStyle = "italic"; });
  root.querySelectorAll("del, s").forEach((element) => { element.style.textDecoration = "line-through"; });
  root.querySelectorAll("a").forEach((element) => { element.style.color = "#1d4ed8"; element.style.textDecoration = "underline"; });
  root.querySelectorAll("h1, h2, h3, h4").forEach((element) => { element.style.cssText = "margin:18px 0 8px;font-weight:700;color:#166534;line-height:1.3"; });
  root.querySelectorAll("h1").forEach((element) => { element.style.fontSize = "22px"; });
  root.querySelectorAll("h2").forEach((element) => { element.style.fontSize = "19px"; });
  root.querySelectorAll("h3, h4").forEach((element) => { element.style.fontSize = "16px"; });
  root.querySelectorAll("p").forEach((element) => { element.style.margin = "0 0 11px"; });
  root.querySelectorAll("ul, ol").forEach((element) => { element.style.cssText = "margin:8px 0 12px;padding-left:26px"; });
  root.querySelectorAll("li").forEach((element) => { element.style.marginBottom = "5px"; });
  root.querySelectorAll("pre").forEach((element) => { element.style.cssText = "margin:12px 0;padding:12px;border:1px solid #d1d5db;border-radius:6px;background:#f3f4f6;white-space:pre-wrap;font-family:monospace;font-size:12px;line-height:1.45"; });
  root.querySelectorAll("code").forEach((element) => { if (element.parentElement?.tagName !== "PRE") element.style.cssText = "padding:1px 4px;border-radius:3px;background:#e5e7eb;font-family:monospace;font-size:12px"; });
  root.querySelectorAll("table").forEach((element) => { element.style.cssText = "width:100%;margin:14px 0;border-collapse:collapse;font-size:12px;table-layout:auto"; });
  root.querySelectorAll("th").forEach((element) => { element.style.cssText = "padding:7px;border:1px solid #bbf7d0;background:#166534;color:#ffffff;text-align:left;font-weight:700"; });
  root.querySelectorAll("td").forEach((element) => { element.style.cssText = "padding:7px;border:1px solid #d1d5db;vertical-align:top"; });
  root.querySelectorAll("blockquote").forEach((element) => { element.style.cssText = "margin:12px 0;padding:8px 12px;border-left:4px solid #16a34a;background:#f0fdf4"; });
};

const buildExportSurface = (chatElement, exportedAt) => {
  const surface = document.createElement("article");
  surface.setAttribute("aria-hidden", "true");
  surface.style.cssText = "position:fixed;left:-10000px;top:0;width:760px;box-sizing:border-box;padding:36px;background:#ffffff;color:#111827;font-family:Arial,Helvetica,sans-serif";
  surface.innerHTML = `<header style="margin-bottom:28px;border-bottom:2px solid #166534;padding-bottom:16px"><h1 style="margin:0;color:#166534;font-size:28px;line-height:1.2">DOCCHAT conversation</h1><p style="margin:7px 0 0;color:#6b7280;font-size:13px">Exported ${exportedAt}</p></header>`;

  chatElement.querySelectorAll("[data-export-message]").forEach((message) => {
    const isUser = message.dataset.exportRole === "user";
    const sourceContent = message.querySelector("[data-export-content]");
    if (!sourceContent) return;
    const card = document.createElement("section");
    card.style.cssText = `box-sizing:border-box;margin:0 0 18px;padding:18px 20px;border:1px solid #d1d5db;border-left:5px solid ${isUser ? "#2563eb" : "#166534"};border-radius:12px;background:${isUser ? "#eff6ff" : "#f0fdf4"};page-break-inside:avoid;break-inside:avoid`;
    const header = document.createElement("div");
    header.style.cssText = "display:flex;justify-content:space-between;gap:16px;margin-bottom:12px;font-size:11px";
    header.innerHTML = `<strong style="color:${isUser ? "#2563eb" : "#166534"};font-size:12px">${isUser ? "You" : "DOCCHAT"}</strong><span style="color:#6b7280">${message.dataset.exportTimestamp || ""}</span>`;
    card.append(header);
    const content = sourceContent.cloneNode(true);
    applyContentStyles(content);
    card.append(content);
    surface.append(card);
  });

  document.body.append(surface);
  return surface;
};

const drawPageChrome = (pdf, pageNumber, totalPages, exportedAt) => {
  pdf.setFillColor(22, 101, 52);
  pdf.rect(0, 0, PAGE_WIDTH, HEADER_HEIGHT, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text("DOCCHAT", MARGIN, 37);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text("Conversation transcript", MARGIN, 52);
  pdf.text(exportedAt, MARGIN, 72);
  pdf.setDrawColor(229, 231, 235);
  pdf.line(MARGIN, PAGE_HEIGHT - FOOTER_HEIGHT, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - FOOTER_HEIGHT);
  pdf.setTextColor(107, 114, 128);
  pdf.text("Generated locally by DOCCHAT - not stored on the server", MARGIN, PAGE_HEIGHT - 17);
  pdf.text(`Page ${pageNumber} of ${totalPages}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 17, { align: "right" });
};

export const exportChatPdf = async (chatElement) => {
  if (!chatElement) throw new Error("The conversation is not ready to export.");
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const exportedAt = new Date().toLocaleString();
  const surface = buildExportSurface(chatElement, exportedAt);
  try {
    await new Promise((resolve) => {
      pdf.html(surface, {
        x: MARGIN,
        y: HEADER_HEIGHT + 18,
        width: PAGE_WIDTH - MARGIN * 2,
        windowWidth: 760,
        autoPaging: "text",
        margin: [HEADER_HEIGHT + 18, MARGIN, FOOTER_HEIGHT + 12, MARGIN],
        html2canvas: { scale: 0.72, useCORS: true, logging: false, backgroundColor: "#ffffff" },
        callback: resolve,
      });
    });
    const totalPages = pdf.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      pdf.setPage(page);
      drawPageChrome(pdf, page, totalPages, exportedAt);
    }
    pdf.save(`docchat-${new Date().toISOString().slice(0, 10)}.pdf`);
  } finally {
    surface.remove();
  }
};
