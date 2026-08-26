import React, { useState } from "react";
import {
  X,
  FileText,
  CheckCircle,
  AlertCircle,
  Loader,
  File,
  MessageCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createUploadJob, getUploadJob } from "../api";
import Dialog from "./Dialog";
import BackButton from "./BackButton";

const MAX_FILES = 3;
const NON_PDF_TIP =
  "Tip: If your document includes images, complex tables, or important layout, upload it as a PDF for better extraction.";
const FILE_TYPES = {
  pdf: { label: "PDF", maxBytes: 10 * 1024 * 1024, strategy: "fast" },
  docx: { label: "DOCX", maxBytes: 5 * 1024 * 1024, strategy: "auto" },
  html: { label: "HTML", maxBytes: 2 * 1024 * 1024, strategy: "auto" },
  htm: { label: "HTML", maxBytes: 2 * 1024 * 1024, strategy: "auto" },
  txt: { label: "TXT", maxBytes: 2 * 1024 * 1024, strategy: "auto" },
  md: { label: "Markdown", maxBytes: 2 * 1024 * 1024, strategy: "auto" },
  markdown: { label: "Markdown", maxBytes: 2 * 1024 * 1024, strategy: "auto" },
};
const ACCEPTED_FILES =
  ".pdf,.docx,.html,.htm,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/html,text/plain,text/markdown";

