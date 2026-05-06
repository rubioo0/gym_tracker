const fs = require('fs');
const backupPath = 'C:\\Users\\andriy\\Downloads\\Telegram Desktop\\training-os-backup-2026-05-06T09-13-39-996Z.json';

try {
  const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const state = data.state;
  
  // Look at the latest run and its progression
  const run = state.focusRuns.find(r => r.templateName.includes('biceps'));
  if (run) {
    console.log(`Run: ${run.id}, templateName: ${run.templateName}`);
    console.log(`baselineAnchors:`, JSON.stringify(run.baselineAnchors, null, 2));
    const logs = state.workoutLogs.filter(l => l.runId === run.id);
    logs.sort((a,b) => new Date(a.completedAt) - new Date(b.completedAt));
    console.log(`Logs count: ${logs.length}`);
    logs.forEach((l, idx) => {
      console.log(`\nLog ${idx} (${l.completedAt}):`);
      l.exerciseLogs.forEach(el => {
        console.log(`  Exercise: ${el.exerciseName}`);
        console.log(`  Planned: ${el.plannedWeight}`);
        console.log(`  Actual: ${el.actualWeight}`);
      });
    });
    
    // Also log the exercise templates to see the rules
    const template = state.programTemplates.find(t => t.id === run.templateId);
    if (template) {
       console.log(`\nTemplate Exercises:`);
       template.sessions.forEach(s => {
         s.exercises.forEach(e => {
           console.log(`  Exercise: ${e.name}, rule: ${JSON.stringify(e.progressionRule)}`);
         });
       });
    }
  }

  const run2 = state.focusRuns.find(r => !r.templateName.includes('biceps'));
  if (run2) {
    console.log(`\n======================================\n`);
    console.log(`Run: ${run2.id}, templateName: ${run2.templateName}`);
    console.log(`baselineAnchors:`, JSON.stringify(run2.baselineAnchors, null, 2));
    const logs2 = state.workoutLogs.filter(l => l.runId === run2.id);
    logs2.sort((a,b) => new Date(a.completedAt) - new Date(b.completedAt));
    console.log(`Logs count: ${logs2.length}`);
    logs2.forEach((l, idx) => {
      console.log(`\nLog ${idx} (${l.completedAt}):`);
      l.exerciseLogs.forEach(el => {
        console.log(`  Exercise: ${el.exerciseName}`);
        console.log(`  Planned: ${el.plannedWeight}`);
        console.log(`  Actual: ${el.actualWeight}`);
      });
    });
    
    // Also log the exercise templates to see the rules
    const template2 = state.programTemplates.find(t => t.id === run2.templateId);
    if (template2) {
       console.log(`\nTemplate Exercises:`);
       template2.sessions.forEach(s => {
         s.exercises.forEach(e => {
           console.log(`  Exercise: ${e.name}, rule: ${JSON.stringify(e.progressionRule)}`);
         });
       });
    }
  }
} catch (e) {
  console.error(e);
}
