const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const TOP = 82;
const BOTTOM = 48;

const plainText = (value) => String(value)
  .replace(/\*\*/g, "")
  .replace(/`/g, "")
  .replace(/^#{1,6}\s+/gm, "")
  .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
  .replace(/[\u2013\u2014]/g, "-")
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201C\u201D]/g, '"')
  .replace(/[^\x20-\x7E\n\r\t]/g, "?")
  .replace(/\r/g, "")
  .trim();

const getMessages = (chatElement) => Array.from(
  chatElement.querySelectorAll("[data-export-message]"),
  (message) => ({
    role: message.dataset.exportRole === "user" ? "You" : "DOCCHAT",
    timestamp: message.dataset.exportTimestamp || "",
    content: plainText(message.querySelector("[data-export-content]")?.innerText || ""),
  }),
);

export const exportChatPdf = async (chatElement) => {
  if (!chatElement) throw new Error("The conversation is not ready to export.");

  const messages = getMessages(chatElement);
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const exportedAt = new Date().toLocaleString();
  let y = TOP;

  const drawHeader = () => {
    pdf.setTextColor(22, 101, 52);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text("DOCCHAT - Chat Export", MARGIN, 42);
    pdf.setTextColor(107, 114, 128);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(`Exported ${exportedAt}`, MARGIN, 58);
    pdf.setDrawColor(209, 213, 219);
    pdf.line(MARGIN, 68, PAGE_WIDTH - MARGIN, 68);
  };

  const newPage = () => {
    pdf.addPage();
    drawHeader();
    y = TOP;
  };

  const addLine = (text, indent = 0, lineHeight = 14) => {
    if (y + lineHeight > PAGE_HEIGHT - BOTTOM) newPage();
    pdf.text(text, MARGIN + indent, y);
    y += lineHeight;
  };

  drawHeader();
  pdf.setTextColor(75, 85, 99);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  addLine(`${messages.length} message${messages.length === 1 ? "" : "s"}`, 0, 18);

  messages.forEach((message) => {
    if (y + 40 > PAGE_HEIGHT - BOTTOM) newPage();
    pdf.setTextColor(message.role === "You" ? 37 : 22, message.role === "You" ? 99 : 101, message.role === "You" ? 235 : 52);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    addLine(message.role, 0, 14);
    pdf.setTextColor(107, 114, 128);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    addLine(message.timestamp, 0, 13);
    pdf.setTextColor(31, 41, 55);
    pdf.setFontSize(10);
    const lines = pdf.splitTextToSize(message.content || "(No text)", PAGE_WIDTH - MARGIN * 2 - 10);
    lines.forEach((line) => addLine(line, 10, 14));
    y += 12;
  });

  const totalPages = pdf.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(229, 231, 235);
    pdf.line(MARGIN, PAGE_HEIGHT - 32, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 32);
    pdf.setTextColor(107, 114, 128);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text("Generated locally by DOCCHAT - not stored on the server", MARGIN, PAGE_HEIGHT - 18);
    pdf.text(`Page ${page} of ${totalPages}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 18, { align: "right" });
  }

  pdf.save(`docchat-${new Date().toISOString().slice(0, 10)}.pdf`);
};
