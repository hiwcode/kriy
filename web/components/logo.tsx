import Image from "next/image";

export default function Logo({ width=24, height=24 }: { width?: number; height?: number }) {
  return <Image src="/_logo.png" alt="Logo" width={width} height={height} />;
};