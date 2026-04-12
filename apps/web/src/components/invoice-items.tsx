interface InvoiceItemData {
  id: string;
  lineNumber: number;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  totalPrice: number | null;
  taxRate: number | null;
  isEdited: boolean;
}

interface InvoiceItemsProps {
  items: InvoiceItemData[];
}

function fmt(value: number | null): string {
  return value != null ? value.toFixed(2) : "-";
}

export default function InvoiceItems({ items }: InvoiceItemsProps) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-4" data-testid="items-empty">
        No line items
      </p>
    );
  }

  return (
    <div className="overflow-x-auto" data-testid="invoice-items">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs font-medium text-gray-500 uppercase">
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Description</th>
            <th className="px-3 py-2">Qty</th>
            <th className="px-3 py-2">Unit</th>
            <th className="px-3 py-2">Unit Price</th>
            <th className="px-3 py-2">Total</th>
            <th className="px-3 py-2">Tax %</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b" data-testid="item-row">
              <td className="px-3 py-2">{item.lineNumber}</td>
              <td className="px-3 py-2">
                {item.description ?? "-"}
                {item.isEdited && (
                  <span className="ml-1 text-xs text-blue-600 font-medium">
                    Edited
                  </span>
                )}
              </td>
              <td className="px-3 py-2">{fmt(item.quantity)}</td>
              <td className="px-3 py-2">{item.unit ?? "-"}</td>
              <td className="px-3 py-2">{fmt(item.unitPrice)}</td>
              <td className="px-3 py-2">{fmt(item.totalPrice)}</td>
              <td className="px-3 py-2">{fmt(item.taxRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
