import fespayLogo from "../assets/fespay-logo-256.png";

export default function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <img
      className={className}
      src={fespayLogo}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
