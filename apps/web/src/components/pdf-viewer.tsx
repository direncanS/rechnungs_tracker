interface PdfViewerProps {
  invoiceId: string;
}

export default function PdfViewer({ invoiceId }: PdfViewerProps) {
  const pdfUrl = `/api/invoices/${invoiceId}/pdf`;

  return (
    <div
      className="h-[600px] lg:h-full min-h-[400px] border rounded bg-gray-100"
      data-testid="pdf-viewer"
    >
      <iframe
        src={pdfUrl}
        title="Invoice PDF"
        className="h-full w-full"
        data-testid="pdf-iframe"
      />
      <a
        href={pdfUrl}
        download
        className="block text-center text-sm text-blue-600 hover:underline py-2"
        data-testid="pdf-download-link"
      >
        Download PDF
      </a>
    </div>
  );
}
