"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Shield, Eye, EyeOff, Cloud, KeyRound, MapPin,
  AlertTriangle, Loader2, Check, Copy, ExternalLink, Info
} from "lucide-react";

interface IAMCredentialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (credentialId: string) => void;
}

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
  "ap-south-1", "ap-northeast-1", "ap-northeast-2", "ap-southeast-1", "ap-southeast-2",
  "ca-central-1", "eu-central-1", "eu-west-1", "eu-west-2", "eu-west-3", "eu-north-1",
  "sa-east-1"
];

export default function IAMCredentialModal({ isOpen, onClose, onSuccess }: IAMCredentialModalProps) {
  const [loading, setLoading] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    label: "Primary AWS",
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
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/integration/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "aws",
          label: form.label,
          accessKeyId: form.accessKeyId,
          secretAccessKey: form.secretAccessKey,
          region: form.region,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to validate credentials.");
        return;
      }

      onSuccess(data.credentialId);
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="iam-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
          />

          <motion.div
            key="iam-content"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="w-full max-w-lg bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto"
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
                    <p className="text-xs text-zinc-500">Provide IAM credentials to continue import</p>
                  </div>
                </div>
                <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                  <X className="w-4 h-4 text-zinc-500" />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-4">
                {/* Security Notice */}
                <div className="flex items-start gap-2.5 bg-blue-500/5 border border-blue-500/15 rounded-lg px-3.5 py-3">
                  <Shield className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-blue-300 font-medium">End-to-end encrypted</p>
                    <p className="text-[11px] text-blue-400/60 mt-0.5 leading-relaxed">
                      Your credentials are encrypted with AES-256-CBC. They are never logged or exposed.
                    </p>
                  </div>
                </div>

                {/* Form Fields */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">Access Key ID</label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <input
                        type="text"
                        placeholder="AKIA..."
                        value={form.accessKeyId}
                        onChange={(e) => setForm({ ...form, accessKeyId: e.target.value })}
                        className="w-full bg-zinc-900 border border-white/10 text-white text-sm rounded-lg pl-10 pr-3.5 py-2.5 placeholder:text-zinc-600 font-mono focus:outline-none focus:ring-1 focus:ring-white/20 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">Secret Access Key</label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <input
                        type={showSecret ? "text" : "password"}
                        placeholder="Secret Key"
                        value={form.secretAccessKey}
                        onChange={(e) => setForm({ ...form, secretAccessKey: e.target.value })}
                        className="w-full bg-zinc-900 border border-white/10 text-white text-sm rounded-lg pl-10 pr-10 py-2.5 placeholder:text-zinc-600 font-mono focus:outline-none focus:ring-1 focus:ring-white/20 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecret(!showSecret)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-white/5 rounded transition-colors"
                      >
                        {showSecret ? <EyeOff className="w-4 h-4 text-zinc-500" /> : <Eye className="w-4 h-4 text-zinc-500" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">Region</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <select
                        value={form.region}
                        onChange={(e) => setForm({ ...form, region: e.target.value })}
                        className="w-full bg-zinc-900 border border-white/10 text-white text-sm rounded-lg pl-10 pr-3.5 py-2.5 appearance-none focus:outline-none focus:ring-1 focus:ring-white/20 transition-all cursor-pointer"
                      >
                        {AWS_REGIONS.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
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
                    <span className={`text-zinc-500 text-xs transition-transform ${showPolicy ? "rotate-180" : ""}`}>▾</span>
                  </button>

                  <AnimatePresence>
                    {showPolicy && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-3.5 pb-3 border-t border-white/5">
                          <div className="relative mt-3">
                            <pre className="bg-zinc-900/80 border border-white/5 rounded-lg p-3 text-[10px] text-zinc-400 font-mono overflow-x-auto leading-relaxed max-h-32 overflow-y-auto">
                              {REQUIRED_POLICY}
                            </pre>
                            <button
                              onClick={handleCopyPolicy}
                              className="absolute top-2 right-2 p-1.5 rounded-md bg-zinc-800 border border-white/10 hover:bg-zinc-700 transition-colors"
                            >
                              {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-zinc-400" />}
                            </button>
                          </div>
                          <a
                            href="https://docs.aws.amazon.com/IAM/latest/UserGuide/id_users_create.html"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] text-blue-400/70 hover:text-blue-400 mt-2 transition-colors"
                          >
                            How to create an IAM user <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {error && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <p className="text-xs text-red-400">{error}</p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-white/8 flex items-center justify-end gap-3 bg-zinc-900/30">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-xs text-zinc-400 hover:text-white border border-white/10 rounded-lg hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!isFormValid || loading}
                  className={`px-5 py-2 text-xs font-medium rounded-lg transition-all active:scale-95 flex items-center gap-2 ${
                    isFormValid && !loading
                      ? "bg-white text-black hover:bg-zinc-100 shadow-sm"
                      : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  }`}
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Cloud className="w-3.5 h-3.5" />}
                  Connect AWS
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