function fileExtension(fileName) {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

function formatSize(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const UploadDocs = () => {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [notice, setNotice] = useState(null);

  const addFiles = (fileList) => {
    const existingNames = new Set(files.map((file) => file.name));
    const remainingSlots = MAX_FILES - files.length;
    const accepted = [];
    const problems = [];
    for (const file of fileList) {
      const extension = fileExtension(file.name);
      const config = FILE_TYPES[extension];
      if (!config) problems.push(`${file.name}: unsupported format`);
      else if (file.size === 0) problems.push(`${file.name}: file is empty`);
      else if (file.size > config.maxBytes)
        problems.push(
          `${file.name}: ${config.label} files are limited to ${config.maxBytes / (1024 * 1024)} MB`,
        );
      else if (
        existingNames.has(file.name) ||
        accepted.some((item) => item.name === file.name)
      )
        problems.push(`${file.name}: already selected`);
      else if (accepted.length >= remainingSlots)
        problems.push(
          `${file.name}: only ${MAX_FILES} files can be uploaded at once`,
        );
      else
        accepted.push({
          id: `${file.name}-${Date.now()}-${Math.random()}`,
          name: file.name,
          size: formatSize(file.size),
          bytes: file.size,
          type: config.label,
          isPdf: extension === "pdf",
          strategy: config.strategy,
          category: "",
          section: "",
          file,
          status: "pending",
          stage: "Waiting to upload",
          progress: 0,
          error: "",
        });
    }
    if (accepted.length) {
      setFiles((previous) => [...previous, ...accepted]);
      setUploadStatus(null);
      setUploadMessage("");
    }
    if (problems.length) setNotice(problems.join("\n"));
  };

  const updateFileInfo = (id, field, value) =>
    setFiles((previous) =>
      previous.map((file) =>
        file.id === id ? { ...file, [field]: value } : file,
      ),
    );
  const removeFile = (id) => {
    setFiles((previous) => previous.filter((file) => file.id !== id));
    setUploadStatus(null);
    setUploadMessage("");
  };
  const clearAllFiles = () => {
    setFiles([]);
    setUploadStatus(null);
    setUploadMessage("");
    setUploadProgress(0);
  };

  const validateFiles = () => {
    const invalid = files.filter(
      (file) => !file.category.trim() || !file.section.trim(),
    );
    if (invalid.length) {
      setUploadStatus("error");
      setUploadMessage(
        `Please fill in both Category and Section for: ${invalid.map((file) => file.name).join(", ")}`,
      );
      return false;
    }
    if (!files.some((file) => file.status !== "uploaded")) {
      setUploadStatus("error");
      setUploadMessage("All selected files have already been uploaded.");
      return false;
    }
    return true;
  };

  const isUploadDisabled = () =>
    files.length === 0 ||
    isUploading ||
    files.every((file) => file.status === "uploaded") ||
    files.some((file) => !file.category.trim() || !file.section.trim());

  const handleUpload = async () => {
    if (!validateFiles()) return;
    const filesToUpload = files.filter((file) => file.status !== "uploaded");
    const hasHighResolutionPdf = filesToUpload.some(
      (file) => file.strategy === "hi_res",
    );
    setIsUploading(true);
    setUploadProgress(0);
    setUploadStatus(null);
    setUploadMessage("Starting upload...");
    setFiles((previous) =>
      previous.map((file) =>
        file.status !== "uploaded"
          ? {
              ...file,
              status: "uploading",
              stage: "Uploading",
              progress: 0,
              error: "",
            }
          : file,
      ),
    );
    const formData = new FormData();
    filesToUpload.forEach((fileInfo) => {
      formData.append("files", fileInfo.file);
      formData.append("categories", fileInfo.category.trim());
      formData.append("sections", fileInfo.section.trim());
      formData.append("partition_strategies", fileInfo.strategy);
    });
    formData.append("async_mode", "true");
    try {
      const job = await createUploadJob(formData, (progress) => {
        setUploadProgress(progress);
        setUploadMessage("Uploading documents to the server...");
      });
      let result = job;
      const startedAt = Date.now();
      const maxPollingMinutes = hasHighResolutionPdf ? 30 : 15;
      while (result.status === "queued" || result.status === "processing") {
        if (Date.now() - startedAt >= maxPollingMinutes * 60 * 1000)
          throw new Error(
            `Processing took longer than ${maxPollingMinutes} minutes. Check the upload status or retry the affected file.`,
          );
        await new Promise((resolve) => setTimeout(resolve, 1000));
        result = await getUploadJob(job.job_id);
        const average = result.results?.length
          ? result.results.reduce((total, item) => total + item.progress, 0) /
            result.results.length
          : 0;
        setUploadProgress(Math.max(8, average));
        setUploadMessage("Processing documents on the server...");
        setFiles((previous) =>
          previous.map((file) => {
            const item = result.results?.find(
              (candidate) => candidate.filename === file.name,
            );
            return !item
              ? file
              : {
                  ...file,
                  status:
                    item.status === "processed"
                      ? "uploaded"
                      : item.status === "failed"
                        ? "error"
                        : "uploading",
                  stage: item.stage,
                  progress: item.progress,
                  error: item.error || "",
                };
          }),
        );
      }
      if (result.user_details)
        localStorage.setItem(
          "userDetails",
          JSON.stringify(result.user_details),
        );
      const successCount =
        result.results?.filter((item) => item.status === "processed").length ||
        0;
      const failedCount =
        result.results?.filter((item) => item.status === "failed").length || 0;
      setUploadProgress(100);
      setFiles((previous) =>
        previous.map((file) => {
          const item = result.results?.find(
            (candidate) => candidate.filename === file.name,
          );
          return item
            ? {
                ...file,
                status: item.status === "processed" ? "uploaded" : "error",
                stage: item.stage,
                progress: item.progress,
                error: item.error || "",
              }
            : file;
        }),
      );
      setUploadStatus(failedCount ? "error" : "success");
      setUploadMessage(
        `Successfully processed ${successCount} document${successCount === 1 ? "" : "s"}${failedCount ? ` (${failedCount} failed)` : ""}.`,
      );
    } catch (error) {
      setUploadProgress(0);
      setUploadStatus("error");
      setUploadMessage(`Upload failed: ${error.message}`);
      setFiles((previous) =>
        previous.map((file) =>
          file.status === "uploading"
            ? { ...file, status: "error", error: error.message }
            : file,
        ),
      );
    } finally {
      setIsUploading(false);
    }
  };

  const pendingCount = files.filter((file) => file.status === "pending").length;
  const uploadingCount = files.filter(
    (file) => file.status === "uploading",
  ).length;
  const uploadedCount = files.filter(
    (file) => file.status === "uploaded",
  ).length;
  const errorCount = files.filter((file) => file.status === "error").length;
  const allFieldsFilled =
    files.length > 0 &&
    files.every((file) => file.category.trim() && file.section.trim());

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <Dialog
        open={Boolean(notice)}
        title="File selection"
        onClose={() => setNotice(null)}
      >
        <p className="whitespace-pre-line">{notice}</p>
      </Dialog>
      <div className="max-w-6xl mx-auto">
        <BackButton onClick={() => navigate("/home")} className="mb-4" />
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6 md:mb-8 text-center">
          Document Upload Portal
        </h1>
        <div
          className={`border-2 border-dashed rounded-2xl p-8 md:p-12 text-center mb-6 transition-all ${dragging ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"}`}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            addFiles(Array.from(event.dataTransfer.files));
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
        >
          <File className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-4 text-gray-400" />
          <p className="text-base md:text-lg text-gray-600 mb-2">
            Drag & drop your documents here
          </p>
          <p className="text-gray-500 mb-4">or</p>
          <label className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 md:px-6 md:py-3 rounded-lg cursor-pointer transition">
            Browse Documents
            <input
              type="file"
              multiple
              accept={ACCEPTED_FILES}
              className="hidden"
              onChange={(event) => {
                addFiles(Array.from(event.target.files));
                event.target.value = null;
              }}
              disabled={isUploading}
            />
          </label>
          <p className="text-sm text-gray-500 mt-4">
            PDF up to 10 MB, DOCX up to 5 MB, HTML/TXT/Markdown up to 2 MB.
            Maximum {MAX_FILES} files per upload.
          </p>
        </div>
        {isUploading && (
          <div className="bg-white rounded-xl shadow p-4 md:p-6 mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-800">
                Uploading Documents
              </h3>
              <span className="text-sm text-gray-600">
                {uploadProgress.toFixed(0)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-green-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-sm text-gray-600 mt-2">{uploadMessage}</p>
          </div>
        )}
        {files.length > 0 && (
          <div className="bg-white rounded-xl shadow p-4 md:p-6 mb-6">
            <div className="flex flex-wrap justify-between items-center mb-4">
              <div>
                <h2 className="text-lg md:text-xl font-semibold text-gray-800">
                  Selected Documents ({files.length}/{MAX_FILES})
                </h2>
                <div className="flex flex-wrap gap-2 mt-2">
                  {pendingCount > 0 && (
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">
                      {pendingCount} pending
                    </span>
                  )}
                  {uploadingCount > 0 && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                      {uploadingCount} processing
                    </span>
                  )}
                  {uploadedCount > 0 && (
                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                      {uploadedCount} uploaded
                    </span>
                  )}
                  {errorCount > 0 && (
                    <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs">
                      {errorCount} failed
                    </span>
                  )}
                </div>
              </div>
              {!isUploading && (
                <button
                  onClick={clearAllFiles}
                  className="px-3 py-2 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition"
                >
                  Clear All
                </button>
              )}
            </div>
            <div className="space-y-3 max-h-100 overflow-y-auto pr-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  className={`p-3 md:p-4 border rounded-lg ${file.status === "uploaded" ? "border-green-200 bg-green-50" : file.status === "error" ? "border-red-200 bg-red-50" : file.status === "uploading" ? "border-blue-200 bg-blue-50" : "border-gray-200"}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative">
                      <FileText className="w-7 h-7 text-blue-500" />
                      {file.status === "uploaded" && (
                        <CheckCircle className="w-4 h-4 text-green-500 absolute -top-1 -right-1" />
                      )}
                      {file.status === "error" && (
                        <AlertCircle className="w-4 h-4 text-red-500 absolute -top-1 -right-1" />
                      )}
                      {file.status === "uploading" && (
                        <Loader className="w-4 h-4 text-blue-500 absolute -top-1 -right-1 animate-spin" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 truncate">
                        {file.name}
                      </p>
                      <p className="text-sm text-gray-500">
                        {file.size} · {file.type}
                      </p>
                      {file.status === "uploading" && (
                        <p className="text-xs text-blue-700 mt-1">
                          {file.stage || "Processing"} ·{" "}
                          {Math.round(file.progress || 0)}%
                        </p>
                      )}
                      {file.status === "error" && file.error && (
                        <p className="text-xs text-red-700 mt-1 break-words">
                          {file.error}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => removeFile(file.id)}
                      disabled={file.status === "uploading"}
                      className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded disabled:opacity-40"
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                    <input
                      type="text"
                      placeholder="Category *"
                      value={file.category}
                      onChange={(event) =>
                        updateFileInfo(file.id, "category", event.target.value)
                      }
                      disabled={
                        file.status === "uploading" ||
                        file.status === "uploaded"
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm disabled:bg-gray-100"
                    />
                    <input
                      type="text"
                      placeholder="Section *"
                      value={file.section}
                      onChange={(event) =>
                        updateFileInfo(file.id, "section", event.target.value)
                      }
                      disabled={
                        file.status === "uploading" ||
                        file.status === "uploaded"
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm disabled:bg-gray-100"
                    />
                    {file.isPdf ? (
                      <select
                        value={file.strategy}
                        onChange={(event) =>
                          updateFileInfo(
                            file.id,
                            "strategy",
                            event.target.value,
                          )
                        }
                        disabled={
                          file.status === "uploading" ||
                          file.status === "uploaded"
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm bg-white disabled:bg-gray-100"
                      >
                        <option value="fast">Fast (default)</option>
                        <option value="hi_res">High res (slower)</option>
                      </select>
                    ) : (
                      <div className="px-3 py-2 border border-gray-200 rounded text-sm bg-gray-50 text-gray-600">
                        Strategy: Auto
                      </div>
                    )}
                  </div>
                  {file.isPdf && (
                    <p className="text-xs text-amber-700 mt-3">
                      'Fast' strategy is best for normal text PDFs. It is not
                      suitable for reliable image or table parsing.
                    </p>
                  )}
                  {!file.isPdf && (
                    <p className="text-xs text-amber-700 mt-3">{NON_PDF_TIP}</p>
                  )}
                </div>
              ))}
            </div>
            {uploadStatus && (
              <div
                className={`mt-4 p-3 rounded-lg ${uploadStatus === "success" ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}
              >
                <p className="text-sm">{uploadMessage}</p>
              </div>
            )}
            {uploadedCount > 0 && !isUploading && (
              <div className="mt-4 flex justify-center">
                <button
                  onClick={() => navigate("/chat")}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
                >
                  <MessageCircle className="h-4 w-4" />
                  Chat with Docs
                </button>
              </div>
            )}
            <div className="mt-6 pt-6 border-t flex flex-col md:flex-row gap-4 justify-between items-center">
              <div className="text-sm text-gray-600">
                {files.length} document{files.length === 1 ? "" : "s"} selected
                · Total:{" "}
                {formatSize(
                  files.reduce((total, file) => total + file.bytes, 0),
                )}
                {!allFieldsFilled && (
                  <span className="text-yellow-600 ml-2">
                    (Please fill all required fields)
                  </span>
                )}
              </div>
              <div className="flex gap-3">
                {errorCount > 0 && !isUploading && (
                  <button
                    onClick={handleUpload}
                    disabled={!allFieldsFilled}
                    className="px-6 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg font-medium transition disabled:opacity-50"
                  >
                    Retry Failed ({errorCount})
                  </button>
                )}
                <button
                  onClick={handleUpload}
                  disabled={isUploadDisabled()}
                  className={`px-6 py-2 rounded-lg font-medium transition ${!isUploadDisabled() ? "bg-green-600 hover:bg-green-700 text-white" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
                >
                  {isUploading ? (
                    <span className="flex items-center gap-2">
                      <Loader className="w-4 h-4 animate-spin" />
                      Uploading...
                    </span>
                  ) : files.every((file) => file.status === "uploaded") ? (
                    "All Documents Uploaded"
                  ) : (
                    `Upload ${files.filter((file) => file.status !== "uploaded").length} Document${files.filter((file) => file.status !== "uploaded").length === 1 ? "" : "s"}`
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
        {files.length === 0 && !isUploading && (
          <div className="bg-white rounded-xl shadow p-6 text-center">
            <div className="max-w-xl mx-auto">
              <h3 className="font-semibold text-gray-800 mb-2">
                Upload documents for your RAG system
              </h3>
              <p className="text-sm text-gray-600">
                Add up to three PDF, DOCX, HTML, TXT, or Markdown files. Provide
                a category and section for every file. PDFs can use Fast or High
                res; other file types use Auto extraction.
              </p>
              <p className="text-sm text-gray-600 mt-3">
                Files with more than 250,000 extracted characters or 90 chunks
                are rejected before AI processing so no content is silently
                omitted.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadDocs;
