import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, ArrowLeft, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import MarketingNav from "@/components/marketing/MarketingNav";
import { Magnetic } from "@/components/marketing/motion";

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="dark min-h-screen bg-black text-white selection:bg-white selection:text-black" data-testid="not-found-page">
      <MarketingNav />
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden px-5">
        <div className="absolute inset-0 bw-grid opacity-50" />
        <div className="bw-noise absolute inset-0 opacity-[0.05] pointer-events-none" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[60%] h-[360px] bg-white/[0.06] blur-[120px] rounded-full" />

        {/* Giant ghost 404 */}
        <motion.span
          initial={{ opacity: 0, scale: 1.1 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1 }}
          className="pointer-events-none select-none absolute font-display font-semibold tracking-tighter text-[42vw] leading-none bw-outline-text"
        >
          404
        </motion.span>

        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="relative text-center">
          <div className="w-20 h-20 rounded-3xl bg-white text-black flex items-center justify-center mx-auto animate-float">
            <Compass className="w-10 h-10" />
          </div>
          <h1 className="font-display text-7xl sm:text-8xl font-semibold tracking-tight mt-8">Lost in space.</h1>
          <p className="text-neutral-400 mt-4 max-w-md mx-auto font-light">The page you&apos;re looking for doesn&apos;t exist or has been moved. Let&apos;s get you back on track.</p>
          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Magnetic strength={0.3}>
              <Button data-testid="notfound-home-btn" onClick={() => navigate("/")} className="rounded-full bg-white text-black hover:bg-neutral-200 px-6 h-11 font-semibold w-full sm:w-auto"><Home className="w-4 h-4 mr-1.5" /> Back to home</Button>
            </Magnetic>
            <Button data-testid="notfound-dashboard-btn" onClick={() => navigate("/app")} variant="ghost" className="rounded-full px-6 h-11 border border-white/15 text-neutral-300 hover:text-white hover:bg-white/5"><ArrowLeft className="w-4 h-4 mr-1.5" /> Go to Dashboard</Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
