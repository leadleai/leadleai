import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, ArrowLeft, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import MarketingNav from "@/components/marketing/MarketingNav";

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="dark min-h-screen bg-black text-white" data-testid="not-found-page">
      <MarketingNav />
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden px-5">
        <div className="absolute inset-0 bg-gradient-to-br from-neutral-50 via-white to-neutral-50 dark:from-neutral-900 dark:via-neutral-950 dark:to-neutral-900" />
        <div className="absolute inset-0 grain opacity-50" />
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative text-center">
          <div className="w-20 h-20 rounded-3xl bg-neutral-900 border border-neutral-800 flex items-center justify-center mx-auto text-white">
            <Compass className="w-10 h-10" />
          </div>
          <h1 className="font-display text-8xl sm:text-9xl font-semibold tracking-tight mt-8 text-white">404</h1>          <h2 className="font-heading text-2xl font-bold mt-2">Page not found</h2>
          <p className="text-neutral-500 dark:text-neutral-400 mt-3 max-w-md mx-auto">The page you&apos;re looking for doesn&apos;t exist or has been moved. Let&apos;s get you back on track.</p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button data-testid="notfound-home-btn" onClick={() => navigate("/")} className="rounded-full bg-white text-black hover:shadow-lg px-6 h-11"><Home className="w-4 h-4 mr-1" /> Back to home</Button>
            <Button data-testid="notfound-dashboard-btn" onClick={() => navigate("/app")} variant="outline" className="rounded-full px-6 h-11"><ArrowLeft className="w-4 h-4 mr-1" /> Go to Dashboard</Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
