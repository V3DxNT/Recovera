"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Shield, Eye, EyeOff, Cloud, KeyRound, MapPin,
  AlertTriangle, Loader2, Check, Copy, ExternalLink, Info,
  Search, Server, Cpu, Box, Container, MonitorCog, ChevronDown
} from "lucide-react";

interface IntegrateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = "credentials" | "validating" | "discovering" | "mapping" | "success" | "error";

const REQUIRED_POLICY = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    {
      Sid: "RecoveraDiscovery",
      Effect: "Allow",
      Action: [
        "sts:GetCallerIdentity",
        "ec2:DescribeInstances",
        "ecs:ListClusters",
        "ecs:ListServices",
        "ecs:DescribeServices",
        "eks:ListClusters",
        "eks:DescribeCluster",
        "ecr:DescribeRepositories",
        "logs:DescribeLogGroups"
      ],
      Resource: "*"
    },
    {
      Sid: "RecoveraInfrastructureProvisioning",
      Effect: "Allow",
      Action: [
        "s3:CreateBucket",
        "s3:PutBucketPublicAccessBlock",
        "s3:DeleteBucket",
        "s3:ListBucket",
        "firehose:CreateDeliveryStream",
        "firehose:DeleteDeliveryStream",
        "firehose:DescribeDeliveryStream",
        "firehose:ListDeliveryStreams",
        "logs:PutSubscriptionFilter",
        "logs:DeleteSubscriptionFilter"
      ],
      Resource: "*"
    },
    {
      Sid: "RecoveraIAMManagement",
      Effect: "Allow",
      Action: [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:GetRole",
        "iam:PassRole"
      ],
      Resource: [
        "arn:aws:iam::*:role/AutoSRE-*"
      ]
    }
  ]
}, null, 2);

const AWS_REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "af-south-1", "ap-east-1", "ap-south-1", "ap-northeast-3",
  "ap-northeast-2", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1",
  "ca-central-1", "eu-central-1", "eu-west-1", "eu-west-2",
  "eu-south-1", "eu-west-3", "eu-north-1", "me-south-1",
  "sa-east-1", "us-gov-east-1", "us-gov-west-1"
];
interface SuggestedMapping {
  resource: {
    type: string;
    id: string;
    name: string;
    logGroups: string[];
    region: string;
    cluster?: string;
  };
  bestMatch: string | null;
  confidence: number;
}

