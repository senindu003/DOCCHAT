import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  FileText,
  Loader,
  Trash2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { listDocuments, removeDocument } from "../api";
import Dialog from "./Dialog";
import BackButton from "./BackButton";

const RemoveDocs = () => {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [removingKey, setRemovingKey] = useState("");
  const [notice, setNotice] = useState(null);
  const [confirmDoc, setConfirmDoc] = useState(null);

  const refreshDocuments = async () => {
    setIsLoading(true);
    try {
      const payload = await listDocuments();
      setDocuments(payload.documents || []);
      if (payload.user_details) {
        localStorage.setItem("userDetails", JSON.stringify(payload.user_details));
      }
    } catch (error) {
      setNotice({
        title: "Could not load documents",
        message: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshDocuments();
  }, []);

  const documentKey = (documentInfo) =>
    `${documentInfo.filename}|${documentInfo.category}|${documentInfo.section}`;

  const groupedDocuments = useMemo(() => {
    return documents.reduce((groups, documentInfo) => {
      const key = documentInfo.category || "Uncategorized";
      if (!groups[key]) groups[key] = [];
      groups[key].push(documentInfo);
      return groups;
    }, {});
  }, [documents]);

  const handleRemove = async () => {
    if (!confirmDoc) return;
    const key = documentKey(confirmDoc);
    setRemovingKey(key);
    try {
      const result = await removeDocument({
        filename: confirmDoc.filename,
        category: confirmDoc.category,
        section: confirmDoc.section,
      });
      if (result.user_details) {
        localStorage.setItem("userDetails", JSON.stringify(result.user_details));
      }
      setDocuments((prev) => prev.filter((item) => documentKey(item) !== key));
      setConfirmDoc(null);
      setNotice({
        title: "Document removed",
        message: `${result.filename} was removed from PostgreSQL metadata and Chroma vectors. Deleted ${result.deleted_chunks} vector chunk${result.deleted_chunks === 1 ? "" : "s"} and ${result.deleted_metadata_rows} metadata row${result.deleted_metadata_rows === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      setNotice({
        title: "Remove failed",
        message: error.message,
      });
    } finally {
      setRemovingKey("");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <Dialog
        open={Boolean(notice)}
        title={notice?.title || "Notice"}
        onClose={() => setNotice(null)}
      >
        {notice?.message}
      </Dialog>
      <Dialog
        open={Boolean(confirmDoc)}
        title="Remove this document?"
        onClose={() => setConfirmDoc(null)}
        actions={
          <>
            <button
              type="button"
              onClick={() => setConfirmDoc(null)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              disabled={Boolean(removingKey)}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              disabled={Boolean(removingKey)}
            >
              {removingKey ? <Loader className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Remove
            </button>
          </>
        }
      >
        This will permanently remove "{confirmDoc?.filename}" from both PostgreSQL metadata and the Chroma vector database.
      </Dialog>

      <div className="mx-auto max-w-6xl">
        <BackButton onClick={() => navigate("/home", { replace: false })} className="mb-4" />

        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-800 md:text-3xl">
            Remove Uploaded Documents
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Remove a PDF and its related chunks from PostgreSQL and Chroma.
          </p>
        </div>

        <div className="rounded-xl bg-white p-4 shadow md:p-6">
          {isLoading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-gray-600">
              <Loader className="h-5 w-5 animate-spin" />
              Loading documents...
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle className="mb-3 h-10 w-10 text-green-600" />
              <h2 className="text-lg font-semibold text-gray-800">
                No uploaded documents found
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                Upload PDFs first, then they will appear here for removal.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedDocuments).map(([category, items]) => (
                <section key={category}>
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                    {category}
                  </h2>
                  <div className="space-y-3">
                    {items.map((documentInfo) => {
                      const key = documentKey(documentInfo);
                      const isRemoving = removingKey === key;
                      return (
                        <article
                          key={key}
                          className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4 md:flex-row md:items-center"
                        >
                          <div className="flex min-w-0 flex-1 items-start gap-3">
                            <FileText className="mt-1 h-6 w-6 shrink-0 text-blue-500" />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-gray-800">
                                {documentInfo.filename}
                              </p>
                              <p className="mt-1 text-sm text-gray-500">
                                Section: {documentInfo.section}
                              </p>
                              <p className="mt-1 text-xs text-gray-500">
                                {documentInfo.chunk_count} vector chunk{documentInfo.chunk_count === 1 ? "" : "s"} - {documentInfo.metadata_count} metadata row{documentInfo.metadata_count === 1 ? "" : "s"}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setConfirmDoc(documentInfo)}
                            disabled={isRemoving}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                          >
                            {isRemoving ? <Loader className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            Remove
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}

          {!isLoading && documents.length > 0 && (
            <div className="mt-6 flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Removing a document is permanent. The app deletes the stored metadata rows and the exact Chroma vector ids linked to that PDF.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RemoveDocs;
