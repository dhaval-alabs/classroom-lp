import Image from "next/image";

/**
 * Official AnalytixLabs wordmark (navy + green "X").
 * `light` renders a white monochrome version for use on the dark footer/navy.
 */
export default function Logo({
  light = false,
  className = "",
}: {
  light?: boolean;
  className?: string;
}) {
  return (
    <Image
      src="/brand/analytixlabs-logo.png"
      alt="AnalytixLabs"
      width={1882}
      height={559}
      priority
      className={`h-8 w-auto sm:h-9 ${light ? "brightness-0 invert" : ""} ${className}`}
    />
  );
}
