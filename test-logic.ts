import fs from 'fs';
import { appReducer } from './src/domain/reducer';
import { buildPlannedSession } from './src/domain/logic';

async function main() {
  const backupPath = 'C:\\Users\\andriy\\Downloads\\Telegram Desktop\\training-os-backup-2026-05-06T09-13-39-996Z.json';
  const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const state = data.state;

  // Let's manually run "importLogs" on the existing state to see if it fixes baselineAnchors
  let nextState = appReducer(state, { type: 'importLogs', logs: state.workoutLogs });
  
  const run = nextState.focusRuns.find((r: any) => r.templateName.includes('ноги'));
  console.log("Baseline anchors after importLogs:", run.baselineAnchors);

  // Now let's see what buildPlannedSession returns for this run
  const template = nextState.programTemplates.find((t: any) => t.id === run.templateId);
  const plannedSession = buildPlannedSession(run, template, nextState.workoutLogs);
  
  console.log("\nNext Planned Session Exercises:");
  plannedSession.exercises.forEach((e: any) => {
    console.log(`  Exercise: ${e.name}`);
    console.log(`  Planned Weight: ${e.plannedWeight}`);
  });
}

main().catch(console.error);
