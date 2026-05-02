"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft, Activity, AlertCircle, CheckCircle2,
  Clock, Server, Shield, Terminal, GitBranch,
  Settings, ExternalLink, BarChart3, Search,
  MoreHorizontal, Play, CheckCircle, Cloud, Zap, Loader2
} from "lucide-react";
import InstanceSelectModal from "./InstanceSelectModal";

export default function RepoDashboard({ repoName }: { repoName: string }) {
  const [activeTab, setActiveTab] = useState("Issues");
  const [showInstanceModal, setShowInstanceModal] = useState(false);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [repoData, setRepoData] = useState<any>(null);
  const [loadingIncidents, setLoadingIncidents] = useState(true);
  const [generatingFix, setGeneratingFix] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch(`/api/incidents?repoFullName=${encodeURIComponent(repoName)}`)
      .then(res => res.json())
      .then(data => {
        if (data.incidents) setIncidents(data.incidents);
        if (data.repository) setRepoData(data.repository);
        setLoadingIncidents(false);
      })
      .catch(err => {
        console.error("Failed to fetch incidents:", err);
        setLoadingIncidents(false);
      });
  }, [repoName]);

  const handleGenerateFix = async (incidentId: string) => {
    setGeneratingFix(prev => ({ ...prev, [incidentId]: true }));
    try {
      const res = await fetch(`/api/incidents/${incidentId}/fix`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      // Update local state
      setIncidents(prev => prev.map(inc =>
        inc.id === incidentId
          ? { ...inc, patches: [data.patch, ...(inc.patches || [])] }
          : inc
      ));
    } catch (err) {
      alert("Failed to generate fix: " + (err as Error).message);
    } finally {
      setGeneratingFix(prev => ({ ...prev, [incidentId]: false }));
    }
  };

  const handleOpenPR = async (incidentId: string, patchId: string) => {
    setGeneratingFix(prev => ({ ...prev, [incidentId]: true }));
    try {
      const res = await fetch(`/api/incidents/${incidentId}/actions/open-pr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patchId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      // Update local state
      setIncidents(prev => prev.map(inc =>
        inc.id === incidentId
          ? { ...inc, actions: [data.action, ...(inc.actions || [])] }
          : inc
      ));
    } catch (err) {
      alert("Failed to open PR: " + (err as Error).message);
    } finally {
      setGeneratingFix(prev => ({ ...prev, [incidentId]: false }));
    }
  };

  const handleApprove = async (incidentId: string, actionId: string) => {
    setGeneratingFix(prev => ({ ...prev, [incidentId]: true }));
    try {
      const res = await fetch(`/api/incidents/${incidentId}/safety/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      // Refresh incidents to get new state
      const freshRes = await fetch(`/api/incidents?repoFullName=${encodeURIComponent(repoName)}`);
      const freshData = await freshRes.json();
      if (freshData.incidents) setIncidents(freshData.incidents);
    } catch (err) {
      alert("Failed to approve action: " + (err as Error).message);
    } finally {
      setGeneratingFix(prev => ({ ...prev, [incidentId]: false }));
    }
  };

  // Fetch credentialId from user's stored integration
  const [credentialId, setCredentialId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/user/credentials")
      .then(r => r.json())
      .then(data => {
        if (data.credentials?.[0]) {
          setCredentialId(data.credentials[0].id);
        }
      })
      .catch(err => console.error("Failed to fetch credential:", err));
  }, []);
  // Compute real-time metrics
  const totalIssues = incidents.length;
  const openIssues = incidents.filter(i => i.status !== "resolved" && i.status !== "ignored").length;
  const healthScore = Math.max(0, 100 - openIssues * 5);
  
  const metrics = {
    uptime: "99.98%", // Remains static as we don't track real uptime
    totalIssues,
    openIssues,
    avgResolution: "45m",
    healthScore
  };

  const tabs = ["Overview", "Issues", "Deployments", "Settings"];

  // Compute activity heatmap for last 14 days
  const activityData = Array.from({ length: 14 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    const count = incidents.filter(inc => {
      const incDate = new Date(inc.createdAt);
      return incDate.getDate() === d.getDate() && incDate.getMonth() === d.getMonth() && incDate.getFullYear() === d.getFullYear();
    }).length;
    return { day: `${14 - i}d`, issues: count };
  });

  const maxIssues = Math.max(1, ...activityData.map(d => d.issues));

  // Compute timeline events from real incidents
  const timelineEvents = incidents.slice(0, 10).map((inc, idx) => ({
    id: inc.id,
    type: inc.status === "resolved" ? "success" : "issue",
    title: inc.title,
    description: `Severity: ${inc.severity.toUpperCase()}. ${inc.status === "resolved" ? "Incident resolved." : "Currently investigating."}`,
    time: new Date(inc.createdAt).toLocaleString(),
    status: inc.status === "resolved" ? "Resolved" : "Investigating",
    duration: inc.status === "resolved" ? "Resolved" : "Ongoing",
    assignee: "AutoSRE"
  }));

  return (
    <div className="min-h-screen bg-black text-white pt-20 pb-12 px-8 max-w-6xl mx-auto">
      {/* Top Navigation & Header Area */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-zinc-400 hover:text-white bg-transparent hover:bg-white/5 rounded-lg transition-all mb-6 -ml-3"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>

        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-zinc-700 to-zinc-900 border border-white/10 flex items-center justify-center text-xl font-bold shadow-lg">
              {repoName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-white tracking-tight">
                  {repoName}
                </h1>
                <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-white/10 text-white border border-white/20">
                  {repoData?.isPrivate ? "Private" : "Public"}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <GitBranch className="w-4 h-4" />
                  {repoData?.defaultBranch || "main"}
                </span>
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
                  System Healthy
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowInstanceModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 text-blue-300 text-sm font-medium rounded-lg border border-blue-500/20 hover:border-blue-500/40 hover:from-blue-500/15 hover:to-cyan-500/15 transition-all active:scale-95"
            >
              <Cloud className="w-3.5 h-3.5" />
              Connect Instance
            </button>
            <button className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm font-medium transition-all flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Settings
            </button>
            <button className="px-4 py-2 bg-white text-black hover:bg-zinc-200 rounded-lg text-sm font-medium transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(255,255,255,0.1)]">
              <ExternalLink className="w-4 h-4" />
              View Repository
            </button>
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="border-b border-white/10 mb-8">
        <div className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium transition-all relative ${activeTab === tab ? "text-white" : "text-zinc-500 hover:text-zinc-300"
                }`}
            >
              {tab}
              {activeTab === tab && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-t-full"
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "Overview" && (
        <div className="space-y-6">
          {/* Stat Cards Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Uptime (30d)", value: metrics.uptime, icon: Activity, color: "text-emerald-400" },
              { label: "Total Issues", value: metrics.totalIssues, icon: AlertCircle, color: "text-white" },
              { label: "Open Alerts", value: metrics.openIssues, icon: Server, color: "text-amber-400" },
              { label: "Health Score", value: metrics.healthScore + "/100", icon: Shield, color: "text-blue-400" },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-zinc-900/40 border border-white/5 rounded-xl p-5 hover:border-white/15 transition-colors"
              >
                <div className="flex items-center gap-2 text-zinc-400 mb-2 text-sm font-medium">
                  <stat.icon className="w-4 h-4" />
                  {stat.label}
                </div>
                <div className={`text-2xl font-bold tracking-tight ${stat.color}`}>
                  {stat.value}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Middle Row: Issues Over Time & Environment */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Issues Graph */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="lg:col-span-2 bg-zinc-900/40 border border-white/5 rounded-xl p-6"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-zinc-400" />
                  Issues Over Time
                </h3>
                <span className="text-xs text-zinc-500">Last 14 days</span>
              </div>
              <div className="flex items-end gap-2 h-32 pt-4 border-b border-white/10 pb-2">
                {activityData.map((data, idx) => {
                  const heightPercentage = data.issues === 0 ? 5 : (data.issues / maxIssues) * 100;
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-2 group relative">
                      <div className="w-full bg-white/5 rounded-t-sm group-hover:bg-white/10 transition-all relative flex items-end justify-center" style={{ height: '100%' }}>
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: `${heightPercentage}%` }}
                          transition={{ duration: 0.5, delay: 0.3 + (idx * 0.02) }}
                          className={`w-full rounded-t-sm ${data.issues > 0 ? 'bg-amber-500/80 group-hover:bg-amber-400' : 'bg-white/10'}`}
                        />
                      </div>
                      {/* Tooltip */}
                      <div className="absolute -top-8 bg-zinc-800 text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-10 border border-white/10 shadow-xl">
                        {data.issues} issues
                      </div>
                      <span className="text-[10px] text-zinc-600 font-mono">{data.day}</span>
                    </div>
                  );
                })}
              </div>
            </motion.div>

            {/* Environment Details */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="lg:col-span-1 bg-zinc-900/40 border border-white/5 rounded-xl p-6 flex flex-col"
            >
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-6">
                <Terminal className="w-4 h-4 text-zinc-400" />
                Environment Details
              </h3>
              <div className="space-y-4 flex-1">
                <div className="p-3 bg-white/5 rounded-lg border border-white/5 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-500 mb-0.5">Deployment</p>
                    <p className="text-sm font-medium text-white flex items-center gap-2">
                      Production <CheckCircle className="w-3 h-3 text-emerald-400" />
                    </p>
                  </div>
                  <Play className="w-4 h-4 text-zinc-400 hover:text-white cursor-pointer transition-colors" />
                </div>
                <div className="p-3 bg-white/5 rounded-lg border border-white/5 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-500 mb-0.5">AutoSRE AI Engine</p>
                    <p className="text-sm font-medium text-amber-400 flex items-center gap-2">
                      Active Monitoring
                    </p>
                  </div>
                  <Shield className="w-4 h-4 text-amber-400" />
                </div>
                <div className="p-3 bg-white/5 rounded-lg border border-white/5 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-500 mb-0.5">Region</p>
                    <p className="text-sm font-medium text-white">
                      {repoData?.mappings?.[0]?.integration?.credentials?.region || "us-east-1"}
                    </p>
                  </div>
                  <Server className="w-4 h-4 text-zinc-400" />
                </div>
              </div>
            </motion.div>
          </div>

          {/* Project Timeline Detailed Box */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-zinc-900/40 border border-white/5 rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/5">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2 tracking-tight">
                  <Clock className="w-5 h-5 text-zinc-400" />
                  Project Incident Timeline
                </h2>
                <p className="text-sm text-zinc-500 mt-1">A detailed log of system events, deployments, and issues.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input type="text" placeholder="Search events..." className="pl-9 pr-4 py-2 bg-black border border-white/10 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/20" />
                </div>
              </div>
            </div>

            <div className="relative pl-4 space-y-8 before:absolute before:inset-0 before:ml-[1.375rem] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-[2px] before:bg-gradient-to-b before:from-white/10 before:via-white/5 before:to-transparent">
              {timelineEvents.map((event) => (
                <div key={event.id} className="relative flex items-start gap-6 group">
                  {/* Timeline Node */}
                  <div className="absolute left-[-35px] top-1">
                    <div className={`w-8 h-8 rounded-full border-4 border-black flex items-center justify-center shadow-lg
                      ${event.type === 'issue' ? 'bg-red-500/20 text-red-500 border-red-500/10' :
                        event.type === 'alert' ? 'bg-amber-500/20 text-amber-500 border-amber-500/10' :
                          'bg-emerald-500/20 text-emerald-500 border-emerald-500/10'}`}
                    >
                      {event.type === 'issue' || event.type === 'alert' ? (
                        <AlertCircle className="w-4 h-4" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                    </div>
                  </div>

                  {/* Event Content Box */}
                  <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-xl p-5 hover:bg-white/[0.04] hover:border-white/10 transition-all shadow-sm">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-3">
                      <div>
                        <h3 className="text-base font-semibold text-white mb-1">{event.title}</h3>
                        <p className="text-sm text-zinc-400">{event.description}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="text-xs text-zinc-500 font-medium whitespace-nowrap bg-black px-2 py-1 rounded-md border border-white/5">
                          {event.time}
                        </span>
                        <button className="text-zinc-500 hover:text-white p-1">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-white/5">
                      <span className={`text-[11px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-md
                        ${event.status === 'Resolved' || event.status === 'Success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}
                      >
                        {event.status}
                      </span>
                      {event.duration !== "N/A" && (
                        <span className="text-xs text-zinc-400 flex items-center gap-1.5 bg-black px-2.5 py-1 rounded-md border border-white/5">
                          <Clock className="w-3.5 h-3.5" />
                          {event.duration}
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-2 text-xs text-zinc-500">
                        Assignee:
                        <div className="flex items-center gap-1.5 bg-black px-2 py-1 rounded-md border border-white/5 text-zinc-300">
                          <div className="w-4 h-4 rounded-full bg-zinc-800 flex items-center justify-center text-[8px] font-bold">
                            {event.assignee[0]}
                          </div>
                          {event.assignee}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {activeTab === "Issues" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Active Incidents</h2>
          </div>
          {loadingIncidents ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
            </div>
          ) : incidents.length === 0 ? (
            <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-12 text-center text-zinc-500">
              No incidents found for this repository.
            </div>
          ) : (
            <div className="space-y-4">
              {incidents.map((incident) => {
                const latestPatch = incident.patches?.[0];
                const latestAction = incident.actions?.[0];
                const isWorking = generatingFix[incident.id];

                return (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={incident.id}
                    className="bg-zinc-900/40 border border-white/5 rounded-xl p-6"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-white">{incident.title}</h3>
                          <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border ${incident.status === 'resolved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                              'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            }`}>
                            {incident.status}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-400 mb-4">
                          Confidence Score: {(incident.confidence * 100).toFixed(0)}%
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        {/* AutoSRE Actions */}
                        {!latestPatch && incident.status !== 'resolved' && (
                          <button
                            onClick={() => handleGenerateFix(incident.id)}
                            disabled={isWorking}
                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-all"
                          >
                            {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                            Generate Fix
                          </button>
                        )}

                        {latestPatch && latestPatch.validationStatus === 'passed' && !latestAction && (
                          <button
                            onClick={() => handleOpenPR(incident.id, latestPatch.id)}
                            disabled={isWorking}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-all"
                          >
                            {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitBranch className="w-4 h-4" />}
                            Open PR
                          </button>
                        )}

                        {latestAction && latestAction.status === 'pending_approval' && (
                          <div className="flex flex-col items-end gap-2">
                            <span className="text-xs text-amber-400 border border-amber-500/20 bg-amber-500/10 px-2 py-1 rounded">
                              Blocked: Requires Human Approval
                            </span>
                            <button
                              onClick={() => handleApprove(incident.id, latestAction.id)}
                              disabled={isWorking}
                              className="flex items-center gap-2 px-4 py-2 bg-white text-black hover:bg-zinc-200 text-sm font-medium rounded-lg disabled:opacity-50 transition-all"
                            >
                              {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                              Approve & Continue
                            </button>
                          </div>
                        )}

                        {latestAction && latestAction.status === 'completed' && (
                          <a href={latestAction.metadata?.prUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-all">
                            <ExternalLink className="w-4 h-4" />
                            View PR
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Details if patch generated */}
                    {latestPatch && (
                      <div className="mt-4 p-4 bg-black/40 border border-white/5 rounded-lg text-sm">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-zinc-400">Patch Status:</span>
                          <span className={`${latestPatch.validationStatus === 'passed' ? 'text-emerald-400' : 'text-red-400'
                            }`}>
                            {latestPatch.validationStatus.toUpperCase()}
                          </span>
                        </div>
                        {latestPatch.validationLogs && (
                          <pre className="text-xs text-zinc-500 whitespace-pre-wrap max-h-32 overflow-y-auto mt-2">
                            {latestPatch.validationLogs}
                          </pre>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "Deployments" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Recent Deployments & PRs</h2>
          </div>
          {incidents.filter(i => i.actions && i.actions.length > 0).length === 0 ? (
            <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-12 text-center text-zinc-500">
              No automated PRs or deployments found for this repository.
            </div>
          ) : (
            <div className="space-y-4">
              {incidents.filter(i => i.actions && i.actions.length > 0).map(incident => {
                const latestAction = incident.actions[0];
                return (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={incident.id + '-deployment'}
                    className="bg-zinc-900/40 border border-white/5 rounded-xl p-6"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-white">Fix for: {incident.title}</h3>
                          <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border ${latestAction.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                            {latestAction.type === 'create_pr' ? 'Pull Request' : latestAction.type}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-400 mb-4">
                          Status: {latestAction.status.replace("_", " ")}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {latestAction.metadata?.prUrl && (
                          <a href={latestAction.metadata.prUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-all">
                            <ExternalLink className="w-4 h-4" />
                            View PR
                          </a>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {/* Instance Select Modal */}
      <InstanceSelectModal
        isOpen={showInstanceModal}
        onClose={() => setShowInstanceModal(false)}
        repoName={repoName}
        repoFullName={repoName}
        credentialId={credentialId}
      />
    </div>
  );
}
