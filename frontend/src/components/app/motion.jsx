// Dashboard animation toolkit — snappy, spring-driven primitives shared across
// the /app pages. Purely presentational: no data, no handlers. Everything here
// respects prefers-reduced-motion and is tuned to be fast (never blocks input).
import { useEffect, useRef } from "react";
import { animate, motion, useInView, useReducedMotion } from "framer-motion";

export const EASE = [0.16, 1, 0.3, 1];
export const SPRING = { type: "spring", stiffness: 400, damping: 30 };
export const SOFT_SPRING = { type: "spring", stiffness: 260, damping: 24 };

// Animated count-up. Accepts the already-formatted string the app produces
// ("1,234", "$0", "0%", "Custom") — parses the number, animates 0→value, and
// re-applies the same prefix/suffix + thousands separators. Non-numeric values
// (and reduced-motion users) render unchanged.
export function CountUp({ value, className }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-20px" });
  const reduce = useReducedMotion();
  const str = String(value);
  const m = str.match(/^(\D*?)([\d][\d,]*(?:\.\d+)?)(\D*)$/);

  useEffect(() => {
    if (!m || !inView || reduce || !ref.current) return;
    const prefix = m[1] || "";
    const suffix = m[3] || "";
    const clean = m[2].replace(/,/g, "");
    const target = parseFloat(clean);
    const decimals = clean.includes(".") ? clean.split(".")[1].length : 0;
    const node = ref.current;
    const controls = animate(0, target, {
      duration: 1.1,
      ease: EASE,
      onUpdate(v) {
        node.textContent = prefix + v.toLocaleString("en-US", {
          minimumFractionDigits: decimals, maximumFractionDigits: decimals,
        }) + suffix;
      },
    });
    return () => controls.stop();
  }, [inView, reduce, str]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!m || reduce) return <span className={className}>{value}</span>;
  const prefix = m[1] || "", suffix = m[3] || "";
  return <span ref={ref} className={className}>{prefix + "0" + suffix}</span>;
}

// Stagger container + item. Wrap a grid/list in <Stagger> and its direct
// children in <StaggerItem> for a bold cascade on entrance (and on scroll).
export const itemVariants = {
  hidden: { opacity: 0, y: 22, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 240, damping: 24 } },
};

export function Stagger({ children, className, delay = 0, stagger = 0.07, once = true, amount = 0.15, ...rest }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once, amount }}
      variants={{ show: { transition: { staggerChildren: stagger, delayChildren: delay } } }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className, ...rest }) {
  return (
    <motion.div className={className} variants={itemVariants} {...rest}>
      {children}
    </motion.div>
  );
}

// Single scroll/entrance reveal for standalone cards & sections.
export function Reveal({ children, className, delay = 0, y = 24, once = true, ...rest }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, amount: 0.15 }}
      transition={{ duration: 0.5, ease: EASE, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

// Per-word rising reveal for headings — snappy, clipped. Falls back to plain
// text under reduced motion. Handles emoji/word tokens fine.
export function RevealHeading({ text, className, as = "h1", delay = 0 }) {
  const reduce = useReducedMotion();
  const Tag = motion[as] || motion.h1;
  if (reduce) {
    const Plain = as;
    return <Plain className={className}>{text}</Plain>;
  }
  const words = String(text).split(" ");
  return (
    <Tag
      className={className}
      initial="hidden"
      animate="show"
      transition={{ staggerChildren: 0.045, delayChildren: delay }}
      aria-label={text}
    >
      {words.map((w, i) => (
        <span key={i} className="inline-block overflow-hidden align-bottom" aria-hidden="true">
          <motion.span
            className="inline-block"
            variants={{
              hidden: { y: "115%" },
              show: { y: "0%", transition: { duration: 0.55, ease: EASE } },
            }}
          >
            {w}{i < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}
