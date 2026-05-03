import { processLocalQueue } from '../client/lib/detection/detector';

async function main() {
  console.log('[Log Processor] Starting worker...');
  
  // Run loop
  while (true) {
    try {
      await processLocalQueue();
    } catch (error) {
      console.error('[Log Processor] Error processing queue:', error);
    }
    
    // Wait before next check
    await new Promise(res => setTimeout(res, 5000));
  }
}

main().catch(err => {
  console.error('[Log Processor] Fatal error:', err);
  process.exit(1);
});