export default function IntegrateModal({ isOpen, onClose }: IntegrateModalProps) {
  const [step, setStep] = useState<Step>("credentials");
  const [showSecret, setShowSecret] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [credentialId, setCredentialId] = useState<string | null>(null);

  const [suggestedMappings, setSuggestedMappings] = useState<SuggestedMapping[]>([]);
  const [githubRepos, setGithubRepos] = useState<string[]>([]);
  const [existingMappingIds, setExistingMappingIds] = useState<Set<string>>(new Set());
  const [selectedMappings, setSelectedMappings] = useState<Record<string, string>>({}); // resourceId -> repoFullName
  const [searchQuery, setSearchQuery] = useState("");

  const [existingCredsList, setExistingCredsList] = useState<{ id: string; label: string; region: string }[]>([]);
  const [showNewForm, setShowNewForm] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      try {
        // 1. Check existing credentials
        const credsRes = await fetch("/api/user/credentials");
        const credsData = await credsRes.json();
        
        if (credsData.credentials && credsData.credentials.length > 0) {
          setExistingCredsList(credsData.credentials);
          setShowNewForm(false);
        }

        // 2. Fetch existing mappings to hide already connected resources
        const mappingsRes = await fetch("/api/integration/mappings");
        const mappingsData = await mappingsRes.json();
        if (mappingsData.success && mappingsData.projects) {
          const ids = new Set<string>(mappingsData.projects.map((p: any) => p.resourceId as string));
          setExistingMappingIds(ids);
        }
      } catch (err) {
        console.error("Error fetching modal data:", err);
      }
    };

    fetchData();
  }, [isOpen]);


  const [form, setForm] = useState({
    label: "",
    accessKeyId: "",
    secretAccessKey: "",
    region: "us-east-1",
  });

  const isFormValid =
    form.accessKeyId.trim().length > 0 &&
    form.secretAccessKey.trim().length > 0;

  const handleCopyPolicy = () => {
    navigator.clipboard.writeText(REQUIRED_POLICY);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async () => {
    if (!isFormValid) return;

    setStep("validating");

    try {
      const res = await fetch("/api/integration/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "aws",
          label: form.label || "My AWS Account",
          accessKeyId: form.accessKeyId,
          secretAccessKey: form.secretAccessKey,
          region: form.region,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || "Failed to validate credentials.");
        setStep("error");
        return;
      }

      setCredentialId(data.credentialId);
      handleDiscover(data.credentialId);
    } catch (err) {
      setErrorMessage("Network error. Please check your connection and try again.");
      setStep("error");
    }
  };

  const handleDiscover = async (id: string) => {
    setStep("discovering");
    try {
      const res = await fetch(`/api/integration/discover?credentialId=${id}`);
      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || "Failed to discover resources.");
        setStep("error");
        return;
      }

      setSuggestedMappings(data.mappings);
      setGithubRepos(data.githubRepos);

      // Initialize selected mappings with best matches
      const initial: Record<string, string> = {};
      data.mappings.forEach((m: SuggestedMapping) => {
        if (m.bestMatch) initial[m.resource.id] = m.bestMatch;
      });
      setSelectedMappings(initial);

      setStep("mapping");
    } catch (err) {
      setErrorMessage("Discovery failed. Please try again.");
      setStep("error");
    }
  };

  const handleSaveMappings = async () => {
    if (!credentialId) return;

    setStep("validating");
    try {
      // Build the mappings payload once — reused for both DB persist and provision
      const mappingsToSave = suggestedMappings.map(m => ({
        resourceId: m.resource.id,
        resourceType: m.resource.type,
        resourceLabel: m.resource.name,
        logGroupName: m.resource.logGroups[0] || "unknown",
        repoFullName: selectedMappings[m.resource.id],
        confidence: selectedMappings[m.resource.id] === m.bestMatch ? m.confidence : 1.0,
        source: selectedMappings[m.resource.id] === m.bestMatch ? "auto" : "manual",
      })).filter(m => m.repoFullName); // Only save those with a repo assigned

      // Step 1: Persist mapping records to the DB
      const mappingsRes = await fetch("/api/integration/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentialId,
          mappings: mappingsToSave
        }),
      });

      if (!mappingsRes.ok) {
        const data = await mappingsRes.json();
        setErrorMessage(data.error || "Failed to save mappings.");
        setStep("error");
        return;
      }

      // Step 2: Provision AWS infrastructure (S3, IAM, Firehose, CloudWatch)
      // This is the critical step — without it, no logs will ever arrive.
      const provisionRes = await fetch("/api/integration/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentialId,
          mappings: mappingsToSave.map(m => ({
            repoFullName: m.repoFullName,
            logGroupName: m.logGroupName,
            resourceId: m.resourceId,
            resourceType: m.resourceType,
            resourceLabel: m.resourceLabel,
          })),
        }),
      });

      if (!provisionRes.ok) {
        const data = await provisionRes.json();
        // Show the specific failed step if available
        const failedLabel = data.failedStepLabel || "AWS Provisioning";
        setErrorMessage(`Mappings saved, but ${failedLabel} failed: ${data.stepError || data.error}`);
        setSuggestion(data.provisioningSteps?.find((s: any) => s.status === "failed")?.suggestion || null);
        setStep("error");
        return;
      }

      setStep("success");
    } catch (err) {
      setErrorMessage("Failed to save mappings.");
      setStep("error");
    }
  };


  const handleClose = () => {
    setStep("credentials");
    setForm({ label: "", accessKeyId: "", secretAccessKey: "", region: "us-east-1" });
    setShowSecret(false);
    setShowPolicy(false);
    setErrorMessage("");
    setSuggestion(null);
    setExistingCredsList([]);
    setShowNewForm(true);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="integrate-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            key="integrate-content"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="w-full max-w-lg bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/10 border border-orange-500/20 flex items-center justify-center">
                    <Cloud className="w-4.5 h-4.5 text-orange-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-white">Connect AWS Account</h2>
                    <p className="text-xs text-zinc-500">Provide IAM credentials to enable monitoring</p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <X className="w-4 h-4 text-zinc-500" />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5">
                <AnimatePresence mode="wait">

                  {/* ─── Step: Credentials Form ─── */}
                  {step === "credentials" && (
                    <motion.div
                      key="credentials"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-4"
                    >
                      {/* Existing Credentials Option */}
                      {existingCredsList.length > 0 && !showNewForm && (
                        <div className="mb-6 space-y-4">
                          <label className="block text-xs font-medium text-zinc-400 mb-2">
                            Saved Connections
                          </label>
                          <div className="space-y-2">
                            {existingCredsList.map((creds) => (
                              <div key={creds.id} className="group relative flex items-center justify-between p-3.5 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                                <div className="flex items-center gap-3.5">
                                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500/10 to-amber-500/5 border border-orange-500/20 flex items-center justify-center">
                                    <Cloud className="w-4.5 h-4.5 text-orange-400" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-white">{creds.label || "AWS Account"}</p>
                                    <p className="text-[11px] text-zinc-500 mt-0.5">Region: {creds.region}</p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setCredentialId(creds.id);
                                    handleDiscover(creds.id);
                                  }}
                                  className="px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium transition-colors"
                                >
                                  Connect
                                </button>
                              </div>
                            ))}
                          </div>
                          
                          <div className="flex justify-center mt-6 mb-2">
                            <button 
                              type="button"
                              onClick={() => setShowNewForm(true)}
                              className="px-4 py-2 bg-zinc-900 border border-white/10 rounded-lg text-xs font-medium text-white hover:bg-zinc-800 transition-colors flex items-center gap-2 shadow-sm"
                            >
                              <span className="text-zinc-400">+</span> Add New Role
                            </button>
                          </div>
                        </div>
                      )}

                      {showNewForm && (
                        <motion.div 
                          initial={existingCredsList.length > 0 ? { opacity: 0, height: 0 } : false} 
                          animate={{ opacity: 1, height: 'auto' }}
                          className="space-y-4 overflow-hidden"
                        >
                          {/* Security Notice */}
                          <div className="flex items-start gap-2.5 bg-blue-500/5 border border-blue-500/15 rounded-lg px-3.5 py-3">
                        <Shield className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs text-blue-300 font-medium">End-to-end encrypted</p>
                          <p className="text-[11px] text-blue-400/60 mt-0.5 leading-relaxed">
                            Your credentials are encrypted with AES-256-CBC before being stored. They are never logged or exposed.
                          </p>
                        </div>
                      </div>

                      {/* Label */}
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                          Label <span className="text-zinc-600">(optional)</span>
                        </label>
                        <input
                          type="text"
                          placeholder="e.g., Production AWS"
                          value={form.label}
                          onChange={(e) => setForm({ ...form, label: e.target.value })}
                          className="w-full bg-zinc-900 border border-white/10 text-white text-sm rounded-lg px-3.5 py-2.5 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all"
                        />
                      </div>

                      {/* Access Key ID */}
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                          Access Key ID <span className="text-red-400">*</span>
                        </label>
                        <div className="relative">
                          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                          <input
                            type="text"
                            placeholder="AKIAIOSFODNN7EXAMPLE"
                            value={form.accessKeyId}
                            onChange={(e) => setForm({ ...form, accessKeyId: e.target.value })}
                            className="w-full bg-zinc-900 border border-white/10 text-white text-sm rounded-lg pl-10 pr-3.5 py-2.5 placeholder:text-zinc-600 font-mono focus:outline-none focus:ring-1 focus:ring-white/20 transition-all"
                          />
                        </div>
                      </div>

                      {/* Secret Access Key */}
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                          Secret Access Key <span className="text-red-400">*</span>
                        </label>
                        <div className="relative">
                          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                          <input
                            type={showSecret ? "text" : "password"}
                            placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                            value={form.secretAccessKey}
                            onChange={(e) => setForm({ ...form, secretAccessKey: e.target.value })}
                            className="w-full bg-zinc-900 border border-white/10 text-white text-sm rounded-lg pl-10 pr-10 py-2.5 placeholder:text-zinc-600 font-mono focus:outline-none focus:ring-1 focus:ring-white/20 transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setShowSecret(!showSecret)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-white/5 rounded transition-colors"
                          >
                            {showSecret
                              ? <EyeOff className="w-4 h-4 text-zinc-500" />
                              : <Eye className="w-4 h-4 text-zinc-500" />}
                          </button>
                        </div>
                      </div>

                      {/* Region */}
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                          Default Region
                        </label>
                        <div className="relative">
                          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                          <select
                            value={form.region}
                            onChange={(e) => setForm({ ...form, region: e.target.value })}
                            className="w-full bg-zinc-900 border border-white/10 text-white text-sm rounded-lg pl-10 pr-3.5 py-2.5 appearance-none focus:outline-none focus:ring-1 focus:ring-white/20 transition-all cursor-pointer"
                          >
                            {AWS_REGIONS.map((r) => (
                              <option key={r} value={r} className="bg-zinc-900">
                                {r}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* IAM Policy Accordion */}
                      <div className="border border-white/8 rounded-lg overflow-hidden">
                        <button
                          onClick={() => setShowPolicy(!showPolicy)}
                          className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-white/[0.02] transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <Info className="w-3.5 h-3.5 text-zinc-500" />
                            <span className="text-xs text-zinc-400">Required IAM Policy</span>
                          </div>
                          <motion.span
                            animate={{ rotate: showPolicy ? 180 : 0 }}
                            transition={{ duration: 0.2 }}
                            className="text-zinc-500 text-xs"
                          >
                            ▾
                          </motion.span>
                        </button>

                        <AnimatePresence>
                          {showPolicy && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25 }}
                              className="overflow-hidden"
                            >
                              <div className="px-3.5 pb-3 border-t border-white/5">
                                <div className="relative mt-3">
                                  <pre className="bg-zinc-900/80 border border-white/5 rounded-lg p-3 text-[11px] text-zinc-400 font-mono overflow-x-auto leading-relaxed max-h-40 overflow-y-auto">
                                    {REQUIRED_POLICY}
                                  </pre>
                                  <button
                                    onClick={handleCopyPolicy}
                                    className="absolute top-2 right-2 p-1.5 rounded-md bg-zinc-800 border border-white/10 hover:bg-zinc-700 transition-colors"
                                  >
                                    {copied
                                      ? <Check className="w-3 h-3 text-green-400" />
                                      : <Copy className="w-3 h-3 text-zinc-400" />}
                                  </button>
                                </div>
                                <a
                                  href="https://docs.aws.amazon.com/IAM/latest/UserGuide/id_users_create.html"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] text-blue-400/70 hover:text-blue-400 mt-2 transition-colors"
                                >
                                  How to create an IAM user
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                   )}
                  </motion.div>
                )}

                  {/* ─── Step: Discovering ─── */}
                  {step === "discovering" && (
                    <motion.div
                      key="discovering"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      className="flex flex-col items-center justify-center py-12 gap-4"
                    >
                      <div className="relative">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border border-blue-500/20 flex items-center justify-center">
                          <Eye className="w-7 h-7 text-blue-400" />
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
                        <p className="text-sm font-medium text-white">Analyzing AWS Resources…</p>
                        <p className="text-xs text-zinc-500 mt-1">Finding EC2, ECS, EKS and Lambda instances to monitor</p>
                      </div>
                    </motion.div>
                  )}

                  {/* ─── Step: Mapping ─── */}
                  {step === "mapping" && (
                    <motion.div
                      key="mapping"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="flex flex-col h-[500px]"
                    >
                      <div className="px-6 py-4 border-b border-white/5 space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-white">Manual Mapping Confirmation</p>
                          <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/20 font-medium">
                            {suggestedMappings.length} Resources Discovered
                          </span>
                        </div>

                        {/* Search */}
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                          <input
                            type="text"
                            placeholder="Search resources by name or ID..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full bg-zinc-900/50 border border-white/10 text-white text-sm rounded-lg pl-10 pr-4 py-2 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all"
                          />
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 custom-scrollbar">
                        {(() => {
                          // Filter out resources already connected
                          const available = suggestedMappings.filter(m => !existingMappingIds.has(m.resource.id));

                          const filtered = available.filter(m => 
                            m.resource.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            m.resource.id.toLowerCase().includes(searchQuery.toLowerCase())
                          );

                          if (filtered.length === 0) {
                            return (
                              <div className="flex flex-col items-center justify-center py-12 text-zinc-500 gap-3 border border-dashed border-white/5 rounded-2xl">
                                <Search className="w-8 h-8 opacity-20" />
                                <p className="text-sm">No resources match your search.</p>
                              </div>
                            );
                          }

                          // Group by type
                          const groups = filtered.reduce((acc, m) => {
                            acc[m.resource.type] = acc[m.resource.type] || [];
                            acc[m.resource.type].push(m);
                            return acc;
                          }, {} as Record<string, SuggestedMapping[]>);

                          const TYPE_ICONS: Record<string, any> = {
                            ec2: Cpu,
                            ecs: Container,
                            eks: Box,
                            lambda: Cloud,
                            log_group: MonitorCog,
                          };

                          const TYPE_LABELS: Record<string, string> = {
                            ec2: "EC2 Instances",
                            ecs: "ECS Services",
                            eks: "EKS Clusters",
                            lambda: "Lambda Functions",
                            log_group: "CloudWatch Log Groups",
                          };

                          return Object.entries(groups).map(([type, items]) => {
                            const Icon = TYPE_ICONS[type] || Server;
                            return (
                              <div key={type} className="space-y-3">
                                <div className="flex items-center gap-2 px-1">
                                  <Icon className="w-3.5 h-3.5 text-zinc-500" />
                                  <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">{TYPE_LABELS[type] || type}</h3>
                                  <span className="text-[10px] text-zinc-600 font-mono">({items.length})</span>
                                </div>
                                <div className="space-y-2">
                                  {items.map((m) => (
                                    <div key={m.resource.id} className="group p-4 bg-zinc-900/40 border border-white/5 rounded-xl hover:border-white/10 transition-all">
                                      <div className="flex items-start justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                          <div className="w-10 h-10 rounded-lg bg-zinc-800/50 flex items-center justify-center border border-white/5 group-hover:border-white/10 transition-colors">
                                            <Icon className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
                                          </div>
                                          <div>
                                            <div className="flex items-center gap-2">
                                              <p className="text-sm font-semibold text-white">{m.resource.name}</p>
                                              {m.confidence > 0.9 && !selectedMappings[m.resource.id] && (
                                                <div className="text-[9px] text-green-400 font-bold bg-green-500/10 px-1.5 py-0.5 rounded uppercase tracking-tight">
                                                  Best Match
                                                </div>
                                              )}
                                              {m.resource.logGroups.length === 0 && (
                                                <div className="text-[9px] text-amber-500 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded uppercase tracking-tight border border-amber-500/20">
                                                  No Log Group
                                                </div>
                                              )}
                                            </div>
                                            <p className="text-[11px] text-zinc-500 font-mono mt-0.5 truncate max-w-[200px]">{m.resource.id}</p>
                                            {m.resource.logGroups.length === 0 && (
                                              <div className="flex items-center gap-1.5 mt-1 text-[10px] text-amber-500/80 italic">
                                                <AlertTriangle className="w-3 h-3" />
                                                CloudWatch logs not found for this resource.
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                        <div className="text-right">
                                          <p className="text-[10px] text-zinc-600 font-medium uppercase">{m.resource.region}</p>
                                          <p className="text-[10px] text-zinc-700 mt-0.5">Auto-detected</p>
                                        </div>
                                      </div>

                                      <div className="relative">
                                        <select
                                          value={selectedMappings[m.resource.id] || m.bestMatch || ""}
                                          onChange={(e) => setSelectedMappings({ ...selectedMappings, [m.resource.id]: e.target.value })}
                                          className="w-full bg-zinc-950 border border-white/10 text-xs text-zinc-300 rounded-lg px-3.5 py-2.5 appearance-none focus:outline-none focus:ring-1 focus:ring-white/20 transition-all cursor-pointer group-hover:border-white/20"
                                        >
                                          <option value="">Do not monitor</option>
                                          <optgroup label="GitHub Repositories">
                                            {githubRepos.map(repo => (
                                              <option key={repo} value={repo}>{repo}</option>
                                            ))}
                                          </optgroup>
                                        </select>
                                        <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-600">
                                          <ChevronDown className="w-3.5 h-3.5" />
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </motion.div>
                  )}

                  {/* ─── Step: Validating ─── */}
                  {step === "validating" && (
                    <motion.div
                      key="validating"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      className="flex flex-col items-center justify-center py-12 gap-4"
                    >
                      <div className="relative">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/10 to-amber-500/5 border border-orange-500/20 flex items-center justify-center">
                          <Cloud className="w-7 h-7 text-orange-400" />
                        </div>
                        <motion.div
                          className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-zinc-950 border border-white/10 flex items-center justify-center"
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                        >
                          <Loader2 className="w-3.5 h-3.5 text-orange-400" />
                        </motion.div>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-medium text-white">Please wait…</p>
                        <p className="text-xs text-zinc-500 mt-1">We're processing your request and setting up connections</p>
                      </div>
                    </motion.div>
                  )}

                  {/* ─── Step: Success ─── */}
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
                        <p className="text-sm font-medium text-white">AWS Connected Successfully</p>
                        <p className="text-xs text-zinc-500 mt-1 max-w-xs leading-relaxed">
                          Your resources are mapped and Recovera is now monitoring your production instances.
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {/* ─── Step: Error ─── */}
                  {step === "error" && (
                    <motion.div
                      key="error"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col items-center justify-center py-12 gap-4"
                    >
                      <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                        <AlertTriangle className="w-7 h-7 text-red-400" />
                      </div>
                      <div className="text-center space-y-3">
                        <div>
                          <p className="text-sm font-medium text-white">Connection Failed</p>
                          <p className="text-xs text-red-400/70 mt-1 max-w-xs leading-relaxed mx-auto">
                            {errorMessage}
                          </p>
                        </div>
                        
                        {suggestion && (
                          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 text-left max-w-xs mx-auto">
                            <div className="flex items-start gap-2.5">
                              <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">Suggested Fix</p>
                                <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                                  {suggestion}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}

                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-white/8 flex items-center justify-between">
                {step === "credentials" && (
                  <>
                    <p className="text-[11px] text-zinc-600 flex items-center gap-1">
                      {showNewForm && (
                        <>
                          <Shield className="w-3 h-3" />
                          AES-256-CBC encrypted storage
                        </>
                      )}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleClose}
                        className="px-4 py-2 text-xs text-zinc-400 hover:text-white border border-white/10 rounded-lg hover:bg-white/5 transition-all"
                      >
                        Cancel
                      </button>
                      {showNewForm && (
                        <button
                          onClick={handleSubmit}
                          disabled={!isFormValid}
                          className={`px-5 py-2 text-xs font-medium rounded-lg transition-all active:scale-95 ${isFormValid
                            ? "bg-white text-black hover:bg-zinc-100 shadow-sm"
                            : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                            }`}
                        >
                          Connect AWS
                        </button>
                      )}
                    </div>
                  </>
                )}

                {(step === "validating" || step === "discovering") && (
                  <p className="text-[11px] text-zinc-600 mx-auto">
                    This usually takes a few seconds…
                  </p>
                )}

                {step === "mapping" && (
                  <>
                    <p className="text-[11px] text-zinc-600">
                      Verify mappings before continuing
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setStep("credentials")}
                        className="px-4 py-2 text-xs text-zinc-400 hover:text-white border border-white/10 rounded-lg hover:bg-white/5 transition-all"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleSaveMappings}
                        className="px-5 py-2 bg-white text-black text-xs font-medium rounded-lg hover:bg-zinc-100 transition-all active:scale-95 shadow-sm"
                      >
                        Confirm Mappings
                      </button>
                    </div>
                  </>
                )}

                {step === "success" && (
                  <button
                    onClick={handleClose}
                    className="mx-auto px-6 py-2 bg-white text-black text-xs font-medium rounded-lg hover:bg-zinc-100 transition-all active:scale-95 shadow-sm"
                  >
                    Done
                  </button>
                )}

                {step === "error" && (
                  <div className="flex items-center gap-2 mx-auto">
                    <button
                      onClick={handleClose}
                      className="px-4 py-2 text-xs text-zinc-400 hover:text-white border border-white/10 rounded-lg hover:bg-white/5 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => setStep("credentials")}
                      className="px-5 py-2 bg-white text-black text-xs font-medium rounded-lg hover:bg-zinc-100 transition-all active:scale-95 shadow-sm"
                    >
                      Try Again
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
