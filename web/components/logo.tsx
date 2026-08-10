import Image from "next/image";
import { cn } from "@/lib/utils";

type LogoProps = {
  width?: number;
  height?: number;
  size?: number;
  className?: string;
  priority?: boolean;
};

export default function Logo({
  width = 24,
  height = 24,
  size,
  className,
  priority = false,
}: LogoProps) {
  return (
    <Image
      src="/kriy-transparent.png"
      alt="KRIY"
      width={size ?? width}
      height={size ?? height}
      className={cn("object-contain bg-primary", className)}
      priority={priority}
    />
  );
}
