// Shared black & white motion system for the public/marketing site.
// Purely presentational — no data, no side effects. Every marketing page pulls
// its animation language from here so the whole site moves as one.
import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1];

/* Scroll-triggered reveal (fade + rise). */
export function Reveal({ children, delay = 0, y = 28, className = "", once = true, as = "div", ...rest }) {
  const M = motion[as] || motion.div;
  return (
    <M
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: "-80px" }}
      transition={{ duration: 0.7, ease: EASE, delay }}
      {...rest}
    >
      {children}
    </M>
  );
}

/* Word-by-word heading reveal — the signature type animation of the site. */
export function AnimatedHeading({ text, className = "", as = "h2", delay = 0, stagger = 0.06 }) {
  const reduce = useReducedMotion();
  const Tag = motion[as] || motion.h2;
  const words = String(text).split(" ");
  if (reduce) {
    const Plain = as;
    return <Plain className={className}>{text}</Plain>;
  }
  return (
    <Tag
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-60px" }}
      transition={{ staggerChildren: stagger, delayChildren: delay }}
      aria-label={text}
    >
      {words.map((w, i) => (
        <span key={i} className="inline-block overflow-hidden align-bottom" aria-hidden="true">
          <motion.span
            className="inline-block"
            variants={{
              hidden: { y: "110%", opacity: 0 },
              visible: { y: "0%", opacity: 1, transition: { duration: 0.7, ease: EASE } },
            }}
          >
            {w}
            {i < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}

/* Character-flip label — used for kickers / small mono labels. */
export function AnimatedKicker({ children, className = "" }) {
  return (
    <motion.p
      initial={{ opacity: 0, letterSpacing: "0.5em" }}
      whileInView={{ opacity: 1, letterSpacing: "0.28em" }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, ease: EASE }}
      className={className}
    >
      {children}
    </motion.p>
  );
}

/* Infinite marquee. Duplicates children so the loop is seamless. */
export function Marquee({ children, reverse = false, duration = 32, className = "", pauseOnHover = true }) {
  return (
    <div className={`relative overflow-hidden ${pauseOnHover ? "marquee-pause" : ""} ${className}`}>
      <div
        className={`flex w-max ${reverse ? "animate-marquee-reverse" : "animate-marquee"}`}
        style={{ "--marquee-duration": `${duration}s` }}
      >
        <div className="flex shrink-0 items-center">{children}</div>
        <div className="flex shrink-0 items-center" aria-hidden="true">{children}</div>
      </div>
    </div>
  );
}

/* Magnetic hover wrapper — nudges toward the cursor, springs back. */
export function Magnetic({ children, strength = 0.35, className = "" }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const onMove = (e) => {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - (r.left + r.width / 2)) * strength;
    const y = (e.clientY - (r.top + r.height / 2)) * strength;
    ref.current.style.transform = `translate(${x}px, ${y}px)`;
  };
  const reset = () => { if (ref.current) ref.current.style.transform = "translate(0px, 0px)"; };
  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={reset}
      className={`transition-transform duration-300 ease-out ${className}`}
    >
      {children}
    </div>
  );
}

/* Parallax — shifts a layer as it scrolls through the viewport. */
export function Parallax({ children, distance = 80, className = "" }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [distance, -distance]);
  return (
    <div ref={ref} className={className}>
      <motion.div style={reduce ? undefined : { y }}>{children}</motion.div>
    </div>
  );
}

/* Per-route mount transition — gives navigation a page-transition feel. */
export function PageTransition({ children, className = "" }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

export { EASE };
