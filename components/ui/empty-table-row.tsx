type EmptyTableRowProps = {
  colSpan: number;
  message?: string;
};

export function EmptyTableRow({
  colSpan,
  message = "Nothing to show yet."
}: EmptyTableRowProps) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-4 py-8 text-center text-sm text-neutral-500"
      >
        {message}
      </td>
    </tr>
  );
}
