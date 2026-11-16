// Kept byte-for-byte with the app's pure recurrence helpers; parity-tested.
const validRecurrence = value => /^(?:daily|weekdays|weekly:[1-7]|biweekly|monthly(?::(?:[1-9]|[12]\d|3[01]))?)$/.test(value);
function nextOccurrence(due, recurrence, now = Date.now()) {
  if (!validRecurrence(recurrence) || !Number.isFinite(Date.parse(due))) throw Error('This recurring task needs a valid due date.');
  let wall = new Date(Date.parse(due) + 3600000), target = now + 3600000;
  if (recurrence.startsWith('monthly')) {
    const day = Number(recurrence.split(':')[1]) || wall.getUTCDate(), hour = wall.getUTCHours(), minute = wall.getUTCMinutes(), second = wall.getUTCSeconds(), ms = wall.getUTCMilliseconds();
    let month = wall.getUTCMonth(), year = wall.getUTCFullYear();
    do { month++; wall = new Date(Date.UTC(year,month,Math.min(day,new Date(Date.UTC(year,month+1,0)).getUTCDate()),hour,minute,second,ms)); } while (wall.getTime() <= target);
    return new Date(wall.getTime()-3600000).toISOString();
  }
  if (recurrence === 'biweekly') {
    const stride = 14*86400000, start = wall.getTime();
    return new Date(start + Math.max(1,Math.floor((target-start)/stride)+1)*stride-3600000).toISOString();
  }
  do { wall.setUTCDate(wall.getUTCDate() + 1); }
  while (wall.getTime() <= target || (recurrence === 'weekdays' && [0,6].includes(wall.getUTCDay())) || (recurrence.startsWith('weekly:') && (wall.getUTCDay() || 7) !== Number(recurrence.slice(7))));
  return new Date(wall.getTime() - 3600000).toISOString();
}

exports.nextOccurrence = nextOccurrence;
exports.snoozeMinutes = body => {
  const m = body.trim().match(/^snooze\s+(\d+)([mh])?$/i);
  if (!m) return null;
  const n = Number(m[1]) * (m[2]?.toLowerCase() === 'h' ? 60 : 1);
  return Number.isSafeInteger(n) && n > 0 && Number.isFinite(new Date(Date.now()+n*60000).getTime()) ? n : null;
};
exports.completion = (task, now = Date.now()) => task.recurrence
  ? {status:'open',completed_at:null,due_at:nextOccurrence(task.due_at,task.recurrence,now)}
  : {status:'done',completed_at:new Date(now).toISOString()};
