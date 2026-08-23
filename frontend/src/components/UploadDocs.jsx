import React, { useState } from "react";
import {
  X,
  FileText,
  CheckCircle,
  AlertCircle,
  Loader,
  File,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createUploadJob, getUploadJob } from "../api";

const UploadDocs = () => {
  const navigate = useNavigate();

  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null); // null, 'success', 'error'
  const [uploadMessage, setUploadMessage] = useState("");

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);

    const droppedFiles = Array.from(event.dataTransfer.files);
    addFiles(droppedFiles);
  };

  const onDragOver = (event) => {
    event.preventDefault();
    setDragging(true);
  };

  const onDragLeave = (event) => {
    event.preventDefault();
    setDragging(false);
  };

  const addFiles = (fileList) => {
    // Filter only PDF files
    const pdfFiles = fileList.filter(
      (file) =>
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf"),
    );

    // Filter out duplicates
    const existingFilenames = new Set(files.map((f) => f.name));
    const newFiles = pdfFiles
      .filter((file) => !existingFilenames.has(file.name))
      .map((file) => ({
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        name: file.name,
        size: `${(file.size / 1024).toFixed(1)} KB`,
        type: "PDF",
        category: "",
        section: "",
        file: file,
        status: "pending", // pending, uploading, uploaded, error
        stage: "Waiting to upload",
        progress: 0,
        error: "",
      }));

    if (newFiles.length > 0) {
      setFiles((prev) => [...prev, ...newFiles]);
      setUploadStatus(null);
      setUploadMessage("");
    }

    // If there were non-PDF files, show warning
    const nonPdfFiles = fileList.filter(
      (file) =>
        !(
          file.type === "application/pdf" ||
          file.name.toLowerCase().endsWith(".pdf")
        ),
    );

    if (nonPdfFiles.length > 0) {
      const nonPdfNames = nonPdfFiles.map((f) => f.name).join(", ");
      alert(`Only PDF files are allowed. Skipped: ${nonPdfNames}`);
    }
  };

  const handleFileInput = (event) => {
    addFiles(Array.from(event.target.files));
    event.target.value = null; // Reset input
  };

  const updateFileInfo = (id, field, value) => {
    setFiles((prev) =>
      prev.map((file) => (file.id === id ? { ...file, [field]: value } : file)),
    );
  };

  const removeFile = (id) => {
    setFiles((prev) => prev.filter((file) => file.id !== id));
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
    // Check if all files have category and section
    const invalidFiles = files.filter(
      (f) => !f.category.trim() || !f.section.trim(),
    );

    if (invalidFiles.length > 0) {
      const fileNames = invalidFiles.map((f) => f.name).join(", ");
      setUploadStatus("error");
      setUploadMessage(
        `Please fill in both Category and Section for: ${fileNames}`,
      );
      return false;
    }

    // Check if all files are ready (not uploaded already)
    const readyFiles = files.filter((f) => f.status !== "uploaded");
    if (readyFiles.length === 0) {
      setUploadStatus("error");
      setUploadMessage("All files have already been uploaded");
      return false;
    }

    return true;
  };

  const isUploadDisabled = () => {
    // Disable upload if:
    // 1. No files
    // 2. Currently uploading
    // 3. All files already uploaded
    // 4. Any file missing category or section
    if (files.length === 0 || isUploading) return true;

    const hasIncompleteFields = files.some(
      (f) => !f.category.trim() || !f.section.trim(),
    );
    const allUploaded = files.every((f) => f.status === "uploaded");

    return hasIncompleteFields || allUploaded;
  };

  const handleUpload = async () => {
    // Validation
    if (!validateFiles()) return;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadStatus(null);
    setUploadMessage("Starting upload...");

    // Update file statuses only for non-uploaded files
    setFiles((prev) =>
      prev.map((f) =>
        f.status !== "uploaded" ? { ...f, status: "uploading" } : f,
      ),
    );

    const formData = new FormData();

    // Only include files that aren't already uploaded
    const filesToUpload = files.filter((f) => f.status !== "uploaded");

    filesToUpload.forEach((fileInfo) => {
      formData.append("files", fileInfo.file);
      formData.append("categories", fileInfo.category.trim());
      formData.append("sections", fileInfo.section.trim());
    });

    try {
      formData.append("async_mode", "true");
      const job = await createUploadJob(formData, (progress) => {
        setUploadProgress(progress);
        setUploadMessage("Uploading PDFs to the server…");
      });

      let result = job;
      const pollingStartedAt = Date.now();
      const maxPollingMs = 15 * 60 * 1000;
      while (result.status === "queued" || result.status === "processing") {
        if (Date.now() - pollingStartedAt >= maxPollingMs) {
          throw new Error(
            "Processing took longer than 15 minutes. The upload has stopped being monitored; please retry the file or contact support.",
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
        result = await getUploadJob(job.job_id);
        const averageProgress = result.results.length
          ? result.results.reduce((total, item) => total + item.progress, 0) / result.results.length
          : 0;
        setUploadProgress(Math.max(8, averageProgress));
        setUploadMessage("Processing documents on the server…");
        setFiles((prev) =>
          prev.map((file) => {
            const fileResult = result.results?.find(
              (r) => r.filename === file.name,
            );
            if (fileResult) {
              return {
                ...file,
                status: fileResult.status === "processed" ? "uploaded" : fileResult.status === "failed" ? "error" : "uploading",
                stage: fileResult.stage,
                progress: fileResult.progress,
                error: fileResult.error || "",
              };
            }
            return file;
          }),
        );
      }

      if (result.user_details) localStorage.setItem("userDetails", JSON.stringify(result.user_details));
      setUploadProgress(100);
      setFiles((prev) => prev.map((file) => {
        const fileResult = result.results?.find((item) => item.filename === file.name);
        return fileResult ? {
          ...file,
          status: fileResult.status === "processed" ? "uploaded" : "error",
          stage: fileResult.stage,
          progress: fileResult.progress,
          error: fileResult.error || "",
        } : file;
      }));

      // Count results
      const successCount = result.results
        ? result.results.filter((r) => r.status === "processed").length
        : filesToUpload.length;
      const failedCount = result.results
        ? result.results.filter((r) => r.status === "failed").length
        : 0;

      setUploadStatus(failedCount > 0 ? "error" : "success");
      setUploadMessage(
        `✅ Successfully processed ${successCount} PDF file${
          successCount !== 1 ? "s" : ""
        }${failedCount > 0 ? ` (${failedCount} failed)` : ""}`,
      );

      // Auto-clear after 3 seconds if all successful
      if (failedCount === 0) {
        setTimeout(() => {
          setFiles([]);
          setUploadProgress(0);
          setIsUploading(false);
        }, 3000);
      } else {
        setIsUploading(false);
      }
    } catch (error) {
      setUploadProgress(0);
      setIsUploading(false);
      setUploadStatus("error");
      setUploadMessage(`❌ Upload failed: ${error.message}`);

      // Mark uploading files as error
      setFiles((prev) =>
        prev.map((f) =>
          f.status === "uploading" ? { ...f, status: "error" } : f,
        ),
      );

      console.error("Upload error:", error);
    }
  };

  // Calculate stats
  const pendingCount = files.filter((f) => f.status === "pending").length;
  const uploadingCount = files.filter((f) => f.status === "uploading").length;
  const uploadedCount = files.filter((f) => f.status === "uploaded").length;
  const errorCount = files.filter((f) => f.status === "error").length;

  // Check if all required fields are filled
  const allFieldsFilled =
    files.length > 0 &&
    files.every((f) => f.category.trim() && f.section.trim());

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <button
          onClick={() => {
            navigate("/home", { replace: false });
          }}
          className="text-4xl cursor-pointer"
        >
          🔙
        </button>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6 md:mb-8 text-center">
          PDF Document Upload Portal
        </h1>

        {/* Drag & Drop Area */}
        <div
          className={`border-2 border-dashed rounded-2xl p-8 md:p-12 text-center mb-6 md:mb-8 transition-all ${
            dragging
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"
          } ${files.length > 0 ? "mb-4" : ""}`}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
        >
          <File className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-4 text-gray-400" />
          <p className="text-base md:text-lg text-gray-600 mb-2">
            Drag & drop your PDF files here
          </p>
          <p className="text-gray-500 mb-4 md:mb-6">or</p>
          <label className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 md:px-6 md:py-3 rounded-lg cursor-pointer transition text-sm md:text-base">
            Browse PDF Files
            <input
              type="file"
              multiple
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={handleFileInput}
              disabled={isUploading}
            />
          </label>
          <p className="text-sm text-gray-500 mt-4">
            Only PDF files are accepted (max 100MB each)
          </p>
        </div>

        {/* Upload Progress Bar */}
        {isUploading && (
          <div className="bg-white rounded-xl shadow p-4 md:p-6 mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-800">
                Uploading PDF Files
              </h3>
              <span className="text-sm text-gray-600">
                {uploadProgress.toFixed(0)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-green-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-600 mt-2">{uploadMessage}</p>
          </div>
        )}

        {/* Upload Status Summary */}
        {files.length > 0 && !isUploading && (
          <div className="bg-white rounded-xl shadow p-4 md:p-6 mb-6">
            <div className="flex flex-wrap justify-between items-center mb-4">
              <div>
                <h2 className="text-lg md:text-xl font-semibold text-gray-800">
                  Selected PDF Files ({files.length})
                </h2>
                <div className="flex flex-wrap gap-2 mt-2">
                  {pendingCount > 0 && (
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">
                      {pendingCount} pending
                    </span>
                  )}
                  {uploadingCount > 0 && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                      {uploadingCount} uploading
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
              <div className="flex gap-2 mt-2 md:mt-0">
                {files.length > 0 && !isUploading && (
                  <button
                    onClick={clearAllFiles}
                    className="px-3 py-2 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {/* Files List */}
            <div className="space-y-3 max-h-100 overflow-y-auto pr-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  className={`flex flex-col md:flex-row md:items-center gap-3 md:gap-4 p-3 md:p-4 border rounded-lg ${
                    file.status === "uploaded"
                      ? "border-green-200 bg-green-50"
                      : file.status === "error"
                        ? "border-red-200 bg-red-50"
                        : file.status === "uploading"
                          ? "border-blue-200 bg-blue-50"
                          : "border-gray-200"
                  } ${
                    !file.category.trim() || !file.section.trim()
                      ? "border-yellow-300 bg-yellow-50"
                      : ""
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="relative">
                      <FileText className="w-6 h-6 md:w-8 md:h-8 text-blue-500 shrink-0" />
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
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span>{file.size}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <File className="w-3 h-3" />
                          {file.type}
                        </span>
                      </div>
                      {file.status === "uploading" && (
                        <p className="text-xs text-blue-700 mt-1">
                          {file.stage || "Processing"} · {Math.round(file.progress || 0)}%
                        </p>
                      )}
                      {file.status === "error" && file.error && (
                        <p className="text-xs text-red-700 mt-1 break-words">
                          {file.error}
                        </p>
                      )}
                      {(!file.category.trim() || !file.section.trim()) && (
                        <p className="text-xs text-yellow-600 mt-1">
                          ⚠️ Please fill in both fields below
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row gap-3 md:gap-4 shrink-0">
                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder="Category *"
                        className={`w-full px-3 py-2 border rounded text-sm ${
                          !file.category.trim()
                            ? "border-yellow-500 bg-yellow-50"
                            : "border-gray-300"
                        } disabled:bg-gray-100 disabled:cursor-not-allowed`}
                        value={file.category}
                        onChange={(e) =>
                          updateFileInfo(file.id, "category", e.target.value)
                        }
                        disabled={
                          file.status === "uploading" ||
                          file.status === "uploaded"
                        }
                        required
                      />
                    </div>

                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder="Section *"
                        className={`w-full px-3 py-2 border rounded text-sm ${
                          !file.section.trim()
                            ? "border-yellow-500 bg-yellow-50"
                            : "border-gray-300"
                        } disabled:bg-gray-100 disabled:cursor-not-allowed`}
                        value={file.section}
                        onChange={(e) =>
                          updateFileInfo(file.id, "section", e.target.value)
                        }
                        disabled={
                          file.status === "uploading" ||
                          file.status === "uploaded"
                        }
                        required
                      />
                    </div>

                    <button
                      onClick={() => removeFile(file.id)}
                      className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded self-start md:self-center"
                      disabled={file.status === "uploading"}
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Upload Status Message */}
            {uploadStatus && (
              <div
                className={`mt-4 p-3 rounded-lg ${
                  uploadStatus === "success"
                    ? "bg-green-50 border border-green-200"
                    : "bg-red-50 border border-red-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  {uploadStatus === "success" ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  )}
                  <p
                    className={`text-sm ${
                      uploadStatus === "success"
                        ? "text-green-700"
                        : "text-red-700"
                    }`}
                  >
                    {uploadMessage}
                  </p>
                </div>
              </div>
            )}

            {/* Upload Button */}
            <div className="mt-6 pt-6 border-t">
              <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
                <div className="text-sm text-gray-600">
                  {files.length} PDF file{files.length !== 1 ? "s" : ""}{" "}
                  selected • Total:{" "}
                  {files
                    .reduce((acc, f) => acc + parseFloat(f.size), 0)
                    .toFixed(1)}{" "}
                  KB
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
                      className="px-6 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg font-medium transition"
                      disabled={!allFieldsFilled}
                    >
                      Retry Failed ({errorCount})
                    </button>
                  )}

                  <button
                    onClick={handleUpload}
                    disabled={isUploadDisabled()}
                    className={`px-6 py-2 rounded-lg font-medium transition ${
                      !isUploadDisabled()
                        ? "bg-green-600 hover:bg-green-700 text-white"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    }`}
                    title={
                      isUploadDisabled()
                        ? files.length === 0
                          ? "No files to upload"
                          : !allFieldsFilled
                            ? "Please fill in all Category and Section fields"
                            : "All files already uploaded"
                        : "Upload PDF files"
                    }
                  >
                    {isUploading ? (
                      <span className="flex items-center gap-2">
                        <Loader className="w-4 h-4 animate-spin" />
                        Uploading...
                      </span>
                    ) : files.every((f) => f.status === "uploaded") ? (
                      "All PDFs Uploaded"
                    ) : (
                      `Upload ${
                        files.filter((f) => f.status !== "uploaded").length
                      } PDF${
                        files.filter((f) => f.status !== "uploaded").length !==
                        1
                          ? "s"
                          : ""
                      }`
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Help Text */}
        {files.length === 0 && !isUploading && (
          <div className="bg-white rounded-xl shadow p-6 text-center">
            <div className="max-w-md mx-auto">
              <h3 className="font-semibold text-gray-800 mb-2">
                How to upload PDF documents
              </h3>
              <ol className="text-sm text-gray-600 text-left space-y-2">
                <li className="flex items-start gap-2">
                  <span className="bg-blue-100 text-blue-800 rounded-full w-5 h-5 flex items-center justify-center text-xs">
                    1
                  </span>
                  <span>Drag & drop PDF files or click "Browse PDF Files"</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="bg-blue-100 text-blue-800 rounded-full w-5 h-5 flex items-center justify-center text-xs">
                    2
                  </span>
                  <span>
                    <strong>Required:</strong> Add Category (e.g., CS3063) and
                    Section (e.g., Lecture 3) for each PDF
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="bg-blue-100 text-blue-800 rounded-full w-5 h-5 flex items-center justify-center text-xs">
                    3
                  </span>
                  <span>
                    Click "Upload" to process PDFs for your RAG system
                  </span>
                </li>
                <li className="flex items-start gap-2 mt-4">
                  <span className="bg-yellow-100 text-yellow-800 rounded-full w-5 h-5 flex items-center justify-center text-xs">
                    !
                  </span>
                  <span className="text-yellow-700 font-medium">
                    Only PDF files are accepted. Upload will be disabled until
                    all Category and Section fields are filled.
                  </span>
                </li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadDocs;
