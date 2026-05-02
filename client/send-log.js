// send-log.js
// Run this script to simulate an error in your repository!
// Usage: node send-log.js <Your-GitHub-Username/Your-Repo-Name>

const repoName = process.argv[2] || "Priyanshu-Ku/Recovera";

const logPayload = {
  requestId: `mock-req-${Date.now()}`,
  timestamp: Date.now(),
  records: [
    {
      recordId: `mock-rec-${Date.now()}`,
      data: Buffer.from(JSON.stringify({
        message: "TypeError: Cannot read properties of undefined (reading 'id') at (src/controllers/user.ts:42:15)",
        logGroup: "/aws/lambda/production-api",
        aws: {
            logGroup: "/aws/lambda/production-api"
        }
      })).toString("base64")
    }
  ]
};

async function trigger() {
  console.log(`🚀 Sending mock error log for: ${repoName}...`);
  
  const ingestRes = await fetch("http://localhost:3000/api/ingest/logs", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-recovera-integration-id": "mock-integration" },
    body: JSON.stringify(logPayload)
  });
  
  if (!ingestRes.ok) {
    console.error("❌ Ingest Failed:", await ingestRes.text());
    return;
  }
  
  console.log("✅ Log ingested. Forcing the queue to process...");
  
  // To avoid waiting for a cron job, we use the internal processLocalQueue
  // Wait, we can't call a TS function directly from a simple JS script without ts-node/tsx.
  // We'll just instruct the user to run the queue.
  console.log(`
🎉 Log sent!
If you have a worker running, the Incident will appear in your dashboard shortly.
Otherwise, you can manually force the queue by running:
npx tsx -e "import { processLocalQueue } from './lib/detection/detector'; processLocalQueue().then(() => console.log('Queue Processed!'))"
  `);
}

trigger();
