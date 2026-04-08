"use client";

import { useState, useRef, type DragEvent, type ChangeEvent } from "react";
import Link from "next/link";
import { usePolling } from "@/hooks/use-polling";
import StatusBadge from "@/components/status-badge";
import { MAX_FILE_SIZE_BYTES } from "@/lib/constants";

interface UploadedInvoice {
  id: string;
  processingStatus: string;
  reviewStatus: string;
}

export default function UploadDropzone() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedInvoice, setUploadedInvoice] =
    useState<UploadedInvoice | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const polling = usePolling(uploadedInvoice?.id ?? null);

  function validateFile(f: File): string | null {
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      return "Only PDF files are accepted";
    }
    if (f.size > MAX_FILE_SIZE_BYTES) {
      return `File size exceeds ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit`;
    }
    return null;
  }

  function handleFile(f: File) {
    const validationError = validateFile(f);
    if (validationError) {
      setError(validationError);
      return;
    }
    setFile(f);
    setError(null);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFile(droppedFile);
    }
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFile(selectedFile);
    }
  }

  async function handleUpload() {
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/invoices/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Upload failed");
        setUploading(false);
        return;
      }

      setUploadedInvoice({
        id: data.id,
        processingStatus: data.processingStatus,
        reviewStatus: data.reviewStatus,
      });
      setUploading(false);
    } catch {
      setError("Upload failed. Please try again.");
      setUploading(false);
    }
  }

  function resetState() {
    setFile(null);
    setError(null);
    setUploadedInvoice(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  // Show polling status after upload
  if (uploadedInvoice) {
    const currentStatus = polling.processingStatus ?? uploadedInvoice.processingStatus;
    const currentReview = polling.reviewStatus ?? uploadedInvoice.reviewStatus;
    const isParsed = currentStatus === "PARSED";
    const isFailed = currentStatus === "FAILED_PARSE";

    return (
      <div data-testid="upload-dropzone" className="rounded-lg border p-6">
        <div data-testid="upload-status" className="space-y-4">
          <h3 className="text-lg font-medium">Upload Complete</h3>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">Processing:</span>
            <StatusBadge status={currentStatus} type="processing" />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">Review:</span>
            <StatusBadge status={currentReview} type="review" />
          </div>

          {polling.isPolling && (
            <p className="text-sm text-gray-500">Checking status...</p>
          )}

          {polling.error && (
            <p className="text-sm text-red-600">{polling.error}</p>
          )}

          {polling.parseError && (
            <div className="rounded border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-700">{polling.parseError}</p>
            </div>
          )}

          {isParsed && (
            <Link
              href={`/invoices/${uploadedInvoice.id}`}
              className="inline-block rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              View invoice
            </Link>
          )}

          {isFailed && (
            <div className="space-y-2">
              <p className="text-sm text-red-600">Processing failed</p>
              <button
                onClick={resetState}
                className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Upload another
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="upload-dropzone">
      <div
        className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 ${
          dragOver ? "border-blue-400 bg-blue-50" : "border-gray-300"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <p className="mb-4 text-sm text-gray-600">
          {file
            ? file.name
            : "Drag and drop a PDF file here, or click to select"}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          onChange={handleInputChange}
          className="hidden"
          data-testid="upload-input"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Select file
        </button>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600" data-testid="upload-error">
          {error}
        </p>
      )}

      {file && !error && (
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="mt-4 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          data-testid="upload-button"
        >
          {uploading ? "Uploading..." : "Upload"}
        </button>
      )}
    </div>
  );
}
