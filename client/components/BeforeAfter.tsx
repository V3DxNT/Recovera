import { Clock, AlertTriangle, UserX, Bot, Zap, CheckCircle } from "lucide-react";

export default function BeforeAfter() {
  return (
    <section className="py-24 bg-slate-900 text-white relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl h-96 bg-primary/20 blur-[100px] rounded-full pointer-events-none"></div>
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl lg:text-4xl font-bold mb-4">The new standard for reliability.</h2>
          <p className="text-slate-400 text-lg">Stop waking up your best engineers for repetitive incidents.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 max-w-5xl mx-auto">
          {/* Before Column */}
          <div className="bg-slate-800/50 rounded-3xl p-8 border border-slate-700/50 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2 bg-slate-700 rounded-lg text-slate-300"><UserX size={20} /></div>
              <h3 className="text-xl font-semibold text-slate-200">The Manual Way</h3>
            </div>
            
            <ul className="space-y-6 relative before:absolute before:inset-y-0 before:left-[11px] before:w-px before:bg-slate-700">
              <li className="relative pl-8 hidden sm:block"></li>
              <li className="relative pl-8">
                <span className="absolute left-0 top-1 w-6 h-6 rounded-full bg-slate-800 border-2 border-amber-500 flex items-center justify-center -translate-x-[5px]"></span>
                <p className="font-medium text-slate-300">2:00 AM Incident</p>
                <p className="text-sm text-slate-500">Pager triggers an alert on phone.</p>
              </li>
              <li className="relative pl-8">
                <span className="absolute left-0 top-1 w-6 h-6 rounded-full bg-slate-800 border-2 border-slate-600 flex items-center justify-center -translate-x-[5px]"></span>
                <p className="font-medium text-slate-300">Acknowledge</p>
                <p className="text-sm text-slate-500">Engineer wakes up, opens laptop, starts VPN.</p>
              </li>
              <li className="relative pl-8">
                <span className="absolute left-0 top-1 w-6 h-6 rounded-full bg-slate-800 border-2 border-slate-600 flex items-center justify-center -translate-x-[5px]"></span>
                <p className="font-medium text-slate-300">Sift through Logs</p>
                <p className="text-sm text-slate-500">30 mins crossing Dashboards to find root cause.</p>
              </li>
              <li className="relative pl-8">
                <span className="absolute left-0 top-1 w-6 h-6 rounded-full bg-slate-800 border-2 border-slate-600 flex items-center justify-center -translate-x-[5px]"></span>
                <p className="font-medium text-slate-300">Apply Fix</p>
                <p className="text-sm text-slate-500">Write script, test, manual deployment.</p>
              </li>
            </ul>
            <div className="mt-8 pt-6 border-t border-slate-700 flex items-center gap-2 text-rose-400 font-medium">
              <Clock size={18} /> Resolution Time: 1 hour+
            </div>
          </div>

          {/* After Column */}
          <div className="bg-gradient-to-b from-indigo-900/40 to-slate-800/40 rounded-3xl p-8 border border-indigo-500/30 backdrop-blur-sm relative shadow-[0_0_40px_rgb(79,70,229,0.15)]">
            <div className="absolute top-0 right-8 px-4 py-1 bg-indigo-500 text-white text-xs font-bold rounded-b-lg tracking-wider">RECOVERA</div>
            
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400"><Bot size={20} /></div>
              <h3 className="text-xl font-semibold text-white">The Recovera Way</h3>
            </div>
            
            <ul className="space-y-6 relative before:absolute before:inset-y-0 before:left-[11px] before:w-px before:bg-indigo-500/30">
              <li className="relative pl-8 hidden sm:block"></li>
              <li className="relative pl-8">
                <span className="absolute left-0 top-1 w-6 h-6 rounded-full bg-slate-900 border-2 border-indigo-500 flex items-center justify-center -translate-x-[5px]"></span>
                <p className="font-medium text-slate-100">2:00:01 AM</p>
                <p className="text-sm text-slate-400">Memory leak detected in pipeline.</p>
              </li>
              <li className="relative pl-8">
                <span className="absolute left-0 top-1 w-6 h-6 rounded-full bg-slate-900 border-2 border-indigo-500 flex items-center justify-center -translate-x-[5px]"></span>
                <p className="font-medium text-slate-100">2:00:05 AM</p>
                <p className="text-sm text-slate-400">AI traces leak to Redis connection pool.</p>
              </li>
              <li className="relative pl-8">
                <span className="absolute left-0 top-1 w-6 h-6 rounded-full bg-slate-900 border-2 border-indigo-500 flex items-center justify-center -translate-x-[5px]"></span>
                <p className="font-medium text-slate-100">2:00:15 AM</p>
                <p className="text-sm text-slate-400">Rolling restart initiated automatically.</p>
              </li>
              <li className="relative pl-8">
                <span className="absolute left-0 top-1 w-6 h-6 rounded-full bg-indigo-500 border-2 border-indigo-400 flex items-center justify-center -translate-x-[5px] text-white">
                  <CheckCircle size={14} />
                </span>
                <p className="font-medium text-slate-100">2:00:20 AM</p>
                <p className="text-sm text-slate-400">System stable. Engineer sleeps peacefully.</p>
              </li>
            </ul>
            <div className="mt-8 pt-6 border-t border-indigo-500/30 flex items-center gap-2 text-emerald-400 font-medium">
              <Zap size={18} /> Resolution Time: 19 Seconds
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
