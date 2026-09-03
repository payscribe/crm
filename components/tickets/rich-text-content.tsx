type RichTextContentProps = {
  html: string;
  className?: string;
};

export function RichTextContent({ html, className = "" }: RichTextContentProps) {
  return (
    <div
      className={`ticket-rich-text text-sm leading-7 text-neutral-700 ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
