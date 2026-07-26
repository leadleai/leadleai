// SaleScale AI brand mark.
//
// The real uploaded logo, processed into a transparent silhouette
// (/logo-mark.png). It's rendered as a CSS mask filled with `currentColor`, so
// the exact shape inherits the surrounding text colour — black on light
// surfaces, white on the dark auth/landing panels — with no black tile and no
// second asset. Size + colour come from `className` (e.g. "w-7 h-7 text-foreground").
export default function Logo({ className = "w-7 h-7", title = "SaleScale AI", ...props }) {
  const mask = {
    backgroundColor: "currentColor",
    WebkitMaskImage: "url(/logo-mark.png)",
    maskImage: "url(/logo-mark.png)",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
    WebkitMaskSize: "contain",
    maskSize: "contain",
  };
  return (
    <span
      role="img"
      aria-label={title}
      className={`inline-block ${className}`}
      style={mask}
      {...props}
    />
  );
}
