"use client";

import UploadDropzone from "@/components/upload-dropzone";

export default function UploadPage() {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Upload Invoice</h2>
      <UploadDropzone />
    </div>
  );
}
