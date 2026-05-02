"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useSession, signOut, signIn } from "next-auth/react";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const { data: session, status } = useSession();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b ${scrolled
        ? "bg-black/80 backdrop-blur-md border-white/10 py-3"
        : "bg-transparent border-transparent py-5"
        }`}
    >
      <div className="w-full mx-auto px-6 max-w-7xl flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="font-semibold text-lg text-white tracking-tighter flex items-center gap-2">
            <div className="w-5 h-5 bg-white rounded-[4px] flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-black rounded-full"></div>
            </div>
            Recovera
          </div>

          <nav className="hidden md:flex gap-6">
            <Link href="#" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">Products</Link>
            <Link href="#" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">Enterprise</Link>
            <Link href="#" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">Customers</Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {status === "authenticated" ? (
            <>
              <span className="text-sm font-medium text-zinc-300">{session?.user?.name}</span>
              <Link href={"/dashboard"} className="hidden sm:flex items-center justify-center px-4 py-1.5 text-sm font-medium text-white bg-zinc-800 rounded-md hover:bg-zinc-700 transition-all active:scale-95 shadow-sm">Dashboard</Link>
              <button
                onClick={() => signOut()}
                className="hidden sm:flex items-center justify-center px-4 py-1.5 text-sm font-medium text-white bg-zinc-800 rounded-md hover:bg-zinc-700 transition-all active:scale-95 shadow-sm"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <button onClick={() => signIn('github', { callbackUrl: '/dashboard' })} className="hidden sm:flex items-center justify-center px-4 py-1.5 text-sm font-medium text-black bg-white rounded-md hover:bg-zinc-200 transition-all active:scale-95 shadow-sm">
                Login with Github
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
