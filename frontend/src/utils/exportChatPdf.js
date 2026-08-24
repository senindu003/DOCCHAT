const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const HEADER_HEIGHT = 92;
const FOOTER_HEIGHT = 36;

const makeExportSurface = (chatElement) => {
  const surface = document.createElement("article");
  surface.setAttribute("aria-hidden", "true");
  surface.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    "width:760px",
    "box-sizing:border-box",
    "padding:36px",
    "background:#ffffff",
    "color:#111827",
    "font-family:Arial, Helvetica, sans-serif",
  ].join(";");

  const title = document.createElement("header");
  title.style.cssText = "margin-bottom:28px;border-bottom:2px solid #166534;padding-bottom:16px";
  title.innerHTML = `<h1 style="margin:0;color:#166534;font-size:28px;line-height:1.2">DOCCHAT conversation</h1><p style="margin:7px 0 0;color:#6b7280;font-size:13px">Exported ${new Date().toLocaleString()}</p>`;
  surface.append(title);

  const transcript = chatElement.cloneNode(true);
  transcript.querySelectorAll("button, svg, [data-export-ignore='true']").forEach((element) => element.remove());
  transcript.querySelectorAll(".animate-spin, .animate-pulse").forEach((element) => element.remove());
  transcript.style.cssText = "display:block";
  surface.append(transcript);

  document.body.append(surface);
  return surface;
};

const drawPageChrome = (pdf, pageNumber, totalPages, exportedAt) => {
  pdf.setFillColor(22, 101, 52);
  pdf.rect(0, 0, PAGE_WIDTH, HEADER_HEIGHT, "F");
  pdf.setFillColor(255, 255, 255);
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
  pdf.setFontSize(8);
  pdf.text("Generated locally by DOCCHAT - not stored on the server", MARGIN, PAGE_HEIGHT - 17);
  pdf.text(`Page ${pageNumber} of ${totalPages}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 17, { align: "right" });
};

export const exportChatPdf = async (chatElement) => {
  if (!chatElement) throw new Error("The conversation is not ready to export.");

  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const exportedAt = new Date().toLocaleString();
  const surface = makeExportSurface(chatElement);

  try {
    await new Promise((resolve) => {
      pdf.html(surface, {
        x: MARGIN,
        y: HEADER_HEIGHT + 18,
        width: PAGE_WIDTH - MARGIN * 2,
        windowWidth: 760,
        autoPaging: "text",
        margin: [HEADER_HEIGHT + 18, MARGIN, FOOTER_HEIGHT + 12, MARGIN],
        html2canvas: {
          scale: 0.72,
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
        },
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
