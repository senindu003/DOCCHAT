const printStyles = () => Array.from(
  document.querySelectorAll('link[rel="stylesheet"], style'),
  (stylesheet) => stylesheet.outerHTML,
).join("\n");

export const exportChatPdf = async (chatElement) => {
  if (!chatElement) throw new Error("The conversation is not ready to export.");

  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) {
    throw new Error("Your browser blocked the print window. Allow pop-ups, then try again.");
  }

  const transcript = chatElement.cloneNode(true);
  transcript.querySelectorAll("button").forEach((button) => button.remove());

  printWindow.document.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <base href="${window.location.origin}/" />
    <title>DOCCHAT conversation</title>
    ${printStyles()}
    <style>
      @page { size: A4; margin: 12mm; }
      html, body { background: #ffffff !important; }
      body { margin: 0; padding: 0; }
      .docchat-print-header { margin: 0 0 18px; padding-bottom: 12px; border-bottom: 1px solid #d1d5db; }
      .docchat-print-header h1 { margin: 0; font: 700 18px/1.2 Arial, sans-serif; color: #166534; }
      .docchat-print-header p { margin: 5px 0 0; font: 12px/1.4 Arial, sans-serif; color: #6b7280; }
      .docchat-print-content { width: 100%; }
      .docchat-print-content button { display: none !important; }
      .docchat-print-content > div { break-inside: avoid; page-break-inside: avoid; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style>
  </head>
  <body>
    <header class="docchat-print-header">
      <h1>DOCCHAT conversation</h1>
      <p>Exported ${new Date().toLocaleString()}</p>
    </header>
    <main class="docchat-print-content">${transcript.outerHTML}</main>
  </body>
</html>`);
  printWindow.document.close();

  await new Promise((resolve) => {
    printWindow.onload = resolve;
    setTimeout(resolve, 700);
  });
  printWindow.focus();
  printWindow.print();
  printWindow.onafterprint = () => printWindow.close();
};
