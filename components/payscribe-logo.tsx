import Image from "next/image";

export function PayscribeLogo({
  className = ""
}: {
  className?: string;
}) {
  return (
    <Image
      src="/payscribe-logo.png"
      alt="Payscribe Logo"
      width={400}
      height={120}
      className={className}
      priority
    />
  );
}
