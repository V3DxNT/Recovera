"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Loader2, Check, Server, Cloud, MonitorCog,
  Container, Search, AlertCircle, ChevronRight, Cpu, Box,
  XCircle, CheckCircle2, FolderArchive
} from "lucide-react";

interface AwsResource {
  type: "ec2" | "ecs" | "eks" | "lambda" | "log_group";
  id: string;
  name: string;
  logGroups: string[];
  region: string;
  cluster?: string;
}

interface InstanceSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  repoName: string;         // e.g. "payment-api"
  repoFullName: string;     // e.g. "user/payment-api"
  credentialId: string | null;
  onSuccess?: () => void;
}

type Step = "discovering" | "auto_matched" | "manual_select" | "provisioning" | "success" | "error";

const TYPE_ICONS: Record<string, typeof Server> = {
  ec2: Cpu,
  ecs: Container,
  eks: Box,
  lambda: Cloud,
  log_group: MonitorCog,
};

const TYPE_LABELS: Record<string, string> = {
  ec2: "EC2 Instance",
  ecs: "ECS Service",
  eks: "EKS Service",
  lambda: "Lambda Function",
  log_group: "Log Group",
};

export default function InstanceSelectModal({
  isOpen, onClose, repoName, repoFullName, credentialId, onSuccess
}: InstanceSelectModalProps) {
  const [step, setStep] = useState<Step>("discovering");
  const [resources, setResources] = useState<AwsResource[]>([]);
  const [autoMatch, setAutoMatch] = useState<AwsResource | null>(null);
  const [selected, setSelected] = useState<AwsResource | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [errorDetail, setErrorDetail] = useState<{
    failedStep?: string;
    failedStepLabel?: string;
    failedResourceName?: string;
    stepError?: string;
    provisioningSteps?: any[];
  } | null>(null);
  const [provisionedBucket, setProvisionedBucket] = useState<string | null>(null);

  // On open, discover resources and try auto-match
  useEffect(() => {
    if (!isOpen || !credentialId) return;
    setStep("discovering");
    setAutoMatch(null);
    setSelected(null);
    setSearchQuery("");

    (async () => {
      try {
        // GET route — pass credentialId as a query param, not a POST body
        const res = await fetch(`/api/integration/discover?credentialId=${encodeURIComponent(credentialId)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        // API returns { mappings: RepoMatch[] } where each entry has { resource, bestMatch, confidence }
        const discovered: AwsResource[] = (data.mappings || []).map((m: any) => m.resource);
        setResources(discovered);


        // Try auto-match: find resource whose name matches the repo name
        const repoLower = repoName.toLowerCase();
        const exactMatch = discovered.find(
          r => r.name.toLowerCase() === repoLower
        );
        const partialMatch = !exactMatch
          ? discovered.find(
              r => r.name.toLowerCase().includes(repoLower) || repoLower.includes(r.name.toLowerCase())
            )
          : null;

        const match = exactMatch || partialMatch;
        if (match) {
          setAutoMatch(match);
          setStep("auto_matched");
        } else {
          setStep("manual_select");
        }
      } catch (err: any) {
        setErrorMsg(err.message || "Failed to discover resources");
        setStep("error");
      }
    })();
  }, [isOpen, credentialId, repoName]);

  // Provision the selected/confirmed resource
  const handleProvision = async (resource: AwsResource) => {
    setStep("provisioning");
    setErrorDetail(null);
    try {
      const res = await fetch("/api/integration/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentialId,
          mappings: [{
            repoFullName,
            logGroupName: resource.logGroups[0] || resource.id,
            resourceId: resource.id,
            resourceType: resource.type,
            resourceLabel: resource.name,
          }],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Capture structured error detail from the API
        setErrorDetail({
          failedStep: data.failedStep,
          failedStepLabel: data.failedStepLabel,
          failedResourceName: data.failedResourceName,
          stepError: data.stepError,
          provisioningSteps: data.provisioningSteps,
        });
        throw new Error(data.error || "Provisioning failed");
      }
      setProvisionedBucket(data.bucketName || null);
      setStep("success");
      onSuccess?.();
    } catch (err: any) {
      setErrorMsg(err.message || "Provisioning failed");
      setStep("error");
    }
  };

  // Filter resources for manual selection
  const filtered = resources.filter(r =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.cluster && r.cluster.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Group by type for display
  const grouped = filtered.reduce((acc, r) => {
    acc[r.type] = acc[r.type] || [];
    acc[r.type].push(r);
    return acc;
  }, {} as Record<string, AwsResource[]>);

  const handleClose = () => {
    setStep("discovering");
    setResources([]);
    setAutoMatch(null);
    setSelected(null);
    setErrorMsg("");
    setErrorDetail(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleClose}
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
      />

      {/* Modal */}
      <motion.div
        key="modal-content"
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div
          className="w-full max-w-lg bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border border-blue-500/20 flex items-center justify-center">
                <Server className="w-4.5 h-4.5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Connect Instance</h2>
                <p className="text-xs text-zinc-500">
                  Link <span className="text-zinc-300 font-medium">{repoName}</span> to an AWS resource
                </p>
              </div>
            </div>
            <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
              <X className="w-4 h-4 text-zinc-500" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 overflow-y-auto flex-1">
            <AnimatePresence mode="wait">

              {/* ─── Discovering ─── */}
              {step === "discovering" && (
                <motion.div
                  key="discovering"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-12 gap-4"
                >
                  <div className="relative">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border border-blue-500/20 flex items-center justify-center">
                      <Server className="w-7 h-7 text-blue-400" />
                    </div>
                    <motion.div
                      className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-zinc-950 border border-white/10 flex items-center justify-center"
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                    >
                      <Loader2 className="w-3.5 h-3.5 text-blue-400" />
                    </motion.div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-white">Scanning your AWS account…</p>
                    <p className="text-xs text-zinc-500 mt-1">Looking for EC2, ECS, EKS services & Lambda functions</p>
                  </div>
                </motion.div>
              )}

              {/* ─── Auto-Matched ─── */}
              {step === "auto_matched" && autoMatch && (
                <motion.div
                  key="auto_matched"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-5"
                >
                  <div className="flex items-start gap-2.5 bg-emerald-500/5 border border-emerald-500/15 rounded-lg px-3.5 py-3">
                    <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-emerald-300 font-medium">Match found!</p>
                      <p className="text-[11px] text-emerald-400/60 mt-0.5 leading-relaxed">
                        We found a {TYPE_LABELS[autoMatch.type] || "resource"} that matches <span className="text-emerald-300 font-medium">{repoName}</span>.
                      </p>
                    </div>
                  </div>

                  {/* Matched resource card */}
                  <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                      {(() => {
                        const Icon = TYPE_ICONS[autoMatch.type] || Server;
                        return <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                          <Icon className="w-5 h-5 text-blue-400" />
                        </div>;
                      })()}
                      <div>
                        <p className="text-sm font-semibold text-white">{autoMatch.name}</p>
                        <p className="text-xs text-zinc-500">{TYPE_LABELS[autoMatch.type]} · {autoMatch.region}</p>
                      </div>
                    </div>
                    <div className="space-y-1.5 text-xs text-zinc-400">
                      <div className="flex justify-between bg-white/[0.02] rounded px-2.5 py-1.5">
                        <span className="text-zinc-500">Resource ID</span>
                        <span className="font-mono text-zinc-300">{autoMatch.id.length > 30 ? autoMatch.id.slice(0, 30) + "…" : autoMatch.id}</span>
                      </div>
                      {autoMatch.cluster && (
                        <div className="flex justify-between bg-white/[0.02] rounded px-2.5 py-1.5">
                          <span className="text-zinc-500">Cluster</span>
                          <span className="text-zinc-300">{autoMatch.cluster}</span>
                        </div>
                      )}
                      {autoMatch.logGroups[0] && (
                        <div className="flex justify-between bg-white/[0.02] rounded px-2.5 py-1.5">
                          <span className="text-zinc-500">Log Group</span>
                          <span className="font-mono text-zinc-300 truncate max-w-[200px]">{autoMatch.logGroups[0]}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="text-[11px] text-zinc-600 text-center">
                    Not the right resource?{" "}
                    <button onClick={() => setStep("manual_select")} className="text-blue-400 hover:text-blue-300 underline">
                      Select manually
                    </button>
                  </p>
                </motion.div>
              )}

              {/* ─── Manual Select ─── */}
              {step === "manual_select" && (
                <motion.div
                  key="manual_select"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  {resources.length === 0 ? (
                    <div className="flex flex-col items-center py-10 gap-3">
                      <AlertCircle className="w-8 h-8 text-zinc-600" />
                      <p className="text-sm text-zinc-400">No resources found in your AWS account</p>
                      <p className="text-xs text-zinc-600 text-center max-w-xs">
                        Make sure your IAM policy includes ec2:DescribeInstances, ecs:ListServices, eks:ListClusters permissions.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start gap-2.5 bg-amber-500/5 border border-amber-500/15 rounded-lg px-3.5 py-3">
                        <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                        <p className="text-[11px] text-amber-400/80 leading-relaxed">
                          No automatic match found for <span className="text-amber-300 font-medium">{repoName}</span>. Select the resource running this service.
                        </p>
                      </div>

                      {/* Search */}
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <input
                          type="text"
                          placeholder="Search instances, services…"
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          className="w-full bg-zinc-900 border border-white/10 text-white text-sm rounded-lg pl-9 pr-4 py-2 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/20"
                        />
                      </div>

                      {/* Grouped resource list */}
                      <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                        {Object.entries(grouped).map(([type, items]) => {
                          const Icon = TYPE_ICONS[type] || Server;
                          return (
                            <div key={type}>
                              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-2 flex items-center gap-1.5">
                                <Icon className="w-3 h-3" />
                                {TYPE_LABELS[type] || type}s ({items.length})
                              </p>
                              <div className="space-y-1">
                                {items.map((r, idx) => (
                                  <button
                                    key={r.id || `${r.type}-${r.name}-${idx}`}
                                    onClick={() => setSelected(r)}
                                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all flex items-center justify-between group ${
                                      selected?.id === r.id
                                        ? "bg-blue-500/10 border-blue-500/30 text-white"
                                        : "bg-white/[0.02] border-white/5 text-zinc-300 hover:bg-white/[0.04] hover:border-white/10"
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium truncate">{r.name}</p>
                                      <p className="text-[11px] text-zinc-500 truncate">
                                        {r.cluster ? `${r.cluster} · ` : ""}{r.id.length > 35 ? r.id.slice(0, 35) + "…" : r.id}
                                      </p>
                                    </div>
                                    {selected?.id === r.id ? (
                                      <Check className="w-4 h-4 text-blue-400 flex-shrink-0" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4 text-zinc-600 opacity-0 group-hover:opacity-100 flex-shrink-0" />
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </motion.div>
              )}

              {/* ─── Provisioning ─── */}
              {step === "provisioning" && (
                <motion.div
                  key="provisioning"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-8 gap-5"
                >
                  <div className="relative">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500/10 to-amber-500/5 border border-orange-500/20 flex items-center justify-center">
                      <Cloud className="w-6 h-6 text-orange-400" />
                    </div>
                    <motion.div
                      className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-zinc-950 border border-white/10 flex items-center justify-center"
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                    >
                      <Loader2 className="w-3 h-3 text-orange-400" />
                    </motion.div>
                  </div>
                  <div className="text-center mb-2">
                    <p className="text-sm font-medium text-white">Setting up log pipeline…</p>
                    <p className="text-xs text-zinc-500 mt-1">Provisioning AWS resources for your repo</p>
                  </div>
                  {/* Step-by-step progress */}
                  <div className="w-full space-y-1.5">
                    {[
                      { id: "validate", label: "Validate Credentials" },
                      { id: "s3", label: "Create S3 Bucket" },
                      { id: "iam", label: "Create IAM Roles" },
                      { id: "firehose", label: "Create Firehose Stream" },
                      { id: "cloudwatch", label: "Subscribe Log Groups" },
                      { id: "db", label: "Save Integration" },
                    ].map((s, idx) => (
                      <motion.div
                        key={s.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.08 }}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5 text-xs"
                      >
                        <motion.div
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ repeat: Infinity, duration: 1.5, delay: idx * 0.3 }}
                          className="w-2 h-2 rounded-full bg-orange-400/60 flex-shrink-0"
                        />
                        <span className="text-zinc-400">{s.label}</span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* ─── Success ─── */}
              {step === "success" && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-12 gap-4"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.1 }}
                    className="w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center"
                  >
                    <Check className="w-7 h-7 text-green-400" />
                  </motion.div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-white">Instance Connected!</p>
                    <p className="text-xs text-zinc-500 mt-1 max-w-xs leading-relaxed">
                      Initial configuration completed successfully. Logs are now streaming via <b>CloudWatch</b> and <b>Firehose</b> to your S3 bucket.
                    </p>
                  </div>

                  {provisionedBucket && (
                    <div className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 w-full space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Log Storage</span>
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span className="text-[10px] text-emerald-400 font-medium uppercase tracking-wider">Active</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-white/10 flex items-center justify-center">
                          <FolderArchive className="w-4 h-4 text-zinc-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-zinc-400">S3 Bucket Name</p>
                          <p className="text-xs text-white font-mono truncate">{provisionedBucket}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <p className="text-[11px] text-zinc-600 text-center leading-relaxed">
                    You&apos;ll see incoming data in the dashboard within ~60 seconds as it propagates through the pipeline.
                  </p>
                </motion.div>
              )}

              {/* ─── Error ─── */}
              {step === "error" && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center py-6 gap-4"
                >
                  <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                    <AlertCircle className="w-6 h-6 text-red-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-white">Provisioning Failed</p>
                    {errorDetail?.failedStepLabel && (
                      <p className="text-xs text-red-400 mt-1">
                        Failed at: <span className="font-semibold">{errorDetail.failedStepLabel}</span>
                      </p>
                    )}
                    {errorDetail?.failedResourceName && (
                      <p className="text-[11px] text-zinc-400 mt-1">
                        Resource: <span className="font-mono text-zinc-300">{errorDetail.failedResourceName}</span>
                      </p>
                    )}
                    {errorDetail?.stepError && (
                      <p className="text-[11px] text-red-400/60 mt-1.5 max-w-xs leading-relaxed">{errorDetail.stepError}</p>
                    )}
                  </div>

                  {/* Provisioning step breakdown */}
                  {errorDetail?.provisioningSteps && errorDetail.provisioningSteps.length > 0 && (
                    <div className="w-full space-y-1 mt-1">
                      {errorDetail.provisioningSteps.map((s: any) => (
                        <div
                          key={s.step}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-xs ${
                            s.status === "success"
                              ? "bg-emerald-500/5 text-emerald-400/80"
                              : s.status === "failed"
                                ? "bg-red-500/8 text-red-400"
                                : "bg-white/[0.02] text-zinc-600"
                          }`}
                        >
                          {s.status === "success" ? (
                            <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                          ) : s.status === "failed" ? (
                            <XCircle className="w-3 h-3 flex-shrink-0" />
                          ) : (
                            <div className="w-3 h-3 rounded-full border border-zinc-700 flex-shrink-0" />
                          )}
                          <span className="flex-1">{s.label}</span>
                          {s.resourceName && s.status !== "pending" && (
                            <span className="font-mono text-[10px] text-zinc-500 truncate max-w-[140px]">
                              {s.resourceName}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {!errorDetail?.provisioningSteps && (
                    <p className="text-xs text-red-400/70 max-w-xs text-center">{errorMsg}</p>
                  )}
                </motion.div>
              )}

            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-white/8 flex items-center justify-between flex-shrink-0">
            {step === "auto_matched" && (
              <>
                <button onClick={handleClose} className="px-4 py-2 text-xs text-zinc-400 hover:text-white border border-white/10 rounded-lg hover:bg-white/5 transition-all">
                  Cancel
                </button>
                <button
                  onClick={() => autoMatch && handleProvision(autoMatch)}
                  className="px-5 py-2 bg-white text-black text-xs font-medium rounded-lg hover:bg-zinc-100 transition-all active:scale-95 shadow-sm"
                >
                  Yes, connect this instance
                </button>
              </>
            )}

            {step === "manual_select" && (
              <>
                <button onClick={handleClose} className="px-4 py-2 text-xs text-zinc-400 hover:text-white border border-white/10 rounded-lg hover:bg-white/5 transition-all">
                  Cancel
                </button>
                <button
                  onClick={() => selected && handleProvision(selected)}
                  disabled={!selected}
                  className={`px-5 py-2 text-xs font-medium rounded-lg transition-all active:scale-95 ${
                    selected
                      ? "bg-white text-black hover:bg-zinc-100 shadow-sm"
                      : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  }`}
                >
                  Connect selected
                </button>
              </>
            )}

            {step === "discovering" && (
              <p className="text-[11px] text-zinc-600 mx-auto">Scanning resources…</p>
            )}

            {step === "provisioning" && (
              <p className="text-[11px] text-zinc-600 mx-auto">This usually takes 30–60 seconds…</p>
            )}

            {(step === "success" || step === "error") && (
              <button onClick={handleClose} className="mx-auto px-6 py-2 bg-white text-black text-xs font-medium rounded-lg hover:bg-zinc-100 transition-all active:scale-95 shadow-sm">
                {step === "success" ? "Done" : "Close"}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
