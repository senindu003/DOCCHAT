import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Send, Bot, User, Copy, RefreshCw, Download } from "lucide-react";
import "katex/dist/katex.min.css";
import { useNavigate } from "react-router-dom";
import Dialog from "./Dialog";
import { exportChatPdf } from "../utils/exportChatPdf";
import BackButton from "./BackButton";

const Chat = () => {
  const navigate = useNavigate();

  const VITE_API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  const [messages, setMessages] = useState(() => {
    const user = JSON.parse(localStorage.getItem("userDetails")).username;
    const prev_msgs = JSON.parse(localStorage.getItem("messages"));
    if (!prev_msgs || prev_msgs.length == 0) {
      return [
        {
          id: "1",
          content: `Hello ${user}! \n\nI'm DOCCHAT. Ask me anything about your documents!`,
          role: "assistant",
          timestamp: new Date(),
          isQuiz: false,
        },
      ];
    } else {
      return JSON.parse(localStorage.getItem("messages"));
    }
  });

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const chatExportRef = useRef(null);
  const [userMetaData, setUserMetaData] = useState({});
  const [isNext, setISNext] = useState(false);
  const [currCategory, setCurrCategory] = useState(() => {
    const cat = JSON.parse(localStorage.getItem("currCategory"));
    if (cat) {
      return cat;
    } else {
      return "";
    }
  });
  const [currSection, setCurrSection] = useState(() => {
    const sec = JSON.parse(localStorage.getItem("currSection"));
    if (sec && sec.length > 0) {
      return sec;
    } else {
      return [];
    }
  });
  const [selectFocus, setSelectFocus] = useState(false);
  const [isFocused, setIsFocused] = useState(currSection.length > 0);
  const [disableCancel, setDisableCancel] = useState(false);
  const [hist, setHist] = useState("");
  const [notice, setNotice] = useState(null);
  const [showClearDialog, setShowClearDialog] = useState(false);

  // Auto-scroll to bottom

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    chat_history();
    localStorage.setItem("messages", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    const UMData = JSON.parse(localStorage.getItem("userDetails")).meta_data;
    setUserMetaData(UMData);
  }, []);

  useEffect(() => {
    setDisableCancel(currCategory !== "" || currSection.length > 0);
    localStorage.setItem("currCategory", JSON.stringify(currCategory));
    localStorage.setItem("currSection", JSON.stringify(currSection));
  }, [currSection, currCategory]);

  const prevCategoryRef = useRef(currCategory);

  useEffect(() => {
    if (prevCategoryRef.current !== currCategory) {
      setCurrSection([]); // Reset only when category changes
      prevCategoryRef.current = currCategory;
    }
  }, [currCategory]);

  const chat_history = () => {
    const recentMessages = messages.slice(-4).map((message) =>
      JSON.stringify({ role: message.role, content: message.content }),
    );
    setHist(recentMessages.join(","));
  };

  // Send query to backend API
  const sendQuery = async (query) => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${VITE_API_BASE_URL}/get_info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        query: { query: query, history: hist },
        meta_data: { category: currCategory, sections: currSection },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Query can't be processed!");
    }

    return res.json();
  };

  // Improved quiz detection and formatting
  const detectAndFormatQuiz = (content) => {
    // Check for quiz patterns
    const hasNumberedQuestions = /\d+\.\s+.+/g.test(content);
    const hasOptions = /[a-d]\)\s+.+/gi.test(content);
    const hasCorrectAnswer = /Correct Answer:/i.test(content);

    const isQuiz = hasNumberedQuestions && hasOptions;

    if (!isQuiz) {
      return { isQuiz: false, content };
    }

    // Format the quiz content
    let formatted = content;

    // Add quiz header
    formatted = "\n\n" + formatted;

    // Fix the issue where "Correct Answer:" is on same line as last option
    formatted = formatted.replace(
      /([a-d]\)\s+[^\.]+\.)\s+(Correct Answer:)/gi,
      "$1\n\n**$2**",
    );

    // Make sure Correct Answer gets its own line with bold formatting
    formatted = formatted.replace(
      /Correct Answer:\s*([a-d]\)\s+.+)/gi,
      "\n\n**Correct Answer:** $1",
    );

    // Add proper spacing between questions
    formatted = formatted.replace(/(\d+\.\s+)/g, "\n**$1**");

    // Ensure each option is on a new line
    formatted = formatted.replace(/([a-d]\)\s+)/gi, "\n$1");

    // Remove any double newlines we might have created
    formatted = formatted.replace(/\n\n\n/g, "\n\n");

    return { isQuiz: true, content: formatted.trim() };
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    // Add user message
    const userMessage = {
      id: Date.now().toString(),
      content: input,
      role: "user",
      timestamp: new Date(),
      isQuiz: false,
    };

    setMessages((prev) => [...prev, userMessage]);
    const userInput = input;
    setInput("");
    setIsLoading(true);

    try {
      // Call your backend API
      const response = await sendQuery(userInput);

      // Extract answer from response
      const answer =
        response.answer ||
        (response.detail ? String(response.detail) : "No response received");

      // Detect and format quiz
      const { isQuiz, content } = detectAndFormatQuiz(answer);

      // Add AI response
      const aiMessage = {
        id: (Date.now() + 1).toString(),
        content: content,
        role: "assistant",
        timestamp: new Date(),
        isQuiz: isQuiz,
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error("Error calling backend:", error);

      // Add error message
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        content: `Sorry, I encountered an error: ${error.message}`,
        role: "assistant",
        timestamp: new Date(),
        isQuiz: false,
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    const user = JSON.parse(localStorage.getItem("userDetails")).username;
    setMessages([
      {
        id: "1",
        content: `Hello ${user}! \n\nI'm DOCCHAT. Ask me anything about your documents!`,
        role: "assistant",
        timestamp: new Date(),
        isQuiz: false,
      },
    ]);
    setIsFocused(false);
    setCurrCategory("");
    setCurrSection([]);
    setISNext(false);
    setSelectFocus(false);
  };

  const downloadChatPdf = async () => {
    try {
      await exportChatPdf(chatExportRef.current);
      return true;
    } catch (error) {
      console.error("Unable to export chat:", error);
      setNotice({ title: "Export failed", message: error.message || "Unable to create the PDF." });
      return false;
    }
    if (false) { // Superseded vector exporter; kept out of the runtime bundle during this transition.
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 46;
    if (false) { // Legacy plain-text layout retained temporarily for source compatibility.
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    const addLines = (lines, lineHeight = 16) => {
      lines.forEach((line) => {
        if (y + lineHeight > pageHeight - margin) {
          pdf.addPage();
          y = margin;
        }
        pdf.text(line, margin, y);
        y += lineHeight;
      });
    };

    pdf.setFontSize(18);
    addLines(["DOCCHAT conversation"], 22);
    pdf.setFontSize(10);
    addLines([`Exported ${new Date().toLocaleString()}`, ""], 15);

    messages.forEach((message) => {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      addLines([`${message.role === "user" ? "You" : "DOCCHAT"} — ${new Date(message.timestamp).toLocaleString()}`]);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      const plainContent = String(message.content)
        .replace(/\*\*/g, "")
        .replace(/`/g, "")
        .replace(/#+\s/g, "")
        .trim();
      addLines(pdf.splitTextToSize(plainContent, contentWidth));
      y += 10;
    });

    }

    const headerHeight = 112;
    const footerHeight = 42;
    const cardWidth = pageWidth - margin * 2;
    const cardTextWidth = cardWidth - 36;
    const bodyLineHeight = 14;
    const cardTopPadding = 34;
    const cardBottomPadding = 18;
    let y = headerHeight + 24;

    const cleanText = (value) => String(value)
      .replace(/\*\*/g, "")
      .replace(/`/g, "")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/^\s*[*+]\s+/gm, "- ")
      .replace(/[^\x20-\x7E\n\r\t]/g, "?")
      .replace(/\r/g, "")
      .trim();

    const drawHeader = () => {
      pdf.setFillColor(22, 101, 52);
      pdf.rect(0, 0, pageWidth, headerHeight, "F");
      pdf.setFillColor(255, 255, 255);
      pdf.circle(margin + 14, 38, 14, "F");
      pdf.setTextColor(22, 101, 52);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(13);
      pdf.text("D", margin + 9.5, 42.5);
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(20);
      pdf.text("DOCCHAT", margin + 40, 36);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.text("Conversation transcript", margin + 40, 53);
      pdf.setFontSize(8);
      pdf.text(`Exported ${new Date().toLocaleString()}`, margin, 88);
    };

    const startNewPage = () => {
      pdf.addPage();
      drawHeader();
      y = headerHeight + 24;
    };

    drawHeader();
    pdf.setTextColor(75, 85, 99);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(`${messages.length} message${messages.length === 1 ? "" : "s"}`, margin, y);
    y += 20;

    const splitMarkdownBlocks = (content) => {
      const blocks = [];
      const textLines = [];
      let tableLines = [];
      const flushText = () => {
        const text = textLines.join("\n").trim();
        if (text) blocks.push({ type: "text", content: text });
        textLines.length = 0;
      };
      const flushTable = () => {
        const rows = tableLines
          .map((line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cleanText(cell)))
          .filter((row) => row.some((cell) => cell));
        if (rows.length >= 2) {
          blocks.push({ type: "table", header: rows[0], body: rows.slice(1).filter((row) => !row.every((cell) => /^:?-{2,}:?$/.test(cell))) });
        } else {
          textLines.push(...tableLines);
        }
        tableLines = [];
      };

      String(content).replace(/\r/g, "").split("\n").forEach((line) => {
        if (line.trim().startsWith("|")) {
          flushText();
          tableLines.push(line);
        } else {
          if (tableLines.length) flushTable();
          textLines.push(line);
        }
      });
      if (tableLines.length) flushTable();
      flushText();
      return blocks.length ? blocks : [{ type: "text", content: "(No text)" }];
    };

    const drawTextCard = (message, content) => {
      const isUser = message.role === "user";
      const author = isUser ? "YOU" : "DOCCHAT";
      const timestamp = new Date(message.timestamp).toLocaleString();
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      const lines = pdf.splitTextToSize(cleanText(content) || "(No text)", cardTextWidth);
      let lineIndex = 0;
      let continuation = false;

      while (lineIndex < lines.length) {
        const availableHeight = pageHeight - footerHeight - y;
        const availableLineCount = Math.floor((availableHeight - cardTopPadding - cardBottomPadding) / bodyLineHeight);
        if (availableLineCount < 1) {
          startNewPage();
          continue;
        }

        const cardLines = lines.slice(lineIndex, lineIndex + availableLineCount);
        const cardHeight = cardTopPadding + cardLines.length * bodyLineHeight + cardBottomPadding;
        const accent = isUser ? [37, 99, 235] : [22, 101, 52];
        const background = isUser ? [239, 246, 255] : [240, 253, 244];

        pdf.setFillColor(...background);
        pdf.roundedRect(margin, y, cardWidth, cardHeight, 8, 8, "F");
        pdf.setFillColor(...accent);
        pdf.roundedRect(margin, y, 5, cardHeight, 3, 3, "F");
        pdf.setTextColor(...accent);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        pdf.text(continuation ? `${author} (continued)` : author, margin + 18, y + 18);
        pdf.setTextColor(107, 114, 128);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.text(timestamp, pageWidth - margin - 18, y + 18, { align: "right" });
        pdf.setTextColor(31, 41, 55);
        pdf.setFontSize(10);
        pdf.text(cardLines, margin + 18, y + cardTopPadding, { lineHeightFactor: 1.4 });

        y += cardHeight + 12;
        lineIndex += cardLines.length;
        continuation = true;
      }
    };

    const drawTable = (message, table) => {
      const isUser = message.role === "user";
      const accent = isUser ? [37, 99, 235] : [22, 101, 52];
      if (y + 84 > pageHeight - footerHeight) startNewPage();
      pdf.setTextColor(...accent);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.text(`${isUser ? "YOU" : "DOCCHAT"} - table`, margin, y + 8);
      autoTable(pdf, {
        startY: y + 18,
        margin: { left: margin, right: margin, top: headerHeight + 24, bottom: footerHeight + 12 },
        head: [table.header],
        body: table.body,
        theme: "grid",
        styles: { font: "helvetica", fontSize: 8, cellPadding: 5, textColor: [31, 41, 55], lineColor: [209, 213, 219] },
        headStyles: { fillColor: accent, textColor: [255, 255, 255], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        willDrawPage: () => drawHeader(),
      });
      y = pdf.lastAutoTable.finalY + 14;
    };

    messages.forEach((message) => {
      splitMarkdownBlocks(message.content).forEach((block) => {
        if (block.type === "table") drawTable(message, block);
        else drawTextCard(message, block.content);
      });
    });

    const totalPages = pdf.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      pdf.setPage(page);
      pdf.setDrawColor(229, 231, 235);
      pdf.line(margin, pageHeight - footerHeight + 4, pageWidth - margin, pageHeight - footerHeight + 4);
      pdf.setTextColor(107, 114, 128);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.text("Generated locally by DOCCHAT - not stored on the server", margin, pageHeight - 20);
      pdf.text(`Page ${page} of ${totalPages}`, pageWidth - margin, pageHeight - 20, { align: "right" });
    }

    pdf.save(`docchat-${new Date().toISOString().slice(0, 10)}.pdf`);
    }
  };

  const requestClearChat = () => setShowClearDialog(true);

  const copyToClipboard = async (text, isQuiz = false) => {
    try {
      // Remove markdown formatting if it's a quiz
      const textToCopy = isQuiz
        ? text
            .replace(/\*\*/g, "")
            .replace(/### /g, "")
            .replace(/📝 /g, "")
            .trim()
        : text;
      await navigator.clipboard.writeText(textToCopy);
      setNotice({ title: "Copied", message: "The response was copied to your clipboard." });
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // Custom components for better quiz rendering
  const quizComponents = {
    h3: ({ node, ...props }) => (
      <h3
        className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2"
        {...props}
      >
        <span className="text-green-600">📝</span>
        {props.children}
      </h3>
    ),
    strong: ({ node, ...props }) => {
      // Style question numbers
      if (
        typeof props.children === "string" &&
        props.children.match(/^\d+\.$/)
      ) {
        return <strong className="text-blue-600 text-lg mr-2" {...props} />;
      }
      // Style "Correct Answer:" text
      if (
        typeof props.children === "string" &&
        props.children.includes("Correct Answer:")
      ) {
        return <strong className="text-green-700 text-base" {...props} />;
      }
      return <strong {...props} />;
    },
    p: ({ node, ...props }) => {
      const content = props.children;
      if (typeof content === "string") {
        // If it's an option line, style it differently
        if (content.match(/^[a-d]\)/)) {
          return <p className="ml-6 my-1 text-gray-700" {...props} />;
        }
        // If it's a question (starts with a bold number), add margin
        if (content.includes("<strong>") && content.match(/\d+\./)) {
          return (
            <p className="mt-4 mb-2 font-medium text-gray-800" {...props} />
          );
        }
      }
      return <p className="my-2" {...props} />;
    },
    // Handle inline elements within paragraphs
    span: ({ node, ...props }) => {
      // Check if this span contains a question number
      const parentText = node?.parent?.children?.[0]?.value || "";
      if (parentText.match(/^\d+\.\s/)) {
        return <span className="font-medium text-gray-800" {...props} />;
      }
      return <span {...props} />;
    },
  };

  return (
    <div id="wrapper" className="relative">
      <Dialog open={Boolean(notice)} title={notice?.title || "Notice"} onClose={() => setNotice(null)}>
        {notice?.message}
      </Dialog>
      <Dialog
        open={showClearDialog}
        title="Clear this chat?"
        onClose={() => setShowClearDialog(false)}
        actions={
          <>
            <button type="button" onClick={() => setShowClearDialog(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={() => { clearChat(); setShowClearDialog(false); }} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Clear without saving</button>
            <button type="button" onClick={async () => { if (await downloadChatPdf()) { clearChat(); setShowClearDialog(false); } }} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">Save PDF & clear</button>
          </>
        }
      >
        Would you like to download this conversation as a PDF before clearing it?
      </Dialog>
      {!isNext && selectFocus && (
        <div className="flex flex-col justify-center items-center z-10 bg-white text-black border-2 rounded-2xl min-w-1/4 max-h-1/2 absolute top-2/5 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <div className="flex-1 my-3">--Select Category--</div>
          <div className="overflow-auto justify-center items-center">
            {Object.keys(userMetaData)
              .sort()
              .map((category) => {
                return (
                  <div key={category} className="mx-4 truncate my-1">
                    <input
                      className="mx-1"
                      type="radio"
                      id={category}
                      name="cats"
                      value={category}
                      checked={currCategory === category}
                      onChange={(e) => {
                        setCurrCategory(e.target.value);
                      }}
                    />
                    <label className="" htmlFor={category}>
                      {category}
                    </label>
                    <br></br>
                  </div>
                );
              })}
          </div>

          <div className="flex-1 flex-row justify-center space-x-10 items-center mt-6 mb-3">
            <button
              onClick={() => {
                setISNext(true);
              }}
              className={`${
                currCategory !== ""
                  ? "opacity-100"
                  : "pointer-events-none select-none opacity-50"
              } flex-1 text-sm bg-green-600 hover:bg-green-700 transition text-white py-1.5 px-4 rounded-xl`}
            >
              Next
            </button>
            <button
              onClick={() => {
                setSelectFocus(false);
              }}
              className={`${
                disableCancel
                  ? "pointer-events-none select-none opacity-50"
                  : "opacity-100"
              } text-sm bg-red-600 hover:bg-red-700 transition text-white py-1.5 px-4 rounded-xl`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {isNext && selectFocus && (
        <div className="flex flex-col justify-center items-center z-10 bg-white text-black border-2 rounded-2xl min-w-1/4 max-h-1/2 absolute top-2/5 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <div className="flex-1 my-3">--Select Section(s)--</div>
          <div className="overflow-auto justify-center items-center">
            {(Array.isArray(userMetaData[currCategory]) ? userMetaData[currCategory] : []).sort().map((section) => {
              return (
                <div key={section} className="mx-4 truncate my-1">
                  <input
                    className="mx-1"
                    type="checkbox"
                    id={section}
                    name="secs"
                    value={section}
                    checked={currSection.includes(section)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setCurrSection((prev) => [...prev, section]);
                      } else {
                        setCurrSection((prev) =>
                          prev.filter((sec) => sec !== section),
                        );
                      }
                    }}
                  />
                  <label className="" htmlFor={section}>
                    {section}
                  </label>
                  <br></br>
                </div>
              );
            })}
          </div>

          <div className="flex-1 flex-row justify-center space-x-10 items-center mt-6 mb-3 mx-2">
            <button
              onClick={() => {
                setISNext(false);
              }}
              className=" flex-1 text-sm bg-green-600 hover:bg-green-700 transition text-white py-1.5 px-4 rounded-xl"
            >
              Back
            </button>
            <button
              onClick={() => {
                setSelectFocus(false);
                setIsFocused(true);

                const focusedSections = currSection.slice().sort().join(", ");
                const focusedMessage = {
                  id: (Date.now() + 1).toString(),
                  content: `You focused me on sections **${focusedSections}** under category **${currCategory}**.`,
                  role: "assistant",
                  timestamp: new Date(),
                  isQuiz: false,
                };
                setMessages((prev) =>
                  prev.some((message) => message.content === focusedMessage.content)
                    ? prev
                    : [...prev, focusedMessage],
                );
              }}
              className="flex-1 text-sm bg-blue-600 hover:bg-blue-700 transition text-white py-1.5 px-4 rounded-xl"
            >
              Apply
            </button>
            <button
              onClick={() => {
                setSelectFocus(false);
              }}
              className={`${
                disableCancel
                  ? "pointer-events-none select-none opacity-50"
                  : "opacity-100"
              } text-sm bg-red-600 hover:bg-red-700 transition text-white py-1.5 px-4 rounded-xl`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <div
        className={`max-w-4xl mx-auto p-4 h-screen flex flex-col ${
          selectFocus
            ? "pointer-events-none select-none opacity-50"
            : "opacity-100"
        }`}
      >
        {/* Header */}
        <div className="bg-white rounded-t-lg border-b border-gray-200 p-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Bot className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-800">DOCCHAT</h1>
                <p className="text-sm text-gray-500">
                  Ask questions about your documents
                </p>
              </div>
            </div>
            <div className="flex flex-row justify-around items-center gap-x-4">
              <button
                onClick={requestClearChat}
                className="flex items-center px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition"
              >
                <RefreshCw className="w-4 h-4" />
                Clear Chat
              </button>
              <button
                onClick={downloadChatPdf}
                disabled={messages.length === 0}
                className="flex items-center px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition disabled:opacity-50"
              >
                <Download className="w-4 h-4 mr-1" />
                Export Chat
              </button>
              <BackButton
                onClick={() => navigate("/home", { replace: false })}
              />
            </div>
          </div>
        </div>

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto bg-white p-4">
          <div ref={chatExportRef} className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                data-export-message
                data-export-role={message.role}
                data-export-timestamp={new Date(message.timestamp).toLocaleString()}
                className={`flex gap-4 ${
                  message.role === "user" ? "flex-row-reverse" : ""
                }`}
              >
                {/* Avatar */}
                <div
                  className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    message.role === "user" ? "bg-blue-100" : "bg-green-100"
                  }`}
                >
                  {message.role === "user" ? (
                    <User className="w-4 h-4 text-blue-600" />
                  ) : (
                    <Bot className="w-4 h-4 text-green-600" />
                  )}
                </div>

                {/* Message Bubble */}
                <div
                  className={`max-w-[80%] rounded-2xl p-4 ${
                    message.role === "user"
                      ? "bg-blue-600 text-white rounded-br-none"
                      : "bg-gray-100 text-gray-800 rounded-bl-none"
                  }`}
                >
                  {/* Message Header */}
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium">
                      {message.role === "user" ? "You" : "AI Assistant"}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs opacity-75">
                        {new Date(message.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {message.role === "assistant" && (
                        <button
                          onClick={() =>
                            copyToClipboard(message.content, message.isQuiz)
                          }
                          className="opacity-50 hover:opacity-100 transition"
                          title="Copy response"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Message Content */}
                  <div data-export-content className="max-w-none">
                    {message.role === "user" ? (
                      <div className="whitespace-pre-wrap">
                        {message.content}
                      </div>
                    ) : message.isQuiz ? (
                      <div className="quiz-container bg-white rounded-lg">
                        <div className="prose prose-sm max-w-none">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                            components={quizComponents}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    ) : (
                      <div className="prose prose-sm max-w-none">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath]}
                          rehypePlugins={[rehypeKatex]}
                        >
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex gap-4">
                <div className="shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-green-600" />
                </div>
                <div className="bg-gray-100 text-gray-800 rounded-2xl rounded-bl-none p-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse delay-150"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse delay-300"></div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="relative bg-white rounded-b-lg border-t border-gray-200 p-4">
          <div className="flex flex-row mb-3 text-sm gap-x-5 text-gray-500 text-center justify-center items-center">
            <button
              onClick={() => {
                setIsFocused(false);
                setSelectFocus(true);
              }}
              className={`relative cursor-pointer flex-1 bg-green-600 hover:bg-green-700 text-white transition rounded-lg p-2`}
            >
              {isFocused
                ? "Change Focus"
                : selectFocus
                  ? "Focusing..."
                  : "Focus me"}
              {!isFocused && (
                <span className="absolute top-1 right-1 flex size-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75"></span>
                  <span className="relative inline-flex size-3 rounded-full bg-red-600"></span>
                </span>
              )}
            </button>

            <p className="flex-3">
              Press Enter to send • Shift+Enter for new line
            </p>

            <button
              className={`relative cursor-pointer ${!isFocused ? "opacity-50 select-none pointer-events-none" : "opacity-100"} flex-1 bg-green-600 hover:bg-green-700 text-white transition rounded-lg p-2`}
              onClick={() => {
                console.log(JSON.parse(localStorage.getItem("currSection")));
                console.log(JSON.stringify(currSection));
                console.log(JSON.stringify(currCategory));
                setNotice({
                  title: "Current focus",
                  message: `You focused DOCCHAT on sections ${currSection.sort().toString()} under category ${currCategory}.`,
                });
              }}
            >
              View Focused
              {isFocused && (
                <span className="absolute top-1 right-1 flex size-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75"></span>
                  <span className="relative inline-flex size-3 rounded-full bg-red-600"></span>
                </span>
              )}
            </button>
          </div>

          <div className="relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Ask a question about your documents..."
              className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none min-h-15 max-h-30"
              rows={1}
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className={`absolute right-3 bottom-3 p-2 rounded-lg transition ${
                input.trim() && !isLoading
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
              }`}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;
