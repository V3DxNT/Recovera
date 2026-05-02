"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutGrid, ScrollText, Search, MoreHorizontal, GitBranch, GitCommit,
  Plus, ChevronDown, AlignJustify, BarChart2, Cloud, Loader2,
  AlertTriangle, CheckCircle2, XCircle, ChevronRight, RefreshCw
} from "lucide-react";

interface FailedStep {
  step: string;
  label: string;
  resourceName?: string;
  error?: string;
}

interface ProvisioningStep {
  step: string;
  label: string;
  status: "pending" | "success" | "failed" | "skipped";
  resourceName?: string;
  error?: string;
}

export default function Dashboard() {
  const { data: session } = useSession();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [expandedError, setExpandedError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/integration/mappings")
      .then(r => r.json())
      .then(data => {
        if (data.projects) setProjects(data.projects);
      })
      .catch(err => console.error("Failed to fetch projects:", err))
      .finally(() => setLoading(false));
  }, []);

  const name = session?.user?.name ?? "User";

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-black text-white pt-20 px-8 max-w-6xl mx-auto">

      {/* Top Bar */}
      <div className="flex items-center justify-between py-5 border-b border-white/8 mb-6">
        <h1 className="text-lg font-semibold text-white">All Projects</h1>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search Projects..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-64 bg-zinc-900 border border-white/8 text-sm text-white rounded-lg pl-9 pr-4 py-2 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all"
            />
          </div>

          {/* View toggles */}
          <button className="p-2 border border-white/10 rounded-lg hover:bg-white/5 transition-colors">
            <AlignJustify className="w-4 h-4 text-zinc-400" />
          </button>
          <button
            onClick={() => setView("grid")}
            className={`p-2 border rounded-lg transition-colors ${view === "grid" ? "border-white/20 bg-white/10 text-white" : "border-white/10 text-zinc-400 hover:bg-white/5"}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setView("list")}
            className={`p-2 border rounded-lg transition-colors ${view === "list" ? "border-white/20 bg-white/10 text-white" : "border-white/10 text-zinc-400 hover:bg-white/5"}`}
          >
            <ScrollText className="w-4 h-4" />
          </button>

          {/* Add New */}
          <Link
            href="/dashboard/import"
            className="flex items-center gap-1.5 px-4 py-2 bg-white text-black text-sm font-medium rounded-lg hover:bg-zinc-100 transition-all active:scale-95 shadow-sm"
          >
            Add New
            <ChevronDown className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Projects Section */}
      <div>
        <p className="text-sm font-semibold text-white mb-4">Projects</p>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-zinc-500">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
            <p className="text-sm">Fetching your projects...</p>
          </div>
        ) : filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-zinc-900/60 border border-white/8 rounded-xl p-12 flex flex-col items-center text-center"
          >
            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
              <Plus className="w-5 h-5 text-zinc-400" />
            </div>
            <p className="text-sm font-medium text-white mb-1">No projects yet</p>
            <p className="text-xs text-zinc-500 mb-6 max-w-xs">
              Import a Git repository to start monitoring it with Recovera's autonomous SRE engine.
            </p>
            <Link
              href="/dashboard/import"
              className="flex items-center gap-1.5 px-4 py-2 bg-white text-black text-xs font-medium rounded-lg hover:bg-zinc-100 transition-all active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              Add New Repository
            </Link>
          </motion.div>
        ) : (
          <div className={view === "grid" ? "grid grid-cols-3 gap-3" : "space-y-2"}>
            {filtered.map((project, i) => {
              const isFailed = project.status === "failed";
              const failedStep: FailedStep | null = project.failedStep;
              const provSteps: ProvisioningStep[] = project.provisioningSteps || [];
              const isExpanded = expandedError === project.id;

              return (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className={`bg-zinc-900/60 border rounded-xl p-4 transition-colors h-full block ${
                    isFailed
                      ? "border-red-500/20 hover:border-red-500/35"
                      : "border-white/8 hover:border-white/15"
                  }`}
                >
                  {/* Card Header — clickable to repo only if active */}
                  {isFailed ? (
                    <div>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-red-700 to-red-900 flex items-center justify-center text-xs font-bold uppercase">
                            {project.name[0]}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white truncate max-w-[140px]">{project.name}</p>
                            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{project.resourceType}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-[10px] px-1.5 py-0.5 rounded-full border bg-red-500/10 border-red-500/20 text-red-400 font-semibold uppercase tracking-wider">
                            Failed
                          </div>
                        </div>
                      </div>

                      {/* Failed Step Callout */}
                      {failedStep && (
                        <div className="bg-red-500/5 border border-red-500/15 rounded-lg p-3 mb-3">
                          <div className="flex items-center gap-2 mb-1.5">
                            <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                            <p className="text-xs font-semibold text-red-300">
                              Failed: {failedStep.label}
                            </p>
                          </div>
                          {failedStep.resourceName && (
                            <p className="text-[11px] text-zinc-400 ml-5.5 mb-1">
                              <span className="text-zinc-500">Resource: </span>
                              <span className="font-mono text-zinc-300">{failedStep.resourceName}</span>
                            </p>
                          )}
                          {failedStep.error && (
                            <p className="text-[11px] text-red-400/70 ml-5.5 leading-relaxed line-clamp-2">
                              {failedStep.error}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Expand/Collapse Provisioning Steps */}
                      {provSteps.length > 0 && (
                        <button
                          onClick={() => setExpandedError(isExpanded ? null : project.id)}
                          className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors mb-2 w-full"
                        >
                          <ChevronRight className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                          {isExpanded ? "Hide provisioning details" : "Show all steps"}
                        </button>
                      )}

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="space-y-1 mb-3">
                              {provSteps.map((step) => (
                                <div
                                  key={step.step}
                                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-xs ${
                                    step.status === "success"
                                      ? "bg-emerald-500/5 text-emerald-400/80"
                                      : step.status === "failed"
                                        ? "bg-red-500/5 text-red-400"
                                        : "bg-white/[0.02] text-zinc-600"
                                  }`}
                                >
                                  {step.status === "success" ? (
                                    <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                                  ) : step.status === "failed" ? (
                                    <XCircle className="w-3 h-3 flex-shrink-0" />
                                  ) : (
                                    <div className="w-3 h-3 rounded-full border border-zinc-700 flex-shrink-0" />
                                  )}
                                  <span className="flex-1">{step.label}</span>
                                  {step.resourceName && step.status !== "pending" && (
                                    <span className="font-mono text-[10px] text-zinc-500 truncate max-w-[120px]">
                                      {step.resourceName}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* General metadata */}
                      <div className="text-xs text-zinc-500 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <GitBranch className="w-3 h-3" />
                          <span className="truncate">{project.credentialLabel}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Cloud className="w-3 h-3" />
                          <span className="truncate">{project.resourceId}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // Normal active project card
                    <Link href={`/repo/${project.name}`} className="block h-full">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-zinc-600 to-zinc-800 flex items-center justify-center text-xs font-bold uppercase">
                            {project.name[0]}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white truncate max-w-[140px]">{project.name}</p>
                            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{project.resourceType}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                            project.status === 'active' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                          }`}>
                            {project.status}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-zinc-500 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <GitBranch className="w-3 h-3" />
                          <span className="truncate">{project.credentialLabel}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Cloud className="w-3 h-3" />
                          <span className="truncate">{project.resourceId}</span>
                        </div>
                      </div>
                    </Link>
                  )}
                </motion.div>
              );
            })}

            {/* Add new card */}
            <Link
              href="/dashboard/import"
              className="bg-zinc-900/30 border border-dashed border-white/10 rounded-xl p-4 flex items-center justify-center gap-2 text-zinc-500 hover:text-white hover:border-white/20 hover:bg-white/[0.03] transition-all min-h-[100px]"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm">Add new repo</span>
            </Link>
          </div>
        )}
      </div>

    </div>
  );
}
