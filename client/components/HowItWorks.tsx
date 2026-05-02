import { Search, BrainCircuit, Wrench, RefreshCw } from "lucide-react";

export default function HowItWorks() {
  const steps = [
    {
      icon: <Search className="w-6 h-6 text-indigo-600" />,
      title: "Detect",
      description: "Continuously spans your entire infrastructure, watching metrics, traces, and logs for early signs of anomalies.",
      bgColor: "bg-indigo-50",
    },
    {
      icon: <BrainCircuit className="w-6 h-6 text-cyan-600" />,
      title: "Diagnose",
      description: "Uses deep AI models to instantly analyze stack traces and pinpoint the exact root cause without human intervention.",
      bgColor: "bg-cyan-50",
    },
    {
      icon: <Wrench className="w-6 h-6 text-purple-600" />,
      title: "Fix",
      description: "Generates tested code patches, creates PRs, or runs self-healing scripts to resolve the issue automatically.",
      bgColor: "bg-purple-50",
    },
    {
      icon: <RefreshCw className="w-6 h-6 text-emerald-600" />,
      title: "Learn",
      description: "Updates internal policies and playbooks to prevent similar issues from reoccurring in the future.",
      bgColor: "bg-emerald-50",
    }
  ];

  return (
    <section className="py-24 bg-white relative">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">How Recovera Works</h2>
          <p className="text-slate-600 text-lg">A zero-touch reliability pipeline that operates completely autonomously.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative">
          <div className="hidden lg:block absolute top-[44px] left-[10%] right-[10%] h-[2px] bg-slate-100 z-0"></div>

          {steps.map((step, index) => (
            <div key={index} className="relative z-10 flex flex-col items-center text-center group">
              <div className={`w-24 h-24 rounded-full ${step.bgColor} flex items-center justify-center mb-6 shadow-sm group-hover:scale-110 transition-transform duration-300 ring-8 ring-white`}>
                {step.icon}
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">{step.title}</h3>
              <p className="text-slate-600 leading-relaxed max-w-xs">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
