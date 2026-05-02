import Link from "next/link";
export default function Footer() {
  return (
    <footer className="bg-black pt-20 pb-10 border-t border-white/[0.05]">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 mb-16">
          <div className="col-span-2 lg:col-span-2">
            <div className="font-semibold text-lg text-white tracking-tighter flex items-center gap-2 mb-6">
              <div className="w-5 h-5 bg-white rounded-sm flex items-center justify-center">
                <div className="w-1.5 h-1.5 bg-black rounded-full"></div>
              </div>
              Recovera
            </div>
            <p className="text-zinc-500 text-sm font-light leading-relaxed max-w-xs">
              Autonomous Site Reliability Engineering.<br/>
              Built for teams who ship fast.
            </p>
          </div>
          
          <div>
            <h4 className="font-medium text-white mb-4 text-sm tracking-tight">Product</h4>
            <ul className="space-y-3 text-sm font-light text-zinc-500">
              <li><Link href="#" className="hover:text-white transition-colors">Features</Link></li>
              <li><Link href="#" className="hover:text-white transition-colors">Integrations</Link></li>
              <li><Link href="#" className="hover:text-white transition-colors">Pricing</Link></li>
              <li><Link href="#" className="hover:text-white transition-colors">Changelog</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium text-white mb-4 text-sm tracking-tight">Resources</h4>
            <ul className="space-y-3 text-sm font-light text-zinc-500">
              <li><Link href="#" className="hover:text-white transition-colors">Documentation</Link></li>
              <li><Link href="#" className="hover:text-white transition-colors">Blog</Link></li>
              <li><Link href="#" className="hover:text-white transition-colors">API Reference</Link></li>
              <li><Link href="#" className="hover:text-white transition-colors">Community</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium text-white mb-4 text-sm tracking-tight">Company</h4>
            <ul className="space-y-3 text-sm font-light text-zinc-500">
              <li><Link href="#" className="hover:text-white transition-colors">About</Link></li>
              <li><Link href="#" className="hover:text-white transition-colors">Careers</Link></li>
              <li><Link href="#" className="hover:text-white transition-colors">Legal</Link></li>
              <li><Link href="#" className="hover:text-white transition-colors">Contact</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-white/[0.05] pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-zinc-600 text-xs tracking-tight">© {new Date().getFullYear()} Recovera Inc. All rights reserved.</p>
          <div className="flex gap-4">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mt-1"></div>
            <span className="text-zinc-500 text-xs">All systems operational</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
